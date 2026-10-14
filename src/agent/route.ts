import { posix } from "node:path";
import { parse, quote } from "shell-quote";
import { SAFE_GIT_FLAGS } from "../process/Git.js";

export type RouteDecision =
  | { readonly kind: "host"; readonly command: string }
  | { readonly kind: "box"; readonly command: string }
  | { readonly kind: "deny"; readonly reason: string };

export interface RouteContext {
  readonly sandbox: string;
  readonly relCwd: string;
  readonly airlock: readonly string[];
}

export const GIT_RULES =
  "In this airlock sandbox, git writes run on your host and must be one plain command on one line: " +
  "`git add <paths>|-A`, `git commit -m '<message>'` (single quotes; repeat -m for paragraphs; no $(...), backticks, heredocs or -F; " +
  "--amend needs -m or --no-edit), or `git restore [--staged] <paths>`. " +
  "Push, fetch and other git writes are unavailable; the user exports or promotes the sandbox.";

const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f]/;

const WRITE_SUBCOMMANDS = new Set([
  "add",
  "commit",
  "restore",
  "reset",
  "checkout",
  "switch",
  "merge",
  "rebase",
  "cherry-pick",
  "revert",
  "stash",
  "tag",
  "push",
  "pull",
  "fetch",
  "am",
  "apply",
  "clean",
  "rm",
  "mv",
  "branch",
  "config",
  "init",
  "notes",
  "update-ref",
  "commit-tree",
  "gc",
  "submodule",
  "worktree",
  "remote",
  "clone",
]);

type Validator = (args: readonly string[]) => boolean;

const isSafePath = (arg: string): boolean =>
  !arg.startsWith("-") &&
  !posix.isAbsolute(arg) &&
  !arg.startsWith("~") &&
  !arg.split("/").includes("..");

const flagsOrPaths =
  (flags: readonly string[]): Validator =>
  (args) =>
    args.every((arg) => arg === "--" || flags.includes(arg) || isSafePath(arg));

const COMMIT_VALUE = new Set(["-m", "--message", "-am"]);
const COMMIT_BOOL = new Set([
  "-a",
  "--all",
  "--amend",
  "--no-edit",
  "--allow-empty",
  "-q",
  "--quiet",
  "--",
]);

const commitArgs: Validator = (args) => {
  let hasMessage = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (COMMIT_VALUE.has(arg)) {
      i++;
      if (args[i] === undefined) return false;
      hasMessage = true;
    } else if (arg.startsWith("--message=") || arg === "--no-edit") {
      hasMessage = true;
    } else if (!COMMIT_BOOL.has(arg) && !isSafePath(arg)) {
      return false;
    }
  }
  return hasMessage;
};

const HOST_GIT: Record<string, Validator> = {
  add: flagsOrPaths(["-A", "--all", "-u", "--update"]),
  commit: commitArgs,
  restore: flagsOrPaths(["--staged", "-S", "--worktree", "-W"]),
};

type Tokens = ReturnType<typeof parse>;

const literalWords = (command: string, tokens: Tokens, expands: boolean): string[] | undefined => {
  if (expands || CONTROL.test(command)) return undefined;
  return tokens.every((t) => typeof t === "string" && !t.includes("`"))
    ? (tokens as string[])
    : undefined;
};

const hostGit = (words: readonly string[] | undefined): string | undefined => {
  if (!words || words[0] !== "git") return undefined;
  const validate = HOST_GIT[words[1] ?? ""];
  return validate?.(words.slice(2))
    ? quote(["git", ...SAFE_GIT_FLAGS, ...words.slice(1)])
    : undefined;
};

const writesGit = (tokens: Tokens): boolean =>
  tokens.some(
    (token, i) =>
      token === "git" &&
      tokens.slice(i + 1).some((next) => typeof next === "string" && WRITE_SUBCOMMANDS.has(next)),
  );

const boxCommand = (command: string, ctx: RouteContext): string =>
  quote([...ctx.airlock, "exec", ctx.sandbox, "--cwd", ctx.relCwd || ".", `--sh=${command}`]);

export const route = (command: string, ctx: RouteContext): RouteDecision => {
  let expands = false;
  const tokens = parse(command, (key) => {
    expands = true;
    return `$${key}`;
  });
  const host = hostGit(literalWords(command, tokens, expands));
  if (host) return { kind: "host", command: host };
  if (writesGit(tokens)) return { kind: "deny", reason: GIT_RULES };
  return { kind: "box", command: boxCommand(command, ctx) };
};
