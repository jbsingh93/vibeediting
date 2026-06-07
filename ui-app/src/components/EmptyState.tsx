import type { ReactNode } from 'react';

/** Friendly empty/zero state — a calm line + optional hint. No hype (doc 08 §7). */
export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 48,
        textAlign: 'center',
        color: 'var(--muted)',
        border: '1px dashed var(--hairline)',
        borderRadius: 'var(--radius)',
      }}
    >
      <div style={{ fontSize: 28, opacity: 0.5 }} aria-hidden>
        ◍
      </div>
      <div style={{ color: 'var(--secondary)', fontWeight: 600, fontSize: 18 }}>{title}</div>
      {hint && <div style={{ maxWidth: 420, fontSize: 14 }}>{hint}</div>}
      {children}
    </div>
  );
}
