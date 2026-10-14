import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AirlockError } from "../errors.js";
import { PRESETS, type PresetName } from "./presets.js";

export interface Detected {
  preset: PresetName;
  version: string;
}

const read = (dir: string, file: string): string | undefined => {
  const path = join(dir, file);
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
};

const firstMatch = (text: string | undefined, pattern: RegExp): string | undefined =>
  text?.match(pattern)?.[1];

const nodeVersion = (dir: string): string | undefined => {
  const pinned = read(dir, ".nvmrc") ?? read(dir, ".node-version");
  if (pinned) return firstMatch(pinned, /(\d+)/);
  const engines = JSON.parse(read(dir, "package.json") ?? "{}").engines?.node;
  return firstMatch(engines, /(\d+)/);
};

const rubyVersion = (dir: string): string | undefined =>
  firstMatch(read(dir, ".ruby-version"), /(\d+\.\d+(?:\.\d+)?)/) ??
  firstMatch(read(dir, "Gemfile"), /^ruby ["'](\d+\.\d+(?:\.\d+)?)/m);

const DETECTORS: ReadonlyArray<{
  preset: PresetName;
  markers: readonly string[];
  version: (dir: string) => string | undefined;
}> = [
  { preset: "node", markers: ["package.json"], version: nodeVersion },
  { preset: "ruby", markers: ["Gemfile"], version: rubyVersion },
  {
    preset: "python",
    markers: ["pyproject.toml", "requirements.txt", "setup.py"],
    version: (dir) => firstMatch(read(dir, ".python-version"), /^(\d+\.\d+)/),
  },
  {
    preset: "go",
    markers: ["go.mod"],
    version: (dir) => firstMatch(read(dir, "go.mod"), /^go (\d+\.\d+)/m),
  },
];

export const detectPreset = (dir: string): Detected => {
  const match = DETECTORS.find(({ markers }) => markers.some((m) => existsSync(join(dir, m))));
  if (!match) {
    throw new AirlockError("could not detect a preset; pass --preset node|ruby|python|go");
  }
  return {
    preset: match.preset,
    version: match.version(dir) ?? PRESETS[match.preset].defaultVersion,
  };
};
