import { AirlockError } from "../../errors.js";
import type { CaptureResult, ProcessRunner } from "../../process/ProcessRunner.js";
import { explainDockerError } from "./explain.js";

const lines = (out: string): string[] =>
  out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export class DockerClient {
  constructor(private readonly runner: ProcessRunner) {}

  async run(args: readonly string[]): Promise<string> {
    const result = await this.attempt(args);
    if (result.code !== 0) {
      const explanation = explainDockerError(result.stderr);
      throw new AirlockError(explanation ?? `docker ${args[0]} failed: ${result.stderr.trim()}`);
    }
    return result.stdout;
  }

  attempt(args: readonly string[]): Promise<CaptureResult> {
    return this.runner.capture("docker", args);
  }

  async lines(args: readonly string[]): Promise<string[]> {
    return lines(await this.run(args));
  }

  async inspect(format: string, ...objects: string[]): Promise<string[] | undefined> {
    const result = await this.attempt(["inspect", "-f", format, ...objects]);
    return result.code === 0 ? lines(result.stdout) : undefined;
  }

  async exists(kind: "network" | "volume", name: string): Promise<boolean> {
    return (await this.attempt([kind, "inspect", name])).code === 0;
  }

  interactive(args: readonly string[]): Promise<number> {
    return this.runner.interactive("docker", args);
  }
}
