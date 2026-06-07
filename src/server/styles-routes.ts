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
import { runAgentTurn } from './agent-bridge.js';
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

/** The distill prompt — routes through the shipped template-distiller skill (doc 07 §10). */
export function distillPrompt(project: string, slug: string, source: 'project' | 'chat'): string {
  const from =
    source === 'chat'
      ? `the agent conversation of project "${project}" (projects/${project}/chat.jsonl — the corrections are the gold)`
      : `the finished project "${project}" (its manifest, provenance, composition code, captions/audio-mix/props sidecars and chat)`;
  return (
    `Use the template-distiller skill to distill ${from} into a reusable style skill named ` +
    `"${slug}". Write .claude/skills/${slug}/SKILL.md with the required vibe-style frontmatter ` +
    `(vibe-style: true, vibe-style-label, vibe-style-hint, vibe-style-formats) — patterns and ` +
    `rules only, never content from the source project. When done, confirm what the style encodes.`
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
    void runAgentTurn(project, distillPrompt(project, slug, source), () => {
      /* events land in the transcript; sockets replay via GET /:id/chat */
    });
    return reply.code(202).send({ started: true, slug });
  });
}
