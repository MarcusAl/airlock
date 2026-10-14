import type { ProcessRunner } from "../../process/ProcessRunner.js";
import type { Backend, ExecRequest, SandboxSpec, SandboxStatus } from "../Backend.js";
import { appRunArgs, execArgs, serviceRunArgs } from "./args.js";
import { DockerClient } from "./DockerClient.js";
import { Gateway, gatewayHash, hashOf } from "./Gateway.js";
import { ImageBuilder } from "./ImageBuilder.js";
import { names } from "./names.js";
import { PauseControl } from "./PauseControl.js";
import { PortGuard } from "./ports.js";
import { Reconciler } from "./Reconciler.js";

const appHash = ({ policy: _policy, ports: _ports, ...rest }: SandboxSpec): string => hashOf(rest);

export class DockerBackend implements Backend {
  private readonly docker: DockerClient;
  private readonly reconciler: Reconciler;
  private readonly gateway: Gateway;
  private readonly pauses: PauseControl;

  constructor(
    runner: ProcessRunner,
    private readonly images: ImageBuilder = new ImageBuilder(runner),
    ports: PortGuard = new PortGuard(),
  ) {
    this.docker = new DockerClient(runner);
    this.reconciler = new Reconciler(this.docker);
    this.gateway = new Gateway({ docker: this.docker, images, ports, reconciler: this.reconciler });
    this.pauses = new PauseControl(this.docker);
  }

  async up(spec: SandboxSpec): Promise<void> {
    const n = names(spec.name);
    await this.images.ensure(
      spec.image.tag,
      { dockerfile: spec.image.dockerfile },
      spec.image.refresh,
    );
    await this.reconciler.network(spec);
    for (const service of spec.services) {
      await this.reconciler.container(n.service(service), hashOf(service), (hash) =>
        this.docker.run(serviceRunArgs(spec.name, spec.workspace, service, hash)),
      );
    }
    await this.reconciler.volumes(spec);
    await this.reconciler.container(n.app, appHash(spec), (hash) =>
      this.docker.run(appRunArgs(spec, hash)),
    );
    await this.gateway.ensure(spec);
  }

  async resume(spec: SandboxSpec): Promise<boolean> {
    const n = names(spec.name);
    await this.pauses.unpauseIfPaused(n.app);
    const labels = await this.docker.inspect(
      '{{index .Config.Labels "airlock.config"}}',
      n.app,
      n.gateway,
    );
    const [app, gateway] = labels ?? [];
    if (app !== appHash(spec) || gateway !== gatewayHash(spec)) return false;
    return (await this.docker.attempt(["start", n.app, n.gateway])).code === 0;
  }

  freeze<T>(name: string, work: () => Promise<T>): Promise<T> {
    return this.pauses.freeze(names(name).app, work);
  }

  exec(request: ExecRequest): Promise<number> {
    return this.docker.interactive(execArgs(request));
  }

  async owner(name: string): Promise<string | undefined> {
    const homes = await this.docker.lines([
      "ps",
      "-a",
      "--filter",
      `label=airlock.name=${name}`,
      "--format",
      '{{.Label "airlock.home"}}',
    ]);
    return homes.find(Boolean);
  }

  async stop(name: string): Promise<void> {
    const containers = await this.docker.lines([
      "ps",
      "-q",
      "--filter",
      `label=airlock.name=${name}`,
    ]);
    if (containers.length) await this.docker.run(["stop", ...containers]);
  }

  async remove(name: string): Promise<void> {
    const filter = ["--filter", `label=airlock.name=${name}`];
    const containers = await this.docker.lines(["ps", "-aq", ...filter]);
    if (containers.length) await this.docker.run(["rm", "-f", ...containers]);
    const volumes = await this.docker.lines(["volume", "ls", "-q", ...filter]);
    if (volumes.length) await this.docker.run(["volume", "rm", ...volumes]);
    await this.docker.attempt(["network", "rm", names(name).network]);
  }

  async list(): Promise<SandboxStatus[]> {
    const rows = await this.docker.lines([
      "ps",
      "-a",
      "--filter",
      "label=airlock.role=app",
      "--format",
      '{{.Label "airlock.name"}}\t{{.State}}',
    ]);
    return rows.map((row) => {
      const [name = "", state = ""] = row.split("\t");
      return { name, running: state === "running" };
    });
  }
}
