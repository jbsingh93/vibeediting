/**
 * editor/RenderPreview.tsx — the fine-tune editor's RENDER preview: a rendered VERSION of the
 * project (out/work · out · deliver mp4, served by the cockpit) as the editing background, with
 * the live caption chips optionally overlaid on top.
 *
 * Why it exists (Julian, 2026-06-07): the data preview can only reconstruct what the editable
 * sidecars describe — EDL segments mount their SOURCE footage, but motion-graphics/props comps
 * have no reconstructable video, so the editor showed agent artifacts over a placeholder instead
 * of the actual video. Fine-tune is meant to be an editor over the RENDERED VERSIONS: pick v1/v2/
 * a deliverable, scrub the real frames, and drag chips against them.
 *
 * The overlay shows the LIVE (edited) caption timing — the render underneath carries the OLD
 * baked-in captions, so the overlay is toggleable to avoid double-text while reviewing visuals.
 * Audio tracks are NOT mounted here: the render already contains the mixed master.
 */
import React from 'react';
import { AbsoluteFill, Video } from 'remotion';
import { BrandContext } from '../../../template/src/components/BrandContext';
import { KineticCaptions } from '../../../template/src/components/KineticCaptions';
import type { CaptionWord } from '../lib/finetune';

export interface RenderPreviewProps extends Record<string, unknown> {
  /** root-relative URL of the rendered mp4 (RenderInfo.url — served by the cockpit). */
  src: string;
  /** output-time words to overlay (empty = overlay off). */
  captions: CaptionWord[];
  emphasisWords: string[];
  captionFontSize: number;
  captionPaddingBottom: number;
}

export const RenderPreview: React.FC<RenderPreviewProps> = ({
  src,
  captions,
  emphasisWords,
  captionFontSize,
  captionPaddingBottom,
}) => (
  <BrandContext>
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Video src={src} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      {captions.length > 0 && (
        <KineticCaptions
          captions={captions.map((c) => ({ ...c, timestampMs: c.timestampMs ?? null, confidence: c.confidence ?? null }))}
          emphasisWords={emphasisWords}
          fontSize={captionFontSize}
          justify="flex-end"
          paddingBottom={captionPaddingBottom}
        />
      )}
    </AbsoluteFill>
  </BrandContext>
);
