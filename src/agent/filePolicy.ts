import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { isInside } from "../paths.js";
import { deny, type HookOutput } from "./hookOutput.js";

export interface FileTool {
  readonly fields: readonly string[];
  readonly writes: boolean;
}

export const FILE_TOOLS: Record<string, FileTool> = {
  Read: { fields: ["file_path"], writes: false },
  Edit: { fields: ["file_path"], writes: true },
  MultiEdit: { fields: ["file_path"], writes: true },
  Write: { fields: ["file_path"], writes: true },
  NotebookEdit: { fields: ["notebook_path"], writes: true },
  Grep: { fields: ["path"], writes: false },
  Glob: { fields: ["path", "pattern"], writes: false },
};

export const nativeReal = (path: string): string => {
  let existing = path;
  while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing);
  return join(realpathSync.native(existing), relative(existing, path));
};

const BRACE_ESCAPE = /\{[^}]*(\/|~|\.\.)[^}]*\}/;

const climbsOut = (pattern: string): boolean =>
  pattern.startsWith("~") || pattern.split("/").includes("..") || BRACE_ESCAPE.test(pattern);

const pathOf = (field: string, raw: string, cwd: string): string | undefined => {
  if (field !== "pattern") return resolve(cwd, raw);
  return isAbsolute(raw) ? raw.split(/[*?[{]/)[0] : undefined;
};

export const fileDecision = (
  tool: FileTool,
  toolInput: Record<string, unknown>,
  cwd: string,
  root: string,
  real: (path: string) => string,
): HookOutput => {
  for (const field of tool.fields) {
    const raw = toolInput[field];
    if (field === "pattern" && typeof raw === "string" && climbsOut(raw)) {
      return deny("airlock: files outside the sandbox workspace are off limits");
    }
    const path = typeof raw === "string" ? pathOf(field, raw, cwd) : undefined;
    if (path === undefined) continue;
    const target = real(path);
    if (!isInside(root, target)) {
      return deny("airlock: files outside the sandbox workspace are off limits");
    }
    if (tool.writes && isInside(join(root, ".git"), target)) {
      return deny("airlock: .git is managed by airlock; use git commands");
    }
  }
  return {};
};
