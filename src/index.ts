import { createHash, randomUUID } from "node:crypto"
import { basename, resolve } from "node:path"
import { Plugin } from "@opencode/plugin"
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  addCategory,
  moveItem,
  moveCategory,
  purgeCategory,
  removeCategory,
  renameCategory,
  setCategoryColor,
  setCategoryIcon,
  sortByStatus,
  type Backlog,
  type BacklogItem,
} from "./backlog.js"
import {
  optionalNullableString,
  optionalCategoryColor,
  optionalCategoryIcon,
  optionalPosition,
  optionalString,
  optionalStatus,
  record,
  requiredString,
} from "./input.js"
import { LIMITS, pageInteger, SessionStore, type PageOptions, type ScopeMode, type SessionScope } from "./session-store.js"
import { SessionBacklog } from "./session-rpc.js"
import { registerWorkflowSkill } from "./workflow-skill.js"

const runtimes = new WeakMap<Plugin.Context, {
  store: SessionStore
  defaultMode: ScopeMode
  changed: (sessionID: string, boardID: string, revision: number) => Promise<void>
}>()

function runtime(context: Plugin.Context) {
  const value = runtimes.get(context)
  if (!value) throw new Error("Session backlog is not initialized")
  return value
}

function sameDirectory(left: string, right: string): boolean {
  const normalize = (path: string) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path)
  return normalize(left) === normalize(right)
}

async function sessionScope(context: Plugin.Context, sessionID: string): Promise<SessionScope> {
  const session = await context.session.get({ sessionID })
  if (session.projectID !== context.location.project.id || !sameDirectory(session.location.directory, context.location.directory)) {
    throw new Error("This session belongs to a different location")
  }
  const { store, defaultMode } = runtime(context)
  const mode = store.mode(sessionID, defaultMode)
  const projectID = projectKey(context)
  const boardID = mode === "project" ? `project:${projectID}` : `session:${sessionID}`
  return {
    sessionID, boardID, mode, defaultMode, projectID, directory: session.location.directory,
    title: mode === "project" ? `${basename(context.location.project.canonical)} project backlog` : session.title ?? "Untitled session",
  }
}

function projectKey(context: Plugin.Context): string {
  if (context.location.project.id !== "global") return context.location.project.id
  const directory = process.platform === "win32" ? resolve(context.location.directory).toLowerCase() : resolve(context.location.directory)
  return `directory-${createHash("sha256").update(directory).digest("hex")}`
}

function listOptions(input: Record<string, unknown>, activeByDefault = false): PageOptions {
  for (const key of ["includeNotes", "activeOnly"]) {
    if (input[key] !== undefined && typeof input[key] !== "boolean") throw new Error(`${key} must be a boolean`)
  }
  const category = optionalString(input, "category")
  const query = optionalString(input, "query")
  if (query && query.length > LIMITS.title) throw new Error(`query may contain at most ${LIMITS.title} characters`)
  return {
    offset: pageInteger(input.offset, 0, Number.MAX_SAFE_INTEGER),
    limit: pageInteger(input.limit, 20, LIMITS.page),
    ...(category === undefined ? {} : { category }),
    ...(query === undefined ? {} : { query }),
    ...(input.includeNotes === undefined ? {} : { includeNotes: input.includeNotes as boolean }),
    activeOnly: input.activeOnly === undefined ? activeByDefault : input.activeOnly as boolean,
  }
}

const idInput = {
  type: "object",
  properties: { id: { type: "string", minLength: 1 } },
  required: ["id"],
  additionalProperties: false,
} as const

const categoryTitleInput = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    color: { type: "string", enum: CATEGORY_COLORS },
    icon: { type: "string", enum: CATEGORY_ICONS },
  },
  required: ["id"],
  additionalProperties: false,
} as const

async function readForSession(context: Plugin.Context, sessionID: string): Promise<Backlog> {
  const scope = await sessionScope(context, sessionID)
  return runtime(context).store.read(scope.boardID).backlog
}

async function updateForSession(
  context: Plugin.Context,
  sessionID: string,
  update: (backlog: Backlog) => Backlog,
): Promise<Backlog> {
  const scope = await sessionScope(context, sessionID)
  const { store, changed } = runtime(context)
  const snapshot = store.update(scope, update)
  await changed(sessionID, scope.boardID, snapshot.revision)
  return snapshot.backlog
}

function replaceItem(items: readonly BacklogItem[], replacement: BacklogItem): BacklogItem[] {
  if (!items.some((item) => item.id === replacement.id)) {
    throw new Error(`Backlog item ${replacement.id} does not exist`)
  }
  return items.map((item) => (item.id === replacement.id ? replacement : item))
}

function itemLocation(backlog: Backlog, id: string): { item: BacklogItem; position: number } {
  const item = backlog.items.find((candidate) => candidate.id === id)
  if (!item) throw new Error(`Backlog item ${id} does not exist`)
  const position = backlog.items
    .filter((candidate) => candidate.status === item.status)
    .findIndex((candidate) => candidate.id === id)
  return { item, position }
}

export default Plugin.define({
  id: "kodradev.backlog",
  async setup(context) {
    const configuredPath = context.options.databasePath
    if (configuredPath !== undefined && typeof configuredPath !== "string") throw new Error("databasePath must be a string")
    const defaultMode = context.options.defaultMode ?? "session"
    if (defaultMode !== "session" && defaultMode !== "project") throw new Error("defaultMode must be session or project")
    const store = new SessionStore(configuredPath)
    runtimes.set(context, { store, defaultMode, changed: async () => {} })
    try {
      const readBoard = async (values: Record<string, unknown>) => {
        const scope = await sessionScope(context, requiredString(values, "sessionID"))
        const historyBoardID = optionalString(values, "historyBoardID")
        if (historyBoardID !== undefined) {
          if (!store.belongsToProject(historyBoardID, projectKey(context))) throw new Error("This backlog belongs to a different project")
          return historyBoardID
        }
        return scope.boardID
      }
      const registration = await context.rpc.register(SessionBacklog, {
        read: async (input, call) => {
          try {
            return store.read(await readBoard(record(input)))
          } catch (error) { return call.error("failed", error instanceof Error ? error.message : "Could not read the session backlog", {}) }
        },
        list: async (input, call) => {
          try {
            const values = record(input)
            return store.list(await readBoard(values), listOptions(values))
          } catch (error) { return call.error("failed", error instanceof Error ? error.message : "Could not list the session backlog", {}) }
        },
        replace: async (input, call) => {
          try {
            const values = record(input)
            const sessionID = requiredString(values, "sessionID")
            const scope = await sessionScope(context, sessionID)
            if (requiredString(values, "expectedBoardID") !== scope.boardID) throw new Error("The backlog scope changed while this dialog was open. Refresh and try again.")
            const revision = pageInteger(values.revision, 0, Number.MAX_SAFE_INTEGER)
            const snapshot = store.update(scope, () => values.backlog as Backlog, revision)
            await runtime(context).changed(sessionID, scope.boardID, snapshot.revision)
            return snapshot
          } catch (error) { return call.error("failed", error instanceof Error ? error.message : "Could not update the session backlog", {}) }
        },
        sessions: async (input, call) => {
          try {
            const values = record(input)
            return store.sessions(projectKey(context), pageInteger(values.offset, 0, Number.MAX_SAFE_INTEGER), pageInteger(values.limit, 20, LIMITS.page))
          } catch (error) { return call.error("failed", error instanceof Error ? error.message : "Could not list sessions", {}) }
        },
        setMode: async (input, call) => {
          try {
            const values = record(input)
            const sessionID = requiredString(values, "sessionID")
            await sessionScope(context, sessionID)
            const mode = requiredString(values, "mode")
            if (mode !== "session" && mode !== "project" && mode !== "default") throw new Error("Invalid backlog mode")
            store.setMode(sessionID, mode === "default" ? null : mode)
            const scope = await sessionScope(context, sessionID)
            const snapshot = store.read(scope.boardID)
            await runtime(context).changed(sessionID, scope.boardID, snapshot.revision)
            return { mode: scope.mode, defaultMode, boardID: scope.boardID }
          } catch (error) { return call.error("failed", error instanceof Error ? error.message : "Could not change the backlog scope", {}) }
        },
      })
      runtimes.set(context, {
        store,
        defaultMode,
        changed: async (sessionID, boardID, revision) => {
          try { await registration.events.emit("updated", { sessionID, boardID, revision }) }
          catch (error) { console.warn("Session backlog was saved, but its sidebar notification failed", error) }
        },
      })
    await context.tool.transform((tools) => {
      tools.add({
        name: "session_backlog_list",
        description: "List selected backlog before work/resume; reuse existing tasks. Completed (done/cancelled) tasks are hidden by default; counts per category still include them. Pass activeOnly:false only when completed tasks are needed. Paginated, notes omitted or previewed. Use get for full notes. Scope chosen by user.",
        input: {
          type: "object",
          properties: {
            category: { type: "string", minLength: 1, description: "Only tasks in this category ID." },
            query: { type: "string", minLength: 1 },
            offset: { type: "integer", minimum: 0 },
            limit: { type: "integer", minimum: 1, maximum: LIMITS.page },
            includeNotes: { type: "boolean" },
            activeOnly: { type: "boolean", description: "Defaults to true: hide done/cancelled tasks. Set false to include completed tasks." },
          },
          additionalProperties: false,
        },
        options: { codemode: false },
        execute: async (input, toolContext) => {
          const scope = await sessionScope(context, toolContext.sessionID)
          const page = store.list(scope.boardID, listOptions(record(input), true))
          return {
            content: JSON.stringify({ sessionID: toolContext.sessionID, notesArePreviews: record(input).includeNotes === true, ...page }),
          }
        },
      })

      tools.add({
        name: "session_backlog_get",
        description: "Read one task, including its full description and continuation checkpoint in notes, from the selected backlog. Read relevant doing tasks before resuming after compaction and read full notes before replacing partial or unfamiliar content. Other sessions' isolated backlogs cannot be accessed.",
        input: idInput,
        options: { codemode: false },
        execute: async (input, toolContext) => {
          const id = requiredString(record(input), "id")
          const backlog = await readForSession(context, toolContext.sessionID)
          const item = backlog.items.find((candidate) => candidate.id === id)
          if (!item) throw new Error(`Task ${id} does not exist in the selected backlog`)
          return { content: JSON.stringify(item) }
        },
      })

      tools.add({
        name: "session_backlog_add",
        description: "Add a task at a zero-based position within a backlog category. Use an actionable title; non-trivial tasks require notes with objective, scope/constraints, completion criteria, progress, next step, and relevant decisions/blockers. Simple one-step tasks may omit notes.",
        input: {
          type: "object",
          properties: {
            title: { type: "string", minLength: 1, description: "Concise action and target." },
            notes: { type: "string", description: "Task description and continuation checkpoint. Required by workflow for non-trivial work: objective, scope/constraints, completion criteria, progress, next step, and relevant decisions/blockers." },
            status: { type: "string", minLength: 1 },
            position: { type: "integer", minimum: 0 },
          },
          required: ["title"],
          additionalProperties: false,
        },
        options: { codemode: false },
        execute: async (input, toolContext) => {
          const values = record(input)
          const title = requiredString(values, "title")
          const notes = optionalNullableString(values, "notes") ?? undefined
          const position = optionalPosition(values)
          let item: BacklogItem | undefined
          const backlog = await updateForSession(context, toolContext.sessionID, (current) => {
            const firstCategory = current.categories[0]
            if (!firstCategory) throw new Error("The backlog must have at least one category")
            const status = optionalStatus(values, current) ?? firstCategory.id
            item = {
              id: randomUUID(),
              title,
              ...(notes === undefined ? {} : { notes }),
              status,
            }
            return {
              version: 2,
              categories: current.categories,
              items: moveItem([...current.items, item], item.id, status, position, current.categories),
            }
          })
          if (!item) throw new Error("Backlog update did not add an item")
          const location = itemLocation(backlog, item.id)
          return { content: `Added ${item.id} to ${location.item.status} at position ${location.position}.` }
        },
      })

      tools.add({
        name: "session_backlog_update",
        description: "Change a backlog task title or replace its notes. Save progress, decisions/blockers, and next step at milestones and before planned compaction. Preserve relevant objective, constraints, completion criteria, and existing context; read full notes first if needed. Use null notes to remove them.",
        input: {
          type: "object",
          properties: {
            id: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 1, description: "Concise action and target." },
            notes: { type: ["string", "null"], description: "Complete replacement description/checkpoint, not an append. Preserve relevant context and update actual progress and next step. Null removes notes." },
          },
          required: ["id"],
          additionalProperties: false,
        },
        options: { codemode: false },
        execute: async (input, toolContext) => {
          const values = record(input)
          const id = requiredString(values, "id")
          const title = values.title === undefined ? undefined : requiredString(values, "title")
          const notes = optionalNullableString(values, "notes")
          if (title === undefined && notes === undefined) {
            throw new Error("session_backlog_update requires a title or notes change")
          }
          await updateForSession(context, toolContext.sessionID, (current) => {
            const item = current.items.find((candidate) => candidate.id === id)
            if (!item) throw new Error(`Backlog item ${id} does not exist`)
            const { notes: _currentNotes, ...itemWithoutNotes } = item
            const replacement: BacklogItem = {
              ...(notes === null ? itemWithoutNotes : item),
              ...(title === undefined ? {} : { title }),
              ...(notes === undefined || notes === null ? {} : { notes }),
            }
            return {
              version: 2,
              categories: current.categories,
              items: sortByStatus(replaceItem(current.items, replacement), current.categories),
            }
          })
          return { content: `Updated ${id}.` }
        },
      })

      tools.add({
        name: "session_backlog_move",
        description: "Change a task category or its zero-based position within that category.",
        input: {
          type: "object",
          properties: {
            id: { type: "string", minLength: 1 },
            status: { type: "string", minLength: 1 },
            position: { type: "integer", minimum: 0 },
          },
          required: ["id"],
          additionalProperties: false,
        },
        options: { codemode: false },
        execute: async (input, toolContext) => {
          const values = record(input)
          const id = requiredString(values, "id")
          const position = optionalPosition(values)
          const backlog = await updateForSession(context, toolContext.sessionID, (current) => {
            const status = optionalStatus(values, current)
            if (status === undefined && position === undefined) {
              throw new Error("session_backlog_move requires a status or position change")
            }
            return {
              version: 2,
              categories: current.categories,
              items: moveItem(current.items, id, status, position, current.categories),
            }
          })
          const location = itemLocation(backlog, id)
          return { content: `Moved ${id} to ${location.item.status} at position ${location.position}.` }
        },
      })

      tools.add({
        name: "session_backlog_remove",
        description: "Permanently remove a task from the selected backlog. Requires explicit user authorization.",
        input: idInput,
        options: { codemode: false },
        execute: async (input, toolContext) => {
          const id = requiredString(record(input), "id")
          await updateForSession(context, toolContext.sessionID, (current) => {
            if (!current.items.some((item) => item.id === id)) {
              throw new Error(`Backlog item ${id} does not exist`)
            }
            return {
              version: 2,
              categories: current.categories,
              items: current.items.filter((item) => item.id !== id),
            }
          })
          return { content: `Removed ${id}.` }
        },
      })

      tools.add({
        name: "session_backlog_category_add",
        description: "Add a backlog category with a unique ID, title, and optional zero-based position.",
        input: {
          type: "object",
          properties: {
            id: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 1 },
            color: { type: "string", enum: CATEGORY_COLORS },
            icon: { type: "string", enum: CATEGORY_ICONS },
            position: { type: "integer", minimum: 0 },
          },
          required: ["id", "title"],
          additionalProperties: false,
        },
        options: { codemode: false },
        execute: async (input, toolContext) => {
          const values = record(input)
          const id = requiredString(values, "id")
          const title = requiredString(values, "title")
          const color = optionalCategoryColor(values)
          const icon = optionalCategoryIcon(values)
          const position = optionalPosition(values)
          const backlog = await updateForSession(context, toolContext.sessionID, (current) =>
            addCategory(current, {
              id,
              title,
              ...(color === undefined ? {} : { color }),
              ...(icon === undefined ? {} : { icon }),
            }, position),
          )
          const categoryPosition = backlog.categories.findIndex((category) => category.id === id)
          return { content: `Added category ${id} at position ${categoryPosition}.` }
        },
      })

      tools.add({
        name: "session_backlog_category_update",
        description: "Change a backlog category title, color, or icon.",
        input: categoryTitleInput,
        options: { codemode: false },
        execute: async (input, toolContext) => {
          const values = record(input)
          const id = requiredString(values, "id")
          const title = values.title === undefined ? undefined : requiredString(values, "title")
          const color = optionalCategoryColor(values)
          const icon = optionalCategoryIcon(values)
          if (title === undefined && color === undefined && icon === undefined) {
            throw new Error("session_backlog_category_update requires a title, color, or icon change")
          }
          await updateForSession(context, toolContext.sessionID, (current) => {
            const renamed = title === undefined ? current : renameCategory(current, id, title)
            const colored = color === undefined ? renamed : setCategoryColor(renamed, id, color)
            return icon === undefined ? colored : setCategoryIcon(colored, id, icon)
          })
          return { content: `Updated category ${id}.` }
        },
      })

      tools.add({
        name: "session_backlog_category_move",
        description: "Move a backlog category to a zero-based position.",
        input: {
          type: "object",
          properties: {
            id: { type: "string", minLength: 1 },
            position: { type: "integer", minimum: 0 },
          },
          required: ["id", "position"],
          additionalProperties: false,
        },
        options: { codemode: false },
        execute: async (input, toolContext) => {
          const values = record(input)
          const id = requiredString(values, "id")
          const position = optionalPosition(values)
          if (position === undefined) throw new Error("position is required")
          const backlog = await updateForSession(context, toolContext.sessionID, (current) =>
            moveCategory(current, id, position),
          )
          const categoryPosition = backlog.categories.findIndex((category) => category.id === id)
          return { content: `Moved category ${id} to position ${categoryPosition}.` }
        },
      })

      tools.add({
        name: "session_backlog_category_remove",
        description: "Remove an empty backlog category.",
        input: idInput,
        options: { codemode: false },
        execute: async (input, toolContext) => {
          const id = requiredString(record(input), "id")
          await updateForSession(context, toolContext.sessionID, (current) =>
            removeCategory(current, id),
          )
          return { content: `Removed category ${id}.` }
        },
      })

      tools.add({
        name: "session_backlog_category_purge",
        description: "Permanently remove all tasks in a backlog category while retaining the category.",
        input: idInput,
        options: { codemode: false },
        execute: async (input, toolContext) => {
          const id = requiredString(record(input), "id")
          let count = 0
          await updateForSession(context, toolContext.sessionID, (current) => {
            count = current.items.filter((item) => item.status === id).length
            return purgeCategory(current, id)
          })
          return { content: `Purged ${count} ${count === 1 ? "task" : "tasks"} from category ${id}.` }
        },
      })
    })
      await registerWorkflowSkill(context)
      return () => { runtimes.delete(context); store.close() }
    } catch (error) {
      runtimes.delete(context)
      store.close()
      throw error
    }
  },
})
