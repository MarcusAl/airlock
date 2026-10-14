import { spawn } from "node:child_process";
import { quote } from "shell-quote";

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
      child.on("error", reject);
      child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
      child.stdin.end(options.input ?? "");
    });
  }

  interactive(cmd: string, args: readonly string[], options: RunOptions = {}): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: "inherit",
      });
      child.on("error", reject);
      child.on("close", (code) => resolve(code ?? 1));
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
