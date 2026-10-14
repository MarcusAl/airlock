import { readFileSync } from "node:fs";
import { AirlockError } from "../errors.js";
import { claudeCommand } from "./commands/claude.js";
import { execCommand } from "./commands/exec.js";
import { importCommand } from "./commands/import.js";
import { installCommand } from "./commands/install.js";
import { lsCommand } from "./commands/ls.js";
import { runCommand as runSandboxCommand } from "./commands/run.js";
import { shellCommand } from "./commands/shell.js";
import { type Command, createContext } from "./context.js";

const COMMANDS: readonly Command[] = [
  importCommand,
  installCommand,
  runSandboxCommand,
  execCommand,
  shellCommand,
  claudeCommand,
  lsCommand,
];

const version = (): string =>
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

const help = (): string =>
  [
    "usage: airlock <command> [args] [--dry-run]",
    "",
    ...COMMANDS.map((c) => `  ${c.name.padEnd(9)} ${c.summary}`),
  ].join("\n");

const splitDryRun = (argv: readonly string[]): { dryRun: boolean; args: string[] } => {
  const cut = argv.indexOf("--");
  const head = cut < 0 ? [...argv] : argv.slice(0, cut);
  const tail = cut < 0 ? [] : argv.slice(cut);
  return {
    dryRun: head.includes("--dry-run"),
    args: [...head.filter((a) => a !== "--dry-run"), ...tail],
  };
};

const runCommand = async (command: Command, args: string[], dryRun: boolean): Promise<number> => {
  try {
    if (dryRun && !command.dryRunnable) {
      throw new AirlockError(`--dry-run is not supported by ${command.name}`);
    }
    return await command.execute(args, createContext({ dryRun }));
  } catch (error) {
    if (!(error instanceof AirlockError)) throw error;
    process.stderr.write(`airlock: ${error.message}\n`);
    return 1;
  }
};

export const main = async (argv: string[]): Promise<number> => {
  const { dryRun, args } = splitDryRun(argv);
  const [name, ...rest] = args;
  if (name === "--version") {
    process.stdout.write(`${version()}\n`);
    return 0;
  }
  const command = COMMANDS.find((c) => c.name === name);
  if (!command) {
    process.stdout.write(`${help()}\n`);
    return name === undefined || name === "help" ? 0 : 1;
  }
  return runCommand(command, rest, dryRun);
};
