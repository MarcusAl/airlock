import type { Backend } from "../backend/Backend.js";
import { Neutraliser } from "../importer/Neutraliser.js";
import type { Reporter } from "./Reporter.js";
import type { Sandbox } from "./Sandbox.js";
import type { SandboxLauncher, StateChanges } from "./SandboxLauncher.js";

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
  private readonly neutraliser: Neutraliser;

  constructor(
    private readonly deps: {
      launcher: SandboxLauncher;
      backend: Backend;
      reporter: Reporter;
      dryRun?: boolean;
      neutraliser?: Neutraliser;
    },
  ) {
    this.neutraliser = deps.neutraliser ?? new Neutraliser();
  }

  async run(sandbox: Sandbox, command: string, options: ExecOptions = {}): Promise<number> {
    await this.ensureUp(sandbox, options);
    const code = await this.deps.backend.exec({
      name: sandbox.paths.name,
      command,
      cwd: options.cwd ?? ".",
      envKeys: options.envKeys ?? [],
      tty: options.tty ?? false,
    });
    await this.tripwire(sandbox);
    return code;
  }

  private async ensureUp(sandbox: Sandbox, options: ExecOptions): Promise<void> {
    const fast = !hasChanges(options.changes) && !options.refresh;
    if (fast && (await this.deps.backend.start(sandbox.paths.name))) return;
    await this.deps.launcher.start(sandbox, options.changes, {
      persist: options.persist,
      refresh: options.refresh,
    });
  }

  private async tripwire(sandbox: Sandbox): Promise<void> {
    if (this.deps.dryRun) return;
    const bucket = `tripwire-${Date.now()}`;
    const { moved, removedLinks, removedGit } = await this.neutraliser.run(sandbox.paths, bucket);
    for (const path of [...moved, ...removedLinks, ...removedGit]) {
      this.deps.reporter.warn(`tripwire: found ${path} in the workspace; removed or quarantined`);
    }
  }
}
