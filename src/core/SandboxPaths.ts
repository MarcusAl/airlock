import { homedir } from "node:os";
import { join } from "node:path";
import { AirlockError } from "../errors.js";

const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

export class SandboxPaths {
  static root(): string {
    return process.env.AIRLOCK_HOME ?? join(homedir(), "sandboxes");
  }

  static for(name: string, root = SandboxPaths.root()): SandboxPaths {
    if (!NAME.test(name)) {
      throw new AirlockError(`invalid sandbox name "${name}": use a-z, 0-9 and dashes`);
    }
    return new SandboxPaths(name, join(root, name));
  }

  private constructor(
    readonly name: string,
    readonly dir: string,
  ) {}

  get workspace(): string {
    return join(this.dir, "workspace");
  }

  get quarantined(): string {
    return join(this.dir, "quarantined");
  }

  get stateFile(): string {
    return join(this.dir, "state.json");
  }

  get exports(): string {
    return join(this.dir, "exports");
  }

  get claudeSettings(): string {
    return join(this.dir, "claude-settings.json");
  }
}
