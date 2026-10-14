import { lstatSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { AirlockError } from "../errors.js";

export interface RepoFile {
  readonly path: string;
  readonly abs: string;
  readonly root: string;
  readonly kind: "file" | "symlink" | "nested-git";
  readonly size: number;
  readonly mode: number;
  readonly linkTarget?: string;
}

export interface WalkOptions {
  readonly maxEntries?: number;
  readonly deadlineMs?: number;
  readonly skipNodeModules?: boolean;
}

const isGone = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === "ENOENT";

class Walker {
  private seen = 0;
  private readonly deadline: number;

  constructor(
    private readonly root: string,
    private readonly options: WalkOptions,
  ) {
    this.deadline = Date.now() + (options.deadlineMs ?? Number.POSITIVE_INFINITY);
  }

  walk(rel: string): RepoFile[] {
    return this.entries(rel).flatMap((entry) => {
      this.count();
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.name === ".git") return rel ? [this.nestedGit(path)] : [];
      if (entry.isDirectory()) return this.skips(entry.name) ? [] : this.walk(path);
      if (!entry.isFile() && !entry.isSymbolicLink()) return [];
      const file = this.toFile(path);
      return file ? [file] : [];
    });
  }

  private entries(rel: string) {
    try {
      return readdirSync(join(this.root, rel), { withFileTypes: true });
    } catch (error) {
      if (isGone(error)) return [];
      throw error;
    }
  }

  private count(): void {
    this.seen++;
    const overBudget = this.seen > (this.options.maxEntries ?? Number.POSITIVE_INFINITY);
    if (overBudget || Date.now() > this.deadline) {
      throw new AirlockError(
        "too many files in the workspace to check safely; refusing to continue",
      );
    }
  }

  private skips(name: string): boolean {
    return name === "node_modules" && this.options.skipNodeModules === true;
  }

  private nestedGit(path: string): RepoFile {
    return {
      path,
      abs: join(this.root, path),
      root: this.root,
      kind: "nested-git",
      size: 0,
      mode: 0,
    };
  }

  private toFile(rel: string): RepoFile | undefined {
    const abs = join(this.root, rel);
    try {
      const stat = lstatSync(abs);
      if (stat.isSymbolicLink()) {
        const linkTarget = readlinkSync(abs);
        return {
          path: rel,
          abs,
          root: this.root,
          kind: "symlink",
          size: 0,
          mode: stat.mode,
          linkTarget,
        };
      }
      return { path: rel, abs, root: this.root, kind: "file", size: stat.size, mode: stat.mode };
    } catch (error) {
      if (isGone(error)) return undefined;
      throw error;
    }
  }
}

export const walk = (root: string, options: WalkOptions = {}): RepoFile[] =>
  new Walker(realpathSync.native(root), options).walk("");

export const isInside = (root: string, path: string): boolean =>
  path === root || path.startsWith(root + sep);

export const escapesRoot = (file: RepoFile): boolean => {
  if (file.kind !== "symlink") return false;
  try {
    return !isInside(file.root, realpathSync.native(file.abs));
  } catch {
    return true;
  }
};
