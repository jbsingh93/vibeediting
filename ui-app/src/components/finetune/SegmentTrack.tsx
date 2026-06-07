/**
 * components/finetune/SegmentTrack.tsx — UIP4.3: the EDL segment-block track. Blocks sit on the
 * OUTPUT timeline (placement derives from srcStart/srcEnd); dragging an edge nudges that source
 * boundary and the whole tail re-places live — exactly what changing segments.json does to the
 * comp. Body click selects (numeric nudge lives in the inspector).
 */
import React from 'react';
import type { PlacedEdlSegment } from '../../lib/finetune';
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
}: {
  placed: PlacedEdlSegment[];
  fps: number;
  pxPerSec: number;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onDragStart: () => void;
  onDragMove: (index: number, field: 'srcStart' | 'srcEnd', deltaSec: number) => void;
  onDragEnd: () => void;
}) {
  return (
    <>
      {placed.map((seg) => (
        <SegmentBlock
          key={`${seg.id}-${seg.index}`}
          seg={seg}
          fps={fps}
          pxPerSec={pxPerSec}
          isSelected={selectedIndex === seg.index}
          onSelect={onSelect}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
        />
      ))}
    </>
  );
}

function SegmentBlock({
  seg,
  fps,
  pxPerSec,
  isSelected,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  seg: PlacedEdlSegment;
  fps: number;
  pxPerSec: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
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

  return (
    <div
      data-testid="ft-segment"
      data-segment={seg.id}
      title={`${seg.id} · src ${seg.srcStart.toFixed(2)}s → ${seg.srcEnd.toFixed(2)}s (${durSec.toFixed(2)}s)`}
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
        cursor: 'pointer',
        zIndex: isSelected ? 5 : 2,
      }}
    >
      ▣ {seg.id}
      <span className="mono" style={{ color: 'var(--muted)', marginLeft: 8 }}>
        {durSec.toFixed(2)}s
      </span>
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
