import { Rpc } from "@opencode/plugin/rpc"

const session = { type: "string", minLength: 1, maxLength: 160 } as const
const board = { type: "string", minLength: 1, maxLength: 240 } as const
const page = { type: "integer", minimum: 1, maximum: 50 } as const
const offset = { type: "integer", minimum: 0 } as const
const output = { type: "object" } as const
const errors = { failed: { type: "object", additionalProperties: false } } as const
const settings = {
  type: "object",
  properties: {
    defaultMode: { type: "string", enum: ["session", "project"] },
    retentionDays: { type: "integer", minimum: 0 },
    taskDetail: { type: "string", enum: ["lightweight", "detailed"] },
  },
  required: ["defaultMode", "retentionDays", "taskDetail"],
  additionalProperties: false,
} as const

export const SessionBacklog = Rpc.define({
  id: "kodradev.backlog",
  methods: {
    read: {
      input: { type: "object", properties: { sessionID: session, historyBoardID: board }, required: ["sessionID"], additionalProperties: false },
      output, errors,
    },
    list: {
      input: {
        type: "object",
        properties: {
          sessionID: session, category: { type: "string", minLength: 1, maxLength: 160 },
          historyBoardID: board,
          query: { type: "string", maxLength: 240 }, offset, limit: page,
          includeNotes: { type: "boolean" }, activeOnly: { type: "boolean" },
        },
        required: ["sessionID"], additionalProperties: false,
      },
      output, errors,
    },
    replace: {
      input: {
        type: "object", properties: {
          sessionID: session, revision: { type: "integer", minimum: 0 },
          expectedBoardID: board,
          backlog: {
            type: "object", properties: {
              version: { const: 2 },
              categories: { type: "array", minItems: 1, maxItems: 32, items: { type: "object" } },
              items: { type: "array", maxItems: 1000, items: { type: "object" } },
            },
            required: ["version", "categories", "items"], additionalProperties: false,
          },
        }, required: ["sessionID", "expectedBoardID", "revision", "backlog"], additionalProperties: false,
      },
      output, errors,
    },
    sessions: {
      input: { type: "object", properties: { offset, limit: page }, additionalProperties: false },
      output, errors,
    },
    setMode: {
      input: {
        type: "object", properties: { sessionID: session, mode: { type: "string", enum: ["session", "project", "default"] } },
        required: ["sessionID", "mode"], additionalProperties: false,
      },
      output, errors,
    },
    settings: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output, errors,
    },
    setSettings: {
      input: {
        type: "object", properties: {
          expectedProjectID: { type: "string", minLength: 1 },
          scope: { type: "string", enum: ["global", "project"] },
          revision: { type: "integer", minimum: 0 },
          settings: { anyOf: [settings, { type: "null" }] },
        },
        required: ["expectedProjectID", "scope", "revision", "settings"], additionalProperties: false,
      },
      output, errors,
    },
  },
  events: {
    updated: {
      schema: {
        type: "object", properties: { sessionID: session, boardID: board, revision: { type: "integer", minimum: 0 } },
        required: ["sessionID", "boardID", "revision"], additionalProperties: false,
      },
    },
    settingsUpdated: {
      schema: {
        type: "object", properties: {
          scope: { type: "string", enum: ["global", "project"] }, revision: { type: "integer", minimum: 0 },
        },
        required: ["scope", "revision"], additionalProperties: false,
      },
    },
  },
})
