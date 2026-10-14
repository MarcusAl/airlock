import { DEFAULT_RULES, type Finding, type Rule } from "./rules.js";
import { walk } from "./walk.js";

export class Scanner {
  constructor(private readonly rules: readonly Rule[] = DEFAULT_RULES) {}

  scan(root: string): Finding[] {
    return walk(root)
      .flatMap((file) => this.rules.flatMap((rule) => rule.check(file)))
      .sort((a, b) => a.path.localeCompare(b.path));
  }
}

export const formatReport = (findings: readonly Finding[]): string => {
  if (findings.length === 0) return "Scan: nothing suspicious found.";
  const line = (f: Finding) => `  [${f.severity}] ${f.path}: ${f.detail}`;
  const high = findings.filter((f) => f.severity === "high");
  const medium = findings.filter((f) => f.severity === "medium");
  return [
    `Scan: ${high.length} high, ${medium.length} medium`,
    ...high.map(line),
    ...medium.map(line),
  ].join("\n");
};
