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

test('P0.8 capabilities/README.md documents licensing (Pedalboard GPLv3 + Remotion tier)', () => {
  const md = read('capabilities/README.md');
  assertIncludes(md, 'GPLv3', 'license note is missing Pedalboard GPLv3');
  assertIncludes(md, 'Remotion license', 'license note is missing the Remotion tier note');
});
