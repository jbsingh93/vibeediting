/**
 * Ported + adapted from the parent wizard.test.ts. ADAPTED: the static STYLES array is gone (D23 —
 * styles are fetched from GET /api/styles), so `style` is a plain string field on the wizard state;
 * the style assertions are dropped and the create body simply omits an empty style. NEW: the
 * slugify æ/ø/å folding is asserted directly (task §5).
 */
import { describe, it, expect } from 'vitest';
import { emptyWizard, slugify, validateWizard, buildCreateBody, kickoffMessage } from '../wizard';

describe('slugify', () => {
  it('kebab-cases and transliterates Danish glyphs', () => {
    expect(slugify('Launch Ad DA')).toBe('launch-ad-da');
    expect(slugify('  Følg Mig — Reel! ')).toBe('foelg-mig-reel');
    expect(slugify('Æble//Å')).toBe('aeble-aa');
  });
  it('folds every Danish diacritic (æ→ae, ø→oe, å→aa) — i18n robustness', () => {
    expect(slugify('æøå')).toBe('aeoeaa');
    expect(slugify('Sværme Søndag på Åen')).toBe('svaerme-soendag-paa-aaen');
  });
  it('clamps to 64 chars and strips edge dashes', () => {
    expect(slugify('-x-'.repeat(40)).length).toBeLessThanOrEqual(64);
    expect(slugify('--hello--')).toBe('hello');
  });
});

describe('validateWizard', () => {
  it('flags the empty wizard (name + format)', () => {
    const errors = validateWizard(emptyWizard());
    expect(errors.some((e) => /name/.test(e))).toBe(true);
    expect(errors.some((e) => /format/.test(e))).toBe(true);
  });

  it('passes a complete state', () => {
    const s = { ...emptyWizard(), name: 'launch-ad-da', format: '9:16-ad' as const };
    expect(validateWizard(s)).toEqual([]);
  });

  it('rejects out-of-range durations', () => {
    const s = { ...emptyWizard(), name: 'x-y', format: '9:16-ad' as const };
    expect(validateWizard({ ...s, durationS: 2 }).some((e) => /duration/.test(e))).toBe(true);
    expect(validateWizard({ ...s, durationS: 5000 }).some((e) => /duration/.test(e))).toBe(true);
    expect(validateWizard({ ...s, durationS: NaN }).some((e) => /duration/.test(e))).toBe(true);
  });

  it('rejects a malformed inspiration URL but allows empty', () => {
    const s = { ...emptyWizard(), name: 'x-y', format: '9:16-ad' as const };
    expect(validateWizard({ ...s, inspirationUrl: 'not-a-url' }).some((e) => /URL/i.test(e))).toBe(true);
    expect(validateWizard({ ...s, inspirationUrl: 'https://youtu.be/abc' })).toEqual([]);
    expect(validateWizard({ ...s, inspirationUrl: '' })).toEqual([]);
  });

  it('rejects names that reduce to a too-short slug', () => {
    const s = { ...emptyWizard(), name: '!!!', format: '9:16-ad' as const };
    expect(validateWizard(s).length).toBeGreaterThan(0);
  });
});

describe('buildCreateBody (plan-gate convention)', () => {
  const s = {
    ...emptyWizard(),
    name: 'Launch Ad DA',
    format: '9:16-ad' as const,
    hook: 'AI took your job',
    cta: 'Follow along',
    inspirationUrl: 'https://example.com/ref',
  };

  it('produces the slug id, motion plan gate, and the two approval gates', () => {
    const body = buildCreateBody(s);
    expect(body.project_id).toBe('launch-ad-da');
    expect(body.inputs.plan_gate_stage).toBe('motion');
    expect(body.approvals_required).toEqual(['motion', 'deliver']);
    expect(body.inputs.format).toBe('9:16-ad');
    expect(body.inputs.hook).toBe('AI took your job');
    expect(body.inputs.inspiration_url).toBe('https://example.com/ref');
  });

  it('omits empty optionals (incl. style) instead of writing empty strings', () => {
    const body = buildCreateBody({ ...s, style: '', hook: '', cta: '', inspirationUrl: '' });
    expect(body.inputs.style).toBeUndefined();
    expect(body.inputs.hook).toBeUndefined();
    expect(body.inputs.cta).toBeUndefined();
    expect(body.inputs.inspiration_url).toBeUndefined();
  });
});

describe('kickoffMessage', () => {
  it('carries the brief + the plan-gate instruction to the agent', () => {
    const s = { ...emptyWizard(), name: 'launch-ad-da', format: '9:16-ad' as const, hook: 'AI took your job', inspirationUrl: 'https://x.com/v' };
    const msg = kickoffMessage(s);
    expect(msg).toContain('launch-ad-da');
    expect(msg).toContain('AI took your job');
    expect(msg).toContain('https://x.com/v');
    expect(msg).toContain('plan_gate_stage');
    expect(msg).toContain('plan gate');
  });
});
