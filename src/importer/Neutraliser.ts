import { mkdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SandboxPaths } from "../core/SandboxPaths.js";
import { AirlockError } from "../errors.js";
import { Git } from "../process/Git.js";
import { escapesRoot, isInside, type RepoFile, walk } from "../scan/walk.js";
import { isQuarantined, quarantineDir } from "./quarantine.js";

export interface NeutraliseResult {
  readonly moved: string[];
  readonly removedLinks: string[];
  readonly removedGit: string[];
}

export class Neutraliser {
  constructor(private readonly gitFor: (cwd: string) => Git = (cwd) => new Git(cwd)) {}

  async run(paths: SandboxPaths, bucket: string): Promise<NeutraliseResult> {
    const files = walk(paths.workspace);
    const removedGit = this.remove(files.filter((f) => f.kind === "nested-git"));
    const removedLinks = this.remove(files.filter(escapesRoot));
    const gone = new Set([...removedGit, ...removedLinks]);
    const targets = this.targets(files.map((f) => f.path).filter((p) => !gone.has(p)));
    await this.skipWorktree(paths.workspace, targets);
    for (const rel of targets) this.move(paths, bucket, rel);
    return { moved: targets, removedLinks, removedGit };
  }

  private remove(files: readonly RepoFile[]): string[] {
    return files.map((file) => {
      this.assertParentInside(file.root, file.abs);
      rmSync(file.abs, { recursive: true, force: true });
      return file.path;
    });
  }

  private assertParentInside(root: string, abs: string): void {
    if (!isInside(root, realpathSync.native(dirname(abs)))) {
      throw new AirlockError(
        `refusing to touch ${abs}: its folder now resolves outside the workspace`,
      );
    }
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

  private move(paths: SandboxPaths, bucket: string, rel: string): void {
    this.assertParentInside(realpathSync.native(paths.workspace), join(paths.workspace, rel));
    const destination = join(paths.quarantined, bucket, rel);
    mkdirSync(dirname(destination), { recursive: true });
    rmSync(destination, { recursive: true, force: true });
    renameSync(join(paths.workspace, rel), destination);
  }
}
