#!/usr/bin/env tsx
/**
 * capabilities/deliver/check-disk-space.ts — pre-render disk guard (plan P1E.3). Ports check-disk-space.sh.
 *
 * Long renders + intermediates fill disks. Warns/blocks if the free space on the output drive is below a
 * threshold before a render starts.
 *
 * CLI: tsx check-disk-space.ts [--path out] [--min-gb 5] [--project NAME]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runCapability } from '../_env/contract';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  await runCapability('deliver/check-disk-space', async () => {
    const target = path.resolve(arg('path') ?? 'out');
    const minGb = parseFloat(arg('min-gb') ?? '5');
    fs.mkdirSync(target, { recursive: true });
    const stat = fs.statfsSync(target);
    const freeGb = (stat.bfree * stat.bsize) / 1024 ** 3;
    const totalGb = (stat.blocks * stat.bsize) / 1024 ** 3;
    const ok = freeGb >= minGb;
    console.error(`disk @ ${target}: ${freeGb.toFixed(1)} GB free / ${totalGb.toFixed(1)} GB · min ${minGb} GB → ${ok ? 'OK' : 'LOW'}`);
    if (!ok) throw new Error(`only ${freeGb.toFixed(1)} GB free (< ${minGb} GB) on the output drive — free space before rendering`);
    return { outputs: [], metrics: { path: target, freeGb: +freeGb.toFixed(1), totalGb: +totalGb.toFixed(1), minGb, ok }, project: arg('project') ?? '_scratch', args: process.argv.slice(2) };
  });
}

void main();
