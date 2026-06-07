/**
 * UIP3.1 — the Asset Manager (doc 05 §1): category tabs over public/<p>/ + test-video/<p>/refs/ +
 * out/work/<p>/, tiles with provenance badges (acquired-from-URL + sha), and the whitelisted
 * probe / transcribe / make-proxy actions queued through the Seam-2 job runner. "Acquire" opens the
 * UIP3.2 modal; style-spec cards (mimic results) render beneath the grid.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { subscribe } from '../lib/ws';
import {
  CATEGORY_GLYPH,
  visibleTabs,
  filterAssets,
  tabCounts,
  formatBytes,
  timeAgo,
  shortSha,
  urlHost,
  assetActions,
  assetUrl,
  previewKind,
} from '../lib/assets';
import { ASSETS_RELOAD_EVENT, uploadFiles, type FileUploadState } from '../lib/upload';
import type { AssetCategory, AssetInfo, JobsWsMessage, StyleSpecInfo } from '../lib/types';
import { EmptyState } from './EmptyState';
import { AcquireModal } from './AcquireModal';
import { StyleSpecCard } from './StyleSpecCard';

/** The categories a user can override to (the upload select + the tile re-assign). */
const OVERRIDE_CATEGORIES: AssetCategory[] = ['footage', 'vo', 'music', 'sfx', 'captions', 'lut', 'image', 'data', 'other'];

export function AssetManager({ projectId, onAskAgent }: { projectId: string; onAskAgent: (text: string) => void }) {
  const [assets, setAssets] = useState<AssetInfo[] | null>(null);
  const [specs, setSpecs] = useState<StyleSpecInfo[]>([]);
  const [tab, setTab] = useState<AssetCategory | 'all'>('all');
  const [modal, setModal] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploads, setUploads] = useState<FileUploadState[] | null>(null);
  const [uploadCategory, setUploadCategory] = useState<AssetCategory | 'auto'>('auto');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    api
      .assets(projectId)
      .then((r) => {
        setAssets(r.assets);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : String(e)));
    api
      .styleSpecs(projectId)
      .then((r) => setSpecs(r.specs))
      .catch(() => setSpecs([]));
  }, [projectId]);

  useEffect(() => {
    reload();
    // refresh the grid when one of THIS project's jobs lands (acquire/transcribe/proxy outputs).
    return subscribe<JobsWsMessage>('jobs', (msg) => {
      if (msg.type === 'job' && msg.job.project === projectId && msg.job.status === 'done') reload();
    });
  }, [projectId, reload]);

  // UIP6.6/6.7 — refresh after any upload (Import button, panel drop, or the chat composer).
  useEffect(() => {
    const onReload = () => reload();
    window.addEventListener(ASSETS_RELOAD_EVENT, onReload);
    return () => window.removeEventListener(ASSETS_RELOAD_EVENT, onReload);
  }, [reload]);

  // UIP6.6 — uploads are dumb on purpose: stream to public/<p>/, nothing automatic (§8 fence).
  const doUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setErr(null);
      setNote(null);
      try {
        const res = await uploadFiles(projectId, files, uploadCategory, setUploads);
        if (res.uploaded.length > 0) {
          setNote(`uploaded ${res.uploaded.map((a) => a.name).join(', ')} → public/${projectId}/`);
        }
        if (res.rejected.length > 0) {
          setErr(res.rejected.map((r) => `${r.name}: ${r.reason}`).join(' · '));
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setUploads(null);
      }
    },
    [projectId, uploadCategory],
  );

  // UIP6.6 — the tile "category ▾" re-assign persists to the asset-meta.json sidecar.
  const recategorize = useCallback(
    async (a: AssetInfo, category: AssetCategory) => {
      setErr(null);
      try {
        await api.categorizeAsset(projectId, a.relPath, category);
        reload();
      } catch (e) {
        setErr(e instanceof ApiError ? e.message : String(e));
      }
    },
    [projectId, reload],
  );

  async function runAction(a: AssetInfo, action: 'probe' | 'transcribe' | 'proxy') {
    setErr(null);
    setNote(null);
    const base = a.name.replace(/\.[^.]+$/, '');
    try {
      if (action === 'probe') {
        await api.run('ingest/probe', ['--in', a.absPath, '--project', projectId], projectId);
      } else if (action === 'transcribe') {
        await api.run('ingest/transcribe', ['--in', a.absPath, '--out-prefix', `public/${projectId}/${base}`, '--project', projectId], projectId);
      } else {
        await api.run(
          'deliver/make-proxy',
          ['--in', a.absPath, '--out', `out/work/${projectId}/proxies/${base}-720p.mp4`, '--project', projectId],
          projectId,
        );
      }
      setNote(`${action} queued for ${a.name} — watch the Queue.`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  }

  const counts = assets ? tabCounts(assets) : {};
  const visible = assets ? filterAssets(assets, tab) : [];
  const tabs = visibleTabs(counts); // `audio` (uncategorized fallback) only when non-empty

  return (
    <div
      data-testid="asset-manager"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, outline: dragOver ? '2px dashed var(--accent)' : 'none', outlineOffset: 4, borderRadius: 6 }}
      // UIP6.6 — OS-file drag-drop anywhere on the panel uploads into public/<p>/
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          void doUpload([...e.dataTransfer.files]);
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Asset category" style={{ display: 'inline-flex', gap: 2, flexWrap: 'wrap', flex: 1 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              data-asset-tab={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? 'var(--surface-2)' : 'transparent',
                color: tab === t.id ? 'var(--secondary)' : 'var(--muted)',
                border: '1px solid',
                borderColor: tab === t.id ? 'var(--hairline)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                padding: '3px 8px',
                fontSize: 11.5,
                fontWeight: 700,
              }}
            >
              {t.label}
              {counts[t.id] ? ` ${counts[t.id]}` : ''}
            </button>
          ))}
        </div>
        {/* UIP6.6 — Import: multi-file picker + the optional category override ("Auto" default) */}
        <select
          value={uploadCategory}
          onChange={(e) => setUploadCategory(e.target.value as AssetCategory | 'auto')}
          data-testid="upload-category"
          aria-label="Upload category"
          title="Category for the next upload (Auto = by filename)"
          style={{ background: 'var(--surface-1)', color: 'var(--muted)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '4px 6px', fontSize: 11.5, fontWeight: 600 }}
        >
          <option value="auto">Auto</option>
          {OVERRIDE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          data-testid="import-file-input"
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void doUpload(files);
          }}
        />
        <button onClick={() => fileInputRef.current?.click()} data-testid="open-import" style={ghostHeaderBtn} title={`Upload files into public/${projectId}/ — nothing runs automatically`}>
          ＋ Import
        </button>
        <button onClick={() => setModal(true)} data-testid="open-acquire" style={primaryBtn}>
          ▸ Acquire
        </button>
      </div>

      {uploads && uploads.length > 0 && (
        <div data-testid="upload-progress" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {uploads.map((u) => (
            <div key={u.name} className="mono" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--muted)' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
              {u.status === 'uploading' && (
                <span style={{ width: 90, height: 4, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', display: 'inline-block' }}>
                  <span style={{ display: 'block', width: `${u.pct}%`, height: '100%', background: 'var(--accent)' }} />
                </span>
              )}
              <span style={{ color: u.status === 'rejected' ? 'var(--danger)' : u.status === 'done' ? 'var(--success)' : 'var(--muted)' }}>
                {u.status === 'uploading' ? `${u.pct}%` : u.status === 'done' ? '✓' : `✕ ${u.reason ?? ''}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>✕ {err}</div>}
      {note && (
        <div data-testid="asset-note" style={{ color: 'var(--success)', fontSize: 12.5 }}>
          ✓ {note}{' '}
          <a href="#/queue" style={{ color: 'var(--muted)', fontWeight: 600 }}>
            open Queue →
          </a>
        </div>
      )}

      {assets === null && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Scanning assets…</div>}
      {assets !== null && visible.length === 0 && (
        <EmptyState
          title={tab === 'all' ? 'No assets yet' : `No ${tab} assets`}
          hint={`＋ Import files (or drop them on this panel), or Acquire from a URL — they land in public/${projectId}/`}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map((a) => (
          <AssetTile key={a.relPath} asset={a} onAction={runAction} onRecategorize={recategorize} />
        ))}
      </div>

      {specs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
            Style specs (mimic)
          </div>
          {specs.map((s) => (
            <StyleSpecCard
              key={s.relPath}
              info={s}
              onUse={(relPath) =>
                onAskAgent(
                  `Use this style-spec as the style anchor for ${projectId}: ${relPath} — apply its measured signals and specialist parameters when planning and building scenes (keep assets on-brand — colors and tone live in brand/brand.json).`,
                )
              }
            />
          ))}
        </div>
      )}

      <div style={{ color: 'var(--muted)', fontSize: 11.5 }}>
        ⓘ JSON (captions, style-spec) is git-tracked; media is gitignored.
      </div>

      {modal && <AcquireModal projectId={projectId} onClose={() => setModal(false)} onQueued={(m) => setNote(m)} />}
    </div>
  );
}

function AssetTile({
  asset: a,
  onAction,
  onRecategorize,
}: {
  asset: AssetInfo;
  onAction: (a: AssetInfo, action: 'probe' | 'transcribe' | 'proxy') => void;
  onRecategorize: (a: AssetInfo, category: AssetCategory) => void;
}) {
  const actions = assetActions(a);
  const sha = shortSha(a.acquired?.sha256);
  // UIP6.12 — inline preview for servable media (public/ + out/work/ mounts; refs aren't served)
  const [preview, setPreview] = useState(false);
  const url = assetUrl(a);
  const kind = previewKind(a);
  return (
    <div
      data-testid="asset-tile"
      data-asset-category={a.category}
      // UIP5.5 — drag-to-mention: drop the tile into the agent composer to reference this asset.
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', a.relPath);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      title={`${a.relPath} — drag into the agent chat to mention it`}
      style={{
        cursor: 'grab',
        background: 'var(--surface-1)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-sm)',
        padding: '9px 11px',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span aria-hidden className="mono" style={{ color: 'var(--muted)', fontSize: 13, width: 18, textAlign: 'center' }}>
          {CATEGORY_GLYPH[a.category]}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={a.relPath}>
          {a.name}
        </span>
        {/* UIP6.6 — "category ▾" re-assign (persists to the asset-meta.json sidecar) */}
        <select
          value={a.category}
          data-testid="tile-category"
          aria-label={`Category of ${a.name}`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onRecategorize(a, e.target.value as AssetCategory)}
          className="mono"
          style={{ fontSize: 10.5, color: 'var(--muted)', background: 'transparent', border: '1px solid var(--hairline)', borderRadius: 999, padding: '1px 4px' }}
        >
          {[...new Set([a.category, ...OVERRIDE_CATEGORIES])].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span
          className="mono"
          style={{ fontSize: 10.5, color: 'var(--muted)', border: '1px solid var(--hairline)', borderRadius: 999, padding: '1px 7px' }}
        >
          {a.origin}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>{formatBytes(a.bytes)}</span>
        <span>{timeAgo(a.mtime)}</span>
        {a.acquired && (
          <span data-testid="acquired-badge" title={a.acquired.sourceUrl}>
            ⤓ {urlHost(a.acquired.sourceUrl)}
            {sha ? ` · sha256 ${sha}` : ''}
          </span>
        )}
      </div>
      {(actions.length > 0 || (url && kind)) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {url && kind && (
            <button onClick={() => setPreview((v) => !v)} data-asset-action="preview" style={miniBtn}>
              {preview ? '✕ close' : '▸ preview'}
            </button>
          )}
          {actions.map((act) => (
            <button key={act} onClick={() => onAction(a, act)} data-asset-action={act} style={miniBtn}>
              ▸ {act === 'proxy' ? 'make proxy' : act}
            </button>
          ))}
        </div>
      )}
      {preview && url && kind === 'video' && (
        <video data-testid="asset-preview" src={url} controls preload="metadata" style={{ width: '100%', maxHeight: 220, background: '#000', borderRadius: 6 }} />
      )}
      {preview && url && kind === 'audio' && (
        <audio data-testid="asset-preview" src={url} controls preload="metadata" style={{ width: '100%' }} />
      )}
      {preview && url && kind === 'image' && (
        <img data-testid="asset-preview" src={url} alt={a.name} style={{ width: '100%', maxHeight: 220, objectFit: 'contain', background: '#000', borderRadius: 6 }} />
      )}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--primary)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  padding: '6px 13px',
  fontWeight: 700,
  fontSize: 12.5,
};
const ghostHeaderBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--secondary)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '5px 12px',
  fontWeight: 700,
  fontSize: 12.5,
};
const miniBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--secondary)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  padding: '3px 9px',
  fontWeight: 600,
  fontSize: 11.5,
};
