#!/usr/bin/env node
/**
 * mock-codex.mjs — a stand-in for the native `codex` CLI used by the codex-adapter tests
 * (VIBE_CODEX_BIN seam). The real subscription CLI is NEVER spawned in CI (zero spend).
 *
 * It mimics `codex exec --json …` / `codex exec resume <thread> --json …`: a JSONL stream on
 * stdout (one event per line), VERBATIM-shaped from the R1 spike (codex-cli 0.137.0 — see
 * tests/unit/codex-events.test.ts + src/agent/codex-adapter.ts). The prompt rides stdin (the
 * adapter writes it + closes stdin); we drain it so the pipe doesn't EPIPE.
 *
 * Env knobs (set by the test):
 *   VIBE_MOCK_ARGV_LOG   append-log of argv per invocation (assert `exec resume <thread>` on turn 2)
 *   VIBE_MOCK_STDIN_LOG  append-log of the stdin body per invocation (assert the prompt path)
 *   VIBE_CODEX_SCENARIO  'turn'   (default) full turn: thread.started → items → turn.completed
 *                        'fail'   thread.started → turn.failed {error}  (error classification)
 *                        'sleep'  thread.started + an item, then HANG (cancel-mid-turn)
 *   VIBE_MOCK_SLEEP_MS   sleep duration for the 'sleep' scenario (default 5000)
 *   VIBE_CODEX_VERSION   what `--version` prints (default '0.137.0')
 */
import * as fs from 'node:fs';

const argv = process.argv.slice(2);

if (process.env.VIBE_MOCK_ARGV_LOG) {
  try {
    fs.appendFileSync(process.env.VIBE_MOCK_ARGV_LOG, argv.join(' ') + '\n');
  } catch {
    /* ignore */
  }
}

// `codex --version` (detectCodex). Print + exit before touching stdin.
if (argv.includes('--version')) {
  process.stdout.write(`codex-cli ${process.env.VIBE_CODEX_VERSION || '0.137.0'}\n`);
  process.exit(0);
}

const out = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

// `exec resume <thread_id>` reuses the thread id; a fresh `exec` mints one.
const resumeIdx = argv.indexOf('resume');
const threadId = resumeIdx >= 0 ? argv[resumeIdx + 1] : '019e9e67-cf77-7f03-b7b3-bbc49acb57d8';

// Drain stdin (the adapter writes the prompt then end()s it). codex would append an open stdin
// as a <stdin> block forever; the adapter always closes it, so this resolves promptly.
const stdinBody = await new Promise((resolve) => {
  let data = '';
  if (process.stdin.isTTY) return resolve('');
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

const scenario = process.env.VIBE_CODEX_SCENARIO || 'turn';

out({ type: 'thread.started', thread_id: threadId });
out({ type: 'turn.started' });

if (scenario === 'fail') {
  out({ type: 'turn.failed', error: { message: 'model overloaded — please retry' } });
  process.exit(0);
}

if (scenario === 'sleep') {
  out({
    type: 'item.started',
    item: { id: 'item_0', type: 'agent_message', text: '' },
  });
  // Hang so a test can cancel mid-turn. Safety-net finish so a non-cancelling test still ends.
  setTimeout(() => {
    out({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'slow' } });
    out({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } });
    process.exit(0);
  }, Number(process.env.VIBE_MOCK_SLEEP_MS) || 5000);
} else {
  // Default full turn: a command execution (capability glyph), a file change, the agent reply.
  out({
    type: 'item.started',
    item: {
      id: 'item_1',
      type: 'command_execution',
      command: 'tsx capabilities/ingest/probe.ts --in clip.mp4',
      aggregated_output: '',
      exit_code: null,
      status: 'in_progress',
    },
  });
  out({
    type: 'item.completed',
    item: {
      id: 'item_1',
      type: 'command_execution',
      command: 'tsx capabilities/ingest/probe.ts --in clip.mp4',
      aggregated_output: 'probe ok',
      exit_code: 0,
      status: 'completed',
    },
  });
  out({
    type: 'item.completed',
    item: { id: 'item_2', type: 'file_change', changes: [{ path: 'projects/p/brief.md', kind: 'add' }], status: 'completed' },
  });
  out({
    type: 'item.completed',
    item: { id: 'item_3', type: 'agent_message', text: 'Probed the clip and wrote the brief.' },
  });
  out({ type: 'turn.completed', usage: { input_tokens: 1000, cached_input_tokens: 0, output_tokens: 20 } });
  process.exit(0);
}
