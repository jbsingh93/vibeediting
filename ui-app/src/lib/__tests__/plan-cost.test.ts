/**
 * NEW client logic (task §5): PlanTab's cost-line extraction. D19 makes plan approval visibly =
 * cost approval — the Plan tab scans manifest.notes for an `Estimated cost: $X.XX` line (amber
 * chip), or flags a paid-provider mention that carries no cost line. The two helpers are pure and
 * exported from components/PlanTab.tsx.
 */
import { describe, it, expect } from 'vitest';
import { estimatedCost, mentionsPaidProvider } from '../../components/PlanTab';

describe('estimatedCost', () => {
  it('finds `Estimated cost: $1.23`', () => {
    expect(estimatedCost('Plan:\nEstimated cost: $1.23 for VO + render.')).toBe('$1.23');
  });
  it('is case-insensitive', () => {
    expect(estimatedCost('estimated COST:  $0.40')).toBe('$0.40');
  });
  it('returns the FIRST match when several are present', () => {
    expect(estimatedCost('Estimated cost: $1.23\n...\nEstimated cost: $9.99')).toBe('$1.23');
  });
  it('handles thousands separators and whole dollars', () => {
    expect(estimatedCost('Estimated cost: $1,200')).toBe('$1,200');
  });
  it('null when there is no cost line', () => {
    expect(estimatedCost('A plan with no money mentioned at all.')).toBeNull();
  });
});

describe('mentionsPaidProvider', () => {
  it('detects a paid provider mention (used when no cost line exists)', () => {
    expect(mentionsPaidProvider('We will generate VO with ElevenLabs and b-roll with Veo.')).toBe(true);
    expect(mentionsPaidProvider('runway gen-3 for the transition')).toBe(true);
  });
  it('false when only free/local tools are mentioned', () => {
    expect(mentionsPaidProvider('ffmpeg trim, whisper transcribe, remotion render — all local.')).toBe(false);
  });
});
