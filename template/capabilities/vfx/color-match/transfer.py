#!/usr/bin/env python
"""capabilities/vfx/color-match/transfer.py — Reinhard LAB statistical color transfer (plan P4V.11; GAP-40).

CPU-only, NOT an ML model — a deterministic statistical algorithm (Reinhard et al. 2001) that makes a
PAID-generated B-roll clip sit visually in the base plate's grade. Cheap (~0.02 s/frame). Pairs with
the `color/` capability (P1B); the VFX policy (2026-05-27) explicitly allows this because it has no
PyTorch / CUDA / VRAM footprint.

Algorithm (per frame):
  1) convert source (the foreign-graded clip) and reference (one frame from the base plate) to LAB
  2) shift each LAB channel of source so its mean matches the reference's mean
  3) scale each LAB channel of source so its std-dev matches the reference's std-dev
  4) convert back to BGR

Temporal EMA (anti-flicker extension): the per-frame source statistics are smoothed across
frames with an exponential moving average (alpha=0.1 by default), so a brief content shift inside
the source clip doesn't yank the grade. The reference statistics are computed ONCE per run.

Alpha-preserving variant: --alpha-passthrough preserves the source's alpha channel through the
transfer (matters for RGBA B-roll generated via Veo/Runway/Seedance and exported as ProRes 4444 /
VP9 yuva). Color is transferred only on RGB; alpha is copied untouched.

CLI:
  python transfer.py --in SRC.mp4 --reference REF.png --out OUT.mp4
        [--ema 0.1] [--alpha-passthrough] [--project NAME]

The --reference can be a still (.png/.jpg) OR a video file (first frame is used).
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "_env"))
import contract  # noqa: E402

import cv2  # noqa: E402
import numpy as np  # noqa: E402

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}


def read_reference_frame(ref_path: Path) -> np.ndarray:
    """Load the reference frame as BGR uint8 (a still, or the first frame of a video)."""
    if ref_path.suffix.lower() in IMAGE_EXT:
        img = cv2.imread(str(ref_path), cv2.IMREAD_COLOR)
        if img is None:
            raise FileNotFoundError(f"reference image not readable: {ref_path}")
        return img
    cap = cv2.VideoCapture(str(ref_path))
    try:
        ok, frame = cap.read()
        if not ok or frame is None:
            raise RuntimeError(f"reference video has no frames: {ref_path}")
        return frame
    finally:
        cap.release()


def lab_stats(bgr_u8: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Mean + std (per LAB channel) of a BGR uint8 frame."""
    lab = cv2.cvtColor(bgr_u8, cv2.COLOR_BGR2LAB).astype(np.float32)
    mean = lab.reshape(-1, 3).mean(axis=0)
    std = lab.reshape(-1, 3).std(axis=0)
    std[std < 1e-6] = 1e-6
    return mean, std


def reinhard_transfer(
    src_bgr_u8: np.ndarray,
    ref_mean: np.ndarray,
    ref_std: np.ndarray,
    src_mean: np.ndarray,
    src_std: np.ndarray,
) -> np.ndarray:
    """Apply Reinhard LAB transfer to one BGR uint8 frame using pre-computed stats."""
    lab = cv2.cvtColor(src_bgr_u8, cv2.COLOR_BGR2LAB).astype(np.float32)
    # zero-mean → scale → re-mean (per channel)
    lab = (lab - src_mean) * (ref_std / src_std) + ref_mean
    lab = np.clip(lab, 0, 255).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def ema_update(prev: np.ndarray | None, current: np.ndarray, alpha: float) -> np.ndarray:
    """Exponential moving average — anti-flicker on the per-frame source stats."""
    if prev is None:
        return current.copy()
    return alpha * current + (1.0 - alpha) * prev


def transfer_image(src: Path, ref: Path, out: Path, alpha_passthrough: bool) -> dict:
    """Reinhard transfer on a single image (PNG/JPG)."""
    has_alpha = alpha_passthrough and src.suffix.lower() in {".png", ".tif", ".tiff", ".webp"}
    if has_alpha:
        src_bgra = cv2.imread(str(src), cv2.IMREAD_UNCHANGED)
        if src_bgra is None or src_bgra.shape[-1] != 4:
            has_alpha = False
            src_img = cv2.imread(str(src), cv2.IMREAD_COLOR)
        else:
            src_img = src_bgra[:, :, :3]
            src_alpha = src_bgra[:, :, 3]
    else:
        src_img = cv2.imread(str(src), cv2.IMREAD_COLOR)
        src_alpha = None
    if src_img is None:
        raise FileNotFoundError(f"source image not readable: {src}")

    ref_img = read_reference_frame(ref)
    ref_mean, ref_std = lab_stats(ref_img)
    src_mean, src_std = lab_stats(src_img)
    out_bgr = reinhard_transfer(src_img, ref_mean, ref_std, src_mean, src_std)

    if has_alpha and src_alpha is not None:
        out_bgra = np.dstack([out_bgr, src_alpha])
        cv2.imwrite(str(out), out_bgra)
    else:
        cv2.imwrite(str(out), out_bgr)
    return {
        "frames": 1,
        "ref_mean_lab": ref_mean.tolist(),
        "ref_std_lab": ref_std.tolist(),
        "alpha_preserved": bool(has_alpha and src_alpha is not None),
    }


def transfer_video(src: Path, ref: Path, out: Path, ema: float, alpha_passthrough: bool) -> dict:
    """Per-frame Reinhard transfer + temporal EMA on the source statistics, audio remuxed via full ffmpeg."""
    ref_mean, ref_std = lab_stats(read_reference_frame(ref))

    cap = cv2.VideoCapture(str(src))
    if not cap.isOpened():
        raise RuntimeError(f"source video not readable: {src}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # write to a silent intermediate, then mux audio back via ffmpeg (GAP-41: never use cv2 VideoWriter
    # for the FINAL alpha-bearing output — for opaque grading on H.264 this is fine, alpha is its own job)
    workdir = contract.work_dir("_scratch", "color-match")
    tmp = workdir / f"_color-match-{src.stem}.avi"
    fourcc = cv2.VideoWriter_fourcc(*"FFV1")  # lossless intermediate
    vw = cv2.VideoWriter(str(tmp), fourcc, fps, (width, height))

    src_mean_smoothed: np.ndarray | None = None
    src_std_smoothed: np.ndarray | None = None
    frames = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok or frame is None:
                break
            m, s = lab_stats(frame)
            src_mean_smoothed = ema_update(src_mean_smoothed, m, ema)
            src_std_smoothed = ema_update(src_std_smoothed, s, ema)
            graded = reinhard_transfer(frame, ref_mean, ref_std, src_mean_smoothed, src_std_smoothed)
            vw.write(graded)
            frames += 1
    finally:
        cap.release()
        vw.release()

    # remux audio + transcode to deliverable H.264 via the full ffmpeg
    ff = contract.resolve_ffmpeg()
    cmd = [
        ff, "-y",
        "-i", str(tmp),
        "-i", str(src),
        "-map", "0:v", "-map", "1:a?", "-c:v", "libx264", "-crf", "18",
        "-pix_fmt", "yuv420p", "-c:a", "copy",
        str(out),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg mux failed:\n{r.stderr[-800:]}")
    try:
        tmp.unlink()
    except OSError:
        pass

    return {
        "frames": frames,
        "fps": fps,
        "width": width,
        "height": height,
        "ref_mean_lab": ref_mean.tolist(),
        "ref_std_lab": ref_std.tolist(),
        "ema": ema,
        "alpha_preserved": False,  # H.264 mp4 output is opaque; alpha use the image path or ProRes/VP9 wrapper
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="src", required=True)
    parser.add_argument("--reference", "--ref", dest="ref", required=True)
    parser.add_argument("--out", dest="out", required=True)
    parser.add_argument("--ema", type=float, default=0.1, help="0 = no smoothing, 1 = no memory (default 0.1)")
    parser.add_argument("--alpha-passthrough", action="store_true", help="preserve alpha channel (image path)")
    parser.add_argument("--project", default="_scratch")
    args = parser.parse_args()

    src = Path(args.src).resolve()
    ref = Path(args.ref).resolve()
    out = Path(args.out).resolve()
    if not src.is_file():
        raise FileNotFoundError(f"input not found: {src}")
    if not ref.is_file():
        raise FileNotFoundError(f"reference not found: {ref}")
    out.parent.mkdir(parents=True, exist_ok=True)

    is_image = src.suffix.lower() in IMAGE_EXT

    def body() -> dict:
        if is_image:
            metrics = transfer_image(src, ref, out, args.alpha_passthrough)
        else:
            metrics = transfer_video(src, ref, out, args.ema, args.alpha_passthrough)
        return {
            "outputs": [str(out)],
            "metrics": metrics,
            "project": args.project,
            "args": sys.argv[1:],
        }

    contract.run_capability("vfx/color-match", body)


if __name__ == "__main__":
    main()
