"""capabilities/_env/contract.py — the Python mirror of the capability contract (plan P0.9, GAP-4).

Python capabilities (audio/*.py, color/grade.py, ingest/*.py) speak the same shape
as the TS contract (contract.ts): a JSON RESULT ENVELOPE on stdout, writes under the
disposable WORK DIR (out/work/<project>/<stage>/), and an append-only PROVENANCE log.

Also resolves the FULL ffmpeg/ffprobe build (same order as _env/ffmpeg.ts) so Python
never falls back to a stripped binary. Dependency-free (stdlib only).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

_ENV_DIR = Path(__file__).resolve().parent
REPO_ROOT = _ENV_DIR.parent.parent
_EXE = ".exe" if sys.platform == "win32" else ""

# The OPTIONAL Python venv's own interpreter (created by _env/setup-venv.ts), per-OS.
VENV_PY = str(
    REPO_ROOT / "capabilities" / ".venv"
    / ("Scripts" if sys.platform == "win32" else "bin")
    / f"python{_EXE}"
)


def _exists_file(p: str | os.PathLike | None) -> bool:
    return bool(p) and Path(p).is_file()


def _vibe_bin(exe: str) -> str | None:
    """The provisioned per-project binary dir (.vibe/bin), checked from the project
    root this file lives in AND from cwd (scripts run with cwd = project root)."""
    for root in (REPO_ROOT, Path.cwd()):
        cand = root / ".vibe" / "bin" / exe
        if cand.is_file():
            return str(cand)
    return None


def resolve_ffmpeg() -> str:
    """ffmpeg: VIBE_FFMPEG (file or dir) -> .vibe/bin -> PATH (mirrors ffmpeg.ts)."""
    ov = os.environ.get("VIBE_FFMPEG")
    if ov:
        if _exists_file(ov):
            return ov
        cand = Path(ov) / f"ffmpeg{_EXE}"
        if cand.is_file():
            return str(cand)
    provisioned = _vibe_bin(f"ffmpeg{_EXE}")
    if provisioned:
        return provisioned
    return shutil.which("ffmpeg") or "ffmpeg"


def resolve_ffprobe() -> str:
    ov = os.environ.get("VIBE_FFPROBE")
    if ov:
        if _exists_file(ov):
            return ov
        cand = Path(ov) / f"ffprobe{_EXE}"
        if cand.is_file():
            return str(cand)
    ffmpeg = resolve_ffmpeg()
    if ffmpeg != "ffmpeg":
        sib = Path(ffmpeg).parent / f"ffprobe{_EXE}"
        if sib.is_file():
            return str(sib)
    provisioned = _vibe_bin(f"ffprobe{_EXE}")
    if provisioned:
        return provisioned
    return shutil.which("ffprobe") or "ffprobe"


def _sanitize(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "-", s)


def work_dir(project: str, stage: str) -> Path:
    d = REPO_ROOT / "out" / "work" / _sanitize(project) / _sanitize(stage)
    d.mkdir(parents=True, exist_ok=True)
    return d


def provenance_path(project: str) -> Path:
    d = REPO_ROOT / "out" / "work" / _sanitize(project)
    d.mkdir(parents=True, exist_ok=True)
    return d / "provenance.log"


def sha256_file(p: str | os.PathLike) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def describe_outputs(paths: list[str]) -> list[dict[str, Any]]:
    out = []
    for p in paths:
        if Path(p).is_file():
            out.append({"path": p, "sha256": sha256_file(p), "bytes": Path(p).stat().st_size})
    return out


def append_provenance(project: str, rec: dict[str, Any]) -> None:
    with open(provenance_path(project), "a", encoding="utf-8") as f:
        f.write(json.dumps(rec) + "\n")


def model_id(dot_path: str) -> str:
    """Read a model id from the single source of truth (_env/models.json), honoring an env override."""
    models = json.loads((_ENV_DIR / "models.json").read_text(encoding="utf-8"))
    node: Any = models
    for key in dot_path.split("."):
        node = (node or {}).get(key)
    if not node or "id" not in node:
        raise ValueError(f'models.json has no model at "{dot_path}"')
    ov = node.get("envOverride")
    if ov and os.environ.get(ov):
        return os.environ[ov]
    return node["id"]


@dataclass
class CapabilityResult:
    capability: str
    success: bool = True
    outputs: list[str] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    error: str | None = None
    startedAt: str = ""
    finishedAt: str = ""
    durationMs: int = 0


def emit(result: CapabilityResult) -> None:
    """Print the envelope as a single JSON line on stdout — the LAST thing a capability emits."""
    sys.stdout.write(json.dumps(asdict(result)) + "\n")
    sys.stdout.flush()


def run_capability(capability: str, body: Callable[[], dict[str, Any]]) -> None:
    """Time `body`, catch errors, always emit a valid envelope, exit non-zero on failure.

    `body` returns a dict: {outputs, metrics, warnings?, project?, args?, source?}.
    """
    t0 = time.time()
    started = datetime.now(timezone.utc).isoformat()
    try:
        r = body() or {}
        finished = datetime.now(timezone.utc).isoformat()
        res = CapabilityResult(
            capability=capability,
            success=True,
            outputs=r.get("outputs", []),
            metrics=r.get("metrics", {}),
            warnings=r.get("warnings", []),
            startedAt=started,
            finishedAt=finished,
            durationMs=int((time.time() - t0) * 1000),
        )
        if r.get("project"):
            append_provenance(r["project"], {
                "ts": finished,
                "capability": capability,
                "args": r.get("args"),
                "outputs": describe_outputs(res.outputs),
                "source": r.get("source"),
            })
        emit(res)
    except Exception as e:  # noqa: BLE001 — the boundary that guarantees a valid envelope
        emit(CapabilityResult(
            capability=capability,
            success=False,
            error=str(e),
            startedAt=started,
            finishedAt=datetime.now(timezone.utc).isoformat(),
            durationMs=int((time.time() - t0) * 1000),
        ))
        sys.exit(1)


def ffprobe_duration(path: str) -> float:
    """Duration in seconds via the full ffprobe build."""
    out = subprocess.run(
        [resolve_ffprobe(), "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=nokey=1:noprint_wrappers=1", path],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)
