import { posix } from "node:path";

export const QUARANTINE_DIRS = [
  ".agents",
  ".vscode",
  ".cursor",
  ".claude",
  ".devcontainer",
  ".idea",
  ".zed",
  ".gemini",
  ".windsurf",
  ".mise",
];

export const QUARANTINE_FILES = [
  "CLAUDE.md",
  "CLAUDE.local.md",
  "AGENTS.md",
  "GEMINI.md",
  ".mcp.json",
  ".envrc",
  ".cursorrules",
  "mise.toml",
  ".mise.toml",
  "mise.local.toml",
  ".mise.local.toml",
  ".nvim.lua",
  ".exrc",
  ".lazy.lua",
];

const QUARANTINE_PATHS = [".config/mise", ".config/mise.toml", ".github/copilot-instructions.md"];

const underPath = (rel: string): string | undefined =>
  QUARANTINE_PATHS.find((path) => rel === path || rel.startsWith(`${path}/`));

export const quarantineDir = (rel: string): string | undefined => {
  const path = underPath(rel);
  if (path && path !== rel) return path;
  const segments = rel.split("/");
  const index = segments.findIndex((segment) => QUARANTINE_DIRS.includes(segment));
  return index < 0 ? undefined : segments.slice(0, index + 1).join("/");
};

export const isQuarantined = (rel: string): boolean =>
  quarantineDir(rel) !== undefined ||
  underPath(rel) !== undefined ||
  QUARANTINE_FILES.includes(posix.basename(rel)) ||
  rel.endsWith(".code-workspace");
