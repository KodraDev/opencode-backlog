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
2. Record pending steps with `session_backlog_add` in `todo`. Non-trivial tasks
   require an actionable title and structured notes as described below.
3. Move each step to `doing` with `session_backlog_move` before executing it.
4. Keep progress truthful. Update notes with `session_backlog_update` after
   meaningful milestones, decisions, or blockers. Mark a task `done` only after
   meeting its completion criteria; record the outcome and verification actually
   performed. For blocked work, use `blocked` if that category exists, otherwise
   leave it unfinished; explain the blocker and what would unblock it in notes.
5. Before the final response, update task statuses and report remaining work.

## Task context

Use `title` for a concise action and target, not a vague label such as "Fix bug".
Use the existing `notes` field as the task description and continuation checkpoint;
no extra fields are needed. Non-trivial work includes multi-step tasks,
investigations, or changes with constraints or decisions worth preserving.
Simple one-step tasks may use a title alone.

For non-trivial tasks, use this compact template in the conversation's language:

```text
Objective: What should change and why.
Scope/constraints: Relevant files or components; what must not change.
Completion criteria: Observable conditions for marking this task done.
Progress: What is actually complete; verification performed, if any.
Next step: The next concrete action, or none when complete.
Decisions/blockers: Relevant choices, reasons, or blockers, when present.
```

Keep each section to a short line or a few bullets. Update the current checkpoint
instead of appending an unbounded activity log. Read full existing notes before
replacing unfamiliar or partially visible content; `session_backlog_update`
replaces the whole notes field. Preserve still-relevant objectives, constraints,
completion criteria, and user-provided context. Do not store secrets, credentials,
complete conversation transcripts, or unnecessary logs in task notes.

## Context and persistence

- List output omits notes by default. Use category/search filters and bounded
  pages instead of dumping all tasks into context. `includeNotes: true` returns
  previews, not necessarily full descriptions.
- On resuming work or after compaction, first review the selected backlog and
  list `doing` tasks, following pagination. Call `session_backlog_get` for each
  relevant task before acting; also read relevant blocked or pending tasks when
  needed. Use the current category IDs if the user customized the board.
- Recover objectives, constraints, progress, and the next step from full notes.
  Reconcile them with the latest user request and actual code state; notes can be
  stale. Do not infer completion, duplicate tasks, or change unrelated shared work.
- Before planned compaction or a handoff, save progress, decisions/blockers, and
  the next step for relevant unfinished work. Automatic compaction may happen
  without a chance to write notes, so keep checkpoints current during work.
- Compaction summaries should preserve known relevant task IDs, selected scope,
  and the next step, plus an instruction to reread the backlog. Summaries do not
  replace persisted notes or prove a write succeeded.
- The sidebar shows a bounded pending-task preview, not the complete backlog.
- If tools are unavailable or a write fails, report that limitation rather than
  pretending work was recorded. On a stale-write error, refresh before retrying.

## Destructive operations

Do not remove tasks, purge categories, or discard backlog data without explicit
user authorization. Finishing work normally means moving it to `done`, not
deleting it. Category management must preserve unrelated user work.
