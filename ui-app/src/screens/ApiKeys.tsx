/**
 * #/keys — the API-Keys page (D18). Presents the project's .env as friendly key rows:
 * what each key unlocks, where to get it, a casual cost note, a required/optional badge,
 * a masked current value, and a per-key Test button (server-side probe → ✅/❌ + human text).
 * Keys never leave the machine except to their own provider; GET only ever returns masks.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';

interface KeyRow {
  key: string;
  name: string;
  unlocks: string;
  link: string;
  costNote: string;
  required: boolean;
  set: boolean;
  masked: string | null;
}

type TestState = { busy: boolean; ok?: boolean; message?: string };

export function ApiKeys() {
  const [rows, setRows] = useState<KeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = (await api.keys()) as { keys: KeyRow[] };
      setRows(res.keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (key: string): Promise<void> => {
    const value = (drafts[key] ?? '').trim();
    if (!value) return;
    setSaving(key);
    setNote(null);
    try {
      await api.keysSave({ [key]: value });
      setDrafts((d) => ({ ...d, [key]: '' }));
      setNote(`${key} saved to this project's .env`);
      await load();
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  const clear = async (key: string): Promise<void> => {
    setSaving(key);
    setNote(null);
    try {
      await api.keysSave({ [key]: '' });
      setTests((t) => ({ ...t, [key]: { busy: false } }));
      setNote(`${key} removed from .env`);
      await load();
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  const test = async (key: string): Promise<void> => {
    setTests((t) => ({ ...t, [key]: { busy: true } }));
    try {
      const r = (await api.keyTest(key)) as { ok: boolean; message: string };
      setTests((t) => ({ ...t, [key]: { busy: false, ok: r.ok, message: r.message } }));
    } catch (e) {
      setTests((t) => ({
        ...t,
        [key]: { busy: false, ok: false, message: e instanceof Error ? e.message : String(e) },
      }));
    }
  };

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>API keys</h1>
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <button onClick={() => void load()}>Retry</button>
      </div>
    );
  }
  if (!rows) return <div style={{ padding: 24, color: 'var(--muted)' }}>Loading keys…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 860 }} data-testid="keys-screen">
      <h1 style={{ marginTop: 0, marginBottom: 4 }}>API keys</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Keys live in this project's <code>.env</code> file — on your machine only, sent only to
        their own provider. The agent and the engine read the same file.
      </p>
      {note && (
        <div data-testid="keys-note" style={{ margin: '12px 0', color: 'var(--success)' }}>
          {note}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {rows.map((row) => {
          const t = tests[row.key] ?? { busy: false };
          return (
            <div
              key={row.key}
              data-testid={`key-row-${row.key}`}
              style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-sm)',
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 16 }}>{row.name}</strong>
                <span
                  style={{
                    fontSize: 11,
                    padding: '1px 8px',
                    borderRadius: 999,
                    border: '1px solid var(--hairline)',
                    color: row.required ? 'var(--warn)' : 'var(--muted)',
                  }}
                >
                  {row.required ? 'required' : 'optional'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{row.unlocks}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                {row.costNote} ·{' '}
                <a href={row.link} target="_blank" rel="noreferrer">
                  get a key ↗
                </a>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                {row.set ? (
                  <code data-testid={`key-masked-${row.key}`} style={{ color: 'var(--success)' }}>
                    {row.masked}
                  </code>
                ) : (
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>not set</span>
                )}
                <input
                  type="password"
                  placeholder={row.set ? 'paste a new value to replace…' : 'paste your key…'}
                  value={drafts[row.key] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))}
                  data-testid={`key-input-${row.key}`}
                  style={{ flex: 1, minWidth: 220 }}
                />
                <button
                  onClick={() => void save(row.key)}
                  disabled={saving === row.key || !(drafts[row.key] ?? '').trim()}
                  data-testid={`key-save-${row.key}`}
                >
                  {saving === row.key ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => void test(row.key)}
                  disabled={!row.set || t.busy}
                  data-testid={`key-test-${row.key}`}
                >
                  {t.busy ? 'Testing…' : 'Test'}
                </button>
                {row.set && (
                  <button onClick={() => void clear(row.key)} disabled={saving === row.key} title="remove from .env">
                    Remove
                  </button>
                )}
              </div>
              {t.message && (
                <div
                  data-testid={`key-test-result-${row.key}`}
                  style={{ marginTop: 8, fontSize: 13, color: t.ok ? 'var(--success)' : 'var(--danger)' }}
                >
                  {t.ok ? '✅' : '❌'} {t.message}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
