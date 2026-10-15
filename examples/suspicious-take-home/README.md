# Suspicious take-home (harmless demo)

A fake take-home assignment that uses the tricks real malicious repos use, with every payload replaced by a harmless `echo` or log line. It exists to show what `airlock import` and the tripwire catch.

| Trick | File | What airlock does |
| --- | --- | --- |
| Install script that runs on `npm install` | `package.json` (`postinstall`) | Flags it in the scan report |
| Editor task that runs when the folder opens | `.vscode/tasks.json` | Quarantines it |
| Agent instructions and MCP server config | `CLAUDE.md`, `.mcp.json` | Quarantines them |
| Lint config that runs code when your editor loads it | `eslint.config.js` | Flags it in the scan report |
| Link pointing outside the repo | `docs/outside-the-repo` | Flags it and removes it |
| App that plants an editor task while it runs | `index.js` | Tripwire removes it after the command |

```bash
airlock import examples/suspicious-take-home --name take-home
airlock run take-home -- node index.js
```
