import { fileURLToPath } from "node:url"
import backlog from "../../../dist/index.js"

const databasePath = fileURLToPath(new URL("../../backlog-dev.sqlite", import.meta.url))

export default {
  ...backlog,
  id: "kodradev.backlog-dev",
  setup(context) {
    return backlog.setup({
      ...context,
      options: { ...context.options, databasePath },
    })
  },
}
