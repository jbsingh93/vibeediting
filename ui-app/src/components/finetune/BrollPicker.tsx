/**
 * components/finetune/BrollPicker.tsx (VE.3.2) — insert a b-roll cutaway on the single video lane.
 * Modeled on AudioTracksUI's add-track affordance: a "+ b-roll" pill opens a picker of the project's
 * footage assets (origin + acquired badges); choosing one inserts a cutaway segment carrying that
 * asset's public-rooted src. Natural duration is probed lazily (a detached <video>); codecs the
 * browser can't decode (e.g. HEVC) resolve null and the caller falls back to a default clip length.
 */
import { useEffect, useState } from 'react';
import type { AssetInfo } from '../../lib/types';
import { assetBasename, assetUrl } from '../../lib/assets';

/** Best-effort natural duration (seconds) of a media URL, client-side. null if it can't decode. */
export function probeDuration(url: string, timeoutMs = 4000): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    let done = false;
    const finish = (d: number | null) => {
      if (done) return;
      done = true;
      v.removeAttribute('src');
      resolve(d);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    v.onloadedmetadata = () => {
      clearTimeout(timer);
      finish(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null);
    };
    v.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    v.src = url;
  });
}

export function BrollPicker({
  footageAssets,
  onInsert,
}: {
  footageAssets: AssetInfo[];
  onInsert: (asset: AssetInfo, naturalDurationSec: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [durations, setDurations] = useState<Record<string, number | null>>({});

  // lazily probe durations when the picker opens (cached; HEVC etc. resolve null → "—")
  useEffect(() => {
    if (!open) return;
    let alive = true;
    for (const a of footageAssets) {
      if (a.relPath in durations) continue;
      const url = assetUrl(a);
      if (!url) {
        setDurations((d) => ({ ...d, [a.relPath]: null }));
        continue;
      }
      void probeDuration(url).then((dur) => {
        if (alive) setDurations((d) => ({ ...d, [a.relPath]: dur }));
      });
    }
    return () => {
      alive = false;
    };
  }, [open, footageAssets, durations]);

  if (footageAssets.length === 0) {
    return (
      <span data-testid="ft-broll-empty" style={{ fontSize: 9, color: 'var(--muted)' }}>
        no footage
      </span>
    );
  }

  if (!open) {
    return (
      <button
        data-testid="ft-broll-add"
        onClick={() => setOpen(true)}
        title="Insert a b-roll cutaway from the project's footage"
        style={{
          background: 'transparent',
          border: '1px solid var(--hairline)',
          borderRadius: 999,
          color: 'var(--muted)',
          fontSize: 9,
          padding: '1px 7px',
          cursor: 'pointer',
        }}
      >
        + b-roll
      </button>
    );
  }

  return (
    <select
      data-testid="ft-broll-pick"
      autoFocus
      onBlur={() => setOpen(false)}
      onChange={(e) => {
        const a = footageAssets.find((f) => f.relPath === e.target.value);
        if (a) onInsert(a, durations[a.relPath] ?? null);
        setOpen(false);
      }}
      defaultValue=""
      style={{
        position: 'absolute',
        zIndex: 9,
        background: 'var(--surface-2)',
        color: 'var(--secondary)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 11,
        maxWidth: 220,
      }}
    >
      <option value="" disabled>
        pick footage…
      </option>
      {footageAssets.map((a) => {
        const dur = durations[a.relPath];
        const durTxt = dur == null ? '' : ` · ${dur.toFixed(1)}s`;
        const badge = a.origin === 'refs' ? ' · acquired' : '';
        return (
          <option key={a.relPath} value={a.relPath}>
            {assetBasename(a.relPath)}
            {badge}
            {durTxt}
          </option>
        );
      })}
    </select>
  );
}
