#!/usr/bin/env tsx
/**
 * ElevenLabs Text-to-Speech — generate a voiceover ON THE FLY.
 *
 * The default voice comes from brand/brand.json → voice.elevenlabsVoiceId (set yours
 * there — a cloned voice or any voice from https://elevenlabs.io/voices). You can
 * always override per-call with --voice <name|id>. This resolves a voice by NAME
 * (or accepts a raw voice_id), synthesizes the text, and writes an mp3 straight
 * into the Remotion pipeline (public/<project>/voiceovers/).
 *
 * This is ADDITIVE — it does not replace recorded VO. Use it for scratch/temp VO,
 * fully-synthetic ads, or quick variant lines. The output is a normal audio asset:
 * caption it with capabilities/ingest/transcribe.ts and loudnorm at delivery, same as any VO.
 *
 * Usage:
 *   tsx capabilities/generate/elevenlabs-tts.ts <text | @file.txt> <output.mp3> [options]
 *
 * Options:
 *   --voice <name|id>     Voice name (resolved via search) or raw voice_id.
 *                         Default: brand/brand.json → voice.elevenlabsVoiceId
 *   --model <id>          Default: eleven_multilingual_v2 (stable, 29 langs)
 *   --v3                  Shortcut for --model eleven_v3 (most expressive, 74 langs)
 *   --lang <en|da|...>    ISO-639-1 language_code. Only sent for models that accept it
 *                         (v3 / flash / turbo); multilingual_v2 infers from the text.
 *                         Default: en
 *   --stability <0-1>     Voice setting. Default: 0.5
 *   --similarity <0-1>    similarity_boost. Default: 0.75
 *   --style <0-1>         style exaggeration. Default: 0
 *   --speed <0.7-1.2>     speaking rate. Default: 1.0
 *   --no-speaker-boost    Disable use_speaker_boost (on by default)
 *   --seed <int>          Determinism (0-4294967295). Same seed+text → ~same take.
 *   --format <fmt>        output_format. Default: mp3_44100_128
 *   --list-voices         Print available voices (id · name · category) and exit
 *
 * Examples:
 *   tsx capabilities/generate/elevenlabs-tts.ts "Welcome to the channel." public/launch/voiceovers/vo-intro-v1.mp3
 *   tsx capabilities/generate/elevenlabs-tts.ts @public/launch/script.txt public/launch/voiceovers/vo-30s-v1.mp3 --seed 42
 *   tsx capabilities/generate/elevenlabs-tts.ts "Hi there" out/scratch/en.mp3 --voice "Rachel" --v3 --lang en
 *   tsx capabilities/generate/elevenlabs-tts.ts --list-voices
 *
 * Requires:
 *   - npm i @elevenlabs/elevenlabs-js
 *   - ELEVENLABS_API_KEY in .env (auto-loaded) → https://elevenlabs.io/app/settings/api-keys
 *
 * NOTE: this spends ElevenLabs credits. Generated VO is gitignored audio like any other.
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

// ───────────────────────────── shared helpers ────────────────────────────────
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

/** Collect any audio return shape from the SDK (web ReadableStream, async iterable, Buffer, Blob). */
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
      console.error(`Script file not found: ${file}`);
      process.exit(1);
    }
    return fs.readFileSync(file, 'utf8').trim();
  }
  return arg;
}

const VOICE_ID_RE = /^[A-Za-z0-9]{20}$/;

/**
 * Default voice from brand/brand.json → voice.elevenlabsVoiceId (D10: ships EMPTY —
 * the user sets their own cloned/picked voice there, or passes --voice per call).
 */
function brandVoiceId(): string | null {
  const candidates = [
    path.join(process.cwd(), 'brand', 'brand.json'),
    path.join(__dirname, '..', '..', 'brand', 'brand.json'),
  ];
  for (const file of candidates) {
    try {
      const brand = JSON.parse(fs.readFileSync(file, 'utf8')) as {
        voice?: { elevenlabsVoiceId?: string };
      };
      const id = brand.voice?.elevenlabsVoiceId?.trim();
      if (id) return id;
    } catch {
      /* missing/malformed brand.json — fall through */
    }
  }
  return null;
}

interface VoiceLite {
  voiceId: string;
  name: string;
  category?: string;
}

function normalizeVoices(result: unknown): VoiceLite[] {
  const list = (result as { voices?: unknown[] })?.voices ?? [];
  return list.map((v) => {
    const o = v as Record<string, unknown>;
    return {
      voiceId: String(o.voiceId ?? o.voice_id ?? ''),
      name: String(o.name ?? ''),
      category: o.category ? String(o.category) : undefined,
    };
  });
}

// ───────────────────────────── main ──────────────────────────────────────────
loadDotEnv();

const { positional, flags } = parseFlags(process.argv.slice(2));

if (!process.env.ELEVENLABS_API_KEY) {
  console.error('ELEVENLABS_API_KEY missing. Add it to .env (auto-loaded).');
  console.error('Get a key: https://elevenlabs.io/app/settings/api-keys');
  process.exit(1);
}

const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

async function resolveVoiceId(wanted: string): Promise<string> {
  if (VOICE_ID_RE.test(wanted)) return wanted; // already an id
  const res = await client.voices.search({ search: wanted });
  const voices = normalizeVoices(res);
  if (voices.length === 0) {
    console.error(`No voice found matching "${wanted}". Run --list-voices to see options.`);
    process.exit(1);
  }
  const exact = voices.find((v) => v.name.toLowerCase() === wanted.toLowerCase());
  const chosen = exact ?? voices[0];
  if (!exact) {
    console.warn(`⚠ No exact name match for "${wanted}"; using closest: ${chosen.name}`);
  }
  console.log(`Voice:      ${chosen.name} (${chosen.voiceId})${chosen.category ? ` · ${chosen.category}` : ''}`);
  return chosen.voiceId;
}

(async () => {
  // --list-voices mode
  if (flags['list-voices']) {
    const res = await client.voices.search({ pageSize: 100 });
    const voices = normalizeVoices(res);
    console.log(`${voices.length} voice(s):\n`);
    for (const v of voices) {
      console.log(`  ${v.voiceId}  ${v.name}${v.category ? `  · ${v.category}` : ''}`);
    }
    return;
  }

  const [textArg, outPath] = positional;
  if (!textArg || !outPath) {
    console.error('Usage: tsx capabilities/generate/elevenlabs-tts.ts <text | @file.txt> <output.mp3> [options]');
    console.error('       tsx capabilities/generate/elevenlabs-tts.ts --list-voices');
    process.exit(1);
  }

  const text = readTextArg(textArg);
  if (!text) {
    console.error('Empty text — nothing to synthesize.');
    process.exit(1);
  }

  const model = flags['v3'] ? 'eleven_v3' : (flags.model as string) ?? 'eleven_multilingual_v2';
  const voiceName = (flags.voice as string) ?? brandVoiceId();
  if (!voiceName) {
    console.error('No voice configured. Set voice.elevenlabsVoiceId in brand/brand.json');
    console.error('(pick one at https://elevenlabs.io/voices or clone your own), or pass --voice <name|id>.');
    process.exit(1);
  }
  const lang = (flags.lang as string) ?? 'en';
  const outputFormat = (flags.format as string) ?? 'mp3_44100_128';

  const num = (k: string, d: number): number => (flags[k] !== undefined ? Number(flags[k]) : d);

  const voiceSettings = {
    stability: num('stability', 0.5),
    similarityBoost: num('similarity', 0.75),
    style: num('style', 0),
    speed: num('speed', 1.0),
    useSpeakerBoost: flags['no-speaker-boost'] ? false : true,
  };

  const voiceId = await resolveVoiceId(voiceName);

  // language_code is only honored by v3 / flash / turbo models; multilingual_v2 infers it.
  const sendLang = /v3|flash|turbo/i.test(model);

  console.log(`Model:      ${model}`);
  console.log(`Text:       ${text.length} chars${sendLang ? ` · lang=${lang}` : ' (lang inferred from text)'}`);
  console.log(`Synthesizing…`);

  const audio = await client.textToSpeech.convert(voiceId, {
    text,
    modelId: model,
    outputFormat,
    voiceSettings,
    ...(sendLang ? { languageCode: lang } : {}),
    ...(flags.seed !== undefined ? { seed: Number(flags.seed) } : {}),
  } as Parameters<typeof client.textToSpeech.convert>[1]);

  const buf = await toBuffer(audio);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, buf);

  console.log(`\n✓ Wrote VO: ${outPath} (${(buf.length / 1024).toFixed(0)} KB)`);
  console.log('\nNext steps:');
  console.log(`  1. Caption it:  tsx capabilities/ingest/transcribe.ts --in ${outPath} --out-prefix ${outPath.replace(/\.[^.]+$/, '')}`);
  console.log(`  2. Import:      <Audio src={staticFile('<project>/voiceovers/${path.basename(outPath)}')} />`);
  console.log(`  3. Loudnorm the FINAL mix to -14 LUFS / -1 dBTP at delivery (capabilities/deliver/loudnorm.ts).`);
})().catch((err) => {
  console.error('ElevenLabs TTS failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
