/**
 * components/finetune/AudioTracksUI.tsx — UIP4.2: the VO / BGM / SFX rows. Each persisted track
 * (public/<p>/audio-mix.json) renders as a pill at its offset — drag = offsetSec; the inspector
 * edits gain + duck depth. "+ add" pulls from the project's audio assets. The mastering chip is
 * honest: delivery is ALWAYS −14 LUFS / −1 dBTP (loudnorm) — the mix params here feed the duck,
 * they never bypass the master.
 */
import { useState } from 'react';
import type { AssetInfo } from '../../lib/types';
import type { AudioTrack } from '../../lib/finetune';
import { usePointerDrag, TrackRow } from './timeline-ui';

const ROLES: { role: AudioTrack['role']; label: string }[] = [
  { role: 'vo', label: 'VO' },
  { role: 'bgm', label: 'BGM' },
  { role: 'sfx', label: 'SFX' },
];

export function AudioTracksUI({
  tracks,
  width,
  pxPerSec,
  audioAssets,
  srcExists,
  selectedId,
  onSelect,
  onAdd,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  tracks: AudioTrack[];
  width: number;
  pxPerSec: number;
  audioAssets: AssetInfo[];
  srcExists: Record<string, boolean>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (role: AudioTrack['role'], src: string) => void;
  onDragStart: () => void;
  onDragMove: (id: string, deltaSec: number) => void;
  onDragEnd: () => void;
}) {
  return (
    <>
      {ROLES.map(({ role, label }) => (
        <TrackRow
          key={role}
          label={label}
          height={40}
          width={width}
          trailing={<AddTrack role={role} audioAssets={audioAssets} onAdd={onAdd} />}
        >
          {tracks
            .filter((t) => t.role === role)
            .map((t) => (
              <TrackPill
                key={t.id}
                track={t}
                pxPerSec={pxPerSec}
                laneWidth={width}
                missing={srcExists[t.src] !== true}
                isSelected={selectedId === t.id}
                onSelect={onSelect}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
              />
            ))}
        </TrackRow>
      ))}
    </>
  );
}

function TrackPill({
  track,
  pxPerSec,
  laneWidth,
  missing,
  isSelected,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  track: AudioTrack;
  pxPerSec: number;
  laneWidth: number;
  missing: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragStart: () => void;
  onDragMove: (id: string, deltaSec: number) => void;
  onDragEnd: () => void;
}) {
  const drag = usePointerDrag({
    onStart: () => {
      onSelect(track.id);
      onDragStart();
    },
    onMove: (dx) => onDragMove(track.id, dx / pxPerSec),
    onEnd: onDragEnd,
  });
  const name = track.src.split('/').pop() ?? track.src;
  const left = track.offsetSec * pxPerSec;
  // A split clip (durationSec set) is drawn at its true width; a legacy "to-end" track fills the lane.
  const clipWidth = track.durationSec != null ? Math.max(24, track.durationSec * pxPerSec) : Math.max(24, laneWidth - left);
  return (
    <div
      data-testid="ft-audio-pill"
      data-audio={track.id}
      title={`${track.src} · offset ${track.offsetSec.toFixed(2)}s${
        track.durationSec != null ? ` · ${track.durationSec.toFixed(2)}s` : ''
      }${track.srcInSec ? ` · src@${track.srcInSec.toFixed(2)}s` : ''} · ${fmtGain(track.gainDb)}${
        track.duck ? ` · duck ${track.duck.depth}` : ''
      }${missing ? ' · ⚠ file not on disk (not previewed)' : ''}`}
      onPointerDown={drag.onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(track.id);
      }}
      style={{
        position: 'absolute',
        left,
        width: clipWidth,
        boxSizing: 'border-box',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        top: 7,
        height: 26,
        padding: '0 12px',
        background: missing ? 'var(--surface-1)' : 'var(--surface-2)',
        border: `1px solid ${isSelected ? 'var(--secondary)' : 'var(--hairline)'}`,
        boxShadow: isSelected ? '0 0 0 1px var(--secondary)' : 'none',
        borderRadius: 999,
        color: missing ? 'var(--muted)' : 'var(--secondary)',
        fontSize: 11,
        fontWeight: 600,
        lineHeight: '24px',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        cursor: 'grab',
        zIndex: isSelected ? 5 : 2,
      }}
    >
      {missing ? '⚠' : '♪'} {name}
      <span className="mono" style={{ color: 'var(--muted)', marginLeft: 8 }}>
        {fmtGain(track.gainDb)}
        {track.duck ? ' · duck' : ''}
      </span>
    </div>
  );
}

export function fmtGain(gainDb: number): string {
  return `${gainDb > 0 ? '+' : ''}${gainDb.toFixed(0)} dB`;
}

function AddTrack({
  role,
  audioAssets,
  onAdd,
}: {
  role: AudioTrack['role'];
  audioAssets: AssetInfo[];
  onAdd: (role: AudioTrack['role'], src: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (audioAssets.length === 0) return null;
  if (!open) {
    return (
      <button
        data-testid={`ft-audio-add-${role}`}
        onClick={() => setOpen(true)}
        title={`Add a ${role.toUpperCase()} track from the project's audio assets`}
        style={{
          background: 'transparent',
          border: '1px solid var(--hairline)',
          borderRadius: 999,
          color: 'var(--muted)',
          fontSize: 10,
          width: 18,
          height: 18,
          lineHeight: '15px',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        +
      </button>
    );
  }
  return (
    <select
      data-testid={`ft-audio-pick-${role}`}
      autoFocus
      onBlur={() => setOpen(false)}
      onChange={(e) => {
        if (e.target.value) onAdd(role, e.target.value);
        setOpen(false);
      }}
      defaultValue=""
      style={{
        position: 'absolute',
        zIndex: 9,
        background: 'var(--surface-2)',
        color: 'var(--secondary)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 11,
        maxWidth: 180,
      }}
    >
      <option value="" disabled>
        pick audio…
      </option>
      {audioAssets.map((a) => {
        const src = a.relPath.replace(/^public\//, '');
        return (
          <option key={a.relPath} value={src}>
            {a.name}
          </option>
        );
      })}
    </select>
  );
}
