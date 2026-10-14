import { fileURLToPath } from "node:url";
import { AirlockError } from "../../errors.js";
import type { ProcessRunner } from "../../process/ProcessRunner.js";

export type ImageSource = { readonly dockerfile: string } | { readonly context: URL };

const hint = (stderr: string): string =>
  /apt-get: (not found|command not found)/.test(stderr)
    ? " (custom base images must be Debian or Ubuntu based)"
    : "";

export class ImageBuilder {
  constructor(private readonly runner: ProcessRunner) {}

  async ensure(tag: string, source: ImageSource, refresh = false): Promise<void> {
    if (!refresh && (await this.runner.capture("docker", ["image", "inspect", tag])).code === 0) {
      return;
    }
    const pull = refresh ? ["--pull"] : [];
    const result =
      "dockerfile" in source
        ? await this.runner.capture("docker", ["build", ...pull, "-t", tag, "-"], {
            input: source.dockerfile,
          })
        : await this.runner.capture("docker", [
            "build",
            ...pull,
            "-t",
            tag,
            fileURLToPath(source.context),
          ]);
    if (result.code !== 0) {
      const detail = result.stderr.trim().split("\n").slice(-5).join("\n");
      throw new AirlockError(`image build failed for ${tag}${hint(result.stderr)}:\n${detail}`);
    }
  }
}
