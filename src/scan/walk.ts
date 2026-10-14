import { lstatSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";

export interface RepoFile {
  readonly path: string;
  readonly abs: string;
  readonly root: string;
  readonly kind: "file" | "symlink" | "nested-git";
  readonly size: number;
  readonly mode: number;
  readonly linkTarget?: string;
}

const toFile = (root: string, rel: string): RepoFile => {
  const abs = join(root, rel);
  const stat = lstatSync(abs);
  if (stat.isSymbolicLink()) {
    const linkTarget = readlinkSync(abs);
    return { path: rel, abs, root, kind: "symlink", size: 0, mode: stat.mode, linkTarget };
  }
  return { path: rel, abs, root, kind: "file", size: stat.size, mode: stat.mode };
};

const nestedGit = (root: string, path: string): RepoFile => ({
  path,
  abs: join(root, path),
  root,
  kind: "nested-git",
  size: 0,
  mode: 0,
});

const walkFrom = (root: string, rel: string): RepoFile[] =>
  readdirSync(join(root, rel), { withFileTypes: true }).flatMap((entry) => {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.name === ".git") return rel ? [nestedGit(root, path)] : [];
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walkFrom(root, path);
    return entry.isFile() || entry.isSymbolicLink() ? [toFile(root, path)] : [];
  });

export const walk = (root: string): RepoFile[] => walkFrom(realpathSync.native(root), "");

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
