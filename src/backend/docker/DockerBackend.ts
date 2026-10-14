import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AirlockError } from "../../errors.js";
import { compileSquidConfig, GATEWAY_ASSETS } from "../../net/squid.js";
import { IMAGE_UID } from "../../presets/dockerfile.js";
import type { ProcessRunner } from "../../process/ProcessRunner.js";
import type { Backend, ExecRequest, SandboxSpec, SandboxStatus } from "../Backend.js";
import { appRunArgs, execArgs, gatewayCreateArgs, serviceRunArgs } from "./args.js";
import { explainDockerError } from "./explain.js";
import { ImageBuilder } from "./ImageBuilder.js";
import { names } from "./names.js";
import { PortGuard } from "./ports.js";

const hashOf = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);

const gatewayImageTag = (): string => {
  const files = ["Dockerfile", "entrypoint.sh"].map((file) =>
    readFileSync(new URL(file, GATEWAY_ASSETS), "utf8"),
  );
  return `airlock-gateway:${hashOf(files)}`;
};

const appHash = ({ policy: _policy, ports: _ports, ...rest }: SandboxSpec): string => hashOf(rest);

const lines = (out: string): string[] => out.split("\n").filter(Boolean);

const gatewayHash = (spec: SandboxSpec): string =>
  hashOf([gatewayImageTag(), compileSquidConfig(spec.policy), spec.ports]);

export class DockerBackend implements Backend {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly images: ImageBuilder = new ImageBuilder(runner),
    private readonly ports: PortGuard = new PortGuard(),
  ) {}

  async up(spec: SandboxSpec): Promise<void> {
    await this.images.ensure(
      spec.image.tag,
      { dockerfile: spec.image.dockerfile },
      spec.image.refresh,
    );
    await this.ensureNetwork(spec.name);
    for (const service of spec.services) {
      await this.ensureContainer(names(spec.name).service(service), hashOf(service), (hash) =>
        this.docker(serviceRunArgs(spec.name, service, hash)),
      );
    }
    await this.ensureVolumes(spec);
    await this.ensureContainer(names(spec.name).app, appHash(spec), (hash) =>
      this.docker(appRunArgs(spec, hash)),
    );
    await this.ensureGateway(spec);
  }

  async resume(spec: SandboxSpec): Promise<boolean> {
    const n = names(spec.name);
    const inspect = await this.runner.capture("docker", [
      "inspect",
      "-f",
      '{{index .Config.Labels "airlock.config"}}',
      n.app,
      n.gateway,
    ]);
    const [app, gateway] = lines(inspect.stdout).map((line) => line.trim());
    if (inspect.code !== 0 || app !== appHash(spec) || gateway !== gatewayHash(spec)) return false;
    return (await this.runner.capture("docker", ["start", n.app, n.gateway])).code === 0;
  }

  exec(request: ExecRequest): Promise<number> {
    return this.runner.interactive("docker", execArgs(request));
  }

  async remove(name: string): Promise<void> {
    const filter = ["--filter", `label=airlock.name=${name}`];
    const containers = lines(await this.docker(["ps", "-aq", ...filter]));
    if (containers.length) await this.docker(["rm", "-f", ...containers]);
    const volumes = lines(await this.docker(["volume", "ls", "-q", ...filter]));
    if (volumes.length) await this.docker(["volume", "rm", ...volumes]);
    await this.runner.capture("docker", ["network", "rm", names(name).network]);
  }

  async list(): Promise<SandboxStatus[]> {
    const out = await this.docker([
      "ps",
      "-a",
      "--filter",
      "label=airlock.role=app",
      "--format",
      '{{.Label "airlock.name"}}\t{{.State}}',
    ]);
    return lines(out).map((line) => {
      const [name = "", state = ""] = line.split("\t");
      return { name, running: state === "running" };
    });
  }

  private async docker(args: readonly string[]): Promise<string> {
    const result = await this.runner.capture("docker", args);
    if (result.code !== 0) {
      const explanation = explainDockerError(result.stderr);
      throw new AirlockError(explanation ?? `docker ${args[0]} failed: ${result.stderr.trim()}`);
    }
    return result.stdout;
  }

  private async exists(kind: "network" | "volume", name: string): Promise<boolean> {
    return (await this.runner.capture("docker", [kind, "inspect", name])).code === 0;
  }

  private async ensureNetwork(sandbox: string): Promise<void> {
    const network = names(sandbox).network;
    if (await this.exists("network", network)) return;
    await this.docker([
      "network",
      "create",
      "--internal",
      "--label",
      `airlock.name=${sandbox}`,
      network,
    ]);
  }

  private async ensureVolumes(spec: SandboxSpec): Promise<void> {
    const n = names(spec.name);
    for (const volume of [n.cache, n.cursor, ...spec.workspaceVolumes.map(n.volume)]) {
      if (await this.exists("volume", volume)) continue;
      await this.docker(["volume", "create", "--label", `airlock.name=${spec.name}`, volume]);
      await this.docker([
        "run",
        "--rm",
        "--network",
        "none",
        "--user",
        "0",
        "--cap-drop",
        "ALL",
        "--cap-add",
        "CHOWN",
        "--mount",
        `type=volume,src=${volume},dst=/v`,
        spec.image.tag,
        "chown",
        `${IMAGE_UID}:${IMAGE_UID}`,
        "/v",
      ]);
    }
  }

  private async ensureContainer(
    name: string,
    hash: string,
    create: (hash: string) => Promise<unknown>,
  ): Promise<void> {
    const inspect = await this.runner.capture("docker", [
      "inspect",
      "-f",
      '{{index .Config.Labels "airlock.config"}} {{.State.Running}}',
      name,
    ]);
    const [currentHash, running] = inspect.stdout.trim().split(" ");
    if (inspect.code === 0 && currentHash === hash) {
      if (running !== "true") await this.docker(["start", name]);
      return;
    }
    if (inspect.code === 0) await this.docker(["rm", "-f", name]);
    await create(hash);
  }

  private async ensureGateway(spec: SandboxSpec): Promise<void> {
    const image = gatewayImageTag();
    await this.images.ensure(image, { context: GATEWAY_ASSETS });
    const squidConf = compileSquidConfig(spec.policy);
    const n = names(spec.name);
    await this.ensureContainer(n.gateway, gatewayHash(spec), async (hash) => {
      await this.ports.assertFree(spec.ports);
      await this.docker(
        gatewayCreateArgs({ sandbox: spec.name, image, squidConf, ports: spec.ports, hash }),
      );
      await this.docker(["network", "connect", "--alias", "gateway", n.network, n.gateway]);
      await this.docker(["start", n.gateway]);
    });
  }
}
