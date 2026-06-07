/**
 * components/finetune/SceneTrack.tsx — UIP4.3: the scene-block track for Zod-props comps.
 * Blocks come from the props' array-of-objects field (scenes[] / beats[]):
 *   - sequential blocks (durationSec, no startSec): laid end-to-end; right-edge drag = duration;
 *     reorder via the inspector's ◀ ▶ (also exposed here on the selected block).
 *   - absolute blocks (startSec + durationSec): positioned at startSec; body drag = move,
 *     right-edge drag = duration.
 * The selected block's inspector form is generated from the item's Zod schema (lib/schema-form).
 */
import React from 'react';
import { usePointerDrag } from './timeline-ui';

export interface SceneBlockInfo {
  index: number;
  label: string;
  startSec: number;
  durationSec: number;
  absolute: boolean; // has its own startSec field
}

/** Derive blocks from an array-of-objects prop value (pure → unit-tested). */
export function sceneBlocks(items: Record<string, unknown>[]): SceneBlockInfo[] {
  let cursor = 0;
  return items.map((it, index) => {
    const absolute = typeof it.startSec === 'number';
    const durationSec = typeof it.durationSec === 'number' ? it.durationSec : 1;
    const startSec = absolute ? (it.startSec as number) : cursor;
    if (!absolute) cursor += durationSec;
    const label =
      (typeof it.name === 'string' && it.name) ||
      (typeof it.id === 'string' && it.id) ||
      (typeof it.kind === 'string' && it.kind) ||
      `#${index + 1}`;
    return { index, label, startSec, durationSec, absolute };
  });
}

export function SceneTrack({
  blocks,
  pxPerSec,
  selectedIndex,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  blocks: SceneBlockInfo[];
  pxPerSec: number;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onDragStart: () => void;
  onDragMove: (index: number, field: 'startSec' | 'durationSec', deltaSec: number) => void;
  onDragEnd: () => void;
}) {
  return (
    <>
      {blocks.map((b) => (
        <SceneBlock
          key={b.index}
          block={b}
          pxPerSec={pxPerSec}
          isSelected={selectedIndex === b.index}
          onSelect={onSelect}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
        />
      ))}
    </>
  );
}

function SceneBlock({
  block,
  pxPerSec,
  isSelected,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  block: SceneBlockInfo;
  pxPerSec: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
  onDragStart: () => void;
  onDragMove: (index: number, field: 'startSec' | 'durationSec', deltaSec: number) => void;
  onDragEnd: () => void;
}) {
  const start = () => {
    onSelect(block.index);
    onDragStart();
  };
  const body = usePointerDrag({
    onStart: start,
    onMove: (dx) => {
      if (block.absolute) onDragMove(block.index, 'startSec', dx / pxPerSec);
    },
    onEnd: onDragEnd,
  });
  const right = usePointerDrag({
    onStart: start,
    onMove: (dx) => onDragMove(block.index, 'durationSec', dx / pxPerSec),
    onEnd: onDragEnd,
  });

  return (
    <div
      data-testid="ft-scene"
      data-scene={block.label}
      title={`${block.label} · ${block.startSec.toFixed(2)}s + ${block.durationSec.toFixed(2)}s`}
      onPointerDown={block.absolute ? body.onPointerDown : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.index);
      }}
      style={{
        position: 'absolute',
        left: block.startSec * pxPerSec,
        top: 6,
        width: Math.max(14, block.durationSec * pxPerSec),
        height: 30,
        background: 'linear-gradient(180deg, #1d2430 0%, #161b24 100%)',
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
        cursor: block.absolute ? 'grab' : 'pointer',
        zIndex: isSelected ? 5 : 2,
      }}
    >
      ◇ {block.label}
      <span className="mono" style={{ color: 'var(--muted)', marginLeft: 8 }}>
        {block.durationSec.toFixed(2)}s
      </span>
      <span data-testid="ft-scene-edge-end" onPointerDown={right.onPointerDown} style={edge} aria-hidden />
    </div>
  );
}

const edge: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  top: 0,
  width: 8,
  height: '100%',
  cursor: 'ew-resize',
  zIndex: 3,
  borderLeft: '1px solid var(--hairline)',
};
