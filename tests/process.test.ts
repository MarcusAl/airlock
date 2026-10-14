import { describe, expect, it } from "vitest";
import { ShellRunner } from "../src/process/ProcessRunner.js";

describe("ShellRunner", () => {
  it("survives a child that exits without reading its input", async () => {
    const result = await new ShellRunner().capture("true", [], { input: "x".repeat(4_000_000) });
    expect(result.code).toBe(0);
  });

  it("gives a child no input when none is passed", async () => {
    const result = await new ShellRunner().capture("cat", []);
    expect(result.stdout).toBe("");
  });
});
