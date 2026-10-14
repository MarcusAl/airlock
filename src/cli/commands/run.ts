import { parseArgs } from "node:util";
import { quote } from "shell-quote";
import { Sandbox } from "../../core/Sandbox.js";
import type { Command } from "../context.js";
import {
  changesFrom,
  EXEC_OPTIONS,
  isInteractive,
  requireName,
  SANDBOX_OPTIONS,
  splitDash,
} from "./options.js";

const USAGE =
  "airlock run <name> [--net none|allowlist|open] [--allow host] [--port p] [--with postgres|redis] [--preset p] [--version v] [--image ref] [--apt pkg] [--rebuild] [--env KEY] [--cwd dir] [-- command]";

export const runCommand: Command = {
  name: "run",
  summary: "start (or reconfigure) a sandbox, optionally running a command",
  dryRunnable: true,
  async execute(argv, ctx) {
    const { own, command } = splitDash(argv);
    const { values, positionals } = parseArgs({
      args: own,
      allowPositionals: true,
      options: { ...SANDBOX_OPTIONS, ...EXEC_OPTIONS },
    });
    const sandbox = Sandbox.open(requireName(positionals, USAGE));
    const changes = changesFrom(values);
    if (command.length > 0) {
      return ctx.session.run(sandbox, quote(command), {
        changes,
        refresh: values.rebuild,
        envKeys: values.env,
        cwd: values.cwd,
        tty: isInteractive(),
      });
    }
    const state = await ctx.launcher.start(sandbox, changes, { refresh: values.rebuild });
    ctx.out.info(`${state.name} is running; network: ${state.net}`);
    for (const port of state.ports) ctx.out.info(`  http://127.0.0.1:${port}`);
    return 0;
  },
};
