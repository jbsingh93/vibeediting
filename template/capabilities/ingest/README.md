# `ingest/` — get media + truth into the pipeline

Turns raw source into probed metadata, word-level transcripts, scene/beat/VAD cut lists.
**Status: BUILT (P1C, 2026-05-27)** — tested in `_tests/p1c-ingest.test.ts` (+ `p1c-beat.test.ts`, render tier).

| File | Purpose | Backs |
|---|---|---|
| `probe.ts` ✅ | ffprobe → typed metadata + `durationInFrames` (duration, fps, dims, pix_fmt, audio), via the unified resolver. | AG §1.3 |
| `transcribe.ts` ✅ | **OpenAI `whisper-1`** word-level transcription → `Caption[]` JSON + `.srt`, language auto-detect (or `--lang` hint); model id from `models.json`. **OpenAI whisper-1 is the ONLY STT — no local/faster-whisper, no fallback.** | P1C.1 |
| `scene-detect.ts` ✅ | ffmpeg `select='gt(scene,N)',showinfo` → `{timeSec, frame}` cut list, feeds `cut-doctor`. | P1C.3 |
| `vad-cut.py` ✅ | **ffmpeg `silencedetect`** silence-trim (torch-free; Silero VAD is the on-demand upgrade, GAP-19) + Danish/English filler removal + last-take dedup (repeated-ngram), from Whisper word timing → keep-segment EDL. | GAP-27 |
| `beat-detect.py` ✅ | librosa tempo + beat/downbeat **frame** lists (at `--fps`) for beat-matched cuts. | GAP-28 |

**I/O contract:** input = a media path; output = JSON sidecars in `out/work/<project>/ingest/`
(captions, scenes, beats) using the existing `Caption[]` schema. *(AN §1.3; plan §1C.)*
