#!/usr/bin/env python
"""capabilities/audio/master.py — real mastering chain via Pedalboard (plan P1A.1/P1A.4/P1A.5).

The CREATIVE chain (gate -> HPF -> de-mud -> compress -> presence -> de-ess -> reverb -> makeup -> safety limiter),
streamed in chunks for O(1) memory. This replaces the crude `volume=+NdB + alimiter` path with real dynamics.

IMPORTANT (GAP-14): Pedalboard's Limiter is NOT a true-peak limiter (it is "two compressors + hard clip at 0 dB").
So the final -1 dBTP / -14 LUFS CEILING is NOT trusted to this script — it is done by `loudness.py` (ffmpeg
two-pass `loudnorm`). The Limiter here is only a soft safety against gross overs before that finalize.

Profiles (P1A.5) give sane presets that match-or-beat the old +10dB/+4dB course paths but with real dynamics.

CLI:
  python master.py --in IN.wav --out OUT.wav [--profile course-mic-lift|studio|voice|music-bed]
      [--hpf 80] [--gate-threshold -45] [--comp-threshold -18] [--comp-ratio 3]
      [--demud-gain -3] [--presence-gain 3] [--presence-hz 3200] [--deess-gain -3]
      [--reverb 0.0] [--makeup 0] [--safety-ceiling -1]
      [--vst "C:\\Program Files\\Common Files\\VST3\\X.vst3"] [--vst-param name=value ...]
      [--project NAME]
Emits the capability result envelope (contract.py) on stdout.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "_env"))
import contract  # noqa: E402

from pedalboard import (  # noqa: E402
    Compressor,
    Gain,
    HighShelfFilter,
    HighpassFilter,
    Limiter,
    LowShelfFilter,
    NoiseGate,
    PeakFilter,
    Pedalboard,
    Reverb,
    load_plugin,
)
from pedalboard.io import AudioFile  # noqa: E402

# Voice-tuned defaults; --profile overrides, explicit flags override the profile.
PROFILES = {
    # poor course mic: aggressive cleanup + makeup (replaces the +10 dB crude lift)
    "course-mic-lift": dict(hpf=85, gate_threshold=-42, demud_gain=-3.5, comp_threshold=-20,
                            comp_ratio=3.5, presence_gain=3.5, presence_hz=3200, deess_gain=-3.5,
                            reverb=0.0, makeup=4.0),
    # 2-person studio talk: gentler, transparent (replaces a blunt fixed-gain lift)
    "studio": dict(hpf=70, gate_threshold=-50, demud_gain=-2.0, comp_threshold=-18,
                   comp_ratio=2.5, presence_gain=2.0, presence_hz=3000, deess_gain=-2.5,
                   reverb=0.0, makeup=2.0),
    # generic VO (e.g. ElevenLabs render that needs glue)
    "voice": dict(hpf=80, gate_threshold=-48, demud_gain=-2.5, comp_threshold=-18,
                  comp_ratio=3.0, presence_gain=2.5, presence_hz=3200, deess_gain=-3.0,
                  reverb=0.0, makeup=1.5),
    # music bed: minimal — just glue + de-mud, no gate/de-ess
    "music-bed": dict(hpf=30, gate_threshold=-90, demud_gain=-1.0, comp_threshold=-16,
                      comp_ratio=2.0, presence_gain=0.0, presence_hz=3000, deess_gain=0.0,
                      reverb=0.0, makeup=0.0),
}


def build_board(a: argparse.Namespace) -> Pedalboard:
    plugins = []
    plugins.append(HighpassFilter(cutoff_frequency_hz=a.hpf))
    if a.gate_threshold > -89:
        plugins.append(NoiseGate(threshold_db=a.gate_threshold, ratio=2.0, attack_ms=1.0, release_ms=120.0))
    if a.demud_gain != 0.0:
        plugins.append(LowShelfFilter(cutoff_frequency_hz=200, gain_db=a.demud_gain, q=0.7))
    plugins.append(Compressor(threshold_db=a.comp_threshold, ratio=a.comp_ratio, attack_ms=8.0, release_ms=160.0))
    if a.presence_gain != 0.0:
        plugins.append(PeakFilter(cutoff_frequency_hz=a.presence_hz, gain_db=a.presence_gain, q=0.8))
    # De-ess: a gentle static high-shelf cut around 7 kHz (a true dynamic de-esser needs a band sidechain;
    # this is the documented Pedalboard-built-in approximation, sufficient for spoken VO).
    if a.deess_gain != 0.0:
        plugins.append(HighShelfFilter(cutoff_frequency_hz=7000, gain_db=a.deess_gain, q=0.7))
    if a.reverb > 0.0:
        plugins.append(Reverb(room_size=0.15, wet_level=a.reverb, dry_level=1.0, width=0.8))
    if a.makeup != 0.0:
        plugins.append(Gain(gain_db=a.makeup))
    # optional whitelisted VST3 (param names introspected, never hardcoded — GAP minor / P1A.4)
    if a.vst:
        vst = load_plugin(a.vst)
        valid = set(getattr(vst, "parameters", {}).keys())
        for kv in a.vst_param or []:
            name, _, value = kv.partition("=")
            if name not in valid:
                raise ValueError(f"VST param '{name}' not in {sorted(valid)}")
            setattr(vst, name, _coerce(value))
        plugins.append(vst)
    # soft safety only — NOT the true-peak ceiling (that is loudness.py)
    plugins.append(Limiter(threshold_db=a.safety_ceiling, release_ms=100.0))
    return Pedalboard(plugins)


def _coerce(v: str):
    try:
        return float(v)
    except ValueError:
        return {"true": True, "false": False}.get(v.lower(), v)


def master(a: argparse.Namespace) -> dict:
    in_path = contract.Path(a.inp)
    if not in_path.is_file():
        raise FileNotFoundError(f"input not found: {a.inp}")
    out_path = contract.Path(a.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    board = build_board(a)
    chunk = 0  # frames processed (for sanity)
    with AudioFile(str(in_path)) as f:
        sr = f.samplerate
        with AudioFile(str(out_path), "w", sr, f.num_channels) as o:
            block = int(sr * 0.5)  # 0.5 s blocks
            while f.tell() < f.frames:
                audio = f.read(block)
                processed = board.process(audio, sr, reset=False)
                o.write(processed)
                chunk += audio.shape[-1]

    return {
        "outputs": [str(out_path.resolve())],
        "metrics": {
            "profile": a.profile,
            "samplerate": sr,
            "frames": chunk,
            "chain": [type(p).__name__ for p in board],
            "note": "creative chain only; run loudness.py for the -14 LUFS / -1 dBTP true-peak finalize (GAP-14)",
        },
        "project": a.project,
        "args": sys.argv[1:],
    }


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Pedalboard mastering chain (creative; ceiling done by loudness.py).")
    p.add_argument("--in", dest="inp", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--profile", choices=list(PROFILES), default="voice")
    # per-stage overrides (default None -> filled from profile)
    for k in ("hpf", "gate_threshold", "demud_gain", "comp_threshold", "comp_ratio",
              "presence_gain", "presence_hz", "deess_gain", "reverb", "makeup"):
        p.add_argument(f"--{k.replace('_', '-')}", dest=k, type=float, default=None)
    p.add_argument("--safety-ceiling", dest="safety_ceiling", type=float, default=-1.0)
    p.add_argument("--vst", default=None)
    p.add_argument("--vst-param", dest="vst_param", action="append", default=None)
    p.add_argument("--project", default=None)
    a = p.parse_args()
    prof = PROFILES[a.profile]
    for k, v in prof.items():
        if getattr(a, k) is None:
            setattr(a, k, v)
    return a


if __name__ == "__main__":
    args = parse_args()
    contract.run_capability("audio/master", lambda: master(args))
