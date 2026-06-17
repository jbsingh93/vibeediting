/**
 * Lightweight, dependency-free "update available" notifier (the update-notifier pattern,
 * hand-rolled to keep the dependency list tight — Node 20+ has global `fetch`).
 *
 * Contract:
 *  - NEVER blocks the command. The network check runs in a detached background process whose
 *    only job is to refresh a cache file and exit; the current run only ever reads that cache.
 *  - At most one network check per `CHECK_INTERVAL_MS` (cache freshness gate).
 *  - The first run on a fresh machine never notifies (cache is empty) — it just seeds the cache
 *    for next time. Matches update-notifier semantics.
 *  - Honors opt-outs and non-interactive environments (CI, piped output, --json/--quiet).
 *  - Prints to STDERR so it never pollutes stdout (JSON output stays clean).
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';
import { VERSION } from '../version.js';

const PACKAGE_NAME = 'vibeediting';
const CACHE_FILE = join(tmpdir(), 'vibe-update-check.json');
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day

interface UpdateCache {
  latest: string;
  lastCheck: number;
}

/** Numeric major.minor.patch compare; prerelease/build suffixes are ignored (treated as the base). */
export function isVersionNewer(latest: string, current: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const core = String(v).trim().replace(/^v/, '').split(/[-+]/)[0] ?? '';
    const [a = 0, b = 0, c = 0] = core.split('.').map((n) => Number.parseInt(n, 10) || 0);
    return [a, b, c];
  };
  const [la, lb, lc] = parse(latest);
  const [ca, cb, cc] = parse(current);
  if (la !== ca) return la > ca;
  if (lb !== cb) return lb > cb;
  return lc > cc;
}

/** True when the update check should be skipped entirely (opt-out / non-interactive). */
export function shouldSkipCheck(env: NodeJS.ProcessEnv = process.env, isTTY = process.stderr.isTTY): boolean {
  if (env.VIBE_NO_UPDATE_CHECK || env.NO_UPDATE_NOTIFIER) return true;
  if (env.CI) return true;
  if (VERSION === '0.0.0') return true; // running from an unpublished/dev tree
  return !isTTY;
}

function readCache(): UpdateCache | null {
  try {
    const raw = JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as UpdateCache;
    if (raw && typeof raw.latest === 'string' && typeof raw.lastCheck === 'number') return raw;
  } catch {
    /* missing or corrupt → treat as no cache */
  }
  return null;
}

/** Fire-and-forget detached process: fetch the latest version from the npm registry, write cache, exit. */
function spawnBackgroundRefresh(): void {
  // Inline so we ship no extra file. The child writes the SAME cache shape readCache() expects.
  const script =
    `fetch(${JSON.stringify(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`)})` +
    `.then(r=>r.json()).then(j=>{if(j&&j.version){` +
    `require('node:fs').writeFileSync(${JSON.stringify(CACHE_FILE)},` +
    `JSON.stringify({latest:j.version,lastCheck:Date.now()}))}}).catch(()=>{});`;
  try {
    const child = spawn(process.execPath, ['-e', script], {
      detached: true,
      stdio: 'ignore',
      timeout: 10_000,
    });
    child.unref();
  } catch {
    /* spawning the refresh must never break the CLI */
  }
}

/** The boxed banner shown when a newer version is available. */
export function formatUpdateBanner(latest: string, current: string): string {
  const lines = [
    `Update available ${chalk.dim(current)} → ${chalk.green(latest)}`,
    `Run ${chalk.cyan('npm i -g vibeediting')} to update`,
    chalk.dim('then `vibe upgrade` in each project to sync its files'),
  ];
  const width = Math.max(...lines.map((l) => stripAnsi(l).length));
  const top = `╭${'─'.repeat(width + 2)}╮`;
  const bottom = `╰${'─'.repeat(width + 2)}╯`;
  const body = lines
    .map((l) => `│ ${l}${' '.repeat(width - stripAnsi(l).length)} │`)
    .join('\n');
  return chalk.yellow([top, body, bottom].join('\n'));
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, '');
}

/**
 * Entry point — call once at CLI startup. Reads the cache, prints a banner if a newer version is
 * already known, and (if the cache is stale) kicks off a background refresh for next time.
 */
export function notifyUpdate(): void {
  if (shouldSkipCheck()) return;
  const cache = readCache();
  const fresh = cache !== null && Date.now() - cache.lastCheck < CHECK_INTERVAL_MS;
  if (!fresh) spawnBackgroundRefresh();
  if (cache && isVersionNewer(cache.latest, VERSION)) {
    process.stderr.write(`\n${formatUpdateBanner(cache.latest, VERSION)}\n\n`);
  }
}

/** Test seam: write the cache file directly. Not used by the CLI. */
export function __writeCacheForTest(cache: UpdateCache): void {
  writeFileSync(CACHE_FILE, JSON.stringify(cache));
}
