import { isAbsolute, relative } from "node:path";
import { FILE_TOOLS, fileDecision, nativeReal } from "./filePolicy.js";
import { decision, deny, type HookOutput, rewrite } from "./hookOutput.js";
import { route } from "./route.js";

export interface HookContext {
  readonly sandbox: string;
  readonly workspace: string;
  readonly airlock: readonly string[];
}

export type { HookOutput };

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

const relCwd = (workspace: string, cwd: string): string => {
  const rel = relative(workspace, cwd);
  return rel.startsWith("..") || isAbsolute(rel) ? "." : rel || ".";
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
  if (routed.kind === "deny") return deny(routed.reason);
  return rewrite(toolInput, routed.command, routed.kind === "box");
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
