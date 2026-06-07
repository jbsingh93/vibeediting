/**
 * UIP5.3 — the compare-versions wipe: v1↔v2 of a stage's output stacked in one frame with a
 * draggable divider (left of it = the approved/active side, right = the fork). Both <video>
 * elements stay time-locked (the approved side leads; the follower snaps when it drifts past
 * ~2 frames). A side whose file isn't on disk (or isn't under a served root) shows an honest
 * placeholder instead of a decode error — same media-safety rule as the fine-tune preview.
 */
import { useEffect, useRef, useState } from 'react';
import type { VersionRecord } from '../lib/types';
import { clampWipe, comparePair, driftCorrection, type CompareSide } from '../lib/compare';
import { usePointerDrag } from './finetune/timeline-ui';

export function CompareWipe({ versions }: { versions: VersionRecord[] }) {
  const pair = comparePair(versions);
  const [pct, setPct] = useState(50);
  const [playing, setPlaying] = useState(false);
  const [deadA, setDeadA] = useState(false);
  const [deadB, setDeadB] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const vidA = useRef<HTMLVideoElement>(null);
  const vidB = useRef<HTMLVideoElement>(null);
  const dragStartPct = useRef(50);

  const { onPointerDown } = usePointerDrag({
    onStart: () => {
      dragStartPct.current = pct;
    },
    onMove: (deltaPx) => {
      const w = boxRef.current?.clientWidth ?? 1;
      setPct(clampWipe(dragStartPct.current + (deltaPx / w) * 100));
    },
  });

  // keep the follower time-locked to the leader
  useEffect(() => {
    const a = vidA.current;
    const b = vidB.current;
    if (!a || !b) return;
    const sync = () => {
      const target = driftCorrection(a.currentTime, b.currentTime);
      if (target !== null) b.currentTime = target;
    };
    a.addEventListener('timeupdate', sync);
    return () => a.removeEventListener('timeupdate', sync);
  }, [deadA, deadB]);

  if (!pair) return null;

  function toggle() {
    const a = vidA.current;
    const b = vidB.current;
    const next = !playing;
    setPlaying(next);
    for (const v of [a, b]) {
      if (!v) continue;
      if (next) void v.play().catch(() => undefined);
      else v.pause();
    }
  }

  function scrub(sec: number) {
    if (vidA.current) vidA.current.currentTime = sec;
    if (vidB.current) vidB.current.currentTime = sec;
  }

  const durA = vidA.current?.duration;

  return (
    <div data-testid="compare-wipe" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        ref={boxRef}
        style={{ position: 'relative', width: '100%', maxWidth: 560, aspectRatio: '16 / 9', background: '#000', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}
      >
        {/* side A (approved/active) — the base layer */}
        <Side side={pair.a} dead={deadA} videoRef={vidA} onDead={() => setDeadA(true)} clip={null} testid="compare-side-a" />
        {/* side B (the fork) — on top, clipped to the right of the divider */}
        <Side side={pair.b} dead={deadB} videoRef={vidB} onDead={() => setDeadB(true)} clip={`inset(0 0 0 ${pct}%)`} testid="compare-side-b" muted />

        {/* labels */}
        <Label left>{`v${pair.a.v}${pair.a.approved ? ' ✓ approved' : ''}`}</Label>
        <Label>{`v${pair.b.v}${pair.b.approved ? ' ✓ approved' : ''}`}</Label>

        {/* divider */}
        <div
          data-testid="compare-divider"
          onPointerDown={onPointerDown}
          role="slider"
          aria-label="Compare wipe position"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={3}
          aria-valuemax={97}
          style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${pct}% - 9px)`, width: 18, cursor: 'ew-resize', display: 'flex', justifyContent: 'center', touchAction: 'none' }}
        >
          <div style={{ width: 2, background: 'var(--accent)', boxShadow: '0 0 6px rgba(0,0,0,0.8)' }} />
          <div
            aria-hidden
            style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: 'var(--accent)', color: 'var(--primary)', borderRadius: 999, fontSize: 10, fontWeight: 800, padding: '2px 6px', userSelect: 'none' }}
          >
            ⟷
          </div>
        </div>
      </div>

      {/* transport */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 560 }}>
        <button
          data-testid="compare-play"
          onClick={toggle}
          style={{ background: 'var(--surface-2)', color: 'var(--secondary)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '4px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
        >
          {playing ? '⏸ pause both' : '▶ play both'}
        </button>
        <input
          data-testid="compare-scrub"
          type="range"
          min={0}
          max={Number.isFinite(durA) && durA ? durA : 1}
          step={0.01}
          defaultValue={0}
          onChange={(e) => scrub(parseFloat(e.target.value))}
          style={{ flex: 1 }}
          aria-label="Scrub both versions"
        />
        <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
          time-locked
        </span>
      </div>
    </div>
  );
}

function Side({
  side,
  dead,
  videoRef,
  onDead,
  clip,
  testid,
  muted,
}: {
  side: CompareSide;
  dead: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onDead: () => void;
  clip: string | null;
  testid: string;
  muted?: boolean;
}) {
  const fill: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' };
  if (!side.url || dead) {
    return (
      <div
        data-testid={`${testid}-offline`}
        style={{ ...fill, clipPath: clip ?? undefined, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, background: clip ? 'var(--surface-2)' : 'var(--surface-1)', color: 'var(--muted)', fontSize: 12 }}
      >
        <span aria-hidden style={{ fontSize: 18 }}>▣</span>
        <span>v{side.v} media not on disk</span>
        {side.output && (
          <span className="mono" style={{ fontSize: 10, maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {side.output}
          </span>
        )}
      </div>
    );
  }
  return (
    <video
      data-testid={testid}
      ref={videoRef}
      src={side.url}
      muted={muted ?? false}
      playsInline
      preload="auto"
      onError={onDead}
      style={{ ...fill, objectFit: 'contain', clipPath: clip ?? undefined }}
    />
  );
}

function Label({ left, children }: { left?: boolean; children: string }) {
  return (
    <span
      className="mono"
      style={{ position: 'absolute', top: 8, [left ? 'left' : 'right']: 8, background: 'rgba(0,0,0,0.65)', color: 'var(--secondary)', fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: '2px 8px', pointerEvents: 'none' }}
    >
      {children}
    </span>
  );
}
