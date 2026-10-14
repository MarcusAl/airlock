import { parseArgs } from "node:util";
import { Sandbox } from "../../core/Sandbox.js";
import { AirlockError } from "../../errors.js";
import { Exporter, type ExportFormat } from "../../lifecycle/Exporter.js";
import type { Command } from "../context.js";
import { requireName } from "./options.js";

const USAGE = "airlock export <name> [--zip|--patch|--bundle] [-o file]";

const formatOf = (values: { zip?: boolean; patch?: boolean; bundle?: boolean }): ExportFormat => {
  const chosen = (["zip", "patch", "bundle"] as const).filter((f) => values[f]);
  if (chosen.length > 1) throw new AirlockError("choose one of --zip, --patch, --bundle");
  return chosen[0] ?? "zip";
};

export const exportCommand: Command = {
  name: "export",
  summary: "write the sandbox's committed work to a zip, patch or git bundle",
  async execute(argv, ctx) {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        zip: { type: "boolean" },
        patch: { type: "boolean" },
        bundle: { type: "boolean" },
        out: { type: "string", short: "o" },
      },
    });
    const sandbox = Sandbox.open(requireName(positionals, USAGE));
    if ((await sandbox.pendingWork()).dirty) {
      ctx.out.warn("uncommitted changes are not included; commit them first to export them");
    }
    const file = await new Exporter().export(sandbox, formatOf(values), values.out);
    ctx.out.info(`Exported to ${file}`);
    return 0;
  },
};
