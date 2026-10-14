import { parseArgs } from "node:util";
import { Sandbox } from "../../core/Sandbox.js";
import type { Command } from "../context.js";
import { requireName } from "./options.js";

export const shellCommand: Command = {
  name: "shell",
  summary: "open an interactive shell inside a sandbox",
  dryRunnable: true,
  async execute(argv, ctx) {
    const { positionals } = parseArgs({ args: argv, allowPositionals: true });
    const sandbox = Sandbox.open(requireName(positionals, "airlock shell <name>"), ctx.runner);
    return ctx.session.run(sandbox, "bash", { tty: true });
  },
};
