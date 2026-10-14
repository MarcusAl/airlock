import { parseArgs } from "node:util";
import { ClaudeLauncher } from "../../agent/ClaudeLauncher.js";
import { Sandbox } from "../../core/Sandbox.js";
import { reportPlanted, Tripwire } from "../../core/Tripwire.js";
import { formatReport, Scanner } from "../../scan/Scanner.js";
import type { Command, Context } from "../context.js";
import { requireName, splitDash } from "./options.js";

const USAGE = "airlock claude <name> [--allow-mcp] [-- claude args...]";

const sweep = async (sandbox: Sandbox, ctx: Context): Promise<void> => {
  reportPlanted(ctx.out, await new Tripwire({ backend: ctx.backend }).run(sandbox.paths));
};

const remindHighFindings = (sandbox: Sandbox, ctx: Context): void => {
  const high = new Scanner().scan(sandbox.paths.workspace).filter((f) => f.severity === "high");
  if (high.length) ctx.out.warn(formatReport(high));
};

export const claudeCommand: Command = {
  name: "claude",
  summary: "start your Claude Code with its commands routed into the sandbox",
  usage: USAGE,
  async execute(argv, ctx) {
    const { own, command } = splitDash(argv);
    const { values, positionals } = parseArgs({
      args: own,
      allowPositionals: true,
      options: { "allow-mcp": { type: "boolean" } },
    });
    const sandbox = Sandbox.open(requireName(positionals, USAGE));
    await sweep(sandbox, ctx);
    remindHighFindings(sandbox, ctx);
    const launcher = new ClaudeLauncher({ runner: ctx.runner, launcher: ctx.launcher });
    return launcher.launch(sandbox, {
      allowMcp: values["allow-mcp"] ?? false,
      passthrough: command,
    });
  },
};
