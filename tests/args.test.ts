import { describe, expect, it } from "vitest";
import type { SandboxSpec } from "../src/backend/Backend.js";
import { appRunArgs, execArgs, gatewayCreateArgs } from "../src/backend/docker/args.js";

const spec: SandboxSpec = {
  name: "demo",
  image: { tag: "airlock-node:24-abc", dockerfile: "FROM node:24-bookworm-slim" },
  workspace: "/Users/me/sandboxes/demo/workspace",
  env: { DATABASE_URL: "postgres://postgres:airlock@postgres:5432/postgres" },
  workspaceVolumes: ["node_modules"],
  policy: { mode: "none", allow: [] },
  ports: [4173],
  services: ["postgres"],
};

const pairs = (args: string[], flag: string): string[] =>
  args.flatMap((arg, i) => (arg === flag ? [args[i + 1] ?? ""] : []));

describe("appRunArgs", () => {
  const args = appRunArgs(spec, "h1");

  it("drops privileges and makes the root filesystem read-only", () => {
    expect(args).toEqual(
      expect.arrayContaining(["--cap-drop", "ALL", "--read-only", "--user", "1000:1000"]),
    );
    expect(pairs(args, "--security-opt")).toContain("no-new-privileges");
  });

  it("joins only the sandbox's internal network", () => {
    expect(pairs(args, "--network")).toEqual(["airlock-demo"]);
  });

  it("never mounts the docker socket", () => {
    expect(args.join(" ")).not.toContain("docker.sock");
  });

  it("mounts .git read-only over the workspace", () => {
    expect(pairs(args, "--mount")).toContain(
      "type=bind,src=/Users/me/sandboxes/demo/workspace/.git,dst=/work/.git,readonly",
    );
  });

  it("keeps node_modules in a volume", () => {
    expect(pairs(args, "--mount")).toContain(
      "type=volume,src=airlock-demo-node_modules,dst=/work/node_modules",
    );
  });

  it("routes egress through the gateway", () => {
    expect(pairs(args, "-e")).toContain("HTTPS_PROXY=http://gateway:3128");
  });

  it("rejects a workspace path that would break --mount parsing", () => {
    expect(() => appRunArgs({ ...spec, workspace: "/tmp/a,b" }, "h1")).toThrow(/comma/);
  });
});

describe("gatewayCreateArgs", () => {
  it("publishes ports on loopback only, to unprivileged gateway ports", () => {
    const args = gatewayCreateArgs({
      sandbox: "demo",
      workspace: "/Users/me/sandboxes/demo/workspace",
      image: "gw",
      squidConf: "x",
      ports: [4173],
      hash: "h",
    });
    expect(pairs(args, "-p")).toEqual(["127.0.0.1:4173:20000"]);
    expect(pairs(args, "-e")).toContain("FORWARDS=20000:app:4173");
  });
});

describe("execArgs", () => {
  it("runs bash -c in the mapped working directory as the sandbox user", () => {
    const args = execArgs({
      name: "demo",
      command: "npm test",
      cwd: "packages/web",
      envKeys: ["API_KEY"],
      tty: false,
    });
    expect(args).toEqual([
      "exec",
      "-i",
      "--user",
      "1000:1000",
      "--workdir",
      "/work/packages/web",
      "-e",
      "API_KEY",
      "airlock-demo",
      "bash",
      "-c",
      "npm test",
    ]);
  });

  it("refuses a working directory outside the workspace", () => {
    expect(() =>
      execArgs({ name: "demo", command: "ls", cwd: "../..", envKeys: [], tty: false }),
    ).toThrow(/outside/);
  });
});
