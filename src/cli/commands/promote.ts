import { parseArgs } from "node:util";
import { Sandbox } from "../../core/Sandbox.js";
import { AirlockError } from "../../errors.js";
import { Promoter } from "../../lifecycle/Promoter.js";
import type { Command } from "../context.js";
import { requireName } from "./options.js";

const USAGE = "airlock promote <name> --to <dir> [--force]";

export const promoteCommand: Command = {
  name: "promote",
  summary: "trust the sandbox: copy it out as a normal git repo",
  async execute(argv, ctx) {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { to: { type: "string" }, force: { type: "boolean" } },
    });
    if (!values.to) throw new AirlockError(`usage: ${USAGE}`);
    const sandbox = Sandbox.open(requireName(positionals, USAGE));
    const restored = await new Promoter().promote(sandbox, values.to, values.force ?? false);
    ctx.out.info(`Promoted to ${values.to}`);
    if (restored.length) {
      ctx.out.warn(
        `these quarantined files are back in the promoted copy; review them before opening it in an editor or agent: ${restored.join(", ")}`,
      );
    }
    return 0;
  },
};
