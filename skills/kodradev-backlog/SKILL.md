---
name: kodradev-backlog
description: Track medium/high-complexity or long-running work in the selected KodraDev backlog; skip simple actions unless tracking is explicitly requested or already relevant.
---

# Backlog workflow

## When to use

- Assess complexity and duration before calling backlog tools. Use backlog for medium/high-complexity or long-running work that benefits from coordination, progress tracking, or continuity across interruptions.
- Track work with several dependent steps, substantial investigation, coordinated changes, or meaningful blockers/handoffs. Judge the overall request, not the number of tool calls or files alone.
- Perform simple, low-complexity actions directly: cancel a pull/PR, make a small localized edit with an obvious solution, change one setting, or run a straightforward command. Do not list or create tasks for these actions. Informational questions also need no backlog.
- Exceptions: the user explicitly requests tracking, or the action belongs to relevant work already tracked. Reuse that task rather than creating a new one for the small action. If initially simple work grows into medium/high complexity or long-running work, start tracking then.
- Lightweight/Detailed controls note detail, not whether work needs tracking. Lightweight mode does not mean every small request needs a task. No extra authorization for tests, publishing, or deletion.

## Tracked work

- List before starting or resuming work that needs tracking. Reuse relevant tasks; do not change unrelated work.
- One small actionable step per task. Short title; separate independent outcomes into tasks, not a long description. Do not create a task for every read or tool call.
- Add pending tasks to `todo`; move to `doing` before work and `done` only when complete. Keep blocked work unfinished with a brief blocker.
- Respect the user's session/project scope. Switching scope selects another backlog; never move, merge, or delete data implicitly.

## Task detail

Follow the mode supplied by Backlog Settings:

- **Lightweight (default):** every new task includes a short title, status, and notes with one very brief description (at most 200 characters). Explain the essential purpose or context; do not repeat the plan or other tasks. Status already records progress; avoid routine note updates.
- **Detailed:** complex tasks may use concise objective, scope/constraints, completion criteria, progress, next step, and blockers. One short line per field; no transcripts or running logs.

Changing mode does not rewrite existing notes. Before replacing notes, read full existing context and preserve essential constraints. `update` replaces notes; it does not append. Never store secrets.

## Recovery

- After resume/compaction of tracked work, list Doing tasks and read relevant tasks with `get`. Simple unrelated actions still need no backlog calls. Notes previews are not full context.
- `list` hides `done`/`cancelled` by default; per-category counts still include them. Request completed tasks with `activeOnly:false` only when needed.
- Before handoff, save only missing context needed to continue. Preserve known task IDs, scope, and next step in the summary; never claim unsaved notes were persisted.
- Use bounded pages and filters; sidebar is only a preview. On stale writes, refresh before retrying. Report unavailable tools or failed writes.
- Before finishing, make statuses truthful and report remaining blockers. Never delete tasks or purge categories without explicit user authorization.
