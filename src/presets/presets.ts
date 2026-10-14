export type PresetName = "node" | "ruby" | "python" | "go";

export interface Preset {
  readonly name: PresetName;
  readonly defaultVersion: string;
  readonly baseImage: (version: string) => string;
  readonly packages: readonly string[];
  readonly registries: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly workspaceVolumes: readonly string[];
  readonly installCommand: (files: ReadonlySet<string>) => string;
}

const SYSTEM_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

const nodeInstall = (files: ReadonlySet<string>): string => {
  if (files.has("pnpm-lock.yaml")) return "corepack pnpm install --frozen-lockfile";
  if (files.has("yarn.lock")) return "corepack yarn install";
  if (files.has("package-lock.json")) return "npm ci";
  return "npm install";
};

const pythonInstall = (files: ReadonlySet<string>): string => {
  const install = files.has("requirements.txt")
    ? "pip install -r requirements.txt"
    : "pip install -e .";
  return `[ -d /cache/venv ] || python -m venv /cache/venv; ${install}`;
};

export const PRESETS: Record<PresetName, Preset> = {
  node: {
    name: "node",
    defaultVersion: "24",
    baseImage: (v) => `node:${v}-bookworm-slim`,
    packages: ["python3", "make", "g++"],
    registries: [".npmjs.org", ".npmjs.com", ".yarnpkg.com", "nodejs.org"],
    env: {
      npm_config_cache: "/cache/npm",
      COREPACK_HOME: "/cache/corepack",
      NODE_USE_ENV_PROXY: "1",
    },
    workspaceVolumes: ["node_modules"],
    installCommand: nodeInstall,
  },
  ruby: {
    name: "ruby",
    defaultVersion: "3.4",
    baseImage: (v) => `ruby:${v}-slim-bookworm`,
    packages: ["build-essential", "libpq-dev", "libyaml-dev", "pkg-config"],
    registries: ["rubygems.org", ".rubygems.org"],
    env: { BUNDLE_PATH: "/cache/bundle", BUNDLE_APP_CONFIG: "/cache/bundle-config" },
    workspaceVolumes: [],
    installCommand: () => "bundle install",
  },
  python: {
    name: "python",
    defaultVersion: "3.13",
    baseImage: (v) => `python:${v}-slim-bookworm`,
    packages: ["build-essential"],
    registries: ["pypi.org", "files.pythonhosted.org"],
    env: {
      PIP_CACHE_DIR: "/cache/pip",
      VIRTUAL_ENV: "/cache/venv",
      PATH: `/cache/venv/bin:${SYSTEM_PATH}`,
    },
    workspaceVolumes: [],
    installCommand: pythonInstall,
  },
  go: {
    name: "go",
    defaultVersion: "1.25",
    baseImage: (v) => `golang:${v}-bookworm`,
    packages: [],
    registries: ["proxy.golang.org", "sum.golang.org", "storage.googleapis.com"],
    env: {
      GOPATH: "/cache/go",
      GOCACHE: "/cache/go-build",
      GOFLAGS: "-modcacherw",
      PATH: `/cache/go/bin:/usr/local/go/bin:${SYSTEM_PATH}`,
    },
    workspaceVolumes: [],
    installCommand: () => "go mod download",
  },
};
