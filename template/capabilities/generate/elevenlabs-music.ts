#!/usr/bin/env tsx
/**
 * ElevenLabs Music — generate a background-music track ON THE FLY.
 *
 * Defaults to INSTRUMENTAL (force_instrumental) because that's what a BGM bed
 * under a voiceover needs. Pass --vocals if you actually want a sung track.
 *
 * Output lands in the Remotion pipeline (public/<project>/music/). Import it as a
 * faded, ducked <Audio> under the VO (see the video-editor skill's audio-mixing
 * reference) — music sits around 0.25 volume, ducks to ~0.15 while the VO speaks.
 * Loudnorm the final mix.
 *
 * Usage:
 *   tsx capabilities/generate/elevenlabs-music.ts <prompt | @file.txt> <output.mp3> [options]
 *
 * Options:
 *   --seconds <s>     Track length in seconds (3-300 sensible). Default: 30
 *   --ms <ms>         Explicit music_length_ms (3000-600000). Overrides --seconds.
 *   --vocals          Allow vocals (default is instrumental). Mutually exclusive w/ instrumental.
 *   --plan            Two-step: build a composition_plan first, then compose from it
 *                     (better section structure for longer / arranged tracks).
 *   --seed <int>      Determinism (best-effort; not guaranteed bit-identical).
 *   --format <fmt>    output_format. Default: mp3_44100_128
 *   --model <id>      Default: music_v1 (only model currently)
 *
 * Examples:
 *   tsx capabilities/generate/elevenlabs-music.ts "warm uplifting corporate lo-fi, soft piano + mellow beat, 90 bpm, non-intrusive, looping bed for a product explainer" public/launch/music/bgm-lofi-v1.mp3 --seconds 45
 *   tsx capabilities/generate/elevenlabs-music.ts @public/launch/music-brief.txt public/launch/music/bgm-v1.mp3 --seconds 60 --plan
 *
 * Prompting tips (BGM):
 *   - Specify tempo (bpm), instrumentation, mood, dynamics; ask for "non-intrusive,
 *     consistent, leaves room for a voiceover". Match bpm to your cut ASL
 *     (see the video-editor skill's audio-mixing reference, "Music BPM matching cut rhythm").
 *   - NEVER name real artists/bands/songs. If you get a `bad_prompt` error, the API
 *     returns a generic `promptSuggestion` — use that instead.
 *
 * Requires:
 *   - npm i @elevenlabs/elevenlabs-js
 *   - ELEVENLABS_API_KEY in .env (auto-loaded) → https://elevenlabs.io/app/settings/api-keys
 *
 * NOTE: this spends ElevenLabs credits. Generated music is gitignored audio.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

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
      console.error(`Brief file not found: ${file}`);
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

const [promptArg, outPath] = positional;
if (!promptArg || !outPath) {
  console.error('Usage: tsx capabilities/generate/elevenlabs-music.ts <prompt | @file.txt> <output.mp3> [options]');
  process.exit(1);
}

const prompt = readTextArg(promptArg);
const lengthMs = flags.ms !== undefined ? Number(flags.ms) : Math.round(Number(flags.seconds ?? 30) * 1000);
if (!Number.isFinite(lengthMs) || lengthMs < 3000 || lengthMs > 600000) {
  console.error(`music length must be 3000-600000 ms (got ${lengthMs}). Use --seconds or --ms.`);
  process.exit(1);
}

const model = (flags.model as string) ?? 'music_v1';
const outputFormat = (flags.format as string) ?? 'mp3_44100_128';
const instrumental = !flags.vocals;

const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

(async () => {
  console.log(`Prompt:     ${prompt.slice(0, 120)}${prompt.length > 120 ? '…' : ''}`);
  console.log(`Length:     ${(lengthMs / 1000).toFixed(1)}s · ${instrumental ? 'instrumental' : 'with vocals'} · ${model}`);

  let audio: unknown;

  if (flags.plan) {
    // Two-step: review-able section structure, then compose from the plan.
    console.log('Building composition plan…');
    const plan = await client.music.compositionPlan.create({
      prompt,
      musicLengthMs: lengthMs,
    } as Parameters<typeof client.music.compositionPlan.create>[0]);
    console.log('Composing from plan…');
    audio = await client.music.compose({
      compositionPlan: plan,
      modelId: model,
    } as Parameters<typeof client.music.compose>[0]);
  } else {
    // NOTE: the API forbids `seed` together with a plain `prompt` (422). Seed is only
    // honored on the composition-plan path — use --plan if you need determinism.
    if (flags.seed !== undefined) {
      console.warn('⚠ --seed is ignored with a plain prompt (API restriction). Use --plan for repeatable structure.');
    }
    console.log('Composing…');
    audio = await client.music.compose({
      prompt,
      musicLengthMs: lengthMs,
      modelId: model,
      forceInstrumental: instrumental,
      outputFormat,
    } as Parameters<typeof client.music.compose>[0]);
  }

  const buf = await toBuffer(audio);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, buf);

  console.log(`\n✓ Wrote music: ${outPath} (${(buf.length / 1024).toFixed(0)} KB)`);
  console.log('\nNext steps:');
  console.log(`  1. Import as a ducked, faded bed:`);
  console.log(`     <Audio src={staticFile('<project>/music/${path.basename(outPath)}')} volume={duck} />`);
  console.log(`     (see references/audio-mixing.md — ~0.25 bed, ~0.15 under VO, 30f fades)`);
  console.log(`  2. Loudnorm the FINAL mix to -14 LUFS / -1 dBTP at delivery.`);
})().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('ElevenLabs Music failed:', msg);
  if (/bad_prompt|prompt/i.test(msg)) {
    console.error('Tip: remove any artist/band/song names; describe the sound in generic terms.');
  }
  process.exit(1);
});
