import type { Backend } from "../backend/Backend.js";
import { DockerBackend } from "../backend/docker/DockerBackend.js";
import { ExecSession } from "../core/ExecSession.js";
import { SandboxLauncher } from "../core/SandboxLauncher.js";
import { DryRunRunner, type ProcessRunner, ShellRunner } from "../process/ProcessRunner.js";
import { Output } from "./output.js";

export interface Context {
  readonly dryRun: boolean;
  readonly runner: ProcessRunner;
  readonly out: Output;
  readonly backend: Backend;
  readonly launcher: SandboxLauncher;
  readonly session: ExecSession;
}

export interface Command {
  readonly name: string;
  readonly summary: string;
  readonly dryRunnable?: boolean;
  execute(argv: string[], ctx: Context): Promise<number>;
}

export const createContext = ({ dryRun }: { dryRun: boolean }): Context => {
  const runner = dryRun ? new DryRunRunner() : new ShellRunner();
  const out = new Output();
  const backend = new DockerBackend(runner);
  const launcher = new SandboxLauncher({ backend, dryRun });
  const session = new ExecSession({ launcher, backend, reporter: out, dryRun });
  return { dryRun, runner, out, backend, launcher, session };
};
