import { record } from "./input.js"

export const DAY_MS = 24 * 60 * 60 * 1000
export const LIGHTWEIGHT_NOTES_MAX = 200
export type TaskDetail = "lightweight" | "detailed"
export type SettingsScope = "global" | "project"

export interface BacklogSettings {
  defaultMode: "session" | "project"
  retentionDays: number
  taskDetail: TaskDetail
}

export interface SettingsSnapshot {
  projectID: string
  defaults: BacklogSettings
  global: SettingsLevel
  project: SettingsLevel
}

export interface SettingsLevel {
  revision: number
  override: BacklogSettings | null
  settings: BacklogSettings
}

export function parseLightweightNotes(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Lightweight tasks need a short description")
  if (value.length > LIGHTWEIGHT_NOTES_MAX) throw new Error(`Lightweight descriptions may contain at most ${LIGHTWEIGHT_NOTES_MAX} characters`)
  return value.trim()
}

export function parseRetentionDays(value: unknown = 90): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(value * DAY_MS)) {
    throw new Error("retentionDays must be a non-negative integer whose duration fits in safe milliseconds; use 0 to disable expiration")
  }
  return value
}

export function parseBacklogSettings(value: unknown): BacklogSettings {
  const input = record(value)
  const defaultMode = input.defaultMode === undefined ? "session" : input.defaultMode
  if (defaultMode !== "session" && defaultMode !== "project") throw new Error("defaultMode must be session or project")
  const taskDetail = input.taskDetail === undefined ? "lightweight" : input.taskDetail
  if (taskDetail !== "lightweight" && taskDetail !== "detailed") throw new Error("taskDetail must be lightweight or detailed")
  return { defaultMode, retentionDays: parseRetentionDays(input.retentionDays), taskDetail }
}
