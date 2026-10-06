import { randomUUID } from "node:crypto"
import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import {
  addCategory,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_PRESETS,
  moveItem,
  moveCategory,
  purgeCategory,
  removeCategory,
  renameCategory,
  setCategoryColor,
  setCategoryIcon,
  type Backlog,
  type BacklogItem,
  type Category,
  type CategoryColor,
  type CategoryIcon,
  type Status,
} from "./backlog.js"
import { cleanStorage, listBacklog, listSessions, readBacklog, readSettings, readStorage, saveSettings, sessionAccess, updateBacklog, type BacklogAccess, type SettingsAccess } from "./ui-client.js"
import { SessionBacklog } from "./session-rpc.js"
import type { BacklogPage } from "./session-store.js"
import { LIGHTWEIGHT_NOTES_MAX, parseLightweightNotes, parseRetentionDays, type BacklogSettings, type SettingsScope, type TaskDetail } from "./settings.js"

const pinned = new WeakMap<Plugin.Context, BacklogAccess>()

function pinContext(context: Plugin.Context, access: BacklogAccess): Plugin.Context {
  // Keep live theme/location getters while capturing only the backlog access.
  const copy = Object.defineProperties({}, Object.getOwnPropertyDescriptors(context)) as Plugin.Context
  pinned.set(copy, access)
  return copy
}

type BrowseAction = "details" | "status" | "edit" | "delete"

function categoryTitle(categories: readonly Category[], status: Status): string {
  return categories.find((category) => category.id === status)?.title ?? status
}

function categoryColorName(category: Category): CategoryColor {
  return category.color ?? CATEGORY_PRESETS[category.id]?.color ?? "info"
}

function categoryColor(context: Plugin.Context, category: Category) {
  const name = categoryColorName(category)
  if (name === "default") return context.theme.text.base
  if (name === "subdued") return context.theme.text.muted
  return context.theme.text.feedback[name].base
}

function categoryIconName(category: Category): CategoryIcon {
  return category.icon ?? CATEGORY_PRESETS[category.id]?.icon ?? "circle"
}

function categoryIcon(category: Category): string {
  const icon = categoryIconName(category)
  if (icon === "circle") return "○"
  if (icon === "dot") return "●"
  if (icon === "check") return "✓"
  if (icon === "cross") return "×"
  if (icon === "pause") return "‖"
  if (icon === "diamond") return "◆"
  return ""
}

function BacklogView(props: { context: Plugin.Context; sessionID: string }) {
  const theme = () => props.context.theme
  const client = props.context.client.rpc(SessionBacklog)
  const controller = new AbortController()
  const [snapshot, { refetch }] = createResource(() => props.sessionID, async (sessionID): Promise<{ page?: BacklogPage; error?: string }> => {
    try {
      return { page: await listBacklog(sessionAccess(props.context, sessionID), { activeOnly: true, limit: 8 }, controller.signal) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : String(cause) }
    }
  })
  const page = () => snapshot()?.page
  const unsubscribe = client.events.on("updated", (event) => {
    if (event.data.sessionID === props.sessionID || event.data.boardID === snapshot.latest?.page?.boardID) void refetch()
  }, { signal: controller.signal })
  const unsubscribeSettings = client.events.on("settingsUpdated", () => { void refetch() }, { signal: controller.signal })
  const unsubscribeStorage = client.events.on("storageUpdated", () => { void refetch() }, { signal: controller.signal })
  const timer = setInterval(() => { void refetch() }, 15_000)
  onCleanup(() => { clearInterval(timer); controller.abort(); unsubscribe(); unsubscribeSettings(); unsubscribeStorage() })
  const error = () => snapshot()?.error
  const open = async (item: BacklogItem) => {
    try {
      const access = sessionAccess(props.context, props.sessionID)
      const backlog = await readBacklog(access)
      const current = backlog.items.find((candidate) => candidate.id === item.id)
      if (!current) throw new Error("This task no longer exists")
      showTaskDetails(pinContext(props.context, access), current, backlog.categories)
    } catch (cause) {
      props.context.ui.toast.show({ message: cause instanceof Error ? cause.message : String(cause), variant: "error" })
    }
  }
  const perform = async (operation: (context: Plugin.Context) => Promise<void>) => {
    try {
      await operation(pinContext(props.context, sessionAccess(props.context, props.sessionID)))
    } catch (cause) {
      props.context.ui.toast.show({ message: cause instanceof Error ? cause.message : String(cause), variant: "error" })
    }
  }

  return (
    <box>
      <box flexDirection="row" justifyContent="space-between" gap={1}>
        <text fg={theme().text.base}><b>Backlog</b></text>
        <text fg={theme().text.action.primary.base} onMouseUp={() => perform(manageSettings)}>Settings</text>
      </box>
      <Show when={page()}>
        <text fg={theme().text.action.primary.base} onMouseUp={() => perform(chooseScope)}>
          {page()?.mode === "project" ? "Shared project" : "Only this session"} · change scope
        </text>
      </Show>
      <Show when={snapshot.loading && !page()}><text fg={theme().text.muted}>Loading tasks…</text></Show>
      <Show when={error()}>
        {(message) => <text fg={theme().text.feedback.error.base}>{message()}</text>}
      </Show>
      <Show when={!error() && page()?.total === 0}>
        <text fg={theme().text.muted}>No pending tasks</text>
      </Show>
      <For each={page()?.categories.filter((category) => page()?.items.some((item) => item.status === category.id)) ?? []}>
        {(category) => {
          const items = createMemo(() => page()?.items.filter((item) => item.status === category.id) ?? [])
          const color = () => categoryColor(props.context, category)
          return (
            <box marginTop={1}>
              <text fg={color()}>
                <b>{category.title}</b> ({page()?.counts[category.id] ?? 0})
              </text>
              <For each={items()}>
                {(item) => (
                  <box
                    flexDirection="row"
                    gap={1}
                    minWidth={0}
                    onMouseUp={() => open(item)}
                  >
                    <Show when={categoryIcon(category)}>
                      {(icon) => <text fg={color()} flexShrink={0}>{icon()}</text>}
                    </Show>
                    <text fg={categoryColorName(category) === "subdued" ? theme().text.base : color()} wrapMode="none" truncate flexGrow={1} minWidth={0}>
                      {item.title}
                    </text>
                  </box>
                )}
              </For>
            </box>
          )
        }}
      </For>
      <Show when={(page()?.total ?? 0) > 8}>
        <text fg={theme().text.action.primary.base} onMouseUp={() => perform(browseBacklog)}>
          +{(page()?.total ?? 0) - 8} pending · /session-tasks
        </text>
      </Show>
      <Show when={(page()?.counts.done ?? 0) > 0}>
        <text
          fg={categoryColor(props.context, page()?.categories.find(({ id }) => id === "done") ?? { id: "done", title: "Done" })}
          onMouseUp={() => perform(browseBacklog)}
        >
          ✓ {page()?.counts.done} completed · /session-tasks
        </text>
      </Show>
    </box>
  )
}

function taskDetails(item: BacklogItem, categories: readonly Category[]): string {
  return [`Category: ${categoryTitle(categories, item.status)}`, `ID: ${item.id}`, "", item.notes ?? "No notes"].join("\n")
}

function TaskAction(props: {
  context: Plugin.Context
  shortcut: string
  label: string
  danger?: boolean
  run: () => void
}) {
  return (
    <text
      fg={props.danger ? props.context.theme.text.action.destructive.base : props.context.theme.text.action.primary.base}
      onMouseUp={props.run}
    >
      <b>{props.shortcut}</b> {props.label}
    </text>
  )
}

function TaskDetailsDialog(props: { context: Plugin.Context; item: BacklogItem; categories: readonly Category[] }) {
  const category = () => props.categories.find(({ id }) => id === props.item.status) ?? { id: props.item.status, title: props.item.status }
  const run = (operation: () => Promise<void>) => {
    props.context.ui.dialog.clear()
    void operation().catch((cause) =>
      props.context.ui.toast.show({
        message: cause instanceof Error ? cause.message : String(cause),
        variant: "error",
      }),
    )
  }
  const changeStatus = () => run(() => changeTaskStatus(props.context, props.item))
  const edit = () => run(() => editBacklogItem(props.context, props.item))
  const remove = () => run(() => removeBacklogItem(props.context, props.item))

  onMount(() => props.context.ui.dialog.set({ size: "medium" }))
  props.context.keymap.layer(() => ({
    mode: "modal",
    priority: 100,
    commands: [
      { bind: "c", title: "Change backlog task status", group: "Backlog", run: changeStatus },
      { bind: "e", title: "Edit backlog task", group: "Backlog", run: edit },
      { bind: "d", title: "Delete backlog task", group: "Backlog", run: remove },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between" gap={2}>
        <text fg={props.context.theme.text.base} wrapMode="word" flexGrow={1}>
          <b>{props.item.title}</b>
        </text>
        <text fg={props.context.theme.text.muted} onMouseUp={() => props.context.ui.dialog.clear()}>
          esc
        </text>
      </box>
      <text fg={categoryColor(props.context, category())}>
        {categoryIcon(category())} <b>{category().title}</b>
      </text>
      <text fg={props.context.theme.text.muted} wrapMode="word">
        ID: {props.item.id}
      </text>
      <text fg={props.context.theme.text.base} wrapMode="word">
        {props.item.notes ?? "No notes"}
      </text>
      <box flexDirection="row" justifyContent="flex-end" gap={2} paddingBottom={1}>
        <TaskAction context={props.context} shortcut="c" label="status" run={changeStatus} />
        <TaskAction context={props.context} shortcut="e" label="edit" run={edit} />
        <TaskAction context={props.context} shortcut="d" label="delete" danger run={remove} />
      </box>
    </box>
  )
}

function showTaskDetails(context: Plugin.Context, item: BacklogItem, categories: readonly Category[]): void {
  context.ui.dialog.show(() => <TaskDetailsDialog context={context} item={item} categories={categories} />)
}

async function browseBacklog(context: Plugin.Context): Promise<void> {
  return browseBacklogWithState(context, () => {})
}

function backlogLocation(context: Plugin.Context): { directory: string; path: BacklogAccess } {
  const captured = pinned.get(context)
  if (captured) return { directory: captured.directory, path: captured }
  const route = context.ui.router.current()
  if (route.type !== "session") throw new Error("Open a session before using Backlog")
  const path = sessionAccess(context, route.sessionID)
  return { directory: path.directory, path }
}

async function addBacklogItem(context: Plugin.Context): Promise<void> {
  const { path } = backlogLocation(context)
  const settings = (await readSettings(path)).project.settings
  const title = await context.ui.dialog.prompt({
    title: "New backlog task",
    placeholder: "Task title",
  })
  if (!title?.trim()) return

  let notes = ""
  while (true) {
    const value = await context.ui.dialog.prompt({
      title: title.trim(),
      description: settings.taskDetail === "lightweight" ? `Short description · required, max ${LIGHTWEIGHT_NOTES_MAX} characters` : "Optional brief context",
      placeholder: settings.taskDetail === "lightweight" ? "One short sentence explaining the task" : "Leave empty for no notes",
      value: notes,
    })
    if (value === undefined) return
    notes = value.trim()
    try {
      if (settings.taskDetail === "lightweight") notes = parseLightweightNotes(notes)
      break
    } catch (cause) {
      context.ui.toast.show({ message: cause instanceof Error ? cause.message : String(cause), variant: "error" })
    }
  }

  let item: BacklogItem | undefined
  await updateBacklog(path, (current) => {
    const firstCategory = current.categories[0]
    if (!firstCategory) throw new Error("Add a backlog category before adding a task")
    item = {
      id: randomUUID(),
      title: title.trim(),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      status: firstCategory.id,
    }
    return {
      ...current,
      items: moveItem([...current.items, item], item.id, firstCategory.id, 0, current.categories),
    }
  })
  if (!item) throw new Error("Backlog update did not add a task")
  context.ui.toast.show({ message: `Added "${item.title}".`, variant: "success" })
}

async function changeTaskStatus(context: Plugin.Context, item: BacklogItem): Promise<void> {
  const { path } = backlogLocation(context)
  const backlog = await readBacklog(path)
  const status = await context.ui.dialog.select<Status>({
    title: `Change category: ${item.title}`,
    current: item.status,
    options: backlog.categories.map((category) => ({
      title: category.title,
      value: category.id,
      ...(category.id === item.status ? { description: "Current category" } : {}),
    })),
  })
  if (!status || status === item.status) return

  await updateBacklog(path, (current) => ({
    ...current,
    items: moveItem(current.items, item.id, status, undefined, current.categories),
  }))
  context.ui.toast.show({ message: `Moved "${item.title}" to ${categoryTitle(backlog.categories, status)}.`, variant: "success" })
}

async function editBacklogItem(context: Plugin.Context, item: BacklogItem): Promise<void> {
  const title = await context.ui.dialog.prompt({
    title: "Edit backlog task",
    placeholder: "Task title",
    value: item.title,
  })
  if (!title?.trim()) return

  const notes = await context.ui.dialog.prompt({
    title: title.trim(),
    description: "Optional notes",
    placeholder: "Leave empty for no notes",
    value: item.notes ?? "",
  })
  if (notes === undefined) return

  const { path } = backlogLocation(context)
  await updateBacklog(path, (current) => ({
    ...current,
    items: current.items.map((candidate) => {
      if (candidate.id !== item.id) return candidate
      return {
        id: candidate.id,
        title: title.trim(),
        status: candidate.status,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }
    }),
  }))
  context.ui.toast.show({ message: `Updated "${title.trim()}".`, variant: "success" })
}

async function removeBacklogItem(context: Plugin.Context, item: BacklogItem): Promise<void> {
  const confirmed = await context.ui.dialog.confirm({
    title: "Delete backlog task",
    message: item.title,
    label: { confirm: "Delete", cancel: "Cancel" },
  })
  if (!confirmed) return

  const { path } = backlogLocation(context)
  await updateBacklog(path, (current) => ({
    ...current,
    items: current.items.filter((candidate) => candidate.id !== item.id),
  }))
  context.ui.toast.show({ message: `Deleted "${item.title}".`, variant: "success" })
}

async function purgeConfirmedCategory(path: BacklogAccess, status: Status, confirmedIDs: readonly string[]): Promise<void> {
  await updateBacklog(path, (current) => {
    const currentIDs = current.items.filter((item) => item.status === status).map((item) => item.id)
    const changed = currentIDs.length !== confirmedIDs.length || currentIDs.some((id) => !confirmedIDs.includes(id))
    if (changed) throw new Error("The category changed. Review its tasks and confirm the purge again.")
    return purgeCategory(current, status)
  })
}

async function purgeBacklogCategory(context: Plugin.Context): Promise<void> {
  const { path } = backlogLocation(context)
  const backlog = await readBacklog(path)
  const status = await context.ui.dialog.select<Status>({
    title: "Purge backlog category",
    placeholder: "Select a category",
    options: backlog.categories.map((category) => {
      const count = backlog.items.filter((item) => item.status === category.id).length
      return {
        title: category.title,
        value: category.id,
        description: `${count} ${count === 1 ? "task" : "tasks"}`,
      }
    }),
  })
  if (!status) return

  const category = backlog.categories.find((candidate) => candidate.id === status)
  if (!category) return
  const taskIDs = backlog.items.filter((item) => item.status === status).map((item) => item.id)
  const count = taskIDs.length
  const confirmed = await context.ui.dialog.confirm({
    title: `Purge ${category.title}`,
    message: `Permanently delete ${count} ${count === 1 ? "task" : "tasks"} from this category?`,
    label: { confirm: "Purge", cancel: "Cancel" },
  })
  if (!confirmed) return

  await purgeConfirmedCategory(path, status, taskIDs)
  context.ui.toast.show({
    message: `Purged ${count} ${count === 1 ? "task" : "tasks"} from ${category.title}.`,
    variant: "success",
  })
}

async function addBacklogCategory(context: Plugin.Context): Promise<void> {
  const title = await context.ui.dialog.prompt({
    title: "New backlog category",
    placeholder: "Category title",
  })
  if (!title?.trim()) return

  const suggestedID = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  const id = await context.ui.dialog.prompt({
    title: title.trim(),
    description: "Stable category ID",
    placeholder: "Category ID",
    value: suggestedID,
  })
  if (!id?.trim()) return
  const preset = CATEGORY_PRESETS[id.trim()]

  const color = await context.ui.dialog.select<CategoryColor>({
    title: title.trim(),
    placeholder: "Category color",
    current: preset?.color ?? "info",
    options: CATEGORY_COLORS.map((value) => ({ title: value, value })),
  })
  if (!color) return

  const icon = await context.ui.dialog.select<CategoryIcon>({
    title: title.trim(),
    placeholder: "Category icon",
    current: preset?.icon ?? "circle",
    options: CATEGORY_ICONS.map((value) => ({
      title: `${categoryIcon({ id: "", title: "", icon: value }) || " "} ${value}`,
      value,
    })),
  })
  if (!icon) return

  const category: Category = { id: id.trim(), title: title.trim(), color, icon }
  const { path } = backlogLocation(context)
  await updateBacklog(path, (current) => addCategory(current, category))
  context.ui.toast.show({ message: `Added category "${category.title}".`, variant: "success" })
}

async function renameBacklogCategory(context: Plugin.Context, category: Category): Promise<void> {
  const title = await context.ui.dialog.prompt({
    title: "Rename backlog category",
    placeholder: "Category title",
    value: category.title,
  })
  if (!title?.trim() || title.trim() === category.title) return

  const { path } = backlogLocation(context)
  await updateBacklog(path, (current) => renameCategory(current, category.id, title.trim()))
  context.ui.toast.show({ message: `Renamed category to "${title.trim()}".`, variant: "success" })
}

async function colorBacklogCategory(context: Plugin.Context, category: Category): Promise<void> {
  const color = await context.ui.dialog.select<CategoryColor>({
    title: `Color: ${category.title}`,
    placeholder: "Category color",
    current: categoryColorName(category),
    options: CATEGORY_COLORS.map((value) => ({ title: value, value })),
  })
  if (!color || color === categoryColorName(category)) return

  const { path } = backlogLocation(context)
  await updateBacklog(path, (current) => setCategoryColor(current, category.id, color))
  context.ui.toast.show({ message: `Updated color for "${category.title}".`, variant: "success" })
}

async function iconBacklogCategory(context: Plugin.Context, category: Category): Promise<void> {
  const icon = await context.ui.dialog.select<CategoryIcon>({
    title: `Icon: ${category.title}`,
    placeholder: "Category icon",
    current: categoryIconName(category),
    options: CATEGORY_ICONS.map((value) => ({
      title: `${categoryIcon({ id: "", title: "", icon: value }) || " "} ${value}`,
      value,
    })),
  })
  if (!icon || icon === categoryIconName(category)) return

  const { path } = backlogLocation(context)
  await updateBacklog(path, (current) => setCategoryIcon(current, category.id, icon))
  context.ui.toast.show({ message: `Updated icon for "${category.title}".`, variant: "success" })
}

async function moveBacklogCategory(context: Plugin.Context, category: Category): Promise<void> {
  const { path } = backlogLocation(context)
  const backlog = await readBacklog(path)
  const position = await context.ui.dialog.select<number>({
    title: `Move ${category.title}`,
    placeholder: "Select a position",
    options: backlog.categories.map((candidate, index) => ({
      title: `${index + 1}. ${candidate.title}`,
      value: index,
      ...(candidate.id === category.id ? { description: "Current position" } : {}),
    })),
  })
  if (position === undefined || backlog.categories[position]?.id === category.id) return

  await updateBacklog(path, (current) => moveCategory(current, category.id, position))
  context.ui.toast.show({ message: `Moved category "${category.title}".`, variant: "success" })
}

async function deleteBacklogCategory(context: Plugin.Context, category: Category): Promise<void> {
  const confirmed = await context.ui.dialog.confirm({
    title: "Delete backlog category",
    message: category.title,
    label: { confirm: "Delete", cancel: "Cancel" },
  })
  if (!confirmed) return

  const { path } = backlogLocation(context)
  await updateBacklog(path, (current) => removeCategory(current, category.id))
  context.ui.toast.show({ message: `Deleted category "${category.title}".`, variant: "success" })
}

async function manageBacklogCategories(context: Plugin.Context): Promise<void> {
  const { path } = backlogLocation(context)
  const backlog = await readBacklog(path)
  let addSelection = `__add:${randomUUID()}`
  while (backlog.categories.some((category) => category.id === addSelection)) {
    addSelection = `__add:${randomUUID()}`
  }
  const selection = await context.ui.dialog.select({
    title: "Backlog categories",
    placeholder: "Add or select a category",
    options: [
      { title: "Add category", value: addSelection },
      ...backlog.categories.map((category) => ({
        title: category.title,
        value: category.id,
        description: `${category.id} - ${backlog.items.filter((item) => item.status === category.id).length} tasks`,
      })),
    ],
  })
  if (!selection) return
  if (selection === addSelection) return addBacklogCategory(context)

  const category = backlog.categories.find((candidate) => candidate.id === selection)
  if (!category) return
  const taskIDs = backlog.items.filter((item) => item.status === category.id).map((item) => item.id)
  const count = taskIDs.length
  const action = await context.ui.dialog.select<"rename" | "color" | "icon" | "move" | "purge" | "delete">({
    title: category.title,
    placeholder: "Select an action",
    options: [
      { title: "Rename", value: "rename" },
      { title: "Change color", value: "color" },
      { title: "Change icon", value: "icon" },
      { title: "Move", value: "move" },
      ...(count === 0
        ? [{ title: "Delete empty category", value: "delete" as const }]
        : [{ title: `Purge category and ${count} ${count === 1 ? "task" : "tasks"}`, value: "purge" as const }]),
    ],
  })
  if (action === "rename") return renameBacklogCategory(context, category)
  if (action === "color") return colorBacklogCategory(context, category)
  if (action === "icon") return iconBacklogCategory(context, category)
  if (action === "move") return moveBacklogCategory(context, category)
  if (action === "delete") return deleteBacklogCategory(context, category)
  if (action !== "purge") return

  const confirmed = await context.ui.dialog.confirm({
    title: `Purge ${category.title}`,
    message: `Permanently delete ${count} ${count === 1 ? "task" : "tasks"} from this category?`,
    label: { confirm: "Purge", cancel: "Cancel" },
  })
  if (!confirmed) return
  await purgeConfirmedCategory(path, category.id, taskIDs)
  context.ui.toast.show({ message: `Purged category "${category.title}".`, variant: "success" })
}

async function moveBacklogItem(context: Plugin.Context): Promise<void> {
  return browseBacklogWithState(context, () => {}, () => "status")
}

async function browseBacklogWithState(
  context: Plugin.Context,
  setOpen: (open: boolean) => void,
  action: () => BrowseAction = () => "details",
  readonly = false,
): Promise<void> {
  const { path } = backlogLocation(context)
  const captured = pinContext(context, path)
  let offset = 0
  const next = `next:${randomUUID()}`
  const previous = `previous:${randomUUID()}`
  while (true) {
    const page = await listBacklog(path, { offset, limit: 20 })
    if (page.total === 0) {
      await context.ui.dialog.alert({ title: "Backlog", message: "No tasks" })
      return
    }
    if (offset >= page.total) { offset = Math.floor((page.total - 1) / 20) * 20; continue }
    setOpen(!readonly)
    const id = await context.ui.dialog.select({
      title: `${readonly ? "Backlog history" : "Backlog"} · ${offset + 1}–${offset + page.items.length} of ${page.total}`,
      placeholder: "Select a task",
      options: [
        ...page.items.map((item) => ({ title: item.title, value: item.id, category: categoryTitle(page.categories, item.status) })),
        ...(offset > 0 ? [{ title: "Previous page", value: previous }] : []),
        ...(offset + page.items.length < page.total ? [{ title: "Next page", value: next }] : []),
      ],
    }).finally(() => setOpen(false))
    if (!id) return
    if (id === next) { offset += 20; continue }
    if (id === previous) { offset = Math.max(0, offset - 20); continue }
    const backlog = await readBacklog(path)
    const item = backlog.items.find((candidate) => candidate.id === id)
    if (!item) throw new Error("This task no longer exists. Refresh the list.")
    if (readonly) {
      await context.ui.dialog.alert({ title: item.title, message: taskDetails(item, backlog.categories) })
      continue
    }
    const selectedAction = action()
    if (selectedAction === "status") return changeTaskStatus(captured, item)
    if (selectedAction === "edit") return editBacklogItem(captured, item)
    if (selectedAction === "delete") return removeBacklogItem(captured, item)
    showTaskDetails(captured, item, backlog.categories)
    return
  }
}

async function browseSessions(context: Plugin.Context): Promise<void> {
  const { path } = backlogLocation(context)
  let offset = 0
  const next = `next:${randomUUID()}`
  const previous = `previous:${randomUUID()}`
  while (true) {
    const page = await listSessions(path, offset)
    if (page.total === 0) {
      await context.ui.dialog.alert({ title: "Stored backlogs", message: "No stored backlogs in this project" })
      return
    }
    const id = await context.ui.dialog.select({
      title: "Stored backlogs · read-only history",
      options: [
        ...page.items.map((session) => ({
          title: session.title, value: session.boardID,
          description: `${session.mode} · ${session.tasks} tasks · ${new Date(session.updatedAt).toLocaleDateString()}`,
        })),
        ...(offset > 0 ? [{ title: "Previous page", value: previous }] : []),
        ...(offset + page.items.length < page.total ? [{ title: "Next page", value: next }] : []),
      ],
    })
    if (!id) return
    if (id === next) { offset += 20; continue }
    if (id === previous) { offset = Math.max(0, offset - 20); continue }
    const session = page.items.find((candidate) => candidate.boardID === id)
    if (!session) return
    const access = sessionAccess(context, path.sessionID, path.directory)
    access.historyBoardID = session.boardID
    await browseBacklogWithState(pinContext(context, access), () => {}, () => "details", true)
  }
}

async function chooseScope(context: Plugin.Context): Promise<void> {
  const { path } = backlogLocation(context)
  const page = await listBacklog(path, { limit: 1 })
  const choice = await context.ui.dialog.select({
    title: "Backlog scope for this session",
    current: page.mode,
    options: [
      { title: "Session", value: "session", description: "An isolated backlog for this session" },
      { title: "Project", value: "project", description: "Shared with sessions in this project" },
      { title: "Use configured default", value: "default", description: "Remove this session's override" },
      { title: "Settings", value: "settings", description: "Task detail, retention, and default scope for this project" },
    ],
  })
  if (!choice) return
  if (choice === "settings") return manageSettings(context)
  const result = await path.client.setMode({ sessionID: path.sessionID, mode: choice }, { location: { directory: path.directory } }) as { mode: string }
  context.ui.toast.show({ message: `Using ${result.mode} backlog. Existing tasks were not moved.`, variant: "success" })
}

function settingsLocation(context: Plugin.Context): SettingsAccess {
  const captured = pinned.get(context)
  if (captured) return captured
  const route = context.ui.router.current()
  if (route.type === "session") return sessionAccess(context, route.sessionID)
  const directory = context.location?.directory ?? context.data.location.default()?.directory
  if (!directory) throw new Error("Open a project before using Backlog Settings")
  return { directory, client: context.client.rpc(SessionBacklog) }
}

function retentionWarning(previous: number, next: number, scope: SettingsScope): string {
  if (next === 0 || (previous !== 0 && next >= previous)) return ""
  const target = scope === "global"
    ? "Eligible session backlogs in every project"
    : "Eligible session backlogs in this project"
  return `${target} inactive for ${next} days can be permanently deleted at the next daily cleanup. Project backlogs and pending tasks are protected. There is no undo.`
}

function TaskDetailDialog(props: { context: Plugin.Context; current: TaskDetail; choose: (detail: TaskDetail) => void }) {
  const options: { value: TaskDetail; title: string; shortcut: string; description: string }[] = [
    {
      value: "lightweight", title: "Lightweight", shortcut: "l",
      description: `Fewer tokens. Every task has a very short description: one sentence, up to ${LIGHTWEIGHT_NOTES_MAX} characters. Best for small, clearly scoped steps.`,
    },
    {
      value: "detailed", title: "Detailed", shortcut: "d",
      description: "More tokens. Keeps objectives, constraints, progress, and next steps for more precise resumption of complex work. Does not guarantee better model answers.",
    },
  ]
  onMount(() => props.context.ui.dialog.set({ size: "medium" }))
  props.context.keymap.layer(() => ({
    mode: "modal", priority: 100,
    commands: options.map((option) => ({
      bind: option.shortcut, title: `Use ${option.title} task detail`, group: "Backlog",
      run: () => props.choose(option.value),
    })),
  }))
  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between" gap={1}>
        <text fg={props.context.theme.text.base}><b>Task detail</b></text>
        <text fg={props.context.theme.text.muted} onMouseUp={() => props.context.ui.dialog.clear()}>esc</text>
      </box>
      <For each={options}>
        {(option) => (
          <box gap={1} minWidth={0} onMouseUp={() => props.choose(option.value)}>
            <text fg={props.context.theme.text.action.primary.base} wrapMode="word">
              <b>{props.current === option.value ? "●" : "○"} {option.shortcut} {option.title}</b>
              {props.current === option.value ? " · current" : ""}
            </text>
            <text fg={props.context.theme.text.base} wrapMode="word">{option.description}</text>
          </box>
        )}
      </For>
      <text fg={props.context.theme.text.muted} wrapMode="word">Press l or d to choose · esc to cancel</text>
    </box>
  )
}

function chooseTaskDetail(context: Plugin.Context, current: TaskDetail): Promise<TaskDetail | undefined> {
  return new Promise((resolve) => {
    context.ui.dialog.show(() => <TaskDetailDialog context={context} current={current} choose={(detail) => {
      resolve(detail)
      context.ui.dialog.clear()
    }} />, () => resolve(undefined))
  })
}

function storageSize(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"]
  const index = bytes === 0 ? 0 : Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toLocaleString(undefined, { maximumFractionDigits: index === 0 ? 0 : 2 })} ${units[index]}`
}

async function manageStorage(context: Plugin.Context, access: SettingsAccess, initialScope: SettingsScope): Promise<void> {
  let scope = initialScope
  while (true) {
    const { stats, preview } = await readStorage(access, scope)
    const target = scope === "global" ? "all projects in this database" : "this project"
    const choice = await context.ui.dialog.select<"details" | "cleanup" | "scope">({
      title: `Backlog Storage · ${scope === "global" ? "Global · all projects" : "Project · this project"}`,
      placeholder: "Database size is global; cleanup uses the selected scope",
      options: [
        { title: `Disk usage · ${storageSize(stats.totalBytes)}`, value: "details", description: `${stats.totalTasks} tasks · ${stats.totalBacklogs} backlogs · SQLite + WAL + SHM` },
        { title: `Cleanup scope · ${scope === "global" ? "Global" : "Project"}`, value: "scope", description: `Cleanup affects ${target}; click to switch` },
        {
          title: `Clean finished tasks >24h · ${preview.tasks}`,
          value: "cleanup", disabled: preview.tasks === 0,
          description: preview.tasks === 0 ? "No eligible done/cancelled tasks; pending tasks are protected" : `${preview.backlogs} backlogs in ${target} · confirmation required`,
        },
      ],
    })
    if (!choice) return
    if (choice === "scope") { scope = scope === "global" ? "project" : "global"; continue }
    if (choice === "details") {
      await context.ui.dialog.alert({
        title: "Backlog database · server storage",
        message: [
          `Total disk usage (all projects): ${storageSize(stats.totalBytes)}`,
          `SQLite: ${storageSize(stats.databaseBytes)}`,
          `WAL (write-ahead log): ${storageSize(stats.walBytes)}`,
          `SHM (shared-memory index): ${storageSize(stats.shmBytes)}`,
          `Reusable space inside SQLite: ${storageSize(stats.reusableBytes)}`,
          "",
          `All projects: ${stats.totalTasks} tasks / ${stats.totalBacklogs} backlogs`,
          `This project: ${stats.projectTasks} tasks / ${stats.projectBacklogs} backlogs`,
          "",
          `Server path: ${stats.path}`,
          "",
          "Cleanup only removes done/cancelled tasks unchanged for more than 24 hours. Legacy tasks receive a fresh 24-hour window on upgrade. Categories, settings, and pending tasks are preserved.",
        ].join("\n"),
      })
      continue
    }
    if (!await context.ui.dialog.confirm({
      title: `Permanently delete ${preview.tasks} finished tasks?`,
      message: `Delete ${preview.tasks} done/cancelled tasks from ${preview.backlogs} backlogs in ${target}?\n\nOnly tasks last modified before ${new Date(preview.cutoff).toLocaleString()} are included. Pending tasks, categories, and settings are preserved. There is no undo.\n\nSQLite compaction may briefly block writes and needs temporary free disk space up to twice the database size.`,
      label: { confirm: "Delete and compact", cancel: "Cancel" },
    })) continue
    try {
      const result = await cleanStorage(access, preview)
      context.ui.toast.show({ message: `Deleted ${result.deletedTasks} finished tasks.${result.compacted ? " Database compacted." : ""}`, variant: "success" })
      if (result.warning) await context.ui.dialog.alert({ title: "Cleanup complete · compaction deferred", message: result.warning })
    } catch (cause) {
      context.ui.toast.show({ message: cause instanceof Error ? cause.message : String(cause), variant: "error" })
    }
  }
}

async function manageSettings(context: Plugin.Context): Promise<void> {
  const access = settingsLocation(context)
  let scope: SettingsScope = "project"
  while (true) {
    const snapshot = await readSettings(access)
    const level = scope === "global" ? snapshot.global : snapshot.project
    const current = level.settings
    const scopeName = scope === "global" ? "Global" : "Project"
    const inheritance = level.override ? "Customized here" : scope === "global" ? "Using configured defaults" : "Inherited from global"
    const choice = await context.ui.dialog.select<"scope" | "detail" | "retention" | "defaultScope" | "storage" | "reset">({
      title: `Backlog Settings · ${scope === "global" ? "Global · all projects" : "Project · this project"}`,
      placeholder: scope === "global"
        ? "Defaults for every project unless a project overrides them"
        : "Overrides global settings for this project",
      options: [
        {
          title: `Settings scope · ${scopeName}`,
          value: "scope",
          description: scope === "global" ? "Switch to this project's overrides" : "Switch to global defaults",
        },
        { title: `Task detail · ${current.taskDetail === "lightweight" ? "Lightweight" : "Detailed"}`, value: "detail", description: level.override ? "Customized here" : "Inherited" },
        { title: `Retention · ${current.retentionDays === 0 ? "Disabled" : `${current.retentionDays} days`}`, value: "retention", description: level.override ? "Customized here" : "Inherited" },
        { title: `Default scope · ${current.defaultMode === "session" ? "Session" : "Project"}`, value: "defaultScope", description: level.override ? "Customized here" : "Inherited" },
        { title: "Storage · database size and cleanup", value: "storage", description: "Inspect disk usage; manually clean finished tasks older than 24 hours" },
        {
          title: scope === "global" ? "Reset global to configured defaults" : "Reset project to inherit global",
          value: "reset",
          description: "Existing tasks and notes stay unchanged",
        },
      ],
    })
    if (!choice) return
    if (choice === "scope") { scope = scope === "global" ? "project" : "global"; continue }
    if (choice === "storage") { await manageStorage(context, access, scope); continue }
    let next: BacklogSettings | null = { ...current }
    if (choice === "detail") {
      const detail = await chooseTaskDetail(context, current.taskDetail)
      if (!detail || detail === current.taskDetail) continue
      next.taskDetail = detail
    }
    if (choice === "retention") {
      const value = await context.ui.dialog.prompt({
        title: `Retention days · ${scopeName}`, value: String(current.retentionDays), placeholder: "90",
        description: "Whole days without access. 0 disables expiration. Project backlogs and pending tasks never expire.",
      })
      if (value === undefined) continue
      try {
        if (!/^\d+$/.test(value.trim())) throw new Error("Enter a non-negative whole number; 0 disables expiration")
        next.retentionDays = parseRetentionDays(Number(value.trim()))
      } catch (cause) {
        context.ui.toast.show({ message: cause instanceof Error ? cause.message : String(cause), variant: "error" })
        continue
      }
      if (next.retentionDays === current.retentionDays) continue
      const warning = retentionWarning(current.retentionDays, next.retentionDays, scope)
      if (warning && !await context.ui.dialog.confirm({ title: "Change automatic retention?", message: warning, label: { confirm: "Apply", cancel: "Cancel" } })) continue
    }
    if (choice === "defaultScope") {
      const mode = await context.ui.dialog.select<BacklogSettings["defaultMode"]>({
        title: `Default backlog scope · ${scopeName}`, current: current.defaultMode,
        options: [
          { title: "Session", value: "session", description: "Separate backlog for each session" },
          { title: "Project", value: "project", description: "Shared backlog; per-session overrides still apply" },
        ],
      })
      if (!mode || mode === current.defaultMode) continue
      next.defaultMode = mode
    }
    if (choice === "reset") {
      const inherited = scope === "global" ? snapshot.defaults : snapshot.global.settings
      const warning = retentionWarning(current.retentionDays, inherited.retentionDays, scope)
      const parent = scope === "global" ? "plugin-configured defaults" : "global settings"
      if (!await context.ui.dialog.confirm({
        title: "Reset Backlog Settings?",
        message: `Restore ${parent} for ${scopeName.toLowerCase()} settings? Tasks and notes are not rewritten.${warning ? `\n\n${warning}` : ""}`,
        label: { confirm: "Reset", cancel: "Cancel" },
      })) continue
      next = null
    }
    await saveSettings(access, scope, snapshot, next)
    context.ui.toast.show({ message: `${scopeName} backlog settings saved.`, variant: "success" })
  }
}

function Commands(props: { context: Plugin.Context }) {
  const [browseOpen, setBrowseOpen] = createSignal(false)
  const [browseAction, setBrowseAction] = createSignal<BrowseAction>("details")
  const [browseContext, setBrowseContext] = createSignal<Plugin.Context>()
  const run = async (operation: (context: Plugin.Context) => Promise<void>, source = props.context) => {
    try {
      const { path } = backlogLocation(source)
      await readBacklog(path)
      await operation(pinContext(source, path))
    } catch (cause) {
      props.context.ui.toast.show({
        message: cause instanceof Error ? cause.message : String(cause),
        variant: "error",
      })
    }
  }

  props.context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: "kodradev.backlog.browse",
        title: "Browse selected backlog",
        description: "View backlog tasks and change their category",
        group: "Backlog",
        palette: true,
        slash: { name: "session-tasks" },
        run: () => {
          setBrowseAction("details")
          return run((context) => {
            setBrowseContext(context)
            return browseBacklogWithState(context, setBrowseOpen, browseAction)
          })
        },
      },
      {
        id: "kodradev.backlog.add",
        title: "Add backlog task",
        description: "Create a task at the top of the first category",
        group: "Backlog",
        palette: true,
        slash: { name: "session-task-add" },
        run: () => run(addBacklogItem),
      },
      {
        id: "kodradev.backlog.move",
        title: "Move backlog task",
        description: "Change a backlog task category",
        group: "Backlog",
        palette: true,
        slash: { name: "session-task-move" },
        run: () => run(moveBacklogItem),
      },
      {
        id: "kodradev.backlog.purge",
        title: "Purge backlog category",
        description: "Permanently delete every task in a category",
        group: "Backlog",
        palette: true,
        slash: { name: "session-backlog-purge" },
        run: () => run(purgeBacklogCategory),
      },
      {
        id: "kodradev.backlog.categories",
        title: "Manage backlog categories",
        description: "Add, rename, move, purge, or delete a category",
        group: "Backlog",
        palette: true,
        slash: { name: "session-backlog-categories" },
        run: () => run(manageBacklogCategories),
      },
      {
        id: "kodradev.backlog.sessions",
        title: "Browse stored backlogs",
        description: "Read-only history for this project",
        group: "Backlog",
        palette: true,
        slash: { name: "session-backlogs" },
        run: () => run(browseSessions),
      },
      {
        id: "kodradev.backlog.scope",
        title: "Choose backlog scope for this session",
        group: "Backlog",
        palette: true,
        slash: { name: "backlog-scope" },
        run: () => run(chooseScope),
      },
      {
        id: "kodradev.backlog.settings",
        title: "Backlog Settings",
        description: "Configure task detail, retention, scope, and database storage",
        group: "Backlog", palette: true,
        slash: { name: "backlog-settings" },
        run: async () => {
          try { await manageSettings(props.context) }
          catch (cause) { props.context.ui.toast.show({ message: cause instanceof Error ? cause.message : String(cause), variant: "error" }) }
        },
      },
    ],
  }))
  props.context.keymap.layer(() => ({
    mode: "modal",
    enabled: browseOpen,
    priority: 100,
    commands: [
      {
        bind: "n",
        title: "New backlog task",
        group: "Backlog",
        run() {
          setBrowseOpen(false)
          return run(addBacklogItem, browseContext() ?? props.context)
        },
      },
      {
        bind: "p",
        title: "Purge backlog category",
        group: "Backlog",
        run() {
          setBrowseOpen(false)
          return run(purgeBacklogCategory, browseContext() ?? props.context)
        },
      },
      {
        bind: "c",
        title: "Change selected task category",
        group: "Backlog",
        run() {
          setBrowseAction("status")
          props.context.keymap.dispatch("dialog.select.submit")
        },
      },
      {
        bind: "d",
        title: "Delete selected task",
        group: "Backlog",
        run() {
          setBrowseAction("delete")
          props.context.keymap.dispatch("dialog.select.submit")
        },
      },
      {
        bind: "e",
        title: "Edit selected task",
        group: "Backlog",
        run() {
          setBrowseAction("edit")
          props.context.keymap.dispatch("dialog.select.submit")
        },
      },
    ],
  }))
  return null
}

export default Plugin.define({
  id: "kodradev.backlog.tui",
  setup(context) {
    const releaseCommands = context.ui.slot({
      append: "app",
      render: () => <Commands context={context} />,
    })

    const releaseSlot = context.ui.slot({
      append: "sidebar.content",
      render: (props) => {
        const directory = context.data.session.get(props.sessionID)?.location.directory
        if (!directory) return null
        return <BacklogView context={context} sessionID={props.sessionID} />
      },
    })

    return () => {
      releaseSlot()
      releaseCommands()
    }
  },
})
