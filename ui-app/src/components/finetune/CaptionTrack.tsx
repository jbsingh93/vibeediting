/**
 * components/finetune/CaptionTrack.tsx — UIP4.1: the TXT track. Whisper words as draggable
 * chips on the OUTPUT timeline (EDL projects show the remapped words; the parent inverse-maps
 * edits back to source time). Drag the body = shift start/end together; drag an edge = move
 * that boundary; double-click = toggle emphasis (renders brand-yellow, exactly like the comp).
 */
import React from 'react';
import type { RemappedWord } from '../../lib/finetune';
import { isEmphasized } from '../../lib/finetune';
import { msToX, xToMs } from '../../lib/finetune';
import { usePointerDrag } from './timeline-ui';

export type ChipEditKind = 'move' | 'resize-start' | 'resize-end';

export interface ChipId {
  capKey: string;
  srcIndex: number;
}

export const sameChip = (a: ChipId | null, b: ChipId): boolean =>
  a !== null && a.capKey === b.capKey && a.srcIndex === b.srcIndex;

export function CaptionTrack({
  chips,
  pxPerSec,
  emphasis,
  selected,
  onSelect,
  onToggleEmphasis,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  chips: RemappedWord[];
  pxPerSec: number;
  emphasis: string[];
  selected: ChipId | null;
  onSelect: (chip: ChipId) => void;
  onToggleEmphasis: (chip: RemappedWord) => void;
  onDragStart: () => void;
  onDragMove: (chip: ChipId, kind: ChipEditKind, deltaMs: number) => void;
  onDragEnd: () => void;
}) {
  return (
    <>
      {chips.map((c) => (
        <Chip
          key={`${c.capKey}:${c.srcIndex}`}
          chip={c}
          pxPerSec={pxPerSec}
          emphasized={isEmphasized(emphasis, c.text)}
          isSelected={sameChip(selected, c)}
          onSelect={onSelect}
          onToggleEmphasis={onToggleEmphasis}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
        />
      ))}
    </>
  );
}

function Chip({
  chip,
  pxPerSec,
  emphasized,
  isSelected,
  onSelect,
  onToggleEmphasis,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  chip: RemappedWord;
  pxPerSec: number;
  emphasized: boolean;
  isSelected: boolean;
  onSelect: (chip: ChipId) => void;
  onToggleEmphasis: (chip: RemappedWord) => void;
  onDragStart: () => void;
  onDragMove: (chip: ChipId, kind: ChipEditKind, deltaMs: number) => void;
  onDragEnd: () => void;
}) {
  const id: ChipId = { capKey: chip.capKey, srcIndex: chip.srcIndex };

  const start = () => {
    onSelect(id);
    onDragStart();
  };
  const body = usePointerDrag({
    onStart: start,
    onMove: (dx) => onDragMove(id, 'move', xToMs(dx, pxPerSec)),
    onEnd: onDragEnd,
  });
  const left = usePointerDrag({
    onStart: start,
    onMove: (dx) => onDragMove(id, 'resize-start', xToMs(dx, pxPerSec)),
    onEnd: onDragEnd,
  });
  const right = usePointerDrag({
    onStart: start,
    onMove: (dx) => onDragMove(id, 'resize-end', xToMs(dx, pxPerSec)),
    onEnd: onDragEnd,
  });

  const x = msToX(chip.startMs, pxPerSec);
  const w = Math.max(10, msToX(chip.endMs - chip.startMs, pxPerSec));

  return (
    <div
      data-testid="ft-chip"
      data-chip={`${chip.capKey}:${chip.srcIndex}`}
      data-word={chip.text}
      title={`"${chip.text}" · ${(chip.startMs / 1000).toFixed(2)}s → ${(chip.endMs / 1000).toFixed(2)}s${emphasized ? ' · emphasis' : ''}`}
      onPointerDown={body.onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onToggleEmphasis(chip);
      }}
      style={{
        position: 'absolute',
        left: x,
        top: 7,
        width: w,
        height: 26,
        background: emphasized ? 'rgba(255,230,0,0.14)' : 'var(--surface-2)',
        border: `1px solid ${isSelected ? 'var(--secondary)' : emphasized ? 'rgba(255,230,0,0.55)' : 'var(--hairline)'}`,
        boxShadow: isSelected ? '0 0 0 1px var(--secondary)' : 'none',
        borderRadius: 5,
        color: emphasized ? 'var(--accent)' : 'var(--secondary)',
        fontSize: 11,
        fontWeight: emphasized ? 800 : 600,
        lineHeight: '24px',
        textAlign: 'center',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'clip',
        cursor: 'grab',
        userSelect: 'none',
        zIndex: isSelected ? 5 : 2,
      }}
    >
      {chip.text.trim()}
      <span
        data-testid="ft-chip-edge-start"
        onPointerDown={left.onPointerDown}
        style={edgeStyle('left')}
        aria-hidden
      />
      <span
        data-testid="ft-chip-edge-end"
        onPointerDown={right.onPointerDown}
        style={edgeStyle('right')}
        aria-hidden
      />
    </div>
  );
}

function edgeStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    [side]: 0,
    top: 0,
    width: 7,
    height: '100%',
    cursor: 'ew-resize',
    zIndex: 3,
  };
}
