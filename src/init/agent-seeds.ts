/**
 * Agent runtime seeds — written into the scaffolded project's `.vibe/` by `vibe init`.
 *
 * These live as embedded strings (not template/ files) on purpose: `.vibe/` is a
 * machine-/runtime-scoped directory that is gitignored in the project, so shipping the
 * payload inside the package code is the only path that survives both the npm `files`
 * whitelist and the repo's own ignore rules (the V3 packaging probe proved gitignored
 * template files silently vanish from CI-built tarballs).
 *
 * Consumers: src/agent/claude-adapter.ts passes `--settings .vibe/agent-settings.json`
 * when the file exists; the settings wire the PreToolUse capability firewall hook.
 */

/** `.vibe/agent-settings.json` — settings passed to the headless `claude` via `--settings`. */
export const AGENT_SETTINGS_JSON = `{
  "_README": "Settings for the headless agent the vibe UI spawns (passed via --settings). They apply ONLY to that agent — never to your own interactive Claude/Codex sessions. The PreToolUse hook is the capability firewall: no generic shell-exec, no destructive commands. cwd is the project root, so the relative hook path resolves.",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node .vibe/hooks/pretooluse-capability-firewall.mjs"
          }
        ]
      }
    ]
  }
}
`;

/** `.vibe/hooks/pretooluse-capability-firewall.mjs` — the agent's Bash firewall. */
export const FIREWALL_HOOK_MJS = `#!/usr/bin/env node
/**
 * .vibe/hooks/pretooluse-capability-firewall.mjs — the agent's PreToolUse firewall.
 *
 * Wired into the UI-spawned \`claude\` via \`--settings .vibe/agent-settings.json\`, so it
 * governs the AGENT path ONLY (never your interactive sessions). It enforces the
 * "no generic shell-exec, no destructive commands" rule: Bash is allow-listed to capability
 * CLIs + Remotion + npm-run + read-only utilities; everything else — and anything matching a
 * destructive pattern — is denied.
 *
 * Reads the PreToolUse payload as JSON on stdin: { tool_name, tool_input:{command?} }. Emits a
 * deny decision as JSON on stdout when blocking; stays silent (exit 0) to allow, letting
 * --permission-mode acceptEdits handle Read/Write/Edit within cwd.
 */
import { readFileSync } from 'node:fs';

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }) + '\\n',
  );
  process.exit(0);
}

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0); // unparseable → don't block (fail-open on our own parsing, not on the command)
}

const tool = payload.tool_name ?? payload.toolName ?? '';
// Only Bash can shell out; the other allowed tools (Read/Grep/Glob/Edit/Write/Task/Web*) are safe
// by construction under acceptEdits + cwd scoping.
if (tool !== 'Bash') process.exit(0);

const command = String(payload.tool_input?.command ?? payload.toolInput?.command ?? '');

// Hard denylist — destructive / exfiltration / repo-history rewrites, even if otherwise allow-listed.
const DANGER = [
  /\\brm\\s+-[a-z]*r/i, // rm -r / rm -rf
  /\\brmdir\\b/i,
  /\\bRemove-Item\\b/i,
  /(^|\\s)del\\s/i,
  /\\bformat\\b\\s+[a-z]:/i,
  /\\bmkfs\\b/i,
  /\\bshutdown\\b/i,
  /\\breg\\s+delete\\b/i,
  /\\bgit\\s+push\\b/i,
  /\\bgit\\s+reset\\s+--hard\\b/i,
  /\\bcurl\\b[^\\n]*\\s-(d|X|F|T)\\b/i, // curl uploading/posting
  /\\bInvoke-WebRequest\\b[^\\n]*-Method\\s+Post/i,
  /[>]\\s*\\/dev\\/sd/i,
];
for (const re of DANGER) if (re.test(command)) deny(\`blocked destructive command (matched \${re}).\`);

// Allow-list — capability CLIs, Remotion, npm-run, and read-only utilities.
const ALLOW = [
  /(^|[\\s&|])npx\\s+(--no-install\\s+)?tsx\\s+capabilities[\\\\/]/i,
  /(^|[\\s&|])tsx\\s+capabilities[\\\\/]/i,
  /(^|[\\s&|])node\\s+[^\\n]*capabilities[\\\\/]/i,
  /(^|[\\s&|])npx\\s+remotion\\b/i,
  /(^|[\\s&|])npm\\s+(run\\s+|test\\b)/i,
  /(^|[\\s&|])vibe\\s+(run|new-comp|doctor)\\b/i,
  /(^|[\\s&|])(ls|dir|pwd|cd|echo|cat|type|head|tail|wc|findstr|grep|where|ffprobe)\\b/i,
  /(^|[\\s&|])git\\s+(status|diff|log|show|rev-parse)\\b/i,
];
for (const re of ALLOW) if (re.test(command)) process.exit(0);

deny('not an allowed capability command — the Vibe Studio agent may only run capability CLIs (tsx capabilities/…), Remotion, npm run, vibe run/new-comp/doctor, and read-only utilities (no generic shell-exec).');
`;

/** The relative paths the seeds land at inside a project. */
export const AGENT_SEED_FILES: ReadonlyArray<{ rel: string; content: string }> = [
  { rel: '.vibe/agent-settings.json', content: AGENT_SETTINGS_JSON },
  { rel: '.vibe/hooks/pretooluse-capability-firewall.mjs', content: FIREWALL_HOOK_MJS },
];
