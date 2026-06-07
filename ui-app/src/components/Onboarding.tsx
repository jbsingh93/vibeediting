/**
 * First-run onboarding (D16/D18/D9): rendered on Home while the project list is empty.
 * Three honest steps with live state — keys → brand → first video — each deep-linking to
 * its page. Steps tick themselves as the underlying files change; nothing blocks anything
 * (a user who wants to skip straight to "create" can — doctor/keys pages catch up later).
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface StepState {
  keysDone: boolean | null; // null = still loading
  brandDone: boolean | null;
}

function useOnboardingState(): StepState {
  const [s, setS] = useState<StepState>({ keysDone: null, brandDone: null });
  useEffect(() => {
    let alive = true;
    void api
      .keys()
      .then((r) => {
        if (!alive) return;
        const required = r.keys.filter((k) => k.required);
        setS((prev) => ({ ...prev, keysDone: required.length > 0 && required.every((k) => k.set) }));
      })
      .catch(() => alive && setS((prev) => ({ ...prev, keysDone: false })));
    void api
      .brand()
      .then((r) => {
        if (!alive) return;
        const name = (r.brand as { name?: string } | null)?.name ?? '';
        setS((prev) => ({ ...prev, brandDone: r.exists && name !== '' && name !== 'My Brand' }));
      })
      .catch(() => alive && setS((prev) => ({ ...prev, brandDone: false })));
    return () => {
      alive = false;
    };
  }, []);
  return s;
}

function Step({
  n,
  title,
  hint,
  href,
  done,
  testid,
}: {
  n: number;
  title: string;
  hint: string;
  href: string;
  done: boolean | null;
  testid: string;
}) {
  return (
    <a
      href={href}
      data-testid={testid}
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
        background: 'var(--surface-1)',
        border: `1px solid ${done ? 'var(--success)' : 'var(--hairline)'}`,
        borderRadius: 'var(--radius)',
        padding: '16px 18px',
        flex: 1,
        minWidth: 220,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 14,
          flexShrink: 0,
          background: done ? 'var(--success)' : 'var(--surface-2)',
          color: done ? 'var(--primary)' : 'var(--muted)',
          border: '1px solid var(--hairline)',
        }}
      >
        {done ? '✓' : n}
      </span>
      <span>
        <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{title}</span>
        <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12.5, marginTop: 4, lineHeight: 1.45 }}>
          {done === null ? 'checking…' : hint}
        </span>
      </span>
    </a>
  );
}

/** The three-step first-run strip. Rendered by Home when there are no projects yet. */
export function Onboarding() {
  const { keysDone, brandDone } = useOnboardingState();
  return (
    <div data-testid="onboarding" style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px' }}>Welcome — three steps to your first video</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '0 0 14px' }}>
        Everything runs locally; your keys and media never leave this machine except to the
        providers you configure.
      </p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Step
          n={1}
          title="Add your API keys"
          hint="OpenAI + Gemini unlock captions and visual QA — each row has a Test button."
          href="#/keys"
          done={keysDone}
          testid="onboarding-keys"
        />
        <Step
          n={2}
          title="Set up your brand"
          hint="Colors, tone and voice in one file — or let the agent interview you."
          href="#/brand"
          done={brandDone}
          testid="onboarding-brand"
        />
        <Step
          n={3}
          title="Create your first video"
          hint="Guided wizard or pure chat — the agent does the editing either way."
          href="#/new"
          done={false}
          testid="onboarding-create"
        />
      </div>
    </div>
  );
}
