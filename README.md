# KodraDev OpenCode Backlog

Hybrid SQLite-backed fork of [sachahjkl/opencode-backlog](https://github.com/sachahjkl/opencode-backlog).
Repository: [KodraDev/opencode-backlog](https://github.com/KodraDev/opencode-backlog).
Package: `kodradev-opencode-backlog`. See [NOTICE.md](NOTICE.md) and the preserved MIT [LICENSE](LICENSE).

The upstream categories, ordering, task dialogs, keyboard actions, and sidebar
are retained. Storage and scope resolution are different:

- **Session mode:** each OpenCode session has an independent TODO list.
- **Project mode:** sessions in the same project use a shared backlog.
- A configurable default applies when a session has no saved override.
- The user can override the mode for one session using `/backlog-scope`.
- Switching modes selects another backlog. It never moves or merges tasks.
- Subagents are independent sessions by default; they do not inherit a parent's
  override. With a project default, they share the project's backlog.

## Status

This is an initial development version, not a production-verified plugin.
The package is not published to npm. The original installed plugin is not replaced automatically.
The fork targets OpenCode `2.0.23` and its native V2 plugin API.

## Build

```sh
npm ci --ignore-scripts
npm run typecheck:src
npm run build
```

These commands compile production sources only; they do not run tests.
Node.js 24+ is needed for development. The server uses OpenCode's Bun runtime
and its built-in `bun:sqlite` driver; no native SQLite addon is installed.

The lockfile pins patched Seroval and brace-expansion resolutions. The last npm
production dependency audit still reported three low-severity advisories and no
high/critical advisories. This is not a security audit of the plugin or its host.

Upstream test files and testing configuration are preserved unchanged. They
still describe the original plugin and need an explicitly authorized update
before they can validate this fork. Do not treat the upstream suite as proof
that the new SQLite or hybrid behavior works.

## Enable when ready

Add the local package directory to the global OpenCode configuration. Preserve
other plugin entries. On Windows, forward slashes work in JSON paths:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "C:/Users/Joaku/Desktop/Dev/personal/opencode-plugins",
      "options": {
        "defaultMode": "session"
      }
    }
  ]
}
```

`defaultMode` accepts `session` (the default) or `project`. `/backlog-scope`
offers both modes and **Use configured default**, which clears that session's
override. Changing the configured default affects sessions without overrides.

The package exports `./tui`, so OpenCode can load its TUI entrypoint alongside
the server. Reopen the TUI after enabling it. This fork has separate plugin IDs,
tool names, and commands; it can coexist with the upstream plugin during
development, but that produces two sidebar sections and two independent stores.

After enabling this fork, update agent instructions to use `session_backlog_*`
instead of the original `backlog_*` tools. Configuration alone does not make
agents follow a mandatory TODO workflow. A suggested rule is:

```md
Use session_backlog_* for every task that requires actions. Review the selected
backlog first, reuse relevant tasks, and track todo → doing → done accurately.
Use blocked with explanatory notes when work cannot continue. Respect the
user-selected scope; do not change it or delete tasks without authorization.
Purely informational questions do not require tasks.
```

## Commands

| Command | Purpose |
| --- | --- |
| `/session-tasks` | Browse the selected backlog, 20 tasks per page |
| `/session-task-add` | Add a task |
| `/session-task-move` | Change a task's category |
| `/session-backlog-categories` | Manage the selected backlog's categories |
| `/session-backlog-purge` | Purge a category after confirmation |
| `/backlog-scope` | Choose this session's scope or restore the configured default |
| `/session-backlogs` | Read-only history of stored backlogs in this project |

The sidebar shows up to eight pending tasks, counts, and a compact completed
summary. Full notes load only when a task is opened. Loading, empty, and error
states are distinct. RPC events refresh it; a 15-second refresh recovers from
missed events or another OpenCode server writing to the same database.

Status colors use the active OpenCode theme: Todo uses info (usually blue),
Doing uses warning (usually amber), Blocked uses error (usually red), and Done
uses success (usually green). Headers, icons, task rows, task-detail status,
and the completed summary share the same category color. Labels and icons remain
visible so status is not conveyed by color alone. Scope and action links use
info; destructive actions use error.

Existing category colors are preserved. Customize a category's color with
`/session-backlog-categories`; the Todo color above applies to newly created
backlogs, not an automatic recoloring of existing data. Subdued task titles use
the normal text color for readability while their headers and icons stay muted.

## Agent tools

The tools resolve the calling session automatically. They never accept an
arbitrary session or project ID from the agent.

- `session_backlog_list`: category/search filters, `offset`, `limit` (1–50),
  `activeOnly`, and optional note previews. The default page size is 20.
- `session_backlog_get`: one task with its full notes.
- `session_backlog_add`, `session_backlog_update`, `session_backlog_move`,
  `session_backlog_remove`.
- `session_backlog_category_add`, `session_backlog_category_update`,
  `session_backlog_category_move`, `session_backlog_category_remove`,
  `session_backlog_category_purge`.

List responses identify their `mode` and `boardID`. In session mode, another
session's isolated tasks are inaccessible through these tools. In project mode,
sharing is intentional. Removing tasks and purging categories are destructive;
agent instructions must require explicit authorization.

## SQLite and size management

One database holds normalized backlogs, categories, tasks, and per-session mode
preferences. Defaults:

```text
~/.local/share/opencode/kodradev-opencode-backlog/backlog.sqlite
$XDG_DATA_HOME/opencode/kodradev-opencode-backlog/backlog.sqlite   (when XDG_DATA_HOME is set)
```

An optional absolute `databasePath` in server plugin options overrides this.
The TUI talks to the server over RPC and never opens a local database, so it can
work against an authenticated remote OpenCode service.

- Session backlog keys derive from the real OpenCode session ID.
- Project backlog keys use the OpenCode project ID. Non-Git locations use a
  normalized-directory hash so unrelated non-Git directories do not share one
  global backlog. Git worktrees belonging to the same project share its backlog.
- Writes use SQLite transactions, foreign keys, WAL, a busy timeout, and schema
  versioning. A failed write rolls back as a whole.
- Dialog writes require the same backlog identity and revision they loaded.
  Concurrent edits or scope changes reject stale writes rather than overwriting
  another agent's work.
- Each backlog is limited to 1,000 tasks and 32 categories. Titles are limited
  to 240 characters and notes to 16 KiB of UTF-8 data per task.
- List output omits notes by default; optional previews are at most 512
  characters. Full notes are available through `session_backlog_get`.
- No conversations, attachments, or unbounded mutation history are stored.

These limits bound individual backlogs and responses, **not total disk usage**:
retained backlogs accumulate. There is no automatic deletion, retention policy,
or archival/compaction command in this first version. WAL checkpoints do not
remove retained tasks or reclaim all previously allocated database pages.
Explicit export, archival, disk statistics, and maintenance are future work.

Existing `BACKLOG.json` files are neither imported nor modified. The original
JSON store implementation remains as upstream reference code; neither the fork
server nor its TUI uses it.

## Development boundaries

- `origin` points to KodraDev/opencode-backlog; `upstream` points to sachahjkl/opencode-backlog.
- No global OpenCode configuration or installed upstream plugin is changed by building.
- Keep attribution. Do not push this variant to upstream accidentally.
- Functional SQLite/RPC validation and visual TUI validation remain necessary
  before treating this development version as production-ready.
