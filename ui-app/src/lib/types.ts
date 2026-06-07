/**
 * Shared client types. Manifest/stage/verify shapes are LOCAL MIRRORS of the engine contracts
 * (template/capabilities/orchestrate/{manifest.schema,verify}.ts + _env/contract.ts +
 * deliver/render-preset.ts own them — the on-disk JSON is the contract, snake_case preserved).
 * Importing the engine sources would drag Node-flavored code into the browser compile graph,
 * so the client mirrors the few shapes it renders; if the engine contract changes, change both.
 */
export const STAGE_NAMES = [
  'acquire',
  'screen-record',
  'ingest',
  'audio',
  'color',
  'motion',
  '3d',
  'vfx',
  'generate',
  'assemble',
  'deliver',
] as const;
export type StageName = (typeof STAGE_NAMES)[number];
export type StageStatus = 'pending' | 'running' | 'complete' | 'failed' | 'blocked';
export type ManifestStatus = 'planned' | 'running' | 'blocked' | 'complete' | 'failed';

export interface VersionRecord {
  v: number;
  approved: boolean;
  outputs: string[];
  params_hash?: string;
  created_at: string;
  finished_at?: string;
}

export interface Stage {
  status: StageStatus;
  params: Record<string, unknown>;
  outputs: string[];
  attempts: number;
  started_at?: string;
  finished_at?: string;
  error?: string;
  approved?: boolean;
  params_hash?: string;
  versions?: VersionRecord[];
}

export interface Manifest {
  project_id: string;
  version: number;
  status: ManifestStatus;
  created_at: string;
  updated_at: string;
  inputs: Record<string, unknown>;
  stages: Partial<Record<StageName, Stage>>;
  approvals_required: StageName[];
  retry_policy: { max_retries: number; backoff: 'none' | 'linear' | 'exponential' };
  notes?: string;
}

/** The capability envelope (last stdout JSON line — _env/contract.ts owns the shape). */
export interface CapabilityResult {
  success: boolean;
  capability: string;
  outputs: string[];
  metrics: Record<string, unknown>;
  warnings?: string[];
  error?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export type Preset =
  | 'vertical-ad'
  | 'square-ad'
  | 'portrait-feed'
  | 'youtube-1080'
  | 'youtube-4k'
  | 'reel-60fps'
  | 'transparent-overlay'
  | 'scene-clip'
  | 'scene-clip-alpha'
  | 'scene-clip-greenkey';

// ── split-verifier shapes (orchestrate/verify.ts owns them) ────────────────────
export type Verdict = 'ship' | 'fix' | 'rework' | 'escalate';
export type Severity = 'blocker' | 'major' | 'minor';

export interface ObjectiveCheck {
  id: string;
  ok: boolean;
  severity: Severity;
  stage: StageName;
  message: string;
  value?: number | string;
  expected?: number | string;
}

export interface CouncilSummary {
  aggregateVerdict: string;
  totalBlockers: number;
  totalMajors: number;
  specialists: { id: string; verdict: string; blockers: number; majors: number }[];
}

export interface VerifyResult {
  verdict: Verdict;
  stage_to_retry: StageName | null;
  reasons: string[];
  technical: ObjectiveCheck[];
  eyes: CouncilSummary | null;
}

// ── UIP2.2 job runner DTOs (mirror ui/server/jobs.ts) ─────────────────────────
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface JobRecord {
  id: string;
  kind: 'capability' | 'render' | 'script';
  label: string;
  project?: string;
  status: JobStatus;
  progress?: number;
  frame?: number;
  totalFrames?: number;
  etaS?: number;
  logTail: string[];
  envelope?: CapabilityResult;
  error?: string;
  outputs?: string[];
  /** Serializable job spec (server-side JobSpec); the client only peeks at verb/scriptKey/args. */
  spec?: { kind: string; verb?: string; scriptKey?: string; args?: string[] };
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export type JobsWsMessage = { type: 'job'; job: JobRecord };

export interface SystemInfo {
  freeGb: number;
  totalGb: number;
  gpu: { usedMb: number; totalMb: number } | null;
}

/** GET /api/projects/:id/verify-result — the newest VerifyResult on disk (null until one exists). */
export interface VerifyResultEnvelope {
  path: string;
  mtime: string;
  result: VerifyResult;
}

/** UIP6.11 — an AskUserQuestion surfaced as an answerable card (mirrors ui/server/agent.ts). */
export interface AgentQuestionOption {
  label: string;
  description?: string;
}
export interface AgentQuestion {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: AgentQuestionOption[];
}

/** One AgentEvent streamed over WS /ws/agent (server → UI). Mirrors ui/server/agent.ts AgentEvent. */
export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; id: string; name: string; status: 'start' | 'ok' | 'error'; detail?: string; capability?: string; glyph?: string }
  | { type: 'question'; id: string; questions: AgentQuestion[] }
  | { type: 'session'; sessionId: string }
  | { type: 'done'; result: string; costUsd?: number; numTurns?: number }
  | { type: 'offline'; reason: string };

/** A storyboard frame (UIP1.4): name + /work-relative URL. */
export interface StoryboardImage {
  name: string;
  url: string;
}
export interface StoryboardResponse {
  stage: StageName;
  images: StoryboardImage[];
}

/** Gate review payload from GET /api/projects/:id/stages/:stage/gate (UIP1.3). */
export interface GateInfo {
  stage: StageName;
  status: StageStatus;
  is_gate: boolean;
  is_plan_gate: boolean;
  summary: string;
  outputs: string[];
}

export interface ManifestSummary {
  project_id: string;
  status: ManifestStatus;
  updated_at: string;
  blockedStages: StageName[];
  thumbnail?: string;
}

export interface ProjectsResponse {
  projects: ManifestSummary[];
}

export interface DoctorCheck {
  name: string;
  status: 'green' | 'yellow' | 'red';
  detail: string;
}
export interface DoctorReport {
  checks: DoctorCheck[];
  reds: number;
  yellows: number;
  greens: number;
}

/** Messages pushed on /ws/manifests. */
export type ManifestWsMessage =
  | { type: 'manifest'; project_id: string; manifest: Manifest }
  | { type: 'provenance'; project_id: string }
  | { type: 'budget'; project_id: string }
  | { type: 'brief'; project_id: string };

// ── UI-P3 DTOs (mirror ui/server/p3-routes.ts; UIP6.6 split audio → vo/music/sfx) ──
export type AssetCategory =
  | 'footage'
  | 'vo'
  | 'music'
  | 'sfx'
  | 'audio'
  | 'captions'
  | 'lut'
  | 'image'
  | 'data'
  | 'other';
export type AssetOrigin = 'public' | 'refs' | 'work';

export interface AcquiredBadge {
  sourceUrl: string;
  tool: string;
  fetchedAt: string;
  sha256?: string;
}

export interface AssetInfo {
  name: string;
  relPath: string;
  absPath: string;
  category: AssetCategory;
  origin: AssetOrigin;
  bytes: number;
  mtime: string;
  acquired?: AcquiredBadge;
}

export interface StyleSpecInfo {
  name: string;
  relPath: string;
  mtime: string;
  spec: StyleSpec;
}

/** reference-analyze's style-spec.json (perception/reference-analyze.ts output, GAP-48). */
export interface StyleSpec {
  reference?: string;
  signals?: {
    durationSec?: number;
    cutCount?: number;
    aslSec?: number;
    palette?: string[];
    lufs?: number | null;
  };
  specialists?: { specialist?: string; summary?: string; parameters?: Record<string, unknown>; error?: string }[];
  note?: string;
}

export type AcquireWhat = 'page' | 'asset' | 'media' | 'mimic';

/** One budget.json ledger entry (orchestrate/budget-guard.ts LedgerEntry — mirrored, type-only). */
export interface BudgetEntry {
  ts: string;
  capability: string;
  model: string;
  costUsd: number;
  cacheKey?: string;
}

/** One durable provenance.log record (orchestrate/provenance.ts ProvenanceRecord — mirrored). */
export interface ProvenanceRecord {
  ts: string;
  capability: string;
  args?: string[];
  outputs?: { path: string; sha256: string; bytes: number }[];
  source?: string;
  note?: string;
}

// ── UI-P4 DTOs (mirror ui/server/p4-routes.ts) ─────────────────────────────────
export type FinetuneDocKind = 'captions' | 'segments' | 'audio-mix' | 'props';

export interface FinetuneDoc {
  name: string;
  kind: FinetuneDocKind;
  data: unknown;
  sha256: string;
  baseline?: unknown;
  srcExists?: Record<string, boolean>;
}

export interface FinetuneState {
  project: string;
  docs: FinetuneDoc[];
}

export interface FinetuneProjectEntry {
  project: string;
  docs: number;
  kinds: FinetuneDocKind[];
}

export interface FinetuneSaveResult {
  saved: string[];
  shas: Record<string, string>;
  params_hash: string;
  forked?: { stage: StageName; v: number };
  baselineCreated?: string[];
}

export type FinetuneConflict =
  | { conflict: 'file-changed'; name: string; error: string }
  | { conflict: 'stage-running'; stage: StageName; error: string };

// ── UI-P6 DTOs (mirror ui/server/p6-routes.ts) ─────────────────────────────────

/** GET/PUT /api/projects/:id/brief — projects/<p>/brief.md (the durable user brief). */
export interface BriefState {
  md: string;
  sha256: string;
  exists: boolean;
}

export interface UploadResult {
  uploaded: AssetInfo[];
  rejected: { name: string; reason: string }[];
}

/** One CAPABILITIES.md `##` section, parsed live by GET /api/wiki. */
export interface WikiSection {
  id: string;
  title: string;
  md: string;
}

/** UIP6.14 — one persisted chat-transcript entry (projects/<p>/chat.jsonl; mirrors agent.ts). */
export type ChatEntry =
  | { ts: string; t: 'user'; text: string }
  | { ts: string; t: 'event'; e: AgentEvent };

/** UIP6.13 — one produced video (the Preview tab's Renders section; mirrors p6-routes RenderInfo). */
export interface RenderInfo {
  name: string;
  relPath: string;
  url: string;
  bytes: number;
  mtime: string;
  loudnorm: boolean;
  /** false = found at the out/ / deliver/ ROOT (rendered without a project-scoped --out name). */
  scoped?: boolean;
}

// ── API-Keys page DTOs (mirror src/server/keys-routes.ts) ──────────────────────
export interface KeyRow {
  key: string;
  /** Friendly name shown in the UI row. */
  name: string;
  /** What having this key unlocks (plain language). */
  unlocks: string;
  /** Where to create one. */
  link: string;
  /** Casual cost note. */
  costNote: string;
  required: boolean;
  /** true when the project's .env has a value for this key. */
  set: boolean;
  /** masked display value (`sk-…last4`), null when unset. */
  masked: string | null;
}
export interface KeysResponse {
  keys: KeyRow[];
}
export interface KeyTestResult {
  ok: boolean;
  message: string;
}

// ── Brand page DTOs (mirror src/server/brand-routes.ts) ────────────────────────
export interface BrandState {
  exists: boolean;
  /** parsed brand.json (null when absent or malformed). */
  brand: Record<string, unknown> | null;
  /** sha256 of the on-disk file (null when absent) — optimistic-concurrency token. */
  sha256: string | null;
  /** the prompt the "Let the agent set this up" button sends through the cockpit. */
  agentPrompt: string;
}
export interface BrandSaveResult {
  saved: true;
  sha256: string;
}

// ── Wizard styles DTO (mirror src/server/styles-routes.ts StyleInfo) ───────────
// The canonical StyleInfo lives in ./wizard (D23); re-exported here so it sits with the DTOs too.
export type { StyleInfo } from './wizard';
import type { StyleInfo } from './wizard';
export interface StylesResponse {
  styles: StyleInfo[];
}

/** The 11 manifest stage slots in canonical order (mirrors STAGE_NAMES; redefined to avoid pulling
 *  the zod schema runtime into the browser bundle). Keep in sync with manifest.schema.ts. */
export const STAGE_ORDER: StageName[] = [
  'acquire',
  'screen-record',
  'ingest',
  'audio',
  'color',
  'motion',
  '3d',
  'vfx',
  'generate',
  'assemble',
  'deliver',
];
