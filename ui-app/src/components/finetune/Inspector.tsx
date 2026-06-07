/**
 * components/finetune/Inspector.tsx — UIP4: the selection inspector. For scene blocks (and the
 * props root) the form is LITERALLY generated from the comp's Zod schema (lib/schema-form) —
 * the "truthful editor" rule: only schema-expressible edits get a control. Words,
 * segments and audio tracks get small purpose-built panels.
 */
import React from 'react';
import type { FormField, JsonSchemaNode } from '../../lib/schema-form';
import { getAtPath, schemaToFields, setAtPath } from '../../lib/schema-form';
import type { AudioTrack, EdlSegment, RemappedWord } from '../../lib/finetune';
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

// ── segment panel (UIP4.3) ──────────────────────────────────────────────────────

export function SegmentInspector({
  segment,
  onNudge,
  onSet,
}: {
  segment: EdlSegment;
  onNudge: (field: 'srcStart' | 'srcEnd', deltaSec: number) => void;
  onSet: (field: 'srcStart' | 'srcEnd', valueSec: number) => void;
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
  return (
    <InspectorShell title={`segment ${segment.id}`}>
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
