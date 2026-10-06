---
name: kodradev-backlog
description: Track actionable work with small tasks in the selected KodraDev backlog.
---

# Backlog workflow

- Actionable work only; informational questions need no task. No extra authorization for tests, publishing, or deletion.
- List before work. Reuse relevant tasks; do not change unrelated work.
- One small actionable step per task. Short title; separate independent outcomes into tasks, not a long description. Do not create a task for every read or tool call.
- Add pending tasks to `todo`; move to `doing` before work and `done` only when complete. Keep blocked work unfinished with a brief blocker.
- Respect the user's session/project scope. Switching scope selects another backlog; never move, merge, or delete data implicitly.

## Task detail

Follow the mode supplied by Backlog Settings:

- **Lightweight (default):** every new task includes a short title, status, and notes with one very brief description (at most 200 characters). Explain the essential purpose or context; do not repeat the plan or other tasks. Status already records progress; avoid routine note updates.
- **Detailed:** complex tasks may use concise objective, scope/constraints, completion criteria, progress, next step, and blockers. One short line per field; no transcripts or running logs.

Changing mode does not rewrite existing notes. Before replacing notes, read full existing context and preserve essential constraints. `update` replaces notes; it does not append. Never store secrets.

## Recovery

- After resume/compaction, list Doing tasks and read relevant tasks with `get`. Notes previews are not full context.
- `list` hides `done`/`cancelled` by default; per-category counts still include them. Request completed tasks with `activeOnly:false` only when needed.
- Before handoff, save only missing context needed to continue. Preserve known task IDs, scope, and next step in the summary; never claim unsaved notes were persisted.
- Use bounded pages and filters; sidebar is only a preview. On stale writes, refresh before retrying. Report unavailable tools or failed writes.
- Before finishing, make statuses truthful and report remaining blockers. Never delete tasks or purge categories without explicit user authorization.
