import type { Backend } from "../backend/Backend.js";
import { ignoringSignals } from "../process/signals.js";
import type { Reporter } from "./Reporter.js";
import type { Sandbox } from "./Sandbox.js";
import type { SandboxLauncher, StateChanges } from "./SandboxLauncher.js";
import { specFor } from "./specFor.js";
import { reportPlanted, Tripwire } from "./Tripwire.js";

export interface ExecOptions {
  readonly cwd?: string;
  readonly envKeys?: readonly string[];
  readonly tty?: boolean;
  readonly changes?: StateChanges;
  readonly persist?: boolean;
  readonly refresh?: boolean;
}

const hasChanges = (changes: StateChanges | undefined): boolean =>
  changes !== undefined && Object.values(changes).some((value) => value !== undefined);

export class ExecSession {
  private readonly tripwire: Tripwire;

  constructor(
    private readonly deps: {
      launcher: SandboxLauncher;
      backend: Backend;
      reporter: Reporter;
      dryRun?: boolean;
      tripwire?: Tripwire;
    },
  ) {
    this.tripwire = deps.tripwire ?? new Tripwire({ backend: deps.backend });
  }

  async run(sandbox: Sandbox, command: string, options: ExecOptions = {}): Promise<number> {
    await this.ensureUp(sandbox, options);
    try {
      return await this.deps.backend.exec({
        name: sandbox.paths.name,
        command,
        cwd: options.cwd ?? ".",
        envKeys: options.envKeys ?? [],
        tty: options.tty ?? false,
      });
    } finally {
      await this.sweep(sandbox);
    }
  }

  private async ensureUp(sandbox: Sandbox, options: ExecOptions): Promise<void> {
    const fast = !hasChanges(options.changes) && !options.refresh;
    const spec = specFor(sandbox.store.load(), sandbox.paths);
    if (fast && (await this.deps.backend.resume(spec))) return;
    await this.deps.launcher.start(sandbox, options.changes, {
      persist: options.persist,
      refresh: options.refresh,
    });
  }

  private async sweep(sandbox: Sandbox): Promise<void> {
    if (this.deps.dryRun) return;
    await ignoringSignals(async () => {
      try {
        reportPlanted(this.deps.reporter, await this.tripwire.run(sandbox.paths));
      } catch (error) {
        this.deps.reporter.warn(
          `tripwire could not check the workspace: ${(error as Error).message}`,
        );
      }
    });
  }
}
