import { createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { AirlockError } from "../../errors.js";
import { LIMITS } from "../../limits.js";

const isFree = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });

export class PortGuard {
  private readonly attempts: number;
  private readonly delayMs: number;

  constructor({
    attempts = LIMITS.ports.attempts,
    delayMs = LIMITS.ports.retryMs,
  }: { attempts?: number; delayMs?: number } = {}) {
    this.attempts = attempts;
    this.delayMs = delayMs;
  }

  async assertFree(ports: readonly number[]): Promise<void> {
    for (const port of ports) {
      if (!(await this.becomesFree(port))) {
        throw new AirlockError(
          `port ${port} is already in use on this machine; pick another --port or stop what's using it`,
        );
      }
    }
  }

  private async becomesFree(port: number): Promise<boolean> {
    for (let attempt = 0; attempt < this.attempts; attempt++) {
      if (await isFree(port)) return true;
      await sleep(this.delayMs);
    }
    return false;
  }
}
