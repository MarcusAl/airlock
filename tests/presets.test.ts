import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectPreset } from "../src/presets/detect.js";
import { dockerfileFor, imageTag } from "../src/presets/dockerfile.js";
import { PRESETS } from "../src/presets/presets.js";

const repo = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), "airlock-preset-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
};

describe("detectPreset", () => {
  it("reads the node major from engines", () => {
    const dir = repo({ "package.json": JSON.stringify({ engines: { node: ">=24.14.0 <25" } }) });
    expect(detectPreset(dir)).toEqual({ preset: "node", version: "24" });
  });

  it("prefers .nvmrc over engines", () => {
    const dir = repo({ "package.json": "{}", ".nvmrc": "v22.11.0\n" });
    expect(detectPreset(dir)).toEqual({ preset: "node", version: "22" });
  });

  it("reads the ruby version from the Gemfile", () => {
    const dir = repo({ Gemfile: 'source "https://rubygems.org"\nruby "3.3.6"\n' });
    expect(detectPreset(dir)).toEqual({ preset: "ruby", version: "3.3.6" });
  });

  it("reads the go version from go.mod", () => {
    const dir = repo({ "go.mod": "module x\n\ngo 1.23.4\n" });
    expect(detectPreset(dir)).toEqual({ preset: "go", version: "1.23" });
  });

  it("throws when nothing is recognised", () => {
    expect(() => detectPreset(repo({ "README.md": "hi" }))).toThrow(/--preset/);
  });
});

describe("node preset", () => {
  it("uses the lockfile's package manager", () => {
    expect(PRESETS.node.installCommand(new Set(["pnpm-lock.yaml"]))).toBe(
      "corepack pnpm install --frozen-lockfile",
    );
  });
});

describe("dockerfileFor overrides", () => {
  it("adds extra apt packages and changes the tag", () => {
    const extras = { packages: ["libvips-dev"] };
    expect(dockerfileFor(PRESETS.node, "24", extras)).toContain("libvips-dev");
    expect(imageTag(PRESETS.node, "24", extras)).not.toBe(imageTag(PRESETS.node, "24"));
  });

  it("uses a custom base image", () => {
    expect(dockerfileFor(PRESETS.node, "24", { baseImage: "node:24-bookworm" })).toContain(
      "FROM node:24-bookworm\n",
    );
  });

  it("rejects package names that would inject Dockerfile instructions", () => {
    expect(() => dockerfileFor(PRESETS.node, "24", { packages: ["x\nRUN curl evil"] })).toThrow(
      /invalid package/,
    );
  });

  it("rejects image references that would inject Dockerfile instructions", () => {
    expect(() => dockerfileFor(PRESETS.node, "24", { baseImage: "x\nRUN id" })).toThrow(
      /invalid image/,
    );
  });
});

describe("imageTag", () => {
  it("changes when the dockerfile changes", () => {
    expect(imageTag(PRESETS.node, "24")).not.toBe(imageTag(PRESETS.node, "22"));
    expect(dockerfileFor(PRESETS.node, "24")).toContain("FROM node:24-bookworm-slim");
  });
});
