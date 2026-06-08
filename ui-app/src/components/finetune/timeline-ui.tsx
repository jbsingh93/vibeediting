/**
 * components/finetune/timeline-ui.tsx — shared timeline primitives for the fine-tune editor:
 * the ruler (click = seek), the playhead, the track-row shell, and the pointer-drag hook every
 * chip/block/handle uses (pointer capture + deltas in px → the caller maps px → ms/sec).
 */
import React, { useCallback, useRef } from 'react';

export interface DragCallbacks {
  onStart?: () => void;
  onMove: (deltaPx: number, ev: PointerEvent) => void;
  onEnd?: (deltaPx: number) => void;
}

/** Pointer-capture drag: returns props for the draggable element. Pure px deltas. */
export function usePointerDrag({ onStart, onMove, onEnd }: DragCallbacks) {
  const state = useRef<{ startX: number; dragging: boolean }>({ startX: 0, dragging: false });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      state.current = { startX: e.clientX, dragging: true };
      onStart?.();
      const move = (ev: PointerEvent) => {
        if (!state.current.dragging) return;
        onMove(ev.clientX - state.current.startX, ev);
      };
      const up = (ev: PointerEvent) => {
        state.current.dragging = false;
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
        onEnd?.(ev.clientX - state.current.startX);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },
    [onStart, onMove, onEnd],
  );

  return { onPointerDown };
}

/** mm:ss.s for ruler labels + inspectors. */
export function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Ruler tick spacing that keeps labels readable at any zoom. */
export function tickStepSec(pxPerSec: number): number {
  for (const step of [0.5, 1, 2, 5, 10, 20, 30, 60]) {
    if (step * pxPerSec >= 64) return step;
  }
  return 120;
}

export function Ruler({
  durationSec,
  pxPerSec,
  onSeek,
  onRangeStart,
  onRangeMove,
  onRangeEnd,
}: {
  durationSec: number;
  pxPerSec: number;
  onSeek: (sec: number) => void;
  /** VE.1.2: dragging on the ruler selects a time range (a click still seeks). */
  onRangeStart?: () => void;
  onRangeMove?: (startSec: number, endSec: number) => void;
  onRangeEnd?: (startSec: number, endSec: number) => void;
}) {
  const step = tickStepSec(pxPerSec);
  const ticks: number[] = [];
  for (let t = 0; t <= durationSec; t += step) ticks.push(t);
  const clampSec = (x: number, left: number) => Math.max(0, Math.min(durationSec, (x - left) / pxPerSec));
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const startSec = clampSec(e.clientX, rect.left);
    // No range handlers wired (or not draggable) → preserve the legacy click-to-seek behavior.
    if (!onRangeMove && !onRangeEnd) {
      onSeek(startSec);
      return;
    }
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    let moved = false;
    onRangeStart?.();
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - e.clientX) > 3) moved = true;
      if (moved) {
        const cur = clampSec(ev.clientX, rect.left);
        onRangeMove?.(Math.min(startSec, cur), Math.max(startSec, cur));
      }
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (!moved) {
        onSeek(startSec); // a tap = seek, not a zero-width range
        return;
      }
      const cur = clampSec(ev.clientX, rect.left);
      onRangeEnd?.(Math.min(startSec, cur), Math.max(startSec, cur));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return (
    <div
      data-testid="ft-ruler"
      onPointerDown={onPointerDown}
      style={{
        position: 'relative',
        height: 22,
        width: durationSec * pxPerSec,
        borderBottom: '1px solid var(--hairline)',
        cursor: onRangeMove ? 'ew-resize' : 'pointer',
        flex: 'none',
      }}
    >
      {ticks.map((t) => (
        <span
          key={t}
          className="mono"
          style={{
            position: 'absolute',
            left: t * pxPerSec,
            top: 2,
            fontSize: 10,
            color: 'var(--muted)',
            borderLeft: '1px solid var(--hairline)',
            paddingLeft: 4,
            userSelect: 'none',
          }}
        >
          {fmtSec(t)}
        </span>
      ))}
    </div>
  );
}

export function Playhead({ sec, pxPerSec, height }: { sec: number; pxPerSec: number; height: number }) {
  return (
    <div
      data-testid="ft-playhead"
      aria-hidden
      style={{
        position: 'absolute',
        left: sec * pxPerSec,
        top: 0,
        width: 1,
        height,
        background: 'var(--accent)',
        opacity: 0.8,
        pointerEvents: 'none',
        zIndex: 6,
      }}
    />
  );
}

/** VE.1.2: the range selection band — a translucent overlay spanning every track row. */
export function SelectionBand({
  startSec,
  endSec,
  pxPerSec,
  height,
}: {
  startSec: number;
  endSec: number;
  pxPerSec: number;
  height: number;
}) {
  const left = startSec * pxPerSec;
  const width = Math.max(1, (endSec - startSec) * pxPerSec);
  return (
    <div
      data-testid="ft-range-band"
      aria-hidden
      style={{
        position: 'absolute',
        left,
        top: 0,
        width,
        height,
        background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
        borderLeft: '1px solid var(--accent)',
        borderRight: '1px solid var(--accent)',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  );
}

export function TrackRow({
  label,
  height,
  width,
  children,
  trailing,
}: {
  label: string;
  height: number;
  width: number;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--hairline)' }}>
      <div
        style={{
          flex: '0 0 52px',
          position: 'sticky',
          left: 0,
          zIndex: 7,
          background: 'var(--surface-1)',
          borderRight: '1px solid var(--hairline)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.6,
          color: 'var(--muted)',
        }}
      >
        <span>{label}</span>
        {trailing}
      </div>
      <div style={{ position: 'relative', height, width, flex: 'none' }} data-track={label.toLowerCase()}>
        {children}
      </div>
    </div>
  );
}

/** Small ghost button used across the editor chrome. */
export function GhostBtn({
  children,
  onClick,
  disabled,
  title,
  testid,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  testid?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testid}
      style={{
        background: 'transparent',
        color: disabled ? 'var(--hairline)' : 'var(--secondary)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-sm)',
        padding: '4px 10px',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
