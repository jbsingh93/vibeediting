#!/usr/bin/env tsx
/**
 * capabilities/audio/run-mastering.ts — isolated-subprocess mastering wrapper (plan P1A.3).
 *
 * Runs the Python mastering chain in a CHILD PROCESS (VST3 plugins can crash the host — GAP/CP §3.4),
 * then the loudness finalize, and emits ONE capability envelope. This is the entry the orchestrator
 * and style skills call:
 *
 *   master.py (creative chain) -> work/<project>/audio/mastered.wav
 *   loudness.py (true-peak -14 LUFS / -1 dBTP finalize, GAP-14) -> OUT
 *
 * CLI:
 *   tsx run-mastering.ts --in IN.wav --out OUT.wav [--profile course-mic-lift|studio|voice|music-bed]
 *       [--target -14] [--tp -1] [--project NAME] [--vst PATH --vst-param k=v]
 */
import * as path from 'node:path';
import { requireInputFile, run, runCapability, VENV_PY, workDir } from '../_env/contract';



function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function passthrough(names: string[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    const v = arg(n);
    if (v !== undefined) out.push(`--${n}`, v);
  }
  return out;
}

/** Parse a child capability's JSON envelope (the LAST non-empty stdout line). */
function parseEnvelope(stdout: string): { success: boolean; outputs: string[]; metrics: Record<string, unknown>; error?: string } {
  const lines = stdout.trim().split('\n').filter(Boolean);
  const last = lines[lines.length - 1] ?? '{}';
  try {
    return JSON.parse(last);
  } catch {
    throw new Error(`child did not emit a JSON envelope; got:\n${stdout.slice(-1000)}`);
  }
}

async function main(): Promise<void> {
  await runCapability('audio/run-mastering', async () => {
    const inPath = requireInputFile(arg('in'), 'input audio');
    const outPath = arg('out');
    if (!outPath) throw new Error('missing --out');
    const project = arg('project') ?? '_scratch';
    const profile = arg('profile') ?? 'voice';

    const masteredWav = path.join(workDir(project, 'audio'), 'mastered.wav');

    // 1) creative chain in an isolated subprocess
    const masterArgs = [
      path.join(__dirname, 'master.py'),
      '--in', inPath, '--out', masteredWav, '--profile', profile,
      ...passthrough(['hpf', 'gate-threshold', 'comp-threshold', 'comp-ratio', 'demud-gain',
        'presence-gain', 'presence-hz', 'deess-gain', 'reverb', 'makeup', 'vst', 'vst-param']),
      '--project', project,
    ];
    const m = run(VENV_PY, masterArgs);
    if (m.status !== 0) throw new Error(`master.py failed (exit ${m.status}):\n${m.stderr.slice(-1500)}`);
    const mEnv = parseEnvelope(m.stdout);
    if (!mEnv.success) throw new Error(`master.py: ${mEnv.error}`);

    // 2) true-peak finalize
    const l = run(VENV_PY, [
      path.join(__dirname, 'loudness.py'),
      '--in', masteredWav, '--out', outPath,
      '--target', arg('target') ?? '-14', '--tp', arg('tp') ?? '-1',
      '--project', project,
    ]);
    if (l.status !== 0) throw new Error(`loudness.py failed (exit ${l.status}):\n${l.stderr.slice(-1500)}`);
    const lEnv = parseEnvelope(l.stdout);
    if (!lEnv.success) throw new Error(`loudness.py: ${lEnv.error}`);

    return {
      outputs: [path.resolve(outPath)],
      metrics: { profile, master: mEnv.metrics, loudness: lEnv.metrics },
      project,
      args: process.argv.slice(2),
    };
  });
}

void main();
