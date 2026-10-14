import { realpathSync } from "node:fs";
import { sep } from "node:path";

export const isInside = (root: string, path: string): boolean =>
  path === root || path.startsWith(root + sep);

export const resolvesInside = (root: string, path: string): boolean => {
  try {
    return isInside(root, realpathSync.native(path));
  } catch {
    return false;
  }
};
