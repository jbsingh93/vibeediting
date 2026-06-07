#!/usr/bin/env python
"""capabilities/acquire/download-media.py — video/social download via yt-dlp (plan P1F.2, GAP-48).

Downloads video/audio (+ subtitles + thumbnail + *.info.json) from any yt-dlp-supported site (YouTube/
Vimeo/TikTok/Instagram/X/...), MERGED with the full C:\\ffmpeg build (so high-res video+audio mux works).
Reference media lands in deliver/<project>/refs/ (media gitignored by extension; sidecars tracked) —
the tree the cockpit Asset Manager lists and the renders list explicitly skips. Provenance is appended
to the same acquire provenance.json the TS acquire capabilities write.

This reuses the ai-brain `ingest_youtube.py` yt-dlp ENGINE — but the output contract differs: we KEEP the
media bytes in the project for compositing (the ai-brain skill deletes them after making a wiki dossier).

yt-dlp is LOOSELY pinned (requirements.txt) — sites change weekly, it must update freely.

CLI:
  python download-media.py --url URL --project NAME [--audio-only] [--format FMT] [--cookies FILE]
      [--subs en,..] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "_env"))
import contract  # noqa: E402

import yt_dlp  # noqa: E402


def build_opts(a: argparse.Namespace, refs_dir: Path) -> dict:
    ffmpeg_dir = str(Path(contract.resolve_ffmpeg()).parent)
    opts: dict = {
        "outtmpl": str(refs_dir / "%(title).80s [%(id)s].%(ext)s"),
        "ffmpeg_location": ffmpeg_dir,
        "writeinfojson": True,
        "writethumbnail": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": [s.strip() for s in a.subs.split(",")] if a.subs else ["en"],
        "noprogress": True,
        "quiet": True,
    }
    if a.audio_only:
        opts["format"] = a.format or "bestaudio/best"
        opts["postprocessors"] = [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3"}]
    else:
        opts["format"] = a.format or "bestvideo+bestaudio/best"
        opts["merge_output_format"] = "mp4"
    if a.cookies:
        opts["cookiefile"] = a.cookies
    return opts


def run(a: argparse.Namespace) -> dict:
    if not a.url:
        raise ValueError("missing --url")
    refs_dir = contract.REPO_ROOT / "deliver" / a.project / "refs"
    refs_dir.mkdir(parents=True, exist_ok=True)
    opts = build_opts(a, refs_dir)

    if a.dry_run:
        # offline: prove option construction + ffmpeg merge wiring without hitting the network
        return {
            "outputs": [],
            "metrics": {"dry_run": True, "ffmpeg_location": opts["ffmpeg_location"],
                        "format": opts["format"], "yt_dlp": yt_dlp.version.__version__,
                        "outtmpl": opts["outtmpl"]},
            "project": a.project, "args": sys.argv[1:], "source": a.url,
        }

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(a.url, download=True)
        path = Path(ydl.prepare_filename(info))
        if not path.exists() and a.audio_only:
            path = path.with_suffix(".mp3")

    # provenance (same JSON-array file the TS acquire capabilities append to)
    prov = contract.work_dir(a.project, "acquire") / "provenance.json"
    arr = json.loads(prov.read_text(encoding="utf-8")) if prov.exists() else []
    rec = {
        "sourceUrl": a.url,
        "title": info.get("title"),
        "author": info.get("uploader") or info.get("channel"),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "localPath": str(path.resolve()),
        "sha256": contract.sha256_file(path) if path.exists() else None,
        "bytes": path.stat().st_size if path.exists() else None,
        "tool": f"yt-dlp {yt_dlp.version.__version__}",
        "usageIntent": "reference",
    }
    arr.append(rec)
    prov.write_text(json.dumps(arr, indent=2) + "\n", encoding="utf-8")

    return {
        "outputs": [str(path.resolve())] if path.exists() else [],
        "metrics": {"title": info.get("title"), "duration_s": info.get("duration"),
                    "uploader": rec["author"], "ext": path.suffix, "yt_dlp": yt_dlp.version.__version__},
        "project": a.project, "args": sys.argv[1:], "source": a.url,
    }


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="yt-dlp media download merged with the full ffmpeg.")
    p.add_argument("--url", required=True)
    p.add_argument("--project", required=True)
    p.add_argument("--audio-only", dest="audio_only", action="store_true")
    p.add_argument("--format", default=None)
    p.add_argument("--cookies", default=None)
    p.add_argument("--subs", default="en")
    p.add_argument("--dry-run", dest="dry_run", action="store_true")
    return p.parse_args()


if __name__ == "__main__":
    contract.run_capability("acquire/download-media", lambda: run(parse_args()))
