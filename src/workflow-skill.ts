import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Skill, type Plugin } from "@opencode/plugin"
import { LIGHTWEIGHT_NOTES_MAX, type TaskDetail } from "./settings.js"

const ID = "kodradev-backlog"
const REMINDER = "Backlog: only medium/high-complexity or long-running work needing coordination or continuity. Simple, low-complexity actions and informational questions: no backlog calls or tasks, unless user explicitly requests tracking or action belongs to existing tracked work. Assess first; if tracking is needed, list and reuse tasks; todo → doing → done truthfully. One small step per task; no duplicated plan. Resume tracked work: list and read relevant Doing tasks. Respect scope; deletion needs user authorization."
const DETAILS: Record<TaskDetail, string> = {
  lightweight: `Lightweight mode: every new task needs notes with one short description (max ${LIGHTWEIGHT_NOTES_MAX} characters). Keep only essential context; no repeated plan or progress log. Do not load the workflow skill unless needed.`,
  detailed: "Detailed mode: brief notes for complex tasks: objective, scope/constraints, completion criteria, progress, next step, blockers. One short line per field; update only meaningful changes or handoffs, never append logs.",
}
const COMPACTION_REMINDER = "For tracked work, preserve relevant task IDs, scope, blocker and next step. Claim saved notes only after successful writes. Resume tracked work: list backlog and read relevant Doing tasks; do not duplicate tasks or change scope. Simple untracked actions need no backlog calls or tasks."

export async function registerWorkflowSkill(context: Plugin.Context, taskDetail: () => TaskDetail): Promise<void> {
  const path = fileURLToPath(new URL("../skills/kodradev-backlog/SKILL.md", import.meta.url))
  const content = readFileSync(path, "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
  await context.skill.transform((editor) => {
    editor.add({
      id: Skill.ID.make(ID),
      name: Skill.Name.make(ID),
      description: "Track medium/high-complexity or long-running work with KodraDev Backlog using session_backlog_* tools. Skip simple actions unless explicitly requested or part of existing tracked work.",
      autoinvoke: false,
      path: path as Skill.Info["path"],
      content,
    })
  })
  await context.session.hook("context", (event) => {
    if (!Object.hasOwn(event.tools, "session_backlog_list")) return
    const reminder = `${REMINDER} ${DETAILS[taskDetail()]}`
    if (event.system.some((part) => part.type === "text" && part.text === reminder)) return
    event.system.push({ type: "text", text: reminder })
  })
  await context.session.hook("compaction", (event) => {
    if (!Object.hasOwn(event.tools, "session_backlog_list")) return
    if (event.system.some((part) => part.type === "text" && part.text === COMPACTION_REMINDER)) return
    event.system.push({ type: "text", text: COMPACTION_REMINDER })
  })
}
