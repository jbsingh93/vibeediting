/**
 * src/EdlTimeline.tsx — the CANONICAL headless render comp for the light-NLE cut (`segments.json`).
 *
 * It is the render-side twin of the cockpit's `FineTunePreview`: same placement
 * (`placeEdl`), same typed transitions (`transitionPresentation`), same caption projection
 * (`remapEdlCaptions` + `KineticCaptions`) and same audio mix (`trackVolumeAt`) — so what the user
 * fine-tunes in the cockpit is what the headless Chromium render produces (`preview == render`). The
 * cut math lives in `./components/edl` (the contract owner the cockpit mirrors).
 *
 * `calculateMetadata` loads the project's `public/<project>/{segments,audio-mix,captions*}.json` at
 * render time and derives fps + total frames from the cut. Pass `{ project }` (+ optional width/height).
 */
import React from 'react';
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from 'remotion';
import { BrandContext } from './components/BrandContext';
import { KineticCaptions } from './components/KineticCaptions';
import {
  placeEdl,
  edlTotalFrames,
  remapEdlCaptions,
  transitionFrames,
  transitionPresentation,
  effectsPresentation,
  trackVolumeAt,
  footageGain,
  voWindows,
  parseSegments,
  type AudioTrack,
  type CaptionWord,
  type PlacedEdlSegment,
  type SegmentsDoc,
} from './components/edl';

const AUDIO_FADE_IN = 2;
const AUDIO_FADE_OUT = 3;

export interface EdlTimelineProps extends Record<string, unknown> {
  project: string;
  width?: number;
  height?: number;
  emphasisWords?: string[];
  captionFontSize?: number;
  captionPaddingBottom?: number;
  /** resolved by calculateMetadata (do not pass by hand). */
  _resolved?: {
    segments: SegmentsDoc;
    captions: Record<string, CaptionWord[]>;
    audioTracks: AudioTrack[];
    srcExists: Record<string, boolean>;
    audioSrcExists: Record<string, boolean>;
  };
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

export const calculateEdlMetadata: CalculateMetadataFunction<EdlTimelineProps> = async ({ props }) => {
  const base = `${props.project}`;
  const segData = await fetchJson(staticFile(`${base}/segments.json`));
  const segments = parseSegments(segData ?? { fps: 30, crossfadeFrames: 8, segments: [{ id: 's1', srcStart: 0, srcEnd: 1 }] });
  const fps = segments.fps;

  // captions: one file per cap key ('' → captions.json, 'x' → captions-x.json)
  const captions: Record<string, CaptionWord[]> = {};
  for (const key of Array.from(new Set(segments.segments.map((s) => s.cap ?? '')))) {
    const file = key ? `captions-${key}.json` : 'captions.json';
    const data = await fetchJson(staticFile(`${base}/${file}`));
    if (Array.isArray(data)) captions[key] = data as CaptionWord[];
  }

  const mix = (await fetchJson(staticFile(`${base}/audio-mix.json`))) as { tracks?: AudioTrack[] } | null;
  const audioTracks = mix?.tracks ?? [];

  const durationInFrames = Math.max(1, edlTotalFrames(segments.segments, fps, segments.crossfadeFrames));
  return {
    durationInFrames,
    fps,
    width: props.width ?? 1920,
    height: props.height ?? 1080,
    props: {
      ...props,
      _resolved: { segments, captions, audioTracks, srcExists: {}, audioSrcExists: {} },
    },
  };
};

const SegmentClip: React.FC<{ seg: PlacedEdlSegment; src: string; crossfadeFrames: number; isLast: boolean }> = ({
  seg,
  src,
  crossfadeFrames,
  isLast,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const overlap = seg.index === 0 ? 0 : transitionFrames(seg, crossfadeFrames);
  const kind = seg.index === 0 ? 'cut' : seg.transition?.kind ?? 'dissolve';
  const progress = overlap > 0 ? frame / overlap : 1;
  const pres = transitionPresentation(kind, seg.transition?.direction, seg.index === 0 ? 1 : progress);
  // VE.5: the per-clip effects stack — mirrored from FineTunePreview so `preview == render` holds.
  const fx = effectsPresentation(seg.effects);
  return (
    <AbsoluteFill>
      {pres.backdrop > 0 && <AbsoluteFill style={{ backgroundColor: '#000', opacity: pres.backdrop }} />}
      <AbsoluteFill style={{ opacity: pres.clip.opacity ?? 1, transform: pres.clip.transform, clipPath: pres.clip.clipPath }}>
        <AbsoluteFill style={{ opacity: fx.style.opacity, transform: fx.style.transform, filter: fx.style.filter }}>
          <OffthreadVideo
            src={staticFile(src)}
            trimBefore={Math.round(seg.srcStart * fps)}
            playbackRate={fx.playbackRate}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            volume={(f) => {
            const fadeIn =
              seg.index === 0
                ? 1
                : interpolate(f, [0, AUDIO_FADE_IN], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const fadeOut = isLast
              ? interpolate(f, [seg.durationInFrames - 14, seg.durationInFrames - 2], [1, 0], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : interpolate(f, [seg.durationInFrames - AUDIO_FADE_OUT, seg.durationInFrames], [1, 0], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                });
            // D34: the clip's own footage-audio level (gain/mute) rides over the fade envelope.
            return fadeIn * fadeOut * footageGain(seg);
          }}
          />
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const EdlTimeline: React.FC<EdlTimelineProps> = (props) => {
  const { fps } = useVideoConfig();
  const resolved = props._resolved;
  if (!resolved) return <AbsoluteFill style={{ backgroundColor: '#000' }} />;
  const { segments, captions, audioTracks } = resolved;
  const placed = placeEdl(segments.segments, segments.fps, segments.crossfadeFrames);
  const remapped = remapEdlCaptions(placed, segments.fps, captions);
  const voWins = voWindows(remapped);

  return (
    <BrandContext>
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        {placed.map((seg) => {
          const src = seg.src ?? segments.src ?? null;
          return (
            <Sequence key={`${seg.id}-${seg.index}`} from={seg.from} durationInFrames={Math.max(1, seg.durationInFrames)} name={`seg:${seg.id}`}>
              {src ? (
                <SegmentClip seg={seg} src={src} crossfadeFrames={segments.crossfadeFrames} isLast={seg.index === placed.length - 1} />
              ) : (
                <AbsoluteFill style={{ backgroundColor: '#0E0E11' }} />
              )}
            </Sequence>
          );
        })}

        {audioTracks.map((t) => (
          <Sequence
            key={t.id}
            from={Math.round(t.offsetSec * fps)}
            durationInFrames={t.durationSec != null ? Math.max(1, Math.round(t.durationSec * fps)) : undefined}
            name={`audio:${t.id}`}
          >
            <Audio
              src={staticFile(t.src)}
              trimBefore={Math.round((t.srcInSec ?? 0) * fps)}
              volume={(f) => trackVolumeAt(t, voWins, (f + t.offsetSec * fps) / fps)}
            />
          </Sequence>
        ))}

        <KineticCaptions
          captions={remapped.map((c) => ({ ...c, timestampMs: c.timestampMs ?? null, confidence: c.confidence ?? null }))}
          emphasisWords={props.emphasisWords ?? segments.emphasisWords ?? []}
          fontSize={props.captionFontSize ?? 64}
          justify="flex-end"
          paddingBottom={props.captionPaddingBottom ?? 160}
        />
      </AbsoluteFill>
    </BrandContext>
  );
};
