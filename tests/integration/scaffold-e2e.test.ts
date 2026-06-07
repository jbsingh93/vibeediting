/**
 * V3.6 — THE KILLER INTEGRATION TEST: proof the product works from zero.
 *
 * `vibe init` into a tmpdir (REAL npm install + ffmpeg detect/provision + Python venv)
 * → the scaffold's own capability suite (the 187-check gate) → `npm run lint` (strict tsc)
 * → a real DemoWelcome still render.
 *
 * Heavy (~5–10 min) and network-bound, so it only runs when VIBE_SCAFFOLD_E2E=1 —
 * CI gives it a dedicated job on windows + macos; locally:
 *   $env:VIBE_SCAFFOLD_E2E='1'; npx vitest run tests/integration/scaffold-e2e.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { initProject } from '../../src/commands/init.js';
import { findOnPath, launchSpec } from '../../src/core/proc.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TSX = path.join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const VIBE = path.join(REPO, 'bin', 'vibe.ts');

const ENABLED = process.env.VIBE_SCAFFOLD_E2E === '1';
const TWENTY_MIN = 20 * 60 * 1000;

let cwd: string | undefined;
// Deleting a full scaffold (node_modules + venv) beats vitest's 10s default hook timeout
// on CI disks — give cleanup five minutes (live-found: the windows run PASSED its test and
// then failed on this hook).
afterAll(() => {
  if (cwd && !process.env.VIBE_SCAFFOLD_E2E_KEEP) rmSync(cwd, { recursive: true, force: true });
}, 5 * 60 * 1000);

function runInProject(projectDir: string, bin: string, args: string[]): { status: number; out: string } {
  const launch = launchSpec(bin, args);
  const r = spawnSync(launch.command, launch.args, {
    cwd: projectDir,
    encoding: 'utf8',
    windowsHide: true,
    windowsVerbatimArguments: launch.windowsVerbatimArguments,
    timeout: TWENTY_MIN,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status ?? -1, out: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}

describe.skipIf(!ENABLED)('V3.6 killer integration: init → suite → lint → render', () => {
  it(
    'a freshly-scaffolded project passes its own gates from zero',
    async () => {
      cwd = mkdtempSync(path.join(tmpdir(), 'vibe-e2e-'));

      // ── init (real npm install + ffmpeg detect-first + venv) ─────────────
      const target = await initProject({
        name: 'e2e-proof',
        cwd,
        install: true,
        ffmpeg: true,
        venv: true,
        ui: false,
        yes: true,
      });
      expect(existsSync(path.join(target, 'node_modules', 'tsx', 'dist', 'cli.mjs'))).toBe(true);

      // Surface what init recorded — invaluable when a CI platform misbehaves.
      const state = JSON.parse(readFileSync(path.join(target, '.vibe', 'state.json'), 'utf8'));
      process.stdout.write(`[scaffold-e2e] provision: ${JSON.stringify(state.provision)}\n`);

      const npm = findOnPath(['npm'])!;
      expect(npm).toBeTruthy();

      // ── the scaffold's own capability suite (the 187-check gate) ─────────
      const suite = runInProject(target, npm, ['test']);
      const failures = suite.out
        .split('\n')
        .filter((l) => /✗|×|Error|failed/.test(l))
        .slice(0, 50)
        .join('\n');
      expect(suite.status, `scaffold suite failed (status ${suite.status}):\n${failures}\n--- tail ---\n${suite.out.slice(-3000)}`).toBe(0);

      // ── strict typecheck inside the scaffold ─────────────────────────────
      const lint = runInProject(target, npm, ['run', 'lint']);
      expect(lint.status, `scaffold lint failed:\n${lint.out.slice(-8000)}`).toBe(0);

      // ── a real still render of the demo comp (the p0-render gate) ────────
      const remotionPkg = JSON.parse(
        readFileSync(path.join(target, 'node_modules', '@remotion', 'cli', 'package.json'), 'utf8'),
      ) as { bin?: Record<string, string> };
      const remotionBin = path.join(target, 'node_modules', '@remotion', 'cli', Object.values(remotionPkg.bin ?? {})[0] ?? 'remotion-cli.js');
      expect(existsSync(remotionBin)).toBe(true);
      mkdirSync(path.join(target, 'out', 'check'), { recursive: true });
      const still = path.join(target, 'out', 'check', 'e2e-demo.png');
      const render = runInProject(target, process.execPath, [remotionBin, 'still', 'DemoWelcome', still, '--frame=30', '--scale=0.3']);
      expect(render.status, `still render failed:\n${render.out.slice(-8000)}`).toBe(0);
      expect(existsSync(still)).toBe(true);
      expect(readFileSync(still).length).toBeGreaterThan(2000);

      // ── the V3.5 verbs through the REAL CLI wiring (commander action signatures) ──
      const vibe = (args: string[]): { status: number; out: string } =>
        runInProject(target, process.execPath, [TSX, VIBE, ...args]);

      // vibe run — capability passthrough (dry-run render preset: prints argv, spends nothing).
      const run = vibe(['run', 'deliver/render-preset', '--', '--preset', 'vertical-ad', '--comp', 'DemoWelcome', '--dry-run']);
      expect(run.status, `vibe run failed:\n${run.out.slice(-4000)}`).toBe(0);

      // vibe upgrade — idempotent on a pristine scaffold (BEFORE new-comp edits Root.tsx).
      const up1 = vibe(['--json', 'upgrade']);
      expect(up1.status, `vibe upgrade failed:\n${up1.out.slice(-4000)}`).toBe(0);
      const report1 = JSON.parse(up1.out.slice(up1.out.indexOf('{'), up1.out.lastIndexOf('}') + 1));
      expect(report1.updated).toHaveLength(0);
      expect(report1.preserved).toHaveLength(0);

      // vibe new-comp — scaffold + register, then the project still typechecks.
      const comp = vibe(['new-comp', 'E2eProof', '--duration', '60']);
      expect(comp.status, `vibe new-comp failed:\n${comp.out.slice(-4000)}`).toBe(0);
      expect(existsSync(path.join(target, 'src', 'compositions', 'e2e-proof', 'Main.tsx'))).toBe(true);
      const relint = runInProject(target, npm, ['run', 'lint']);
      expect(relint.status, `lint after new-comp failed:\n${relint.out.slice(-4000)}`).toBe(0);

      // vibe upgrade — user edits stay sacred (Root.tsx via new-comp, probe.ts by hand).
      const probePath = path.join(target, 'capabilities', 'ingest', 'probe.ts');
      writeFileSync(probePath, `${readFileSync(probePath, 'utf8')}\n// user tweak\n`);
      const up2 = vibe(['--json', 'upgrade']);
      expect(up2.status).toBe(0);
      const report2 = JSON.parse(up2.out.slice(up2.out.indexOf('{'), up2.out.lastIndexOf('}') + 1));
      expect(report2.preserved).toContain('capabilities/ingest/probe.ts');
      expect(report2.preserved).toContain('src/Root.tsx');
      expect(report2.modifiedEngineFiles).toBe(1);
      expect(readFileSync(probePath, 'utf8')).toContain('// user tweak');

      // ── V4: the UI server against the REAL scaffold — a render through POST /api/render ──
      // (the cockpit's render path end-to-end: dry-run preset resolve via the project's own
      // render-preset.ts → the project's Remotion CLI → job progress → file on disk.)
      const { setProjectDir } = await import('../../src/server/context.js');
      const { buildApp } = await import('../../src/server/index.js');
      setProjectDir(target);
      const app = await buildApp();
      try {
        const projects = await app.inject({ method: 'GET', url: '/api/projects' });
        expect(projects.statusCode).toBe(200);

        const styles = await app.inject({ method: 'GET', url: '/api/styles' });
        expect((styles.json() as { styles: unknown[] }).styles.length).toBeGreaterThanOrEqual(7);

        const wiki = await app.inject({ method: 'GET', url: '/api/wiki' });
        expect((wiki.json() as { sections: unknown[] }).sections.length).toBeGreaterThan(3);

        const render = await app.inject({
          method: 'POST',
          url: '/api/render',
          payload: { compId: 'DemoWelcome', preset: 'scene-clip', outName: 'e2e-proof/ui-smoke', frames: '0-29' },
        });
        expect(render.statusCode, `POST /api/render: ${render.body}`).toBe(200);
        // Job routes wrap records in a { job } envelope (the client api.ts contract).
        const jobId = (render.json() as { job: { id: string } }).job.id;
        expect(jobId).toBeTruthy();

        const deadline = Date.now() + 8 * 60 * 1000;
        let job: { status: string; progress?: number; error?: string } = { status: 'queued' };
        while (Date.now() < deadline) {
          const r = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}` });
          job = (r.json() as { job: typeof job }).job;
          if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') break;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        expect(job.status, `ui render job ended ${job.status}: ${job.error ?? ''}`).toBe('done');
        const uiSmoke = path.join(target, 'out', 'e2e-proof', 'ui-smoke.mp4');
        expect(existsSync(uiSmoke)).toBe(true);
        expect(readFileSync(uiSmoke).length).toBeGreaterThan(10_000);
      } finally {
        await app.close();
      }
    },
    TWENTY_MIN,
  );
});
