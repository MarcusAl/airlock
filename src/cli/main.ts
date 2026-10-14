import { readFileSync } from "node:fs";
import { AirlockError } from "../errors.js";
import { claudeCommand } from "./commands/claude.js";
import { execCommand } from "./commands/exec.js";
import { exportCommand } from "./commands/export.js";
import { importCommand } from "./commands/import.js";
import { installCommand } from "./commands/install.js";
import { lsCommand } from "./commands/ls.js";
import { promoteCommand } from "./commands/promote.js";
import { rmCommand } from "./commands/rm.js";
import { runCommand as runSandboxCommand } from "./commands/run.js";
import { shellCommand } from "./commands/shell.js";
import { stopCommand } from "./commands/stop.js";
import { type Command, createContext } from "./context.js";

const COMMANDS: readonly Command[] = [
  importCommand,
  installCommand,
  runSandboxCommand,
  execCommand,
  shellCommand,
  claudeCommand,
  exportCommand,
  promoteCommand,
  lsCommand,
  stopCommand,
  rmCommand,
];

const version = (): string =>
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

const help = (): string =>
  [
    "usage: airlock <command> [args]   (airlock <command> --help for details)",
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

const isParseError = (error: unknown): boolean =>
  String((error as NodeJS.ErrnoException).code ?? "").startsWith("ERR_PARSE_ARGS");

const describe = (error: unknown, command?: Command): string => {
  if (error instanceof AirlockError) return error.message;
  if (isParseError(error) && command) {
    return `${(error as Error).message.split(". ")[0]}; see airlock ${command.name} --help`;
  }
  if (process.env.AIRLOCK_DEBUG)
    return error instanceof Error ? (error.stack ?? error.message) : String(error);
  const message = error instanceof Error ? error.message : String(error);
  return `unexpected error: ${message} (set AIRLOCK_DEBUG=1 for details)`;
};

const runCommand = async (command: Command, args: string[], dryRun: boolean): Promise<number> => {
  try {
    if (dryRun && !command.dryRunnable) {
      throw new AirlockError(`--dry-run is not supported by ${command.name}`);
    }
    return await command.execute(args, createContext({ dryRun }));
  } catch (error) {
    process.stderr.write(`airlock: ${describe(error, command)}\n`);
    return 1;
  }
};

const HELP_NAMES = new Set([undefined, "help", "--help", "-h"]);

const unknown = (name: string | undefined): number => {
  if (!HELP_NAMES.has(name)) process.stderr.write(`airlock: unknown command: ${name}\n`);
  process.stdout.write(`${help()}\n`);
  return HELP_NAMES.has(name) ? 0 : 1;
};

const wantsHelp = (args: readonly string[]): boolean => {
  const cut = args.indexOf("--");
  return (cut < 0 ? args : args.slice(0, cut)).some((a) => a === "--help" || a === "-h");
};

export const main = async (argv: string[]): Promise<number> => {
  const { dryRun, args } = splitDryRun(argv);
  const [name, ...rest] = args;
  if (name === "--version") {
    process.stdout.write(`${version()}\n`);
    return 0;
  }
  const command = COMMANDS.find((c) => c.name === name);
  if (!command) return unknown(name);
  if (wantsHelp(rest)) {
    process.stdout.write(`usage: ${command.usage}\n\n${command.summary}\n`);
    return 0;
  }
  return runCommand(command, rest, dryRun);
};
