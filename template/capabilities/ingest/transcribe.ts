#!/usr/bin/env tsx
/**
 * capabilities/ingest/transcribe.ts — OpenAI Whisper STT, the ONLY STT.
 *
 * STT IS OpenAI `whisper-1` ONLY — NO local/faster-whisper path or fallback (binding rule).
 * The model id is read from the single source of truth (_env/models.json → transcription.cloud).
 *
 * Output schema: `<prefix>.captions.json` (Remotion Caption[]) + `<prefix>.srt`.
 *
 * CLI:
 *   tsx capabilities/ingest/transcribe.ts --in AUDIO --out-prefix PREFIX [--project NAME] [--lang xx]
 *   tsx capabilities/ingest/transcribe.ts AUDIO PREFIX            (positional, back-compat)
 *
 * `--lang` is an ISO-639-1 hint to Whisper (improves accuracy + speed when the language
 * is known); omitted → auto-detect (handles mixed-language audio).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import OpenAI from 'openai';
import { openAiWhisperApiToCaptions } from '@remotion/openai-whisper';
import { serializeSrt, type Caption } from '@remotion/captions';
import { hasEnv, loadDotEnv, modelId, requireInputFile, runCapability } from '../_env/contract';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type WhisperInput = Parameters<typeof openAiWhisperApiToCaptions>[0];

async function main(): Promise<void> {
  await runCapability('ingest/transcribe', async () => {
    loadDotEnv();
    const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    const audioPath = requireInputFile(arg('in') ?? positional[0], 'audio');
    const prefix = arg('out-prefix') ?? positional[1];
    if (!prefix) throw new Error('missing --out-prefix (or positional PREFIX)');
    if (!hasEnv('OPENAI_API_KEY')) throw new Error('OPENAI_API_KEY required (STT is OpenAI whisper-1 only)');
    const model = modelId('transcription.cloud'); // 'whisper-1'
    const project = arg('project') ?? '_scratch';
    const lang = arg('lang'); // ISO-639-1 hint; omitted → auto-detect (mixed-language audio)

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model,
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
      ...(lang ? { language: lang } : {}),
    });

    const { captions } = openAiWhisperApiToCaptions({
      transcription: transcription as unknown as WhisperInput['transcription'],
    });

    const jsonPath = `${prefix}.captions.json`;
    const srtPath = `${prefix}.srt`;
    fs.writeFileSync(jsonPath, JSON.stringify(captions, null, 2));
    fs.writeFileSync(srtPath, serializeSrt({ lines: captions.map((c: Caption) => [c]) }));

    return {
      outputs: [jsonPath, srtPath].map((p) => path.resolve(p)),
      metrics: { model, tokens: captions.length, durationMs: captions.length ? captions[captions.length - 1].endMs : 0 },
      project,
      args: process.argv.slice(2),
    };
  });
}

void main();
