#!/usr/bin/env tsx
/**
 * Capability regression runner (plan X.1 "media gate").
 *   npm test            → fast suite: P0 (foundations) + P0.9 contract + P1 capability engines
 *   npm run test:render → also the slow tier (demo-comp still-render + librosa beat-detect)
 *
 * Add a `capabilities/_tests/*.test.ts` file and register it below as the build grows.
 */
import { runAll } from './harness';

async function main(): Promise<void> {
  const files = [
    // P0 — foundations
    './p0.1-ffmpeg.test',
    './p0.2-venv.test',
    './p0.3-doctor.test',
    './p0.4-remotion.test',
    './p0.5-captions.test',
    './p0.6-scaffold.test',
    './p0.7-docs.test',
    // P0.9 — capability contract (GAP-4)
    './p0.9-contract.test',
    // P1 — global capability engines
    './p1a-audio.test',
    './p1b-color.test',
    './p1c-ingest.test',
    './p1d-assemble.test',
    './p1e-perception.test',
    './p1f-acquire.test',
    // P1G — screen-record capture capability (Playwright explore → deterministic page.screencast → 30fps stitch)
    './p1g-screen-record.test',
    // P1H — deliver/export-premiere-xml (FCP7 XMEML: segments.json → Premiere clips + markers)
    './p1h-deliver-premiere-xml.test',
    // P1I — deliver/export-davinci-edl (CMX3600 EDL: segments.json → DaVinci clips + * LOC: markers)
    './p1i-deliver-davinci-edl.test',
    // P1J — generate/thumbnail (GAP-72: video frame + prompt → gpt-image-2 thumbnail, dry-run only)
    './p1j-thumbnail.test',
    // P1K — deliver tools: loudnorm two-pass + silence fallback · disk guard · render presets (dry-run)
    './p1k-deliver.test',
    // P1L — generate/elevenlabs-{tts,music,sfx}: key + arg guards fire before any network call
    './p1l-elevenlabs.test',
    // P1M — perception CLIs: review guards + cut-doctor's deterministic pipeline run LIVE (no keys)
    './p1m-perception-cli.test',
    // P1N — screen-record capture CLIs: fail-fast envelope guards (no browser launched)
    './p1n-screen-record-cli.test',
    // P2 — orchestration spine (manifest · provenance · split verifier · proxy · approval gate · budget guard)
    './p2-orchestrate.test',
    // P3 — Remotion template-ization (timelines + Zod props + calculateMetadata + motion lib + GSAP + variants + alpha)
    './p3-templates.test',
    // V3 — scaffold payload: base files + brand system + skills seed (template/scaffold both)
    './v3-template.test',
    // P4V — AI VFX capability layer (router + paid wrappers + sanitizers + Aleph + compositor + color-match)
    './p4v-vfx.test',
    // P4W — the VFX executable layer LIVE: Reinhard color transfer (image/video/EMA) + ffmpeg compositor
    './p4w-vfx-exec.test',
  ];
  if (process.argv.includes('--render')) {
    files.push('./p0-render.test'); // demo-comp still render
    files.push('./p1c-beat.test'); // librosa beat-detect (slow: numba JIT)
  }
  for (const f of files) await import(f);
  process.exit(await runAll());
}

void main();
