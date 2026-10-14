import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DockerBackend } from "../src/backend/docker/DockerBackend.js";
import { explainDockerError } from "../src/backend/docker/explain.js";
import { PortGuard } from "../src/backend/docker/ports.js";
import { SandboxPaths } from "../src/core/SandboxPaths.js";
import { StateStore } from "../src/core/StateStore.js";
import type { CaptureResult, ProcessRunner } from "../src/process/ProcessRunner.js";
import { ShellRunner } from "../src/process/ProcessRunner.js";

class FailingDocker implements ProcessRunner {
  constructor(private readonly stderr: string) {}

  async capture(): Promise<CaptureResult> {
    return { code: 1, stdout: "", stderr: this.stderr };
  }

  async interactive(): Promise<number> {
    return 1;
  }
}

class EmptyDocker implements ProcessRunner {
  async capture(_cmd: string, args: readonly string[]): Promise<CaptureResult> {
    const inspecting = args[0] === "inspect" || args[1] === "inspect";
    return { code: inspecting ? 1 : 0, stdout: "", stderr: "" };
  }

  async interactive(): Promise<number> {
    return 0;
  }
}

describe("explainDockerError", () => {
  it.each([
    ["Cannot connect to the Docker daemon at unix:///var/run/docker.sock", /isn't running/],
    ["Bind for 127.0.0.1:4173 failed: port is already allocated", /port 4173 is already in use/],
    ["pull access denied for nosuch/image, repository does not exist", /couldn't pull/],
    ["failed to resolve source metadata for docker.io/library/node:99", /couldn't pull/],
  ])("explains %j", (stderr, expected) => {
    expect(explainDockerError(stderr)).toMatch(expected);
  });

  it("returns nothing for errors it doesn't recognise", () => {
    expect(explainDockerError("something else")).toBeUndefined();
  });
});

describe("failure messages", () => {
  it("says when a required program is missing", async () => {
    await expect(new ShellRunner().capture("airlock-no-such-binary", [])).rejects.toThrow(
      /isn't installed or isn't on your PATH/,
    );
  });

  it("says when Docker isn't running", async () => {
    const backend = new DockerBackend(new FailingDocker("Cannot connect to the Docker daemon"));
    await expect(backend.list()).rejects.toThrow(/Docker isn't running/);
  });

  it("says when sandbox state is unreadable", () => {
    const paths = SandboxPaths.for("demo", mkdtempSync(join(tmpdir(), "airlock-state-")));
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.stateFile, "{not json");
    expect(() => new StateStore(paths).load()).toThrow(/state is unreadable/);
  });

  it("refuses to publish a port something else is already using", async () => {
    const server = createServer().listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const spec = {
      name: "demo",
      image: { tag: "t", dockerfile: "FROM x" },
      workspace: "/tmp/ws",
      env: {},
      workspaceVolumes: [],
      policy: { mode: "none" as const, allow: [] },
      ports: [port],
      services: [],
    };
    const backend = new DockerBackend(new EmptyDocker(), undefined, new PortGuard({ attempts: 1 }));
    await expect(backend.up(spec)).rejects.toThrow(new RegExp(`port ${port} is already in use`));
    server.close();
  });

  it("will not resume containers built for a different configuration", async () => {
    const stale: ProcessRunner = {
      capture: async () => ({ code: 0, stdout: "stale-hash true\n", stderr: "" }),
      interactive: async () => 0,
    };
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
    expect(await new DockerBackend(stale).resume(spec)).toBe(false);
  });

  it("waits briefly for a port that is being released", async () => {
    const server = createServer().listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    setTimeout(() => server.close(), 100);
    await expect(new PortGuard({ attempts: 20, delayMs: 50 }).assertFree([port])).resolves.toBe(
      undefined,
    );
  });

  it("reports a gateway that exits right after starting", async () => {
    const dyingGateway: ProcessRunner = {
      capture: async (_cmd, args) => {
        if (args[0] === "logs") return { code: 0, stdout: "", stderr: "FATAL: Bungled squid.conf" };
        if (args.includes("{{.State.Running}}")) return { code: 0, stdout: "false\n", stderr: "" };
        const inspecting = args[0] === "inspect" || args[1] === "inspect";
        return { code: inspecting ? 1 : 0, stdout: "", stderr: "" };
      },
      interactive: async () => 0,
    };
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
    await expect(new DockerBackend(dyingGateway).up(spec)).rejects.toThrow(
      /gateway stopped.*Bungled/s,
    );
  });
});
