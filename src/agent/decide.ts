import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { isInside } from "../scan/walk.js";
import { route } from "./route.js";

export interface HookContext {
  readonly sandbox: string;
  readonly workspace: string;
  readonly airlock: readonly string[];
}

export type HookOutput = Record<string, unknown>;

const FILE_TOOLS: Record<string, { field: string; writes: boolean }> = {
  Read: { field: "file_path", writes: false },
  Edit: { field: "file_path", writes: true },
  Write: { field: "file_path", writes: true },
  NotebookEdit: { field: "notebook_path", writes: true },
  Grep: { field: "path", writes: false },
  Glob: { field: "path", writes: false },
};

const deny = (reason: string): HookOutput => ({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: reason,
  },
});

const rewrite = (toolInput: Record<string, unknown>, command: string): HookOutput => ({
  hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: { ...toolInput, command } },
});

const nativeReal = (path: string): string => {
  let existing = path;
  while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing);
  return join(realpathSync.native(existing), relative(existing, path));
};

const relCwd = (workspace: string, cwd: unknown): string => {
  const rel = typeof cwd === "string" ? relative(workspace, cwd) : "";
  return rel.startsWith("..") || isAbsolute(rel) ? "." : rel || ".";
};

const fileDecision = (
  tool: { field: string; writes: boolean },
  toolInput: Record<string, unknown>,
  cwd: string,
  root: string,
  real: (path: string) => string,
): HookOutput => {
  const raw = toolInput[tool.field];
  if (typeof raw !== "string") return {};
  const target = real(resolve(cwd, raw));
  if (!isInside(root, target))
    return deny("airlock: files outside the sandbox workspace are off limits");
  if (tool.writes && isInside(join(root, ".git"), target))
    return deny("airlock: .git is managed by airlock; use git commands");
  return {};
};

export const decide = (
  raw: string,
  ctx: HookContext,
  real: (path: string) => string = nativeReal,
): HookOutput => {
  try {
    const input = JSON.parse(raw);
    const toolInput: Record<string, unknown> = input.tool_input ?? {};
    const cwd = typeof input.cwd === "string" ? input.cwd : ctx.workspace;
    const fileTool = FILE_TOOLS[input.tool_name];
    if (fileTool) return fileDecision(fileTool, toolInput, cwd, real(ctx.workspace), real);
    if (input.tool_name !== "Bash" || typeof toolInput.command !== "string")
      return deny("airlock: unexpected tool input");
    const decision = route(toolInput.command, {
      sandbox: ctx.sandbox,
      relCwd: relCwd(ctx.workspace, cwd),
      airlock: ctx.airlock,
    });
    if (decision.kind === "deny") return deny(decision.reason);
    return rewrite(toolInput, decision.command);
  } catch (error) {
    return deny(`airlock: hook error, refusing to run: ${(error as Error).message}`);
  }
};
