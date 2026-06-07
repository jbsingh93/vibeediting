/**
 * UIP1.4 — storyboard grid from out/work/<project>/<stage>/ (served read-only at /work) + a SafeZone
 * overlay (doc 11 / CLAUDE.md): on 9:16 the bottom-480 px band, on 16:9 the right-rail — the regions
 * captions/CTA must stay out of. Toggleable so the human can review framing both ways.
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { EmptyState } from './EmptyState';
import type { StageName, StoryboardImage } from '../lib/types';

export function Storyboard({
  projectId,
  stage,
  vertical,
}: {
  projectId: string;
  stage: StageName;
  vertical: boolean;
}) {
  const [images, setImages] = useState<StoryboardImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSafe, setShowSafe] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .storyboard(projectId, stage)
      .then((r) => alive && setImages(r.images))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [projectId, stage]);

  if (error) return <EmptyState title="Storyboard unavailable" hint={error} />;
  if (!images) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading storyboard…</div>;
  if (images.length === 0)
    return (
      <EmptyState
        title="No storyboard frames yet"
        hint={`Frames render to out/work/${projectId}/${stage}/ — they'll appear here when the agent produces them.`}
      />
    );

  return (
    <div data-testid="storyboard">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Storyboard · {images.length} frame{images.length > 1 ? 's' : ''}</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showSafe} onChange={(e) => setShowSafe(e.target.checked)} />
          SafeZone ({vertical ? 'bottom 480px' : 'right rail'})
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: vertical ? 'repeat(auto-fill, minmax(120px, 1fr))' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
        {images.map((img) => (
          <figure key={img.url} data-frame={img.name} style={{ margin: 0, position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--hairline)', background: 'var(--surface-2)' }}>
            <img src={img.url} alt={img.name} style={{ display: 'block', width: '100%', aspectRatio: vertical ? '9 / 16' : '16 / 9', objectFit: 'cover' }} />
            {showSafe && <SafeZoneBand vertical={vertical} />}
            <figcaption className="mono" style={{ fontSize: 10, color: 'var(--muted)', padding: '4px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {img.name}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/** The forbidden band: 9:16 → bottom 25% (≈480/1920); 16:9 → right ~28% rail. */
function SafeZoneBand({ vertical }: { vertical: boolean }) {
  const common: React.CSSProperties = {
    position: 'absolute',
    background: 'repeating-linear-gradient(45deg, rgba(255,71,87,0.16) 0 8px, rgba(255,71,87,0.06) 8px 16px)',
    border: '1px dashed rgba(255,71,87,0.7)',
    pointerEvents: 'none',
  };
  const box: React.CSSProperties = vertical
    ? { ...common, left: 0, right: 0, bottom: 0, height: '25%' }
    : { ...common, top: 0, bottom: 0, right: 0, width: '28%' };
  return <div style={box} aria-hidden data-safezone={vertical ? 'bottom' : 'right'} />;
}
