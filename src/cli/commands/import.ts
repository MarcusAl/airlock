import { parseArgs } from "node:util";
import { DockerCloner } from "../../backend/docker/DockerCloner.js";
import { AirlockError } from "../../errors.js";
import { defaultName, Importer } from "../../importer/Importer.js";
import { formatReport } from "../../scan/Scanner.js";
import type { Command } from "../context.js";

const nextSteps = (name: string): string[] => [
  "",
  "Next:",
  `  airlock install ${name}        # dependencies, registry-only network`,
  `  airlock run ${name} --port 3000 -- <your dev command>`,
  `  airlock claude ${name}         # your Claude Code, commands routed into the box`,
  "",
  "Edit the files in any editor; nothing runs on your machine unless the editor runs it.",
  "VS Code / Cursor: turn on Workspace Trust (security.workspace.trust.enabled) so the folder opens in Restricted Mode.",
];

export const importCommand: Command = {
  name: "import",
  summary: "clone into a sandbox, scan, quarantine editor/agent config",
  async execute(argv, ctx) {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { name: { type: "string" } },
    });
    const source = positionals[0];
    if (!source) throw new AirlockError("usage: airlock import <https-url|path> [--name n]");
    const name = values.name ?? defaultName(source);
    const result = await new Importer({
      runner: ctx.runner,
      backend: ctx.backend,
      cloner: new DockerCloner(ctx.runner),
    }).import(source, name);
    for (const warning of result.warnings) ctx.out.warn(warning);
    ctx.out.info(`Imported ${name} (${result.state.preset} ${result.state.version}).`);
    ctx.out.info(formatReport(result.findings));
    if (result.moved.length) ctx.out.info(`Quarantined: ${result.moved.join(", ")}`);
    for (const line of nextSteps(name)) ctx.out.info(line);
    return 0;
  },
};
