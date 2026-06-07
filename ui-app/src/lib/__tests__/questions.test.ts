/**
 * Ported + adapted from the parent p6-pure.test.ts AskUserQuestion-bridge block. Only the CLIENT
 * draft logic lives in ui-app (emptyDraft / toggleOption / draftComplete / formatAnswers); the
 * server-side parseQuestions / eventsFromLine are owned by tests/unit. Question fixtures are built
 * directly here instead of through the server parser. NEW: formatAnswers emits the "My answers:"
 * prefix (the package's English persona contract, vs the parent's "Mine svar:").
 */
import { describe, it, expect } from 'vitest';
import { emptyDraft, toggleOption, draftComplete, formatAnswers } from '../questions';
import type { AgentQuestion } from '../types';

const QUESTIONS: AgentQuestion[] = [
  {
    question: 'Which style?',
    header: 'Style',
    multiSelect: false,
    options: [
      { label: 'Apple-keynote', description: 'calm premium' },
      { label: 'Hormozi', description: 'fast cuts' },
    ],
  },
  { question: 'Length?', header: 'Length', multiSelect: true, options: [{ label: '8s' }, { label: '15s' }] },
];

describe('AskUserQuestion draft logic', () => {
  it('toggle respects single/multi; complete needs every question answered', () => {
    let d = emptyDraft(QUESTIONS);
    expect(draftComplete(QUESTIONS, d)).toBe(false);
    d = toggleOption(d, 0, 'Apple-keynote', false);
    d = toggleOption(d, 0, 'Hormozi', false); // single-select replaces
    expect(d.selected[0]).toEqual(['Hormozi']);
    d = toggleOption(d, 1, '8s', true);
    d = toggleOption(d, 1, '15s', true); // multi accumulates
    expect(d.selected[1]).toEqual(['8s', '15s']);
    expect(draftComplete(QUESTIONS, d)).toBe(true);
    d = toggleOption(d, 1, '8s', true); // toggle off
    expect(d.selected[1]).toEqual(['15s']);
  });

  it('formatAnswers writes the "My answers:" lines the persona expects (headers + free text)', () => {
    let d = emptyDraft(QUESTIONS);
    d = toggleOption(d, 0, 'Apple-keynote', false);
    d = toggleOption(d, 1, '8s', true);
    d = { ...d, other: ['', 'with a logo at the end'] };
    expect(formatAnswers(QUESTIONS, d)).toBe('My answers:\n- Style: Apple-keynote\n- Length: 8s · with a logo at the end');
  });

  it('free text alone satisfies completeness (no option picked)', () => {
    let d = emptyDraft(QUESTIONS);
    d = { ...d, other: ['custom', 'also custom'] };
    expect(draftComplete(QUESTIONS, d)).toBe(true);
  });
});
