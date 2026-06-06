/**
 * The mechanical cockpit contract.
 *
 * Real agent-mode sessions proved persona prose alone doesn't hold: agents shipped whole
 * videos with NO brief.md, NO plan in manifest.notes, NO recorded stages — leaving the
 * Brief/Plan tabs and the progress strip empty. The bridge ENFORCES the contract
 * mechanically: every agent-mode turn gets a compact bracketed status note prepended listing
 * exactly what's missing. Deterministic, cheap, and it disappears once the agent complies.
 *
 * Note: the manifest is read as plain JSON here, defensively. The manifest SCHEMA module
 * lives in the user's project (template/capabilities, from V2) — the package reads the data
 * file directly and never imports project code.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CockpitState {
  briefMissing: boolean; // brief.md absent or still the create-time stub
  planMissing: boolean; // manifest.notes empty or still the create-time default
  stagesMissing: boolean; // no stage recorded on the manifest yet
}

/** Build the bracketed reminder from a state snapshot (pure → unit-tested). Null when compliant. */
export function cockpitReminder(project: string, s: CockpitState): string | null {
  const missing: string[] = [];
  if (s.briefMissing)
    missing.push(
      `distill the user's brief into projects/${project}/brief.md (Write tool; the Brief tab renders it)`,
    );
  if (s.planMissing)
    missing.push(
      `put your plan/scene table in manifest.notes via capabilities/orchestrate (the Plan tab renders it)`,
    );
  if (s.stagesMissing)
    missing.push(`record stages (startStage/completeStage) so the stage strip + progress bar are honest`);
  if (missing.length === 0) return null;
  return (
    `[Cockpit contract — NOT yet satisfied on "${project}". Before/while doing the work, also: ` +
    missing.join('; ') +
    `. Deliverable data (props/captions/audio-mix JSON) belongs in public/${project}/ so the Fine-tune editor lights up.]`
  );
}

const DEFAULT_NOTES = new Set([
  'Agent-mode project — brief comes from the chat.',
  'Brief received — waiting for the agent to plan the scenes.',
]);

/** Read the live cockpit state for an agent-mode project; null for wizard/legacy (kickoff covers them). */
export function readCockpitState(projectsRoot: string, project: string): CockpitState | null {
  try {
    const manifestPath = path.join(projectsRoot, project, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      inputs?: Record<string, unknown>;
      notes?: string;
      stages?: Record<string, unknown>;
    };
    if ((m.inputs ?? {}).mode !== 'agent') return null;
    const briefFile = path.join(projectsRoot, project, 'brief.md');
    let briefMissing = true;
    if (fs.existsSync(briefFile)) {
      briefMissing = /\(No brief yet\.\)/.test(fs.readFileSync(briefFile, 'utf8'));
    }
    const notes = (m.notes ?? '').trim();
    const planMissing = notes.length === 0 || DEFAULT_NOTES.has(notes);
    const stagesMissing = Object.keys(m.stages ?? {}).length === 0;
    return { briefMissing, planMissing, stagesMissing };
  } catch {
    return null; // a malformed manifest never blocks the chat
  }
}
