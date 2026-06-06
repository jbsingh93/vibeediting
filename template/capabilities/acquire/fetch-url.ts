#!/usr/bin/env tsx
/**
 * capabilities/acquire/fetch-url.ts — pull readable text + embedded media URLs from a page (plan P1F.1, GAP-48).
 *
 * Given a URL, fetch it and extract readable TEXT to Markdown (title, body, an enumerated list of embedded
 * image/video URLs) → out/work/<project>/acquire/<slug>.md + a provenance record. For JS-heavy/blocked
 * pages, the agent should escalate to its WebFetch tool; this capability persists the result so a render is
 * reproducible.
 *
 * CLI: tsx fetch-url.ts --url URL [--project NAME] [--out FILE]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runCapability, workDir } from '../_env/contract';
import { appendAcquireRecord } from './provenance';

export interface ExtractedPage {
  title: string;
  markdown: string;
  images: string[];
  videos: string[];
}

/** Minimal, dependency-free HTML → readable Markdown (pure → unit-testable offline). */
export function htmlToMarkdown(html: string, baseUrl?: string): ExtractedPage {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decode(titleMatch[1].trim()) : '';

  const resolve = (u: string): string => {
    try {
      return baseUrl ? new URL(u, baseUrl).href : u;
    } catch {
      return u;
    }
  };
  const images = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => resolve(m[1]));
  const videos = [
    ...[...html.matchAll(/<video[^>]+src=["']([^"']+)["']/gi)].map((m) => resolve(m[1])),
    ...[...html.matchAll(/<source[^>]+src=["']([^"']+)["']/gi)].map((m) => resolve(m[1])),
  ];

  // strip noise, keep main text
  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  body = body
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `\n# ${strip(t)}\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n## ${strip(t)}\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n### ${strip(t)}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${strip(t)}`)
    .replace(/<\/(p|div|section|article|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const markdown = decode(body)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();

  return { title, markdown, images, videos };
}

function strip(s: string): string {
  return decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}
function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

function slugify(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'page';
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  await runCapability('acquire/fetch-url', async () => {
    const url = arg('url');
    if (!url) throw new Error('missing --url');
    const project = arg('project') ?? '_scratch';

    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 vibe-acquire' } });
    if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText} — escalate to WebFetch for blocked/JS pages`);
    const html = await res.text();
    const page = htmlToMarkdown(html, url);

    const dir = workDir(project, 'acquire');
    const outPath = arg('out') ?? path.join(dir, `${slugify(url)}.md`);
    const md = `# ${page.title || url}\n\n> source: ${url} · fetched ${new Date().toISOString()}\n\n` +
      page.markdown +
      (page.images.length ? `\n\n## Images (${page.images.length})\n${page.images.map((u) => `- ${u}`).join('\n')}` : '') +
      (page.videos.length ? `\n\n## Videos (${page.videos.length})\n${page.videos.map((u) => `- ${u}`).join('\n')}` : '');
    fs.writeFileSync(outPath, md, 'utf8');

    appendAcquireRecord(project, { sourceUrl: url, title: page.title, fetchedAt: new Date().toISOString(), localPath: path.resolve(outPath), bytes: Buffer.byteLength(md), tool: 'fetch-url' });

    return { outputs: [path.resolve(outPath)], metrics: { title: page.title, chars: page.markdown.length, images: page.images.length, videos: page.videos.length }, project, source: url, args: process.argv.slice(2) };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) void main();
