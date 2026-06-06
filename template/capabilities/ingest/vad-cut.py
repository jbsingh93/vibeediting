#!/usr/bin/env python
"""capabilities/ingest/vad-cut.py — the talking-head edit engine (plan P1C.4, GAP-27).

Three cuts that turn a raw take into a tight edit:
  1. SILENCE TRIM   — collapse pauses > --min-silence to --keep-silence (ffmpeg `silencedetect`).
  2. FILLER REMOVAL — drop filler words (um, uh, like, ... — per-language map, see --lang)
                      using OpenAI-Whisper word timing (a captions.json).
  3. LAST-TAKE DEDUP — when a phrase is re-recorded, keep the LAST take (repeated-ngram detection).

NOTE ON THE VAD ENGINE: the plan names Silero VAD, but the shared venv stays torch-free (GAP-19) — so
silence detection uses the full ffmpeg `silencedetect` filter (deterministic, no torch). Silero VAD is
the documented upgrade once the on-demand torch env (P4V.0) exists. (silencedetect = silence, not STT —
unaffected by the OpenAI-only STT rule.)

Emits an EDL (keep segments + what was removed). With --out, also renders the trimmed media.

CLI:
  python capabilities/ingest/vad-cut.py --in MEDIA [--captions CAPS.json] [--out OUT.mp4]
      [--min-silence 0.35] [--keep-silence 0.15] [--noise -30]
      [--lang en|da] [--fillers "um,uh,like,you know"] [--dedup] [--project NAME]

`--lang` picks the built-in filler list (en default; da ships as a language feature);
`--fillers` overrides it with an explicit comma-separated list.
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

# Per-language filler maps (extend freely; --fillers overrides with an explicit list).
FILLERS_BY_LANG = {
    "en": ["hmm", "um", "uh", "uhm", "like", "you know", "sort of", "kind of"],
    "da": ["øh", "øhm", "øhh", "altså", "ik os", "ikk os", "hmm"],
}


def detect_silences(media: str, noise_db: float, min_silence: float) -> list[tuple[float, float]]:
    ff = contract.resolve_ffmpeg()
    r = subprocess.run(
        [ff, "-hide_banner", "-i", media, "-af", f"silencedetect=noise={noise_db}dB:d={min_silence}", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    text = r.stderr + r.stdout
    starts = [float(m.group(1)) for m in re.finditer(r"silence_start:\s*([0-9.]+)", text)]
    ends = [float(m.group(1)) for m in re.finditer(r"silence_end:\s*([0-9.]+)", text)]
    return list(zip(starts, ends))


def keep_segments(duration: float, silences: list[tuple[float, float]], keep_silence: float) -> list[list[float]]:
    """Complement of the silences, re-adding a little padding (keep_silence) at each boundary."""
    segs: list[list[float]] = []
    cursor = 0.0
    for s, e in silences:
        seg_end = min(s + keep_silence, duration)
        if seg_end > cursor:
            segs.append([round(cursor, 3), round(seg_end, 3)])
        cursor = max(cursor, e - keep_silence)
        cursor = max(0.0, cursor)
    if cursor < duration:
        segs.append([round(cursor, 3), round(duration, 3)])
    # merge tiny adjacent gaps
    merged: list[list[float]] = []
    for seg in segs:
        if merged and seg[0] - merged[-1][1] < 0.05:
            merged[-1][1] = seg[1]
        else:
            merged.append(seg)
    return [s for s in merged if s[1] - s[0] > 0.05]


def norm(word: str) -> str:
    return re.sub(r"[^\wæøå']", "", word.lower(), flags=re.UNICODE).strip("'")


def find_fillers(caps: list[dict], fillers: list[str]) -> list[dict]:
    fset = {norm(f) for f in fillers if " " not in f}
    out = []
    for c in caps:
        if norm(c.get("text", "")) in fset:
            out.append({"text": c["text"], "start": c["startMs"] / 1000.0, "end": c["endMs"] / 1000.0})
    return out


def find_duplicates(caps: list[dict], n: int = 4) -> list[dict]:
    """Repeated-ngram detection: if the same n-word sequence appears twice, mark the EARLIER one (false start)."""
    words = [norm(c.get("text", "")) for c in caps]
    dups = []
    seen: dict[tuple, int] = {}
    for i in range(len(words) - n + 1):
        gram = tuple(words[i:i + n])
        if "" in gram:
            continue
        if gram in seen:
            j = seen[gram]
            dups.append({
                "phrase": " ".join(gram),
                "remove_start": caps[j]["startMs"] / 1000.0,
                "remove_end": caps[j + n - 1]["endMs"] / 1000.0,
            })
        seen[gram] = i
    return dups


def render_edl(media: str, segs: list[list[float]], out: str, work: Path) -> None:
    """Cut to the keep segments and concat (full ffmpeg; setpts/asetpts reset per segment)."""
    ff = contract.resolve_ffmpeg()
    parts = []
    for k, (s, e) in enumerate(segs):
        part = str(work / f"seg{k:03d}.mp4")
        r = subprocess.run([ff, "-y", "-ss", str(s), "-to", str(e), "-i", media,
                            "-c:v", "libx264", "-crf", "18", "-c:a", "aac", part], capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f"segment cut failed:\n{r.stderr[-1200:]}")
        parts.append(part)
    listfile = work / "concat.txt"
    listfile.write_text("".join(f"file '{Path(p).as_posix()}'\n" for p in parts), encoding="utf-8")
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run([ff, "-y", "-f", "concat", "-safe", "0", "-i", str(listfile), "-c", "copy", out],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"concat failed:\n{r.stderr[-1200:]}")


def run(a: argparse.Namespace) -> dict:
    if not Path(a.inp).is_file():
        raise FileNotFoundError(f"input not found: {a.inp}")
    duration = contract.ffprobe_duration(a.inp)
    silences = detect_silences(a.inp, a.noise, a.min_silence)
    segs = keep_segments(duration, silences, a.keep_silence)

    fillers_found, duplicates = [], []
    if a.captions:
        caps = json.loads(Path(a.captions).read_text(encoding="utf-8"))
        filler_list = (
            [f.strip() for f in a.fillers.split(",")]
            if a.fillers
            else FILLERS_BY_LANG.get(a.lang, FILLERS_BY_LANG["en"])
        )
        fillers_found = find_fillers(caps, filler_list)
        if a.dedup:
            duplicates = find_duplicates(caps)

    outputs = []
    if a.out:
        render_edl(a.inp, segs, a.out, contract.work_dir(a.project or "_scratch", "vad-cut"))
        outputs.append(str(Path(a.out).resolve()))

    kept = sum(e - s for s, e in segs)
    return {
        "outputs": outputs,
        "metrics": {
            "duration_s": round(duration, 3),
            "silences": len(silences),
            "keep_segments": segs,
            "trimmed_s": round(duration - kept, 3),
            "fillers_found": fillers_found,
            "duplicates": duplicates,
        },
        "project": a.project,
        "args": sys.argv[1:],
    }


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Silence-trim + filler removal + last-take dedup.")
    p.add_argument("--in", dest="inp", required=True)
    p.add_argument("--captions", default=None)
    p.add_argument("--out", default=None)
    p.add_argument("--min-silence", dest="min_silence", type=float, default=0.35)
    p.add_argument("--keep-silence", dest="keep_silence", type=float, default=0.15)
    p.add_argument("--noise", type=float, default=-30.0)
    p.add_argument("--lang", default="en", help="built-in filler list to use (en|da)")
    p.add_argument("--fillers", default=None, help="explicit comma-separated filler list (overrides --lang)")
    p.add_argument("--dedup", action="store_true")
    p.add_argument("--project", default=None)
    return p.parse_args()


if __name__ == "__main__":
    contract.run_capability("ingest/vad-cut", lambda: run(parse_args()))
