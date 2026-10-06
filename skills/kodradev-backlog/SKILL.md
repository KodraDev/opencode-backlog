---
name: kodradev-backlog
description: Track actionable work with KodraDev Backlog. Use when implementing, fixing, investigating, configuring, building, publishing, or otherwise executing a task with session_backlog_* tools.
---

# KodraDev Backlog workflow

Use the selected backlog for every task that requires actions. Purely
informational questions do not require tasks. This workflow does not authorize
additional work, testing, publication, or destructive actions.

## Scope

- Tools resolve the calling session automatically. The user chooses an isolated
  session backlog or a project-shared backlog through `/backlog-scope`.
- Respect that choice. Do not change scope, copy tasks, or migrate backlogs
  without user authorization. Do not supply arbitrary session or project IDs.
- Switching scope opens another backlog; it does not move existing tasks.

## Work lifecycle

1. Call `session_backlog_list` before acting. Results are paginated: follow
   `offset` and `total` when needed to find relevant work. Reuse relevant tasks;
   do not change unrelated ones.
2. Record pending steps with `session_backlog_add` in `todo`.
3. Move each step to `doing` with `session_backlog_move` before executing it.
4. Keep progress truthful. Mark a task `done` only after completing it. For
   blocked work, use `blocked` if that category exists, otherwise leave it
   unfinished; explain the blocker with `session_backlog_update`.
5. Before the final response, update task statuses and report remaining work.

Use concise, actionable titles. Keep notes focused on decisions, blockers,
verification performed, and the next step. Do not store secrets, credentials,
complete conversation transcripts, or unnecessary logs in task notes.

## Context and persistence

- List output omits notes by default. Use category/search filters and bounded
  pages instead of dumping all tasks into context.
- Call `session_backlog_get` when full notes for one task are needed.
- The sidebar shows a bounded pending-task preview, not the complete backlog.
- If tools are unavailable or a write fails, report that limitation rather than
  pretending work was recorded. On a stale-write error, refresh before retrying.

## Destructive operations

Do not remove tasks, purge categories, or discard backlog data without explicit
user authorization. Finishing work normally means moving it to `done`, not
deleting it. Category management must preserve unrelated user work.
