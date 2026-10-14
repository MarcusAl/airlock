import { mkdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SandboxPaths } from "../core/SandboxPaths.js";
import { resolvesInside } from "../paths.js";
import { Git } from "../process/Git.js";
import { escapesRoot, type RepoFile, type WalkOptions, walk } from "../scan/walk.js";
import { isQuarantined, quarantineDir } from "./quarantine.js";

export interface NeutraliseResult {
  readonly moved: string[];
  readonly removedLinks: string[];
  readonly removedGit: string[];
}

interface Plan {
  readonly nestedGit: RepoFile[];
  readonly links: RepoFile[];
  readonly targets: string[];
}

const isGone = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === "ENOENT";

export class Neutraliser {
  constructor(private readonly gitFor: (cwd: string) => Git = (cwd) => new Git(cwd)) {}

  pending(paths: SandboxPaths, limits: WalkOptions = {}): boolean {
    const plan = this.plan(paths, limits);
    return plan.nestedGit.length + plan.links.length + plan.targets.length > 0;
  }

  async run(
    paths: SandboxPaths,
    bucket: string,
    limits: WalkOptions = {},
  ): Promise<NeutraliseResult> {
    const plan = this.plan(paths, limits);
    const removedGit = this.remove(plan.nestedGit);
    const removedLinks = this.remove(plan.links);
    await this.skipWorktree(paths.workspace, plan.targets);
    const moved = plan.targets.filter((rel) => this.move(paths, bucket, rel));
    return { moved, removedLinks, removedGit };
  }

  private plan(paths: SandboxPaths, limits: WalkOptions): Plan {
    const files = walk(paths.workspace, limits);
    const nestedGit = files.filter((f) => f.kind === "nested-git");
    const links = files.filter(escapesRoot);
    const gone = new Set([...nestedGit, ...links].map((f) => f.path));
    return {
      nestedGit,
      links,
      targets: this.targets(files.map((f) => f.path).filter((p) => !gone.has(p))),
    };
  }

  private remove(files: readonly RepoFile[]): string[] {
    return files
      .filter((file) => resolvesInside(file.root, dirname(file.abs)))
      .map((file) => {
        rmSync(file.abs, { recursive: true, force: true });
        return file.path;
      });
  }

  private targets(relPaths: readonly string[]): string[] {
    const quarantined = relPaths.filter(isQuarantined);
    const dirs = [
      ...new Set(quarantined.map(quarantineDir).filter((d): d is string => d !== undefined)),
    ];
    const files = quarantined.filter((p) => quarantineDir(p) === undefined);
    return [...dirs, ...files];
  }

  private async skipWorktree(workspace: string, targets: readonly string[]): Promise<void> {
    if (targets.length === 0) return;
    const git = this.gitFor(workspace);
    const tracked = (await git.run(["ls-files", "-z", "--", ...targets]))
      .split("\0")
      .filter(Boolean);
    if (tracked.length > 0) await git.run(["update-index", "--skip-worktree", "--", ...tracked]);
  }

  private move(paths: SandboxPaths, bucket: string, rel: string): boolean {
    const source = join(paths.workspace, rel);
    if (!resolvesInside(realpathSync.native(paths.workspace), dirname(source))) return false;
    const destination = join(paths.quarantined, bucket, rel);
    mkdirSync(dirname(destination), { recursive: true });
    rmSync(destination, { recursive: true, force: true });
    try {
      renameSync(source, destination);
      return true;
    } catch (error) {
      if (isGone(error)) return false;
      throw error;
    }
  }
}
