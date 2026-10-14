import { posix } from "node:path";
import { SERVICES } from "../../core/services.js";
import { AirlockError } from "../../errors.js";
import { IMAGE_UID } from "../../presets/dockerfile.js";
import type { ExecRequest, SandboxSpec, ServiceName } from "../Backend.js";
import { label, names } from "./names.js";

export const PROXY_URL = "http://gateway:3128";
export const GATEWAY_PORT_BASE = 20000;
const USER = `${IMAGE_UID}:${IMAGE_UID}`;
const HARDENING = ["--cap-drop", "ALL", "--security-opt", "no-new-privileges"];
const LIMITS = ["--pids-limit", "1024", "--memory", "4g", "--cpus", "2"];
const NO_PROXY = "localhost,127.0.0.1,app,postgres,redis";

const PROXY_ENV: Record<string, string> = {
  HTTP_PROXY: PROXY_URL,
  HTTPS_PROXY: PROXY_URL,
  http_proxy: PROXY_URL,
  https_proxy: PROXY_URL,
  NO_PROXY,
  no_proxy: NO_PROXY,
};

const GIT_ENV: Record<string, string> = {
  GIT_OPTIONAL_LOCKS: "0",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "safe.directory",
  GIT_CONFIG_VALUE_0: "*",
};

const envArgs = (env: Readonly<Record<string, string>>): string[] =>
  Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);

const mount = (spec: string): string[] => ["--mount", spec];

const assertMountable = (path: string): string => {
  if (path.includes(",")) {
    throw new AirlockError(`path contains a comma, which docker --mount cannot take: ${path}`);
  }
  return path;
};

const workspaceMounts = (spec: SandboxSpec): string[] => {
  const workspace = assertMountable(spec.workspace);
  const n = names(spec.name);
  return [
    ...mount(`type=bind,src=${workspace},dst=/work`),
    ...mount(`type=bind,src=${workspace}/.git,dst=/work/.git,readonly`),
    ...mount(`type=volume,src=${n.cache},dst=/cache`),
    ...spec.workspaceVolumes.flatMap((rel) =>
      mount(`type=volume,src=${n.volume(rel)},dst=/work/${rel}`),
    ),
  ];
};

export const appRunArgs = (spec: SandboxSpec, hash: string): string[] => {
  const n = names(spec.name);
  return [
    "run",
    "-d",
    "--name",
    n.app,
    "--hostname",
    spec.name,
    "--init",
    ...label(spec.name, "app", hash),
    "--network",
    n.network,
    "--network-alias",
    "app",
    "--user",
    USER,
    ...HARDENING,
    "--read-only",
    ...LIMITS,
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,size=1g",
    "--tmpfs",
    `/home/airlock:rw,nosuid,nodev,size=512m,uid=${IMAGE_UID},gid=${IMAGE_UID}`,
    ...workspaceMounts(spec),
    ...envArgs({ ...PROXY_ENV, ...GIT_ENV, HOME: "/home/airlock", ...spec.env }),
    "--workdir",
    "/work",
    spec.image.tag,
    "sleep",
    "infinity",
  ];
};

export const serviceRunArgs = (sandbox: string, service: ServiceName, hash: string): string[] => {
  const n = names(sandbox);
  return [
    "run",
    "-d",
    "--name",
    n.service(service),
    ...label(sandbox, "service", hash),
    "--network",
    n.network,
    "--network-alias",
    service,
    ...envArgs(SERVICES[service].env),
    SERVICES[service].image,
  ];
};

export interface GatewayArgs {
  sandbox: string;
  image: string;
  squidConf: string;
  ports: readonly number[];
  hash: string;
}

export const gatewayCreateArgs = ({
  sandbox,
  image,
  squidConf,
  ports,
  hash,
}: GatewayArgs): string[] => [
  "create",
  "--name",
  names(sandbox).gateway,
  ...label(sandbox, "gateway", hash),
  ...HARDENING,
  "--read-only",
  "--tmpfs",
  "/tmp",
  ...ports.flatMap((port, i) => ["-p", `127.0.0.1:${port}:${GATEWAY_PORT_BASE + i}`]),
  "-e",
  `SQUID_CONF_B64=${Buffer.from(squidConf).toString("base64")}`,
  "-e",
  `FORWARDS=${ports.map((port, i) => `${GATEWAY_PORT_BASE + i}:app:${port}`).join(" ")}`,
  image,
];

const containerCwd = (cwd: string): string => {
  const normalised = posix.normalize(cwd || ".");
  if (normalised.startsWith("..") || posix.isAbsolute(normalised)) {
    throw new AirlockError(`working directory is outside the workspace: ${cwd}`);
  }
  return posix.join("/work", normalised);
};

export const execArgs = (request: ExecRequest): string[] => [
  "exec",
  "-i",
  ...(request.tty ? ["-t"] : []),
  "--user",
  USER,
  "--workdir",
  containerCwd(request.cwd),
  ...request.envKeys.flatMap((key) => ["-e", key]),
  names(request.name).app,
  "bash",
  "-c",
  request.command,
];
