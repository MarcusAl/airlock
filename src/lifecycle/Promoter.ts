import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Sandbox } from "../core/Sandbox.js";
import { AirlockError } from "../errors.js";

export class Promoter {
  async promote(sandbox: Sandbox, target: string, force: boolean): Promise<string[]> {
    const destination = resolve(target);
    if (existsSync(destination)) throw new AirlockError(`target already exists: ${destination}`);
    if ((await sandbox.pendingWork()).dirty && !force) {
      throw new AirlockError(
        "uncommitted changes would not be promoted; commit them or pass --force",
      );
    }
    await sandbox.git.run([
      "clone",
      "--no-hardlinks",
      "--no-recurse-submodules",
      sandbox.paths.workspace,
      destination,
    ]);
    const state = sandbox.store.load();
    sandbox.store.save({
      ...state,
      exportedHead: (await sandbox.git.run(["rev-parse", "HEAD"])).trim(),
    });
    return state.quarantined.filter((rel) => existsSync(resolve(destination, rel)));
  }
}
