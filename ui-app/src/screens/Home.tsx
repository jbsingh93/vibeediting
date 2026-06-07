import { useProjects } from '../lib/hooks';
import { StatusPill } from '../components/StatusPill';
import { EmptyState } from '../components/EmptyState';
import { Onboarding } from '../components/Onboarding';
import type { ManifestSummary } from '../lib/types';

/** HOME — the project gallery. Manifest projects (pipelined) from GET /api/projects. */
export function Home() {
  const { data, error } = useProjects();

  if (error) {
    return (
      <Page>
        <EmptyState title="Can't reach the server" hint={error} />
      </Page>
    );
  }
  if (!data) {
    return (
      <Page>
        <div style={{ color: 'var(--muted)' }}>Loading projects…</div>
      </Page>
    );
  }

  const noProjects = data.projects.length === 0;

  return (
    <Page>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 14 }}>
        <h1 style={{ fontSize: 31, fontWeight: 700, margin: 0 }}>Projects</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ color: 'var(--muted)', fontSize: 14 }}>
            {data.projects.length} pipelined
          </span>
          <a
            href="#/new"
            data-testid="new-video"
            style={{
              background: 'var(--accent)',
              color: 'var(--primary)',
              borderRadius: 'var(--radius-sm)',
              padding: '9px 16px',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            + New video
          </a>
        </div>
      </header>

      {noProjects ? (
        <>
          <Onboarding />
          <EmptyState
            title="No projects yet"
            hint="New videos created through the pipeline will appear here. Start one with “New video”."
          />
        </>
      ) : (
        <Grid>
          {data.projects.map((p) => (
            <ProjectCard key={p.project_id} p={p} />
          ))}
        </Grid>
      )}
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 28px 64px' }}>{children}</div>;
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: 'block',
  background: 'var(--surface-1)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius)',
  padding: 18,
  boxShadow: '0 1px 0 rgba(0,0,0,0.4)',
};

function ProjectCard({ p }: { p: ManifestSummary }) {
  const gates = p.blockedStages.length;
  return (
    <a href={`#/project/${encodeURIComponent(p.project_id)}`} style={cardStyle} data-testid="project-card" data-project={p.project_id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.project_id}
        </span>
        <StatusPill status={p.status} />
      </div>
      <div className="mono" style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>
        updated {new Date(p.updated_at).toLocaleString()}
      </div>
      {gates > 0 && (
        <div style={{ marginTop: 12, color: 'var(--warn)', fontSize: 13, fontWeight: 600 }}>
          🔒 {gates} gate{gates > 1 ? 's' : ''} waiting — {p.blockedStages.join(', ')}
        </div>
      )}
    </a>
  );
}
