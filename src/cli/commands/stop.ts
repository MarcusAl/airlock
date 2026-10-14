import { parseArgs } from "node:util";
import { Sandbox } from "../../core/Sandbox.js";
import type { Command } from "../context.js";
import { requireName } from "./options.js";

export const stopCommand: Command = {
  name: "stop",
  summary: "stop a sandbox's containers (and anything still running in them)",
  dryRunnable: true,
  async execute(argv, ctx) {
    const { positionals } = parseArgs({ args: argv, allowPositionals: true });
    const sandbox = Sandbox.open(requireName(positionals, "airlock stop <name>"));
    await ctx.backend.stop(sandbox.paths.name);
    ctx.out.info(`Stopped ${sandbox.paths.name}`);
    return 0;
  },
};
