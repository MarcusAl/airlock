import type { NetMode, ServiceName } from "../../backend/Backend.js";
import type { StateChanges } from "../../core/SandboxLauncher.js";
import { AirlockError } from "../../errors.js";
import { validHost } from "../../net/squid.js";
import type { PresetName } from "../../presets/presets.js";

export const SANDBOX_OPTIONS = {
  net: { type: "string" },
  allow: { type: "string", multiple: true },
  port: { type: "string", multiple: true },
  with: { type: "string", multiple: true },
  preset: { type: "string" },
  version: { type: "string" },
  image: { type: "string" },
  apt: { type: "string", multiple: true },
  rebuild: { type: "boolean" },
} as const;

export const EXEC_OPTIONS = {
  cwd: { type: "string" },
  env: { type: "string", multiple: true },
} as const;

const oneOf = <T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  flag: string,
): T | undefined => {
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new AirlockError(`--${flag} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
};

const port = (raw: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new AirlockError(`invalid --port ${raw}`);
  }
  return value;
};

const service = (raw: string): ServiceName =>
  oneOf<ServiceName>(raw, ["postgres", "redis"], "with") ?? "postgres";

export interface SandboxValues {
  net?: string;
  allow?: string[];
  port?: string[];
  with?: string[];
  preset?: string;
  version?: string;
  image?: string;
  apt?: string[];
}

export const changesFrom = (values: SandboxValues): StateChanges => ({
  net: oneOf<NetMode>(values.net, ["none", "allowlist", "open"], "net"),
  allow: values.allow?.map(validHost),
  ports: values.port?.map(port),
  services: values.with?.map(service),
  preset: oneOf<PresetName>(values.preset, ["node", "ruby", "python", "go"], "preset"),
  version: values.version,
  baseImage: values.image,
  packages: values.apt,
});

export const splitDash = (argv: readonly string[]): { own: string[]; command: string[] } => {
  const cut = argv.indexOf("--");
  return cut < 0
    ? { own: [...argv], command: [] }
    : { own: argv.slice(0, cut), command: argv.slice(cut + 1) };
};

export const requireName = (positionals: readonly string[], usage: string): string => {
  const name = positionals[0];
  if (!name) throw new AirlockError(`usage: ${usage}`);
  return name;
};

export const isInteractive = (): boolean => Boolean(process.stdout.isTTY && process.stdin.isTTY);
