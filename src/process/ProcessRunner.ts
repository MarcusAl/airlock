import { spawn } from "node:child_process";
import { quote } from "shell-quote";
import { AirlockError } from "../errors.js";

const missingProgram = (cmd: string) => (error: NodeJS.ErrnoException) =>
  error.code === "ENOENT"
    ? new AirlockError(`\`${cmd}\` isn't installed or isn't on your PATH`)
    : error;

export interface RunOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly input?: string;
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

export const formatCommand = (cmd: string, args: readonly string[]): string =>
  quote([cmd, ...args]);

export class ShellRunner implements ProcessRunner {
  capture(cmd: string, args: readonly string[], options: RunOptions = {}): Promise<CaptureResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { cwd: options.cwd, env: options.env ?? process.env });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", (error) => reject(missingProgram(cmd)(error)));
      child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
      child.stdin.end(options.input ?? "");
    });
  }

  interactive(cmd: string, args: readonly string[], options: RunOptions = {}): Promise<number> {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: "inherit",
    });
    const forward = (signal: NodeJS.Signals) => child.kill(signal);
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

export class DryRunRunner implements ProcessRunner {
  constructor(
    private readonly print: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
  ) {}

  async capture(cmd: string, args: readonly string[]): Promise<CaptureResult> {
    this.print(`$ ${formatCommand(cmd, args)}`);
    return { code: 0, stdout: "", stderr: "" };
  }

  async interactive(cmd: string, args: readonly string[]): Promise<number> {
    this.print(`$ ${formatCommand(cmd, args)}`);
    return 0;
  }
}
