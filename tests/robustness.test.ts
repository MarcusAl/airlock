import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "shell-quote";
import { describe, expect, it } from "vitest";
import { decide } from "../src/agent/decide.js";
import { boxCommandPrefix } from "../src/agent/route.js";
import { DockerBackend } from "../src/backend/docker/DockerBackend.js";
import { SandboxPaths } from "../src/core/SandboxPaths.js";
import { Tripwire } from "../src/core/Tripwire.js";
import { Neutraliser } from "../src/importer/Neutraliser.js";
import type { CaptureResult, ProcessRunner } from "../src/process/ProcessRunner.js";

const hookCtx = { sandbox: "demo", workspace: "/ws", airlock: ["node", "cli.js"] };
const decisionOf = (input: object): string => {
  const output = decide(JSON.stringify(input), hookCtx, (p) => p) as {
    hookSpecificOutput?: { permissionDecision?: string };
  };
  return output.hookSpecificOutput?.permissionDecision ?? "pass";
};

const scripted = (reply: (args: readonly string[]) => CaptureResult): ProcessRunner => ({
  capture: async (_cmd, args) => reply(args),
  interactive: async () => 0,
});

const ok = (stdout = ""): CaptureResult => ({ code: 0, stdout, stderr: "" });

const sandboxWith = (files: Record<string, string>): SandboxPaths => {
  const paths = SandboxPaths.for("demo", mkdtempSync(join(tmpdir(), "airlock-rob-")));
  mkdirSync(paths.workspace, { recursive: true });
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(paths.workspace, path, ".."), { recursive: true });
    writeFileSync(join(paths.workspace, path), body);
  }
  execFileSync("git", ["init", "-q"], { cwd: paths.workspace });
  return paths;
};

const recordingFreezer = (events: string[]) => ({
  freeze: async <T>(_name: string, work: () => Promise<T>) => {
    events.push("pause");
    try {
      return await work();
    } finally {
      events.push("unpause");
    }
  },
});

describe("hook policy gaps", () => {
  it.each(["../../.ssh/*", "~/.aws/*"])("denies a Glob pattern %s that climbs out", (pattern) => {
    expect(decisionOf({ tool_name: "Glob", tool_input: { pattern }, cwd: "/ws" })).toBe("deny");
  });

  it.each(["Agent", "Task"])("denies %s with isolation, which runs outside the box", (tool) => {
    const input = { tool_name: tool, tool_input: { isolation: "worktree" }, cwd: "/ws" };
    expect(decisionOf(input)).toBe("deny");
  });
});

describe("routed command permissions", () => {
  it("pre-approves exactly the prefix the hook rewrites commands to", () => {
    const prefix = boxCommandPrefix({ sandbox: "demo", relCwd: ".", airlock: ["/n", "/c.js"] });
    expect(parse(prefix)).toEqual(["/n", "/c.js", "exec", "demo"]);
  });
});

describe("Tripwire", () => {
  it("does not pause the box when there is nothing to clean", async () => {
    const events: string[] = [];
    const paths = sandboxWith({ "src/a.ts": "1" });
    await new Tripwire({ backend: recordingFreezer(events) }).run(paths);
    expect(events).toEqual([]);
  });

  it("pauses the box when it has something to clean", async () => {
    const events: string[] = [];
    const paths = sandboxWith({ ".vscode/tasks.json": "{}" });
    await new Tripwire({ backend: recordingFreezer(events) }).run(paths);
    expect(events).toEqual(["pause", "unpause"]);
  });
});

describe("Neutraliser", () => {
  it("recovers an unreadable directory and still quarantines what it hides", async () => {
    const paths = sandboxWith({ "locked/.vscode/tasks.json": "{}" });
    chmodSync(join(paths.workspace, "locked"), 0o000);
    const { moved } = await new Neutraliser().run(paths, "t");
    expect(moved).toEqual(["locked/.vscode"]);
  });

  it("treats a file another sweep already moved as handled", async () => {
    const paths = sandboxWith({ "CLAUDE.md": "x" });
    const first = new Neutraliser().run(paths, "a");
    const second = new Neutraliser().run(paths, "b");
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(existsSync(join(paths.workspace, "CLAUDE.md"))).toBe(false);
  });
});

describe("DockerBackend pause handling", () => {
  it("fails loudly when it cannot unpause the box", async () => {
    const runner = scripted((args) =>
      args[0] === "unpause" ? { code: 1, stdout: "", stderr: "boom" } : ok(),
    );
    await expect(new DockerBackend(runner).freeze("demo", async () => 1)).rejects.toThrow(
      /could not unpause/,
    );
  });

  it("unpauses a box that was left paused before resuming it", async () => {
    const calls: string[] = [];
    const runner = scripted((args) => {
      calls.push(args[0] ?? "");
      if (args.includes("{{.State.Paused}}")) return ok("true\n");
      return args[0] === "unpause" ? ok() : { code: 1, stdout: "", stderr: "" };
    });
    const spec = {
      name: "demo",
      image: { tag: "t", dockerfile: "FROM x" },
      workspace: "/tmp/ws",
      env: {},
      workspaceVolumes: [],
      policy: { mode: "none" as const, allow: [] },
      ports: [],
      services: [],
    };
    await new DockerBackend(runner).resume(spec);
    expect(calls).toContain("unpause");
  });
});
