import { mkdirSync, rmdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { AirlockError } from "../errors.js";

const ATTEMPTS = 600;
const DELAY_MS = 100;

export class DirLock {
  constructor(private readonly path: string) {}

  async hold<T>(work: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await work();
    } finally {
      rmdirSync(this.path);
    }
  }

  private async acquire(): Promise<void> {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
        mkdirSync(this.path);
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await sleep(DELAY_MS);
      }
    }
    throw new AirlockError(`sandbox is busy (stale lock? remove ${this.path})`);
  }
}
