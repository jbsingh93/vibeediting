/** Typed fetch client for the JBS Vibe Editing server. Throws ApiError with the server's message on !ok. */
import type {
  ProjectsResponse,
  Manifest,
  DoctorReport,
  StageName,
  GateInfo,
  StoryboardResponse,
  JobRecord,
  SystemInfo,
  VerifyResultEnvelope,
  Preset,
  AssetInfo,
  StyleSpecInfo,
  AcquireWhat,
  BudgetEntry,
  ProvenanceRecord,
  FinetuneState,
  FinetuneProjectEntry,
  FinetuneSaveResult,
  FinetuneConflict,
  AssetCategory,
  BriefState,
  WikiSection,
  RenderInfo,
  ChatEntry,
  KeysResponse,
  KeyTestResult,
  BrandState,
  BrandSaveResult,
  StylesResponse,
} from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readError(res: Response): Promise<string> {
  let msg = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (body?.error) msg = body.error;
  } catch {
    /* keep status text */
  }
  return msg;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  // Only send a JSON content-type when there's actually a body — an empty body WITH a json
  // content-type makes Fastify reject the request (FST_ERR_CTP_EMPTY_JSON_BODY → 400).
  const headers: Record<string, string> = { accept: 'application/json' };
  let payload: string | undefined;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method: 'POST', headers, body: payload });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

export const api = {
  projects: () => getJson<ProjectsResponse>('/api/projects'),
  project: (id: string) => getJson<Manifest>(`/api/projects/${enc(id)}`),
  health: () => getJson<DoctorReport>('/api/health'),
  // UI-P1 reads
  gate: (id: string, stage: StageName) => getJson<GateInfo>(`/api/projects/${enc(id)}/stages/${stage}/gate`),
  storyboard: (id: string, stage: StageName = 'motion') =>
    getJson<StoryboardResponse>(`/api/projects/${enc(id)}/storyboard?stage=${stage}`),
  // UI-P1 mutations
  startStage: (id: string, stage: StageName, params?: Record<string, unknown>) =>
    postJson<Manifest>(`/api/projects/${enc(id)}/stages/${stage}/start`, { params }),
  approveStage: (id: string, stage: StageName) =>
    postJson<Manifest>(`/api/projects/${enc(id)}/stages/${stage}/approve`),
  approveVersion: (id: string, stage: StageName, v: number) =>
    postJson<Manifest>(`/api/projects/${enc(id)}/stages/${stage}/versions/${v}/approve`),
  // UI-P2 — wizard
  createProject: (body: { project_id: string; inputs?: Record<string, unknown>; approvals_required?: StageName[]; notes?: string }) =>
    postJson<Manifest>('/api/projects', body),
  // UI-P2 — jobs (Seam 2)
  jobs: () => getJson<{ jobs: JobRecord[] }>('/api/jobs'),
  run: (verb: string, args: string[], project?: string) => postJson<{ job: JobRecord }>('/api/run', { verb, args, project }),
  render: (body: { compId: string; preset: Preset; outName?: string; propsFile?: string; frames?: string; project?: string; dryRun?: boolean }) =>
    postJson<{ job: JobRecord }>('/api/render', body),
  deliver: (body: { project: string; items: { compId: string; preset: Preset; outName?: string }[]; loudnorm: boolean; dryRun?: boolean; propsFile?: string }) =>
    postJson<{ jobs: JobRecord[] }>('/api/deliver', body),
  cancelJob: (id: string) => postJson<{ job: JobRecord }>(`/api/jobs/${enc(id)}/cancel`),
  retryJob: (id: string) => postJson<{ job: JobRecord }>(`/api/jobs/${enc(id)}/retry`),
  system: () => getJson<SystemInfo>('/api/system'),
  // UI-P2 — QA
  runVerify: (id: string, body?: { video?: string; captions?: string; context?: string; eyes?: boolean }) =>
    postJson<{ job: JobRecord }>(`/api/projects/${enc(id)}/verify`, body ?? {}),
  verifyResult: (id: string) => getJson<VerifyResultEnvelope | null>(`/api/projects/${enc(id)}/verify-result`),
  // UI-P3 — assets + acquire
  assets: (id: string) => getJson<{ assets: AssetInfo[] }>(`/api/projects/${enc(id)}/assets`),
  styleSpecs: (id: string) => getJson<{ specs: StyleSpecInfo[] }>(`/api/projects/${enc(id)}/style-specs`),
  acquire: (body: { project: string; url: string; what: AcquireWhat; audioOnly?: boolean; ship?: boolean }) =>
    postJson<{ job: JobRecord }>('/api/acquire', body),
  // UI-P3 — budget & provenance (read-only)
  provenance: (id: string) => getJson<ProvenanceRecord[]>(`/api/projects/${enc(id)}/provenance`),
  budget: (id: string) => getJson<BudgetEntry[] | null>(`/api/projects/${enc(id)}/budget`),
  // UI-P4 — fine-tune editor
  finetuneProjects: () => getJson<{ projects: FinetuneProjectEntry[] }>('/api/finetune/projects'),
  finetune: (id: string) => getJson<FinetuneState>(`/api/projects/${enc(id)}/finetune`),
  /** Save returns the result OR (on 409) the structured conflict — never throws for conflicts. */
  finetuneSave: async (
    id: string,
    body: { files: { name: string; data: unknown }[]; expect?: Record<string, string>; fork?: boolean; stage?: StageName },
  ): Promise<FinetuneSaveResult | FinetuneConflict> => {
    const res = await fetch(`/api/projects/${enc(id)}/finetune/save`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 409) return (await res.json()) as FinetuneConflict;
    if (!res.ok) throw new ApiError(res.status, await readError(res));
    return (await res.json()) as FinetuneSaveResult;
  },
  // UI-P6 — brief / categorize / wiki
  brief: (id: string) => getJson<BriefState>(`/api/projects/${enc(id)}/brief`),
  /** Save returns the new sha OR (on 409) the disk state — never throws for conflicts. */
  briefSave: async (id: string, body: { md: string; expect?: string }): Promise<{ sha256: string } | { conflict: true; sha256: string; md: string; detail: string }> => {
    const res = await fetch(`/api/projects/${enc(id)}/brief`, {
      method: 'PUT',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      const j = (await res.json()) as { sha256: string; md: string; detail?: string };
      return { conflict: true, sha256: j.sha256, md: j.md, detail: j.detail ?? 'brief.md changed on disk' };
    }
    if (!res.ok) throw new ApiError(res.status, await readError(res));
    return (await res.json()) as { sha256: string };
  },
  categorizeAsset: (id: string, relPath: string, category: AssetCategory) =>
    postJson<{ asset: AssetInfo | null }>(`/api/projects/${enc(id)}/assets/categorize`, { relPath, category }),
  wiki: () => getJson<{ sections: WikiSection[] }>('/api/wiki'),
  wikiDoc: (p: string) => getJson<{ md: string }>(`/api/wiki/doc?path=${enc(p)}`),
  renders: (id: string) => getJson<{ renders: RenderInfo[] }>(`/api/projects/${enc(id)}/renders`),
  chat: (id: string) => getJson<{ entries: ChatEntry[]; busy: boolean }>(`/api/projects/${enc(id)}/chat`),
  // ── API-Keys page (src/server/keys-routes.ts) ──────────────────────────────
  keys: () => getJson<KeysResponse>('/api/keys'),
  keysSave: async (values: Record<string, string>): Promise<{ saved: string[] }> => {
    const res = await fetch('/api/keys', {
      method: 'PUT',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ values }),
    });
    if (!res.ok) throw new ApiError(res.status, await readError(res));
    return (await res.json()) as { saved: string[] };
  },
  keyTest: (key: string) => postJson<KeyTestResult>('/api/keys/test', { key }),
  // ── Brand page (src/server/brand-routes.ts) ────────────────────────────────
  brand: () => getJson<BrandState>('/api/brand'),
  /** Save returns the new sha OR (on 409) the disk sha — never throws for conflicts (like briefSave). */
  brandSave: async (body: { brand: object; expectSha?: string }): Promise<BrandSaveResult | { conflict: true; sha256: string; detail: string }> => {
    const res = await fetch('/api/brand', {
      method: 'PUT',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      const j = (await res.json()) as { sha256: string; error?: string };
      return { conflict: true, sha256: j.sha256, detail: j.error ?? 'brand.json changed on disk' };
    }
    if (!res.ok) throw new ApiError(res.status, await readError(res));
    return (await res.json()) as BrandSaveResult;
  },
  // ── Wizard styles + Save-as-Template (src/server/styles-routes.ts) ─────────
  styles: () => getJson<StylesResponse>('/api/styles'),
  distill: (body: { project: string; name: string; source: 'project' | 'chat' }) =>
    postJson<{ started: true; slug: string }>('/api/templates/distill', body),
};
