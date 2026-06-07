/**
 * lib/upload.ts — UIP6.6/6.7: the ONE client upload path (Assets-panel Import + chat composer
 * share it — no second pipeline). XHR per file for real per-file progress; the multipart field
 * order puts `category` before the file so the server knows the override before streaming.
 */
import type { AssetCategory, AssetInfo, UploadResult } from './types';

/** AssetManager (and anything else showing assets) refreshes on this. */
export const ASSETS_RELOAD_EVENT = 'vibe:assets-reload';

export interface FileUploadState {
  name: string;
  pct: number; // 0..100 while sending
  status: 'uploading' | 'done' | 'rejected';
  reason?: string;
  asset?: AssetInfo;
}

function uploadOne(
  projectId: string,
  file: File,
  category: AssetCategory | 'auto',
  onProgress: (pct: number) => void,
): Promise<{ uploaded: AssetInfo[]; rejected: { name: string; reason: string }[] }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/projects/${encodeURIComponent(projectId)}/assets/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as UploadResult & { error?: string };
        if (xhr.status >= 200 && xhr.status < 300) resolve({ uploaded: body.uploaded ?? [], rejected: body.rejected ?? [] });
        else resolve({ uploaded: [], rejected: [{ name: file.name, reason: body.error ?? `${xhr.status} ${xhr.statusText}` }] });
      } catch {
        resolve({ uploaded: [], rejected: [{ name: file.name, reason: `${xhr.status} ${xhr.statusText}` }] });
      }
    };
    xhr.onerror = () => reject(new Error('upload failed — is the server up?'));
    const form = new FormData();
    if (category !== 'auto') form.append('category', category);
    form.append('files', file, file.name);
    xhr.send(form);
  });
}

/**
 * Upload files sequentially (one XHR each → real progress, no parallel disk thrash). Calls
 * onUpdate per state change; resolves with the merged result. Never throws for per-file
 * rejections — only for a dead server.
 */
export async function uploadFiles(
  projectId: string,
  files: File[],
  category: AssetCategory | 'auto',
  onUpdate: (states: FileUploadState[]) => void,
): Promise<{ uploaded: AssetInfo[]; rejected: { name: string; reason: string }[] }> {
  const states: FileUploadState[] = files.map((f) => ({ name: f.name, pct: 0, status: 'uploading' }));
  const push = () => onUpdate(states.map((s) => ({ ...s })));
  push();
  const uploaded: AssetInfo[] = [];
  const rejected: { name: string; reason: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const prev = states[i]!;
    try {
      const res = await uploadOne(projectId, file, category, (pct) => {
        states[i] = { ...states[i]!, pct };
        push();
      });
      uploaded.push(...res.uploaded);
      rejected.push(...res.rejected);
      if (res.uploaded.length > 0) {
        states[i] = { ...prev, pct: 100, status: 'done', asset: res.uploaded[0] };
      } else {
        states[i] = { ...prev, status: 'rejected', reason: res.rejected[0]?.reason ?? 'rejected' };
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      states[i] = { ...prev, status: 'rejected', reason };
      rejected.push({ name: file.name, reason });
    }
    push();
  }
  if (uploaded.length > 0) window.dispatchEvent(new CustomEvent(ASSETS_RELOAD_EVENT));
  return { uploaded, rejected };
}
