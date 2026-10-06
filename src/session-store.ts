import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname, isAbsolute, join } from "node:path"
import { homedir } from "node:os"
import { EMPTY_BACKLOG, parseBacklog, type Backlog, type BacklogItem, type Category } from "./backlog.js"

export const LIMITS = {
  tasks: 1000,
  categories: 32,
  title: 240,
  id: 160,
  notesBytes: 16 * 1024,
  page: 50,
} as const

export interface SessionScope {
  sessionID: string
  boardID: string
  mode: ScopeMode
  defaultMode: ScopeMode
  projectID: string
  directory: string
  title: string
}

export interface Snapshot {
  boardID: string
  mode: ScopeMode
  revision: number
  backlog: Backlog
}

export interface PageOptions {
  category?: string
  query?: string
  offset?: number
  limit?: number
  includeNotes?: boolean
  activeOnly?: boolean
}

export interface BacklogPage {
  boardID: string
  mode: ScopeMode
  revision: number
  categories: readonly Category[]
  counts: Record<string, number>
  items: readonly BacklogItem[]
  total: number
  offset: number
  limit: number
}

export type ScopeMode = "session" | "project"

export interface StoredSession {
  boardID: string
  mode: ScopeMode
  projectID: string
  directory: string
  title: string
  updatedAt: number
  tasks: number
}

interface CategoryRow { id: string; title: string; color: string | null; icon: string | null }
interface ItemRow { id: string; title: string; notes: string | null; status: string }

export function defaultDatabasePath(): string {
  const data = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  return join(data, "opencode", "kodradev-opencode-backlog", "backlog.sqlite")
}

export function pageInteger(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`Pagination value must be an integer between 0 and ${maximum}`)
  }
  return value
}

function validateLimits(backlog: Backlog): void {
  if (backlog.items.length > LIMITS.tasks) throw new Error(`A backlog may contain at most ${LIMITS.tasks} tasks`)
  if (backlog.categories.length > LIMITS.categories) throw new Error(`A backlog may contain at most ${LIMITS.categories} categories`)
  for (const entry of [...backlog.categories, ...backlog.items]) {
    if (entry.id.length > LIMITS.id) throw new Error(`IDs may contain at most ${LIMITS.id} characters`)
    if (entry.title.length > LIMITS.title) throw new Error(`Titles may contain at most ${LIMITS.title} characters`)
    if ("notes" in entry && Buffer.byteLength(entry.notes ?? "", "utf8") > LIMITS.notesBytes) {
      throw new Error(`Notes may contain at most ${LIMITS.notesBytes} UTF-8 bytes`)
    }
  }
}

function itemFromRow(row: ItemRow): BacklogItem {
  return { id: row.id, title: row.title, status: row.status, ...(row.notes === null ? {} : { notes: row.notes }) }
}

export class SessionStore {
  private readonly db: Database

  constructor(readonly path = defaultDatabasePath()) {
    if (!isAbsolute(path)) throw new Error("databasePath must be an absolute path")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new Database(path, { create: true, strict: true })
    try {
      this.db.run("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA wal_autocheckpoint = 1000;")
      this.db.transaction(() => {
        const version = this.db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0
        if (version > 1) throw new Error(`Unsupported session backlog schema ${version}; upgrade the plugin`)
        if (version === 0) {
          this.db.run(`
            CREATE TABLE backlogs (
              id TEXT PRIMARY KEY, project_id TEXT NOT NULL, directory TEXT NOT NULL,
              title TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('session', 'project')),
              revision INTEGER NOT NULL, updated_at INTEGER NOT NULL
            );
            CREATE INDEX backlogs_project_updated ON backlogs(project_id, updated_at DESC, id);
            CREATE TABLE session_preferences (
              session_id TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK(mode IN ('session', 'project'))
            );
            CREATE TABLE categories (
              board_id TEXT NOT NULL REFERENCES backlogs(id) ON DELETE CASCADE,
              id TEXT NOT NULL, title TEXT NOT NULL, color TEXT, icon TEXT, position INTEGER NOT NULL,
              PRIMARY KEY(board_id, id)
            );
            CREATE TABLE tasks (
              board_id TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL,
              notes TEXT, status TEXT NOT NULL, position INTEGER NOT NULL,
              PRIMARY KEY(board_id, id),
              FOREIGN KEY(board_id, status) REFERENCES categories(board_id, id) ON DELETE CASCADE
            );
            CREATE INDEX tasks_backlog_order ON tasks(board_id, status, position);
            PRAGMA user_version = 1;
          `)
        }
      }).immediate()
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  mode(sessionID: string, fallback: ScopeMode): ScopeMode {
    return this.db.query<{ mode: ScopeMode }, [string]>("SELECT mode FROM session_preferences WHERE session_id = ?").get(sessionID)?.mode ?? fallback
  }

  setMode(sessionID: string, mode: ScopeMode | null): void {
    if (mode === null) this.db.query("DELETE FROM session_preferences WHERE session_id = ?").run(sessionID)
    else this.db.query("INSERT INTO session_preferences(session_id, mode) VALUES (?, ?) ON CONFLICT(session_id) DO UPDATE SET mode = excluded.mode").run(sessionID, mode)
  }

  private snapshot(boardID: string): Snapshot {
    const mode: ScopeMode = boardID.startsWith("project:") ? "project" : "session"
    const session = this.db.query<{ revision: number }, [string]>("SELECT revision FROM backlogs WHERE id = ?").get(boardID)
    if (!session) return { boardID, mode, revision: 0, backlog: structuredClone(EMPTY_BACKLOG) }
    const categories = this.db.query<CategoryRow, [string]>(
      "SELECT id, title, color, icon FROM categories WHERE board_id = ? ORDER BY position",
    ).all(boardID).map((row) => ({
      id: row.id, title: row.title,
      ...(row.color === null ? {} : { color: row.color }),
      ...(row.icon === null ? {} : { icon: row.icon }),
    }))
    const items = this.db.query<ItemRow, [string]>(`
      SELECT t.id, t.title, t.notes, t.status FROM tasks t
      JOIN categories c ON c.board_id = t.board_id AND c.id = t.status
      WHERE t.board_id = ? ORDER BY c.position, t.position
    `).all(boardID).map(itemFromRow)
    return { boardID, mode, revision: session.revision, backlog: parseBacklog({ version: 2, categories, items }) }
  }

  read(boardID: string): Snapshot {
    return this.db.transaction(() => this.snapshot(boardID))()
  }

  update(scope: SessionScope, update: (backlog: Backlog) => Backlog, expectedRevision?: number): Snapshot {
    return this.db.transaction(() => {
      if (this.mode(scope.sessionID, scope.defaultMode) !== scope.mode) {
        throw new Error("The backlog scope changed. Refresh and try again.")
      }
      const previous = this.snapshot(scope.boardID)
      if (expectedRevision !== undefined && previous.revision !== expectedRevision) {
        throw new Error("The backlog changed while this dialog was open. Refresh and try again.")
      }
      const backlog = parseBacklog(update(previous.backlog))
      validateLimits(backlog)
      const revision = previous.revision + 1
      this.db.query(`
        INSERT INTO backlogs(id, project_id, directory, title, mode, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, directory = excluded.directory,
          title = excluded.title, revision = excluded.revision, updated_at = excluded.updated_at
      `).run(scope.boardID, scope.projectID, scope.directory, scope.title.slice(0, LIMITS.title), scope.mode, revision, Date.now())
      const categoryInsert = this.db.query(`
        INSERT INTO categories(board_id, id, title, color, icon, position) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(board_id, id) DO UPDATE SET title = excluded.title, color = excluded.color,
          icon = excluded.icon, position = excluded.position
        WHERE categories.title IS NOT excluded.title OR categories.color IS NOT excluded.color
          OR categories.icon IS NOT excluded.icon OR categories.position IS NOT excluded.position
      `)
      backlog.categories.forEach((category, position) => {
        categoryInsert.run(scope.boardID, category.id, category.title, category.color ?? null, category.icon ?? null, position)
      })
      const taskIDs = new Set(backlog.items.map(({ id }) => id))
      const taskDelete = this.db.query("DELETE FROM tasks WHERE board_id = ? AND id = ?")
      for (const item of previous.backlog.items) {
        if (!taskIDs.has(item.id)) taskDelete.run(scope.boardID, item.id)
      }
      const taskInsert = this.db.query(`
        INSERT INTO tasks(board_id, id, title, notes, status, position) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(board_id, id) DO UPDATE SET title = excluded.title, notes = excluded.notes,
          status = excluded.status, position = excluded.position
        WHERE tasks.title IS NOT excluded.title OR tasks.notes IS NOT excluded.notes
          OR tasks.status IS NOT excluded.status OR tasks.position IS NOT excluded.position
      `)
      backlog.items.forEach((item, position) => {
        taskInsert.run(scope.boardID, item.id, item.title, item.notes ?? null, item.status, position)
      })
      const categoryIDs = new Set(backlog.categories.map(({ id }) => id))
      const categoryDelete = this.db.query("DELETE FROM categories WHERE board_id = ? AND id = ?")
      for (const category of previous.backlog.categories) {
        if (!categoryIDs.has(category.id)) categoryDelete.run(scope.boardID, category.id)
      }
      return { boardID: scope.boardID, mode: scope.mode, revision, backlog }
    }).immediate()
  }

  list(boardID: string, options: PageOptions = {}): BacklogPage {
    const mode: ScopeMode = boardID.startsWith("project:") ? "project" : "session"
    const offset = pageInteger(options.offset, 0, Number.MAX_SAFE_INTEGER)
    const limit = pageInteger(options.limit, 20, LIMITS.page)
    if (limit === 0) throw new Error("limit must be at least 1")
    return this.db.transaction(() => {
      const session = this.db.query<{ revision: number }, [string]>("SELECT revision FROM backlogs WHERE id = ?").get(boardID)
      const categories = session ? this.db.query<CategoryRow, [string]>(
        "SELECT id, title, color, icon FROM categories WHERE board_id = ? ORDER BY position",
      ).all(boardID).map((row) => ({
        id: row.id, title: row.title,
        ...(row.color === null ? {} : { color: row.color }),
        ...(row.icon === null ? {} : { icon: row.icon }),
      })) as Category[] : EMPTY_BACKLOG.categories
      if (options.category !== undefined && !categories.some(({ id }) => id === options.category)) {
        throw new Error("category must identify a category in the selected backlog")
      }
      const counts: Record<string, number> = Object.fromEntries(categories.map(({ id }) => [id, 0]))
      for (const row of this.db.query<{ status: string; count: number }, [string]>(
        "SELECT status, COUNT(*) AS count FROM tasks WHERE board_id = ? GROUP BY status",
      ).all(boardID)) counts[row.status] = row.count
      const where = ["t.board_id = ?"]
      const params: (string | number)[] = [boardID]
      if (options.category !== undefined) { where.push("t.status = ?"); params.push(options.category) }
      if (options.activeOnly) where.push("t.status NOT IN ('done', 'cancelled')")
      if (options.query?.trim()) {
        where.push("(instr(lower(t.title), lower(?)) > 0 OR instr(lower(coalesce(t.notes, '')), lower(?)) > 0 OR instr(lower(t.id), lower(?)) > 0)")
        params.push(options.query.trim(), options.query.trim(), options.query.trim())
      }
      const condition = where.join(" AND ")
      const total = this.db.query<{ count: number }, (string | number)[]>(`SELECT COUNT(*) AS count FROM tasks t WHERE ${condition}`).get(...params)?.count ?? 0
      const notes = options.includeNotes ? "substr(t.notes, 1, 512) AS notes" : "NULL AS notes"
      const items = this.db.query<ItemRow, (string | number)[]>(`
        SELECT t.id, t.title, ${notes}, t.status FROM tasks t
        JOIN categories c ON c.board_id = t.board_id AND c.id = t.status
        WHERE ${condition} ORDER BY c.position, t.position LIMIT ? OFFSET ?
      `).all(...params, limit, offset).map(itemFromRow)
      return { boardID, mode, revision: session?.revision ?? 0, categories, counts, items, total, offset, limit }
    })()
  }

  sessions(projectID: string, offset = 0, limit = 20): { items: StoredSession[]; total: number } {
    pageInteger(offset, 0, Number.MAX_SAFE_INTEGER)
    pageInteger(limit, 20, LIMITS.page)
    if (limit === 0) throw new Error("limit must be at least 1")
    return this.db.transaction(() => ({
      total: this.db.query<{ count: number }, [string]>("SELECT COUNT(*) AS count FROM backlogs WHERE project_id = ?").get(projectID)?.count ?? 0,
      items: this.db.query<StoredSession, [string, number, number]>(`
        SELECT s.id AS boardID, s.mode, s.project_id AS projectID, s.directory, s.title,
          s.updated_at AS updatedAt, (SELECT COUNT(*) FROM tasks t WHERE t.board_id = s.id) AS tasks
        FROM backlogs s WHERE s.project_id = ? ORDER BY s.updated_at DESC, s.id LIMIT ? OFFSET ?
      `).all(projectID, limit, offset),
    }))()
  }

  belongsToProject(boardID: string, projectID: string): boolean {
    return this.db.query<{ id: string }, [string, string]>("SELECT id FROM backlogs WHERE id = ? AND project_id = ?").get(boardID, projectID) !== null
  }

  close(): void { this.db.close() }
}
