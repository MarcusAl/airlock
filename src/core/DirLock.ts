import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { AirlockError } from "../errors.js";

const DELAY_MS = 100;
const FRESH_MS = 2_000;

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

export class DirLock {
  private readonly maxWaitMs: number;

  constructor(
    private readonly path: string,
    { maxWaitMs = 60_000 }: { maxWaitMs?: number } = {},
  ) {
    this.maxWaitMs = maxWaitMs;
  }

  async hold<T>(work: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await work();
    } finally {
      try {
        rmSync(this.path, { recursive: true, force: true });
      } catch {}
    }
  }

  private async acquire(): Promise<void> {
    const deadline = Date.now() + this.maxWaitMs;
    while (!this.tryTake()) {
      if (this.isStale()) {
        rmSync(this.path, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new AirlockError(`sandbox is busy (stale lock? remove ${this.path})`);
      }
      await sleep(DELAY_MS);
    }
  }

  private tryTake(): boolean {
    try {
      mkdirSync(this.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
    writeFileSync(join(this.path, "pid"), String(process.pid));
    return true;
  }

  private isStale(): boolean {
    try {
      return !isAlive(Number(readFileSync(join(this.path, "pid"), "utf8")));
    } catch {
      return this.olderThan(FRESH_MS);
    }
  }

  private olderThan(ms: number): boolean {
    try {
      return Date.now() - statSync(this.path).mtimeMs > ms;
    } catch {
      return false;
    }
  }
}
