import { fileURLToPath } from "node:url";
import { AirlockError } from "../../errors.js";
import type { ProcessRunner } from "../../process/ProcessRunner.js";
import { failure, timeoutFor } from "./DockerClient.js";

export type ImageSource = { readonly dockerfile: string } | { readonly context: URL };

const notApt = (stderr: string): boolean => /apt-get: (not found|command not found)/.test(stderr);

export class ImageBuilder {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly onBuild: (tag: string) => void = () => {},
  ) {}

  async ensure(tag: string, source: ImageSource, refresh = false): Promise<void> {
    if (!refresh && (await this.exists(tag))) return;
    this.onBuild(tag);
    const args = this.buildArgs(tag, source, refresh);
    const result = await this.runner.capture("docker", args, {
      timeoutMs: timeoutFor(args),
      input: "dockerfile" in source ? source.dockerfile : undefined,
    });
    if (result.code === 0) return;
    if (notApt(result.stderr)) {
      throw new AirlockError(
        `image build failed for ${tag}: custom base images must be Debian or Ubuntu based`,
      );
    }
    throw failure(args, result);
  }

  private async exists(tag: string): Promise<boolean> {
    const args = ["image", "inspect", tag];
    return (await this.runner.capture("docker", args, { timeoutMs: timeoutFor(args) })).code === 0;
  }

  private buildArgs(tag: string, source: ImageSource, refresh: boolean): string[] {
    const pull = refresh ? ["--pull"] : [];
    const context = "dockerfile" in source ? "-" : fileURLToPath(source.context);
    return ["build", ...pull, "-t", tag, context];
  }
}
