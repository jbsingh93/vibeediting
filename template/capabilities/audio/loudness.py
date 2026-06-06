#!/usr/bin/env python
"""capabilities/audio/loudness.py — measured loudness + the true-peak finalize (plan P1A.2, GAP-14).

Two jobs:
  1. MEASURE integrated LUFS (pyloudnorm) + integrated LUFS/true-peak (ffmpeg `loudnorm` pass-1 JSON).
  2. NORMALIZE to -14 LUFS / -1 dBTP via ffmpeg TWO-PASS `loudnorm` — the reliable true-peak ceiling
     (Pedalboard's Limiter is not true-peak, GAP-14, so the ceiling lives here, not in master.py).

Emits {lufs_before, lufs_after, tp_before, tp_after, gain_db, within_tolerance} in the result metrics.

CLI:
  python loudness.py --in IN.wav [--out OUT.wav] [--target -14] [--tp -1] [--lra 11] [--measure-only] [--project NAME]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "_env"))
import contract  # noqa: E402

import pyloudnorm as pyln  # noqa: E402
import soundfile as sf  # noqa: E402


def measure_pyln(path: str) -> float:
    data, rate = sf.read(path)
    meter = pyln.Meter(rate)  # ITU-R BS.1770-4
    return float(meter.integrated_loudness(data))


def loudnorm_measure(path: str, target: float, tp: float, lra: float) -> dict:
    """ffmpeg loudnorm pass-1: returns measured input_i / input_tp / input_lra / input_thresh / target_offset."""
    ff = contract.resolve_ffmpeg()
    r = subprocess.run(
        [ff, "-hide_banner", "-i", path, "-af",
         f"loudnorm=I={target}:TP={tp}:LRA={lra}:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    m = re.search(r"\{[\s\S]*\}", r.stderr + r.stdout)
    if not m:
        raise RuntimeError("loudnorm pass-1 produced no JSON measurement")
    return json.loads(m.group(0))


def normalize(path: str, out: str, target: float, tp: float, lra: float, meas: dict) -> None:
    ff = contract.resolve_ffmpeg()
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    af = (f"loudnorm=I={target}:TP={tp}:LRA={lra}"
          f":measured_I={meas['input_i']}:measured_TP={meas['input_tp']}"
          f":measured_LRA={meas['input_lra']}:measured_thresh={meas['input_thresh']}"
          f":offset={meas['target_offset']}:linear=true")
    r = subprocess.run([ff, "-y", "-i", path, "-af", af, out], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"loudnorm pass-2 failed:\n{r.stderr[-2000:]}")


def run(a: argparse.Namespace) -> dict:
    in_path = a.inp
    if not Path(in_path).is_file():
        raise FileNotFoundError(f"input not found: {in_path}")

    before = loudnorm_measure(in_path, a.target, a.tp, a.lra)
    lufs_before = float(before["input_i"])
    tp_before = float(before["input_tp"])
    try:
        pyln_before = measure_pyln(in_path)
    except Exception:  # noqa: BLE001 — pyln chokes on some formats; ffmpeg value is authoritative
        pyln_before = None

    metrics = {
        "lufs_before": lufs_before,
        "tp_before": tp_before,
        "pyln_lufs_before": pyln_before,
        "target_lufs": a.target,
        "target_tp": a.tp,
    }
    outputs: list[str] = []

    if not a.measure_only:
        out = a.out or str(Path(in_path).with_suffix("").as_posix() + "-loudnorm.wav")
        normalize(in_path, out, a.target, a.tp, a.lra, before)
        after = loudnorm_measure(out, a.target, a.tp, a.lra)
        lufs_after = float(after["input_i"])
        tp_after = float(after["input_tp"])
        metrics.update({
            "lufs_after": lufs_after,
            "tp_after": tp_after,
            "gain_db": round(lufs_after - lufs_before, 2),
            "within_tolerance": abs(lufs_after - a.target) <= 1.0 and tp_after <= a.tp + 0.5,
        })
        outputs.append(str(Path(out).resolve()))

    return {"outputs": outputs, "metrics": metrics, "project": a.project, "args": sys.argv[1:]}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Measure + normalize loudness to -14 LUFS / -1 dBTP.")
    p.add_argument("--in", dest="inp", required=True)
    p.add_argument("--out", default=None)
    p.add_argument("--target", type=float, default=-14.0)
    p.add_argument("--tp", type=float, default=-1.0)
    p.add_argument("--lra", type=float, default=11.0)
    p.add_argument("--measure-only", dest="measure_only", action="store_true")
    p.add_argument("--project", default=None)
    return p.parse_args()


if __name__ == "__main__":
    contract.run_capability("audio/loudness", lambda: run(parse_args()))
