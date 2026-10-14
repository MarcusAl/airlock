import type { NetPolicy } from "../backend/Backend.js";
import { AirlockError } from "../errors.js";

export const GATEWAY_ASSETS = new URL("../../assets/gateway/", import.meta.url);

export const BLOCKED_RANGES = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4",
  "240.0.0.0/4",
  "::1",
  "::/128",
  "64:ff9b::/96",
  "2002::/16",
  "fc00::/7",
  "fe80::/10",
];

const HOST = /^\.?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

export const validHost = (host: string): string => {
  if (!HOST.test(host)) throw new AirlockError(`invalid host for --allow: ${JSON.stringify(host)}`);
  return host.toLowerCase();
};

const BASE = [
  "http_port 3128",
  "pid_filename none",
  "cache deny all",
  "access_log stdio:/dev/stdout",
  "cache_log /dev/stderr",
  "coredump_dir /tmp",
  "acl SSL_ports port 443",
  "acl Safe_ports port 80 443",
  "acl CONNECT method CONNECT",
  `acl blocked_dst dst ${BLOCKED_RANGES.join(" ")}`,
  "http_access deny !Safe_ports",
  "http_access deny CONNECT !SSL_ports",
  "http_access deny manager",
  "http_access deny blocked_dst",
];

const coveredBy = (wildcard: string, host: string): boolean => {
  const bare = host.startsWith(".") ? host.slice(1) : host;
  return wildcard !== host && (bare === wildcard.slice(1) || bare.endsWith(wildcard));
};

const collapse = (hosts: readonly string[]): string[] => {
  const unique = [...new Set(hosts)];
  const wildcards = unique.filter((host) => host.startsWith("."));
  return unique.filter((host) => !wildcards.some((wildcard) => coveredBy(wildcard, host)));
};

const allowRules = ({ mode, allow }: NetPolicy): string[] => {
  if (mode === "open") return ["http_access allow all"];
  if (mode === "none" || allow.length === 0) return [];
  const hosts = collapse(allow.map(validHost));
  return [`acl allowed dstdomain -n ${hosts.join(" ")}`, "http_access allow allowed"];
};

export const compileSquidConfig = (policy: NetPolicy): string =>
  `${[...BASE, ...allowRules(policy), "http_access deny all"].join("\n")}\n`;
