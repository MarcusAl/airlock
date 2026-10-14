import { AirlockError } from "../../errors.js";
import type { DockerClient } from "./DockerClient.js";

export class PauseControl {
  constructor(private readonly docker: DockerClient) {}

  async freeze<T>(container: string, work: () => Promise<T>): Promise<T> {
    const paused = (await this.docker.attempt(["pause", container])).code === 0;
    try {
      return await work();
    } finally {
      if (paused) await this.unpause(container);
    }
  }

  async unpauseIfPaused(container: string): Promise<void> {
    const [paused] = (await this.docker.inspect("{{.State.Paused}}", container)) ?? [];
    if (paused === "true") await this.unpause(container);
  }

  private async unpause(container: string): Promise<void> {
    const result = await this.docker.attempt(["unpause", container]);
    if (result.code !== 0) {
      throw new AirlockError(
        `could not unpause the sandbox; run: docker unpause ${container} (${result.stderr.trim()})`,
      );
    }
  }
}
