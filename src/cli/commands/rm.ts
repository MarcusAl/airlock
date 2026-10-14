import { parseArgs } from "node:util";
import { Sandbox } from "../../core/Sandbox.js";
import { Remover } from "../../lifecycle/Remover.js";
import type { Command } from "../context.js";
import { requireName } from "./options.js";

export const rmCommand: Command = {
  name: "rm",
  summary: "delete a sandbox (refuses if work was never exported or promoted)",
  dryRunnable: true,
  async execute(argv, ctx) {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { force: { type: "boolean" } },
    });
    const sandbox = Sandbox.open(requireName(positionals, "airlock rm <name> [--force]"));
    await new Remover(ctx.backend).remove(sandbox, values.force ?? false, ctx.dryRun);
    ctx.out.info(
      ctx.dryRun ? `would delete ${sandbox.paths.dir}` : `Removed ${sandbox.paths.name}`,
    );
    return 0;
  },
};
