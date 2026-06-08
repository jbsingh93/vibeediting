#!/usr/bin/env node
/**
 * mock-agent.mjs — a stand-in for the native `claude` CLI used by ALL agent tests
 * (VIBE_AGENT_BIN seam). The real subscription CLI is NEVER spawned in CI (zero spend).
 * It emits a scripted stream-json transcript (init → text → tool_use → tool_result → result)
 * AND, to prove the brain↔body unification, atomically mutates the project manifest it was
 * told about (VIBE_PROJECT) — exactly like the real CLI would.
 *
 * Env knobs (set by the test/adapter):
 *   VIBE_PROJECT             the project id (passed by the adapter in the spawn env)
 *   VIBE_PROJECTS_DIR        manifest root (the temp/disposable dir)
 *   VIBE_MOCK_COMPLETE_STAGE stage to flip to complete (default: ingest)
 *   VIBE_MOCK_ARGV_LOG       append-log of argv per invocation (assert --resume on turn 2)
 *   VIBE_MOCK_STDIN_LOG      append-log of the stdin body per invocation (assert stdin path)
 *   VIBE_MOCK_SCENARIO       path to a scenario JSON; when the FILE EXISTS at invocation the
 *                            mock plays it instead of the default transcript. Shape:
 *                            { brief?: string, notes?: string,
 *                              stages?: { name, status, approved? }[], reply?: string,
 *                              question?: { questions: [...] } }.
 *   VIBE_MOCK_SLEEP_MS       when set, the mock emits init + an opening text event, then SLEEPS
 *                            this long mid-turn BEFORE finishing (the "slow turn" scenario). Lets a
 *                            test send {type:'cancel'} while the turn is RUNNING and assert the
 *                            child was killed (no `done` ever arrives if the kill works). Default 0.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const argv = process.argv.slice(2);

if (process.env.VIBE_MOCK_ARGV_LOG) {
  try {
    fs.appendFileSync(process.env.VIBE_MOCK_ARGV_LOG, argv.join(' ') + '\n');
  } catch {
    /* ignore */
  }
}

// Read whatever stdin carries (the adapter pipes long/multi-line prompts here). Non-blocking:
// if stdin is closed immediately (no piped prompt) this resolves with ''.
const stdinBody = await new Promise((resolve) => {
  let data = '';
  if (process.stdin.isTTY) {
    resolve('');
    return;
  }
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (data += d));
  process.stdin.on('end', () => resolve(data));
  process.stdin.on('error', () => resolve(data));
});
if (process.env.VIBE_MOCK_STDIN_LOG && stdinBody) {
  try {
    fs.appendFileSync(process.env.VIBE_MOCK_STDIN_LOG, JSON.stringify(stdinBody) + '\n');
  } catch {
    /* ignore */
  }
}

const resumeIdx = argv.indexOf('--resume');
const resumed = resumeIdx >= 0;
const sessionId = resumed ? argv[resumeIdx + 1] : 'mock-session-1';

const out = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

// ── slow-turn scenario: stream an opening, then HANG so a test can cancel mid-turn ──
// A test sets VIBE_MOCK_SLEEP_MS, starts the turn, sends {type:'cancel'} while it's RUNNING,
// and asserts the child was killed (no `done` arrives). The timeout finish is a safety net so a
// non-cancelling test still terminates instead of wedging the suite.
const sleepMs = Number(process.env.VIBE_MOCK_SLEEP_MS) || 0;
if (sleepMs > 0) {
  out({ type: 'system', subtype: 'init', session_id: sessionId, tools: [], model: 'mock-agent' });
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Working on it… (slow turn)' }] } });
  setTimeout(() => {
    out({
      type: 'result',
      subtype: 'success',
      session_id: sessionId,
      result: 'Slow turn finished.',
      is_error: false,
      num_turns: 1,
      total_cost_usd: 0,
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0 },
    });
    process.exit(0);
  }, sleepMs);
} else {
  runDefault();
}

function runDefault() {

// ── scenario mode: a test writes the scenario file, sends a chat turn, deletes it ──
const scenarioPath = process.env.VIBE_MOCK_SCENARIO;
let scenario = null;
if (scenarioPath && fs.existsSync(scenarioPath)) {
  try {
    // strip a UTF-8 BOM — PowerShell 5.1's Out-File writes one, and JSON.parse rejects it
    scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8').replace(/^﻿/, ''));
  } catch {
    scenario = null;
  }
}

// ── e2e-fail scenario (additive; doc 13 §5 agent-fail.spec) ─────────────────────────
// A turn that ERRORS mid-stream: opening text, a tool_use whose tool_result is an ERROR (the UI's
// failure surface = an activity row with status 'error'), then a result with is_error:true. The
// turn still ENDS (a `result` event arrives → working:false → composer re-enabled) and the error
// text is persisted to chat.jsonl. A subsequent turn (no e2eFail flag) recovers normally; the argv
// log records --resume so continuity is intact. Kept separate from the default scenario on purpose.
if (scenario && scenario.e2eFail) {
  out({ type: 'system', subtype: 'init', session_id: sessionId, tools: [], model: 'mock-agent' });
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Starting the transcribe step…' }] } });
  out({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: 'tu_fail', name: 'Bash', input: { command: 'npx --no-install tsx capabilities/ingest/transcribe.ts --in media/demo.mp4' } }] },
  });
  out({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 'tu_fail', content: 'transcribe failed: model overloaded', is_error: true }] },
  });
  out({
    type: 'assistant',
    message: { content: [{ type: 'text', text: scenario.reply || 'The turn failed — the transcribe step errored out. Please try again.' }] },
  });
  out({
    type: 'result',
    subtype: 'error_during_execution',
    session_id: sessionId,
    result: scenario.reply || 'The turn failed — the transcribe step errored out. Please try again.',
    is_error: true,
    num_turns: 1,
    total_cost_usd: 0,
    usage: { input_tokens: 5, output_tokens: 9, cache_read_input_tokens: 0 },
  });
  process.exit(0);
}

if (scenario) {
  out({ type: 'system', subtype: 'init', session_id: sessionId, tools: [], model: 'mock-agent' });
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Distilling your brief and planning…' }] } });
  if (scenario.question) {
    // the real CLI's AskUserQuestion in -p mode: tool_use + an EXPECTED error tool_result
    out({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'tu_q1', name: 'AskUserQuestion', input: scenario.question }] },
    });
    out({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu_q1',
            content: 'User interaction is not available in non-interactive mode',
            is_error: true,
          },
        ],
      },
    });
  }
  out({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: 'tu_s1', name: 'Write', input: { file_path: 'projects/x/brief.md' } }] },
  });
  applyScenario(scenario);
  out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_s1', content: 'brief.md written', is_error: false }] } });
  // the real CLI STREAMS its final text as an assistant event (result.result is a duplicate)
  out({
    type: 'assistant',
    message: { content: [{ type: 'text', text: scenario.reply || 'Brief distilled, plan written — waiting at the plan gate.' }] },
  });
  out({
    type: 'result',
    subtype: 'success',
    session_id: sessionId,
    result: scenario.reply || 'Brief distilled, plan written — waiting at the plan gate.',
    is_error: false,
    num_turns: 1,
    total_cost_usd: 0,
    usage: { input_tokens: 12, output_tokens: 34, cache_read_input_tokens: 0 },
  });
  process.exit(0);
}

function applyScenario(s) {
  const project = process.env.VIBE_PROJECT;
  const root = process.env.VIBE_PROJECTS_DIR;
  if (!project || !root) return;
  const dir = path.join(path.resolve(root), project);
  // VE.6 — a range-scoped "Ask Editor Agent" turn rewrites editable docs in public/<project>/, just
  // like a real turn (the adapter spawns us with cwd = the project dir). The editor's disk-diff poll
  // then surfaces the change as the accept/reject card. `docs: [{ name, data }]`.
  for (const d of s.docs || []) {
    try {
      const pubDir = path.join(process.cwd(), 'public', project);
      fs.mkdirSync(pubDir, { recursive: true });
      const name = path.basename(d.name);
      const tmp = path.join(pubDir, `${name}.${process.pid}.tmp`);
      fs.writeFileSync(tmp, typeof d.data === 'string' ? d.data : JSON.stringify(d.data));
      fs.renameSync(tmp, path.join(pubDir, name));
    } catch {
      /* the test's assertions will catch a missed write */
    }
  }
  if (typeof s.brief === 'string') {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = path.join(dir, `brief.md.${process.pid}.tmp`);
      fs.writeFileSync(tmp, s.brief);
      fs.renameSync(tmp, path.join(dir, 'brief.md'));
    } catch {
      /* the test's assertions will catch it */
    }
  }
  const p = path.join(dir, 'manifest.json');
  if (!fs.existsSync(p)) return;
  try {
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (typeof s.notes === 'string') m.notes = s.notes;
    m.stages = m.stages || {};
    for (const st of s.stages || []) {
      const cur = m.stages[st.name] || { status: 'pending', params: {}, outputs: [], attempts: 0 };
      cur.status = st.status;
      if (st.status === 'complete' || st.status === 'blocked') cur.finished_at = new Date().toISOString();
      if (typeof st.approved === 'boolean') cur.approved = st.approved;
      cur.attempts = (cur.attempts || 0) + 1;
      m.stages[st.name] = cur;
    }
    m.updated_at = new Date().toISOString();
    const tmp = `${p}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(m, null, 2) + '\n');
    fs.renameSync(tmp, p);
  } catch {
    /* a malformed manifest is the test's problem, not the mock's */
  }
}

out({ type: 'system', subtype: 'init', session_id: sessionId, tools: [], model: 'mock-agent' });
out({
  type: 'assistant',
  message: { content: [{ type: 'text', text: resumed ? `Resuming session ${sessionId} — continuing.` : 'Planning the ingest step…' }] },
});
out({
  type: 'assistant',
  message: {
    content: [
      {
        type: 'tool_use',
        id: 'tu_1',
        name: 'Bash',
        input: { command: 'npx --no-install tsx capabilities/ingest/transcribe.ts --in media/demo.mp4 --model whisper-1' },
      },
    ],
  },
});
out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'captions.json written', is_error: false }] } });

mutateManifest();

out({
  type: 'result',
  subtype: 'success',
  session_id: sessionId,
  result: resumed ? 'Resumed and done.' : 'Ingest complete — captions written.',
  is_error: false,
  num_turns: 1,
  total_cost_usd: 0,
  usage: { input_tokens: 12, output_tokens: 34, cache_read_input_tokens: 0 },
});

function mutateManifest() {
  const project = process.env.VIBE_PROJECT;
  const root = process.env.VIBE_PROJECTS_DIR;
  const stage = process.env.VIBE_MOCK_COMPLETE_STAGE || 'ingest';
  if (!project || !root) return;
  const p = path.join(path.resolve(root), project, 'manifest.json');
  if (!fs.existsSync(p)) return;
  try {
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    m.stages = m.stages || {};
    const s = m.stages[stage] || { status: 'pending', params: {}, outputs: [], attempts: 0 };
    s.status = 'complete';
    s.finished_at = new Date().toISOString();
    s.outputs = [`out/work/${project}/${stage}/captions.json`];
    m.stages[stage] = s;
    m.updated_at = new Date().toISOString();
    const tmp = `${p}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(m, null, 2) + '\n');
    fs.renameSync(tmp, p);
  } catch {
    /* a malformed manifest is the test's problem, not the mock's */
  }
}

} // end runDefault
