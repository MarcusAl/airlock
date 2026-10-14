import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { AirlockError } from "../errors.js";

const DELAY_MS = 100;
const FRESH_MS = 2_000;

const isAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
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
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    const deadline = Date.now() + this.maxWaitMs;
    while (!this.tryTake()) {
      if (this.isStale()) {
        this.breakStale();
        continue;
      }
      if (Date.now() > deadline) {
        throw new AirlockError(
          "sandbox is busy: another airlock command is starting or checking it; try again shortly",
        );
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
    const temp = join(this.path, `pid.${process.pid}`);
    writeFileSync(temp, String(process.pid));
    renameSync(temp, join(this.path, "pid"));
    return true;
  }

  private holder(path = this.path): number | undefined {
    try {
      return Number(readFileSync(join(path, "pid"), "utf8"));
    } catch {
      return undefined;
    }
  }

  private isStale(): boolean {
    const pid = this.holder();
    return pid === undefined ? this.olderThan(FRESH_MS) : !isAlive(pid);
  }

  private breakStale(): void {
    const aside = `${this.path}.stale-${process.pid}-${Date.now()}`;
    try {
      renameSync(this.path, aside);
    } catch {
      return;
    }
    const pid = this.holder(aside);
    if (pid !== undefined && isAlive(pid)) {
      renameSync(aside, this.path);
      return;
    }
    rmSync(aside, { recursive: true, force: true });
  }

  private release(): void {
    if (this.holder() !== process.pid) return;
    try {
      rmSync(this.path, { recursive: true, force: true });
    } catch {}
  }

  private olderThan(ms: number): boolean {
    try {
      return Date.now() - statSync(this.path).mtimeMs > ms;
    } catch {
      return false;
    }
  }
}
