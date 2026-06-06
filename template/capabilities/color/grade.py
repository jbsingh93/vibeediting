#!/usr/bin/env python
"""capabilities/color/grade.py — colorimetric LUT apply, Python control path (plan P1B.3).

The fallback to grade.ts (ffmpeg lut3d) for STILLS/THUMBNAILS and fine --intensity control, using
colour-science's read_LUT().apply() (correct colorimetry). Also a slow per-frame VIDEO mode via OpenCV
(frames graded in numpy, audio re-muxed with the full ffmpeg) when ffmpeg's lut3d isn't flexible enough.

For video at scale, prefer grade.ts (ffmpeg lut3d, GPU-fast). This exists for colorimetric correctness
on stills and for intensity blending the LUT.

CLI:
  python capabilities/color/grade.py --in IN.(png|jpg|mp4) --out OUT --lut warm-cine [--intensity 1.0] [--project NAME]
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "_env"))
import contract  # noqa: E402

import colour  # noqa: E402
import cv2  # noqa: E402
import numpy as np  # noqa: E402

LUT_DIR = Path(__file__).resolve().parent / "luts"
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}


def resolve_lut(spec: str) -> Path:
    for c in (Path(spec), LUT_DIR / spec, LUT_DIR / (spec if spec.endswith(".cube") else f"{spec}.cube")):
        if c.is_file():
            return c.resolve()
    raise FileNotFoundError(f'LUT not found: "{spec}"')


def apply_lut_rgb(lut: colour.LUT3D, rgb01: np.ndarray, intensity: float) -> np.ndarray:
    """rgb01: HxWx3 float in [0,1]. Returns graded, intensity-blended, clipped [0,1]."""
    graded = lut.apply(rgb01)
    if intensity < 0.999:
        graded = rgb01 * (1.0 - intensity) + graded * intensity
    return np.clip(graded, 0.0, 1.0)


def grade_still(in_path: str, out_path: str, lut: colour.LUT3D, intensity: float) -> None:
    bgr = cv2.imread(in_path, cv2.IMREAD_COLOR)
    if bgr is None:
        raise RuntimeError(f"could not read image: {in_path}")
    rgb01 = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    graded = apply_lut_rgb(lut, rgb01, intensity)
    out_bgr = cv2.cvtColor((graded * 255.0 + 0.5).astype(np.uint8), cv2.COLOR_RGB2BGR)
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(out_path, out_bgr):
        raise RuntimeError(f"could not write image: {out_path}")


def grade_video(in_path: str, out_path: str, lut: colour.LUT3D, intensity: float, work: Path) -> None:
    cap = cv2.VideoCapture(in_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    silent = str(work / "graded-silent.mp4")
    vw = cv2.VideoWriter(silent, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    try:
        while True:
            ok, bgr = cap.read()
            if not ok:
                break
            rgb01 = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            graded = apply_lut_rgb(lut, rgb01, intensity)
            vw.write(cv2.cvtColor((graded * 255.0 + 0.5).astype(np.uint8), cv2.COLOR_RGB2BGR))
    finally:
        cap.release()
        vw.release()
    # re-mux original audio with the full ffmpeg (cv2 wrote video only)
    ff = contract.resolve_ffmpeg()
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        [ff, "-y", "-i", silent, "-i", in_path, "-map", "0:v", "-map", "1:a?",
         "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", out_path],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise RuntimeError(f"audio re-mux failed:\n{r.stderr[-1500:]}")


def run(a: argparse.Namespace) -> dict:
    if not Path(a.inp).is_file():
        raise FileNotFoundError(f"input not found: {a.inp}")
    lut = colour.read_LUT(str(resolve_lut(a.lut)))
    intensity = max(0.0, min(1.0, a.intensity))
    if Path(a.inp).suffix.lower() in IMAGE_EXT:
        grade_still(a.inp, a.out, lut, intensity)
    else:
        grade_video(a.inp, a.out, lut, intensity, contract.work_dir(a.project or "_scratch", "color"))
    return {
        "outputs": [str(Path(a.out).resolve())],
        "metrics": {"lut": Path(a.lut).name, "intensity": intensity, "engine": "colour-science"},
        "project": a.project,
        "args": sys.argv[1:],
    }


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Colorimetric LUT apply (stills/intensity; video fallback).")
    p.add_argument("--in", dest="inp", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--lut", default="neutral-correct")
    p.add_argument("--intensity", type=float, default=1.0)
    p.add_argument("--project", default=None)
    return p.parse_args()


if __name__ == "__main__":
    contract.run_capability("color/grade-py", lambda: run(parse_args()))
