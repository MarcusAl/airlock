import { readdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { Sandbox } from "../../core/Sandbox.js";
import { PRESETS } from "../../presets/presets.js";
import type { Command } from "../context.js";
import { isInteractive, requireName } from "./options.js";

export const installCommand: Command = {
  name: "install",
  summary: "install dependencies with the preset's package manager (registries only)",
  dryRunnable: true,
  async execute(argv, ctx) {
    const { positionals } = parseArgs({ args: argv, allowPositionals: true });
    const sandbox = Sandbox.open(requireName(positionals, "airlock install <name>"));
    const state = sandbox.store.load();
    const files = new Set(readdirSync(sandbox.paths.workspace));
    const command = PRESETS[state.preset].installCommand(files);
    const closed = state.net === "none";
    try {
      return await ctx.session.run(sandbox, command, {
        changes: closed ? { net: "allowlist" } : {},
        persist: !closed,
        tty: isInteractive(),
      });
    } finally {
      if (closed) await ctx.launcher.start(sandbox);
    }
  },
};
