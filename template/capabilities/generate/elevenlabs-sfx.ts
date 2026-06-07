#!/usr/bin/env tsx
/**
 * ElevenLabs Sound Effects — generate REAL sound effects from a text description.
 *
 * This is the high-quality alternative to the WAV-synth-in-Node trick the skill
 * uses when offline (bundled ffmpeg lacks audio-filter sources). Use this when you
 * want a believable whoosh / impact / riser / UI tick / ambience instead of a
 * synthesized sine. Output lands in public/<project>/sfx/ (or the shared public/sfx/).
 *
 * Usage:
 *   tsx capabilities/generate/elevenlabs-sfx.ts <text | @file.txt> <output.mp3> [options]
 *
 * Options:
 *   --seconds <0.5-30>   duration_seconds. Omit to let the model auto-pick length.
 *   --influence <0-1>    prompt_influence. Default: 0.3 (higher = literal, lower = atmospheric)
 *   --loop               Make a seamless loop (ambience beds). v2 model only.
 *   --format <fmt>       output_format. Default: mp3_44100_128
 *   --model <id>         Default: eleven_text_to_sound_v2
 *
 * Examples:
 *   tsx capabilities/generate/elevenlabs-sfx.ts "short punchy whoosh transition, mid frequency" public/launch/sfx/whoosh-01.mp3 --seconds 0.6
 *   tsx capabilities/generate/elevenlabs-sfx.ts "deep cinematic boom impact with sub tail" public/launch/sfx/impact-01.mp3 --seconds 1.5 --influence 0.6
 *   tsx capabilities/generate/elevenlabs-sfx.ts "soft warm room ambience, subtle hum" public/launch/sfx/amb-room.mp3 --seconds 20 --loop
 *
 * Mixing: keep SFX subtle (≤0.4 volume), 2-3 simultaneous max, spread across
 * frequency bands. Drive per-word ticks off caption timestamps. See audio-mixing.md.
 *
 * Requires:
 *   - npm i @elevenlabs/elevenlabs-js
 *   - ELEVENLABS_API_KEY in .env (auto-loaded) → https://elevenlabs.io/app/settings/api-keys
 *
 * NOTE: this spends ElevenLabs credits. Generated SFX is small + reusable — keep good
 * ones in public/sfx/ as a library (that folder is git-tracked per asset-conventions).
 */

import fs from 'node:fs';
import path from 'node:path';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { recordGenerateSpend, estimateSfxCostUsd } from './spend';

// ───────────────────────────── .env loader (dependency-free) ─────────────────
function loadDotEnv(): void {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  }
}

type Flags = Record<string, string | boolean>;

function parseFlags(argv: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

async function toBuffer(audio: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(audio)) return audio;
  if (audio instanceof Uint8Array) return Buffer.from(audio);
  const a = audio as {
    getReader?: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> };
    arrayBuffer?: () => Promise<ArrayBuffer>;
    [Symbol.asyncIterator]?: unknown;
  };
  if (typeof a.getReader === 'function') {
    const reader = a.getReader();
    const chunks: Buffer[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  if (typeof a[Symbol.asyncIterator] === 'function') {
    const chunks: Buffer[] = [];
    for await (const chunk of audio as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (typeof a.arrayBuffer === 'function') {
    return Buffer.from(await a.arrayBuffer());
  }
  throw new Error('Unrecognized audio return type from ElevenLabs SDK');
}

function readTextArg(arg: string): string {
  if (arg.startsWith('@')) {
    const file = arg.slice(1);
    if (!fs.existsSync(file)) {
      console.error(`Prompt file not found: ${file}`);
      process.exit(1);
    }
    return fs.readFileSync(file, 'utf8').trim();
  }
  return arg;
}

// ───────────────────────────── main ──────────────────────────────────────────
loadDotEnv();

const { positional, flags } = parseFlags(process.argv.slice(2));

if (!process.env.ELEVENLABS_API_KEY) {
  console.error('ELEVENLABS_API_KEY missing. Add it to .env (auto-loaded).');
  console.error('Get a key: https://elevenlabs.io/app/settings/api-keys');
  process.exit(1);
}

const [textArg, outPath] = positional;
if (!textArg || !outPath) {
  console.error('Usage: tsx capabilities/generate/elevenlabs-sfx.ts <text | @file.txt> <output.mp3> [options]');
  process.exit(1);
}

const text = readTextArg(textArg);
const model = (flags.model as string) ?? 'eleven_text_to_sound_v2';
const outputFormat = (flags.format as string) ?? 'mp3_44100_128';
const promptInfluence = flags.influence !== undefined ? Number(flags.influence) : 0.3;

let durationSeconds: number | undefined;
if (flags.seconds !== undefined) {
  durationSeconds = Number(flags.seconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0.5 || durationSeconds > 30) {
    console.error(`--seconds must be 0.5-30 (got ${flags.seconds}).`);
    process.exit(1);
  }
}

const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

(async () => {
  console.log(`SFX:        "${text.slice(0, 100)}${text.length > 100 ? '…' : ''}"`);
  console.log(`Settings:   ${durationSeconds ? `${durationSeconds}s` : 'auto-length'} · influence=${promptInfluence}${flags.loop ? ' · loop' : ''} · ${model}`);
  console.log('Generating…');

  const audio = await client.textToSoundEffects.convert({
    text,
    modelId: model,
    promptInfluence,
    outputFormat,
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    ...(flags.loop ? { loop: true } : {}),
  } as Parameters<typeof client.textToSoundEffects.convert>[0]);

  const buf = await toBuffer(audio);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, buf);

  // F15: meter the paid call into the project's budget ledger + provenance (best-effort, never throws).
  recordGenerateSpend({ outPath, capability: 'generate/elevenlabs-sfx', model, costUsd: estimateSfxCostUsd() });

  console.log(`\n✓ Wrote SFX: ${outPath} (${(buf.length / 1024).toFixed(0)} KB)`);
  console.log('\nNext steps:');
  console.log(`  - Layer subtly (≤0.4 vol) inside a <Sequence>:`);
  console.log(`    <Sequence from={f} durationInFrames={n}><Audio src={staticFile('<project>/sfx/${path.basename(outPath)}')} volume={0.35} /></Sequence>`);
  console.log(`  - Loudnorm the FINAL mix at delivery.`);
})().catch((err) => {
  console.error('ElevenLabs SFX failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
