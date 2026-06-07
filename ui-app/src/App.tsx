import { useState } from 'react';
import { useRoute } from './lib/route';
import { useHealthDot } from './lib/health-dot';
import { HEALTH_DOT } from './lib/status';
import { LAYOUT_LABELS, type LayoutMode } from './lib/layout';
import { useJobs, activeJobs } from './lib/jobs';
import { Home } from './screens/Home';
import { Health } from './screens/Health';
import { Project } from './screens/Project';
import { Queue } from './screens/Queue';
import { Wizard } from './screens/Wizard';
import { NewProject } from './screens/NewProject';
import { AgentNew } from './screens/AgentNew';
import { FineTuneScreen } from './screens/FineTuneScreen';
import { ApiKeys } from './screens/ApiKeys';
import { Brand } from './screens/Brand';
import { CommandPalette } from './components/CommandPalette';
import { WikiModal, WIKI_OPEN_EVENT } from './components/WikiModal';

export function App() {
  const route = useRoute();
  const [layout, setLayout] = useState<LayoutMode>('A');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar
        route={route}
        layout={layout}
        onLayout={setLayout}
        projectId={route.name === 'project' ? route.id : null}
      />
      <CommandPalette projectId={route.name === 'project' ? route.id : null} />
      <WikiModal projectId={route.name === 'project' ? route.id : null} />
      <main style={{ flex: 1, minHeight: 0, overflow: route.name === 'project' ? 'hidden' : 'auto' }}>
        {route.name === 'home' && <Home />}
        {route.name === 'health' && <Health />}
        {route.name === 'queue' && <Queue />}
        {route.name === 'new' && route.mode === undefined && <NewProject />}
        {route.name === 'new' && route.mode === 'wizard' && <Wizard />}
        {route.name === 'new' && route.mode === 'agent' && <AgentNew />}
        {route.name === 'finetune' && <FineTuneScreen project={route.id} />}
        {route.name === 'keys' && <ApiKeys />}
        {route.name === 'brand' && <Brand />}
        {route.name === 'project' && <Project id={route.id} layout={layout} />}
      </main>
    </div>
  );
}

function TopBar({
  route,
  layout,
  onLayout,
  projectId,
}: {
  route: ReturnType<typeof useRoute>;
  layout: LayoutMode;
  onLayout: (m: LayoutMode) => void;
  projectId: string | null;
}) {
  const worst = useHealthDot();
  return (
    <header
      style={{
        height: 56,
        flex: '0 0 56px',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '0 18px',
        borderBottom: '1px solid var(--hairline)',
        background: 'var(--primary)',
      }}
    >
      <a href="#/" style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 800, fontSize: 16 }}>
        <span
          aria-hidden
          style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--accent)', display: 'inline-block' }}
        />
        JBS&nbsp;Vibe&nbsp;Editing
      </a>

      {projectId && (
        <span style={{ color: 'var(--muted)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ◀ {projectId}
        </span>
      )}

      <div style={{ flex: 1 }} />

      {projectId && <LayoutToggle layout={layout} onLayout={onLayout} />}

      {/* UIP6.8 — the capability wiki, available in BOTH creation modes / everywhere */}
      <button
        data-testid="wiki-button"
        title="Capability wiki — what can the agent do?"
        aria-label="Open the capability wiki"
        onClick={() => window.dispatchEvent(new CustomEvent(WIKI_OPEN_EVENT))}
        style={{ background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 999, color: 'var(--muted)', padding: '4px 11px', fontSize: 14, lineHeight: 1 }}
      >
        📖
      </button>

      <QueueChip active={route.name === 'queue'} />

      <nav style={{ display: 'flex', gap: 4 }}>
        <NavLink href="#/" active={route.name === 'home'}>
          Projects
        </NavLink>
        <NavLink href="#/finetune" active={route.name === 'finetune'}>
          Fine-tune
        </NavLink>
        <NavLink href="#/keys" active={route.name === 'keys'}>
          API keys
        </NavLink>
        <NavLink href="#/brand" active={route.name === 'brand'}>
          Brand
        </NavLink>
        <NavLink href="#/queue" active={route.name === 'queue'}>
          Queue
        </NavLink>
        <NavLink href="#/health" active={route.name === 'health'}>
          Health
        </NavLink>
      </nav>

      <a
        href="#/health"
        title={`health: ${worst}`}
        aria-label={`system health: ${worst}`}
        style={{ display: 'inline-flex', alignItems: 'center' }}
      >
        <span
          aria-hidden
          style={{
            width: 11,
            height: 11,
            borderRadius: 999,
            background: worst === 'unknown' ? 'var(--hairline)' : HEALTH_DOT[worst],
            display: 'inline-block',
            boxShadow: worst !== 'unknown' ? `0 0 8px ${HEALTH_DOT[worst]}` : 'none',
          }}
        />
      </a>
    </header>
  );
}

function LayoutToggle({ layout, onLayout }: { layout: LayoutMode; onLayout: (m: LayoutMode) => void }) {
  const modes: LayoutMode[] = ['A', 'B', 'C', 'D'];
  return (
    <div
      role="group"
      aria-label="Layout mode"
      style={{ display: 'inline-flex', border: '1px solid var(--hairline)', borderRadius: 999, overflow: 'hidden' }}
    >
      {modes.map((m) => (
        <button
          key={m}
          onClick={() => onLayout(m)}
          title={LAYOUT_LABELS[m]}
          aria-pressed={layout === m}
          data-layout={m}
          style={{
            background: layout === m ? 'var(--accent)' : 'transparent',
            color: layout === m ? 'var(--primary)' : 'var(--muted)',
            border: 'none',
            padding: '5px 11px',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

/** "🎬 N" — live queued/running jobs (the doc-04 top-bar chip). Hidden when idle. */
function QueueChip({ active }: { active: boolean }) {
  const { jobs } = useJobs();
  const n = activeJobs(jobs).length;
  if (n === 0 || active) return null;
  return (
    <a
      href="#/queue"
      data-testid="queue-chip"
      title={`${n} job(s) queued or running`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12.5,
        fontWeight: 700,
        color: 'var(--secondary)',
        background: 'var(--surface-1)',
        border: '1px solid var(--hairline)',
        borderRadius: 999,
        padding: '4px 11px',
      }}
    >
      <span aria-hidden>🎬</span>
      {n} job{n > 1 ? 's' : ''}
    </a>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        padding: '6px 12px',
        borderRadius: 'var(--radius-sm)',
        fontSize: 14,
        fontWeight: 600,
        color: active ? 'var(--secondary)' : 'var(--muted)',
        background: active ? 'var(--surface-1)' : 'transparent',
      }}
    >
      {children}
    </a>
  );
}
