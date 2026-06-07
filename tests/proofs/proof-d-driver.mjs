/**
 * Proof D driver — Proof A's wizard-mode pipeline on a REAL macOS runner (workflow_dispatch:
 * .github/workflows/proof-d.yml). Self-contained: drives the installed `vibe ui` with a real
 * Chromium, a REAL Claude Code (API-key auth) and a synthetic speech HEVC clip generated on the
 * runner — no personal media, no machine paths (everything arrives via env).
 *
 *   PROOF_WS     workspace dir (the `vibe init`ed project)
 *   PROOF_BASE   server base URL (default http://127.0.0.1:7878)
 *   PROOF_CLIP   path to the synthetic HEVC talking clip
 *   PROOF_SHOTS  screenshot dir (uploaded as artifacts)
 *
 * Turn completion = the cockpit's "agent working…" pulse clears AND chat.jsonl gains a `done`
 * record (never prompt-echo matching). Exit 0 only when a deliverable lands in deliver/.
 */
import { chromium } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const WS = process.env.PROOF_WS;
const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:7878';
const CLIP = process.env.PROOF_CLIP;
const SHOTS = process.env.PROOF_SHOTS ?? 'proof-d-shots';
const PROJECT = 'proof-d-ad';
if (!WS || !CLIP) throw new Error('PROOF_WS and PROOF_CLIP are required');
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));

const shot = async (name) => {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => {});
  console.log('shot:', name);
};

function doneCount() {
  const f = path.join(WS, 'projects', PROJECT, 'chat.jsonl');
  if (!fs.existsSync(f)) return 0;
  return fs
    .readFileSync(f, 'utf8')
    .split('\n')
    .filter((l) => {
      try {
        const e = JSON.parse(l);
        return e.t === 'event' && e.e?.type === 'done';
      } catch {
        return false;
      }
    }).length;
}

async function waitTurnEnd(baseline, label, timeoutMs) {
  const t0 = Date.now();
  let sawWorking = false;
  let lastLog = 0;
  for (;;) {
    const elapsed = Date.now() - t0;
    if (elapsed > timeoutMs) throw new Error(`${label}: turn did not end within ${Math.round(timeoutMs / 60000)} min`);
    const working = await page.getByText('agent working…').count();
    if (working > 0) sawWorking = true;
    const dones = doneCount();
    if ((sawWorking || elapsed > 30_000) && working === 0 && dones > baseline) return dones;
    if (Date.now() - lastLog > 120_000) {
      lastLog = Date.now();
      console.log(`  …${label} (${Math.round(elapsed / 1000)}s, working=${working > 0}, dones=${dones}/${baseline})`);
      await shot(`${label}-t${Math.round(elapsed / 60000)}m`);
    }
    await page.waitForTimeout(3000);
  }
}

try {
  // ── wizard: 9:16 ad, footage=upload ──────────────────────────────────────────
  await page.goto(`${BASE}/#/new`);
  await page.click('[data-testid="choose-wizard"]');
  await page.waitForSelector('[data-format="9:16-ad"]', { timeout: 15_000 });
  await page.click('[data-format="9:16-ad"]');
  await page.click('[data-testid="wizard-next"]');
  await page.waitForSelector('[data-style="paid-ad-hormozi"]', { timeout: 15_000 });
  await page.click('[data-style="paid-ad-hormozi"]');
  await page.click('[data-testid="wizard-next"]');
  await page.waitForSelector('[data-testid="wizard-name"]', { timeout: 15_000 });
  await page.fill('[data-testid="wizard-name"]', PROJECT);
  await page.fill('[data-testid="wizard-hook"]', 'Use the opening line of the uploaded clip');
  await page.fill('[data-testid="wizard-cta"]', 'Follow for more');
  await page.fill('[data-testid="wizard-duration"]', '15');
  await page.click('[data-testid="wizard-next"]');
  await page.waitForSelector('[data-choice="voiceover-none"]', { timeout: 15_000 });
  await page.click('[data-choice="voiceover-none"]');
  await page.click('[data-choice="music-none"]');
  await page.click('[data-choice="footage-upload"]');
  await shot('01-wizard');
  await page.click('[data-testid="wizard-create"]');
  await page.waitForURL(new RegExp(`#/project/${PROJECT}`), { timeout: 20_000 });
  await page.waitForTimeout(1500);
  await shot('02-cockpit');

  // ── upload the synthetic clip while the kickoff plans ────────────────────────
  await page.waitForSelector('[data-testid="asset-manager"]', { timeout: 15_000 });
  await page.locator('[data-testid="import-file-input"]').setInputFiles(CLIP);
  await page.waitForSelector('[data-testid="asset-note"]', { timeout: 120_000 });
  await shot('03-uploaded');

  // ── the REAL kickoff turn (plan + stop at the gate) ──────────────────────────
  const dones1 = await waitTurnEnd(0, 'kickoff', 25 * 60_000);
  console.log('kickoff done, dones =', dones1);
  await page.click('[data-editor-tab="plan"]');
  await page.waitForTimeout(900);
  await shot('04-plan');

  // ── approve (the V5 plan-approve affordance, or the gate card when blocked) ──
  const planApprove = page.getByTestId('plan-approve');
  const gate = page.locator('[data-gate-card] [data-action="approve"]').first();
  const btn = (await planApprove.count()) > 0 ? planApprove : gate;
  if ((await btn.count()) === 0) throw new Error('no approve affordance on the Plan tab');
  const baseline2 = doneCount();
  await btn.click();
  console.log('plan approved — building');
  await shot('05-approved');
  const dones2 = await waitTurnEnd(baseline2, 'build', 60 * 60_000);
  console.log('build done, dones =', dones2);
  await shot('06-after-build');

  // ── deliver gate if the agent parked one ─────────────────────────────────────
  await page.click('[data-editor-tab="overview"]');
  await page.waitForTimeout(900);
  const dGate = page.locator('[data-gate-card="deliver"]');
  if ((await dGate.count()) > 0) {
    await dGate.locator('[data-action="approve"]').click();
    await page.waitForTimeout(2500);
    console.log('deliver gate approved');
  }
  for (const tab of ['preview', 'qa', 'deliver']) {
    const t = page.locator(`[data-editor-tab="${tab}"]`);
    if ((await t.count()) > 0) {
      await t.click();
      await page.waitForTimeout(1100);
      await shot(`07-${tab}`);
    }
  }

  // ── THE assertion: a deliverable exists ──────────────────────────────────────
  const found = [];
  for (const root of [path.join(WS, 'deliver'), path.join(WS, 'out')]) {
    if (!fs.existsSync(root)) continue;
    const walk = (d, depth) => {
      if (depth > 3) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const abs = path.join(d, e.name);
        if (e.isDirectory()) walk(abs, depth + 1);
        else if (/loudnorm.*\.mp4$/i.test(e.name) && fs.statSync(abs).size > 100_000) found.push(abs);
      }
    };
    walk(root, 0);
  }
  console.log('deliverables found:', found.length ? found.join(' · ') : 'NONE');
  if (found.length === 0) throw new Error('no loudnormed deliverable >100KB found in deliver//out/');
  console.log('PROOF D: PASS');
} finally {
  await browser.close();
  if (consoleErrors.length) console.log('page errors:', consoleErrors.slice(0, 10));
}
