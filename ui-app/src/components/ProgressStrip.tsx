/**
 * UIP6.5 — the persistent progress strip (BOTH modes — it renders manifest truth wizard projects
 * have too, plan §6 design decision #4): a slim accent bar directly under the stage strip with a
 * mono label `3/6 stages · motion ◔ 41%`. Pre-plan = honest `awaiting plan ○` (never a fake 0 %);
 * a pulsing ◔ marks an in-flight agent turn. Icon + label, never color alone.
 */
import { useJobs } from '../lib/jobs';
import { progressInfo } from '../lib/progress';
import { isRenderActivity } from '../lib/agent';
import type { Manifest } from '../lib/types';

export function ProgressStrip({
  manifest,
  agentBusy,
  agentActivity = null,
}: {
  manifest: Manifest;
  agentBusy: boolean;
  /** UIP6.13 — the agent's in-flight tool (currentActivity), so long renders are visibly "rendering". */
  agentActivity?: string | null;
}) {
  const { jobs } = useJobs();
  const p = progressInfo(manifest, jobs);
  const rendering = agentBusy && isRenderActivity(agentActivity);

  return (
    <div data-testid="progress-strip" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.empty ? undefined : Math.round(p.fraction * 100)}
        aria-label="Project progress"
        style={{ flex: 1, height: 4, borderRadius: 999, background: 'var(--surface-2)', border: '1px solid var(--hairline)', overflow: 'hidden' }}
      >
        {!p.empty && (
          <div
            data-testid="progress-fill"
            style={{ width: `${Math.round(p.fraction * 100)}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.4s ease' }}
          />
        )}
      </div>
      <span className="mono" data-testid="progress-label" style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '55%' }}>
        {p.label}
        {agentBusy && (
          <span className="vibe-pulse" aria-label="agent working" data-testid="agent-activity" style={{ color: 'var(--accent)', marginLeft: 8 }}>
            {rendering ? '🎬 rendering' : '◔ agent'}
            {agentActivity ? ` · ${agentActivity}` : ''}
          </span>
        )}
      </span>
    </div>
  );
}
