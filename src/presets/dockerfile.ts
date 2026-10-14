import { createHash } from "node:crypto";
import type { Preset } from "./presets.js";

export const IMAGE_UID = 1000;
const COMMON_PACKAGES = ["git", "wget", "ca-certificates", "bash"];

export const dockerfileFor = (preset: Preset, version: string): string =>
  [
    `FROM ${preset.baseImage(version)}`,
    `RUN apt-get update && apt-get install -y --no-install-recommends ${[...COMMON_PACKAGES, ...preset.packages].join(" ")} && rm -rf /var/lib/apt/lists/*`,
    `RUN id -u ${IMAGE_UID} >/dev/null 2>&1 || useradd --uid ${IMAGE_UID} --create-home --shell /bin/bash airlock`,
    `RUN mkdir -p /work /cache && chown ${IMAGE_UID}:${IMAGE_UID} /work /cache`,
    "",
  ].join("\n");

export const imageTag = (preset: Preset, version: string): string => {
  const hash = createHash("sha256")
    .update(dockerfileFor(preset, version))
    .digest("hex")
    .slice(0, 10);
  return `airlock-${preset.name}:${version}-${hash}`;
};
