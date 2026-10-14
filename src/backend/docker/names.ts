export const names = (sandbox: string) => ({
  app: `airlock-${sandbox}`,
  gateway: `airlock-${sandbox}-gw`,
  network: `airlock-${sandbox}`,
  cache: `airlock-${sandbox}-cache`,
  volume: (rel: string) => `airlock-${sandbox}-${rel.replaceAll("/", "-")}`,
  service: (service: string) => `airlock-${sandbox}-${service}`,
});

export const label = (
  sandbox: string,
  role: "app" | "gateway" | "service",
  hash: string,
): string[] => [
  "--label",
  `airlock.name=${sandbox}`,
  "--label",
  `airlock.role=${role}`,
  "--label",
  `airlock.config=${hash}`,
];
