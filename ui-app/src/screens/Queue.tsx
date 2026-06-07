/**
 * UIP2.5 — the global Render Queue: one row per job (live via /ws/jobs), progress + frames, retry
 * on failed, cancel on queued/running, an expandable log drawer (capability stdout tail), and the
 * disk/VRAM footer that matters on low-VRAM machines (doc 05 §5).
 */
import { useEffect, useState } from 'react';
import { useJobs } from '../lib/jobs';
import { api, ApiError } from '../lib/api';
import { EmptyState } from '../components/EmptyState';
import type { JobRecord, JobStatus, SystemInfo } from '../lib/types';

const STATUS_META: Record<JobStatus, { icon: string; color: string }> = {
  queued: { icon: '◔', color: 'var(--muted)' },
  running: { icon: '●', color: 'var(--accent)' },
  done: { icon: '✓', color: 'var(--success)' },
  failed: { icon: '✕', color: 'var(--danger)' },
  cancelled: { icon: '⊘', color: 'var(--muted)' },
};

export function Queue() {
  const { jobs, error } = useJobs();
  const [sys, setSys] = useState<SystemInfo | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.system().then((s) => alive && setSys(s)).catch(() => undefined);
    load();
    const t = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 28px 64px', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 31, fontWeight: 700, margin: 0 }}>Render Queue</h1>
        <span style={{ color: 'var(--muted)', fontSize: 14 }}>
          {jobs.filter((j) => j.status === 'running').length} running · {jobs.filter((j) => j.status === 'queued').length} queued
        </span>
      </header>

      {error && <EmptyState title="Can't reach the server" hint={error} />}
      {!error && jobs.length === 0 && (
        <EmptyState title="Nothing in the queue" hint="Renders and capability runs you queue from a project's Deliver or QA screen land here." />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }} data-testid="job-rows">
        {jobs.map((j) => (
          <JobRow key={j.id} job={j} />
        ))}
      </div>

      <footer
        data-testid="queue-footer"
        className="mono"
        style={{ marginTop: 28, paddingTop: 14, borderTop: '1px solid var(--hairline)', color: 'var(--muted)', fontSize: 12.5, display: 'flex', gap: 18, flexWrap: 'wrap' }}
      >
        <span>disk: {sys ? `${sys.freeGb} GB free / ${sys.totalGb} GB` : '…'}</span>
        <span>renders: max 1 at a time · capabilities: max 2</span>
        {sys?.gpu && (
          <span>
            GPU {(sys.gpu.usedMb / 1024).toFixed(1)}/{(sys.gpu.totalMb / 1024).toFixed(1)} GB VRAM
          </span>
        )}
      </footer>
    </div>
  );
}

function JobRow({ job }: { job: JobRecord }) {
  const [showLog, setShowLog] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const meta = STATUS_META[job.status];
  const pct = job.progress !== undefined ? Math.round(job.progress * 100) : null;

  async function act(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  }

  return (
    <div
      data-testid="job-row"
      data-job-id={job.id}
      data-job-status={job.status}
      style={{ background: 'var(--surface-1)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span aria-hidden style={{ color: meta.color, fontSize: 15 }}>{meta.icon}</span>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {job.project && <span style={{ color: 'var(--muted)' }}>{job.project} · </span>}
          {job.label}
        </span>
        <span style={{ fontSize: 12, color: meta.color, fontWeight: 700 }}>{job.status}</span>
        <div style={{ flex: 1 }} />
        {job.frame !== undefined && job.totalFrames !== undefined && (
          <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
            frame {job.frame}/{job.totalFrames}
            {job.etaS !== undefined && job.status === 'running' ? ` · ~${job.etaS}s left` : ''}
          </span>
        )}
        {(job.status === 'queued' || job.status === 'running') && (
          <button onClick={() => act(() => api.cancelJob(job.id))} data-action="cancel" style={iconBtn} title="cancel">
            ✕ cancel
          </button>
        )}
        {(job.status === 'failed' || job.status === 'cancelled') && (
          <button onClick={() => act(() => api.retryJob(job.id))} data-action="retry" style={iconBtn} title="retry">
            ↻ retry
          </button>
        )}
        <button onClick={() => setShowLog((v) => !v)} data-action="logs" style={iconBtn}>
          {showLog ? 'hide logs' : 'logs'}
        </button>
      </div>

      {pct !== null && job.status === 'running' && (
        <div style={{ marginTop: 8, height: 5, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
        </div>
      )}

      {job.error && (
        <div style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} className="mono">
          ✕ {job.error}
        </div>
      )}
      {err && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 6 }}>✕ {err}</div>}

      {showLog && (
        <pre
          className="mono"
          data-testid="job-log"
          style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.45, background: 'var(--primary)', border: '1px solid var(--hairline)', borderRadius: 8, padding: 10, marginTop: 10, marginBottom: 0, maxHeight: 240, overflow: 'auto' }}
        >
          {job.logTail.length > 0 ? job.logTail.join('\n') : '(no output captured)'}
        </pre>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--muted)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '3px 10px',
  fontSize: 12,
};
