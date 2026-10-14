import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../cli/index.js", import.meta.url));

export const airlockCommand = (workspace: string): string[] => [
  "env",
  `AIRLOCK_HOME=${dirname(dirname(workspace))}`,
  process.execPath,
  CLI,
];
