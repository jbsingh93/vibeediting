# Contributing

Thanks for your interest! A few ground rules first.

## License & CLA

JBS Vibe Editing is **source-available under the PolyForm Noncommercial License 1.0.0**, and the
author also offers commercial licenses. So that commercial licensing can cover contributed code,
**code contributions require signing a lightweight Contributor License Agreement (CLA)** — a
CLA-assistant bot will prompt you on your first pull request.

Without a CLA we can still happily accept: bug reports, reproduction cases, documentation fixes,
and ideas in issues.

## Dev setup

```bash
npm install
npm run build        # tsup → dist/bin/vibe.js
npm run dev -- --help
```

## Before you open a PR

- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run test:run` — green
- Keep commits small; subject line ≤ 70 chars; body explains *why*.

## Bug reports

Please include the output of `vibe doctor --json` — it tells us your platform, Node version,
and which external tools (agent CLI, FFmpeg) were found.
