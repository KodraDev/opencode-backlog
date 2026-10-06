import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Skill, type Plugin } from "@opencode/plugin"

const ID = "kodradev-backlog"
const REMINDER = "For actionable work, load the kodradev-backlog skill and first review session_backlog_list. Reuse tasks; track todo → doing → done truthfully. Non-trivial tasks require actionable titles and notes with objective, scope/constraints, completion criteria, progress, next step, and relevant decisions/blockers. Update notes at milestones and before planned compaction. On resume or after compaction, list doing tasks and read relevant full notes with session_backlog_get before acting. Respect selected scope; deletion requires authorization. Informational questions need no task."
const COMPACTION_REMINDER = "Preserve backlog continuity in the summary: include known relevant task IDs, selected scope, current progress, decisions/blockers, and next step. Do not invent task data or claim notes were saved without a successful tool result. On resume, instruct the agent to review session_backlog_list and read relevant doing tasks with session_backlog_get; list notes may be truncated and the summary is not a substitute for persisted notes. Do not change scope or duplicate tasks."

export async function registerWorkflowSkill(context: Plugin.Context): Promise<void> {
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
    if (event.system.some((part) => part.type === "text" && part.text === REMINDER)) return
    event.system.push({ type: "text", text: REMINDER })
  })
  await context.session.hook("compaction", (event) => {
    if (!Object.hasOwn(event.tools, "session_backlog_list")) return
    if (event.system.some((part) => part.type === "text" && part.text === COMPACTION_REMINDER)) return
    event.system.push({ type: "text", text: COMPACTION_REMINDER })
  })
}
