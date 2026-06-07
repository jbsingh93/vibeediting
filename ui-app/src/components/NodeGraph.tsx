/**
 * UIP5.2 — the node-graph advanced view (doc 02 Concept D, kept as a power view): the manifest's
 * recorded stages as a read-mostly DAG, plus two drawers — raw manifest JSON (mono, the file
 * truth) and the project's job logs (live via /ws/jobs). Clicking a node scopes both drawers to
 * that stage. Status is always icon + label, never color alone (doc 08 §3).
 */
import { useMemo, useState } from 'react';
import type { Manifest, JobRecord, StageName } from '../lib/types';
import { STAGE_STATUS_META } from '../lib/status';
import { buildGraph, edgePath, rawJson, NODE_W, NODE_H } from '../lib/graph';
import { useJobs } from '../lib/jobs';

export function NodeGraph({ manifest }: { manifest: Manifest }) {
  const [selected, setSelected] = useState<StageName | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const { jobs } = useJobs();

  const layout = useMemo(() => buildGraph(manifest), [manifest]);
  const projectJobs = useMemo(
    () => jobs.filter((j) => j.project === manifest.project_id),
    [jobs, manifest.project_id],
  );

  return (
    <div data-testid="node-graph" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        The pipeline as the manifest records it — read-mostly. Click a node to scope the drawers below to that stage.
      </div>

      {layout.nodes.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>No stages recorded yet — the graph appears when the agent starts work.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <svg
            width={layout.width}
            height={layout.height}
            role="img"
            aria-label={`Stage graph: ${layout.nodes.map((n) => `${n.id} ${n.status}`).join(', ')}`}
            style={{ display: 'block' }}
          >
            <defs>
              <marker id="vibe-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--hairline)" />
              </marker>
            </defs>
            {layout.edges.map((e) => (
              <path
                key={`${e.from}-${e.to}`}
                d={edgePath(e)}
                fill="none"
                stroke="var(--hairline)"
                strokeWidth={1.5}
                markerEnd="url(#vibe-arrow)"
              />
            ))}
            {layout.nodes.map((n) => {
              const meta = STAGE_STATUS_META[n.status];
              const active = selected === n.id;
              return (
                <g
                  key={n.id}
                  data-testid={`graph-node-${n.id}`}
                  data-node-status={n.status}
                  onClick={() => setSelected((s) => (s === n.id ? null : n.id))}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={n.x}
                    y={n.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={8}
                    fill={active ? 'var(--surface-2)' : 'var(--surface-1)'}
                    stroke={active ? 'var(--accent)' : meta?.color ?? 'var(--hairline)'}
                    strokeWidth={active ? 1.8 : 1.2}
                  />
                  <text x={n.x + 12} y={n.y + 23} fill="var(--secondary)" fontSize={13} fontWeight={700} fontFamily="inherit">
                    {n.id}
                    {n.gate ? '  🔒' : ''}
                  </text>
                  <text x={n.x + 12} y={n.y + 43} fill={meta?.color ?? 'var(--muted)'} fontSize={11} fontFamily="var(--mono, monospace)">
                    {meta?.icon} {meta?.label}
                    {n.versions >= 2 ? `  ·  v×${n.versions}` : ''}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* drawers */}
      <Drawer
        testid="drawer-json"
        title={`Raw JSON ${selected ? `— stage "${selected}"` : '— manifest'}`}
        open={jsonOpen}
        onToggle={() => setJsonOpen((v) => !v)}
      >
        <pre
          className="mono"
          data-testid="drawer-json-body"
          style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto' }}
        >
          {rawJson(manifest, selected)}
        </pre>
      </Drawer>

      <Drawer
        testid="drawer-logs"
        title={`Logs — ${projectJobs.length} job${projectJobs.length === 1 ? '' : 's'} for this project`}
        open={logsOpen}
        onToggle={() => setLogsOpen((v) => !v)}
      >
        {projectJobs.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>No jobs recorded for this project in this session.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projectJobs.map((j) => (
              <JobLog key={j.id} job={j} />
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Drawer({
  testid,
  title,
  open,
  onToggle,
  children,
}: {
  testid: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testid} style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-1)' }}>
      <button
        data-testid={`${testid}-toggle`}
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          color: 'var(--secondary)',
          border: 'none',
          padding: '9px 12px',
          fontSize: 12.5,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        <span aria-hidden style={{ color: 'var(--muted)' }}>{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open && <div style={{ borderTop: '1px solid var(--hairline)', padding: 12 }}>{children}</div>}
    </div>
  );
}

function JobLog({ job }: { job: JobRecord }) {
  const [open, setOpen] = useState(false);
  const statusColor = job.status === 'failed' ? 'var(--danger)' : job.status === 'done' ? 'var(--success)' : 'var(--accent)';
  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 6 }}>
      <button
        data-testid="job-log-row"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          color: 'var(--secondary)',
          border: 'none',
          padding: '7px 10px',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        <span aria-hidden style={{ color: statusColor }}>
          {job.status === 'done' ? '✓' : job.status === 'failed' ? '✕' : '◔'}
        </span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.label}</span>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>
          {job.status}
        </span>
      </button>
      {open && (
        <pre
          className="mono"
          style={{ margin: 0, borderTop: '1px solid var(--hairline)', padding: 10, fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto', color: 'var(--muted)' }}
        >
          {job.logTail.length > 0 ? job.logTail.join('\n') : '(no log output captured)'}
          {job.error ? `\n✕ ${job.error}` : ''}
        </pre>
      )}
    </div>
  );
}
