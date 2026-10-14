import { DryRunRunner, type ProcessRunner, ShellRunner } from "../process/ProcessRunner.js";
import { Output } from "./output.js";

export interface Context {
  readonly dryRun: boolean;
  readonly runner: ProcessRunner;
  readonly out: Output;
}

export interface Command {
  readonly name: string;
  readonly summary: string;
  readonly dryRunnable?: boolean;
  execute(argv: string[], ctx: Context): Promise<number>;
}

export const createContext = ({ dryRun }: { dryRun: boolean }): Context => ({
  dryRun,
  runner: dryRun ? new DryRunRunner() : new ShellRunner(),
  out: new Output(),
});
