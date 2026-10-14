import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { isInside } from "../paths.js";
import { route } from "./route.js";

export interface HookContext {
  readonly sandbox: string;
  readonly workspace: string;
  readonly airlock: readonly string[];
}

export type HookOutput = Record<string, unknown>;

interface FileTool {
  readonly fields: readonly string[];
  readonly writes: boolean;
}

const FILE_TOOLS: Record<string, FileTool> = {
  Read: { fields: ["file_path"], writes: false },
  Edit: { fields: ["file_path"], writes: true },
  MultiEdit: { fields: ["file_path"], writes: true },
  Write: { fields: ["file_path"], writes: true },
  NotebookEdit: { fields: ["notebook_path"], writes: true },
  Grep: { fields: ["path"], writes: false },
  Glob: { fields: ["path", "pattern"], writes: false },
};

const INERT_TOOLS = new Set([
  "Task",
  "Agent",
  "TodoWrite",
  "TaskCreate",
  "TaskUpdate",
  "TaskList",
  "TaskGet",
  "ExitPlanMode",
  "EnterPlanMode",
  "AskUserQuestion",
  "Skill",
  "ToolSearch",
  "BashOutput",
  "KillShell",
  "TaskOutput",
  "TaskStop",
]);

const ASK_TOOLS = new Set(["WebFetch", "WebSearch"]);
const ISOLATING_TOOLS = new Set(["Agent", "Task"]);

const decision = (permissionDecision: "deny" | "ask", reason: string): HookOutput => ({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision,
    permissionDecisionReason: reason,
  },
});

const deny = (reason: string): HookOutput => decision("deny", reason);

const rewrite = (toolInput: Record<string, unknown>, command: string): HookOutput => ({
  hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: { ...toolInput, command } },
});

const nativeReal = (path: string): string => {
  let existing = path;
  while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing);
  return join(realpathSync.native(existing), relative(existing, path));
};

const relCwd = (workspace: string, cwd: string): string => {
  const rel = relative(workspace, cwd);
  return rel.startsWith("..") || isAbsolute(rel) ? "." : rel || ".";
};

const BRACE_ESCAPE = /\{[^}]*(\/|~|\.\.)[^}]*\}/;

const climbsOut = (pattern: string): boolean =>
  pattern.startsWith("~") || pattern.split("/").includes("..") || BRACE_ESCAPE.test(pattern);

const pathOf = (field: string, raw: string, cwd: string): string | undefined => {
  if (field !== "pattern") return resolve(cwd, raw);
  return isAbsolute(raw) ? raw.split(/[*?[{]/)[0] : undefined;
};

const fileDecision = (
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

const toolDecision = (
  tool: string,
  toolInput: Record<string, unknown>,
  cwd: string,
  ctx: HookContext,
  real: (path: string) => string,
): HookOutput => {
  const fileTool = FILE_TOOLS[tool];
  if (fileTool) return fileDecision(fileTool, toolInput, cwd, real(ctx.workspace), real);
  if (ISOLATING_TOOLS.has(tool) && toolInput.isolation !== undefined) {
    return deny("airlock: isolated subagents run outside the sandbox; use a plain subagent");
  }
  if (INERT_TOOLS.has(tool)) return {};
  if (ASK_TOOLS.has(tool) || tool.startsWith("mcp__")) {
    return decision("ask", "airlock: this tool reaches outside the sandbox");
  }
  if (tool !== "Bash" || typeof toolInput.command !== "string") {
    return deny(`airlock: ${tool} is not allowed in a sandbox session`);
  }
  const routed = route(toolInput.command, {
    sandbox: ctx.sandbox,
    relCwd: relCwd(ctx.workspace, cwd),
    airlock: ctx.airlock,
  });
  return routed.kind === "deny" ? deny(routed.reason) : rewrite(toolInput, routed.command);
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
    return toolDecision(String(input.tool_name), toolInput, cwd, ctx, real);
  } catch (error) {
    return deny(`airlock: hook error, refusing to run: ${(error as Error).message}`);
  }
};
