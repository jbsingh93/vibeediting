/**
 * Ported + adapted from the parent p6-pure.test.ts agent-mode-create block. ADAPTED: the ported
 * lib defaults `inputs.lang` to 'en' (the package ships English placeholders, hard rule 2), where
 * the parent defaulted to 'da'. The slug rules (æ/ø/å folding) are unchanged.
 */
import { describe, it, expect } from 'vitest';
import { buildAgentCreateBody, validateAgentName } from '../agent-create';
import { slugify } from '../wizard';

describe('agent-mode create', () => {
  it('reuses the wizard slug rules verbatim (æ/ø/å, kebab)', () => {
    const b = buildAgentCreateBody('Min Blå Video — Søndag');
    expect(b.project_id).toBe(slugify('Min Blå Video — Søndag'));
    expect(b.project_id).toBe('min-blaa-video-soendag');
  });
  it('builds the agent-mode body: mode discriminator, gates kept, plan-gate convention', () => {
    const b = buildAgentCreateBody('launch ad');
    expect(b.inputs).toEqual({ mode: 'agent', lang: 'en', plan_gate_stage: 'motion' });
    expect(b.approvals_required).toEqual(['motion', 'deliver']);
    expect(b.notes).toMatch(/brief comes from the chat/i);
  });
  it('validates names like the wizard', () => {
    expect(validateAgentName('')).toHaveLength(1);
    expect(validateAgentName('!!!')).toHaveLength(1);
    expect(validateAgentName('ok-name')).toEqual([]);
  });
});
