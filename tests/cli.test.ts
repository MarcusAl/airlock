import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execArgs } from "../src/backend/docker/args.js";
import { DockerBackend } from "../src/backend/docker/DockerBackend.js";
import { main } from "../src/cli/main.js";
import { DryRunRunner, ShellRunner } from "../src/process/ProcessRunner.js";

let out = "";
let err = "";

beforeEach(() => {
  out = "";
  err = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    err += String(chunk);
    return true;
  });
  vi.stubEnv("AIRLOCK_HOME", mkdtempSync(join(tmpdir(), "airlock-cli-")));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("cli", () => {
  it("names an unknown command", async () => {
    expect(await main(["frobnicate"])).toBe(1);
    expect(err).toContain("unknown command: frobnicate");
  });

  it("prints a command's usage for --help", async () => {
    expect(await main(["run", "--help"])).toBe(0);
    expect(out).toContain("usage: airlock run <name>");
  });

  it("explains a bad option without calling it unexpected", async () => {
    expect(await main(["run", "x", "--nope"])).toBe(1);
    expect(err).not.toContain("unexpected error");
    expect(err).toContain("--help");
  });

  it("refuses to stop a sandbox that doesn't exist", async () => {
    expect(await main(["stop", "nosuch"])).toBe(1);
    expect(err).toContain('no sandbox "nosuch"');
  });

  it("says so when there are no sandboxes", async () => {
    expect(await main(["ls"])).toBe(0);
    expect(out).toContain("No sandboxes yet");
  });
});

describe("process limits", () => {
  it("stops a command that runs past its time limit", async () => {
    const result = await new ShellRunner().capture("sleep", ["5"], { timeoutMs: 200 });
    expect(result.stderr).toMatch(/timed out/);
  });
});

describe("exec tagging", () => {
  it("tags each exec so its processes can be stopped later", () => {
    const args = execArgs({
      name: "demo",
      command: "ls",
      cwd: ".",
      envKeys: [],
      tty: false,
      id: "abc",
    });
    expect(args).toContain("AIRLOCK_EXEC_ID=abc");
  });
});

describe("dry run", () => {
  it("plans a sandbox without failing on checks that need it to exist", async () => {
    const backend = new DockerBackend(new DryRunRunner(() => {}), { dryRun: true });
    const spec = {
      name: "demo",
      image: { tag: "t", dockerfile: "FROM x" },
      workspace: "/tmp/ws",
      env: {},
      workspaceVolumes: [],
      policy: { mode: "none" as const, allow: [] },
      ports: [4173],
      services: [],
    };
    await expect(backend.up(spec)).resolves.toBeUndefined();
  });
});

describe("cli lifecycle messages", () => {
  it("refuses to remove a sandbox that doesn't exist", async () => {
    expect(await main(["rm", "nosuch"])).toBe(1);
    expect(err).toContain('no sandbox "nosuch"');
  });
});
