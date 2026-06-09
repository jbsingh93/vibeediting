#!/usr/bin/env tsx
/**
 * capabilities/perception/gemini-client.ts — shared Gemini Files-API helper (plan P1E.1).
 *
 * Factored out so the council (gemini-council.ts) and reference-analyze can UPLOAD ONCE and reuse the
 * same file across many specialist prompts (instead of re-uploading per call). Model defaults to the
 * single source of truth (_env/models.json → perception.visualCortex = gemini-3.1-flash-lite, GAP-38).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FileState, GoogleGenAI, MediaResolution, ThinkingLevel } from '@google/genai';
import { loadDotEnv, modelId } from '../_env/contract';

export function geminiApiKey(): string {
  loadDotEnv();
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) required — add to .env');
  return key;
}

export function visualCortexModel(): string {
  return modelId('perception.visualCortex'); // gemini-3.1-flash-lite (GAP-38); GEMINI_MODEL overrides
}

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.3gp': 'video/3gpp',
};
export function mimeFor(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'video/mp4';
}

export interface UploadedFile {
  uri: string;
  mimeType: string;
  name: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Upload a video and poll until ACTIVE. Caller must deleteFile() when done (unless --keep). */
export async function uploadAndWait(ai: GoogleGenAI, videoPath: string): Promise<UploadedFile> {
  if (!fs.existsSync(videoPath)) throw new Error(`file not found: ${videoPath}`);
  const sizeMB = fs.statSync(videoPath).size / (1024 * 1024);
  if (sizeMB > 2048) throw new Error(`${sizeMB.toFixed(0)} MB exceeds the 2 GB Files-API limit — make a proxy first`);
  const mimeType = mimeFor(videoPath);
  let file = await ai.files.upload({ file: videoPath, config: { mimeType } });
  const deadline = Date.now() + 10 * 60 * 1000;
  while (file.state === FileState.PROCESSING) {
    if (Date.now() > deadline) throw new Error('timed out waiting for Gemini to process the upload');
    await sleep(3000);
    file = await ai.files.get({ name: file.name as string });
  }
  if (file.state === FileState.FAILED) throw new Error(`Gemini failed to process the file: ${JSON.stringify(file.error ?? {})}`);
  return { uri: file.uri as string, mimeType: file.mimeType as string, name: file.name as string };
}

export async function deleteFile(ai: GoogleGenAI, name: string): Promise<void> {
  await ai.files.delete({ name }).catch(() => {});
}

export function resolutionEnum(r: 'low' | 'default' | 'high'): MediaResolution | undefined {
  if (r === 'low') return MediaResolution.MEDIA_RESOLUTION_LOW;
  if (r === 'high') return MediaResolution.MEDIA_RESOLUTION_HIGH;
  return undefined;
}

export function thinkingEnum(t: 'minimal' | 'low' | 'medium' | 'high' | undefined): ThinkingLevel | undefined {
  switch (t) {
    case 'minimal': return ThinkingLevel.MINIMAL;
    case 'low': return ThinkingLevel.LOW;
    case 'medium': return ThinkingLevel.MEDIUM;
    case 'high': return ThinkingLevel.HIGH;
    default: return undefined;
  }
}

/** Best-effort JSON parse — strips ``` fences / surrounding prose. */
export function parseJsonLoose(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* keep trying */
    }
  }
  const first = t.indexOf('{'), last = t.lastIndexOf('}');
  if (first !== -1 && last > first) return JSON.parse(t.slice(first, last + 1));
  throw new Error('model did not return parseable JSON');
}

/** Run one prompt against an already-uploaded file. Returns parsed JSON. */
export async function askJson(
  ai: GoogleGenAI,
  model: string,
  file: UploadedFile,
  prompt: string,
  opts: { fps?: number; resolution?: 'low' | 'default' | 'high'; thinking?: 'minimal' | 'low' | 'medium' | 'high' } = {},
): Promise<unknown> {
  const videoMetadata: Record<string, unknown> = { fps: opts.fps ?? 2 };
  // Temperature is left at the Gemini-3 default (1.0) — lowering it risks looping/degraded reasoning.
  const config: Record<string, unknown> = { responseMimeType: 'application/json' };
  const mr = resolutionEnum(opts.resolution ?? 'default');
  if (mr) config.mediaResolution = mr;
  const tl = thinkingEnum(opts.thinking);
  if (tl) config.thinkingConfig = { thinkingLevel: tl };
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ fileData: { fileUri: file.uri, mimeType: file.mimeType }, videoMetadata }, { text: prompt }] }],
    config,
  });
  const text = response.text ?? '';
  if (!text.trim()) throw new Error('Gemini returned an empty response');
  return parseJsonLoose(text);
}
