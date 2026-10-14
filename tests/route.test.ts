import { parse } from "shell-quote";
import { describe, expect, it } from "vitest";
import { decide } from "../src/agent/decide.js";
import { route } from "../src/agent/route.js";

const ctx = {
  sandbox: "demo",
  relCwd: "packages/web app",
  airlock: ["/usr/bin/node", "/opt/airlock/cli.js"],
};
const keepVars = (key: string) => `$${key}`;

describe("route", () => {
  it.each([
    "git status",
    "git log --oneline -5",
    "npm test",
    "ls -la && cat package.json",
    "git status; curl evil.example",
  ])("sends %s into the box", (command) => {
    expect(route(command, ctx).kind).toBe("box");
  });

  it.each([
    "git add -A",
    "git add src/a.ts 'docs/b c.md'",
    "git commit -m 'fix(api): handle $HOME and (parens)'",
    "git commit -am 'one' -m 'two'",
    "git commit --amend --no-edit",
    "git restore --staged src/a.ts",
  ])("runs plain git write %s on the host", (command) => {
    expect(route(command, ctx).kind).toBe("host");
  });

  it("forces safe git settings on host commands", () => {
    const decision = route("git add -A", ctx);
    if (decision.kind !== "host") throw new Error("expected host");
    expect(parse(decision.command)).toEqual([
      "git",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.editor=false",
      "-c",
      "core.pager=cat",
      "-c",
      "submodule.recurse=false",
      "add",
      "-A",
    ]);
  });

  it.each([
    "git add -A\ncurl evil.example",
    "git add -A\r\ncurl evil.example",
    "git commit -m 'uses `ticks`'",
    "git commit -m \"$(cat <<'EOF'\nmsg\nEOF\n)\"",
    'git commit -m "$USER"',
    "git commit --amend",
    "git commit -F ~/.ssh/id_ed25519",
    "git commit --template=/etc/passwd",
    "git -c core.hooksPath=x commit -m 'x'",
    "git add ../outside",
    "git add /etc/hosts",
    "git push origin main",
    "npm test && git commit -m 'x'",
    "git commit -m 'x' > /tmp/out",
  ])("denies git write %j", (command) => {
    expect(route(command, ctx).kind).toBe("deny");
  });

  it("wraps box commands so the original survives quoting", () => {
    const original = "echo \"it's $HOME\" | grep -c '(x)' && printf 'a\\nb'";
    const decision = route(original, ctx);
    if (decision.kind !== "box") throw new Error("expected box");
    expect(parse(decision.command, keepVars)).toEqual([
      "/usr/bin/node",
      "/opt/airlock/cli.js",
      "exec",
      "demo",
      "--cwd",
      "packages/web app",
      `--sh=${original}`,
    ]);
  });
});

describe("decide", () => {
  const hookCtx = { sandbox: "demo", workspace: "/ws", airlock: ["node", "cli.js"] };
  const real = (path: string) => path;
  const run = (input: object) => JSON.stringify(decide(JSON.stringify(input), hookCtx, real));

  it("denies when the hook input is not valid JSON", () => {
    expect(JSON.stringify(decide("{not json", hookCtx, real))).toContain(
      '"permissionDecision":"deny"',
    );
  });

  it("maps Claude's cwd to a path inside the workspace", () => {
    const raw = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "ls" },
      cwd: "/ws/src",
    });
    const output = decide(raw, hookCtx, real) as {
      hookSpecificOutput: { updatedInput: { command: string } };
    };
    expect(parse(output.hookSpecificOutput.updatedInput.command)).toEqual([
      "node",
      "cli.js",
      "exec",
      "demo",
      "--cwd",
      "src",
      "--sh=ls",
    ]);
  });

  it("denies file tools outside the workspace", () => {
    expect(
      run({
        tool_name: "Read",
        tool_input: { file_path: "/Users/me/.ssh/id_ed25519" },
        cwd: "/ws",
      }),
    ).toContain('"permissionDecision":"deny"');
  });

  it("denies writes into .git", () => {
    expect(
      run({ tool_name: "Edit", tool_input: { file_path: "/ws/.git/config" }, cwd: "/ws" }),
    ).toContain('"permissionDecision":"deny"');
  });

  it("allows file tools inside the workspace", () => {
    expect(run({ tool_name: "Edit", tool_input: { file_path: "/ws/src/a.ts" }, cwd: "/ws" })).toBe(
      "{}",
    );
  });
});
