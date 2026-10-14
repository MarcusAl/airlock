import { AirlockError } from "../errors.js";
import { type ProcessRunner, ShellRunner } from "./ProcessRunner.js";

export const SAFE_GIT_FLAGS = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.editor=false",
  "-c",
  "core.pager=cat",
  "-c",
  "submodule.recurse=false",
];

const GIT_TIMEOUT_MS = 60_000;

export class Git {
  constructor(
    private readonly cwd: string,
    private readonly runner: ProcessRunner = new ShellRunner(),
  ) {}

  async run(args: readonly string[]): Promise<string> {
    const result = await this.runner.capture("git", [...SAFE_GIT_FLAGS, ...args], {
      timeoutMs: GIT_TIMEOUT_MS,
      cwd: this.cwd,
      env: { ...process.env, GIT_LITERAL_PATHSPECS: "1", GIT_TERMINAL_PROMPT: "0" },
    });
    if (result.code !== 0) {
      throw new AirlockError(`git ${args[0]} failed: ${result.stderr.trim()}`);
    }
    return result.stdout;
  }
}
