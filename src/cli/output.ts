import type { Reporter } from "../core/Reporter.js";

export class Output implements Reporter {
  info(line: string): void {
    process.stdout.write(`${line}\n`);
  }

  warn(line: string): void {
    process.stderr.write(`airlock: ${line}\n`);
  }
}
