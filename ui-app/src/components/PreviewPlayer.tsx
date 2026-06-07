/**
 * UIP2.6 — the inline preview: `@remotion/player@4.0.461` over the comp registry (D6: Player is
 * the default preview). Comps load lazily; metadata (fps/size/duration/defaultProps) comes from the
 * same timeline exports Root.tsx uses.
 * `<OffthreadVideo>` renders as a regular `<video>` in the browser Player — expected (plan §4).
 */
import { useEffect, useMemo, useState } from 'react';
import { Player } from '@remotion/player';
import { COMP_LOADERS, type LoadedComp } from '../lib/comp-registry';
import { COMP_IDS, isCompId, type CompId } from '../lib/comp-ids';
import { EmptyState } from './EmptyState';

/** Guess the registry comp for a project id (e.g. "linkedin-reel-2" → LinkedinReel2). */
export function guessCompForProject(projectId: string, compHint?: string): CompId {
  if (compHint && isCompId(compHint)) return compHint;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const p = norm(projectId);
  const hit: CompId | undefined =
    COMP_IDS.find((id) => norm(id) === p) ?? COMP_IDS.find((id) => p.includes(norm(id)) || norm(id).includes(p));
  // no match → the template's media-free demo composition (the prebuilt client can only bundle the
  // template payload's comp, never the user's own; a missing-media default would throw in the Player).
  return hit ?? 'DemoWelcome';
}

export function PreviewPlayer({ initialComp }: { initialComp: CompId }) {
  const [compId, setCompId] = useState<CompId>(initialComp);
  const [loaded, setLoaded] = useState<LoadedComp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoaded(null);
    setError(null);
    COMP_LOADERS[compId]()
      .then((l) => alive && setLoaded(l))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [compId]);

  const vertical = loaded ? loaded.height > loaded.width : false;
  const meta = useMemo(
    () =>
      loaded
        ? `${loaded.width}×${loaded.height} · ${loaded.fps}fps · ${(loaded.durationInFrames / loaded.fps).toFixed(1)}s`
        : null,
    [loaded],
  );

  return (
    <div data-testid="preview-player">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }} htmlFor="preview-comp">
          Comp
        </label>
        <select
          id="preview-comp"
          value={compId}
          onChange={(e) => setCompId(e.target.value as CompId)}
          data-testid="preview-comp-select"
          style={selectStyle}
        >
          {COMP_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        {meta && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
            {meta}
          </span>
        )}
      </div>

      {error && <EmptyState title="Preview failed to load" hint={error} />}
      {!error && !loaded && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading composition…</div>}
      {!error && loaded && (
        <div
          style={{
            background: '#000',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            // keep vertical comps a sane height inside the panel
            maxWidth: vertical ? 320 : '100%',
          }}
        >
          <Player
            component={loaded.component}
            inputProps={loaded.defaultProps ?? {}}
            durationInFrames={Math.max(1, loaded.durationInFrames)}
            fps={loaded.fps}
            compositionWidth={loaded.width}
            compositionHeight={loaded.height}
            controls
            doubleClickToFullscreen
            style={{ width: '100%' }}
            acknowledgeRemotionLicense
          />
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: 'var(--surface-1)',
  color: 'var(--secondary)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '6px 10px',
  fontSize: 13,
};
