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
}: {
  durationSec: number;
  pxPerSec: number;
  onSeek: (sec: number) => void;
}) {
  const step = tickStepSec(pxPerSec);
  const ticks: number[] = [];
  for (let t = 0; t <= durationSec; t += step) ticks.push(t);
  return (
    <div
      data-testid="ft-ruler"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(Math.max(0, Math.min(durationSec, (e.clientX - rect.left) / pxPerSec)));
      }}
      style={{
        position: 'relative',
        height: 22,
        width: durationSec * pxPerSec,
        borderBottom: '1px solid var(--hairline)',
        cursor: 'pointer',
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
