/**
 * #/brand — the Brand page (D9). Form-edits brand/brand.json (THE config boundary: components,
 * the QA council's brand lens, sanitize brandWords and the ElevenLabs voice all read it), with
 * brief-style optimistic concurrency (sha + 409) and live reload when the agent rewrites the
 * file (the watcher broadcasts a `brand` event on /ws/manifests).
 *
 * "Let the agent set this up" stashes the server-provided interview prompt through the same
 * sessionStorage kickoff handoff the wizard uses and jumps into a project cockpit — the agent
 * interviews the user and writes brand/brand.json itself.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { subscribe } from '../lib/ws';
import { stashKickoff } from '../lib/wizard';

interface BrandJson {
  name?: string;
  colors?: Record<string, string>;
  tone?: { register?: string; sellStyle?: string; language?: string };
  voice?: { elevenlabsVoiceId?: string };
  brandWords?: string[];
  logoPath?: string;
  [key: string]: unknown; // _comment keys etc. — preserved verbatim on save
}

const COLOR_KEYS = ['primary', 'secondary', 'accent', 'success', 'danger', 'muted'] as const;
const REGISTERS = ['casual', 'professional', 'playful'] as const;
const SELL_STYLES = ['soft', 'neutral', 'direct'] as const;

export function Brand() {
  const [brand, setBrand] = useState<BrandJson | null>(null);
  const [sha, setSha] = useState<string | null>(null);
  const [agentPrompt, setAgentPrompt] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [projects, setProjects] = useState<string[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = (await api.brand()) as {
        exists: boolean;
        brand: BrandJson | null;
        sha256: string | null;
        agentPrompt: string;
      };
      setBrand(res.brand ?? {});
      setSha(res.sha256);
      setAgentPrompt(res.agentPrompt);
      setDirty(false);
      setConflict(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    void api
      .projects()
      .then((r) => setProjects((r.projects ?? []).map((p: { project_id: string }) => p.project_id)))
      .catch(() => undefined);
  }, [load]);

  // Live reload when the agent edits brand.json — unless the form has unsaved edits
  // (then show a conflict note instead of clobbering the user's typing).
  useEffect(() => {
    return subscribe<{ type: string }>('manifests', (msg) => {
      if (msg.type !== 'brand') return;
      if (dirty) setConflict(true);
      else void load();
    });
  }, [dirty, load]);

  const set = (mutate: (b: BrandJson) => void): void => {
    setBrand((prev) => {
      const next = structuredClone(prev ?? {});
      mutate(next);
      return next;
    });
    setDirty(true);
    setNote(null);
  };

  const save = async (): Promise<void> => {
    if (!brand) return;
    setSaving(true);
    setNote(null);
    try {
      const res = (await api.brandSave({ brand, ...(sha ? { expectSha: sha } : {}) })) as {
        saved: boolean;
        sha256: string;
      };
      setSha(res.sha256);
      setDirty(false);
      setConflict(false);
      setNote('Saved — previews and the agent read the new values immediately.');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        setNote('brand.json changed on disk (probably the agent) — reload to pick up the new version.');
      } else {
        setNote(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSaving(false);
    }
  };

  const askAgent = (): void => {
    const target = projects[0];
    if (!target) {
      setNote('Create a project first (the agent works inside a project chat) — then come back here.');
      return;
    }
    stashKickoff(target, agentPrompt);
    location.hash = `#/project/${encodeURIComponent(target)}`;
  };

  const brandWordsText = useMemo(() => (brand?.brandWords ?? []).join(', '), [brand]);

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>Brand</h1>
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <button onClick={() => void load()}>Retry</button>
      </div>
    );
  }
  if (!brand) return <div style={{ padding: 24, color: 'var(--muted)' }}>Loading brand…</div>;

  const colors = brand.colors ?? {};
  const tone = brand.tone ?? {};

  return (
    <div style={{ padding: 24, maxWidth: 760 }} data-testid="brand-screen">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ marginTop: 0, marginBottom: 4 }}>Brand</h1>
        <button onClick={askAgent} data-testid="brand-ask-agent" title="the agent interviews you, then writes brand/brand.json">
          ✨ Let the agent set this up
        </button>
      </div>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        One file — <code>brand/brand.json</code> — drives component colors, copy tone, the QA
        council's brand lens and your voice-over voice.
      </p>

      {conflict && (
        <div style={{ margin: '12px 0', color: 'var(--warn)' }} data-testid="brand-conflict">
          brand.json changed on disk.{' '}
          <button onClick={() => void load()}>Reload (discard my edits)</button>
        </div>
      )}
      {note && <div style={{ margin: '12px 0', color: 'var(--success)' }} data-testid="brand-note">{note}</div>}

      <section style={{ marginTop: 16 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Brand name</label>
        <input
          value={brand.name ?? ''}
          onChange={(e) => set((b) => (b.name = e.target.value))}
          placeholder="My Brand"
          data-testid="brand-name"
          style={{ width: 320 }}
        />
      </section>

      <section style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Colors</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {COLOR_KEYS.map((k) => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              {k}
              <input
                type="color"
                value={colors[k] ?? '#000000'}
                onChange={(e) => set((b) => ((b.colors ??= {})[k] = e.target.value))}
                data-testid={`brand-color-${k}`}
              />
            </label>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
          Avoid greens near #00FF00 — that zone is reserved for green-screen keying.
        </div>
      </section>

      <section style={{ marginTop: 20, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
          tone of voice
          <select
            value={tone.register ?? 'professional'}
            onChange={(e) => set((b) => ((b.tone ??= {}).register = e.target.value))}
            data-testid="brand-register"
          >
            {REGISTERS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
          sell style
          <select
            value={tone.sellStyle ?? 'neutral'}
            onChange={(e) => set((b) => ((b.tone ??= {}).sellStyle = e.target.value))}
            data-testid="brand-sellstyle"
          >
            {SELL_STYLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
          video language (ISO 639-1)
          <input
            value={tone.language ?? 'en'}
            onChange={(e) => set((b) => ((b.tone ??= {}).language = e.target.value))}
            style={{ width: 80 }}
            data-testid="brand-language"
          />
        </label>
      </section>

      <section style={{ marginTop: 20 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
          ElevenLabs voice ID{' '}
          <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted)' }}>
            (your cloned voice, or pick one at{' '}
            <a href="https://elevenlabs.io/voices" target="_blank" rel="noreferrer">
              elevenlabs.io/voices ↗
            </a>
            ; voice-over stays off until set)
          </span>
        </label>
        <input
          value={brand.voice?.elevenlabsVoiceId ?? ''}
          onChange={(e) => set((b) => ((b.voice ??= {}).elevenlabsVoiceId = e.target.value.trim()))}
          placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
          data-testid="brand-voice-id"
          style={{ width: 360, fontFamily: 'var(--font-mono)' }}
        />
      </section>

      <section style={{ marginTop: 20 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
          Brand words{' '}
          <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted)' }}>
            (comma-separated; stripped from prompts to generators that must not echo them)
          </span>
        </label>
        <input
          value={brandWordsText}
          onChange={(e) =>
            set((b) => (b.brandWords = e.target.value.split(',').map((w) => w.trim()).filter(Boolean)))
          }
          placeholder="Product Name, Slogan"
          data-testid="brand-words"
          style={{ width: '100%' }}
        />
      </section>

      <section style={{ marginTop: 20 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
          Logo path{' '}
          <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted)' }}>
            (optional, inside public/ — used by LogoSting and the brand QA lens)
          </span>
        </label>
        <input
          value={brand.logoPath ?? ''}
          onChange={(e) => set((b) => (b.logoPath = e.target.value))}
          placeholder="public/brand/logo-light.svg"
          data-testid="brand-logo-path"
          style={{ width: 360 }}
        />
      </section>

      <div style={{ marginTop: 24 }}>
        <button onClick={() => void save()} disabled={!dirty || saving} data-testid="brand-save">
          {saving ? 'Saving…' : dirty ? 'Save brand' : 'Saved'}
        </button>
      </div>
    </div>
  );
}
