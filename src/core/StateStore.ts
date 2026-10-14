import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { NetMode, ServiceName } from "../backend/Backend.js";
import { AirlockError } from "../errors.js";
import type { PresetName } from "../presets/presets.js";
import type { SandboxPaths } from "./SandboxPaths.js";

export interface SandboxState {
  name: string;
  source: string;
  importedCommit: string;
  preset: PresetName;
  version: string;
  net: NetMode;
  allow: string[];
  ports: number[];
  services: ServiceName[];
  quarantined: string[];
  baseImage?: string;
  packages?: string[];
  exportedHead?: string;
  createdAt: string;
}

export class StateStore {
  constructor(private readonly paths: SandboxPaths) {}

  exists(): boolean {
    return existsSync(this.paths.stateFile);
  }

  load(): SandboxState {
    if (!this.exists()) {
      throw new AirlockError(`no sandbox "${this.paths.name}"; run airlock import first`);
    }
    try {
      return JSON.parse(readFileSync(this.paths.stateFile, "utf8"));
    } catch {
      throw new AirlockError(
        `sandbox state is unreadable: ${this.paths.stateFile}; fix the JSON or remove ${this.paths.dir}`,
      );
    }
  }

  save(state: SandboxState): void {
    writeFileSync(this.paths.stateFile, `${JSON.stringify(state, null, 2)}\n`);
  }
}
