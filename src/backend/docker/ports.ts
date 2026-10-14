import { createServer } from "node:net";
import { AirlockError } from "../../errors.js";

const isFree = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });

export const assertPortsFree = async (ports: readonly number[]): Promise<void> => {
  for (const port of ports) {
    if (!(await isFree(port))) {
      throw new AirlockError(
        `port ${port} is already in use on this machine; pick another --port or stop what's using it`,
      );
    }
  }
};
