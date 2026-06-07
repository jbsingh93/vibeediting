#!/usr/bin/env tsx
/**
 * capabilities/deliver/export-premiere-xml.ts — NLE timeline export (plan P1H, GAP-68/69).
 *
 * Turns a `segments.json` ({ startMs, endMs, name, comment?, color? }[]) into **FCP7 XML (XMEML)** —
 * the ONLY interchange format modern Premiere Pro imports NATIVELY that carries BOTH timeline CLIPS
 * and timeline MARKERS. An editor does `File ▸ Import` and gets a sequence where each chosen segment
 * is laid as a clip AND annotated by a range marker ("fra xx:xx til xx:xx er dette xyz").
 *
 * The "find the N best sequences" front-end is NOT a new engine (GAP-69) — the video-editor
 * planner composes the already-shipped Whisper word timing + gemini-council to emit the segments.json
 * this exporter consumes. See references/best-segments-selection.md.
 *
 * Hand-rolled XMEML (small, fully understood) → dependency-free under the pinned `tsx`. OTIO is the
 * noted escape hatch, not adopted. Integer-frame time model: no rational-fraction arithmetic.
 *
 * CLI:
 *   tsx export-premiere-xml.ts --in SOURCE --segments SEG.json --project NAME
 *       [--out PATH.xml] [--name "Title"] [--layout both|assembly|annotate]
 *
 * When the JSON has no `source` block the exporter auto-probes --in via the shared ffprobe resolver.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { requireInputFile, run, runCapability, workDir } from '../_env/contract';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type Layout = 'both' | 'assembly' | 'annotate';

/** One Premiere marker color → RGBA. The 8 documented colors; alpha is always 0 in FCP7. */
export type ColorName = 'green' | 'red' | 'orange' | 'yellow' | 'white' | 'blue' | 'cyan' | 'magenta';

export interface Segment {
  startMs: number; // REQUIRED — ms (matches ingest/transcribe Caption.startMs, scene-detect timeSec*1000)
  endMs: number; // REQUIRED
  name: string; // clip name + marker <name>  ("…er dette xyz")
  comment?: string; // → marker <comment> (prefixed with the source timecode "fra 00:12 til 00:34")
  color?: string; // one of the 8 Premiere colors (default green); unknown → green
}

/** The fully-resolved source the XML builder needs (timebase already split into int + ntsc flag). */
export interface XmemlSource {
  fps: number; // ROUNDED integer timebase (24, 25, 30, 50, 60)
  ntsc: boolean; // true for the /1.001 NTSC rates (23.976 / 29.97 / 59.94)
  width: number;
  height: number;
  durationFrames: number;
  hasAudio: boolean;
  filePath: string; // absolute path → <pathurl>
  fileName: string; // display <name>
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (the regression surface — no I/O)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ms → integer frame at an EXACT rational rate (never the rounded decimal — that drifts over a long
 * clip). 12000 ms @ 25 → 300. @ 29.97 (ntsc) uses 30000/1001.
 */
export function msToFrame(ms: number, fps: number, ntsc: boolean): number {
  const fpsExact = ntsc ? (fps * 1000) / 1001 : fps;
  return Math.round((ms / 1000) * fpsExact);
}

/**
 * frame → "HH:MM:SS:FF" (NDF, ':' separator) or "HH:MM:SS;FF" (DF, ';' separator).
 * Drop-frame uses the canonical Duncan algorithm and only applies to the 29.97/59.94 timebases.
 * 300 @ 25 → "00:00:12:00". 17982 @ 30 DF → "00:10:00;00".
 */
export function framesToTimecode(frame: number, timebase: number, ntsc: boolean, drop: boolean): string {
  const tb = Math.round(timebase);
  let f = Math.max(0, Math.round(frame));
  const useDrop = drop && ntsc && (tb === 30 || tb === 60);
  if (useDrop) {
    const dropFrames = tb === 60 ? 4 : 2; // labels skipped per minute, except every 10th minute
    const framesPer10Min = tb * 60 * 10;
    const framesPerMin = tb * 60;
    const d = Math.floor(f / framesPer10Min);
    const m = f % framesPer10Min;
    f += m > dropFrames ? dropFrames * 9 * d + dropFrames * Math.floor((m - dropFrames) / framesPerMin) : dropFrames * 9 * d;
  }
  const ff = f % tb;
  const ss = Math.floor(f / tb) % 60;
  const mm = Math.floor(f / (tb * 60)) % 60;
  const hh = Math.floor(f / (tb * 60 * 60));
  const sep = useDrop ? ';' : ':';
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(hh)}:${p2(mm)}:${p2(ss)}${sep}${p2(ff)}`;
}

/**
 * Absolute Windows/POSIX path → a Premiere-friendly URL-encoded file URL.
 * `C:\a b\v.mp4` → `file://localhost/C:/a%20b/v.mp4`. Drive letter + slashes preserved; spaces → %20.
 */
export function pathToUrl(absPath: string): string {
  const fwd = absPath.replace(/\\/g, '/');
  const encoded = fwd
    .split('/')
    .map((seg) => (/^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
    .join('/');
  // POSIX absolute paths already start with '/', so avoid a doubled slash.
  return encoded.startsWith('/') ? `file://localhost${encoded}` : `file://localhost/${encoded}`;
}

/** 8-color lookup → {r,g,b,a}. Unknown / missing → green (the Premiere default). Alpha always 0. */
export function colorRgba(name: string | undefined): { r: number; g: number; b: number; a: number } {
  const table: Record<ColorName, [number, number, number]> = {
    green: [0, 160, 0],
    red: [255, 38, 38],
    orange: [255, 150, 0],
    yellow: [255, 230, 0],
    white: [255, 255, 255],
    blue: [0, 120, 255],
    cyan: [0, 200, 200],
    magenta: [230, 0, 230],
  };
  const key = (name ?? 'green').toLowerCase() as ColorName;
  const [r, g, b] = table[key] ?? table.green;
  return { r, g, b, a: 0 };
}

/** Escape the 5 XML special chars. UTF-8 (ø/æ/å) needs no escaping. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

interface ResolvedSegment extends Segment {
  inF: number; // source in frame
  outF: number; // source out frame
  len: number; // duration in frames (>=1)
  tlStart: number; // timeline start frame
  tlEnd: number; // timeline end frame
}

/**
 * Build the complete XMEML document string. Pure → unit-testable.
 *
 * layout:
 *  - 'both'     : clips laid end-to-end on V1 (+A1 if audio) AND a range marker per segment at the
 *                 TIMELINE position (comment carries the original source TC). [default]
 *  - 'assembly' : clips only, no markers.
 *  - 'annotate' : one full-length source clip + range markers at the ORIGINAL SOURCE positions.
 */
export function buildXmeml(opts: { source: XmemlSource; segments: Segment[]; name: string; layout?: Layout }): string {
  const { source, segments } = opts;
  const layout: Layout = opts.layout ?? 'both';
  const { fps, ntsc, width, height, durationFrames, hasAudio, filePath, fileName } = source;
  const rate = `<rate><timebase>${fps}</timebase><ntsc>${ntsc ? 'TRUE' : 'FALSE'}</ntsc></rate>`;
  const url = pathToUrl(filePath);
  const drop = ntsc && (fps === 30 || fps === 60); // we still emit NDF timecode start (offset guard); DF only labels comments

  // Resolve every segment to source + timeline frames.
  let cursor = 0;
  const segs: ResolvedSegment[] = segments.map((s) => {
    const inF = msToFrame(s.startMs, fps, ntsc);
    const outF = Math.max(inF + 1, msToFrame(s.endMs, fps, ntsc));
    const len = outF - inF;
    const tlStart = cursor;
    const tlEnd = cursor + len;
    cursor = tlEnd;
    return { ...s, inF, outF, len, tlStart, tlEnd };
  });

  // ── the <file> media block (declared ONCE; referenced by id thereafter) ──────
  const fileFull = (id: string) => `<file id="${id}">
              <name>${esc(fileName)}</name>
              <pathurl>${url}</pathurl>
              ${rate}
              <duration>${durationFrames}</duration>
              <media>
                <video><samplecharacteristics><width>${width}</width><height>${height}</height></samplecharacteristics></video>${hasAudio ? '\n                <audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio>' : ''}
              </media>
            </file>`;
  const fileRef = (id: string) => `<file id="${id}"/>`;

  // ── build clip items for 'both' / 'assembly' (laid clips) or 'annotate' (one full clip) ──────
  const FILE_ID = 'file-1';
  let fileDeclared = false;
  const declareFile = (): string => {
    if (fileDeclared) return fileRef(FILE_ID);
    fileDeclared = true;
    return fileFull(FILE_ID);
  };

  const layItems: ResolvedSegment[] =
    layout === 'annotate'
      ? [{ startMs: 0, endMs: 0, name: fileName, inF: 0, outF: durationFrames, len: durationFrames, tlStart: 0, tlEnd: durationFrames }]
      : segs;

  const videoClips: string[] = [];
  const audioClips: string[] = [];
  layItems.forEach((s, i) => {
    const vId = `clipitem-v-${i + 1}`;
    const aId = `clipitem-a-${i + 1}`;
    const linkV = `<link><linkclipref>${vId}</linkclipref><mediatype>video</mediatype><trackindex>1</trackindex><clipindex>${i + 1}</clipindex></link>`;
    const linkA = `<link><linkclipref>${aId}</linkclipref><mediatype>audio</mediatype><trackindex>1</trackindex><clipindex>${i + 1}</clipindex></link>`;
    const links = hasAudio ? `\n              ${linkV}\n              ${linkA}` : '';
    videoClips.push(`<clipitem id="${vId}">
              <name>${esc(s.name)}</name>
              <enabled>TRUE</enabled>
              <duration>${s.len}</duration>
              ${rate}
              <start>${s.tlStart}</start>
              <end>${s.tlEnd}</end>
              <in>${s.inF}</in>
              <out>${s.outF}</out>
              ${declareFile()}${links}
            </clipitem>`);
    if (hasAudio) {
      audioClips.push(`<clipitem id="${aId}">
              <name>${esc(s.name)}</name>
              <enabled>TRUE</enabled>
              <duration>${s.len}</duration>
              ${rate}
              <start>${s.tlStart}</start>
              <end>${s.tlEnd}</end>
              <in>${s.inF}</in>
              <out>${s.outF}</out>
              <sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>
              ${fileRef(FILE_ID)}
              ${linkV}
              ${linkA}
            </clipitem>`);
    }
  });

  // ── markers ──────────────────────────────────────────────────────────────────
  // 'both'     → range markers at the TIMELINE positions of the laid clips
  // 'annotate' → range markers at the ORIGINAL SOURCE positions
  // 'assembly' → none
  const markers: string[] =
    layout === 'assembly'
      ? []
      : segs.map((s) => {
          const c = colorRgba(s.color);
          const mIn = layout === 'annotate' ? s.inF : s.tlStart;
          const mOut = layout === 'annotate' ? s.outF : s.tlEnd; // non -1 → RANGE marker (carries the span)
          const srcInTc = framesToTimecode(s.inF, fps, ntsc, drop);
          const srcOutTc = framesToTimecode(s.outF, fps, ntsc, drop);
          const comment = s.comment ? `fra ${srcInTc} til ${srcOutTc} — ${s.comment}` : `fra ${srcInTc} til ${srcOutTc}`;
          return `<marker>
          <name>${esc(s.name)}</name>
          <comment>${esc(comment)}</comment>
          <in>${mIn}</in>
          <out>${mOut}</out>
          <red>${c.r}</red>
          <green>${c.g}</green>
          <blue>${c.b}</blue>
          <alpha>${c.a}</alpha>
        </marker>`;
        });

  const seqDuration = layout === 'annotate' ? durationFrames : cursor;
  const audioTrack = hasAudio ? `\n          <audio>\n            <track>\n              ${audioClips.join('\n              ')}\n            </track>\n          </audio>` : '';

  // Sequence timecode pinned to frame 0 / NDF → markers do NOT land 1 hour off (the 01:00:00:00 gotcha).
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="seq-segments">
    <name>${esc(opts.name)}</name>
    <duration>${seqDuration}</duration>
    ${rate}
    <timecode>${rate}<frame>0</frame><displayformat>NDF</displayformat></timecode>
    <media>
      <video>
        <format><samplecharacteristics><width>${width}</width><height>${height}</height></samplecharacteristics></format>
        <track>
          ${videoClips.join('\n          ')}
        </track>
      </video>${audioTrack}
    </media>
    ${markers.join('\n    ')}
  </sequence>
</xmeml>
`;
}

/** CSV sibling (editingtools.io / MarkerBox / spreadsheet view). Source-TC based. Pure → testable. */
export function buildCsv(source: XmemlSource, segments: Segment[]): string {
  const drop = source.ntsc && (source.fps === 30 || source.fps === 60);
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [['Timecode In', 'Timecode Out', 'Name', 'Comment', 'Colour'].map(cell).join(',')];
  for (const s of segments) {
    const inTc = framesToTimecode(msToFrame(s.startMs, source.fps, source.ntsc), source.fps, source.ntsc, drop);
    const outTc = framesToTimecode(msToFrame(s.endMs, source.fps, source.ntsc), source.fps, source.ntsc, drop);
    rows.push([inTc, outTc, s.name ?? '', s.comment ?? '', s.color ?? 'green'].map(cell).join(','));
  }
  return rows.join('\r\n') + '\r\n';
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate resolution + probing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A possibly-fractional fps → the rounded integer timebase + the ntsc flag.
 * Epsilon must be < 0.03 so exact 30.0 is NOT misread as 29.97 (they differ by only 0.03).
 */
export function resolveRate(fpsValue: number): { fps: number; ntsc: boolean } {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  if (near(fpsValue, 23.976) || near(fpsValue, 24000 / 1001)) return { fps: 24, ntsc: true };
  if (near(fpsValue, 29.97) || near(fpsValue, 30000 / 1001)) return { fps: 30, ntsc: true };
  if (near(fpsValue, 59.94) || near(fpsValue, 60000 / 1001)) return { fps: 60, ntsc: true };
  return { fps: Math.round(fpsValue), ntsc: false };
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
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'segments'
  );
}

interface SegmentsFile {
  source?: Partial<XmemlSource> & { fps?: number; ntsc?: boolean };
  segments: Segment[];
}

async function main(): Promise<void> {
  await runCapability('deliver/export-premiere-xml', async () => {
    const inPath = requireInputFile(arg('in'), 'source video');
    const segPath = requireInputFile(arg('segments'), 'segments json');
    const project = arg('project') ?? '_scratch';
    const title = arg('name') ?? 'Reels — bedste sekvenser';
    const layout = (arg('layout') ?? 'both') as Layout;
    if (!['both', 'assembly', 'annotate'].includes(layout)) throw new Error(`--layout must be both|assembly|annotate, got "${layout}"`);

    const parsed = JSON.parse(fs.readFileSync(segPath, 'utf8')) as SegmentsFile;
    if (!Array.isArray(parsed.segments) || parsed.segments.length === 0) throw new Error('segments json has no "segments" array');
    for (const s of parsed.segments) {
      if (typeof s.startMs !== 'number' || typeof s.endMs !== 'number') throw new Error('each segment needs numeric startMs + endMs');
      if (s.endMs <= s.startMs) throw new Error(`segment "${s.name ?? '?'}" has endMs <= startMs`);
    }

    // Resolve the source: from the JSON block, else auto-probe --in (the scene-detect.ts import pattern).
    let source: XmemlSource;
    const sj = parsed.source;
    if (sj && sj.fps && sj.width && sj.height && sj.durationFrames) {
      const { fps, ntsc } = sj.ntsc !== undefined ? { fps: Math.round(sj.fps), ntsc: sj.ntsc } : resolveRate(sj.fps);
      source = { fps, ntsc, width: sj.width, height: sj.height, durationFrames: sj.durationFrames, hasAudio: sj.hasAudio ?? false, filePath: path.resolve(inPath), fileName: path.basename(inPath) };
    } else {
      const { resolveFfmpeg } = await import('../_env/ffmpeg');
      const { ffprobe } = resolveFfmpeg();
      const r = run(ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', inPath]);
      if (r.status !== 0) throw new Error(`ffprobe failed (exit ${r.status}):\n${r.stderr.slice(-600)}`);
      const data = JSON.parse(r.stdout) as { streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string }[]; format: { duration: string } };
      const video = data.streams.find((s) => s.codec_type === 'video');
      const audio = data.streams.find((s) => s.codec_type === 'audio');
      if (!video) throw new Error('source has no video stream');
      const { fps, ntsc } = resolveRate(evalFps(video.r_frame_rate) ?? 30);
      const durationFrames = msToFrame(parseFloat(data.format.duration) * 1000, fps, ntsc);
      source = { fps, ntsc, width: video.width ?? 1920, height: video.height ?? 1080, durationFrames, hasAudio: !!audio, filePath: path.resolve(inPath), fileName: path.basename(inPath) };
    }

    const xml = buildXmeml({ source, segments: parsed.segments, name: title, layout });
    const csv = buildCsv(source, parsed.segments);

    const slug = slugify(title);
    const dir = workDir(project, 'deliver');
    const xmlPath = arg('out') ? path.resolve(arg('out') as string) : path.join(dir, `${slug}.premiere.xml`);
    const csvPath = xmlPath.replace(/\.xml$/i, '') + '.csv';
    fs.mkdirSync(path.dirname(xmlPath), { recursive: true });
    fs.writeFileSync(xmlPath, xml, 'utf8');
    fs.writeFileSync(csvPath, csv, 'utf8');

    console.error(`export-premiere-xml: ${parsed.segments.length} segment(s) · ${source.fps}fps${source.ntsc ? ' NTSC' : ''} · layout=${layout}\n  ${xmlPath}\n  ${csvPath}`);

    return {
      outputs: [xmlPath, csvPath],
      metrics: { segments: parsed.segments.length, fps: source.fps, ntsc: source.ntsc, layout, hasAudio: source.hasAudio },
      project,
      args: process.argv.slice(2),
    };
  });
}

// Symlink-safe main-guard: macOS tmp/cwd paths can reach the same file via /var → /private/var,
// so a plain path.resolve comparison misses (live-found on Apple-silicon CI at GATE V3).
const realpathSafe = (p: string): string => { try { return fs.realpathSync(path.resolve(p)); } catch { return path.resolve(p); } };
if (process.argv[1] && realpathSafe(process.argv[1]) === realpathSafe(__filename)) void main();
