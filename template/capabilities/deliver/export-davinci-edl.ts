#!/usr/bin/env tsx
/**
 * capabilities/deliver/export-davinci-edl.ts — DaVinci Resolve timeline export (plan P1I, GAP-70).
 *
 * The DaVinci-native sibling of export-premiere-xml.ts. Turns the SAME `segments.json`
 * ({startMs,endMs,name,comment?,color?}[]) into a **CMX3600 EDL** — the only native, file-based,
 * dependency-free Resolve import where marker COLOR survives (via `* LOC:` locator lines) AND clips import.
 *
 * Why a separate capability (not "reuse the Premiere XML"): Resolve imports our FCP7 XML's CLIPS but DROPS
 * its timeline markers + color. The EDL `* LOC:` line is the only file path that carries marker color in.
 *
 * Two-step Resolve import:
 *   1. File ▸ Import Timeline ▸ Import AAF, EDL, XML…  (clips; the media must be in the Media Pool first)
 *   2. right-click the timeline ▸ Timelines ▸ Import ▸ Timeline Markers from EDL…  (same .edl → markers)
 *   3. set the timeline Starting Timecode = --start-tc (default 01:00:00:00) or markers offset by an hour.
 *
 * CLI:
 *   tsx export-davinci-edl.ts --in SOURCE --segments SEG.json --project NAME
 *       [--out PATH.edl] [--name "Title"] [--start-tc 01:00:00:00] [--layout annotate|assembly]
 *
 * Reuses the P1H pure helpers (msToFrame / framesToTimecode / resolveRate) — one tested math core.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { requireInputFile, run, runCapability, workDir } from '../_env/contract';
import { msToFrame, framesToTimecode, resolveRate, type Segment } from './export-premiere-xml';

export type EdlLayout = 'annotate' | 'assembly';

/** Resolved EDL source (timebase split into int + ntsc, like the XML exporter). */
export interface EdlSource {
  fps: number; // rounded integer timebase
  ntsc: boolean; // /1.001 NTSC rates
  durationFrames: number;
  hasAudio: boolean;
  fileName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (the regression surface — no I/O)
// ─────────────────────────────────────────────────────────────────────────────

/** Premiere-style color name → one of the 8 portable EDL `* LOC:` keywords. Unknown → RED (OTIO fallback). */
export function colorToEdl(name: string | undefined): string {
  const map: Record<string, string> = {
    green: 'GREEN',
    red: 'RED',
    orange: 'YELLOW', // no portable ORANGE keyword → closest classic color
    yellow: 'YELLOW',
    white: 'WHITE',
    blue: 'BLUE',
    cyan: 'CYAN',
    magenta: 'MAGENTA',
    black: 'BLACK',
  };
  return map[(name ?? 'green').toLowerCase()] ?? 'RED';
}

/** Fold to ASCII (EDL is ASCII-only; Resolve drops non-ASCII). Danish ø/æ/å → o/ae/aa. */
export function asciiFold(s: string): string {
  return (s ?? '')
    .replace(/ø/g, 'o').replace(/Ø/g, 'O')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'Ae')
    .replace(/å/g, 'aa').replace(/Å/g, 'Aa')
    .normalize('NFKD') // accented Latin → base letter + combining mark
    .replace(/[^\x20-\x7e]/g, '') // strip everything non-ASCII (incl. the combining marks)
    .replace(/\s+/g, ' ')
    .trim();
}

/** A reel/source name: ≤8 chars, A–Z/0–9 uppercase. Empty → "AX" (the no-reel convention). */
export function reelName(s: string | undefined): string {
  const cleaned = asciiFold(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned ? cleaned.slice(0, 8) : 'AX';
}

/** Parse "HH:MM:SS:FF" / "HH:MM:SS;FF" → a plain (NDF) frame count at the given timebase. */
export function tcToFrames(tc: string, timebase: number): number {
  const m = tc.match(/^(\d{1,2}):(\d{2}):(\d{2})[:;](\d{2})$/);
  if (!m) throw new Error(`bad --start-tc "${tc}" — expected HH:MM:SS:FF`);
  return ((+m[1] * 3600 + +m[2] * 60 + +m[3]) * timebase) + +m[4];
}

interface EdlSeg extends Segment {
  inF: number;
  outF: number;
  len: number;
}

/** Build the CMX3600 EDL document string. Pure → unit-testable. */
export function buildEdl(opts: { source: EdlSource; segments: Segment[]; layout?: EdlLayout; startTcFrames: number; title: string }): string {
  const { source, segments, startTcFrames, title } = opts;
  const layout: EdlLayout = opts.layout ?? 'annotate';
  const { fps, ntsc, durationFrames, hasAudio, fileName } = source;
  const drop = ntsc && (fps === 30 || fps === 60);
  const channel = hasAudio ? 'AA/V' : 'V';
  const reel = reelName(fileName);
  const clipName = asciiFold(fileName).toUpperCase();

  const segs: EdlSeg[] = segments.map((s) => {
    const inF = msToFrame(s.startMs, fps, ntsc);
    const outF = Math.max(inF + 1, msToFrame(s.endMs, fps, ntsc));
    return { ...s, inF, outF, len: outF - inF };
  });

  const tc = (frame: number) => framesToTimecode(frame, fps, ntsc, drop);
  const eventLine = (n: number, srcIn: number, srcOut: number, recIn: number, recOut: number) =>
    `${String(n).padStart(3, '0')}  ${reel.padEnd(8)} ${channel.padEnd(5)} C        ${tc(srcIn)} ${tc(srcOut)} ${tc(recIn)} ${tc(recOut)}`;
  const locLine = (recFrame: number, color: string, label: string) =>
    `* LOC: ${tc(recFrame)} ${colorToEdl(color).padEnd(7)} ${asciiFold(label)}`;
  // EDL has no per-marker note field → fold the idea + description into the locator label.
  const markerLabel = (s: EdlSeg) => `${s.name}${s.comment ? ' - ' + s.comment : ''}`;

  const lines: string[] = [`TITLE: ${asciiFold(title).toUpperCase()}`, '', `FCM: ${drop ? 'DROP FRAME' : 'NON-DROP FRAME'}`, ''];

  if (layout === 'annotate') {
    // One full-length event (the whole source) + one `* LOC:` per segment at its source→record position.
    // This is the documented "import comments/markers into Resolve" pattern (one clip, many LOC lines).
    if (segs.length > 999) throw new Error(`${segs.length} markers exceed the CMX3600 999-event cap`);
    lines.push(eventLine(1, 0, durationFrames, startTcFrames, startTcFrames + durationFrames));
    lines.push(`* FROM CLIP NAME: ${clipName}`);
    for (const s of segs) lines.push(locLine(startTcFrames + s.inF, s.color ?? 'green', markerLabel(s)));
  } else {
    // assembly: each segment is its own contiguous event (clip) on V1 with one marker at its record-in.
    if (segs.length > 999) throw new Error(`${segs.length} segments exceed the CMX3600 999-event cap`);
    let cursor = startTcFrames;
    segs.forEach((s, i) => {
      const recIn = cursor;
      const recOut = cursor + s.len;
      lines.push(eventLine(i + 1, s.inF, s.outF, recIn, recOut));
      lines.push(`* FROM CLIP NAME: ${clipName}`);
      lines.push(locLine(recIn, s.color ?? 'green', markerLabel(s)));
      cursor = recOut;
    });
  }

  return lines.join('\r\n') + '\r\n';
}

function evalFps(r: string | undefined): number | null {
  if (!r) return null;
  const [n, d] = r.split('/').map(Number);
  return d ? n / d : n;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'timeline';
}

interface SegmentsFile {
  source?: { fps?: number; ntsc?: boolean; durationFrames?: number; hasAudio?: boolean };
  segments: Segment[];
}

async function main(): Promise<void> {
  await runCapability('deliver/export-davinci-edl', async () => {
    const inPath = requireInputFile(arg('in'), 'source video');
    const segPath = requireInputFile(arg('segments'), 'segments json');
    const project = arg('project') ?? '_scratch';
    const title = arg('name') ?? 'Vibe Timeline';
    const layout = (arg('layout') ?? 'annotate') as EdlLayout;
    if (!['annotate', 'assembly'].includes(layout)) throw new Error(`--layout must be annotate|assembly, got "${layout}"`);
    const startTcStr = arg('start-tc') ?? '01:00:00:00';

    const parsed = JSON.parse(fs.readFileSync(segPath, 'utf8')) as SegmentsFile;
    if (!Array.isArray(parsed.segments) || parsed.segments.length === 0) throw new Error('segments json has no "segments" array');
    for (const s of parsed.segments) {
      if (typeof s.startMs !== 'number' || typeof s.endMs !== 'number') throw new Error('each segment needs numeric startMs + endMs');
      if (s.endMs <= s.startMs) throw new Error(`segment "${s.name ?? '?'}" has endMs <= startMs`);
    }

    // Resolve the source: from the JSON block, else auto-probe --in.
    let source: EdlSource;
    const sj = parsed.source;
    if (sj && sj.fps && sj.durationFrames) {
      const { fps, ntsc } = sj.ntsc !== undefined ? { fps: Math.round(sj.fps), ntsc: sj.ntsc } : resolveRate(sj.fps);
      source = { fps, ntsc, durationFrames: sj.durationFrames, hasAudio: sj.hasAudio ?? false, fileName: path.basename(inPath) };
    } else {
      const { resolveFfmpeg } = await import('../_env/ffmpeg');
      const { ffprobe } = resolveFfmpeg();
      const r = run(ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', inPath]);
      if (r.status !== 0) throw new Error(`ffprobe failed (exit ${r.status}):\n${r.stderr.slice(-600)}`);
      const data = JSON.parse(r.stdout) as { streams: { codec_type: string; r_frame_rate?: string }[]; format: { duration: string } };
      const video = data.streams.find((s) => s.codec_type === 'video');
      const audio = data.streams.find((s) => s.codec_type === 'audio');
      if (!video) throw new Error('source has no video stream');
      const { fps, ntsc } = resolveRate(evalFps(video.r_frame_rate) ?? 30);
      source = { fps, ntsc, durationFrames: msToFrame(parseFloat(data.format.duration) * 1000, fps, ntsc), hasAudio: !!audio, fileName: path.basename(inPath) };
    }

    const startTcFrames = tcToFrames(startTcStr, source.fps);
    const edl = buildEdl({ source, segments: parsed.segments, layout, startTcFrames, title });

    const dir = workDir(project, 'deliver');
    const edlPath = arg('out') ? path.resolve(arg('out') as string) : path.join(dir, `${slugify(title)}.davinci.edl`);
    fs.mkdirSync(path.dirname(edlPath), { recursive: true });
    fs.writeFileSync(edlPath, edl, 'utf8');

    console.error(`export-davinci-edl: ${parsed.segments.length} marker(s) · ${source.fps}fps${source.ntsc ? ' NTSC' : ''} · FCM ${source.ntsc && (source.fps === 30 || source.fps === 60) ? 'DROP' : 'NON-DROP'} · layout=${layout} · start ${startTcStr}\n  ${edlPath}`);

    return {
      outputs: [edlPath],
      metrics: { segments: parsed.segments.length, fps: source.fps, ntsc: source.ntsc, dropFrame: source.ntsc && (source.fps === 30 || source.fps === 60), layout, eventCount: layout === 'annotate' ? 1 : parsed.segments.length, startTc: startTcStr },
      project,
      args: process.argv.slice(2),
    };
  });
}

// Symlink-safe main-guard: macOS tmp/cwd paths can reach the same file via /var → /private/var,
// so a plain path.resolve comparison misses (live-found on Apple-silicon CI at GATE V3).
const realpathSafe = (p: string): string => { try { return fs.realpathSync(path.resolve(p)); } catch { return path.resolve(p); } };
if (process.argv[1] && realpathSafe(process.argv[1]) === realpathSafe(__filename)) void main();
