import type { SandboxSpec } from "../backend/Backend.js";
import { dockerfileFor, imageTag } from "../presets/dockerfile.js";
import { PRESETS } from "../presets/presets.js";
import type { SandboxPaths } from "./SandboxPaths.js";
import type { SandboxState } from "./StateStore.js";
import { SERVICES } from "./services.js";

export const specFor = (state: SandboxState, paths: SandboxPaths, refresh = false): SandboxSpec => {
  const preset = PRESETS[state.preset];
  const extras = { baseImage: state.baseImage, packages: state.packages };
  const allow = state.net === "allowlist" ? [...preset.registries, ...state.allow] : state.allow;
  return {
    name: state.name,
    image: {
      tag: imageTag(preset, state.version, extras),
      dockerfile: dockerfileFor(preset, state.version, extras),
      refresh,
    },
    workspace: paths.workspace,
    env: { ...preset.env, ...Object.fromEntries(state.services.map((s) => SERVICES[s].urlEnv)) },
    workspaceVolumes: preset.workspaceVolumes,
    policy: { mode: state.net, allow },
    ports: state.ports,
    services: state.services,
  };
};
