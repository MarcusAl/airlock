import { posix } from "node:path";

export const QUARANTINE_DIRS = [".vscode", ".cursor", ".claude", ".devcontainer", ".idea"];
export const QUARANTINE_FILES = [
  "CLAUDE.md",
  "CLAUDE.local.md",
  "AGENTS.md",
  ".mcp.json",
  ".envrc",
  ".cursorrules",
  "mise.toml",
  ".mise.toml",
];

export const quarantineDir = (rel: string): string | undefined => {
  const segments = rel.split("/");
  const index = segments.findIndex((segment) => QUARANTINE_DIRS.includes(segment));
  return index < 0 ? undefined : segments.slice(0, index + 1).join("/");
};

export const isQuarantined = (rel: string): boolean =>
  quarantineDir(rel) !== undefined ||
  QUARANTINE_FILES.includes(posix.basename(rel)) ||
  rel.endsWith(".code-workspace");
