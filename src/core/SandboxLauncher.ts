import { mkdirSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { Backend, NetMode, ServiceName } from "../backend/Backend.js";
import { AirlockError } from "../errors.js";
import type { PresetName } from "../presets/presets.js";
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

const LOCK_ATTEMPTS = 600;

const defined = (changes: StateChanges): StateChanges =>
  Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));

export class SandboxLauncher {
  constructor(private readonly deps: { backend: Backend; dryRun?: boolean }) {}

  async start(
    sandbox: Sandbox,
    changes: StateChanges = {},
    options: StartOptions = {},
  ): Promise<SandboxState> {
    return this.locked(sandbox, async () => {
      const state: SandboxState = { ...sandbox.store.load(), ...defined(changes) };
      await this.deps.backend.up(specFor(state, sandbox.paths, options.refresh));
      if (!this.deps.dryRun && options.persist !== false) sandbox.store.save(state);
      return state;
    });
  }

  private async locked<T>(sandbox: Sandbox, work: () => Promise<T>): Promise<T> {
    const lock = join(sandbox.paths.dir, ".lock");
    await this.acquire(lock);
    try {
      return await work();
    } finally {
      rmdirSync(lock);
    }
  }

  private async acquire(lock: string): Promise<void> {
    for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt++) {
      try {
        mkdirSync(lock);
        return;
      } catch {
        await sleep(100);
      }
    }
    throw new AirlockError(`sandbox is busy (stale lock? remove ${lock})`);
  }
}
