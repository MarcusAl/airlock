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
3. **Tripwire.** After every command (including one you stop with Ctrl-C or that gets terminated), and before every agent tool call, airlock re-checks the workspace, pausing the container while it removes anything. Anything the code planted that your tools would execute on your machine (editor tasks, agent config, nested `.git` anywhere including `node_modules`, symlinks pointing outside) is removed or quarantined.
4. **Agents.** `airlock claude <name>` starts your normal Claude Code, however you already sign in. A `PreToolUse` hook rewrites every Bash command into `airlock exec`, so commands run in the container. A few plain git writes (`git add`, `git commit -m`, `git restore`) are the exception: they run on your machine with hooks, fsmonitor, pager and editor forced off. The hook sees every tool call: file tools are blocked outside the workspace and from writing into `.git`, web and MCP tools ask first, and tools it doesn't know are denied. MCP servers are off unless you pass `--allow-mcp`. If the hook fails, the call is blocked, not run.
5. **Leave.** `airlock export` writes a zip, patch or git bundle for submission. `airlock promote` copies the repo out as a normal git repository once you trust it: that is the inner door.

### Two windows, both deliberate

From the code's point of view the container is the whole machine: it doesn't know your computer exists. airlock, your agent and your editor stay outside on purpose, as the operators of the airlock. The box has exactly two openings:

1. **The shared workspace folder.** Files only. The danger is not the box reaching out but writing a file that something on your machine later executes: an editor task, a git hook or filter, a symlink to `~/.ssh`. The quarantine, the read-only `.git`, the tripwire and the hook's path checks all guard this one opening.
2. **The gateway.** Outbound only as the policy allows and never to your machine; inbound only on ports you publish.

## Getting started

### 1. Install the prerequisites

| You need | macOS | Linux | Check it works |
|---|---|---|---|
| A Docker runtime | [OrbStack](https://orbstack.dev) (`brew install orbstack`) or Docker Desktop | Docker Engine, with your user in the `docker` group | `docker info` prints server details |
| Node.js 22 or newer | `brew install node`, or nvm | your package manager, or nvm | `node -v` |
| git | included with Xcode tools | your package manager | `git --version` |
| Claude Code (optional) | [install guide](https://docs.claude.com/en/docs/claude-code) | same | `claude --version` |

Windows (WSL2 with Docker Desktop) should work but is untested. On Linux, containers run as uid 1000, so v1 assumes your user is uid 1000 (`id -u`); other uids are untested and likely to hit permission errors.

### 2. Install airlock

```bash
git clone https://github.com/MarcusAl/airlock && cd airlock
npm ci && npm run build && npm link
airlock --version          # prints the version
airlock                    # lists every command
```

You don't need TypeScript installed: `npm ci` brings the compiler as a project dependency and `npm run build` turns it into plain JavaScript in `dist/`. At runtime airlock needs only Node. If `npm link` fails with a permissions error (common with a distro-packaged Node on Linux), install Node with nvm, or run `npm config set prefix ~/.local` and put `~/.local/bin` on your PATH.

### 3. Make your editor safe for untrusted folders

See [Editors](#editors). For VS Code and Cursor, turn on `security.workspace.trust.enabled` once.

### 4. Your first sandbox

```bash
airlock import https://github.com/bilawalsidhu/gods-eye-view
```

This clones the repository inside a container, prints a scan report, lists anything it quarantined, and suggests next steps. Then:

```bash
airlock install gods-eye-view
airlock run gods-eye-view --net open --port 4173 -- npm run dev -- --host 0.0.0.0 --port 4173
# open http://127.0.0.1:4173, Ctrl-C to stop
```

The first `install` or `run` for a language version builds an image, which takes a minute or two; later runs reuse it. Dev servers must listen on `0.0.0.0` inside the box for `--port` to reach them.

### 5. A take-home, with a database and Claude

```bash
airlock import https://github.com/acme/take-home --name takehome
airlock run takehome --with postgres       # DATABASE_URL is set inside the box
airlock install takehome
airlock exec takehome -- bin/rails db:prepare
airlock claude takehome                    # Claude Code, commands routed into the box
airlock export takehome                    # zip of your commits, ready to submit
```

Private repository? Clone it yourself, then `airlock import ./path`.

Inside `airlock claude`, commands Claude routes into the box run without asking you each time (they can only touch the box). Git commands that run on your machine, web fetches and MCP tools still ask.

When you're done for the day, `airlock stop <name>` stops the sandbox's containers, including any dev server still running in them.

### Where things live

```
~/sandboxes/<name>/
  workspace/      the code: open this in your editor
  quarantined/    editor and agent config moved out of the way
  exports/        zips, patches and bundles from airlock export
  state.json      network policy, ports, services, preset
```

Set `AIRLOCK_HOME` to keep sandboxes somewhere else. Docker resources are named `airlock-<name>*` and labelled `airlock.name=<name>`.

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
| `stop <n>` | Stop the sandbox's containers and anything running in them |
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
- **Hook timeouts.** Claude Code lets a call through if a hook exceeds its timeout (120 seconds). The box could try to cause that by flooding the workspace with files, so the hook's check has its own budget (200,000 entries, 15 seconds per pass, 5 seconds waiting for another cleanup) and denies when it runs out. There is no standing "allow" rule: the hook itself approves each command it routes into the box, so if a hook call fails or times out, Claude Code falls back to its normal permission prompt rather than running anything silently. Crashes and errors block.
- **A running box can race your agent's file edits.** The container is paused while the tripwire runs, but between the hook approving an edit and the edit landing, code in the box could swap a folder for a symlink. Stop long-running processes before letting an agent edit, if that matters to you.
- **Your own Claude Code hooks still run on your machine.** A formatter hook in your user settings (Prettier after every edit, say) would load the repository's config on your machine.
- **`promote` is a trust decision.** Quarantined files that were committed come back with it, and airlock lists them.
- **Service containers** (`--with postgres|redis`) run the official images without extra hardening; they never run repository code.

## Troubleshooting

| Message or symptom | What to do |
|---|---|
| `Docker isn't running` | Start OrbStack or Docker Desktop, then retry |
| `` `docker` isn't installed or isn't on your PATH `` | Install a Docker runtime (step 1) |
| `port N is already in use on this machine` | Something else holds the port: pick another `--port` or stop it |
| `couldn't pull the base image` | Check your network, the `--version`, or the `--image` reference |
| A download fails inside the box | The network is `none` by default. Use `--net allowlist --allow <host>`, or `--net open`. `docker logs airlock-<name>-gw` shows each request the gateway refused (`TCP_DENIED`) |
| `the network gateway stopped right after starting` | The message includes the gateway's log. Usually an invalid `--allow` value |
| Claude says a call was blocked by airlock | Expected for files outside the workspace, unknown tools and git writes other than plain `add`, `commit -m` and `restore`. The message says why |
| `container is paused` | A cleanup was interrupted. The next `run`, `exec`, `install`, `shell` or `claude` unpauses it, or run `docker unpause airlock-<name>` |
| `tripwire: <folder> (unreadable, so not checked)` | Code in the box made a folder unreadable. Your tools can't read it either, and airlock won't change permissions on your machine. Fix it from inside the box, e.g. `airlock exec <name> -- chmod -R u+rwx <folder>`, and the next check covers it |
| Claude says every call is blocked: `too many files in the workspace` | The workspace is too large to check safely (over 200,000 entries). Remove generated files from it or use `airlock exec` directly |
| `tripwire could not check the workspace` | Something in the workspace couldn't be read. airlock warns but the command already ran; look at what the code created |
| `sandbox is busy (stale lock?)` | Another airlock command is running for that sandbox; if not, delete the `.lock` folder named in the message |
| `sandbox state is unreadable` | Fix or delete the `state.json` named in the message |
| Something unexpected | Rerun with `AIRLOCK_DEBUG=1` for a stack trace and open an issue |

## Cleaning up

```bash
airlock ls                       # what exists
airlock stop <name>              # stop its containers; keeps everything
airlock rm <name>                # refuses if you never exported or promoted your work
airlock rm <name> --force        # delete anyway
docker image ls 'airlock-*'      # cached images; remove with docker image rm
```

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
| Linux users whose uid isn't 1000 | Containers run as uid 1000; mapping your uid needs testing on Linux |

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
