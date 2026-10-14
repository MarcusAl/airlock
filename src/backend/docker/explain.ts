const EXPLANATIONS: ReadonlyArray<{
  pattern: RegExp;
  explain: (match: RegExpMatchArray) => string;
}> = [
  {
    pattern: /Cannot connect to the Docker daemon|docker daemon is not running/i,
    explain: () => "Docker isn't running; start OrbStack or Docker Desktop and try again",
  },
  {
    pattern:
      /(?:Bind for [\d.]+:|address already in use.*:)(\d+).*|port (\d+) is already allocated/i,
    explain: (match) =>
      `port ${match[1] ?? match[2]} is already in use on this machine; pick another --port or stop what's using it`,
  },
  {
    pattern:
      /pull access denied|failed to resolve source metadata|manifest unknown|not found: manifest/i,
    explain: () =>
      "couldn't pull the base image; check your network, the --version, or the --image reference",
  },
];

export const explainDockerError = (stderr: string): string | undefined => {
  for (const { pattern, explain } of EXPLANATIONS) {
    const match = stderr.match(pattern);
    if (match) return explain(match);
  }
  return undefined;
};
