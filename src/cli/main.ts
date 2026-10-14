import { readFileSync } from "node:fs";
import { AirlockError } from "../errors.js";

const version = (): string =>
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

export const main = async (argv: string[]): Promise<number> => {
  try {
    if (argv[0] === "--version") {
      process.stdout.write(`${version()}\n`);
      return 0;
    }
    throw new AirlockError(`unknown command: ${argv[0] ?? "(none)"}`);
  } catch (error) {
    if (!(error instanceof AirlockError)) throw error;
    process.stderr.write(`airlock: ${error.message}\n`);
    return 1;
  }
};
