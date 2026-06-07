/**
 * UIP2.1 — the new-project wizard's pure model: options, validation, and the createManifest body +
 * agent kickoff message it produces. Kept free of React so the unit suite can exercise every rule
 * (plan §6T.1 "wizard validation").
 *
 * D23: styles are NO LONGER a static list — the Wizard fetches GET /api/styles (builtin anchors +
 * user-distilled templates). `style` is just a string id on the state; the default is the first
 * item of the fetched list, applied by the screen.
 */
import type { StageName } from './types';

/** Step 1 — format cards (doc 04 §0; maps to the video-editor router table). */
export const FORMATS = [
  { id: '9:16-ad', label: 'Paid ad / reel', hint: '9:16 · ≤60s', vertical: true },
  { id: '16:9-tutorial', label: 'Tutorial / YouTube', hint: '16:9 · 5–30 min', vertical: false },
  { id: 'edit-footage', label: 'Edit my footage', hint: 'cut & caption real footage', vertical: false },
  { id: '16:9-explainer', label: 'Explainer (animated)', hint: '16:9', vertical: false },
  { id: 'screencast-demo', label: 'Screencast / demo', hint: '16:9 · 30fps', vertical: false },
  { id: 'testimonial', label: 'Testimonial / quote', hint: 'card', vertical: false },
  { id: 'data-viz', label: 'Data viz / counter', hint: 'stat', vertical: false },
] as const;
export type FormatId = (typeof FORMATS)[number]['id'];

/** A wizard style option (mirrors src/server/styles-routes.ts StyleInfo). The Wizard fetches these
 *  from GET /api/styles instead of a static list; `source` distinguishes shipped anchors from
 *  user-distilled templates, and `formats` (when present) limits which formats the style fits. */
export interface StyleInfo {
  id: string;
  label: string;
  hint: string;
  source: 'builtin' | 'template';
  formats?: string[];
}

export const PLATFORMS = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook'] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface WizardState {
  name: string;
  format: FormatId | null;
  /** a style id from GET /api/styles (default = the first fetched item, applied by the screen). */
  style: string;
  hook: string;
  cta: string;
  durationS: number;
  platform: Platform;
  lang: 'da' | 'en';
  voiceover: 'generate' | 'upload' | 'none';
  music: 'generate' | 'upload' | 'none';
  footage: 'upload' | 'none';
  inspirationUrl: string;
}

export function emptyWizard(): WizardState {
  return {
    name: '',
    format: null,
    style: '',
    hook: '',
    cta: '',
    durationS: 30,
    platform: 'tiktok',
    lang: 'en',
    voiceover: 'generate',
    music: 'generate',
    footage: 'none',
    inspirationUrl: '',
  };
}

/** Turn a free-text name into the strict lowercase-kebab project id (folder name). */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[æ]/g, 'ae')
    .replace(/[ø]/g, 'oe')
    .replace(/[å]/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** Per-step validation → list of human errors (empty = valid). */
export function validateWizard(s: WizardState): string[] {
  const errors: string[] = [];
  const slug = slugify(s.name);
  if (!s.name.trim()) errors.push('give the project a name');
  else if (!SLUG_RE.test(slug)) errors.push('the name must reduce to at least 2 characters (a–z, 0–9, dashes)');
  if (!s.format) errors.push('pick a format');
  if (!Number.isFinite(s.durationS) || s.durationS < 5 || s.durationS > 1800) {
    errors.push('duration must be between 5 and 1800 seconds');
  }
  if (s.inspirationUrl && !/^https?:\/\/\S+$/i.test(s.inspirationUrl.trim())) {
    errors.push('the inspiration URL must be a full http(s) link');
  }
  return errors;
}

export interface CreateBody {
  project_id: string;
  inputs: Record<string, unknown>;
  approvals_required: StageName[];
  notes: string;
}

/** Build the POST /api/projects body. Plan-gate convention (UIP1.2): plan_gate_stage = motion. */
export function buildCreateBody(s: WizardState): CreateBody {
  return {
    project_id: slugify(s.name),
    inputs: {
      format: s.format,
      style: s.style || undefined,
      hook: s.hook || undefined,
      cta: s.cta || undefined,
      duration_s: s.durationS,
      platform: s.platform,
      lang: s.lang,
      voiceover: s.voiceover,
      music: s.music,
      footage: s.footage,
      inspiration_url: s.inspirationUrl.trim() || undefined,
      plan_gate_stage: 'motion',
    },
    approvals_required: ['motion', 'deliver'],
    notes: 'Brief received — waiting for the agent to plan the scenes.',
  };
}

/** The kickoff message the agent receives right after createManifest (UIP2.1). */
export function kickoffMessage(s: WizardState): string {
  const slug = slugify(s.name);
  const lines = [
    `New project "${slug}" was just created from the JBS Vibe Editing wizard. Plan it and stop at the plan gate.`,
    `Format: ${s.format} · style: ${s.style} · platform: ${s.platform} · language: ${s.lang} · target duration: ${s.durationS}s.`,
  ];
  if (s.hook) lines.push(`Hook (first 3s): ${s.hook}`);
  if (s.cta) lines.push(`CTA: ${s.cta}`);
  lines.push(`Voiceover: ${s.voiceover} · music: ${s.music} · footage: ${s.footage}.`);
  if (s.inspirationUrl.trim()) lines.push(`Inspiration to mimic (acquire + reference-analyze): ${s.inspirationUrl.trim()}`);
  lines.push(
    `Write the scene table into manifest.notes, keep inputs.plan_gate_stage="motion", and wait for approval before rendering.`,
  );
  return lines.join('\n');
}

const KICKOFF_PREFIX = 'vibe-kickoff:';

/** Session-storage handoff: the wizard stores the kickoff; the project page sends it once. */
export function stashKickoff(projectId: string, message: string): void {
  try {
    sessionStorage.setItem(KICKOFF_PREFIX + projectId, message);
  } catch {
    /* storage unavailable — the user can just type the brief */
  }
}

export function takeKickoff(projectId: string): string | null {
  try {
    const k = KICKOFF_PREFIX + projectId;
    const v = sessionStorage.getItem(k);
    if (v) sessionStorage.removeItem(k);
    return v;
  } catch {
    return null;
  }
}
