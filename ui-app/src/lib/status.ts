/** The one fixed visual vocabulary for status (doc 08 §3). Status is NEVER color alone — icon+label. */
export interface StatusMeta {
  icon: string;
  label: string;
  color: string;
}

export const STAGE_STATUS_META: Record<string, StatusMeta> = {
  pending: { icon: '○', label: 'pending', color: 'var(--muted)' },
  running: { icon: '◔', label: 'running', color: 'var(--accent)' },
  complete: { icon: '✓', label: 'complete', color: 'var(--success)' },
  blocked: { icon: '🔒', label: 'blocked', color: 'var(--warn)' },
  failed: { icon: '✕', label: 'failed', color: 'var(--danger)' },
};

export const PROJECT_STATUS_META: Record<string, StatusMeta> = {
  planned: { icon: '○', label: 'planned', color: 'var(--muted)' },
  running: { icon: '◔', label: 'running', color: 'var(--accent)' },
  blocked: { icon: '🔒', label: 'blocked', color: 'var(--warn)' },
  complete: { icon: '✓', label: 'complete', color: 'var(--success)' },
  failed: { icon: '✕', label: 'failed', color: 'var(--danger)' },
};

export const HEALTH_DOT: Record<string, string> = {
  green: 'var(--success)',
  yellow: 'var(--warn)',
  red: 'var(--danger)',
};
