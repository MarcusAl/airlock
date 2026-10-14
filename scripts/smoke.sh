#!/usr/bin/env bash
# Local end-to-end checks against real Docker. Not run in CI.
set -uo pipefail
cd "$(dirname "$0")/.." && npm run build >/dev/null
export AIRLOCK_HOME
AIRLOCK_HOME=$(mktemp -d)
AL="node $PWD/dist/cli/index.js"
FIX=$(mktemp -d)
fails=0

pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; fails=$((fails + 1)); }
check() { local label=$1; shift; if "$@" >/dev/null 2>&1; then pass "$label"; else fail "$label"; fi; }
blocked() {
  local label=$1; shift
  "$@" >/dev/null 2>&1
  local code=$?
  if [ "$code" -eq 3 ]; then pass "$label"; else fail "$label (exit $code, wanted 3)"; fi
}
probe() { $AL exec smoke -- node probe.mjs "$1"; }
noproxy() { $AL exec smoke --sh="env -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy node probe.mjs $1"; }
absent() { ! test -e "$AIRLOCK_HOME/smoke/workspace/$1"; }

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
python3 -m http.server 80 --bind 0.0.0.0 >/dev/null 2>&1 &
HOSTSRV=$!
sleep 1
blocked "open blocks the host by name" probe http://host.docker.internal/
blocked "open blocks OrbStack host IP" probe http://0.250.250.254/
blocked "open blocks docker bridge IP" probe http://172.17.0.1/
blocked "no route around the proxy" noproxy https://example.com
blocked "no direct route to the host" noproxy http://0.250.250.254/
kill $HOSTSRV 2>/dev/null
check "squid logged the denials" sh -c "docker logs airlock-smoke-gw 2>&1 | grep -q TCP_DENIED"
check "no DNS from the box" sh -c "! $AL exec smoke -- getent hosts example.com"
check ".git is read-only in the box" sh -c "! $AL exec smoke -- touch .git/planted"
$AL exec smoke --sh='mkdir -p .vscode && echo {} > .vscode/tasks.json' >/dev/null 2>&1
check "tripwire moved planted config" absent .vscode/tasks.json
$AL exec smoke --sh='mkdir -p vendor/x/.git' >/dev/null 2>&1
check "tripwire removed nested .git" absent vendor/x/.git
$AL exec smoke --sh='ln -s /etc/passwd escape' >/dev/null 2>&1
check "tripwire removed escaping symlink" absent escape
$AL run smoke --port 18081 -- sh -c 'nohup node -e "require(\"http\").createServer((q,s)=>s.end(\"ok\")).listen(18081)" >/dev/null 2>&1 &'
sleep 2
check "port forward reachable" sh -c 'curl -fs http://127.0.0.1:18081 | grep -q ok'
check "port bound to loopback only" sh -c "docker port airlock-smoke-gw | grep -q '127.0.0.1:18081'"
docker rm -f $(docker ps -aq --filter label=airlock.name=smoke) >/dev/null 2>&1
docker volume rm $(docker volume ls -q --filter label=airlock.name=smoke) >/dev/null 2>&1
docker network rm airlock-smoke >/dev/null 2>&1
echo "failures: $fails"
exit $fails
