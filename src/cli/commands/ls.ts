import { existsSync, readdirSync } from "node:fs";
import { SandboxPaths } from "../../core/SandboxPaths.js";
import { StateStore } from "../../core/StateStore.js";
import type { Command } from "../context.js";

const sandboxNames = (): string[] => {
  const root = SandboxPaths.root();
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((name) => {
    try {
      return new StateStore(SandboxPaths.for(name)).exists();
    } catch {
      return false;
    }
  });
};

export const lsCommand: Command = {
  name: "ls",
  summary: "list sandboxes",
  async execute(_argv, ctx) {
    const running = new Map((await ctx.backend.list()).map((s) => [s.name, s.running]));
    for (const name of sandboxNames()) {
      const paths = SandboxPaths.for(name);
      const state = new StateStore(paths).load();
      const status = running.get(name) ? "running" : "stopped";
      const ports = state.ports.join(",") || "-";
      ctx.out.info(
        `${name}\t${state.preset} ${state.version}\tnet=${state.net}\tports=${ports}\t${status}\t${paths.workspace}`,
      );
    }
    return 0;
  },
};
