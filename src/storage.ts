import type { SettingsScope } from "./settings.js"

export interface StorageStats {
  path: string
  databaseBytes: number
  walBytes: number
  shmBytes: number
  totalBytes: number
  reusableBytes: number
  totalTasks: number
  projectTasks: number
  totalBacklogs: number
  projectBacklogs: number
}

export interface CleanupPreview {
  projectID: string
  scope: SettingsScope
  cutoff: number
  fingerprint: string
  tasks: number
  backlogs: number
}

export interface StorageReport {
  stats: StorageStats
  preview: CleanupPreview
}

export interface CleanupResult {
  deletedTasks: number
  compacted: boolean
  warning?: string
}
