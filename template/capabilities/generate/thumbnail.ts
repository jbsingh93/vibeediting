#!/usr/bin/env tsx
/**
 * capabilities/generate/thumbnail.ts — video frame + prompt → polished thumbnail (GAP-72).
 *
 * Extracts a frame from the finished video (full-build ffmpeg), sends it as the INPUT IMAGE to
 * OpenAI's image model (models.json `image.thumbnail`, today gpt-image-2-2026-04-21) via
 * `/v1/images/edits`, and writes "<video_name> thumbnail.<ext>" NEXT TO the video, in the video's
 * exact aspect ratio. The model keeps the subject's face (gpt-image-2 always runs input at high
 * fidelity — `input_fidelity` is GONE; sending it fails the request, so we never do).
 *
 * Prompting + craft rules live in capabilities/generate/THUMBNAIL-GUIDE.md — read it before
 * writing --prompt. Non-ASCII headline text (æ/ø/å …) garbles in-model: prefer NO in-image text
 * (default) and overlay text in Remotion, or pass --headline for short ASCII-safe text.
 *
 * CLI:
 *   tsx capabilities/generate/thumbnail.ts --video VIDEO.mp4 --prompt "<creative direction | @file.txt>"
 *     (use @file.txt for multi-line prompts — Windows npx/cmd shims TRUNCATE inline args at the first newline)
 *     [--at 75 | --at 1:15]        frame timestamp (default: video midpoint)
 *     [--aspect 3:4]               override the output aspect (default: the video's own aspect)
 *     [--out PATH]                 default: <video dir>/<video_name> thumbnail.<format>
 *     [--n 1]                      variants 1-4 (v2/v3/v4 suffixes) — for YouTube Test & Compare
 *     [--quality high]             low|medium|high|auto (low for drafts; high for finals)
 *     [--format png]               png|jpg (png >2MB auto-emits a .jpg sibling for upload caps)
 *     [--headline "TEXT"]          optional in-image headline (ASCII-safe; non-ASCII warns)
 *     [--raw]                      use --prompt verbatim (skip the Change+Preserve scaffold)
 *     [--moderation low]           low|auto (low = fewer false blocks on the creator's own face)
 *     [--project NAME] [--dry-run]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ImageEditParamsNonStreaming, ImagesResponse } from 'openai/resources/images';
import { loadDotEnv, modelId, requireInputFile, run, runCapability, workDir } from '../_env/contract';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** "75" | "75.5" | "1:15" | "01:15.5" → seconds. */
export function parseAt(v: string): number {
  const parts = v.split(':').map(Number);
  if (!parts.length || parts.some((n) => Number.isNaN(n) || n < 0)) throw new Error(`bad --at value: "${v}" (use seconds or mm:ss)`);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/**
 * Pick the gpt-image-2 generation size for a video aspect: scale so the LONG edge is 2048,
 * round each edge to a multiple of 16 (API rule). 16:9 → 2048x1152, 9:16 → 1152x2048 (native).
 */
export function genSize(w: number, h: number): { gw: number; gh: number } {
  const scale = 2048 / Math.max(w, h);
  const gw = Math.max(16, Math.round((w * scale) / 16) * 16);
  const gh = Math.max(16, Math.round((h * scale) / 16) * 16);
  return { gw, gh };
}

/** Final deliverable size: the video's own resolution, capped at the generated size (never upscale). */
export function finalSize(w: number, h: number, gw: number, gh: number): { tw: number; th: number } {
  const sf = Math.min(1, gw / w, gh / h);
  return { tw: Math.round(w * sf), th: Math.round(h * sf) };
}

/** Wrap the user's creative direction in the Change+Preserve+Realism scaffold (THUMBNAIL-GUIDE.md). */
export function buildPrompt(style: string, orientation: string, headline?: string): string {
  const blocks = [
    `Edit the input image (a frame from a talking-head video).`,
    `CHANGE: ${style.trim()}`,
    `PRESERVE (do not alter in any way): the person's face, facial features, facial landmarks and bone structure, skin tone and natural skin texture, expression, hair, and head pose from the input frame — keep them recognizably the same person. If no person is visible, preserve the key subject of the frame instead.`,
  ];
  if (headline) {
    blocks.push(
      `HEADLINE (EXACT TEXT, render verbatim, exactly once, no extra characters): "${headline.trim()}" — heavy bold sans-serif, white #FFFFFF with a yellow #FFE600 accent, placed over negative space away from the face, large and perfectly legible at small sizes.`,
    );
  }
  blocks.push(
    `USE CASE: a polished, credible-premium video thumbnail (${orientation}). Calm confident tone — NOT exaggerated clickbait.`,
    `REALISM: natural skin texture, realistic lighting and shadows, professional photography look, ultra-sharp, high contrast so it stays legible as a tiny feed thumbnail.`,
    `CONSTRAINTS: one clear focal point and at most 3 visual elements; nothing important near the bottom-right corner; no watermark, no logos, no extra people, no plastic over-smoothed skin.` +
      (headline ? ' The headline appears exactly once; no other text.' : ' Do not render any text, words, letters or captions.'),
  );
  return blocks.join('\n\n');
}

async function main(): Promise<void> {
  await runCapability<Record<string, unknown>>('generate/thumbnail', async () => {
    loadDotEnv();
    const { resolveFfmpeg } = await import('../_env/ffmpeg');
    const { ffmpeg, ffprobe } = resolveFfmpeg();

    const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    const video = requireInputFile(arg('video') ?? arg('in') ?? positional[0], 'video');
    let style = arg('prompt');
    if (!style) throw new Error('missing --prompt (the creative direction — see capabilities/generate/THUMBNAIL-GUIDE.md)');
    // @file form for multi-line prompts (Windows npx/cmd shims truncate inline args at the first newline)
    if (style.startsWith('@')) style = fs.readFileSync(requireInputFile(style.slice(1), 'prompt file'), 'utf8').trim();
    const project = arg('project') ?? '_scratch';
    const quality = arg('quality') ?? 'high';
    if (!['low', 'medium', 'high', 'auto'].includes(quality)) throw new Error(`bad --quality "${quality}" (low|medium|high|auto)`);
    const format = (arg('format') ?? 'png').toLowerCase();
    if (!['png', 'jpg'].includes(format)) throw new Error(`bad --format "${format}" (png|jpg)`);
    const moderation = arg('moderation') ?? 'low';
    const n = Math.min(4, Math.max(1, parseInt(arg('n') ?? '1', 10) || 1));
    const headline = arg('headline');
    const warnings: string[] = [];
    if (headline && /[æøåÆØÅ]/.test(headline)) {
      warnings.push('headline contains non-ASCII glyphs — gpt-image often garbles accented Latin glyphs; prefer overlaying the text in Remotion (THUMBNAIL-GUIDE.md)');
    }

    // 1) Probe the video — the thumbnail MUST match its aspect ratio.
    const pr = run(ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', video]);
    if (pr.status !== 0) throw new Error(`ffprobe failed (exit ${pr.status}):\n${pr.stderr.slice(-800)}`);
    const probe = JSON.parse(pr.stdout) as { streams: { codec_type: string; width?: number; height?: number }[]; format: { duration?: string } };
    const vs = probe.streams.find((s) => s.codec_type === 'video');
    if (!vs?.width || !vs?.height) throw new Error(`no video stream in ${video}`);
    const durationSec = parseFloat(probe.format.duration ?? '0');

    // 2) Extract the frame (default: midpoint — pass --at for a deliberately chosen moment).
    const at = Math.min(Math.max(0, arg('at') ? parseAt(arg('at')!) : durationSec / 2), Math.max(0, durationSec - 0.1));
    const work = workDir(project, 'thumbnail');
    const framePng = path.join(work, `frame-${at.toFixed(2)}s.png`);
    const fr = run(ffmpeg, ['-y', '-ss', at.toFixed(3), '-i', video, '-frames:v', '1', framePng]);
    if (fr.status !== 0 || !fs.existsSync(framePng)) throw new Error(`frame extract failed (exit ${fr.status}):\n${fr.stderr.slice(-800)}`);

    // 3) Sizes: generate at long-edge-2048 in the video's aspect (or --aspect W:H override),
    //    deliver at the video's own resolution (or the generated size when overridden).
    let aw = vs.width, ah = vs.height;
    if (arg('aspect')) {
      const m = /^(\d+):(\d+)$/.exec(arg('aspect')!);
      if (!m) throw new Error(`bad --aspect "${arg('aspect')}" (use W:H, e.g. 3:4)`);
      aw = parseInt(m[1], 10) * 1000;
      ah = parseInt(m[2], 10) * 1000;
    }
    const { gw, gh } = genSize(aw, ah);
    const { tw, th } = finalSize(aw, ah, gw, gh);
    const ratio = aw / ah;
    const orientation = ratio > 1.05 ? 'landscape 16:9-class' : ratio < 0.95 ? 'portrait 9:16-class' : 'square';

    // 4) Prompt: Change+Preserve scaffold unless --raw.
    const finalPrompt = flag('raw') ? style : buildPrompt(style, orientation, headline);

    // 5) Output naming: "<video_name> thumbnail.<ext>" NEXT TO the video; variants get " v2"/" v3".
    const videoName = path.basename(video).replace(/\.[^.]+$/, '');
    const firstOut = arg('out') ? path.resolve(arg('out')!) : path.join(path.dirname(video), `${videoName} thumbnail.${format}`);
    const outFor = (i: number): string => (i === 0 ? firstOut : firstOut.replace(/(\.[^.]+)$/, ` v${i + 1}$1`));
    const model = modelId('image.thumbnail');

    if (flag('dry-run')) {
      const plan = { model, size: `${gw}x${gh}`, quality, moderation, n, frame: framePng, frameAtSec: +at.toFixed(2), finalSize: `${tw}x${th}`, outputs: Array.from({ length: n }, (_, i) => outFor(i)), prompt: finalPrompt };
      const planPath = path.join(work, 'thumbnail-plan.json');
      fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');
      console.error(`DRY-RUN — would call ${model} images/edits @ ${gw}x${gh} ${quality} (n=${n})\n  frame: ${framePng}\n  out:   ${plan.outputs.join(', ')}\n  plan:  ${planPath}`);
      return { outputs: [framePng, planPath], metrics: { dryRun: true, ...plan, prompt: undefined, promptChars: finalPrompt.length }, warnings: warnings.length ? warnings : undefined, project, args: process.argv.slice(2) };
    }

    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing — add it to .env');

    // 6) gpt-image-2 via images/edits (multipart). NEVER send input_fidelity (gpt-image-2 rejects it).
    const OpenAI = (await import('openai')).default;
    const { toFile } = await import('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const params = {
      model,
      image: await toFile(fs.createReadStream(framePng), 'frame.png', { type: 'image/png' }),
      prompt: finalPrompt,
      size: `${gw}x${gh}`,
      quality,
      output_format: 'png',
      moderation,
      n,
    } as unknown as ImageEditParamsNonStreaming;

    console.error(`Generating ${n} thumbnail(s) with ${model} @ ${gw}x${gh} ${quality} … (can take ~1-2 min)`);
    let rsp: ImagesResponse;
    try {
      rsp = await client.images.edit(params);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/moderation/i.test(msg)) {
        throw new Error(`OpenAI moderation blocked the request (the safety layer sometimes false-flags realistic faces — it IS the creator's own footage). Try a different frame (--at), soften the prompt, or keep --moderation low. Original: ${msg}`);
      }
      throw e;
    }
    const images = rsp.data ?? [];
    if (!images.length) throw new Error('images/edits returned no images');

    // 7) Scale/crop each result to the video's exact aspect + resolution, write next to the video.
    const outputs: string[] = [];
    let totalBytes = 0;
    for (let i = 0; i < images.length; i++) {
      const b64 = images[i].b64_json;
      if (!b64) throw new Error(`result ${i + 1} has no b64_json payload`);
      const genPng = path.join(work, `gen-${i + 1}.png`);
      fs.writeFileSync(genPng, Buffer.from(b64, 'base64'));
      const out = outFor(i);
      const encArgs = format === 'jpg' ? ['-q:v', '2'] : [];
      const sc = run(ffmpeg, ['-y', '-i', genPng, '-vf', `scale=${tw}:${th}:force_original_aspect_ratio=increase:flags=lanczos,crop=${tw}:${th}`, ...encArgs, out]);
      if (sc.status !== 0) throw new Error(`final scale failed (exit ${sc.status}):\n${sc.stderr.slice(-800)}`);
      outputs.push(out);
      const bytes = fs.statSync(out).size;
      totalBytes += bytes;
      // YouTube/LinkedIn upload cap is 2 MB — auto-provide a JPG sibling when the PNG busts it.
      if (format === 'png' && bytes > 2_000_000) {
        const jpg = out.replace(/\.png$/i, '.jpg');
        const jc = run(ffmpeg, ['-y', '-i', out, '-q:v', '2', jpg]);
        if (jc.status === 0) {
          outputs.push(jpg);
          warnings.push(`${path.basename(out)} is ${(bytes / 1024 / 1024).toFixed(1)} MB (>2 MB upload cap) — wrote ${path.basename(jpg)} (${(fs.statSync(jpg).size / 1024 / 1024).toFixed(1)} MB) for upload`);
        }
      }
    }

    const usage = rsp.usage;
    console.error(`✓ ${outputs.map((o) => path.basename(o)).join('\n✓ ')}`);
    return {
      outputs,
      metrics: { video, videoName, frameAtSec: +at.toFixed(2), videoSize: `${vs.width}x${vs.height}`, genSize: `${gw}x${gh}`, finalSize: `${tw}x${th}`, model, quality, n, format, totalBytes, usage: usage ?? null },
      warnings: warnings.length ? warnings : undefined,
      project,
      args: process.argv.slice(2),
    };
  });
}

// Symlink-safe main-guard: macOS tmp/cwd paths can reach the same file via /var → /private/var,
// so a plain path.resolve comparison misses (live-found on Apple-silicon CI at GATE V3).
const realpathSafe = (p: string): string => { try { return fs.realpathSync(path.resolve(p)); } catch { return path.resolve(p); } };
if (process.argv[1] && realpathSafe(process.argv[1]) === realpathSafe(__filename)) void main();
