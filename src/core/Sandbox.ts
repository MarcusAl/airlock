import { Git } from "../process/Git.js";
import { type ProcessRunner, ShellRunner } from "../process/ProcessRunner.js";
import { SandboxPaths } from "./SandboxPaths.js";
import { StateStore } from "./StateStore.js";

export class Sandbox {
  static open(name: string, runner: ProcessRunner = new ShellRunner()): Sandbox {
    const paths = SandboxPaths.for(name);
    return new Sandbox(paths, new StateStore(paths), new Git(paths.workspace, runner));
  }

  constructor(
    readonly paths: SandboxPaths,
    readonly store: StateStore,
    readonly git: Git,
  ) {}

  async pendingWork(): Promise<{ dirty: boolean; unexported: boolean }> {
    const state = this.store.load();
    const status = await this.git.run(["status", "--porcelain", "--ignore-submodules=all"]);
    const head = (await this.git.run(["rev-parse", "HEAD"])).trim();
    return {
      dirty: status.trim().length > 0,
      unexported: head !== (state.exportedHead ?? state.importedCommit),
    };
  }
}
