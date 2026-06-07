/** P1O — VT.5 F15: paid generator spend metering. The audio (ElevenLabs) + image (gpt-image)
 *  generators must record a cost CLAIM into the SAME budget ledger + durable provenance the cockpit
 *  reads, so the Budget & History tab is no longer empty after real paid generation. Pure helpers +
 *  one live ledger write to the disposable _tests trees. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, assert, assertEqual } from './harness';
import { workDir } from '../_env/contract';
import { provenanceLogPath } from '../orchestrate/provenance';
import {
  inferProjectFromOut,
  estimateTtsCostUsd,
  estimateMusicCostUsd,
  estimateSfxCostUsd,
  estimateImageCostUsd,
  recordGenerateSpend,
} from '../generate/spend';

test('P1O.1 inferProjectFromOut pulls <project> from public/out/out-work paths (both slashes)', () => {
  assertEqual(inferProjectFromOut('public/proof-a/vo-1.mp3'), 'proof-a', 'public/<p>/');
  assertEqual(inferProjectFromOut('out/work/proof-b/generate/bgm.mp3'), 'proof-b', 'out/work/<p>/');
  assertEqual(inferProjectFromOut('out/vt-ad/ad thumbnail.png'), 'vt-ad', 'out/<p>/');
  assertEqual(inferProjectFromOut('C:\\x\\public\\winproj\\sfx.mp3'), 'winproj', 'windows backslashes');
  assertEqual(inferProjectFromOut('/tmp/loose.mp3'), null, 'no project segment → null');
});

test('P1O.2 cost estimators read models.json rates and scale with usage', () => {
  // models.json: tts 0.18/1k chars, music 0.02/s, sfx 0.02 flat, image 0.20/img
  assertEqual(estimateTtsCostUsd(1000), 0.18, 'tts 1k chars');
  assertEqual(estimateTtsCostUsd(0), 0, 'tts zero chars');
  assertEqual(estimateMusicCostUsd(10), 0.2, 'music 10s');
  assertEqual(estimateSfxCostUsd(), 0.02, 'sfx flat');
  assertEqual(estimateImageCostUsd(2), 0.4, 'image n=2');
  assert(estimateTtsCostUsd(2700) > estimateTtsCostUsd(540), 'tts scales with chars');
});

test('P1O.3 recordGenerateSpend writes the budget ledger + durable provenance the cockpit reads', () => {
  const project = '_spendtest';
  // Use the SAME path helpers the code uses (provenanceLogPath honors VIBE_PROJECTS_DIR, which the
  // engine harness sets to a temp dir — hardcoding REPO_ROOT/projects would miss it).
  const ledger = path.join(workDir(project, 'orchestrate'), 'budget.json');
  const prov = provenanceLogPath(project);
  for (const p of [ledger, prov]) fs.rmSync(p, { force: true });

  const spent = recordGenerateSpend({
    outPath: `public/${project}/vo-outro.mp3`,
    capability: 'generate/elevenlabs-tts',
    model: 'eleven_multilingual_v2',
    costUsd: estimateTtsCostUsd(540),
  });
  assert(spent > 0, 'returns the recorded cost');

  assert(fs.existsSync(ledger), 'budget.json written to the work tree the Budget tab reads');
  const entries = JSON.parse(fs.readFileSync(ledger, 'utf8')) as Array<{ capability: string; costUsd: number }>;
  assert(entries.length === 1 && entries[0]!.capability === 'generate/elevenlabs-tts', 'ledger entry recorded');
  assert(entries[0]!.costUsd > 0, 'ledger entry has a positive cost claim');

  assert(fs.existsSync(prov), 'durable provenance.log appended');
  assertIncludesText(fs.readFileSync(prov, 'utf8'), 'generate/elevenlabs-tts');

  // no project inferable → graceful no-op (never throws, records nothing)
  assertEqual(recordGenerateSpend({ outPath: '/tmp/loose.mp3', capability: 'generate/x', model: 'm', costUsd: 1 }), 0, 'no-project → 0');

  fs.rmSync(path.dirname(ledger), { recursive: true, force: true });
  fs.rmSync(path.dirname(prov), { recursive: true, force: true });
});

function assertIncludesText(haystack: string, needle: string): void {
  assert(haystack.includes(needle), `expected provenance to mention "${needle}"`);
}
