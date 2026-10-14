import { join } from "node:path";
import type { Freezer } from "../backend/Backend.js";
import { type NeutraliseResult, Neutraliser } from "../importer/Neutraliser.js";
import type { WalkOptions } from "../scan/walk.js";
import { DirLock } from "./DirLock.js";
import type { Reporter } from "./Reporter.js";
import type { SandboxPaths } from "./SandboxPaths.js";

interface Cleaner {
  pending(paths: SandboxPaths, limits?: WalkOptions): boolean;
  run(paths: SandboxPaths, bucket: string, limits?: WalkOptions): Promise<NeutraliseResult>;
}

export const TRIPWIRE_LIMITS: WalkOptions = { maxEntries: 200_000, deadlineMs: 15_000 };

export const sweepLock = (paths: SandboxPaths, maxWaitMs?: number): DirLock =>
  new DirLock(join(paths.dir, ".sweep.lock"), { maxWaitMs });

export class Tripwire {
  private readonly backend: Freezer;
  private readonly neutraliser: Cleaner;
  private readonly limits: WalkOptions;
  private readonly lockWaitMs: number;

  constructor(deps: {
    backend: Freezer;
    neutraliser?: Cleaner;
    limits?: WalkOptions;
    lockWaitMs?: number;
  }) {
    this.backend = deps.backend;
    this.neutraliser = deps.neutraliser ?? new Neutraliser();
    this.limits = deps.limits ?? TRIPWIRE_LIMITS;
    this.lockWaitMs = deps.lockWaitMs ?? 30_000;
  }

  async run(paths: SandboxPaths): Promise<string[]> {
    if (!this.neutraliser.pending(paths, this.limits)) return [];
    const result = await sweepLock(paths, this.lockWaitMs).hold(() =>
      this.backend.freeze(paths.name, () =>
        this.neutraliser.run(paths, `tripwire-${Date.now()}`, this.limits),
      ),
    );
    return [...result.moved, ...result.removedLinks, ...result.removedGit];
  }
}

export const reportPlanted = (reporter: Reporter, planted: readonly string[]): void => {
  for (const path of planted) {
    reporter.warn(`tripwire: found ${path} in the workspace; removed or quarantined`);
  }
};
