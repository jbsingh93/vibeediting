/**
 * components/finetune/Inspector.tsx — UIP4: the selection inspector. For scene blocks (and the
 * props root) the form is LITERALLY generated from the comp's Zod schema (lib/schema-form) —
 * the "truthful editor" rule: only schema-expressible edits get a control. Words,
 * segments and audio tracks get small purpose-built panels.
 */
import React from 'react';
import type { FormField, JsonSchemaNode } from '../../lib/schema-form';
import { getAtPath, schemaToFields, setAtPath } from '../../lib/schema-form';
import type { AudioTrack, EdlSegment, Effect, RemappedWord, RangeSpan, Transition, TransitionKind } from '../../lib/finetune';
import { addEffect, removeEffect, moveEffect, updateEffect, defaultEffect } from '../../lib/finetune';
import type { AssetInfo } from '../../lib/types';
import { fmtRangeTime } from '../../lib/selection';
import { assetBasename } from '../../lib/assets';
import { fmtGain } from './AudioTracksUI';

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 };
const lab: React.CSSProperties = { color: 'var(--muted)', flex: '0 0 84px', fontSize: 11, fontWeight: 600 };

export function inputStyle(width?: number): React.CSSProperties {
  return {
    background: 'var(--surface-2)',
    color: 'var(--secondary)',
    border: '1px solid var(--hairline)',
    borderRadius: 'var(--radius-sm)',
    padding: '4px 8px',
    fontSize: 12,
    width: width ?? '100%',
    minWidth: 0,
  };
}

export function InspectorShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div data-testid="ft-inspector" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted)' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── range panel (VE.1.3 — the noun the manual verbs + Ask-Editor-Agent act on) ──────────────

export function RangeInspector({
  span,
  onClear,
  toolbar,
  agentField,
}: {
  span: RangeSpan;
  onClear: () => void;
  /** VE.2+ manual verb buttons (split/delete/reorder/insert/transition/effect). */
  toolbar?: React.ReactNode;
  /** VE.6 "Ask Editor Agent" field. */
  agentField?: React.ReactNode;
}) {
  const segWord = `${span.segIndexes.length} segment${span.segIndexes.length === 1 ? '' : 's'}`;
  const wordWord = `${span.wordIds.length} word${span.wordIds.length === 1 ? '' : 's'}`;
  const audWord = `${span.audioTrackIds.length} audio track${span.audioTrackIds.length === 1 ? '' : 's'}`;
  return (
    <InspectorShell title="range">
      <div data-testid="ft-range-window" style={{ fontSize: 16, fontWeight: 700, color: 'var(--secondary)' }}>
        {fmtRangeTime(span.startMs)}–{fmtRangeTime(span.endMs)}
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginLeft: 8 }}>
          {(span.durationMs / 1000).toFixed(2)}s
        </span>
      </div>
      <div data-testid="ft-range-spans" style={{ fontSize: 12, color: 'var(--muted)' }}>
        spans {segWord} · {wordWord} · {audWord}
      </div>
      {span.affectedDocs.length > 0 && (
        <div style={{ ...row, flexWrap: 'wrap', gap: 4 }}>
          {span.affectedDocs.map((d) => (
            <span
              key={d}
              className="mono"
              style={{
                fontSize: 10,
                color: 'var(--muted)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-sm)',
                padding: '1px 6px',
              }}
            >
              {d}
            </span>
          ))}
        </div>
      )}
      {toolbar}
      {agentField}
      <div style={{ color: 'var(--muted)', fontSize: 11 }}>
        drag the ruler to reselect · ← → move ±100 ms · Shift ← → resize end · Esc clears
      </div>
      <button
        data-testid="ft-range-clear"
        onClick={onClear}
        style={{
          alignSelf: 'flex-start',
          background: 'transparent',
          color: 'var(--muted)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-sm)',
          padding: '3px 10px',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        clear range
      </button>
    </InspectorShell>
  );
}

// ── word panel (UIP4.1) ─────────────────────────────────────────────────────────

export function WordInspector({
  word,
  emphasized,
  onText,
  onTime,
  onEmphasis,
}: {
  word: RemappedWord;
  emphasized: boolean;
  onText: (text: string) => void;
  onTime: (field: 'startMs' | 'endMs', valueMs: number) => void;
  onEmphasis: () => void;
}) {
  return (
    <InspectorShell title={`word "${word.text.trim()}"`}>
      <label style={row}>
        <span style={lab}>text</span>
        <input data-testid="ft-word-text" style={inputStyle()} value={word.text} onChange={(e) => onText(e.target.value)} />
      </label>
      <label style={row}>
        <span style={lab}>start (s)</span>
        <input
          data-testid="ft-word-start"
          type="number"
          step={0.01}
          style={inputStyle(90)}
          value={(word.startMs / 1000).toFixed(2)}
          onChange={(e) => onTime('startMs', Math.round(parseFloat(e.target.value) * 1000))}
        />
      </label>
      <label style={row}>
        <span style={lab}>end (s)</span>
        <input
          data-testid="ft-word-end"
          type="number"
          step={0.01}
          style={inputStyle(90)}
          value={(word.endMs / 1000).toFixed(2)}
          onChange={(e) => onTime('endMs', Math.round(parseFloat(e.target.value) * 1000))}
        />
      </label>
      <label style={{ ...row, cursor: 'pointer' }}>
        <span style={lab}>emphasis</span>
        <input data-testid="ft-word-emphasis" type="checkbox" checked={emphasized} onChange={onEmphasis} />
        <span style={{ color: emphasized ? 'var(--accent)' : 'var(--muted)', fontSize: 11 }}>
          {emphasized ? 'brand-yellow' : 'off'}
        </span>
      </label>
      <div style={{ color: 'var(--muted)', fontSize: 11 }}>← → nudge ±10 ms · Shift ±100 ms · double-click chip = emphasis</div>
    </InspectorShell>
  );
}

// ── segment panel (UIP4.3 + VE.2 verbs) ─────────────────────────────────────────

/** Small verb button for the structural-edit toolbar (split/reorder/delete). */
export function VerbBtn({
  children,
  onClick,
  disabled,
  title,
  testid,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  testid?: string;
  danger?: boolean;
}) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: 'transparent',
        border: `1px solid ${danger && !disabled ? 'var(--danger, #c0392b)' : 'var(--hairline)'}`,
        borderRadius: 'var(--radius-sm)',
        color: disabled ? 'var(--hairline)' : danger ? 'var(--danger, #c0392b)' : 'var(--secondary)',
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 8px',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ── per-clip effects stack (VE.5.4 — add/remove/reorder transform/opacity/speed/colorCorrect) ──

const fxMiniBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--hairline)',
  borderRadius: 4,
  color: 'var(--secondary)',
  fontSize: 10,
  padding: '1px 6px',
  cursor: 'pointer',
  lineHeight: 1.4,
};

const FX_ADD: { type: Exclude<Effect['type'], 'lut'>; label: string }[] = [
  { type: 'transform', label: '+ transform' },
  { type: 'opacity', label: '+ opacity' },
  { type: 'speed', label: '+ speed' },
  { type: 'colorCorrect', label: '+ color' },
];

const FX_TITLE: Record<Effect['type'], string> = {
  transform: 'transform',
  opacity: 'opacity',
  speed: 'speed',
  colorCorrect: 'color',
  lut: 'LUT',
};

function FxNum({
  testid,
  label,
  value,
  step,
  min,
  onChange,
}: {
  testid: string;
  label: string;
  value: number;
  step: number;
  min?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={row}>
      <span style={lab}>{label}</span>
      <input
        data-testid={testid}
        type="number"
        step={step}
        min={min}
        style={inputStyle(80)}
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
}

function EffectControls({ effect, onPatch }: { effect: Effect; onPatch: (patch: Record<string, number>) => void }) {
  switch (effect.type) {
    case 'transform':
      return (
        <>
          <FxNum testid="ft-seg-fx-scale" label="scale" value={effect.scale ?? 1} step={0.05} min={0.01} onChange={(v) => onPatch({ scale: v })} />
          <FxNum testid="ft-seg-fx-x" label="x (px)" value={effect.x ?? 0} step={10} onChange={(v) => onPatch({ x: v })} />
          <FxNum testid="ft-seg-fx-y" label="y (px)" value={effect.y ?? 0} step={10} onChange={(v) => onPatch({ y: v })} />
        </>
      );
    case 'opacity':
      return (
        <FxNum
          testid="ft-seg-fx-opacity"
          label="value"
          value={effect.value}
          step={0.05}
          min={0}
          onChange={(v) => onPatch({ value: Math.max(0, Math.min(1, v)) })}
        />
      );
    case 'speed':
      return <FxNum testid="ft-seg-fx-speed" label="rate" value={effect.rate} step={0.25} min={0.05} onChange={(v) => onPatch({ rate: Math.max(0.05, v) })} />;
    case 'colorCorrect':
      return (
        <>
          <FxNum testid="ft-seg-fx-brightness" label="brightness" value={effect.brightness ?? 1} step={0.05} min={0} onChange={(v) => onPatch({ brightness: Math.max(0, v) })} />
          <FxNum testid="ft-seg-fx-contrast" label="contrast" value={effect.contrast ?? 1} step={0.05} min={0} onChange={(v) => onPatch({ contrast: Math.max(0, v) })} />
          <FxNum testid="ft-seg-fx-saturation" label="saturation" value={effect.saturation ?? 1} step={0.05} min={0} onChange={(v) => onPatch({ saturation: Math.max(0, v) })} />
        </>
      );
    case 'lut':
      return <div style={{ color: 'var(--muted)', fontSize: 11 }}>.cube LUT ships post-launch (VE.5.6)</div>;
  }
}

/** The effects sub-panel: an ordered, editable stack of per-clip effects (VE.5.4). */
export function EffectsPanel({ effects, onSetEffects }: { effects?: Effect[]; onSetEffects: (effects: Effect[] | undefined) => void }) {
  const stack = effects ?? [];
  // an empty stack persists as ABSENT (no `effects` key) so backward-compat / round-trip holds.
  const commit = (next: Effect[]) => onSetEffects(next.length > 0 ? next : undefined);
  return (
    <div data-testid="ft-seg-fx" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ ...row, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{ ...lab, paddingTop: 4 }}>effects</span>
        <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {FX_ADD.map((t) => (
            <button key={t.type} data-testid={`ft-seg-fx-add-${t.type}`} onClick={() => commit(addEffect(effects, defaultEffect(t.type)))} style={fxMiniBtn}>
              {t.label}
            </button>
          ))}
        </span>
      </div>
      {stack.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 11 }}>no effects on this clip</div>}
      {stack.map((e, i) => (
        <div
          key={i}
          data-testid="ft-seg-fx-item"
          data-fx-type={e.type}
          style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}
        >
          <div style={{ ...row, justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--secondary)' }}>{FX_TITLE[e.type]}</span>
            <span style={{ display: 'inline-flex', gap: 4 }}>
              <button data-testid="ft-seg-fx-up" disabled={i === 0} onClick={() => commit(moveEffect(effects, i, i - 1))} style={{ ...fxMiniBtn, opacity: i === 0 ? 0.4 : 1 }} title="Move earlier in the stack">
                ▲
              </button>
              <button data-testid="ft-seg-fx-down" disabled={i === stack.length - 1} onClick={() => commit(moveEffect(effects, i, i + 1))} style={{ ...fxMiniBtn, opacity: i === stack.length - 1 ? 0.4 : 1 }} title="Move later in the stack">
                ▼
              </button>
              <button data-testid="ft-seg-fx-remove" onClick={() => commit(removeEffect(effects, i))} style={fxMiniBtn} title="Remove this effect">
                ✕
              </button>
            </span>
          </div>
          <EffectControls effect={e} onPatch={(patch) => commit(updateEffect(effects, i, patch))} />
        </div>
      ))}
    </div>
  );
}

export function SegmentInspector({
  segment,
  onNudge,
  onSet,
  onSplit,
  onMoveLeft,
  onMoveRight,
  onDelete,
  canMoveLeft,
  canMoveRight,
  canDelete,
  footageAssets,
  srcMissing,
  onSetSrc,
  isFirst,
  crossfadeFrames,
  onSetTransition,
  onSetEffects,
}: {
  segment: EdlSegment;
  onNudge: (field: 'srcStart' | 'srcEnd', deltaSec: number) => void;
  onSet: (field: 'srcStart' | 'srcEnd', valueSec: number) => void;
  onSplit?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onDelete?: () => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  canDelete?: boolean;
  /** VE.3.4: footage choices to repoint this segment's source (per-segment src). */
  footageAssets?: AssetInfo[];
  /** the segment's resolved source isn't on disk (⚠). */
  srcMissing?: boolean;
  onSetSrc?: (src: string) => void;
  /** VE.4: the first clip has no incoming edge → no transition control. */
  isFirst?: boolean;
  /** the global default overlap (shown when the transition is "default"). */
  crossfadeFrames?: number;
  onSetTransition?: (t: Transition | undefined) => void;
  /** VE.5: edit the clip's ordered per-clip effects stack. */
  onSetEffects?: (effects: Effect[] | undefined) => void;
}) {
  const nudges = (field: 'srcStart' | 'srcEnd') => (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {[-0.05, -0.01, 0.01, 0.05].map((d) => (
        <button
          key={d}
          data-testid={`ft-seg-nudge-${field}-${d}`}
          onClick={() => onNudge(field, d)}
          style={{
            background: 'transparent',
            border: '1px solid var(--hairline)',
            borderRadius: 4,
            color: 'var(--secondary)',
            fontSize: 10,
            padding: '2px 5px',
            cursor: 'pointer',
          }}
        >
          {d > 0 ? `+${d}` : d}
        </button>
      ))}
    </span>
  );
  const hasVerbs = onSplit || onMoveLeft || onMoveRight || onDelete;
  return (
    <InspectorShell title={`segment ${segment.id}`}>
      {hasVerbs && (
        <div data-testid="ft-seg-verbs" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {onSplit && (
            <VerbBtn testid="ft-seg-split" onClick={onSplit} title="Split at playhead (S)">
              ✂ Split
            </VerbBtn>
          )}
          {onMoveLeft && (
            <VerbBtn testid="ft-seg-move-left" onClick={onMoveLeft} disabled={!canMoveLeft} title="Move earlier">
              ◀
            </VerbBtn>
          )}
          {onMoveRight && (
            <VerbBtn testid="ft-seg-move-right" onClick={onMoveRight} disabled={!canMoveRight} title="Move later">
              ▶
            </VerbBtn>
          )}
          {onDelete && (
            <VerbBtn testid="ft-seg-delete" onClick={onDelete} disabled={!canDelete} title="Delete + ripple (Del)" danger>
              🗑 Delete
            </VerbBtn>
          )}
        </div>
      )}
      {(segment.src || (footageAssets && footageAssets.length > 0)) && (
        <div style={row}>
          <span style={lab}>source</span>
          {footageAssets && footageAssets.length > 0 && onSetSrc ? (
            <select
              data-testid="ft-seg-src"
              value={segment.src ?? ''}
              onChange={(e) => onSetSrc(e.target.value)}
              style={{ ...inputStyle(), fontSize: 11 }}
            >
              <option value="">(inherit cut source)</option>
              {footageAssets.map((a) => (
                <option key={a.relPath} value={a.relPath.replace(/\\/g, '/').replace(/^public\//, '')}>
                  {assetBasename(a.relPath)}
                </option>
              ))}
            </select>
          ) : (
            <span className="mono" style={{ fontSize: 11, color: 'var(--secondary)' }}>
              {segment.src ? assetBasename(segment.src) : '(inherits cut source)'}
            </span>
          )}
          {srcMissing && (
            <span data-testid="ft-seg-src-missing" title="this source file is not in public/ — the preview shows a placeholder" style={{ color: 'var(--danger, #c0392b)', fontSize: 12 }}>
              ⚠
            </span>
          )}
        </div>
      )}
      <label style={row}>
        <span style={lab}>src start (s)</span>
        <input
          data-testid="ft-seg-start"
          type="number"
          step={0.01}
          style={inputStyle(90)}
          value={segment.srcStart.toFixed(2)}
          onChange={(e) => onSet('srcStart', parseFloat(e.target.value))}
        />
      </label>
      <div style={row}>
        <span style={lab} />
        {nudges('srcStart')}
      </div>
      <label style={row}>
        <span style={lab}>src end (s)</span>
        <input
          data-testid="ft-seg-end"
          type="number"
          step={0.01}
          style={inputStyle(90)}
          value={segment.srcEnd.toFixed(2)}
          onChange={(e) => onSet('srcEnd', parseFloat(e.target.value))}
        />
      </label>
      <div style={row}>
        <span style={lab} />
        {nudges('srcEnd')}
      </div>
      <div className="mono" style={{ color: 'var(--muted)', fontSize: 11 }}>
        keeps {(segment.srcEnd - segment.srcStart).toFixed(2)}s of source
      </div>
      {onSetTransition && !isFirst && (
        <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={row}>
            <span style={lab}>transition</span>
            <select
              data-testid="ft-seg-transition-kind"
              value={segment.transition?.kind ?? 'default'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'default') return onSetTransition(undefined);
                if (v === 'cut') return onSetTransition({ kind: 'cut', durationFrames: 0 });
                const dur = segment.transition?.durationFrames || crossfadeFrames || 8;
                const dir = segment.transition?.direction ?? (v === 'slide' || v === 'wipe' ? 'l' : undefined);
                onSetTransition({ kind: v as TransitionKind, durationFrames: dur, ...(dir ? { direction: dir } : {}) });
              }}
              style={{ ...inputStyle(), fontSize: 11 }}
            >
              <option value="default">default (crossfade {crossfadeFrames ?? 8}f)</option>
              <option value="cut">cut</option>
              <option value="dissolve">dissolve</option>
              <option value="fade">fade</option>
              <option value="slide">slide</option>
              <option value="wipe">wipe</option>
            </select>
          </label>
          {segment.transition && segment.transition.kind !== 'cut' && (
            <label style={row}>
              <span style={lab}>length (f)</span>
              <input
                data-testid="ft-seg-transition-dur"
                type="number"
                min={1}
                step={1}
                style={inputStyle(70)}
                value={segment.transition.durationFrames}
                onChange={(e) => {
                  const n = Math.max(1, Math.round(parseFloat(e.target.value)));
                  if (!Number.isFinite(n)) return;
                  onSetTransition({ ...segment.transition!, durationFrames: n });
                }}
              />
            </label>
          )}
          {segment.transition && (segment.transition.kind === 'slide' || segment.transition.kind === 'wipe') && (
            <label style={row}>
              <span style={lab}>from</span>
              <select
                data-testid="ft-seg-transition-dir"
                value={segment.transition.direction ?? 'l'}
                onChange={(e) => onSetTransition({ ...segment.transition!, direction: e.target.value as 'l' | 'r' | 'u' | 'd' })}
                style={{ ...inputStyle(90), fontSize: 11 }}
              >
                <option value="l">left</option>
                <option value="r">right</option>
                <option value="u">top</option>
                <option value="d">bottom</option>
              </select>
            </label>
          )}
        </div>
      )}
      {onSetEffects && <EffectsPanel effects={segment.effects} onSetEffects={onSetEffects} />}
    </InspectorShell>
  );
}

// ── audio panel (UIP4.2) ────────────────────────────────────────────────────────

export function AudioInspector({
  track,
  onOffset,
  onGain,
  onDuck,
  onRemove,
}: {
  track: AudioTrack;
  onOffset: (valueSec: number) => void;
  onGain: (gainDb: number) => void;
  onDuck: (depth: number | null) => void;
  onRemove: () => void;
}) {
  const duckValue = track.duck ? String(track.duck.depth) : 'off';
  return (
    <InspectorShell title={`${track.role.toUpperCase()} · ${track.src.split('/').pop()}`}>
      <div className="mono" style={{ color: 'var(--muted)', fontSize: 11, overflowWrap: 'anywhere' }}>{track.src}</div>
      <label style={row}>
        <span style={lab}>offset (s)</span>
        <input
          data-testid="ft-audio-offset"
          type="number"
          step={0.05}
          min={0}
          style={inputStyle(90)}
          value={track.offsetSec.toFixed(2)}
          onChange={(e) => onOffset(parseFloat(e.target.value))}
        />
      </label>
      <label style={row}>
        <span style={lab}>gain</span>
        <input
          data-testid="ft-audio-gain"
          type="range"
          min={-36}
          max={12}
          step={1}
          value={track.gainDb}
          onChange={(e) => onGain(parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
        <span className="mono" style={{ fontSize: 11, width: 52, textAlign: 'right' }}>{fmtGain(track.gainDb)}</span>
      </label>
      <label style={row}>
        <span style={lab}>duck by voice</span>
        <select
          data-testid="ft-audio-duck"
          value={duckValue}
          onChange={(e) => onDuck(e.target.value === 'off' ? null : parseFloat(e.target.value))}
          style={inputStyle(120)}
        >
          <option value="off">off</option>
          <option value="0.12">hard 0.12 (house)</option>
          <option value="0.25">medium 0.25</option>
          <option value="0.5">light 0.5</option>
        </select>
      </label>
      <button
        data-testid="ft-audio-remove"
        onClick={onRemove}
        style={{
          background: 'transparent',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--danger)',
          fontSize: 11,
          padding: '4px 10px',
          cursor: 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        ✕ remove track
      </button>
    </InspectorShell>
  );
}

// ── schema-generated form (UIP4.3) ──────────────────────────────────────────────

export function SchemaForm({
  schema,
  value,
  onChange,
  testidPrefix,
}: {
  schema: JsonSchemaNode;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  testidPrefix: string;
}) {
  const fields = schemaToFields(schema);
  if (fields.length === 0) return <div style={{ color: 'var(--muted)', fontSize: 12 }}>Nothing schema-editable here.</div>;
  return (
    <div data-testid={`${testidPrefix}-form`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {fields.map((f) => (
        <SchemaField
          key={f.path}
          field={f}
          value={getAtPath(value, f.path)}
          onChange={(v) => onChange(setAtPath(value, f.path, v))}
          testid={`${testidPrefix}-${f.path.replace(/\./g, '-')}`}
        />
      ))}
    </div>
  );
}

function SchemaField({
  field,
  value,
  onChange,
  testid,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  testid: string;
}) {
  switch (field.kind) {
    case 'number':
      return (
        <label style={row}>
          <span style={lab}>{field.label}</span>
          <input
            data-testid={testid}
            type="number"
            step={0.1}
            min={field.min}
            max={field.max}
            style={inputStyle(100)}
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n)) onChange(n);
            }}
          />
        </label>
      );
    case 'text':
      return (
        <label style={row}>
          <span style={lab}>{field.label}</span>
          <input
            data-testid={testid}
            style={inputStyle()}
            value={typeof value === 'string' ? value : ''}
            placeholder={typeof field.default === 'string' ? field.default : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
    case 'boolean':
      return (
        <label style={{ ...row, cursor: 'pointer' }}>
          <span style={lab}>{field.label}</span>
          <input data-testid={testid} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        </label>
      );
    case 'select':
      return (
        <label style={row}>
          <span style={lab}>{field.label}</span>
          <select
            data-testid={testid}
            style={inputStyle(130)}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          >
            {(field.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      );
    case 'tags': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <label style={{ ...row, alignItems: 'flex-start' }}>
          <span style={{ ...lab, paddingTop: 5 }}>{field.label}</span>
          <textarea
            data-testid={testid}
            rows={2}
            style={{ ...inputStyle(), fontFamily: 'JetBrains Mono, monospace', fontSize: 11, resize: 'vertical' }}
            value={arr.join(', ')}
            onChange={(e) =>
              onChange(
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>
      );
    }
  }
}
