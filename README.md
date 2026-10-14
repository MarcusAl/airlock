# airlock

Run code you don't trust yet without letting it touch your machine.

airlock imports a repository into a quarantine folder, runs everything it needs inside a locked-down container behind a network gateway, and lets your normal AI coding agent and editor work on it without the code ever executing on your laptop.

## Why

Two everyday situations put unknown code on a developer's machine:

- **Take-home assignments.** Fake take-homes are a known malware route. A `postinstall` script, an editor task that runs when you open the folder, or an obfuscated file in a config steals SSH keys, cloud credentials, browser sessions and wallets.
- **Trying a project you found on GitHub.** `npm install && npm run dev` on a repo with 40,000 stars still runs thousands of strangers' install scripts with your user's permissions.

The usual advice is "use a VM". airlock makes that the easy path for daily work instead of a chore.

## How it works

An airlock is a chamber between two environments: one door opens at a time, and things wait inside until they're judged safe.

```
 your machine                                   Docker (OrbStack / Docker Desktop / Linux)
 ───────────────────────────────                ───────────────────────────────────────────────
 ~/sandboxes/<name>/                            internal network (no route out)
   workspace/   <── bind mount ──────────────>    app container  /work
   quarantined/     (.git mounted read-only)       non-root, no capabilities, read-only rootfs,
   state.json                                      dependencies in volumes, CPU/memory/pid limits
                                                        │  HTTP(S)_PROXY
 your editor  ── edits files ──> workspace/              ▼
 your Claude Code ── Bash ──> hook ──> airlock exec    gateway container
                                                       Squid: none | allowlist | open
 browser ── 127.0.0.1:<port> ─────────────────────>    socat: forwards --port to the app
                                                        │
                                                        ▼  internet (never your machine or LAN)
```

1. **Import.** The repo is cloned inside a throwaway container, then scanned for risky contents: install scripts, editor and agent config, configs that execute code, encoded blobs, native binaries, escaping symlinks, nested git repositories. Editor and agent configuration (`.vscode`, `.cursor`, `.claude`, `CLAUDE.md`, `.mcp.json`, `.envrc`, `.agents` and more) is moved into `quarantined/`, so nothing in the folder can run on your machine when you open it.
2. **Run.** Every command runs in the app container. Its only way out is the gateway, which applies the network policy: `none` (default), `allowlist` (package registries plus hosts you name) or `open` (public internet). In every mode it refuses private, loopback and link-local addresses, including your machine's.
3. **Tripwire.** After every command, and before every routed agent command, airlock re-checks the workspace. Anything the code planted that your tools would execute on your machine (editor tasks, agent config, nested `.git`, symlinks pointing outside) is removed or quarantined.
4. **Agents.** `airlock claude <name>` starts your normal Claude Code, however you already sign in. A `PreToolUse` hook rewrites every Bash command into `airlock exec`, so commands run in the container. A few plain git writes (`git add`, `git commit -m`, `git restore`) are the exception: they run on your machine with hooks, fsmonitor, pager and editor forced off. File tools are blocked outside the workspace and from writing into `.git`. MCP servers are off unless you pass `--allow-mcp`. If the hook fails, the command is blocked, not run.
5. **Leave.** `airlock export` writes a zip, patch or git bundle for submission. `airlock promote` copies the repo out as a normal git repository once you trust it: that is the inner door.

## Quick start

Prerequisites: Docker (OrbStack, Docker Desktop or Docker Engine), Node.js 22+, git. Optional: Claude Code.

```bash
git clone https://github.com/MarcusAl/airlock && cd airlock
npm ci && npm run build && npm link
```

Try a popular project:

```bash
airlock import https://github.com/bilawalsidhu/gods-eye-view
airlock install gods-eye-view
airlock run gods-eye-view --net open --port 4173 -- npm run dev -- --host 0.0.0.0 --port 4173
# open http://127.0.0.1:4173
```

Work on a take-home:

```bash
airlock import https://github.com/acme/take-home --name takehome
airlock run takehome --with postgres
airlock install takehome
airlock exec takehome -- bin/rails db:prepare
airlock claude takehome              # Claude Code, commands routed into the box
airlock export takehome              # zip of your commits, ready to submit
```

## Commands

| Command | What it does |
|---|---|
| `import <https-url\|path> [--name n]` | Clone in a container, scan, quarantine editor and agent config |
| `install <n>` | Install dependencies with the detected package manager, registries only |
| `run <n> [options] [-- cmd]` | Start or reconfigure the sandbox, optionally running a command |
| `exec <n> [--cwd dir] [--env KEY] -- cmd` | Run one command in the sandbox (`--sh='…'` for a shell string) |
| `shell <n>` | Interactive shell in the sandbox |
| `claude <n> [--allow-mcp] [-- args]` | Your Claude Code with commands routed into the sandbox |
| `export <n> [--zip\|--patch\|--bundle] [-o file]` | Committed work as a submission artifact |
| `promote <n> --to <dir>` | Copy out as a normal repo once you trust it |
| `ls` | List sandboxes |
| `rm <n> [--force]` | Delete; refuses if work was never exported or promoted |

`run` options: `--net none|allowlist|open`, `--allow <host>`, `--port <p>` (published on 127.0.0.1 only), `--with postgres|redis`, `--env <KEY>` (forward one variable from your shell; nothing is passed implicitly), `--preset node|ruby|python|go`, `--version <v>`, `--image <ref>` and `--apt <package>` (Debian or Ubuntu bases only), `--rebuild` (pull the base image again for updates). `run`, `install`, `exec`, `shell` and `rm` accept `--dry-run` to print the Docker commands instead.

Presets detect the stack from lockfiles and pinned versions (`.nvmrc`, `engines`, `.ruby-version`, `Gemfile`, `.python-version`, `go.mod`). The repository's own Dockerfile is never built: its `RUN` steps would execute as root with network access.

## Editors

airlock doesn't care which editor you use: the workspace is a plain folder. The rule is simple: **edit anywhere, run only through airlock.** Everything airlock runs happens in the box, but your editor and your own terminal run on your machine. Running `npm test` in the folder from a normal terminal runs it on your machine; use `airlock exec <name> -- npm test` or `airlock shell <name>`. The remaining question is whether your editor runs code from the folder by itself.

- **VS Code and Cursor:** turn on Workspace Trust (`security.workspace.trust.enabled`). Untrusted folders open in Restricted Mode, which stops tasks and most extensions from running repository code. Cursor ships with Workspace Trust off.
- **JetBrains IDEs:** choose "Preview in Safe Mode" when asked whether to trust the project.
- **Sublime Text, Vim, Zed and others:** opening files runs nothing, but language-server plugins can start tools that read project configuration. Keep them off for untrusted folders.

Why airlock doesn't attach your editor inside the container: it was built and tested, and Dev Containers forwarded the host's SSH agent, a git credential channel and `~/.gitconfig` into the box. Code inside could then sign with your SSH key. The feature was cut.

## Threat model

**Defends against** code from a repository you don't trust: install and lifecycle scripts, tests, dev servers, build tools, editor and agent configuration, and prompt injection aimed at your agent through repository content.

**Does not defend against, or only limits:**

- **Container escapes.** All sandboxes share the Linux kernel of the Docker VM. A kernel exploit is out of scope; the VM-per-sandbox backends listed below are the answer to that.
- **Prompt injection is boxed, not eliminated.** An injected agent can still do anything inside the sandbox and anything the network policy allows.
- **The tripwire is periodic.** A long-running process could plant a file between passes, and something on your machine (a shell prompt, an editor's git panel) could read it in that window.
- **`allowlist` allows the registries themselves,** which can be used to publish data (`npm publish`, a public bucket).
- **Nested `node_modules` in monorepos land on your machine.** Only the root `node_modules` lives in a volume. Keep your editor in Restricted Mode.
- **Hook timeouts.** A hook that hangs past its 60 second timeout lets that one command through. Crashes and errors block.
- **`promote` is a trust decision.** Quarantined files that were committed come back with it, and airlock lists them.
- **Service containers** (`--with postgres|redis`) run the official images without extra hardening; they never run repository code.

## Not in v1

| Item | Why |
|---|---|
| VM per sandbox (Apple `container` on macOS 26, gVisor on Linux) | Stronger than shared-kernel containers; Apple's runtime is young and needs a network parity spike |
| Docker Sandboxes (`sbx`) backend | Built for agents with its own policy model; doesn't fit running general apps |
| Agent inside the sandbox with your subscription | Needs a credential-isolating proxy; the routing hook covers the need |
| Editor attach (Dev Containers) | Forwards SSH agent and git credentials into the box; see Editors |
| Canary credentials | Decoy keys that alert when touched; detection rather than containment |
| Services beyond Postgres and Redis | Added when a project needs one |
| Non-Debian custom base images | The image recipe uses `apt-get` |

## Prior art

- [giladno/sbx](https://github.com/giladno/sbx): disposable container plus IDE attach with canary credentials; no agent routing.
- [marhaasa/eredo](https://github.com/marhaasa/eredo): Claude Code in a container behind a Squid sidecar; injects the OAuth token into the container.
- [trailofbits/claude-code-devcontainer](https://github.com/trailofbits/claude-code-devcontainer): devcontainer for running Claude Code on untrusted code during audits.
- [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/get-started.md): microVM per agent with host-side credential injection.
- [anthropic-experimental/sandbox-runtime](https://github.com/anthropic-experimental/sandbox-runtime): OS-level sandboxing (Seatbelt, bubblewrap) for agent commands.

airlock's difference: your agent stays on your machine with its normal sign-in while every command it runs is routed into the sandbox, and the same tool runs ordinary apps with ports and egress policy.

## Development

```bash
npm run check && npm run typecheck && npm test   # what CI runs
npm run smoke                                    # end-to-end checks against real Docker (local only)
```

## License

MIT
