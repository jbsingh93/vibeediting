# `audio/` — real mastering, loudness, mix/duck

Replaces the crude `volume=+NdB + alimiter` path with a studio chain. Runs from `capabilities/.venv`.
**Status: BUILT (P1A, 2026-05-27)** — tested in `_tests/p1a-audio.test.ts`.

| File | Purpose | Backs |
|---|---|---|
| `master.py` ✅ | Pedalboard streaming chain: HPF(80) → NoiseGate → de-mud LowShelf → Compressor → presence PeakFilter → de-ess(HighShelf~7k) → subtle Reverb → makeup Gain → safety Limiter. Profiles `--profile=course-mic-lift\|studio\|voice\|music-bed`; whitelisted `--vst`. | P1A.1/.4/.5 |
| `loudness.py` ✅ | Measure LUFS (`pyloudnorm`) + the **ffmpeg two-pass true-peak finalize** (GAP-14); emit `{lufs_before, lufs_after, gain_db, within_tolerance}`. | P1A.2 |
| `run-mastering.ts` ✅ | Subprocess-isolation wrapper (VST-crash safety): master.py → loudness.py, one envelope. | P1A.3 |
| `mix.py` ✅ | Multi-stem mixer (VO/music/SFX, `path@seconds` placement) + ffmpeg `sidechaincompress` **duck** (~4:1, 10ms/200ms) → -14 LUFS. | GAP-26 |
| `separate.py` (opt, on-demand) | Demucs stem isolation for footage with baked-in music. | GAP-32 |

**Critical (GAP-14):** Pedalboard's `Limiter` is NOT a true-peak limiter (two compressors + hard
clip). Do the **final −14 LUFS / −1 dBTP ceiling with ffmpeg `loudnorm`** and re-measure.
**License:** Pedalboard is GPLv3 — internal use OK (see top-level README). *(AG §3/§6.2; CP §3.3; GM §3.)*
