import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decide } from "../src/agent/decide.js";
import { routedExecGuard } from "../src/cli/commands/exec.js";
import { DirLock } from "../src/core/DirLock.js";
import { SandboxPaths } from "../src/core/SandboxPaths.js";
import { Neutraliser } from "../src/importer/Neutraliser.js";

afterEach(() => vi.unstubAllEnvs());

const sandboxWith = (files: Record<string, string>): SandboxPaths => {
  const paths = SandboxPaths.for("demo", mkdtempSync(join(tmpdir(), "airlock-inv-")));
  mkdirSync(paths.workspace, { recursive: true });
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(paths.workspace, path, ".."), { recursive: true });
    writeFileSync(join(paths.workspace, path), body);
  }
  execFileSync("git", ["init", "-q"], { cwd: paths.workspace });
  return paths;
};

describe("routed exec", () => {
  it("refuses --env when the command came through the hook", () => {
    vi.stubEnv("AIRLOCK_ROUTED", "1");
    expect(() => routedExecGuard({ env: ["GITHUB_TOKEN"] })).toThrow(/not allowed for routed/);
  });

  it("allows --env when you run exec yourself", () => {
    expect(() => routedExecGuard({ env: ["GITHUB_TOKEN"] })).not.toThrow();
  });
});

describe("DirLock", () => {
  it("breaks a lock whose holder process is gone", async () => {
    const dir = mkdtempSync(join(tmpdir(), "airlock-lock-"));
    const lock = join(dir, ".lock");
    mkdirSync(lock);
    writeFileSync(join(lock, "pid"), "999999");
    await expect(new DirLock(lock, { maxWaitMs: 500 }).hold(async () => "ran")).resolves.toBe(
      "ran",
    );
  });

  it("gives up quickly when a live process holds the lock", async () => {
    const dir = mkdtempSync(join(tmpdir(), "airlock-lock-"));
    const lock = join(dir, ".lock");
    mkdirSync(lock);
    writeFileSync(join(lock, "pid"), String(process.pid));
    await expect(new DirLock(lock, { maxWaitMs: 300 }).hold(async () => "ran")).rejects.toThrow(
      /busy/,
    );
  });
});

describe("unreadable directories", () => {
  it("are reported and skipped, and the rest of the sweep still runs", async () => {
    const paths = sandboxWith({ "locked/.vscode/tasks.json": "{}", ".envrc": "evil" });
    chmodSync(join(paths.workspace, "locked"), 0o000);
    const { moved, unreadable } = await new Neutraliser().run(paths, "t");
    chmodSync(join(paths.workspace, "locked"), 0o700);
    expect({ moved, unreadable }).toEqual({ moved: [".envrc"], unreadable: ["locked"] });
  });
});

describe("DirLock ownership", () => {
  it("does not release a lock another process now holds", async () => {
    const lock = join(mkdtempSync(join(tmpdir(), "airlock-lock-")), ".lock");
    await new DirLock(lock).hold(async () => {
      writeFileSync(join(lock, "pid"), "424242");
    });
    expect(existsSync(lock)).toBe(true);
  });
});

describe("hook approval", () => {
  it("approves the commands it rewrites, so no standing allow rule is needed", () => {
    const raw = JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" }, cwd: "/ws" });
    const output = JSON.stringify(
      decide(raw, { sandbox: "demo", workspace: "/ws", airlock: ["n"] }, (p) => p),
    );
    expect(output).toContain('"permissionDecision":"allow"');
  });
});

describe("Glob braces", () => {
  it("denies a brace group that reaches outside the workspace", () => {
    const raw = JSON.stringify({
      tool_name: "Glob",
      tool_input: { pattern: "{/Users/me/.ssh,x}/*" },
      cwd: "/ws",
    });
    const output = JSON.stringify(
      decide(raw, { sandbox: "demo", workspace: "/ws", airlock: ["n"] }, (p) => p),
    );
    expect(output).toContain('"deny"');
  });
});
