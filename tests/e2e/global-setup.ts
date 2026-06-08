/**
 * E2E global setup — seed deterministic projects INTO the MAIN fixture AFTER fixture.mjs recreated
 * the trees but (because Playwright starts webServers after globalSetup) BEFORE the server boots.
 * We write manifests via the SAME service the server reads (src/server/manifest.ts under tsx) plus
 * direct fs for the on-disk states the server itself never writes (blocked / complete — those are
 * the agent's / capability runs' job, mirrored here the way the parent suite seeds fixtures).
 *
 * Seeds (all under test-artifacts/e2e-project/):
 *   - e2e-demo   wizard-shaped (9:16-ad), one COMPLETE ingest stage, approvals ['motion'], notes
 *                with an `Estimated cost: $1.23 …` line (plan-chip spec), brief.md, captions.json +
 *                a real silent WAV in public/ (finetune), and a real tiny render in deliver/ (distill
 *                + renders panel).
 *   - e2e-gate   motion BLOCKED at the gate (approvals ['motion']).
 *   - e2e-agent  agent-mode (inputs.mode='agent'), plan_gate_stage motion, stub brief.
 * Plus a user style skill (.claude/skills/my-e2e-style/SKILL.md) so the wizard shows a "yours" style.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  MAIN_PROJECT_DIR,
  MAIN_PROJECTS_ROOT,
  CODEX_PROJECT_DIR,
  CODEX_PROJECTS_ROOT,
} from '../../playwright.config.js';

const PUBLIC = path.join(MAIN_PROJECT_DIR, 'public');
const DELIVER = path.join(MAIN_PROJECT_DIR, 'deliver');

/** A real (decodable) silent 16-bit PCM mono WAV so an inline <audio> never trips the console guard. */
function silentWav(seconds = 0.4, sampleRate = 8000): Buffer {
  const samples = Math.round(seconds * sampleRate);
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

/** Force stage status on disk (server never writes blocked/complete — only the agent/capabilities do). */
function setStage(
  project: string,
  stage: string,
  patch: Record<string, unknown>,
): void {
  const p = path.join(MAIN_PROJECTS_ROOT, project, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    stages: Record<string, Record<string, unknown>>;
    updated_at: string;
    status: string;
  };
  m.stages[stage] = { status: 'pending', params: {}, outputs: [], attempts: 0, ...m.stages[stage], ...patch };
  m.updated_at = new Date().toISOString();
  // rough rollup so the gallery word matches (the server re-derives on its own writes anyway)
  const all = Object.values(m.stages);
  m.status = all.some((s) => s.status === 'blocked')
    ? 'blocked'
    : all.some((s) => s.status === 'running')
      ? 'running'
      : all.every((s) => s.status === 'complete')
        ? 'complete'
        : 'running';
  fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n', 'utf8');
}

export default async function globalSetup(): Promise<void> {
  // the manifest service derives projectsRoot() from VIBE_PROJECTS_DIR — point it at the MAIN tree.
  process.env.VIBE_PROJECTS_DIR = MAIN_PROJECTS_ROOT;
  const { createManifest, startStage } = await import('../../src/server/manifest.js');

  // ── e2e-demo — the wizard-shaped, plan-chip, finetune + render fixture ──────────
  createManifest('e2e-demo', {
    inputs: { mode: 'wizard', format: '9:16-ad', lang: 'en', plan_gate_stage: 'motion' },
    approvals_required: ['motion'],
    notes:
      '# Plan — e2e-demo\n\n' +
      '| # | Scene | Sec |\n|---|---|---|\n| 1 | Hook | 0–3 |\n| 2 | CTA | 3–8 |\n\n' +
      'Estimated cost: $1.23 (ElevenLabs TTS, 30s)\n',
    force: true,
  });
  startStage('e2e-demo', 'ingest');
  setStage('e2e-demo', 'ingest', {
    status: 'complete',
    finished_at: new Date().toISOString(),
    outputs: ['public/e2e-demo/captions.json'],
  });
  fs.writeFileSync(
    path.join(MAIN_PROJECTS_ROOT, 'e2e-demo', 'brief.md'),
    '# Brief — e2e-demo\n\nA 9:16 ad. Hook: "AI took your job". CTA: "Follow for more".\n',
    'utf8',
  );
  // finetune fixtures: a captions.json the editor renders as chips, + a real silent WAV asset.
  const demoPub = path.join(PUBLIC, 'e2e-demo');
  fs.mkdirSync(demoPub, { recursive: true });
  fs.writeFileSync(
    path.join(demoPub, 'captions.json'),
    JSON.stringify([
      { text: 'AI', startMs: 200, endMs: 600, timestampMs: null, confidence: null },
      { text: 'took', startMs: 700, endMs: 1100, timestampMs: null, confidence: null },
      { text: 'your', startMs: 1200, endMs: 1600, timestampMs: null, confidence: null },
      { text: 'job', startMs: 3000, endMs: 3600, timestampMs: null, confidence: null },
    ]),
    'utf8',
  );
  fs.writeFileSync(path.join(demoPub, 'bgm-bed.wav'), silentWav());
  // Dedicated EDL projects (no captions) for the VE.1–VE.4 editor specs, so the caption-only chip
  // specs on e2e-demo stay in captions-only mode. Each spec that SAVES gets its own project so the
  // file-order test run can't contaminate the next. crossfade 0 → output time == source time.
  const seedEdlProject = (id: string, opts: { broll?: boolean; audio?: boolean } = {}): void => {
    createManifest(id, {
      inputs: { mode: 'wizard', format: '9:16-ad', lang: 'en', plan_gate_stage: 'motion' },
      notes: `# Plan — ${id}\n\nA real-footage cut for the light NLE.\n`,
      force: true,
    });
    startStage(id, 'ingest');
    setStage(id, 'ingest', { status: 'complete', finished_at: new Date().toISOString(), outputs: [`public/${id}/segments.json`] });
    const pub = path.join(PUBLIC, id);
    fs.mkdirSync(pub, { recursive: true });
    fs.writeFileSync(
      path.join(pub, 'segments.json'),
      JSON.stringify({
        fps: 30,
        crossfadeFrames: 0,
        src: `${id}/clip.mp4`,
        segments: [
          { id: 's1', srcStart: 0, srcEnd: 1, cap: '' },
          { id: 's2', srcStart: 1, srcEnd: 2, cap: '' },
          { id: 's3', srcStart: 2, srcEnd: 3, cap: '' },
        ],
      }),
      'utf8',
    );
    // footage asset for the VE.3 b-roll picker (undecodable bytes → default length + placeholder).
    if (opts.broll) fs.writeFileSync(path.join(pub, 'broll.mp4'), Buffer.alloc(2048, 0x21));
    // VE.7 range audio: a music bed (one to-end BGM track) + audio assets for the insert pickers.
    if (opts.audio) {
      fs.writeFileSync(path.join(pub, 'bgm-bed.mp3'), Buffer.alloc(2048, 0x33));
      fs.writeFileSync(path.join(pub, 'sfx-whoosh.mp3'), Buffer.alloc(2048, 0x44));
      fs.writeFileSync(
        path.join(pub, 'audio-mix.json'),
        JSON.stringify({
          masterLufs: -14,
          tracks: [{ id: 'bgm-bed', role: 'bgm', src: `${id}/bgm-bed.mp3`, offsetSec: 0, gainDb: -12, duck: { depth: 0.12 } }],
        }),
        'utf8',
      );
    }
  };
  seedEdlProject('e2e-edl'); // VE.2 structural verbs
  seedEdlProject('e2e-edl-broll', { broll: true }); // VE.3 b-roll insert
  seedEdlProject('e2e-edl-tr'); // VE.4 transitions
  seedEdlProject('e2e-edl-fx'); // VE.5 per-clip effects
  seedEdlProject('e2e-edl-agent'); // VE.6 range-scoped "Ask Editor Agent" (claude leg + diff card)
  seedEdlProject('e2e-edl-audio', { audio: true }); // VE.7 range audio — dip music (own project; save mutates disk)
  seedEdlProject('e2e-edl-audio2', { audio: true }); // VE.7 range audio — footage mute + insert (own project)
  // a real tiny render so RendersPanel shows a row (distill + renders specs).
  const demoDeliver = path.join(DELIVER, 'e2e-demo');
  fs.mkdirSync(demoDeliver, { recursive: true });
  fs.writeFileSync(path.join(demoDeliver, 'AdReel-loudnorm.mp4'), Buffer.alloc(4096, 0x42));

  // ── e2e-gate — motion blocked at the gate ──────────────────────────────────────
  createManifest('e2e-gate', {
    inputs: { mode: 'wizard', format: '9:16-ad', lang: 'en', plan_gate_stage: 'motion' },
    approvals_required: ['motion'],
    notes: '# Plan — e2e-gate\n\nA blocked motion gate to approve.\n',
    force: true,
  });
  startStage('e2e-gate', 'ingest');
  setStage('e2e-gate', 'ingest', { status: 'complete', finished_at: new Date().toISOString() });
  startStage('e2e-gate', 'motion');
  setStage('e2e-gate', 'motion', {
    status: 'blocked',
    finished_at: new Date().toISOString(),
    outputs: ['out/work/e2e-gate/motion/preview-v1.mp4'],
  });

  // ── e2e-gate2 — a second blocked motion gate (Ctrl+Enter keyboard-approve spec) ──
  createManifest('e2e-gate2', {
    inputs: { mode: 'wizard', format: '9:16-ad', lang: 'en', plan_gate_stage: 'motion' },
    approvals_required: ['motion'],
    notes: '# Plan — e2e-gate2\n',
    force: true,
  });
  startStage('e2e-gate2', 'motion');
  setStage('e2e-gate2', 'motion', {
    status: 'blocked',
    finished_at: new Date().toISOString(),
    outputs: ['out/work/e2e-gate2/motion/preview-v1.mp4'],
  });

  // ── e2e-plan — plan parked, gate stage still PENDING (the kickoff-flow shape):
  //    the Plan tab must offer the plan-approve affordance (live-found at V5 Proof A —
  //    approvePlan() existed but no UI element called it). Dedicated fixture: the spec mutates it.
  createManifest('e2e-plan', {
    inputs: { mode: 'wizard', format: '9:16-ad', lang: 'en', plan_gate_stage: 'motion' },
    approvals_required: ['motion', 'deliver'],
    notes: '# Plan — e2e-plan\n\nScene table parked at the plan gate.\n\nEstimated cost: $0.00 — no paid generation.\n',
    force: true,
  });

  // ── e2e-agent — agent-mode project (clean slate cockpit) ────────────────────────
  createManifest('e2e-agent', {
    inputs: { mode: 'agent', lang: 'en', plan_gate_stage: 'motion' },
    approvals_required: ['motion', 'deliver'],
    notes: '# Plan — e2e-agent\n\n_(awaiting the agent)_\n',
    force: true,
  });
  startStage('e2e-agent', 'ingest'); // running → the mock completes it (VIBE_MOCK_COMPLETE_STAGE default)
  fs.writeFileSync(
    path.join(MAIN_PROJECTS_ROOT, 'e2e-agent', 'brief.md'),
    '# Brief — e2e-agent\n\nAgent-mode project — describe the video in the chat.\n',
    'utf8',
  );

  // ── e2e-demo style-spec (mimic result) — deliver/<p>/refs/ is where listStyleSpecs() looks.
  //    Drives style-spec.spec.ts: the card renders measured signals + "use as my style" prefills.
  const demoRefs = path.join(DELIVER, 'e2e-demo', 'refs');
  fs.mkdirSync(demoRefs, { recursive: true });
  fs.writeFileSync(
    path.join(demoRefs, 'hormozi-ref.style-spec.json'),
    JSON.stringify(
      {
        signals: { durationSec: 28, cutCount: 14, aslSec: 2, lufs: -13.4, palette: ['#0a84ff', '#000000', '#ffffff'] },
        specialists: [
          { specialist: 'pacing', summary: 'fast hook-driven cuts, ~2s ASL' },
          { specialist: 'color', summary: 'high-contrast, electric blue accent on black' },
        ],
        note: 'distilled from a reference clip',
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  // ── e2e-project/src/Root.tsx — a multi-comp file so /api/comps (parseCompIds) yields >1 id.
  //    Drives the deliver-queue comps-dropdown extension.
  const srcDir = path.join(MAIN_PROJECT_DIR, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, 'Root.tsx'),
    [
      "import { Composition, Still } from 'remotion';",
      '',
      'export const RemotionRoot = () => (',
      '  <>',
      '    <Composition id="AdReel" durationInFrames={240} fps={30} width={1080} height={1920} component={() => null} />',
      "    <Composition id={'SquareAd'} durationInFrames={150} fps={30} width={1080} height={1080} component={() => null} />",
      '    <Still id="ThumbCard" width={1280} height={720} component={() => null} />',
      '  </>',
      ');',
      '',
    ].join('\n'),
    'utf8',
  );

  // ── an UNSCOPED stray render: a video at the deliver/ ROOT (not under a project dir) → listRenders
  //    tags it scoped:false → the [data-render-unscoped] chip (queue.spec.ts). Real bytes so it lists.
  fs.writeFileSync(path.join(DELIVER, 'stray-at-root.mp4'), Buffer.alloc(4096, 0x42));

  // ── e2e-codex project (in the CODEX tree, seeded by pointing the manifest service at its root) ──
  //    Drives codex.spec.ts (agent: 'codex' rides the tree's vibe.config.json from fixture.mjs).
  const savedRoot = process.env.VIBE_PROJECTS_DIR;
  process.env.VIBE_PROJECTS_DIR = CODEX_PROJECTS_ROOT;
  createManifest('e2e-codex', {
    inputs: { mode: 'agent', lang: 'en', plan_gate_stage: 'motion' },
    approvals_required: ['motion', 'deliver'],
    notes: '# Plan — e2e-codex\n\n_(awaiting codex)_\n',
    force: true,
  });
  fs.writeFileSync(
    path.join(CODEX_PROJECTS_ROOT, 'e2e-codex', 'brief.md'),
    '# Brief — e2e-codex\n\nCodex-mode project — describe the video in the chat.\n',
    'utf8',
  );
  // VE.6 codex parity: an EDL project in the codex tree so the range "Ask Editor Agent" prefill +
  // turn routing can be exercised against the codex adapter (codex.spec.ts), mirroring the main leg.
  // (setStage is hardcoded to the MAIN tree; the finetune editor reads public/ docs independent of
  //  stage status, so the codex EDL project just needs a manifest + segments.json.)
  createManifest('e2e-codex-edl', {
    inputs: { mode: 'wizard', format: '9:16-ad', lang: 'en', plan_gate_stage: 'motion' },
    notes: '# Plan — e2e-codex-edl\n\nA real-footage cut for the codex Ask-Editor-Agent parity leg.\n',
    force: true,
  });
  const codexEdlPub = path.join(CODEX_PROJECT_DIR, 'public', 'e2e-codex-edl');
  fs.mkdirSync(codexEdlPub, { recursive: true });
  fs.writeFileSync(
    path.join(codexEdlPub, 'segments.json'),
    JSON.stringify({
      fps: 30,
      crossfadeFrames: 0,
      src: 'e2e-codex-edl/clip.mp4',
      segments: [
        { id: 's1', srcStart: 0, srcEnd: 1, cap: '' },
        { id: 's2', srcStart: 1, srcEnd: 2, cap: '' },
        { id: 's3', srcStart: 2, srcEnd: 3, cap: '' },
      ],
    }),
    'utf8',
  );
  process.env.VIBE_PROJECTS_DIR = savedRoot ?? MAIN_PROJECTS_ROOT;

  // ── e2e-agent-fail — agent-mode project dedicated to agent-fail.spec, so the persisted error
  //    turn it writes to chat.jsonl never replays into e2e-agent (agent.spec / question.spec).
  createManifest('e2e-agent-fail', {
    inputs: { mode: 'agent', lang: 'en', plan_gate_stage: 'motion' },
    approvals_required: ['motion', 'deliver'],
    notes: '# Plan — e2e-agent-fail\n\n_(awaiting the agent)_\n',
    force: true,
  });
  fs.writeFileSync(
    path.join(MAIN_PROJECTS_ROOT, 'e2e-agent-fail', 'brief.md'),
    '# Brief — e2e-agent-fail\n\nAgent-mode project for the failure-recovery spec.\n',
    'utf8',
  );

  // ── a user-distilled style skill so the wizard's step 2 shows a "yours" style ────
  const skillDir = path.join(MAIN_PROJECT_DIR, '.claude', 'skills', 'my-e2e-style');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    [
      '---',
      'name: my-e2e-style',
      'description: a distilled e2e style',
      'vibe-style: true',
      'vibe-style-label: My E2E Style',
      'vibe-style-hint: ported from a finished project',
      '---',
      '',
      '# My E2E Style',
      '',
      'Patterns and rules only.',
      '',
    ].join('\n'),
    'utf8',
  );
}
