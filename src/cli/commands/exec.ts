import { parseArgs } from "node:util";
import { quote } from "shell-quote";
import { Sandbox } from "../../core/Sandbox.js";
import { AirlockError } from "../../errors.js";
import type { Command } from "../context.js";
import { EXEC_OPTIONS, isInteractive, requireName, splitDash } from "./options.js";

const USAGE = "airlock exec <name> [--cwd dir] [--env KEY] (--sh=<shell command> | -- command...)";

export const routedExecGuard = (values: { env?: readonly string[] }): void => {
  if (process.env.AIRLOCK_ROUTED === "1" && (values.env?.length ?? 0) > 0) {
    throw new AirlockError(
      "--env is not allowed for routed commands; only you can forward variables",
    );
  }
};

export const execCommand: Command = {
  name: "exec",
  summary: "run one command inside a sandbox",
  usage: USAGE,
  dryRunnable: true,
  async execute(argv, ctx) {
    const { own, command } = splitDash(argv);
    const { values, positionals } = parseArgs({
      args: own,
      allowPositionals: true,
      options: { ...EXEC_OPTIONS, sh: { type: "string" } },
    });
    routedExecGuard(values);
    const sandbox = Sandbox.open(requireName(positionals, USAGE));
    const script = values.sh ?? (command.length > 0 ? quote(command) : "");
    if (!script) throw new AirlockError(`usage: ${USAGE}`);
    return ctx.session.run(sandbox, script, {
      cwd: values.cwd,
      envKeys: values.env,
      tty: isInteractive(),
    });
  },
};
