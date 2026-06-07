/** Ported from the parent p3-pure.test.ts budget-bar math (mirrors budget-guard semantics). */
import { describe, it, expect } from 'vitest';
import { spentUsd, recentRpm, barFraction, capFromInputs } from '../budget';

describe('budget bar math (mirrors budget-guard semantics)', () => {
  const t0 = Date.now();
  const entries = [
    { ts: new Date(t0 - 30_000).toISOString(), capability: 'vfx/generate/veo', model: 'veo-3.1', costUsd: 2.4 },
    { ts: new Date(t0 - 120_000).toISOString(), capability: 'ingest/transcribe', model: 'whisper-1', costUsd: 0.01 },
    { ts: new Date(t0 - 10_000).toISOString(), capability: 'generate/tts', model: 'multilingual_v2', costUsd: 0.04 },
  ];

  it('sums spend and counts the rolling-60s RPM', () => {
    expect(spentUsd(entries)).toBeCloseTo(2.45);
    expect(recentRpm(entries, t0)).toBe(2);
    expect(spentUsd([])).toBe(0);
  });

  it('bar fraction vs cap; null without a cap', () => {
    expect(barFraction(2.45, 5)).toBeCloseTo(0.49);
    expect(barFraction(9, 5)).toBe(1);
    expect(barFraction(2.45, null)).toBeNull();
    expect(barFraction(2.45, 0)).toBeNull();
  });

  it('reads the optional cap from manifest inputs', () => {
    expect(capFromInputs({ max_cost_usd: 5 })).toBe(5);
    expect(capFromInputs({ max_cost_usd: '7.5' })).toBe(7.5);
    expect(capFromInputs({})).toBeNull();
    expect(capFromInputs({ max_cost_usd: -2 })).toBeNull();
  });

  it('ignores corrupt entries defensively', () => {
    const dirty = [...entries, { ts: 'garbage', capability: 'x', model: 'y', costUsd: Number.NaN }];
    expect(spentUsd(dirty)).toBeCloseTo(2.45);
    expect(recentRpm(dirty, t0)).toBe(2);
  });
});
