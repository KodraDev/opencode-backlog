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

Add the package to `~/.config/opencode/opencode.jsonc`, preserving other plugin entries:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "kodradev-opencode-backlog@0.1.1",
      "options": {
        "defaultMode": "session"
      }
    }
  ]
}
```

Set `defaultMode` to `project` for a shared backlog. `/backlog-scope` overrides it for one session; **Use configured default** clears that override.

Remove the original `opencode-backlog` plugin entry to avoid duplicate sidebars. The package includes both server and TUI entrypoints. Reopen the TUI after enabling it.

## Use The Backlog

Ask the agent to manage tasks in normal language:

```text
Add a Todo task to document the release process.
Move the release task to Doing.
Add notes explaining what remains blocked.
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
