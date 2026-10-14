import { createHash } from "node:crypto";
import { AirlockError } from "../errors.js";
import type { Preset } from "./presets.js";

export const IMAGE_UID = 1000;
const COMMON_PACKAGES = ["git", "wget", "ca-certificates", "bash"];
const PACKAGE = /^[a-z0-9][a-z0-9.+-]*$/;
const IMAGE = /^[a-z0-9][a-z0-9./_:@-]*$/i;

export interface ImageExtras {
  readonly baseImage?: string;
  readonly packages?: readonly string[];
}

const validPackage = (name: string): string => {
  if (!PACKAGE.test(name)) throw new AirlockError(`invalid package name: ${JSON.stringify(name)}`);
  return name;
};

const validImage = (ref: string): string => {
  if (!IMAGE.test(ref)) throw new AirlockError(`invalid image reference: ${JSON.stringify(ref)}`);
  return ref;
};

export const dockerfileFor = (
  preset: Preset,
  version: string,
  extras: ImageExtras = {},
): string => {
  const base = validImage(extras.baseImage ?? preset.baseImage(version));
  const packages = [
    ...COMMON_PACKAGES,
    ...preset.packages,
    ...(extras.packages ?? []).map(validPackage),
  ];
  return [
    `FROM ${base}`,
    `RUN apt-get update && apt-get install -y --no-install-recommends ${packages.join(" ")} && rm -rf /var/lib/apt/lists/*`,
    `RUN id -u ${IMAGE_UID} >/dev/null 2>&1 || useradd --uid ${IMAGE_UID} --create-home --shell /bin/bash airlock`,
    `RUN mkdir -p /work /cache && chown ${IMAGE_UID}:${IMAGE_UID} /work /cache`,
    "",
  ].join("\n");
};

export const imageTag = (preset: Preset, version: string, extras: ImageExtras = {}): string => {
  const hash = createHash("sha256")
    .update(dockerfileFor(preset, version, extras))
    .digest("hex")
    .slice(0, 10);
  return `airlock-${preset.name}:${version}-${hash}`;
};
