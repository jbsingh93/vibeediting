#!/usr/bin/env tsx
/**
 * capabilities/vfx/color-match/match.ts — TS launcher for the Python Reinhard LAB color transfer
 * (plan P4V.11; GAP-40). Mirrors `audio/run-mastering.ts`'s subprocess-isolation pattern.
 *
 * Why a TS launcher: the orchestration spine (P2) drives every capability via the same contract
 * envelope; routing the venv-python call through tsx keeps argv normalization, .env loading, and
 * provenance routing consistent with the rest of `capabilities/*.ts`.
 *
 * CLI: tsx match.ts --in SRC --reference REF --out OUT [--ema 0.1] [--alpha-passthrough] [--project NAME]
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT, requireInputFile, runCapability, VENV_PY } from '../../_env/contract';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  await runCapability('vfx/color-match', async () => {
    const src = requireInputFile(arg('in'), 'input video/image');
    const ref = requireInputFile(arg('reference') ?? arg('ref'), 'reference frame/video');
    const outArg = arg('out');
    if (!outArg) throw new Error('missing --out');
    const out = path.resolve(outArg);
    const project = arg('project') ?? '_scratch';
    const ema = arg('ema') ?? '0.1';
    fs.mkdirSync(path.dirname(out), { recursive: true });

    const pyExe = VENV_PY;
    const script = path.join(REPO_ROOT, 'capabilities', 'vfx', 'color-match', 'transfer.py');
    const argv = ['--in', src, '--reference', ref, '--out', out, '--ema', ema, '--project', project];
    if (flag('alpha-passthrough')) argv.push('--alpha-passthrough');

    const r = spawnSync(pyExe, [script, ...argv], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) {
      throw new Error(`color-match transfer.py failed (exit ${r.status}):\n${(r.stderr ?? '').slice(-1200)}`);
    }
    // transfer.py already wrote its own envelope; we surface the same outputs into ours.
    const lines = (r.stdout ?? '').trim().split('\n').filter(Boolean);
    let metrics: Record<string, unknown> = {};
    try {
      const inner = JSON.parse(lines[lines.length - 1] ?? '{}');
      metrics = (inner.metrics as Record<string, unknown>) ?? {};
    } catch {
      /* no inner envelope — surface a minimal one */
    }

    return { outputs: [out], metrics, project, args: process.argv.slice(2) };
  });
}

void main();
