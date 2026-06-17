---
"vibeediting": patch
---

Add an "update available" notifier to the `vibe` CLI.

On an interactive terminal, `vibe` now checks (at most once a day, in a detached background
process that never blocks the command) whether a newer version is published on npm, and shows a
small banner pointing to `npm i -g vibeediting`. Dependency-free; honors `CI`, `NO_UPDATE_NOTIFIER`,
`VIBE_NO_UPDATE_CHECK`, non-TTY/piped output, and `--json`/`--quiet`/`--version`/`--help`.
