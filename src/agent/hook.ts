#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DockerBackend } from "../backend/docker/DockerBackend.js";
import { SandboxPaths } from "../core/SandboxPaths.js";
import { Tripwire } from "../core/Tripwire.js";
import { ShellRunner } from "../process/ProcessRunner.js";
import { airlockCommand } from "./airlockCommand.js";
import { decide } from "./decide.js";

const [sandbox = "", workspace = ""] = process.argv.slice(2);
const root = dirname(dirname(workspace));
const airlock = airlockCommand(workspace);

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
      lockWaitMs: 5_000,
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
