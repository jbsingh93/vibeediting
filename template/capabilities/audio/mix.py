#!/usr/bin/env python
"""capabilities/audio/mix.py — multi-stem mixer + sidechain ducking (plan P1A.6, GAP-26).

Mixes VO + music + SFX into one bed: music is DUCKED under the VO via ffmpeg `sidechaincompress`
(ratio ~4:1, attack 10ms, release 200ms, ~10 dB depth), music delayed in 0.3-0.5s, fades applied,
then mastered to -14 LUFS / -1 dBTP by reusing loudness.py's two-pass loudnorm (GAP-14 true-peak ceiling).

Without a mixer, generating BGM/SFX (P1E.2) is a dead end — this is the glue.

CLI:
  python mix.py --vo VO.wav [--music M.wav] [--sfx S.wav@2.5 ...] --out OUT.wav
      [--duck-db 10] [--duck-ratio 4] [--music-gain -6] [--music-delay 0.4]
      [--fade 0.5] [--target -14] [--tp -1] [--project NAME]
SFX accept an optional `@SECONDS` placement offset (e.g. whoosh.wav@2.5).
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE.parent / "_env"))
sys.path.insert(0, str(_HERE))
import contract  # noqa: E402
import loudness  # noqa: E402 — reuse the tested true-peak finalize


def _parse_sfx(spec: str) -> tuple[str, float]:
    path, _, off = spec.rpartition("@")
    if path and off:
        return path, float(off)
    return spec, 0.0


def build_mix(a: argparse.Namespace, premaster: str) -> None:
    ff = contract.resolve_ffmpeg()
    inputs = ["-i", a.vo]
    if a.music:
        inputs += ["-i", a.music]
    sfx = [_parse_sfx(s) for s in (a.sfx or [])]
    for path, _ in sfx:
        inputs += ["-i", path]

    parts: list[str] = []
    mix_labels: list[str] = []
    idx = 0  # input index

    # VO: split into a sidechain key + the mixed copy
    parts.append(f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[vokey][vomix]")
    mix_labels.append("[vomix]")
    idx += 1

    # Music: gain + delay, then duck against the VO key
    if a.music:
        delay_ms = int(a.music_delay * 1000)
        parts.append(
            f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,"
            f"volume={a.music_gain}dB,adelay={delay_ms}|{delay_ms}[musraw]"
        )
        # sidechaincompress ducks 'musraw' whenever 'vokey' is loud
        parts.append(
            f"[musraw][vokey]sidechaincompress=threshold=0.03:ratio={a.duck_ratio}:"
            f"attack=10:release=200:makeup=1[musduck]"
        )
        mix_labels.append("[musduck]")
        idx += 1

    # SFX: delay each to its placement offset
    for _, off in sfx:
        delay_ms = int(off * 1000)
        parts.append(f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={delay_ms}|{delay_ms}[sfx{idx}]")
        mix_labels.append(f"[sfx{idx}]")
        idx += 1

    n = len(mix_labels)
    parts.append(f"{''.join(mix_labels)}amix=inputs={n}:duration=longest:normalize=0[mixed]")

    filtergraph = ";".join(parts)
    Path(premaster).parent.mkdir(parents=True, exist_ok=True)
    cmd = [ff, "-y", *inputs, "-filter_complex", filtergraph, "-map", "[mixed]", premaster]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"mix failed:\n{r.stderr[-2000:]}")


def apply_fades(src: str, dst: str, fade: float) -> None:
    ff = contract.resolve_ffmpeg()
    dur = contract.ffprobe_duration(src)
    out_st = max(0.0, dur - fade)
    af = f"afade=t=in:st=0:d={fade},afade=t=out:st={out_st}:d={fade}"
    r = subprocess.run([ff, "-y", "-i", src, "-af", af, dst], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"fade failed:\n{r.stderr[-2000:]}")


def run(a: argparse.Namespace) -> dict:
    if not Path(a.vo).is_file():
        raise FileNotFoundError(f"VO not found: {a.vo}")
    work = contract.work_dir(a.project or "_scratch", "audio-mix")
    premaster = str(work / "premaster.wav")
    faded = str(work / "faded.wav")

    build_mix(a, premaster)
    apply_fades(premaster, faded, a.fade)

    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    meas = loudness.loudnorm_measure(faded, a.target, a.tp, 11.0)
    loudness.normalize(faded, a.out, a.target, a.tp, 11.0, meas)
    after = loudness.loudnorm_measure(a.out, a.target, a.tp, 11.0)

    return {
        "outputs": [str(Path(a.out).resolve())],
        "metrics": {
            "stems": {"vo": a.vo, "music": a.music, "sfx": a.sfx or []},
            "duck_ratio": a.duck_ratio,
            "lufs_after": float(after["input_i"]),
            "tp_after": float(after["input_tp"]),
            "within_tolerance": abs(float(after["input_i"]) - a.target) <= 1.0,
        },
        "project": a.project,
        "args": sys.argv[1:],
    }


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Mix VO/music/SFX with sidechain ducking -> -14 LUFS.")
    p.add_argument("--vo", required=True)
    p.add_argument("--music", default=None)
    p.add_argument("--sfx", action="append", default=None, help="path or path@seconds")
    p.add_argument("--out", required=True)
    p.add_argument("--duck-db", dest="duck_db", type=float, default=10.0)
    p.add_argument("--duck-ratio", dest="duck_ratio", type=float, default=4.0)
    p.add_argument("--music-gain", dest="music_gain", type=float, default=-6.0)
    p.add_argument("--music-delay", dest="music_delay", type=float, default=0.4)
    p.add_argument("--fade", type=float, default=0.5)
    p.add_argument("--target", type=float, default=-14.0)
    p.add_argument("--tp", type=float, default=-1.0)
    p.add_argument("--project", default=None)
    return p.parse_args()


if __name__ == "__main__":
    contract.run_capability("audio/mix", lambda: run(parse_args()))
