import type { Freezer } from "../backend/Backend.js";
import { type NeutraliseResult, Neutraliser } from "../importer/Neutraliser.js";
import type { WalkOptions } from "../scan/walk.js";
import type { SandboxPaths } from "./SandboxPaths.js";

interface Cleaner {
  run(paths: SandboxPaths, bucket: string, limits?: WalkOptions): Promise<NeutraliseResult>;
}

export class Tripwire {
  private readonly backend: Freezer;
  private readonly neutraliser: Cleaner;
  private readonly limits: WalkOptions;

  constructor(deps: { backend: Freezer; neutraliser?: Cleaner; limits?: WalkOptions }) {
    this.backend = deps.backend;
    this.neutraliser = deps.neutraliser ?? new Neutraliser();
    this.limits = deps.limits ?? {};
  }

  async run(paths: SandboxPaths): Promise<string[]> {
    const result = await this.backend.freeze(paths.name, () =>
      this.neutraliser.run(paths, `tripwire-${Date.now()}`, this.limits),
    );
    return [...result.moved, ...result.removedLinks, ...result.removedGit];
  }
}

export const tripwireMessage = (path: string): string =>
  `tripwire: found ${path} in the workspace; removed or quarantined`;
