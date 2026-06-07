/**
 * UIP6.11 — the AskUserQuestion card: the agent's headless AskUserQuestion call rendered as
 * answerable UI in the chat. Single-select questions answer fast (one click sends when it's the
 * only question and there's no free text); otherwise selections accumulate and ▸ Send answers
 * submits all of them as ONE reply ("My answers: …") — the next --resume turn.
 */
import { useState } from 'react';
import type { AgentQuestion } from '../lib/types';
import { draftComplete, emptyDraft, formatAnswers, toggleOption, type AnswerDraft } from '../lib/questions';

export function QuestionCard({ questions, onSubmit }: { questions: AgentQuestion[]; onSubmit: (text: string) => void }) {
  const [draft, setDraft] = useState<AnswerDraft>(() => emptyDraft(questions));

  const submit = (d: AnswerDraft) => onSubmit(formatAnswers(questions, d));

  const pick = (qIndex: number, label: string) => {
    const q = questions[qIndex];
    if (!q) return;
    const next = toggleOption(draft, qIndex, label, q.multiSelect === true);
    // fast path: ONE single-select question and no free text typed → answer on click
    if (questions.length === 1 && !q.multiSelect && (next.selected[0]?.length ?? 0) === 1 && !(next.other[0] ?? '').trim()) {
      submit(next);
      return;
    }
    setDraft(next);
  };

  return (
    <div
      data-testid="question-card"
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--hairline)',
        borderLeft: '3px solid var(--accent)',
        borderRadius: 8,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        <span aria-hidden>❓</span> The agent needs your call
      </div>

      {questions.map((q, qi) => (
        <div key={qi} data-question-index={qi} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            {q.header && (
              <span className="mono" style={{ color: 'var(--muted)', fontSize: 11, border: '1px solid var(--hairline)', borderRadius: 999, padding: '1px 8px', marginRight: 8 }}>
                {q.header}
              </span>
            )}
            {q.question}
            {q.multiSelect && <span style={{ color: 'var(--muted)', fontSize: 11.5 }}> (pick several)</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {q.options.map((o) => {
              const on = (draft.selected[qi] ?? []).includes(o.label);
              return (
                <button
                  key={o.label}
                  data-question-option={o.label}
                  aria-pressed={on}
                  title={o.description}
                  onClick={() => pick(qi, o.label)}
                  style={{
                    background: on ? 'color-mix(in srgb, var(--accent) 12%, var(--surface-2))' : 'var(--surface-2)',
                    color: 'var(--secondary)',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--hairline)'}`,
                    borderRadius: 999,
                    padding: '6px 13px',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {on ? '● ' : '○ '}
                  {o.label}
                </button>
              );
            })}
          </div>
          <input
            data-question-other={qi}
            value={draft.other[qi]}
            onChange={(e) => setDraft({ ...draft, other: draft.other.map((v, i) => (i === qi ? e.target.value : v)) })}
            placeholder="Andet — skriv selv…"
            style={{
              background: 'var(--surface-2)',
              color: 'var(--secondary)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              fontSize: 12.5,
              fontFamily: 'inherit',
              maxWidth: 360,
            }}
          />
        </div>
      ))}

      {(questions.length > 1 || questions[0]?.multiSelect || draft.other.some((t) => t.trim())) && (
        <button
          data-testid="question-submit"
          onClick={() => submit(draft)}
          disabled={!draftComplete(questions, draft)}
          style={{
            alignSelf: 'flex-start',
            background: draftComplete(questions, draft) ? 'var(--accent)' : 'var(--surface-2)',
            color: draftComplete(questions, draft) ? 'var(--primary)' : 'var(--muted)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '7px 14px',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          ▸ Send answers
        </button>
      )}
    </div>
  );
}
