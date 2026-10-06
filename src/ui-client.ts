import type { Plugin } from "@opencode/plugin/tui"
import type { RpcClient } from "@opencode/client/promise/api"
import { parseBacklog, type Backlog } from "./backlog.js"
import { SessionBacklog } from "./session-rpc.js"
import type { BacklogPage, PageOptions, Snapshot, StoredSession } from "./session-store.js"

export interface BacklogAccess {
  sessionID: string
  directory: string
  client: RpcClient<typeof SessionBacklog>
  historyBoardID?: string
  selectedBoardID?: string
  snapshot?: Snapshot
}

export function sessionAccess(context: Plugin.Context, sessionID: string, directory?: string): BacklogAccess {
  const location = directory ?? context.data.session.get(sessionID)?.location.directory
  if (!location) throw new Error("The session location is not available. Reopen the session and try again.")
  return { sessionID, directory: location, client: context.client.rpc(SessionBacklog) }
}

export async function readBacklog(access: BacklogAccess): Promise<Backlog> {
  const snapshot = await access.client.read({ sessionID: access.sessionID, ...(access.historyBoardID === undefined ? {} : { historyBoardID: access.historyBoardID }) }, { location: { directory: access.directory } }) as Snapshot
  if (access.selectedBoardID !== undefined && access.selectedBoardID !== snapshot.boardID) {
    throw new Error("The backlog scope changed while this dialog was open. Reopen it and try again.")
  }
  access.selectedBoardID = snapshot.boardID
  access.snapshot = { ...snapshot, backlog: parseBacklog(snapshot.backlog) }
  return access.snapshot.backlog
}

export async function updateBacklog(access: BacklogAccess, update: (backlog: Backlog) => Backlog): Promise<Backlog> {
  if (access.historyBoardID !== undefined) throw new Error("Historical backlogs are read-only")
  if (!access.snapshot) await readBacklog(access)
  const current = access.snapshot!
  const snapshot = await access.client.replace({
    sessionID: access.sessionID, expectedBoardID: current.boardID, revision: current.revision, backlog: parseBacklog(update(current.backlog)),
  }, { location: { directory: access.directory } }) as Snapshot
  access.snapshot = { ...snapshot, backlog: parseBacklog(snapshot.backlog) }
  return access.snapshot.backlog
}

export async function listBacklog(access: BacklogAccess, options: PageOptions = {}, signal?: AbortSignal): Promise<BacklogPage> {
  const page = await access.client.list({ sessionID: access.sessionID, ...options, ...(access.historyBoardID === undefined ? {} : { historyBoardID: access.historyBoardID }) }, {
    location: { directory: access.directory }, ...(signal === undefined ? {} : { signal }),
  }) as BacklogPage
  if (access.selectedBoardID !== undefined && access.selectedBoardID !== page.boardID) {
    throw new Error("The backlog scope changed while this dialog was open. Reopen it and try again.")
  }
  access.selectedBoardID = page.boardID
  return page
}

export async function listSessions(access: BacklogAccess, offset: number): Promise<{ items: StoredSession[]; total: number }> {
  return await access.client.sessions({ offset, limit: 20 }, { location: { directory: access.directory } }) as { items: StoredSession[]; total: number }
}
