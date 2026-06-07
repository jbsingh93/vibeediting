/**
 * editor/FineTunePreview.tsx — UIP4: the in-house preview composition the fine-tune editor
 * renders inside `@remotion/player`. The shipped comps bake their JSON at bundle time, so live
 * editing flows through THESE inputProps instead — every chip drag re-renders this comp with the
 * edited in-memory state, and Save persists the same data to the files the real comps import.
 *
 * Faithful to the EDL comps: per-segment <OffthreadVideo trimBefore> with the 8-frame video
 * dissolve + 2/3-frame audio fades (cut-doctor-proven), the REAL `KineticCaptions` +
 * `BrandContext` from the project's src/components, and <Audio> tracks with the duck-vs-voice
 * volume math from lib/finetune. Media mounts ONLY when the server confirmed the file exists on
 * disk — a missing gitignored mp4 renders a calm placeholder, never a browser decode error.
 */
import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { BrandContext } from '../../../template/src/components/BrandContext';
import { KineticCaptions } from '../../../template/src/components/KineticCaptions';
import type { AudioTrack, CaptionWord, PlacedEdlSegment } from '../lib/finetune';
import { trackVolumeAt } from '../lib/finetune';

export interface FineTunePreviewProps extends Record<string, unknown> {
  /** placed EDL segments (empty = single/captions-only mode). */
  placed: PlacedEdlSegment[];
  crossfadeFrames: number;
  /** top-level source for EDLs whose segments carry no per-segment src. */
  defaultSrc: string | null;
  /** which public/-rooted sources exist on disk (Player mount safety). */
  srcExists: Record<string, boolean>;
  /** output-time words (already remapped for EDLs). */
  captions: CaptionWord[];
  emphasisWords: string[];
  captionFontSize: number;
  captionPaddingBottom: number;
  audioTracks: AudioTrack[];
  audioSrcExists: Record<string, boolean>;
  /** spoken-word windows (sec) the BGM ducks under. */
  voWins: [number, number][];
}

const AUDIO_FADE_IN = 2;
const AUDIO_FADE_OUT = 3;

const SegmentClip: React.FC<{ seg: PlacedEdlSegment; src: string; crossfade: number; isLast: boolean }> = ({
  seg,
  src,
  crossfade,
  isLast,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity =
    seg.index === 0
      ? 1
      : interpolate(frame, [0, crossfade], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity }}>
      <OffthreadVideo
        src={staticFile(src)}
        trimBefore={Math.round(seg.srcStart * fps)}
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
          return fadeIn * fadeOut;
        }}
      />
    </AbsoluteFill>
  );
};

const MediaOffline: React.FC<{ label: string }> = ({ label }) => (
  <AbsoluteFill
    style={{
      background: 'linear-gradient(180deg, #131318 0%, #0E0E11 100%)',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <div
      style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 26,
        color: '#555560',
        textAlign: 'center',
        padding: '0 60px',
        lineHeight: 1.6,
      }}
    >
      ▣ media not on disk
      <br />
      {label}
    </div>
  </AbsoluteFill>
);

export const FineTunePreview: React.FC<FineTunePreviewProps> = (props) => {
  const { fps } = useVideoConfig();
  const {
    placed,
    crossfadeFrames,
    defaultSrc,
    srcExists,
    captions,
    emphasisWords,
    captionFontSize,
    captionPaddingBottom,
    audioTracks,
    audioSrcExists,
    voWins,
  } = props;

  return (
    <BrandContext>
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        {placed.map((seg) => {
          const src = seg.src ?? defaultSrc;
          const ok = src !== null && srcExists[src] === true;
          return (
            <Sequence key={`${seg.id}-${seg.index}`} from={seg.from} durationInFrames={Math.max(1, seg.durationInFrames)} name={`seg:${seg.id}`}>
              {ok && src ? (
                <SegmentClip seg={seg} src={src} crossfade={crossfadeFrames} isLast={seg.index === placed.length - 1} />
              ) : (
                <MediaOffline label={src ?? 'no source'} />
              )}
            </Sequence>
          );
        })}
        {placed.length === 0 && <MediaOffline label={defaultSrc ?? 'captions only'} />}

        {audioTracks.map((t) =>
          audioSrcExists[t.src] === true ? (
            <Sequence key={t.id} from={Math.round(t.offsetSec * fps)} name={`audio:${t.id}`}>
              <Audio src={staticFile(t.src)} volume={(f) => trackVolumeAt(t, voWins, (f + t.offsetSec * fps) / fps)} />
            </Sequence>
          ) : null,
        )}

        <KineticCaptions
          captions={captions.map((c) => ({ ...c, timestampMs: c.timestampMs ?? null, confidence: c.confidence ?? null }))}
          emphasisWords={emphasisWords}
          fontSize={captionFontSize}
          justify="flex-end"
          paddingBottom={captionPaddingBottom}
        />
      </AbsoluteFill>
    </BrandContext>
  );
};
