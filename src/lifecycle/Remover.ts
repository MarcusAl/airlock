import { rmSync } from "node:fs";
import type { Backend } from "../backend/Backend.js";
import type { Sandbox } from "../core/Sandbox.js";
import { AirlockError } from "../errors.js";

export class Remover {
  constructor(private readonly backend: Backend) {}

  async remove(sandbox: Sandbox, force: boolean, dryRun: boolean): Promise<void> {
    if (!force) await this.assertNothingToLose(sandbox);
    await this.backend.remove(sandbox.paths.name);
    if (!dryRun) rmSync(sandbox.paths.dir, { recursive: true, force: true });
  }

  private async assertNothingToLose(sandbox: Sandbox): Promise<void> {
    const pending = await sandbox.pendingWork();
    if (pending.dirty || pending.unexported) {
      throw new AirlockError(
        "sandbox has work that was never exported or promoted; run airlock export, or pass --force",
      );
    }
  }
}
