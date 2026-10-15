import { describe, expect, it } from "vitest";
import { DockerClient } from "../src/backend/docker/DockerClient.js";
import { hookWorstCaseMs, LIMITS } from "../src/limits.js";
import type { CaptureResult, ProcessRunner, RunOptions } from "../src/process/ProcessRunner.js";

describe("time limits", () => {
  it("keep the hook's worst case inside Claude Code's hook timeout", () => {
    expect(hookWorstCaseMs()).toBeLessThan(LIMITS.hook.timeoutSeconds * 1_000);
  });

  it("let the hook give quick docker calls a shorter limit", async () => {
    const seen: (number | undefined)[] = [];
    const runner: ProcessRunner = {
      capture: async (_cmd, _args, options?: RunOptions): Promise<CaptureResult> => {
        seen.push(options?.timeoutMs);
        return { code: 0, stdout: "", stderr: "" };
      },
      interactive: async () => 0,
    };
    await new DockerClient(runner, { quickMs: LIMITS.hook.dockerMs }).attempt(["pause", "x"]);
    expect(seen).toEqual([LIMITS.hook.dockerMs]);
  });
});
