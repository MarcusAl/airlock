#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DockerBackend } from "../backend/docker/DockerBackend.js";
import { SandboxPaths } from "../core/SandboxPaths.js";
import { Tripwire } from "../core/Tripwire.js";
import { ShellRunner } from "../process/ProcessRunner.js";
import { decide } from "./decide.js";

const HOOK_BUDGET = { maxEntries: 200_000, deadlineMs: 20_000 };

const [sandbox = "", workspace = ""] = process.argv.slice(2);
const root = dirname(dirname(workspace));
const cli = fileURLToPath(new URL("../cli/index.js", import.meta.url));
const airlock = ["env", `AIRLOCK_HOME=${root}`, process.execPath, cli];

const denyAll = (message: string) => ({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: `airlock: hook error, refusing to run: ${message}`,
  },
});

const output = await (async () => {
  try {
    const tripwire = new Tripwire({
      backend: new DockerBackend(new ShellRunner()),
      limits: HOOK_BUDGET,
    });
    const planted = await tripwire.run(SandboxPaths.for(sandbox, root));
    const result = decide(readFileSync(0, "utf8"), { sandbox, workspace, airlock });
    if (planted.length === 0) return result;
    return { ...result, systemMessage: `airlock tripwire quarantined: ${planted.join(", ")}` };
  } catch (error) {
    return denyAll((error as Error).message);
  }
})();

process.stdout.write(JSON.stringify(output));
