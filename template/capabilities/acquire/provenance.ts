#!/usr/bin/env tsx
/**
 * capabilities/acquire/provenance.ts — the acquisition provenance contract (plan P1F.4, GAP-48).
 *
 * Every acquired item (page text, downloaded media, direct asset) appends a record to a per-project
 * `provenance.json` (a JSON array) so any external byte in the project is traceable + reproducible.
 * Feeds the manifest (P2).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '../_env/contract';

export interface AcquireRecord {
  sourceUrl: string;
  title?: string;
  author?: string;
  fetchedAt: string;
  localPath: string;
  sha256?: string;
  bytes?: number;
  tool: string; // "fetch-url" | "download-asset" | "yt-dlp <ver>"
  usageIntent?: string;
}

/** acquire provenance lives beside the project work tree. */
export function acquireProvenancePath(project: string): string {
  const dir = path.join(REPO_ROOT, 'out', 'work', project.replace(/[^a-zA-Z0-9._-]/g, '-'), 'acquire');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'provenance.json');
}

export function appendAcquireRecord(project: string, rec: AcquireRecord): void {
  const p = acquireProvenancePath(project);
  const arr: AcquireRecord[] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
  arr.push(rec);
  fs.writeFileSync(p, JSON.stringify(arr, null, 2) + '\n', 'utf8');
}
