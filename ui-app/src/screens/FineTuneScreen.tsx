/**
 * screens/FineTuneScreen.tsx — UI-P4: the standalone fine-tune surface (`#/finetune[/<project>]`).
 * Works for ANY public/<p>/ with editable docs — projects without a manifest still reach their
 * caption/segment/audio tuning here. Projects with a manifest get the same editor inside the
 * Project workspace's "Fine-tune" tab.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { FinetuneProjectEntry, StageName } from '../lib/types';
import { hasPropsSchema, SCHEMA_LOADERS } from '../lib/schema-registry';
import { FineTune } from '../components/FineTune';
import { EmptyState } from '../components/EmptyState';

export function FineTuneScreen({ project }: { project: string | null }) {
  const [entries, setEntries] = useState<FinetuneProjectEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningStage, setRunningStage] = useState<StageName | null>(null);

  useEffect(() => {
    api
      .finetuneProjects()
      .then((r) => {
        // merge in the Zod-props comps' projects (the schema lives client-side; a props.json
        // may not exist on disk yet — the editor synthesizes it from the schema defaults)
        const known = new Set(r.projects.map((p) => p.project));
        const merged = [...r.projects];
        for (const p of Object.keys(SCHEMA_LOADERS)) {
          if (!known.has(p)) merged.push({ project: p, docs: 0, kinds: ['props'] });
        }
        setEntries(merged.sort((a, b) => a.project.localeCompare(b.project)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // UIP4.4 context: is a stage running on this project's manifest? (no manifest = no fork rule)
  useEffect(() => {
    setRunningStage(null);
    if (!project) return;
    api
      .project(project)
      .then((m) => {
        const running = (Object.entries(m.stages) as [StageName, { status?: string }][]).find(
          ([, s]) => s?.status === 'running',
        );
        setRunningStage(running ? running[0] : null);
      })
      .catch(() => setRunningStage(null));
  }, [project]);

  return (
    // VE.7.5 §5.4 — fill the (overflow:auto) <main> so the editor below can claim viewport height;
    // the header + project chips stay natural-height and the editor region gets flex:1; minHeight:0.
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1500, height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Fine-tune</h1>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          the last 5% by hand — captions, sound, cuts and scene props (the agent stays in sync; same files)
        </span>
      </div>

      {error && <EmptyState title="Can't list projects" hint={error} />}
      {!error && entries && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} data-testid="ft-projects">
          {entries.length === 0 && <EmptyState title="No tunable projects" hint="A project becomes tunable once public/<project>/ has captions, segments or props JSON." />}
          {entries.map((e) => (
            <a
              key={e.project}
              href={`#/finetune/${encodeURIComponent(e.project)}`}
              data-testid={`ft-project-${e.project}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 999,
                border: `1px solid ${project === e.project ? 'var(--secondary)' : 'var(--hairline)'}`,
                background: project === e.project ? 'var(--surface-2)' : 'var(--surface-1)',
                color: 'var(--secondary)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {e.project}
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                {e.kinds.length > 0 ? e.kinds.join(' · ') : 'props'}
                {hasPropsSchema(e.project) && !e.kinds.includes('props') ? ' · props' : ''}
              </span>
            </a>
          ))}
        </div>
      )}

      {project && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <FineTune key={project} project={project} runningStage={runningStage} />
        </div>
      )}
      {!project && entries && entries.length > 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Pick a project above to open its editor.</div>
      )}
    </div>
  );
}
