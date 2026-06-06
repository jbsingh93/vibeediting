# Security Policy

## Supported versions

Pre-1.0: only the latest published version is supported.

## Reporting a vulnerability

Please report vulnerabilities privately via GitHub security advisories on this repository,
or by email to dinegenboss@gmail.com. Do not open public issues for security reports.

## Scope

- The `vibe` CLI, the local UI server (binds to localhost only), the project scaffolder,
  and the agent-bridge layer.
- Out of scope: the `claude` / `codex` binaries themselves, provider APIs, environment
  misconfiguration, and upstream dependency issues (report those upstream).

## Data stance

- 100% local. No telemetry. No accounts. We host nothing and proxy no API calls.
- API keys live only in your project's `.env` file and are sent only to the providers you
  configure (OpenAI, Google, ElevenLabs, and optionally Runway / fal.ai).
- Media never leaves your machine except to those providers — and to your agent CLI's
  provider per its own settings.
