/**
 * components/finetune/SegmentTrack.tsx — UIP4.3: the EDL segment-block track. Blocks sit on the
 * OUTPUT timeline (placement derives from srcStart/srcEnd); dragging an edge nudges that source
 * boundary and the whole tail re-places live — exactly what changing segments.json does to the
 * comp. Body click selects (numeric nudge lives in the inspector).
 */
import React, { useRef, useState } from 'react';
import type { PlacedEdlSegment } from '../../lib/finetune';
import { assetBasename } from '../../lib/assets';
import { usePointerDrag } from './timeline-ui';

export function SegmentTrack({
  placed,
  fps,
  pxPerSec,
  selectedIndex,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onReorder,
}: {
  placed: PlacedEdlSegment[];
  fps: number;
  pxPerSec: number;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onDragStart: () => void;
  onDragMove: (index: number, field: 'srcStart' | 'srcEnd', deltaSec: number) => void;
  onDragEnd: () => void;
  /** VE.2.4: drag a block body to a new index (reorder). */
  onReorder?: (from: number, to: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [reorder, setReorder] = useState<{ from: number; over: number } | null>(null);

  // map a pointer clientX → an insertion ordinal among the blocks (count of blocks left of it)
  const xToOrdinal = (clientX: number): number => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = clientX - rect.left;
    let ord = 0;
    for (const seg of placed) {
      const mid = (seg.from / fps) * pxPerSec + ((seg.durationInFrames / fps) * pxPerSec) / 2;
      if (x > mid) ord++;
    }
    return Math.min(ord, placed.length - 1);
  };

  const startReorder = (from: number, e: React.PointerEvent) => {
    if (!onReorder) return;
    const startX = e.clientX;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - startX) > 4) moved = true;
      if (moved) setReorder({ from, over: xToOrdinal(ev.clientX) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const to = moved ? xToOrdinal(ev.clientX) : from;
      setReorder(null);
      if (moved && to !== from) onReorder(from, to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // drop indicator x = the left edge of the block currently at the `over` ordinal (or the tail end)
  const dropX =
    reorder &&
    (placed[reorder.over]
      ? (placed[reorder.over]!.from / fps) * pxPerSec
      : ((placed[placed.length - 1]!.from + placed[placed.length - 1]!.durationInFrames) / fps) * pxPerSec);

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      {placed.map((seg) => (
        <SegmentBlock
          key={`${seg.id}-${seg.index}`}
          seg={seg}
          fps={fps}
          pxPerSec={pxPerSec}
          isSelected={selectedIndex === seg.index}
          isReordering={reorder?.from === seg.index}
          onSelect={onSelect}
          onBodyDown={onReorder ? startReorder : undefined}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
        />
      ))}
      {reorder && dropX != null && (
        <div
          data-testid="ft-seg-drop-indicator"
          aria-hidden
          style={{ position: 'absolute', left: dropX, top: 2, width: 2, height: 38, background: 'var(--accent)', zIndex: 6, pointerEvents: 'none' }}
        />
      )}
    </div>
  );
}

function SegmentBlock({
  seg,
  fps,
  pxPerSec,
  isSelected,
  isReordering,
  onSelect,
  onBodyDown,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  seg: PlacedEdlSegment;
  fps: number;
  pxPerSec: number;
  isSelected: boolean;
  isReordering?: boolean;
  onSelect: (index: number) => void;
  onBodyDown?: (index: number, e: React.PointerEvent) => void;
  onDragStart: () => void;
  onDragMove: (index: number, field: 'srcStart' | 'srcEnd', deltaSec: number) => void;
  onDragEnd: () => void;
}) {
  const start = () => {
    onSelect(seg.index);
    onDragStart();
  };
  const left = usePointerDrag({
    onStart: start,
    onMove: (dx) => onDragMove(seg.index, 'srcStart', dx / pxPerSec),
    onEnd: onDragEnd,
  });
  const right = usePointerDrag({
    onStart: start,
    onMove: (dx) => onDragMove(seg.index, 'srcEnd', dx / pxPerSec),
    onEnd: onDragEnd,
  });

  const x = (seg.from / fps) * pxPerSec;
  const w = Math.max(14, (seg.durationInFrames / fps) * pxPerSec);
  const durSec = seg.srcEnd - seg.srcStart;
  // VE.3.4: a per-segment src (b-roll cutaway) shows its filename; a-roll clips show their id.
  const label = seg.src ? assetBasename(seg.src) : seg.id;
  // VE.4: the incoming-edge transition glyph (index 0 has no incoming edge; absent ⇒ house dissolve).
  const TKIND_GLYPH: Record<string, string> = { cut: '│', dissolve: '⊿', fade: '◑', slide: '↦', wipe: '▤' };
  const tGlyph = seg.index === 0 ? null : TKIND_GLYPH[seg.transition?.kind ?? 'dissolve'];

  return (
    <div
      data-testid="ft-segment"
      data-segment={seg.id}
      title={`${seg.id} · src ${seg.srcStart.toFixed(2)}s → ${seg.srcEnd.toFixed(2)}s (${durSec.toFixed(2)}s)`}
      onPointerDown={(e) => {
        // body grab (not the edge handles, which stopPropagation) = reorder drag
        if (onBodyDown && e.button === 0) onBodyDown(seg.index, e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(seg.index);
      }}
      style={{
        position: 'absolute',
        left: x,
        top: 6,
        width: w,
        height: 30,
        background: 'linear-gradient(180deg, var(--surface-2) 0%, var(--surface-1) 100%)',
        border: `1px solid ${isSelected ? 'var(--secondary)' : 'var(--hairline)'}`,
        boxShadow: isSelected ? '0 0 0 1px var(--secondary)' : 'none',
        borderRadius: 5,
        color: 'var(--secondary)',
        fontSize: 10.5,
        fontWeight: 600,
        lineHeight: '28px',
        paddingLeft: 10,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        cursor: onBodyDown ? 'grab' : 'pointer',
        opacity: isReordering ? 0.5 : 1,
        zIndex: isSelected ? 5 : 2,
      }}
    >
      ▣ {label}
      <span className="mono" style={{ color: 'var(--muted)', marginLeft: 8 }}>
        {durSec.toFixed(2)}s
      </span>
      {tGlyph && (
        <span
          data-testid="ft-seg-transition-badge"
          title={`incoming transition: ${seg.transition?.kind ?? 'dissolve (default)'}`}
          style={{
            position: 'absolute',
            left: 1,
            top: 1,
            fontSize: 9,
            lineHeight: '12px',
            color: 'var(--accent)',
            background: 'var(--surface-1)',
            borderRadius: 2,
            padding: '0 2px',
            pointerEvents: 'none',
            zIndex: 4,
          }}
        >
          {tGlyph}
        </span>
      )}
      <span data-testid="ft-seg-edge-start" onPointerDown={left.onPointerDown} style={edgeStyle('left')} aria-hidden />
      <span data-testid="ft-seg-edge-end" onPointerDown={right.onPointerDown} style={edgeStyle('right')} aria-hidden />
    </div>
  );
}

function edgeStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    [side]: 0,
    top: 0,
    width: 8,
    height: '100%',
    cursor: 'ew-resize',
    zIndex: 3,
    borderRight: side === 'left' ? '1px solid var(--hairline)' : 'none',
    borderLeft: side === 'right' ? '1px solid var(--hairline)' : 'none',
  };
}
