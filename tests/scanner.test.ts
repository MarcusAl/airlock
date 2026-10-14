import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { Scanner } from "../src/scan/Scanner.js";

const repo = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), "airlock-scan-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
};

const rulesFor = (root: string) =>
  new Scanner().scan(root).map((f) => `${f.severity}:${f.rule}:${f.path}`);

describe("Scanner", () => {
  it("flags lifecycle scripts", () => {
    const root = repo({
      "package.json": JSON.stringify({ scripts: { postinstall: "node x.js" } }),
    });
    expect(rulesFor(root)).toEqual(["high:lifecycle-script:package.json"]);
  });

  it("flags an unparseable package.json", () => {
    expect(rulesFor(repo({ "package.json": '{"scripts":' }))).toEqual([
      "medium:lifecycle-script:package.json",
    ]);
  });

  it("flags editor and agent config", () => {
    const root = repo({
      ".vscode/tasks.json": "{}",
      "docs/CLAUDE.md": "x",
      ".agents/skills/pr/SKILL.md": "x",
    });
    expect(rulesFor(root)).toEqual([
      "medium:editor-agent-config:.agents/skills/pr/SKILL.md",
      "medium:editor-agent-config:.vscode/tasks.json",
      "medium:editor-agent-config:docs/CLAUDE.md",
    ]);
  });

  it("flags editor config below the top level", () => {
    const root = repo({ "packages/web/.vscode/tasks.json": "{}" });
    expect(rulesFor(root)).toEqual(["medium:editor-agent-config:packages/web/.vscode/tasks.json"]);
  });

  it("flags editor-loaded config that executes code", () => {
    const root = repo({ "eslint.config.js": 'require("child_process").exec("curl x")' });
    expect(rulesFor(root)).toEqual(["high:config-executes-code:eslint.config.js"]);
  });

  it("flags long base64 blobs in source", () => {
    const root = repo({ "src/a.js": `const p = "${"QUJD".repeat(150)}";` });
    expect(rulesFor(root)).toEqual(["medium:encoded-blob:src/a.js"]);
  });

  it("flags symlinks that escape the repo", () => {
    const root = repo({ "a.txt": "x" });
    symlinkSync("/etc/hosts", join(root, "link"));
    expect(rulesFor(root)).toEqual(["high:symlink-escape:link"]);
  });

  it("flags symlink chains that escape through a self-link", () => {
    const root = repo({ "a.txt": "x" });
    symlinkSync(".", join(root, "self"));
    symlinkSync("self/..", join(root, "up"));
    expect(rulesFor(root)).toContain("high:symlink-escape:up");
  });

  it("flags nested git repositories", () => {
    const root = repo({ "vendor/x/.git/config": '[filter "evil"]\n\tclean = sh -c id' });
    expect(rulesFor(root)).toEqual(["high:nested-git:vendor/x/.git"]);
  });

  it("ignores node_modules and reports nothing for a clean repo", () => {
    const root = repo({
      "src/a.ts": "export const a = 1;",
      "node_modules/x/package.json": '{"scripts":{"postinstall":"x"}}',
    });
    expect(rulesFor(root)).toEqual([]);
  });
});
