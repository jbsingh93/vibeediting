/**
 * UIP2.1 — the new-project wizard (doc 04 §0a–0d): ① format → ② style → ③ brief (with the
 * tone check) → ④ assets → Create project (POST /api/projects) → stash the agent kickoff → land
 * in the cockpit at the plan gate. Pure model/validation lives in lib/wizard.ts (unit-tested).
 *
 * D23: step 2 (Style) fetches GET /api/styles at mount — builtin styles + the user's own template
 * styles — and renders that list instead of a hard-coded set.
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import {
  FORMATS,
  PLATFORMS,
  emptyWizard,
  slugify,
  validateWizard,
  buildCreateBody,
  kickoffMessage,
  stashKickoff,
  type WizardState,
  type FormatId,
  type Platform,
  type StyleInfo,
} from '../lib/wizard';

const STEPS = ['Format', 'Style', 'Brief', 'Assets'] as const;

export function Wizard() {
  const [step, setStep] = useState(0);
  const [s, setS] = useState<WizardState>(emptyWizard);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const patch = (p: Partial<WizardState>) => setS((prev) => ({ ...prev, ...p }));
  const errors = validateWizard(s);
  const stepValid =
    step === 0 ? s.format !== null : step === 2 ? !errors.some((e) => /name|duration/.test(e)) : true;

  async function create() {
    const remaining = validateWizard(s);
    if (remaining.length > 0) {
      setErr(remaining[0] ?? 'fix the highlighted fields');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const body = buildCreateBody(s);
      await api.createProject(body);
      stashKickoff(body.project_id, kickoffMessage(s));
      location.hash = `#/project/${encodeURIComponent(body.project_id)}`;
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 28px 64px' }} data-testid="wizard">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ fontSize: 31, fontWeight: 700, margin: 0 }}>New video</h1>
        <a href="#/" style={{ color: 'var(--muted)', fontSize: 14, fontWeight: 600 }}>
          ✕ cancel
        </a>
      </header>

      {/* step indicator */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 26, flexWrap: 'wrap' }} data-testid="wizard-steps">
        {STEPS.map((label, i) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              data-step={i}
              data-active={i === step ? 'true' : 'false'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 700,
                // accent is reserved for the ONE action per view (Next/Create) — the active
                // step is marked by border + text weight, not the accent fill.
                color: i === step ? 'var(--secondary)' : i < step ? 'var(--success)' : 'var(--muted)',
                background: i === step ? 'var(--surface-2)' : 'var(--surface-1)',
                border: i === step ? '1px solid var(--secondary)' : '1px solid var(--hairline)',
              }}
            >
              {i < step ? '✓' : `${i + 1}`} {label}
            </span>
            {i < STEPS.length - 1 && <span style={{ color: 'var(--hairline)' }}>─</span>}
          </span>
        ))}
      </div>

      {step === 0 && <StepFormat s={s} onPick={(format) => patch({ format })} />}
      {step === 1 && <StepStyle s={s} onPick={(style) => patch({ style })} />}
      {step === 2 && <StepBrief s={s} patch={patch} />}
      {step === 3 && <StepAssets s={s} patch={patch} />}

      {err && (
        <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 14 }} data-testid="wizard-error">
          ✕ {err}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
        <button onClick={() => setStep((v) => Math.max(0, v - 1))} disabled={step === 0 || busy} style={ghostBtn}>
          ◀ Back
        </button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep((v) => v + 1)} disabled={!stepValid} data-testid="wizard-next" style={primaryBtn}>
            Next ▶
          </button>
        ) : (
          <button onClick={create} disabled={busy || errors.length > 0} data-testid="wizard-create" title={errors[0]} style={primaryBtn}>
            {busy ? 'Creating…' : '▸ Create project'}
          </button>
        )}
      </div>
    </div>
  );
}

function StepFormat({ s, onPick }: { s: WizardState; onPick: (f: FormatId) => void }) {
  return (
    <div>
      <h2 style={h2}>What are we making?</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {FORMATS.map((f) => (
          <button
            key={f.id}
            onClick={() => onPick(f.id)}
            data-format={f.id}
            aria-pressed={s.format === f.id}
            style={{
              ...cardBtn,
              borderColor: s.format === f.id ? 'var(--accent)' : 'var(--hairline)',
              background: s.format === f.id ? 'color-mix(in srgb, var(--accent) 8%, var(--surface-1))' : 'var(--surface-1)',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14 }}>{f.label}</div>
            <div className="mono" style={{ color: 'var(--muted)', fontSize: 11, marginTop: 6 }}>{f.hint}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * D23 — step 2 fetches the style catalogue (builtin + the user's own template styles). Styles that
 * declare `formats` only appear when they match the chosen format (or no format is chosen yet). The
 * default selection is the FIRST style the server returns.
 */
function StepStyle({ s, onPick }: { s: WizardState; onPick: (id: string) => void }) {
  const [styles, setStyles] = useState<StyleInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    setStyles(null);
    api
      .styles()
      .then((r) => {
        if (alive) setStyles(r.styles);
      })
      .catch((e) => {
        if (alive) setError(e instanceof ApiError ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const visible = (styles ?? []).filter(
    (st) => !st.formats || st.formats.length === 0 || !s.format || st.formats.includes(s.format),
  );

  // Default selection = the first style in the (filtered) list, the moment one is available and
  // the current pick isn't among the visible options. (Idempotent: once a valid style is selected
  // this re-run is a no-op, so depending on `onPick` / `s.style` does not loop.)
  const selected = s.style;
  useEffect(() => {
    if (styles === null) return;
    const list = styles.filter(
      (st) => !st.formats || st.formats.length === 0 || !s.format || st.formats.includes(s.format),
    );
    const first = list[0];
    if (first && !list.some((st) => st.id === selected)) onPick(first.id);
  }, [styles, s.format, selected, onPick]);

  return (
    <div>
      <h2 style={h2}>Pick a look</h2>

      {error && (
        <div
          data-testid="wizard-styles-error"
          style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}
        >
          <span>✕ Couldn't load styles: {error}</span>
          <button onClick={() => setNonce((n) => n + 1)} style={ghostBtn}>
            ↻ retry
          </button>
        </div>
      )}

      {!error && styles === null && (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading styles…</div>
      )}

      {!error && styles !== null && visible.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>
          No styles match this format yet. Go back and pick a different format, or add a style template.
        </div>
      )}

      {visible.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="wizard-styles">
          {visible.map((st) => (
            <button
              key={st.id}
              onClick={() => onPick(st.id)}
              data-style={st.id}
              aria-pressed={s.style === st.id}
              style={{
                ...cardBtn,
                display: 'flex',
                alignItems: 'baseline',
                gap: 12,
                textAlign: 'left',
                borderColor: s.style === st.id ? 'var(--accent)' : 'var(--hairline)',
                background: s.style === st.id ? 'color-mix(in srgb, var(--accent) 8%, var(--surface-1))' : 'var(--surface-1)',
              }}
            >
              <span aria-hidden style={{ width: 14 }}>{s.style === st.id ? '●' : '○'}</span>
              <span style={{ fontWeight: 700, minWidth: 130 }}>{st.label}</span>
              {st.hint && <span style={{ color: 'var(--muted)', fontSize: 13 }}>{st.hint}</span>}
              {st.source === 'template' && (
                <span
                  data-testid="style-yours-badge"
                  style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--accent)', border: '1px solid var(--hairline)', borderRadius: 999, padding: '1px 8px' }}
                >
                  yours
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StepBrief({ s, patch }: { s: WizardState; patch: (p: Partial<WizardState>) => void }) {
  const slug = slugify(s.name);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={h2}>Tell me about it</h2>
      <Field label="Project name">
        <input value={s.name} onChange={(e) => patch({ name: e.target.value })} placeholder="launch-ad" data-testid="wizard-name" style={inputStyle} />
        {s.name && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
            → projects/{slug || '?'}/
          </span>
        )}
      </Field>
      <Field label="Hook (first 3 s)">
        <input value={s.hook} onChange={(e) => patch({ hook: e.target.value })} placeholder="AI took your job — now what?" data-testid="wizard-hook" style={inputStyle} />
      </Field>
      <Field label="One clear CTA">
        <input value={s.cta} onChange={(e) => patch({ cta: e.target.value })} placeholder="Follow for more" data-testid="wizard-cta" style={inputStyle} />
      </Field>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Field label="Duration (s)">
          <input
            type="number"
            value={s.durationS}
            min={5}
            max={1800}
            onChange={(e) => patch({ durationS: Number(e.target.value) })}
            data-testid="wizard-duration"
            style={{ ...inputStyle, width: 90 }}
          />
        </Field>
        <Field label="Platform">
          <select value={s.platform} onChange={(e) => patch({ platform: e.target.value as Platform })} style={inputStyle}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Language">
          <select value={s.lang} onChange={(e) => patch({ lang: e.target.value as 'da' | 'en' })} style={inputStyle}>
            <option value="en">English</option>
            <option value="da">Dansk</option>
          </select>
        </Field>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', border: '1px dashed var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
        ⓘ tone check: keep the copy in your brand's voice (brand/brand.json).
      </div>
    </div>
  );
}

function StepAssets({ s, patch }: { s: WizardState; patch: (p: Partial<WizardState>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={h2}>Where does the material come from?</h2>
      <Choice
        label="Voiceover"
        value={s.voiceover}
        options={[
          ['generate', 'Generate with your brand voice (set the voice ID on the Brand page)'],
          ['upload', "I'll upload"],
          ['none', 'None'],
        ]}
        onPick={(voiceover) => patch({ voiceover: voiceover as WizardState['voiceover'] })}
      />
      <Choice
        label="Music"
        value={s.music}
        options={[
          ['generate', 'Generate a bed'],
          ['upload', 'Upload'],
          ['none', 'None'],
        ]}
        onPick={(music) => patch({ music: music as WizardState['music'] })}
      />
      <Choice
        label="Footage"
        value={s.footage}
        options={[
          ['upload', 'Upload files (Asset Manager, UI-P3)'],
          ['none', 'None / generated B-roll'],
        ]}
        onPick={(footage) => patch({ footage: footage as WizardState['footage'] })}
      />
      <Field label="Inspiration (optional) — paste a URL to mimic its style">
        <input
          value={s.inspirationUrl}
          onChange={(e) => patch({ inspirationUrl: e.target.value })}
          placeholder="https://…"
          data-testid="wizard-inspiration"
          style={inputStyle}
        />
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>runs acquire + reference-analyze → a style-spec the agent follows</span>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }}>
      {label}
      {children}
    </label>
  );
}

function Choice({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onPick: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 90 }}>{label}</span>
      {options.map(([v, text]) => (
        <button
          key={v}
          onClick={() => onPick(v)}
          aria-pressed={value === v}
          data-choice={`${label.toLowerCase()}-${v}`}
          style={{
            ...cardBtn,
            padding: '7px 12px',
            fontSize: 13,
            borderColor: value === v ? 'var(--accent)' : 'var(--hairline)',
            background: value === v ? 'color-mix(in srgb, var(--accent) 8%, var(--surface-1))' : 'var(--surface-1)',
          }}
        >
          {value === v ? '● ' : '○ '}
          {text}
        </button>
      ))}
    </div>
  );
}

const h2: React.CSSProperties = { fontSize: 20, fontWeight: 700, margin: '0 0 14px' };
const inputStyle: React.CSSProperties = {
  background: 'var(--surface-1)',
  color: 'var(--secondary)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  fontWeight: 400,
  maxWidth: 460,
};
const cardBtn: React.CSSProperties = {
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '14px 12px',
  color: 'var(--secondary)',
  textAlign: 'center',
};
const primaryBtn: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--primary)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  padding: '9px 18px',
  fontWeight: 700,
  fontSize: 14,
};
const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--secondary)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 14px',
  fontWeight: 600,
  fontSize: 14,
};
