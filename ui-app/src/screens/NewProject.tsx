/**
 * UIP6.1 — the creation-mode chooser (D10): bare #/new shows two cards — the guided Wizard
 * (unchanged, now at #/new/wizard) and Agent mode (name-only → chat-led cockpit, #/new/agent) —
 * plus a "What can it do?" link into the capability wiki (D11).
 */
import { WIKI_OPEN_EVENT } from '../components/WikiModal';

export function NewProject() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 28px 64px' }} data-testid="new-chooser">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ fontSize: 31, fontWeight: 700, margin: 0 }}>New video</h1>
        <a href="#/" style={{ color: 'var(--muted)', fontSize: 14, fontWeight: 600 }}>
          ✕ cancel
        </a>
      </header>
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 26px' }}>How do you want to start?</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <a href="#/new/wizard" data-testid="choose-wizard" style={card}>
          <div style={{ fontSize: 26 }} aria-hidden>
            ▤
          </div>
          <div style={{ fontWeight: 700, fontSize: 17, marginTop: 8 }}>Wizard</div>
          <div style={{ color: 'var(--muted)', fontSize: 13.5, marginTop: 8, lineHeight: 1.5 }}>
            Four guided steps — format, style, brief, assets. Good when you already know what the
            video is and want the agent to start from a complete brief.
          </div>
        </a>

        <a href="#/new/agent" data-testid="choose-agent" style={card}>
          <div style={{ fontSize: 26 }} aria-hidden>
            ◆
          </div>
          <div style={{ fontWeight: 700, fontSize: 17, marginTop: 8 }}>Agent mode</div>
          <div style={{ color: 'var(--muted)', fontSize: 13.5, marginTop: 8, lineHeight: 1.5 }}>
            Just name the project, then describe the video in the chat. Upload media as you go;
            the agent writes the brief and the plan, and you approve at the gates.
          </div>
        </a>
      </div>

      <button
        data-testid="chooser-wiki-link"
        onClick={() => window.dispatchEvent(new CustomEvent(WIKI_OPEN_EVENT))}
        style={{
          marginTop: 22,
          background: 'transparent',
          color: 'var(--muted)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 14px',
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        📖 What can it do? — the capability wiki
      </button>
    </div>
  );
}

const card: React.CSSProperties = {
  display: 'block',
  background: 'var(--surface-1)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius)',
  padding: '22px 20px',
  color: 'var(--secondary)',
};
