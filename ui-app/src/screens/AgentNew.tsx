/**
 * UIP6.2 — agent-mode create: ONE field (project name, live slug preview), then straight to the
 * cockpit's clean slate. No kickoff is stashed — the user briefs the agent in the chat; uploads
 * happen in the cockpit (chat or Assets panel). Gates stay on (plan §6 design decision #1).
 */
import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { buildAgentCreateBody, validateAgentName } from '../lib/agent-create';
import { slugify } from '../lib/wizard';

export function AgentNew() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const errors = validateAgentName(name);
  const slug = slugify(name);

  async function create() {
    const remaining = validateAgentName(name);
    if (remaining.length > 0) {
      setErr(remaining[0] ?? 'invalid project name');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const body = buildAgentCreateBody(name);
      await api.createProject(body);
      location.hash = `#/project/${encodeURIComponent(body.project_id)}`;
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '32px 28px 64px' }} data-testid="agent-new">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ fontSize: 31, fontWeight: 700, margin: 0 }}>New video — agent mode</h1>
        <a href="#/new" style={{ color: 'var(--muted)', fontSize: 14, fontWeight: 600 }}>
          ◀ back
        </a>
      </header>
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 24px', lineHeight: 1.5 }}>
        Name the project — that's it. You'll brief the agent and add media in the cockpit.
      </p>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
        Project name
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy && errors.length === 0) void create();
          }}
          placeholder="launch-ad"
          data-testid="agent-new-name"
          style={{
            background: 'var(--surface-1)',
            color: 'var(--secondary)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
            fontSize: 15,
            fontFamily: 'inherit',
            fontWeight: 400,
          }}
        />
        {name && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
            → projects/{slug || '?'}/ · public/{slug || '?'}/
          </span>
        )}
      </label>

      {err && (
        <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 14 }} data-testid="agent-new-error">
          ✕ {err}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <button
          onClick={create}
          disabled={busy || errors.length > 0}
          data-testid="agent-new-create"
          title={errors[0]}
          style={{
            background: busy || errors.length > 0 ? 'var(--surface-2)' : 'var(--accent)',
            color: busy || errors.length > 0 ? 'var(--muted)' : 'var(--primary)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 18px',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {busy ? 'Creating…' : '▸ Create & open the cockpit'}
        </button>
      </div>
    </div>
  );
}
