# JBS Vibe Editing

> **Status: pre-alpha — under active development. Not yet usable. First release will be `v0.1.0` on npm.**

Make professional short-form and long-form videos by *talking to an agent*. JBS Vibe Editing is an
AI video-editing tool you install from npm: run `vibe init`, a local web UI opens in your browser,
and your own **Claude Code** (or **Codex CLI**) drives a battle-tested engine of media capabilities —
transcription, cutting, word-level captions, audio mastering, color grading, motion graphics
(Remotion under the hood), AI-generated voice-over/music/SFX, and AI visual QA — behind hard quality
gates. You never need to touch code or the terminal after install.

## How it will work

```bash
npm install -g vibeediting
vibe init my-videos
```

…and the browser opens. Everything else — API keys, brand setup, making videos, cost approval,
saving your own style templates — happens in the UI.

## Requirements (v1)

Requires **Claude Code (or a Claude subscription) — or Codex CLI** — plus your own
OpenAI / Gemini / ElevenLabs API keys. Optional keys (Runway, fal.ai) unlock paid AI video
generation. Node.js 20+.

Everything runs **100% locally**: we host nothing, we proxy no API calls, we hold no keys.

## License

**Source-available, free for personal & non-commercial use** under the
[PolyForm Noncommercial License 1.0.0](LICENSE). This is *not* an open-source license.

- ✅ **Free:** personal videos, learning, your own hobby channel, evaluating the tool.
- ❌ **Needs a commercial license:** client work, videos for your business or marketing,
  embedding in a product or service, reselling.

For commercial licensing, contact the author (see `package.json` / GitHub profile).
The plain-language summary above is descriptive only — the [LICENSE](LICENSE) text governs.

Remotion (the render engine installed into your project) is licensed separately by Remotion;
company use of Remotion may require a paid Remotion license — see
[remotion.dev/license](https://www.remotion.dev/license).

## Development

```bash
npm install
npm run build      # tsup → dist/bin/vibe.js
npm run dev -- --help
npm run test:run   # vitest
npm run typecheck
npm run lint
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the design. See [NOTICE](NOTICE) for trademark and
third-party notes.
