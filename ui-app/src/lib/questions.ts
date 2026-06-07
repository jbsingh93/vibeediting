/**
 * lib/questions.ts — UIP6.11: pure logic for the AskUserQuestion card (unit-tested).
 *
 * The agent's headless AskUserQuestion call is surfaced as a card; the user's selections are
 * formatted into ONE plain-text reply sent as the next --resume turn (the persona expects answers
 * prefixed "My answers:" with one `header: choice` line per question).
 */
import type { AgentQuestion } from './types';

/** A card's draft state: per-question selected labels + optional free text ("Other"). */
export interface AnswerDraft {
  selected: string[][];
  other: string[];
}

export function emptyDraft(questions: AgentQuestion[]): AnswerDraft {
  return { selected: questions.map(() => []), other: questions.map(() => '') };
}

/** Toggle one option respecting single/multi select. Returns a NEW draft. */
export function toggleOption(draft: AnswerDraft, qIndex: number, label: string, multiSelect: boolean): AnswerDraft {
  const cur = draft.selected[qIndex] ?? [];
  let next: string[];
  if (multiSelect) next = cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label];
  else next = cur.includes(label) ? [] : [label];
  const selected = draft.selected.map((s, i) => (i === qIndex ? next : s));
  return { ...draft, selected };
}

/** Every question answered (an option picked OR free text given)? */
export function draftComplete(questions: AgentQuestion[], draft: AnswerDraft): boolean {
  return questions.every((_, i) => (draft.selected[i]?.length ?? 0) > 0 || (draft.other[i] ?? '').trim().length > 0);
}

/** The reply message — by value, human-readable, one line per question. */
export function formatAnswers(questions: AgentQuestion[], draft: AnswerDraft): string {
  const lines = questions.map((q, i) => {
    const subject = (q.header ?? q.question).trim();
    const parts: string[] = [...(draft.selected[i] ?? [])];
    const other = (draft.other[i] ?? '').trim();
    if (other) parts.push(other);
    return `- ${subject}: ${parts.join(' · ')}`;
  });
  return ['My answers:', ...lines].join('\n');
}
