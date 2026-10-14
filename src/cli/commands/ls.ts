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
  usage: "airlock ls",
  async execute(_argv, ctx) {
    const running = new Map((await ctx.backend.list()).map((s) => [s.name, s.running]));
    const sandboxes = sandboxNames();
    if (sandboxes.length === 0) {
      ctx.out.info("No sandboxes yet. Start with: airlock import <https-url|path>");
      return 0;
    }
    for (const name of sandboxes) {
      const paths = SandboxPaths.for(name);
      const state = new StateStore(paths).load();
      const status = running.get(name) ? "running" : "stopped";
      const ports = state.ports.join(",") || "-";
      const services = state.services.join(",") || "-";
      ctx.out.info(
        `${name}\t${state.preset} ${state.version}\tnet=${state.net}\tports=${ports}\tservices=${services}\t${status}\t${paths.workspace}`,
      );
    }
    return 0;
  },
};
