#!/usr/bin/env node
/**
 * fake-render.mjs — a stand-in for `remotion render` driven by the jobs.ts VIBE_RENDER_CMD seam.
 *
 * jobs.ts spawns this as: [node, fake-render.mjs, 'render', <comp>, <out/rel.mp4>, ...flags]
 * (the argv after 'render' is the dry-run-resolved render argv: positionals comp + out, then flags).
 *
 * It prints Remotion-style progress lines ("Rendered N/60") that parseRenderProgress() reads, waits
 * ~VIBE_FAKE_RENDER_MS (default 300) so the test can observe `running`, writes a ≥2KB dummy file at
 * the out path (relative to cwd = projectDir), and exits 0.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const argv = process.argv.slice(2);
// argv[0] === 'render'; argv[1] = comp; argv[2] = out/<name>.mp4; the rest are flags.
const outRel = argv[2];
const delayMs = Number(process.env.VIBE_FAKE_RENDER_MS) || 300;

process.stdout.write('Rendered 0/60\n');

setTimeout(() => {
  process.stdout.write('Rendered 30/60\n');
  process.stdout.write('Rendered 60/60\n');
  try {
    if (outRel) {
      const out = path.isAbsolute(outRel) ? outRel : path.resolve(process.cwd(), outRel);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      // ≥2KB dummy payload so jobs.ts's statSync(out).size > 0 (and the test's ≥2KB assert) pass.
      fs.writeFileSync(out, Buffer.alloc(2048, 0x42));
    }
  } catch (e) {
    process.stderr.write('fake-render write failed: ' + String(e) + '\n');
    process.exit(1);
  }
  process.exit(0);
}, delayMs);
