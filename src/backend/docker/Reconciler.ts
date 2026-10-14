import type { SandboxSpec } from "../Backend.js";
import { chownVolumeArgs } from "./args.js";
import type { DockerClient } from "./DockerClient.js";
import { homeLabel, names } from "./names.js";

export class Reconciler {
  constructor(private readonly docker: DockerClient) {}

  async network(spec: SandboxSpec): Promise<void> {
    const network = names(spec.name).network;
    if (await this.docker.exists("network", network)) return;
    await this.docker.run(["network", "create", "--internal", ...this.labels(spec), network]);
  }

  async volumes(spec: SandboxSpec): Promise<void> {
    const n = names(spec.name);
    for (const volume of [n.cache, ...spec.workspaceVolumes.map(n.volume)]) {
      if (await this.docker.exists("volume", volume)) continue;
      await this.docker.run(["volume", "create", ...this.labels(spec), volume]);
      await this.docker.run(chownVolumeArgs(volume, spec.image.tag));
    }
  }

  async container(
    name: string,
    hash: string,
    create: (hash: string) => Promise<unknown>,
  ): Promise<void> {
    const format = '{{index .Config.Labels "airlock.config"}} {{.State.Running}}';
    const [state] = (await this.docker.inspect(format, name)) ?? [];
    if (state === undefined) return void (await create(hash));
    const [currentHash, running] = state.split(" ");
    if (currentHash === hash) {
      if (running !== "true") await this.docker.run(["start", name]);
      return;
    }
    await this.docker.run(["rm", "-f", name]);
    await create(hash);
  }

  private labels(spec: SandboxSpec): string[] {
    return ["--label", `airlock.name=${spec.name}`, ...homeLabel(spec.workspace)];
  }
}
