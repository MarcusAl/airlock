# airlock

Run code you don't trust yet without letting it touch your machine.

Fake take-home assignments are a known malware route: a `postinstall` script or an editor task can steal your SSH keys and cloud credentials. A popular GitHub project runs thousands of strangers' install scripts with your permissions too. airlock runs that code in a locked-down container behind a network gateway, while your editor and Claude Code work on the files from outside.

## How it keeps you safe

To the code, the container is the whole machine: a non-root user with no capabilities, a read-only root filesystem and CPU, memory and process limits, on an internal Docker network with no route out. Your home folder and credentials stay outside, and no environment variable goes in unless you forward it with `--env`.

The box has two openings, both deliberate:

1. **The shared workspace folder.** Files only. The risk is the code writing something your machine later runs, such as an editor task, a git hook or a symlink to `~/.ssh`. Three guards cover it:
   - **Quarantine.** On import, airlock moves editor and agent config (`.vscode`, `.cursor`, `.claude`, `CLAUDE.md`, `.mcp.json`, `.envrc` and more) to `quarantined/`.
   - **Read-only `.git`.** The container can't plant hooks or config in your repository.
   - **Tripwire.** After every command and before every agent tool call, airlock re-checks the workspace. If the code planted editor tasks, agent config, nested `.git` folders or symlinks pointing outside, it pauses the box and removes or quarantines them.
2. **The network gateway.** A Squid proxy applies the policy: `none` (default), `allowlist` (package registries plus hosts you name) or `open`. Every mode refuses private, loopback and link-local addresses, including your machine's. Inbound traffic reaches only ports you publish, on `127.0.0.1`.

Your agent stays outside. `airlock claude <name>` starts your normal Claude Code with your usual sign-in, and a hook rewrites every Bash command into `airlock exec`. File tools can't leave the workspace or write into `.git`. Web and MCP tools ask first, MCP servers stay off without `--allow-mcp`, and unknown tools are denied. Commands routed into the box run without prompting you; anything that would run on your machine still asks. Only plain `git add`, `git commit -m` and `git restore` run on your machine, with hooks, fsmonitor, pager and editor forced off.

airlock never builds the repository's own Dockerfile.

## Install

| You need | Check |
|---|---|
| A Docker runtime: [OrbStack](https://orbstack.dev) or Docker Desktop on macOS, Docker Engine on Linux (your user in the `docker` group) | `docker info` |
| Node.js 22 or newer | `node -v` |
| git | `git --version` |
| [Claude Code](https://docs.claude.com/en/docs/claude-code) (optional) | `claude --version` |

```bash
npm i -g @marcusal/airlock
airlock --version
```

On Linux, containers run as uid 1000, so v1 assumes your user is uid 1000 (`id -u`); other uids are untested and likely to hit permission errors. Windows (WSL2 with Docker Desktop) is untested.

Before you open a sandbox in VS Code or Cursor, turn on Workspace Trust (see [Editors](#editors)).

## Quick start

Try a project from GitHub:

```bash
airlock import https://github.com/bilawalsidhu/gods-eye-view
airlock install gods-eye-view
airlock run gods-eye-view --net open --port 4173 -- npm run dev -- --host 0.0.0.0 --port 4173
# open http://127.0.0.1:4173, Ctrl-C to stop
```

`import` prints a scan report and lists what it quarantined. The first build of a language image takes a minute or two. Dev servers must listen on `0.0.0.0` for `--port` to reach them.

A take-home with Postgres and Claude:

```bash
airlock import https://github.com/example-co/rails-take-home --name takehome
airlock run takehome --with postgres       # sets DATABASE_URL inside the box
airlock install takehome
airlock exec takehome -- bin/rails db:prepare
airlock claude takehome                    # Claude Code, commands routed into the box
airlock export takehome                    # zip of your latest commit, ready to submit
```

For a private repository, clone it yourself and run `airlock import ./path` (committed work only). Run `airlock stop <name>` when you're done.

Sandboxes live in `~/sandboxes/<name>/` (or `AIRLOCK_HOME`): open `workspace/` in your editor, and find moved config in `quarantined/` and exports in `exports/`.

## Commands

| Command | What it does |
|---|---|
| `import <https-url\|path> [--name n]` | Clone in a container, scan, quarantine editor and agent config |
| `install <n>` | Install dependencies with the detected package manager; a closed sandbox gets registry access for the install only |
| `run <n> [options] [-- cmd]` | Start or reconfigure the sandbox, optionally running a command |
| `exec <n> [--cwd dir] [--env KEY] -- cmd` | Run one command in the sandbox (`--sh='…'` for a shell string) |
| `shell <n>` | Interactive shell in the sandbox |
| `claude <n> [--allow-mcp] [-- args]` | Your Claude Code with commands routed into the sandbox |
| `export <n> [--zip\|--patch\|--bundle] [-o file]` | Latest commit (zip), commits since import (patch) or everything (bundle); uncommitted changes are left out |
| `promote <n> --to <dir> [--force]` | Copy out as a normal git repo once you trust it |
| `ls` / `stop <n>` | List sandboxes / stop a sandbox's containers and anything running in them |
| `rm <n> [--force]` | Delete; refuses while there is uncommitted or unexported work |

`run` options: `--net none|allowlist|open`, `--allow <host>`, `--port <p>`, `--with postgres|redis`, `--env <KEY>`, `--preset node|ruby|python|go`, `--version <v>`, `--image <ref>`, `--apt <package>`, `--rebuild`. `run`, `install`, `exec`, `shell`, `stop` and `rm` take `--dry-run` to print the Docker commands; every command takes `--help`.

## Editors

Edit anywhere, run only through airlock. Your editor and terminal run on your machine, so `npm test` in a normal terminal runs it there. Use `airlock exec <name> -- npm test` or `airlock shell <name>`.

- **VS Code and Cursor:** turn on `security.workspace.trust.enabled`. Untrusted folders open in Restricted Mode, which stops tasks and most extensions. Cursor ships with it off.
- **JetBrains IDEs:** choose "Preview in Safe Mode".
- **Sublime Text, Vim, Zed and others:** opening files runs nothing, but keep language-server plugins off for untrusted folders.

airlock doesn't attach your editor inside the box: Dev Containers forwarded the SSH agent and git credentials into it.

## Honest limits

- **Container escapes:** sandboxes share the Docker VM's Linux kernel, so a kernel exploit is out of scope.
- **Prompt injection is boxed, not removed:** an injected agent can do anything inside the sandbox and anything the network policy allows.
- **The tripwire is periodic:** a long-running process could plant a file between passes for your shell prompt or editor's git panel to read.
- **`allowlist` includes the registries,** which can carry data out (`npm publish`, a public bucket).
- **Nested `node_modules` in monorepos land on your machine;** only the root one lives in a volume. Keep Restricted Mode on.
- **Hook timeouts:** airlock's check denies when it exceeds its budget (200,000 entries, 15 seconds); a timed-out hook falls back to Claude Code's normal prompt, and crashes block.
- **A running box can race your agent's edits:** code could swap a folder for a symlink between approval and write. Stop long-running processes first if that matters.
- **Your own Claude Code hooks run on your machine:** a Prettier-after-edit hook would load the repository's config there.
- **`promote` is a trust decision:** committed quarantined files come back with it, and airlock lists them.
- **Service containers** (`--with postgres|redis`) run official images without extra hardening; they never run repository code.

## Troubleshooting

| Message or symptom | What to do |
|---|---|
| `Docker isn't running` | Start OrbStack or Docker Desktop, then retry |
| `port N is already in use on this machine` | Pick another `--port` or stop whatever holds it |
| A download fails inside the box | The network is `none` by default: use `--net allowlist --allow <host>` or `--net open`. `docker logs airlock-<name>-gw` shows refused requests (`TCP_DENIED`) |
| `install-scripts not yet covered by allowScripts` | npm 11 blocks dependency install scripts. Run `airlock exec <name> -- npm install-scripts approve <package>`, then `airlock install <name>` |
| Claude says a call was blocked by airlock | Expected for files outside the workspace, unknown tools and git writes other than plain `add`, `commit -m` and `restore`. The message says why |
| `sandbox is busy` | Another airlock command is starting or checking that sandbox; retry shortly. Locks left by a crashed command clear themselves |
| `docker … didn't finish in time` | Docker stopped responding. Check OrbStack or Docker Desktop is running and not stuck, then retry |
| Anything else | Rerun with `AIRLOCK_DEBUG=1` for a stack trace and open an issue |

## Not in v1

- A VM per sandbox (Apple `container`, gVisor) to remove the shared kernel.
- An agent inside the sandbox on your subscription; it needs a credential-isolating proxy.
- Canary credentials, services beyond Postgres and Redis, non-Debian base images, Linux uids other than 1000.

Prior art: [giladno/sbx](https://github.com/giladno/sbx), [marhaasa/eredo](https://github.com/marhaasa/eredo), [trailofbits/claude-code-devcontainer](https://github.com/trailofbits/claude-code-devcontainer), [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/get-started.md), [sandbox-runtime](https://github.com/anthropic-experimental/sandbox-runtime). airlock keeps your agent and its sign-in on your machine and runs ordinary apps with ports and an egress policy.

## For contributors

```bash
npm ci && npm run build
npm run check && npm run typecheck && npm test   # what CI runs
npm run smoke                                    # end-to-end against real Docker (local only)
```

Releases are maintainer-approved: a GitHub Release stages the version through npm trusted publishing (provenance, no stored token), and it goes live only after the maintainer approves it on npm with two-factor authentication.

## License

MIT
