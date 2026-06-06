#!/usr/bin/env tsx
/**
 * capabilities/assemble/pipeline.ts — sequential op composer (plan P1D.2).
 *
 * An array of ops → idempotent sequential execution, each step's output feeding the next, all written
 * under the disposable work tree (out/work/<project>/<stage>/). Returns every step's OpResult so the
 * verifier (P2) can inspect the chain.
 *
 * Example (the P1D acceptance chain): trim → applyLut → mux → normalizeLoudness.
 */
import * as path from 'node:path';
import { appendProvenance, describeOutputs, workDir } from '../_env/contract';
import type { OpResult } from './ffmpeg-ops';

export interface PipelineStep {
  /** Stable name → also the output filename stem within the stage dir. */
  name: string;
  /** Run the op; `input` is the previous step's output, `outPath` is where to write. */
  run: (input: string, outPath: string) => OpResult;
  /** Output extension (default mp4). */
  ext?: string;
}

export interface PipelineResult {
  success: boolean;
  steps: OpResult[];
  finalOutput: string | null;
}

/**
 * Run `steps` starting from `initialInput`. Each step writes
 *   out/work/<project>/<stage>/NN-<name>.<ext>
 * and its output becomes the next step's input. Stops at the first failure.
 */
export function pipeline(initialInput: string, steps: PipelineStep[], project: string, stage = 'assemble'): PipelineResult {
  const dir = workDir(project, stage);
  const results: OpResult[] = [];
  let input = path.resolve(initialInput);

  for (let k = 0; k < steps.length; k++) {
    const step = steps[k];
    const outPath = path.join(dir, `${String(k).padStart(2, '0')}-${step.name}.${step.ext ?? 'mp4'}`);
    const res = step.run(input, outPath);
    results.push(res);
    if (!res.success) return { success: false, steps: results, finalOutput: null };
    input = res.outputPath;
  }

  appendProvenance(project, {
    ts: new Date().toISOString(),
    capability: `assemble/pipeline:${stage}`,
    outputs: describeOutputs([input]),
    note: steps.map((s) => s.name).join(' → '),
  });
  return { success: true, steps: results, finalOutput: input };
}
