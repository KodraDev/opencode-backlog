# KodraDev OpenCode Backlog

This repository is a local derivative of sachahjkl/opencode-backlog. Preserve
the upstream MIT license, attribution, and Git history. Do not publish or push
without explicit user authorization.

## Architecture

- `src/backlog.ts` and `src/input.ts`: upstream domain logic and validation.
- `src/session-store.ts`: server-only Bun SQLite persistence and scope preferences.
- `src/index.ts`: agent tools, automatic scope resolution, and server RPC.
- `src/session-rpc.ts`: shared portable RPC contract; do not import server storage here.
- `src/ui-client.ts` and `src/tui.tsx`: TUI RPC client, sidebar, and dialogs.
- `src/workflow-skill.ts` and `skills/kodradev-backlog/SKILL.md`: bundled workflow skill and minimal model-context reminder.
- `.opencode/plugins/kodradev-backlog-dev/`: repository-local development wrappers; other projects use global npm.
- `.opencode/backlog-dev.sqlite`: isolated development database, ignored by Git; never share or migrate production data into it implicitly.
- `src/store.ts`: legacy upstream JSON store, not used by this fork at runtime.

Scope changes select another backlog; they must not move, merge, or delete tasks.
Agent tools resolve their scope automatically. Historical backlogs are read-only
in the UI. Capture scope and revision before interactive operations.

## Verification

- Production-only typecheck: `npm run typecheck:src`.
- Build: `npm run build`.
- Whitespace check: `git diff --check`.
- Do not run or modify tests without explicit user authorization. Upstream test
  files and testing configuration describe the original plugin and are preserved.
- Do not enable this fork globally or replace the installed plugin unless asked.
