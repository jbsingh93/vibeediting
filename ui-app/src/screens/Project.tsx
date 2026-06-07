import { useEffect, useRef, useState } from 'react';
import { useProject } from '../lib/hooks';
import { useAgent, currentActivity } from '../lib/agent';
import { StageStrip } from '../components/StageStrip';
import { StatusPill } from '../components/StatusPill';
import { EmptyState } from '../components/EmptyState';
import { AgentPanel } from '../components/AgentPanel';
import { GateCard } from '../components/GateCard';
import { Storyboard } from '../components/Storyboard';
import { VersionSwitcher } from '../components/VersionSwitcher';
import { PreviewPlayer, guessCompForProject } from '../components/PreviewPlayer';
import { QaPanel } from '../components/QaPanel';
import { DeliverPanel } from '../components/DeliverPanel';
import { AssetManager } from '../components/AssetManager';
import { BudgetPanel } from '../components/BudgetPanel';
import { FineTune } from '../components/FineTune';
import { BriefTab } from '../components/BriefTab';
import { PlanTab } from '../components/PlanTab';
import { ProgressStrip } from '../components/ProgressStrip';
import { RendersPanel } from '../components/RendersPanel';
import { NodeGraph } from '../components/NodeGraph';
import { CompareWipe } from '../components/CompareWipe';
import { EDITOR_JUMP_EVENT, PROJECT_RELOAD_EVENT } from '../components/CommandPalette';
import { GhostBtn } from '../components/finetune/timeline-ui';
import { STAGE_ORDER, type Manifest, type Stage, type StageName } from '../lib/types';
import type { LayoutMode } from '../lib/layout';
import { layoutColumns } from '../lib/layout';
import { blockedGates, planGateStage } from '../lib/gate';
import { takeKickoff } from '../lib/wizard';

/** Infer a vertical (9:16) aspect from the brief so the SafeZone overlay picks the right band. */
function isVertical(manifest: Manifest): boolean {
  const inputs = manifest.inputs as Record<string, unknown>;
  const hay = `${inputs.format ?? ''} ${inputs.platform ?? ''}`.toLowerCase();
  return /9:16|9x16|vertical|portrait|reel|tiktok|short/.test(hay);
}

/** The editor panel's stage tabs (UI-P2/P3/P4 + UIP6.3/6.4 plan & brief): now 9. */
type EditorTab = 'overview' | 'plan' | 'brief' | 'preview' | 'finetune' | 'qa' | 'deliver' | 'budget' | 'graph';
const EDITOR_TABS: { id: EditorTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'plan', label: 'Plan' },
  { id: 'brief', label: 'Brief' },
  { id: 'preview', label: 'Preview' },
  { id: 'finetune', label: 'Fine-tune' },
  { id: 'qa', label: 'QA / Verify' },
  { id: 'deliver', label: 'Deliver' },
  { id: 'budget', label: 'Budget & History' },
  { id: 'graph', label: 'Graph' },
];

const TAB_IDS = EDITOR_TABS.map((t) => t.id) as string[];

/** UIP4.4 context: the running stage (if any) that a fine-tune save would conflict with. */
function runningStage(manifest: Manifest): StageName | null {
  for (const [name, s] of Object.entries(manifest.stages) as [StageName, Stage][]) {
    if (s?.status === 'running') return name;
  }
  return null;
}

/** PROJECT WORKSPACE — the tri-panel cockpit (Assets · Agent · Editor) with the live stage strip. */
export function Project({ id, layout }: { id: string; layout: LayoutMode }) {
  const { manifest, error, reload } = useProject(id);
  const agent = useAgent(id);
  const agentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [tab, setTab] = useState<EditorTab>('overview');
  const kickoffSent = useRef(false);
  const defaultTabApplied = useRef(false);

  // UIP6.2 — agent-mode projects open on Fine-tune (wizard projects keep 'overview' — zero regression).
  // Applied once, when the manifest first arrives; user tab clicks are never overridden.
  useEffect(() => {
    if (defaultTabApplied.current || !manifest) return;
    defaultTabApplied.current = true;
    if ((manifest.inputs as Record<string, unknown>).mode === 'agent') setTab('finetune');
  }, [manifest]);

  // UIP2.1 — the wizard's kickoff handoff: send the brief to the agent once the WS is up.
  useEffect(() => {
    if (kickoffSent.current || !agent.connected) return;
    const kickoff = takeKickoff(id);
    if (kickoff) {
      kickoffSent.current = true;
      agent.send(kickoff);
    }
  }, [agent.connected, agent, id]);

  // UIP5.1 — palette jumps (editor tab / stage card) + palette-side mutations needing a reload.
  useEffect(() => {
    const onJump = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab?: string; stage?: StageName } | undefined;
      if (!detail) return;
      if (detail.tab && TAB_IDS.includes(detail.tab)) setTab(detail.tab as EditorTab);
      if (detail.stage) {
        setTab('overview');
        // wait a tick so the overview tab is mounted before scrolling to the stage card
        setTimeout(() => {
          const el = document.querySelector<HTMLElement>(`[data-stage-detail="${detail.stage}"]`);
          el?.scrollIntoView({ block: 'center' });
          el?.setAttribute('data-jump-flash', 'true');
          setTimeout(() => el?.removeAttribute('data-jump-flash'), 1600);
        }, 30);
      }
    };
    const onReload = () => reload();
    window.addEventListener(EDITOR_JUMP_EVENT, onJump);
    window.addEventListener(PROJECT_RELOAD_EVENT, onReload);
    return () => {
      window.removeEventListener(EDITOR_JUMP_EVENT, onJump);
      window.removeEventListener(PROJECT_RELOAD_EVENT, onReload);
    };
  }, [reload]);

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <BackLink />
        <EmptyState title={`Can't load "${id}"`} hint={error} />
      </div>
    );
  }
  if (!manifest) {
    return (
      <div style={{ padding: 32 }}>
        <BackLink />
        <div style={{ color: 'var(--muted)' }}>Loading project…</div>
      </div>
    );
  }

  const cols = layoutColumns(layout);
  const showAssets = cols.assets !== '0';
  const showAgent = cols.agent !== '0';
  const showEditor = cols.editor !== '0';
  const template = [
    showAssets ? cols.assets : null,
    showAgent ? cols.agent : null,
    showEditor ? cols.editor : null,
  ]
    .filter(Boolean)
    .join(' ');

  const focusAgent = () => agentInputRef.current?.focus();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <BackLink />
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{manifest.project_id}</h1>
          <StatusPill status={manifest.status} />
        </div>
        <StageStrip manifest={manifest} />
        {/* UIP6.5/6.13 — persistent progress strip, BOTH modes (manifest truth + live render
            frames + the agent's in-flight tool so long renders are visibly "rendering") */}
        <ProgressStrip manifest={manifest} agentBusy={agent.working} agentActivity={currentActivity(agent.feed)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: template, flex: 1, minHeight: 0 }}>
        {showAssets && (
          <Panel title="Assets">
            <AssetsPanel manifest={manifest} onAskAgent={(text) => agent.send(text)} />
          </Panel>
        )}
        {showAgent && (
          <Panel title="Agent">
            <AgentPanel manifest={manifest} agent={agent} inputRef={agentInputRef} />
          </Panel>
        )}
        {showEditor && (
          <Panel
            title="Editor"
            last
            tabs={
              // wrap, don't clip — the tab row outgrew one line when Graph landed (UI-P5 QA)
              <div role="tablist" aria-label="Editor view" style={{ display: 'inline-flex', gap: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {EDITOR_TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    data-editor-tab={t.id}
                    onClick={() => setTab(t.id)}
                    style={{
                      background: tab === t.id ? 'var(--surface-2)' : 'transparent',
                      color: tab === t.id ? 'var(--secondary)' : 'var(--muted)',
                      border: '1px solid',
                      borderColor: tab === t.id ? 'var(--hairline)' : 'transparent',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            }
          >
            {tab === 'overview' && <EditorPanel manifest={manifest} onAskChanges={focusAgent} onMutated={reload} />}
            {tab === 'plan' && <PlanTab manifest={manifest} onAskChanges={focusAgent} onMutated={reload} />}
            {tab === 'brief' && <BriefTab projectId={manifest.project_id} />}
            {tab === 'preview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* UIP6.13 — produced videos first (v1/loudnorm drafts, explicit not-done framing) */}
                <div>
                  <SubHead>Renders</SubHead>
                  <RendersPanel manifest={manifest} />
                </div>
                <div>
                  <SubHead>Composition preview</SubHead>
                  <PreviewPlayer
                    initialComp={guessCompForProject(
                      manifest.project_id,
                      (manifest.inputs as Record<string, unknown>).comp_id as string | undefined,
                    )}
                  />
                </div>
              </div>
            )}
            {tab === 'finetune' && <FineTune project={manifest.project_id} runningStage={runningStage(manifest)} />}
            {tab === 'qa' && (
              <QaPanel
                projectId={manifest.project_id}
                onShip={() => setTab('deliver')}
                onAskAgent={(text) => agent.send(text)}
              />
            )}
            {tab === 'deliver' && (
              <DeliverPanel
                projectId={manifest.project_id}
                defaultComp={guessCompForProject(
                  manifest.project_id,
                  (manifest.inputs as Record<string, unknown>).comp_id as string | undefined,
                )}
              />
            )}
            {tab === 'budget' && <BudgetPanel manifest={manifest} />}
            {/* key by project: a remembered node selection must not leak into another
                project's drawers (live-MCP QA found a stale `stage "color"` label) */}
            {tab === 'graph' && <NodeGraph key={manifest.project_id} manifest={manifest} />}
          </Panel>
        )}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <a href="#/" style={{ color: 'var(--muted)', fontSize: 14, fontWeight: 600 }}>
      ← Projects
    </a>
  );
}

function Panel({
  title,
  last,
  tabs,
  children,
}: {
  title: string;
  last?: boolean;
  tabs?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{ borderRight: last ? 'none' : '1px solid var(--hairline)', minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      data-panel={title.toLowerCase()}
    >
      <div
        style={{
          padding: '8px 16px',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: 'var(--muted)',
          borderBottom: '1px solid var(--hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          minHeight: 37,
        }}
      >
        {title}
        {tabs}
      </div>
      <div style={{ padding: 16, overflow: 'auto', flex: 1, minHeight: 0 }}>{children}</div>
    </section>
  );
}

function AssetsPanel({ manifest, onAskAgent }: { manifest: Manifest; onAskAgent: (text: string) => void }) {
  const inputs = manifest.inputs as Record<string, unknown>;
  const keys = Object.keys(inputs).filter((k) => k !== 'plan' && k !== 'plan_gate_stage' && k !== 'agent_session_id');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {keys.length > 0 && (
        <div>
          <SubHead>Brief</SubHead>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 13 }}>
            {keys.map((k) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt style={{ color: 'var(--muted)' }}>{k}</dt>
                <dd className="mono" style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(inputs[k])}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <AssetManager projectId={manifest.project_id} onAskAgent={onAskAgent} />
    </div>
  );
}

function EditorPanel({ manifest, onAskChanges, onMutated }: { manifest: Manifest; onAskChanges: () => void; onMutated: () => void }) {
  const gates = blockedGates(manifest);
  const planGate = planGateStage(manifest);
  const vertical = isVertical(manifest);
  const present = STAGE_ORDER.filter((s) => manifest.stages[s]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* gates first — the "needs me" surface */}
      {gates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="gates">
          {gates.map((stage, i) => (
            <GateCard
              key={stage}
              manifest={manifest}
              stage={stage}
              autoFocus={i === 0}
              onAskChanges={() => onAskChanges()}
              onMutated={onMutated}
            />
          ))}
        </div>
      )}

      {/* storyboard for the plan/motion gate */}
      {manifest.stages[planGate] && (
        <div>
          <SubHead>Storyboard</SubHead>
          <Storyboard projectId={manifest.project_id} stage={planGate} vertical={vertical} />
        </div>
      )}

      <div>
        <SubHead>Stages</SubHead>
        {present.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>No stages recorded yet.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {present.map((name) => (
            <StageDetail
              key={name}
              projectId={manifest.project_id}
              name={name}
              stage={manifest.stages[name] as Stage}
              gate={manifest.approvals_required.includes(name)}
              onMutated={onMutated}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StageDetail({ projectId, name, stage, gate, onMutated }: { projectId: string; name: StageName; stage: Stage; gate: boolean; onMutated: () => void }) {
  const [compare, setCompare] = useState(false);
  const canCompare = !!stage.versions && stage.versions.length >= 2;
  return (
    <div
      data-stage-detail={name}
      style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600 }}>
          {name}
          {gate && <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 700, marginLeft: 6, letterSpacing: 0.4 }}>gate</span>}
        </span>
        <StatusPill status={stage.status} kind="stage" />
      </div>
      {stage.error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>✕ {stage.error}</div>}
      {canCompare && (
        <VersionSwitcher projectId={projectId} stage={name} versions={stage.versions!} onMutated={onMutated} />
      )}
      {canCompare && (
        <div style={{ marginTop: 8 }}>
          <GhostBtn testid={`compare-toggle-${name}`} onClick={() => setCompare((v) => !v)} title="Wipe between the two versions' rendered outputs">
            {compare ? '✕ close compare' : '⟷ Compare versions'}
          </GhostBtn>
        </div>
      )}
      {canCompare && compare && <CompareWipe versions={stage.versions!} />}
      <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 8 }}>attempts: {stage.attempts}</div>
    </div>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{children}</div>;
}
