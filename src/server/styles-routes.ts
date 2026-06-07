/**
 * src/server/styles-routes.ts — dynamic wizard styles + Save-as-Template (D14/D23, doc 07 §10).
 *
 *   GET  /api/styles            → built-in anchors + user templates (skills with
 *                                 `vibe-style: true` frontmatter — the distiller's contract)
 *   POST /api/templates/distill → run an agent turn with the shipped template-distiller skill;
 *                                 the new style appears in the wizard immediately after.
 *
 * Default style = FIRST in the returned list (D23 de-personalizes the default — the
 * `agm-educator` anchor ships but is not first).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { projectDir } from './context.js';
import { runAgentTurn, broadcastAgentEvent } from './agent-bridge.js';
import { isAgentBusy } from '../agent/runner.js';

export interface StyleInfo {
  id: string;
  label: string;
  hint: string;
  source: 'builtin' | 'template';
  /** wizard formats this style fits (undefined = all). */
  formats?: string[];
}

/** The shipped style anchors (D23 — keep ALL incl. agm-educator; first = wizard default). */
export const BUILTIN_STYLES: StyleInfo[] = [
  { id: 'ali-abdaal', label: 'Ali Abdaal', hint: 'clean B-roll · line captions · soft music', source: 'builtin' },
  { id: 'paid-ad-hormozi', label: 'Hormozi', hint: 'black bg · 84pt yellow · cuts 1–2s · SFX', source: 'builtin' },
  { id: 'tutorial-mkbhd', label: 'MKBHD', hint: 'deep blacks · shallow DOF · slow parallax', source: 'builtin' },
  { id: 'apple-keynote', label: 'Apple keynote', hint: 'huge type · negative space · fade-up', source: 'builtin' },
  { id: 'ios-liquid', label: 'iOS liquid', hint: 'glass blur · pastel · spring bounce', source: 'builtin' },
  { id: 'tiktok-native', label: 'TikTok native', hint: '60fps · every-word captions · 0.5s cuts', source: 'builtin' },
  { id: 'agm-educator', label: 'AGM educator', hint: 'Hormozi cadence + Apple polish + calm', source: 'builtin' },
];

/** Parse a SKILL.md frontmatter block for the vibe-style contract (no YAML dep — line-based). */
export function parseStyleFrontmatter(md: string, slug: string): StyleInfo | null {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = m[1] ?? '';
  const line = (key: string): string | null => {
    const r = fm.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, 'm'));
    if (!r) return null;
    return (r[1] ?? '').trim().replace(/^["']|["']$/g, '');
  };
  if (line('vibe-style') !== 'true') return null;
  const formatsRaw = line('vibe-style-formats');
  let formats: string[] | undefined;
  if (formatsRaw) {
    formats = formatsRaw
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
    if (formats.length === 0) formats = undefined;
  }
  return {
    id: slug,
    label: line('vibe-style-label') ?? slug,
    hint: line('vibe-style-hint') ?? line('description') ?? '',
    source: 'template',
    formats,
  };
}

/** Scan .claude/skills/<slug>/SKILL.md for user-distilled styles (the D14 growth loop). */
export function listTemplateStyles(dir: string = projectDir()): StyleInfo[] {
  const skillsDir = path.join(dir, '.claude', 'skills');
  let slugs: string[] = [];
  try {
    slugs = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
  const out: StyleInfo[] = [];
  for (const slug of slugs) {
    try {
      const md = fs.readFileSync(path.join(skillsDir, slug, 'SKILL.md'), 'utf8');
      const style = parseStyleFrontmatter(md, slug);
      if (style) out.push(style);
    } catch {
      /* skill without SKILL.md — skip */
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;

/**
 * Where the headless cockpit agent STAGES the distilled skill. The cockpit agent cannot write into
 * `.claude/` (Claude Code gates `.claude/` writes even under acceptEdits — live-found VT.4 F16), so it
 * writes here (out/work is freely writable) and the server finalizes it into `.claude/skills/` on the
 * `done` event (server process has full fs access, no permission gate).
 */
export function stagedSkillDir(project: string, slug: string): string {
  return path.join(projectDir(), 'out', 'work', project, 'distill', slug);
}

/**
 * Finalize a distilled skill the cockpit agent staged: copy out/work/<p>/distill/<slug>/ →
 * .claude/skills/<slug>/ (incl. any references/). Never clobbers an existing user skill. Returns
 * whether it placed a SKILL.md. Pure-ish (fs only) — unit-tested.
 */
export function finalizeDistilledSkill(
  baseDir: string,
  project: string,
  slug: string,
): { placed: boolean; reason?: string } {
  const staged = path.join(baseDir, 'out', 'work', project, 'distill', slug);
  const stagedSkill = path.join(staged, 'SKILL.md');
  const target = path.join(baseDir, '.claude', 'skills', slug);
  if (!fs.existsSync(stagedSkill)) return { placed: false, reason: 'no staged SKILL.md' };
  if (fs.existsSync(path.join(target, 'SKILL.md'))) return { placed: false, reason: 'target already exists' };
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(staged, target, { recursive: true });
  return { placed: true };
}

/** The distill prompt — routes through the shipped template-distiller skill (doc 07 §10). */
export function distillPrompt(project: string, slug: string, source: 'project' | 'chat'): string {
  const from =
    source === 'chat'
      ? `the agent conversation of project "${project}" (projects/${project}/chat.jsonl — the corrections are the gold)`
      : `the finished project "${project}" (its manifest, provenance, composition code, captions/audio-mix/props sidecars and chat)`;
  // Stage under out/work — the cockpit finalizes into .claude/skills/ (F16: the headless agent cannot
  // write into .claude/). Path is RELATIVE to the project root (the agent's cwd).
  const stagedRel = `out/work/${project}/distill/${slug}/SKILL.md`;
  return (
    `Use the template-distiller skill to distill ${from} into a reusable style skill named ` +
    `"${slug}". Write the skill to ${stagedRel} (NOT into .claude/ — the cockpit will place it there ` +
    `for you) with the required vibe-style frontmatter (vibe-style: true, vibe-style-label, ` +
    `vibe-style-hint, vibe-style-formats) — patterns and rules only, never content from the source ` +
    `project. Put any long references/ next to that SKILL.md. When done, confirm what the style encodes.`
  );
}

export function registerStylesRoutes(app: FastifyInstance): void {
  app.get('/api/styles', async () => {
    return { styles: [...BUILTIN_STYLES, ...listTemplateStyles()] };
  });

  app.post('/api/templates/distill', async (req, reply) => {
    const body = (req.body ?? {}) as { project?: string; name?: string; source?: string };
    const project = typeof body.project === 'string' ? body.project : '';
    if (!project) return reply.code(400).send({ error: 'project is required' });
    const slug = String(body.name ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
    if (!SLUG_RE.test(slug)) {
      return reply
        .code(400)
        .send({ error: 'name must be 2-49 chars: lowercase letters, digits and dashes' });
    }
    const source = body.source === 'chat' ? 'chat' : 'project';
    if (fs.existsSync(path.join(projectDir(), '.claude', 'skills', slug))) {
      return reply.code(409).send({ error: `a skill named "${slug}" already exists` });
    }
    if (isAgentBusy(project)) {
      return reply.code(409).send({ error: 'the agent is busy on this project — try again when the turn finishes' });
    }
    // Fire-and-return: the turn persists to projects/<p>/chat.jsonl (adapter-side), so the
    // cockpit feed shows the distillation live; the wizard re-fetches /api/styles after.
    // On `done`, finalize the staged skill into .claude/skills/ (F16 — the headless agent can't write
    // there itself). Idempotent + never clobbers an existing user skill.
    void runAgentTurn(project, distillPrompt(project, slug, source), (e) => {
      // Stream the server-started turn to any feed watching this project (F18 — the "watch the
      // agent feed" hint now shows the distillation live, not just after a reload).
      broadcastAgentEvent(project, e);
      if (e.type === 'done') {
        try {
          finalizeDistilledSkill(projectDir(), project, slug);
        } catch {
          /* leave the staged copy in out/work/ for manual placement; non-fatal */
        }
      }
    });
    return reply.code(202).send({ started: true, slug });
  });
}
