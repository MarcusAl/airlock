#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SandboxPaths } from "../core/SandboxPaths.js";
import { Neutraliser } from "../importer/Neutraliser.js";
import { decide } from "./decide.js";

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
    const { moved, removedLinks, removedGit } = await new Neutraliser().run(
      SandboxPaths.for(sandbox, root),
      `tripwire-${Date.now()}`,
    );
    const planted = [...moved, ...removedLinks, ...removedGit];
    const result = decide(readFileSync(0, "utf8"), { sandbox, workspace, airlock });
    return planted.length
      ? { ...result, systemMessage: `airlock tripwire quarantined: ${planted.join(", ")}` }
      : result;
  } catch (error) {
    return denyAll((error as Error).message);
  }
})();

process.stdout.write(JSON.stringify(output));
