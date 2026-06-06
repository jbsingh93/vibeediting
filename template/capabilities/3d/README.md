# `3d/` — Blender headless shot service (ON-DEMAND)

**Status: not built. Blender is NOT installed on this machine (GAP-1).** This is the lowest-leverage
layer for typical marketing/course/studio content and the highest Windows friction — built only
on first real need, after the core ships (plan demotes Phase 4 to after P6).

| Planned file | Purpose | Backs |
|---|---|---|
| `smoke.ps1` | `blender.exe -b -P hello-render.py` — 1 EEVEE-Next + 1 Cycles/OPTIX frame; confirm non-black + GPU. Gates all of P4. | P4.1 |
| `render-shot.py` | Reads `shot.json` (input, frames, engine, samples, camera, lights) — deterministic, drive from `-P` OR CLI flags, never both (GAP-25). | P4.2 |

**Windows note (A.4):** Cycles/OPTIX is the deterministic headless path (no GL window). EEVEE-Next
needs an interactive desktop session — fails black under a service/scheduled task. Use real
`blender.exe`, NOT the `bpy` PyPI wheel (no Audaspace → no VSE audio). *(AG §2; CP §2; GM §2.)*
