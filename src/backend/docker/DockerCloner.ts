import { AirlockError } from "../../errors.js";
import { LIMITS } from "../../limits.js";
import type { ProcessRunner } from "../../process/ProcessRunner.js";
import type { Cloner, CloneSource } from "../Backend.js";
import { cloneArgs } from "./args.js";

export class DockerCloner implements Cloner {
  constructor(private readonly runner: ProcessRunner) {}

  async clone(source: CloneSource, destination: string): Promise<void> {
    const result = await this.runner.capture(
      "docker",
      cloneArgs(source.url, destination, source.localPath),
      { timeoutMs: LIMITS.docker.cloneMs },
    );
    if (result.code !== 0) {
      throw new AirlockError(
        `clone failed: ${result.stderr.trim()}\nPrivate repo? Clone it yourself, then run: airlock import <path>`,
      );
    }
  }
}
