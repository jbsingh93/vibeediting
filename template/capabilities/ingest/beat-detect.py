#!/usr/bin/env python
"""capabilities/ingest/beat-detect.py — musical beat/downbeat detection (plan P1C.5, GAP-28).

The engine behind beat-matched cuts (the `paid-ad-hormozi` style's defining move). librosa estimates
tempo + beat times; we map them to FRAME indices (at --fps) so a composition can snap `<Sequence from>`
to a beat. Downbeats are estimated as every --beats-per-bar-th beat (no separate downbeat model).

CLI:
  python beat-detect.py --in AUDIO_OR_VIDEO [--fps 60] [--beats-per-bar 4] [--project NAME]
Returns metrics: { bpm, beat_times[], beat_frames[], downbeat_frames[] }.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "_env"))
import contract  # noqa: E402

import librosa  # noqa: E402
import numpy as np  # noqa: E402

AUDIO_EXT = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus"}


def extract_audio(media: str, work: Path) -> str:
    """If given a video, pull a mono wav with the full ffmpeg first."""
    if Path(media).suffix.lower() in AUDIO_EXT:
        return media
    ff = contract.resolve_ffmpeg()
    wav = str(work / "beat-audio.wav")
    r = subprocess.run([ff, "-y", "-i", media, "-vn", "-ac", "1", "-ar", "22050", wav],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"audio extract failed:\n{r.stderr[-1200:]}")
    return wav


def run(a: argparse.Namespace) -> dict:
    if not Path(a.inp).is_file():
        raise FileNotFoundError(f"input not found: {a.inp}")
    work = contract.work_dir(a.project or "_scratch", "beat-detect")
    audio_path = extract_audio(a.inp, work)

    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    tempo, beat_frames_lib = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames_lib, sr=sr)
    bpm = float(np.atleast_1d(tempo)[0])

    beat_frames = [int(round(t * a.fps)) for t in beat_times]
    downbeat_frames = beat_frames[:: max(1, a.beats_per_bar)]

    return {
        "outputs": [],
        "metrics": {
            "bpm": round(bpm, 2),
            "fps": a.fps,
            "beats": len(beat_frames),
            "beat_times": [round(float(t), 3) for t in beat_times],
            "beat_frames": beat_frames,
            "downbeat_frames": downbeat_frames,
        },
        "project": a.project,
        "args": sys.argv[1:],
    }


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="librosa beat/tempo detection -> frame lists.")
    p.add_argument("--in", dest="inp", required=True)
    p.add_argument("--fps", type=float, default=60.0)
    p.add_argument("--beats-per-bar", dest="beats_per_bar", type=int, default=4)
    p.add_argument("--project", default=None)
    return p.parse_args()


if __name__ == "__main__":
    contract.run_capability("ingest/beat-detect", lambda: run(parse_args()))
