/**
 * capabilities/orchestrate/budget-guard.ts — cost + cache controls for the spine (GAP-43; A0.10).
 *
 * Paid generation (Veo/Runway/Seedance, P4V — on-demand) and even many-call Gemini-council passes can
 * run up real cost. The research's commercial-grade controls (VX §4.5–4.6) belong in the orchestration
 * spine, not in each capability:
 *
 *   - APIBudgetGuard — a hard `max_cost_usd` ceiling + `max_rpm` rate limit, with a persisted ledger so
 *     the cap holds ACROSS runs (not just within one process). Every paid call asks `canSpend()` first.
 *   - GenerationCache — a sha256 cache keyed by {prompt, model, seed, ref_hash}; identical requests
 *     reuse the prior output instead of paying again. (Generated media is gitignored like any asset.)
 *
 * Lives under out/work/<project>/orchestrate/ (disposable but persists across normal runs). Pure
 * `cacheKey()` is unit-testable offline. Dependency-free (runs under tsx).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { workDir } from '../_env/contract';

export interface BudgetConfig {
  maxCostUsd: number;
  maxRpm: number; // max paid calls per rolling 60s
}

export interface LedgerEntry {
  ts: string;
  capability: string;
  model: string;
  costUsd: number;
  cacheKey?: string;
}

export interface SpendDecision {
  allowed: boolean;
  reason: string;
  spentUsd: number;
  remainingUsd: number;
  recentRpm: number;
}

function ledgerPath(project: string): string {
  return path.join(workDir(project, 'orchestrate'), 'budget.json');
}

export class APIBudgetGuard {
  private project: string;
  private config: BudgetConfig;
  private ledger: LedgerEntry[];

  constructor(project: string, config: BudgetConfig) {
    this.project = project;
    this.config = config;
    this.ledger = this.load();
  }

  private load(): LedgerEntry[] {
    const p = ledgerPath(this.project);
    if (!fs.existsSync(p)) return [];
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as LedgerEntry[];
    } catch {
      return [];
    }
  }

  private persist(): void {
    fs.writeFileSync(ledgerPath(this.project), JSON.stringify(this.ledger, null, 2) + '\n', 'utf8');
  }

  spentUsd(): number {
    return +this.ledger.reduce((sum, e) => sum + e.costUsd, 0).toFixed(6);
  }

  /** Paid calls within the last 60s (rolling rate window). */
  recentRpm(now = Date.now()): number {
    return this.ledger.filter((e) => now - new Date(e.ts).getTime() < 60_000).length;
  }

  /** Ask BEFORE making a paid call. Does not record — call `record()` only if you actually spend. */
  canSpend(costUsd: number, now = Date.now()): SpendDecision {
    const spent = this.spentUsd();
    const rpm = this.recentRpm(now);
    const remaining = +(this.config.maxCostUsd - spent).toFixed(6);
    if (spent + costUsd > this.config.maxCostUsd) {
      return { allowed: false, reason: `budget exceeded: $${spent.toFixed(4)} + $${costUsd.toFixed(4)} > cap $${this.config.maxCostUsd}`, spentUsd: spent, remainingUsd: remaining, recentRpm: rpm };
    }
    if (rpm >= this.config.maxRpm) {
      return { allowed: false, reason: `rate limit: ${rpm} call(s) in the last 60s ≥ max_rpm ${this.config.maxRpm}`, spentUsd: spent, remainingUsd: remaining, recentRpm: rpm };
    }
    return { allowed: true, reason: 'within budget and rate limit', spentUsd: spent, remainingUsd: remaining, recentRpm: rpm };
  }

  /** Record an actual spend (persists the ledger so the cap survives across runs). */
  record(capability: string, model: string, costUsd: number, cacheKey?: string): LedgerEntry {
    const entry: LedgerEntry = { ts: new Date().toISOString(), capability, model, costUsd, cacheKey };
    this.ledger.push(entry);
    this.persist();
    return entry;
  }
}

/** Deterministic cache key for a generation request (VX §4.6): identical inputs → identical key. */
export function cacheKey(input: { prompt: string; model: string; seed?: number; refHash?: string }): string {
  const canonical = JSON.stringify({ prompt: input.prompt, model: input.model, seed: input.seed ?? null, refHash: input.refHash ?? null });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export class GenerationCache {
  private indexPath: string;
  private index: Record<string, string>;

  constructor(project: string) {
    this.indexPath = path.join(workDir(project, 'orchestrate'), 'gen-cache.json');
    this.index = fs.existsSync(this.indexPath) ? (JSON.parse(fs.readFileSync(this.indexPath, 'utf8')) as Record<string, string>) : {};
  }

  /** Returns the cached output path for this key, but only if the file still exists. */
  get(key: string): string | null {
    const p = this.index[key];
    return p && fs.existsSync(p) ? p : null;
  }

  put(key: string, outputPath: string): void {
    this.index[key] = path.resolve(outputPath);
    fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2) + '\n', 'utf8');
  }
}
