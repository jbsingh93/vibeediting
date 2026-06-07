import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertIncludes } from './harness';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('P0.7 CAPABILITIES.md exists with the wiki-compatible §0–§17 structure', () => {
  const md = read('CAPABILITIES.md');
  // The UI's capability-WIKI modal parses the numbered `## N.` sections — keep the contract.
  for (const n of [0, 1, 5, 13, 16, 17]) {
    assert(new RegExp(`^## ${n}\\.`, 'm').test(md), `CAPABILITIES.md is missing the "## ${n}." section (wiki parser contract)`);
  }
  assertIncludes(md, 'capabilities/_env/models.json', 'CAPABILITIES.md is missing the models.json pointer');
  assertIncludes(md, 'whisper-1', 'CAPABILITIES.md must state the whisper-1 STT rule');
});

test('P0.7 CLAUDE.md exists with the binding agent guide (V3 — returns after the V2 deferral)', () => {
  const md = read('CLAUDE.md');
  assertIncludes(md, 'Hard rules', 'CLAUDE.md must carry the hard-rules section');
  assertIncludes(md, 'whisper-1', 'CLAUDE.md must state the whisper-1 STT rule');
  assertIncludes(md, 'gemini-3.1-flash-lite', 'CLAUDE.md must pin the visual cortex model');
  assertIncludes(md, '−14 LUFS', 'CLAUDE.md must state the loudness target');
  assertIncludes(md, 'No Remotion Studio', 'CLAUDE.md must state the no-Studio rule (hard rule 6)');
  assertIncludes(md, 'CAPABILITIES.md', 'CLAUDE.md must point at the capability index');
  assertIncludes(md, 'video-editor', 'CLAUDE.md must route to the video-editor skill');
});

test('P0.7 AGENTS.md mirrors CLAUDE.md for Codex (persona inlined)', () => {
  const md = read('AGENTS.md');
  assertIncludes(md, 'Hard rules', 'AGENTS.md must carry the hard-rules section');
  assertIncludes(md, 'whisper-1', 'AGENTS.md must state the whisper-1 STT rule');
  assertIncludes(md, 'COCKPIT CONTRACT', 'AGENTS.md must inline the cockpit contract (Codex has no --agent persona)');
  assertIncludes(md, 'manifest.notes', 'AGENTS.md cockpit contract must name manifest.notes');
});

test('P0.8 capabilities/README.md documents licensing (Pedalboard GPLv3 + Remotion tier)', () => {
  const md = read('capabilities/README.md');
  assertIncludes(md, 'GPLv3', 'license note is missing Pedalboard GPLv3');
  assertIncludes(md, 'Remotion license', 'license note is missing the Remotion tier note');
});
