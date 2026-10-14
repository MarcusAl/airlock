import { AirlockError } from "../../errors.js";
import { type CaptureResult, type ProcessRunner, timedOut } from "../../process/ProcessRunner.js";
import { explainDockerError } from "./explain.js";

const QUICK_MS = 60_000;
const SLOW_MS = 15 * 60_000;
const SLOW_COMMANDS = new Set(["build", "run", "create", "pull", "stop"]);

const lines = (out: string): string[] =>
  out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export const timeoutFor = (args: readonly string[]): number =>
  SLOW_COMMANDS.has(args[0] ?? "") ? SLOW_MS : QUICK_MS;

export const failure = (args: readonly string[], result: CaptureResult): AirlockError => {
  if (timedOut(result)) {
    return new AirlockError(
      `docker ${args[0]} didn't finish in time; is Docker running and responsive? (${result.stderr.trim()})`,
    );
  }
  const explanation = explainDockerError(result.stderr);
  return new AirlockError(explanation ?? `docker ${args[0]} failed: ${result.stderr.trim()}`);
};

export class DockerClient {
  constructor(private readonly runner: ProcessRunner) {}

  async run(args: readonly string[]): Promise<string> {
    const result = await this.attempt(args);
    if (result.code !== 0) throw failure(args, result);
    return result.stdout;
  }

  attempt(args: readonly string[]): Promise<CaptureResult> {
    return this.runner.capture("docker", args, { timeoutMs: timeoutFor(args) });
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
