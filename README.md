# KodraDev OpenCode Backlog

A persistent session or project backlog for OpenCode V2 agents and the TUI.

The plugin gives agents tools to manage tasks and adds an interactive backlog to the sidebar and command palette.

Fork of [sachahjkl/opencode-backlog](https://github.com/sachahjkl/opencode-backlog), with SQLite storage and selectable scope.
Package: [kodradev-opencode-backlog on npm](https://www.npmjs.com/package/kodradev-opencode-backlog).

## What It Does

- **Session mode** (default): each session has its own backlog.
- **Project mode**: sessions in the same project share a backlog.
- Live sidebar, task details, notes, and editable categories.
- Read-only history of stored backlogs in the project.
- Bundled `kodradev-backlog` skill and workflow reminder; no manual `AGENTS.md` setup needed.

New backlogs start with **Todo**, **Doing**, **Blocked**, and **Done**. Categories can be renamed, styled, reordered, or removed when empty.

Switch scope with `/backlog-scope`. Switching selects another backlog; it never moves, merges, or deletes tasks.

## Requirements

- OpenCode V2; this fork targets `2.0.23`.
- Node.js 24+ and npm for local development.

This is an early development version, not yet production-verified.

## Install

### Option 1: OpenCode CLI

Install the latest published npm release and add it to your global OpenCode configuration:

```sh
opencode plugin add kodradev-opencode-backlog@latest
```

OpenCode V2 supports npm tags such as `latest`. This package exports both the server plugin and `./tui`, so OpenCode loads the agent tools and sidebar together. No separate TUI installation is needed.

The plugin defaults to session mode. To customize its options, edit the entry created by the command into the object form below; do not add a duplicate entry.

### Option 2: Manual Configuration

Add the package to `~/.config/opencode/opencode.jsonc`, preserving other plugin entries. For installation in one project only, use that project's `opencode.jsonc` instead:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "kodradev-opencode-backlog@latest",
      "options": {
        "defaultMode": "session"
      }
    }
  ]
}
```

| Option | Purpose |
| --- | --- |
| `defaultMode` | `session` (default) gives each session its own backlog; `project` shares a backlog across sessions in the same project. |
| `databasePath` | Optional absolute path to the server's SQLite database; omit it to use the [default storage location](#storage). |

`/backlog-scope` overrides `defaultMode` for one session; **Use configured default** clears that override.

Remove the original `opencode-backlog` plugin entry to avoid duplicate sidebars. The package includes both server and TUI entrypoints. Reopen the TUI after enabling it.

### Updates

`@latest` selects npm's latest published release rather than pinning `0.1.1`. It does not guarantee automatic upgrades: OpenCode can load a cached package and check for updates without installing them. Check or update the globally configured package explicitly:

```sh
opencode plugin check kodradev-opencode-backlog@latest
opencode plugin update kodradev-opencode-backlog@latest
```

Use an exact version instead of `latest` when you need a reproducible, pinned installation. See the [OpenCode V2 plugin guide](https://opencode.ai/v2/docs/plugins) for CLI installation and update behavior.

## Use The Backlog

### Task Categories (Statuses)

A task's `status` is its category ID, not a separate task type. New backlogs include these four sections:

| Section | Status ID | What belongs here |
| --- | --- | --- |
| **Todo** | `todo` | Planned work that has not started. Record the next actionable steps here. |
| **Doing** | `doing` | Work currently being executed. Move a task here before starting and keep its progress notes current. |
| **Blocked** | `blocked` | Unfinished work that cannot continue because of a dependency, missing access, pending decision, or other obstacle. Explain the blocker and what would unblock it in `notes`. |
| **Done** | `done` | Completed work that meets its completion criteria. Record the actual outcome and verification performed; finishing a task does not delete it. |

Typical flow: **Todo → Doing → Done**. If work cannot continue, move it to **Blocked**; once unblocked, return it to **Doing** when resuming or **Todo** if it is waiting to be scheduled. Moving between categories does not execute work or resolve blockers automatically.

Categories are editable through `/session-backlog-categories`: add, rename, style, reorder, or remove an empty category. Renaming a category changes its display title, not its stable ID. Existing backlogs keep their saved categories; if an older backlog has no Blocked section, add one with ID `blocked`.

The plugin also provides styling presets for optional categories; these are not created by default:

| Optional section | Status ID | Suggested use |
| --- | --- | --- |
| **Review** | `review` | Work awaiting review before it can be considered complete. |
| **Waiting** | `waiting` | Work paused until an expected event or response arrives. |
| **Cancelled** | `cancelled` | Work intentionally abandoned, retained for context rather than deleted. |

Custom category IDs are supported too. The pending-task preview excludes IDs `done` and `cancelled`; other categories, including `blocked`, remain pending.

### Sidebar And Dialogs

| Section | What it does |
| --- | --- |
| **Scope indicator** | Shows **Only this session** or **Shared project**. Click it to choose the backlog scope without moving any tasks. |
| **Category groups** | Show up to eight pending tasks in total, grouped by category, with each category's full task count. Empty groups and groups without tasks in the preview are hidden. |
| **More pending / completed links** | Open the full backlog browser. Done tasks remain stored and appear as a completed count rather than individual sidebar entries. |
| **Backlog browser** | `/session-tasks` lists the selected backlog, including completed tasks, with 20 tasks per page. |
| **Task details** | Click a task to see its category, ID, and full notes, and access task actions. |
| **Stored backlogs** | `/session-backlogs` opens read-only history for the current project; it does not change the selected scope. |

The sidebar is a preview, not the full backlog. **No pending tasks** does not mean completed or cancelled tasks have been deleted.

### Agent Requests And Commands

Ask the agent to manage tasks in normal language:

```text
Add a Todo task to document the release process.
Move the release task to Doing.
Move the release task to Blocked and note that it needs registry access.
Move it back to Doing once access is available.
Mark it Done only after the documentation is complete.
```

Click a sidebar task or select **Browse selected backlog** in the command palette to view task details.

| Command | Purpose |
| --- | --- |
| `/session-tasks` | Browse the selected backlog, 20 tasks per page |
| `/session-task-add` | Add a task |
| `/session-task-move` | Change a task's category |
| `/session-backlog-categories` | Manage the selected backlog's categories |
| `/session-backlog-purge` | Purge a category after confirmation |
| `/backlog-scope` | Choose this session's scope or restore the configured default |
| `/session-backlogs` | Read-only history of stored backlogs in this project |

Deleting tasks or purging categories requires explicit user authorization.

### Task Descriptions And Continuity

Agents use an actionable `title` and the existing `notes` field for task context.
Non-trivial tasks require a brief description and a current continuation checkpoint:

```text
Objective: What should change and why.
Scope/constraints: Relevant files and limits.
Completion criteria: What must be true before marking done.
Progress: Completed work and verification actually performed.
Next step: The next concrete action.
Decisions/blockers: Relevant choices or blockers, when present.
```

The bundled workflow requires agents to update notes at meaningful milestones
and before planned compaction or handoffs. After resuming or compacting, agents
must review the selected backlog and read relevant Doing tasks with
`session_backlog_get`. List output omits notes by default; `includeNotes` returns
previews, which are not a substitute for full notes.

A compaction hook reminds the summarizer to preserve known task IDs, scope, and
next steps, and to request backlog recovery on resume. It does not write notes
automatically; automatic compaction can occur before a checkpoint is saved.
These are agent workflow instructions, not schema validation: simple tasks and
manual entries can still omit notes. Existing tasks and storage remain unchanged.

## Agent Tools

Tools use the calling session's selected scope automatically.

| Tool | Purpose |
| --- | --- |
| `session_backlog_list` | List tasks with category/search filters and pagination. |
| `session_backlog_get` | Read one task with full notes. |
| `session_backlog_add` | Add a task. |
| `session_backlog_update` | Edit a task title or notes. |
| `session_backlog_move` | Change a task category or position. |
| `session_backlog_remove` | Permanently remove a task. |
| `session_backlog_category_add` | Add a category with a stable ID, title, color, and icon. |
| `session_backlog_category_update` | Edit a category title, color, or icon. |
| `session_backlog_category_move` | Reorder a category. |
| `session_backlog_category_remove` | Remove an empty category. |
| `session_backlog_category_purge` | Permanently remove all tasks from a category. |

## Storage

Tasks, categories, and scope preferences persist in SQLite on the OpenCode server:

```text
~/.local/share/opencode/kodradev-opencode-backlog/backlog.sqlite
$XDG_DATA_HOME/opencode/kodradev-opencode-backlog/backlog.sqlite   (when XDG_DATA_HOME is set)
```

Set an absolute `databasePath` in plugin options to use another location. The TUI accesses storage through RPC, including when connected to a remote server.

Existing upstream `BACKLOG.json` files are not imported or modified. Backlogs are retained until explicitly cleared; there is no automatic cleanup.

## Development

```sh
npm ci --ignore-scripts
npm run typecheck:src
npm run build
npm run dev
```

The repository-local plugin loads `dist/`; `npm run dev` rebuilds when `src/` or `skills/` changes. Other projects keep using the globally configured npm package.

These commands do not run tests. Upstream tests are preserved but do not validate this fork's SQLite or scope behavior.

## License

MIT. Original attribution is preserved in [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
