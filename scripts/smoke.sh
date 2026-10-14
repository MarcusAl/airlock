#!/usr/bin/env bash
# Local end-to-end checks against real Docker. Not run in CI.
set -uo pipefail
cd "$(dirname "$0")/.." && npm run build >/dev/null
export AIRLOCK_HOME
AIRLOCK_HOME=$(mktemp -d)
AL="node $PWD/dist/cli/index.js"
HOOK="$PWD/dist/agent/hook.js"
FIX=$(mktemp -d)
WS="$AIRLOCK_HOME/smoke/workspace"
GW=airlock-smoke-gw
fails=0

cleanup() {
  docker rm -f $(docker ps -aq --filter label=airlock.name=smoke) >/dev/null 2>&1
  docker volume rm $(docker volume ls -q --filter label=airlock.name=smoke) >/dev/null 2>&1
  docker network rm airlock-smoke >/dev/null 2>&1
}
trap cleanup EXIT

pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; fails=$((fails + 1)); }
check() { local label=$1; shift; if "$@" >/dev/null 2>&1; then pass "$label"; else fail "$label"; fi; }
# exit 3 = probe.mjs saw a network failure (not a crash or a missing file)
blocked() {
  local label=$1; shift
  "$@" >/dev/null 2>&1
  local code=$?
  if [ "$code" -eq 3 ]; then pass "$label"; else fail "$label (exit $code, wanted 3)"; fi
}
probe() { $AL exec smoke -- node probe.mjs "$1"; }
noproxy() { $AL exec smoke --sh="env -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy node probe.mjs $1"; }
denied_by_squid() { docker logs "$GW" 2>&1 | grep "TCP_DENIED" | grep -q "$1"; }
quarantined() { find "$AIRLOCK_HOME/smoke/quarantined" -path "*$1" | grep -q .; }
output_has() {
  local text=$1; shift
  local out
  out=$("$@" 2>&1)
  grep -q "$text" <<<"$out"
}

cp scripts/probe.mjs "$FIX/"
cat >"$FIX/package.json" <<'JSON'
{ "name": "smoke", "version": "1.0.0", "dependencies": { "is-number": "7.0.0" }, "scripts": { "postinstall": "echo hi" } }
JSON
git -C "$FIX" init -q && git -C "$FIX" add -A && git -C "$FIX" -c user.name=s -c user.email=s@s commit -qm init

check "import" $AL import "$FIX" --name smoke
blocked "none blocks egress" probe https://example.com
check "install via allowlist" $AL install smoke
blocked "back to none after install" probe https://registry.npmjs.org
check "open allows public" $AL run smoke --net open -- node probe.mjs https://example.com
blocked "open: host by name blocked" probe https://host.docker.internal/
check "  ...by squid's address rule" denied_by_squid host.docker.internal
blocked "open: OrbStack host IP blocked" probe https://0.250.250.254/
check "  ...by squid's address rule" denied_by_squid 0.250.250.254
blocked "open: docker bridge IP blocked" probe https://172.17.0.1/
check "  ...by squid's address rule" denied_by_squid 172.17.0.1
blocked "no route around the proxy" noproxy https://example.com
blocked "no direct route to the host" noproxy https://0.250.250.254/
check "no DNS from the box" output_has "dns-failed" $AL exec smoke --sh='getent hosts example.com || echo dns-failed'
check ".git is read-only in the box" output_has "Read-only file system" $AL exec smoke -- touch .git/planted
$AL exec smoke --sh='mkdir -p .vscode && echo {} > .vscode/tasks.json' >/dev/null 2>&1
check "tripwire quarantined planted config" quarantined ".vscode/tasks.json"
$AL exec smoke --sh='mkdir -p pkgs/a/node_modules/b/.git' >/dev/null 2>&1
check "tripwire removed nested .git under node_modules" sh -c "test -d $WS/pkgs/a/node_modules/b && ! test -e $WS/pkgs/a/node_modules/b/.git"
$AL exec smoke --sh='ln -s /etc/passwd escape' >/dev/null 2>&1
check "tripwire removed escaping symlink" sh -c "! test -L $WS/escape"
hook() { printf '%s' "$1" | node "$HOOK" smoke "$WS"; }
check "hook routes Bash into the box" output_has '"exec","smoke"\|exec smoke' hook '{"tool_name":"Bash","tool_input":{"command":"ls"},"cwd":"'"$WS"'"}'
check "hook denies unknown command tools" output_has '"deny"' hook '{"tool_name":"Monitor","tool_input":{"command":"id"},"cwd":"'"$WS"'"}'
check "hook denies files outside" output_has '"deny"' hook '{"tool_name":"Read","tool_input":{"file_path":"'"$HOME"'/.ssh/config"},"cwd":"'"$WS"'"}'
$AL run smoke --port 18081 -- sh -c 'nohup node -e "require(\"http\").createServer((q,s)=>s.end(\"ok\")).listen(18081)" >/dev/null 2>&1 &'
sleep 2
check "port forward reachable" sh -c 'curl -fs http://127.0.0.1:18081 | grep -q ok'
check "port bound to loopback only" sh -c "docker port $GW | grep -q '127.0.0.1:18081'"
check "stop" $AL stop smoke
check "nothing running after stop" sh -c "test -z \"\$(docker ps -q --filter label=airlock.name=smoke)\""
check "starts again after stop" $AL exec smoke -- true
echo hello >"$WS/NOTES.txt" && git -C "$WS" add -A && git -C "$WS" -c user.name=s -c user.email=s@s commit -qm notes
check "rm refuses unexported work" output_has "never exported" $AL rm smoke
check "rm on a missing sandbox fails" output_has "no sandbox" $AL rm nosuch
check "export writes a zip" $AL export smoke -o "$FIX/out.zip"
check "zip holds the new commit" sh -c "unzip -l $FIX/out.zip | grep -q NOTES.txt"
check "rm --dry-run leaves everything" sh -c "$AL rm smoke --dry-run && test -d $AIRLOCK_HOME/smoke"
check "rm after export" $AL rm smoke
check "rm removed containers" sh -c "test -z \"\$(docker ps -aq --filter label=airlock.name=smoke)\""
echo "failures: $fails"
exit $fails
