import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Skill, type Plugin } from "@opencode/plugin"

const ID = "kodradev-backlog"
const REMINDER = "For tasks requiring actions, follow the kodradev-backlog skill: first review session_backlog_list, reuse relevant tasks, and track todo → doing → done truthfully. Respect the user's selected scope and require authorization for deletion. Informational questions need no task."

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
}
