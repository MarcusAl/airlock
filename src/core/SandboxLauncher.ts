import { join } from "node:path";
import type { Backend, NetMode, ServiceName } from "../backend/Backend.js";
import type { PresetName } from "../presets/presets.js";
import { DirLock } from "./DirLock.js";
import type { Sandbox } from "./Sandbox.js";
import type { SandboxState } from "./StateStore.js";
import { specFor } from "./specFor.js";

export interface StateChanges {
  net?: NetMode;
  allow?: string[];
  ports?: number[];
  services?: ServiceName[];
  preset?: PresetName;
  version?: string;
  baseImage?: string;
  packages?: string[];
}

export interface StartOptions {
  readonly persist?: boolean;
  readonly refresh?: boolean;
}

const defined = (changes: StateChanges): StateChanges =>
  Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));

export class SandboxLauncher {
  constructor(private readonly deps: { backend: Backend; dryRun?: boolean }) {}

  async start(
    sandbox: Sandbox,
    changes: StateChanges = {},
    options: StartOptions = {},
  ): Promise<SandboxState> {
    return new DirLock(join(sandbox.paths.dir, ".lock")).hold(async () => {
      const state: SandboxState = { ...sandbox.store.load(), ...defined(changes) };
      await this.deps.backend.up(specFor(state, sandbox.paths, options.refresh));
      if (!this.deps.dryRun && options.persist !== false) sandbox.store.save(state);
      return state;
    });
  }
}
