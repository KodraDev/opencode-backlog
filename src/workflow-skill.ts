import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Skill, type Plugin } from "@opencode/plugin"
import { LIGHTWEIGHT_NOTES_MAX, type TaskDetail } from "./settings.js"

const ID = "kodradev-backlog"
const REMINDER = "Backlog: actionable work only. List first; reuse tasks; todo → doing → done truthfully. One small step per task, short title; no duplicated plan. Resume: list and read relevant Doing tasks. Respect scope; deletion needs user authorization."
const DETAILS: Record<TaskDetail, string> = {
  lightweight: `Lightweight mode: every new task needs notes with one short description (max ${LIGHTWEIGHT_NOTES_MAX} characters). Keep only essential context; no repeated plan or progress log. Do not load the workflow skill unless needed.`,
  detailed: "Detailed mode: brief notes for complex tasks: objective, scope/constraints, completion criteria, progress, next step, blockers. One short line per field; update only meaningful changes or handoffs, never append logs.",
}
const COMPACTION_REMINDER = "Preserve relevant task IDs, scope, blocker and next step. Claim saved notes only after successful writes. Resume: list backlog and read Doing tasks; do not duplicate tasks or change scope."

export async function registerWorkflowSkill(context: Plugin.Context, taskDetail: () => TaskDetail): Promise<void> {
  const path = fileURLToPath(new URL("../skills/kodradev-backlog/SKILL.md", import.meta.url))
  const content = readFileSync(path, "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
  await context.skill.transform((editor) => {
    editor.add({
      id: Skill.ID.make(ID),
      name: Skill.Name.make(ID),
      description: "Track actionable work with KodraDev Backlog. Use when implementing, fixing, investigating, configuring, building, or publishing with session_backlog_* tools.",
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
