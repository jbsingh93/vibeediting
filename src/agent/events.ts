/**
 * The agent event model + stream-json parsing (pure layer, fully unit-tested).
 *
 * The cockpit agent is the user's OWN agent CLI (Claude Code first-class; Codex via adapter)
 * spawned headless — never an SDK, never a raw API key. Adapters translate each CLI's native
 * event stream into THIS AgentEvent union so the UI and the rest of the tool are
 * adapter-agnostic.
 */
import * as path from 'node:path';

// ── what adapters emit (and the UI later renders) ──────────────────────────────
export type AgentEvent =
  | { type: 'text'; delta: string }
  | {
      type: 'tool';
      id: string;
      name: string;
      status: 'start' | 'ok' | 'error';
      detail?: string;
      capability?: string;
      glyph?: string;
    }
  | { type: 'question'; id: string; questions: AgentQuestion[] } // AskUserQuestion → UI card
  | { type: 'session'; sessionId: string }
  | { type: 'done'; result: string; costUsd?: number; numTurns?: number }
  | { type: 'offline'; reason: string };

// ── the AskUserQuestion bridge ─────────────────────────────────────────────────
// The headless CLI cannot prompt — the AskUserQuestion TOOL CALL always errors in -p mode.
// But its INPUT carries the full question payload, so the bridge surfaces it as an
// answerable card; the user's choice goes back as the next --resume turn. The tool's own
// error result is EXPECTED and swallowed (the persona is told to end its turn after asking).
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

/** Defensively parse an AskUserQuestion tool_use input into questions (null = unusable). Pure. */
export function parseQuestions(input: Record<string, unknown> | undefined): AgentQuestion[] | null {
  const raw = input?.questions;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: AgentQuestion[] = [];
  for (const q of raw as Array<Record<string, unknown>>) {
    if (!q || typeof q.question !== 'string' || !q.question.trim()) return null;
    const options: AgentQuestionOption[] = [];
    if (Array.isArray(q.options)) {
      for (const o of q.options as Array<Record<string, unknown>>) {
        if (o && typeof o.label === 'string' && o.label.trim()) {
          options.push({
            label: o.label,
            description: typeof o.description === 'string' ? o.description : undefined,
          });
        }
      }
    }
    out.push({
      question: q.question,
      header: typeof q.header === 'string' ? q.header : undefined,
      multiSelect: q.multiSelect === true,
      options,
    });
  }
  return out;
}

// ── tool_use → activity-row glyph map (capability folder → glyph) ──────────────
const FOLDER_GLYPH: Record<string, string> = {
  ingest: '⚙',
  assemble: '⚙',
  perception: '👁',
  audio: '♪',
  color: '🎨',
  motion: '🎬',
  acquire: '⤓',
  generate: '💲',
  vfx: '💲',
  deliver: '📦',
  orchestrate: '⚙',
  '3d': '🧊',
  'screen-record': '🖥',
};

export interface ToolClassification {
  glyph: string;
  capability?: string;
  detail?: string;
}

/** Classify a tool_use block into an activity row (glyph + capability + short detail). Pure. */
export function classifyTool(name: string, input: Record<string, unknown> | undefined): ToolClassification {
  const cmd = typeof input?.command === 'string' ? input.command : '';
  const file = typeof input?.file_path === 'string' ? input.file_path : '';

  if (name === 'Bash') {
    // …tsx capabilities/<folder>/[nested/]<verb>.ts … → first-folder glyph + verb + key args
    const m = cmd.match(/capabilities[\\/]([\w-]+)[\\/](?:[\w-]+[\\/])*([\w-]+)\.ts/);
    if (m) {
      const [, folder, verb] = m;
      const glyph = FOLDER_GLYPH[folder!] ?? '⚙';
      const args = cmd.match(/--\S+(?:\s+[^\s-]\S*)?/g)?.slice(0, 3).join(' ');
      return { glyph, capability: `${folder}/${verb}`, detail: [verb, args].filter(Boolean).join(' ') };
    }
    if (/\bnpx\s+remotion\b/.test(cmd)) return { glyph: '🎬', capability: 'remotion', detail: shortCmd(cmd) };
    return { glyph: '⌨', detail: shortCmd(cmd) };
  }
  if (name === 'Write' || name === 'Edit' || name === 'MultiEdit') {
    return { glyph: '✎', detail: file ? path.basename(file) : name };
  }
  if (name === 'Read' || name === 'Grep' || name === 'Glob') {
    return { glyph: '🔍', detail: file ? path.basename(file) : name };
  }
  if (name === 'Task') return { glyph: '⛓', detail: 'subagent' };
  if (name.startsWith('mcp__')) return { glyph: '🔌', detail: name.replace(/^mcp__/, '') };
  return { glyph: '·', detail: name };
}

function shortCmd(cmd: string): string {
  const one = cmd.replace(/\s+/g, ' ').trim();
  return one.length > 80 ? one.slice(0, 79) + '…' : one;
}

// ── stream-json line parsing ───────────────────────────────────────────────────
export type StreamLine = Record<string, unknown> & { type?: string };

/** Parse one stdout line as a stream-json event; null for blank/garbage lines. Pure, total. */
export function parseAgentLine(line: string): StreamLine | null {
  const t = line.trim();
  if (!t) return null;
  try {
    const obj = JSON.parse(t);
    return obj && typeof obj === 'object' ? (obj as StreamLine) : null;
  } catch {
    return null;
  }
}

/** Per-turn memory of tool_use id → classification, so tool_results attribute to their row. */
export type PendingToolMap = Map<string, { name: string; swallowResult?: boolean } & ToolClassification>;

/**
 * Translate a parsed Claude stream-json event into zero or more AgentEvents.
 * Pure given `pending`.
 */
export function eventsFromLine(evt: StreamLine, pending: PendingToolMap): AgentEvent[] {
  const out: AgentEvent[] = [];
  const type = evt.type;

  if (type === 'system' && (evt as { subtype?: string }).subtype === 'init') {
    const sid = (evt as { session_id?: string }).session_id;
    if (sid) out.push({ type: 'session', sessionId: sid });
    return out;
  }

  if (type === 'assistant') {
    const content = (evt as { message?: { content?: unknown[] } }).message?.content ?? [];
    for (const b of content as Array<Record<string, unknown>>) {
      if (b.type === 'text' && typeof b.text === 'string') out.push({ type: 'text', delta: b.text });
      else if (b.type === 'tool_use') {
        const name = String(b.name ?? '');
        const id = String(b.id ?? '');
        // AskUserQuestion becomes an answerable question card, not an activity row;
        // its (expected) headless error result is swallowed via the pending flag.
        if (name === 'AskUserQuestion') {
          const questions = parseQuestions(b.input as Record<string, unknown> | undefined);
          if (questions) {
            if (id) pending.set(id, { name, glyph: '❓', swallowResult: true });
            out.push({ type: 'question', id, questions });
            continue;
          }
        }
        const cls = classifyTool(name, b.input as Record<string, unknown> | undefined);
        if (id) pending.set(id, { name, ...cls });
        out.push({
          type: 'tool',
          id,
          name,
          status: 'start',
          detail: cls.detail,
          capability: cls.capability,
          glyph: cls.glyph,
        });
      }
    }
    return out;
  }

  if (type === 'user') {
    const content = (evt as { message?: { content?: unknown[] } }).message?.content ?? [];
    for (const b of content as Array<Record<string, unknown>>) {
      if (b.type === 'tool_result') {
        const id = String(b.tool_use_id ?? '');
        const prev = pending.get(id);
        if (prev?.swallowResult) {
          pending.delete(id); // AskUserQuestion's headless error is expected — never shown
          continue;
        }
        const isError = b.is_error === true;
        out.push({
          type: 'tool',
          id,
          name: prev?.name ?? '',
          status: isError ? 'error' : 'ok',
          glyph: prev?.glyph,
          capability: prev?.capability,
          detail: prev?.detail,
        });
        pending.delete(id);
      }
    }
    return out;
  }

  if (type === 'result') {
    const r = evt as {
      result?: string;
      total_cost_usd?: number;
      cost_usd?: number;
      num_turns?: number;
      session_id?: string;
    };
    if (r.session_id) out.push({ type: 'session', sessionId: r.session_id });
    out.push({
      type: 'done',
      result: typeof r.result === 'string' ? r.result : '',
      costUsd: r.total_cost_usd ?? r.cost_usd,
      numTurns: r.num_turns,
    });
    return out;
  }

  return out;
}
