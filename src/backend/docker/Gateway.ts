import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { AirlockError } from "../../errors.js";
import { LIMITS } from "../../limits.js";
import { compileSquidConfig, GATEWAY_ASSETS } from "../../net/squid.js";
import type { SandboxSpec } from "../Backend.js";
import { gatewayCreateArgs } from "./args.js";
import type { DockerClient } from "./DockerClient.js";
import type { ImageBuilder } from "./ImageBuilder.js";
import { names } from "./names.js";
import type { PortGuard } from "./ports.js";
import type { Reconciler } from "./Reconciler.js";

export const hashOf = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);

const imageTag = (): string => {
  const files = ["Dockerfile", "entrypoint.sh"].map((file) =>
    readFileSync(new URL(file, GATEWAY_ASSETS), "utf8"),
  );
  return `airlock-gateway:${hashOf(files)}`;
};

export const gatewayHash = (spec: SandboxSpec): string =>
  hashOf([imageTag(), compileSquidConfig(spec.policy), spec.ports]);

export class Gateway {
  constructor(
    private readonly deps: {
      docker: DockerClient;
      images: ImageBuilder;
      ports: PortGuard;
      reconciler: Reconciler;
      dryRun: boolean;
    },
  ) {}

  async ensure(spec: SandboxSpec): Promise<void> {
    const image = imageTag();
    await this.deps.images.ensure(image, { context: GATEWAY_ASSETS });
    const container = names(spec.name).gateway;
    await this.deps.reconciler.container(container, gatewayHash(spec), (hash) =>
      this.create(spec, image, hash),
    );
  }

  private async create(spec: SandboxSpec, image: string, hash: string): Promise<void> {
    const n = names(spec.name);
    const squidConf = compileSquidConfig(spec.policy);
    if (!this.deps.dryRun) await this.deps.ports.assertFree(spec.ports);
    await this.deps.docker.run(
      gatewayCreateArgs({
        sandbox: spec.name,
        workspace: spec.workspace,
        image,
        squidConf,
        ports: spec.ports,
        hash,
      }),
    );
    await this.deps.docker.run(["network", "connect", "--alias", "gateway", n.network, n.gateway]);
    await this.deps.docker.run(["start", n.gateway]);
    if (!this.deps.dryRun) await this.assertStaysUp(n.gateway);
  }

  private async assertStaysUp(container: string): Promise<void> {
    for (let check = 0; check < LIMITS.gateway.healthChecks; check++) {
      const [running] = (await this.deps.docker.inspect("{{.State.Running}}", container)) ?? [];
      if (running !== "true") {
        const logs = await this.deps.docker.attempt(["logs", "--tail", "5", container]);
        const tail = `${logs.stdout}${logs.stderr}`.trim();
        throw new AirlockError(`the network gateway stopped right after starting:\n${tail}`);
      }
      await sleep(LIMITS.gateway.healthIntervalMs);
    }
  }
}
