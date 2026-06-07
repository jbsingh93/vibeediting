import type { CSSProperties } from 'react';
import { PROJECT_STATUS_META, STAGE_STATUS_META, type StatusMeta } from '../lib/status';

/** Rounded pill: status color @12% bg + full-color icon + text label. Colorblind-safe (icon+word). */
export function StatusPill({
  status,
  kind = 'project',
  title,
}: {
  status: string;
  kind?: 'project' | 'stage';
  title?: string;
}) {
  const meta: StatusMeta =
    (kind === 'stage' ? STAGE_STATUS_META : PROJECT_STATUS_META)[status] ?? {
      icon: '•',
      label: status,
      color: 'var(--muted)',
    };
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 10px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    color: meta.color,
    background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
    border: `1px solid color-mix(in srgb, ${meta.color} 30%, transparent)`,
    whiteSpace: 'nowrap',
  };
  return (
    <span style={style} title={title ?? meta.label} data-status={status}>
      <span aria-hidden>{meta.icon}</span>
      {meta.label}
    </span>
  );
}
