import { spawn } from "node:child_process";
import { quote } from "shell-quote";
import { AirlockError } from "../errors.js";
import { LIMITS } from "../limits.js";

const missingProgram = (cmd: string) => (error: NodeJS.ErrnoException) =>
  error.code === "ENOENT"
    ? new AirlockError(`\`${cmd}\` isn't installed or isn't on your PATH`)
    : error;

export interface RunOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly input?: string;
  readonly timeoutMs?: number;
}

export interface CaptureResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProcessRunner {
  capture(cmd: string, args: readonly string[], options?: RunOptions): Promise<CaptureResult>;
  interactive(cmd: string, args: readonly string[], options?: RunOptions): Promise<number>;
}

const TIMED_OUT = 124;

export const timedOut = (result: CaptureResult): boolean =>
  /timed out after \d+s$/.test(result.stderr);

const ignoreClosedPipe = (error: NodeJS.ErrnoException): void => {
  if (error.code !== "EPIPE") throw error;
};

export const formatCommand = (cmd: string, args: readonly string[]): string =>
  quote([cmd, ...args]);

export class ShellRunner implements ProcessRunner {
  capture(cmd: string, args: readonly string[], options: RunOptions = {}): Promise<CaptureResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", (error) => reject(missingProgram(cmd)(error)));
      const timer = options.timeoutMs
        ? setTimeout(() => {
            stderr += `\ntimed out after ${Math.round((options.timeoutMs ?? 0) / 1000)}s`;
            child.kill("SIGKILL");
          }, options.timeoutMs)
        : undefined;
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? TIMED_OUT, stdout, stderr });
      });
      if (options.input !== undefined && child.stdin) {
        child.stdin.on("error", ignoreClosedPipe);
        child.stdin.end(options.input);
      }
    });
  }

  interactive(cmd: string, args: readonly string[], options: RunOptions = {}): Promise<number> {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: "inherit",
    });
    const forward = (signal: NodeJS.Signals) => {
      child.kill(signal);
      setTimeout(() => child.kill("SIGKILL"), LIMITS.process.killAfterMs).unref();
    };
    const ignore = () => {};
    process.on("SIGINT", ignore);
    process.on("SIGTERM", forward);
    process.on("SIGHUP", forward);
    return new Promise<number>((resolve, reject) => {
      child.on("error", (error) => reject(missingProgram(cmd)(error)));
      child.on("close", (code) => resolve(code ?? 1));
    }).finally(() => {
      process.off("SIGINT", ignore);
      process.off("SIGTERM", forward);
      process.off("SIGHUP", forward);
    });
  }
}

const READ_ONLY = new Set(["ps", "inspect", "images", "ls"]);

const isReadOnly = (cmd: string, args: readonly string[]): boolean =>
  cmd === "docker" && (READ_ONLY.has(args[0] ?? "") || READ_ONLY.has(args[1] ?? ""));

export class DryRunRunner implements ProcessRunner {
  constructor(
    private readonly print: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
    private readonly reader: ProcessRunner = new ShellRunner(),
  ) {}

  async capture(
    cmd: string,
    args: readonly string[],
    options?: RunOptions,
  ): Promise<CaptureResult> {
    if (isReadOnly(cmd, args)) return this.reader.capture(cmd, args, options);
    this.print(`$ ${formatCommand(cmd, args)}`);
    return { code: 0, stdout: "", stderr: "" };
  }

  async interactive(cmd: string, args: readonly string[]): Promise<number> {
    this.print(`$ ${formatCommand(cmd, args)}`);
    return 0;
  }
}
