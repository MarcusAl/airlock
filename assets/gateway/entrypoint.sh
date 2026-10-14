#!/bin/sh
set -eu
echo "$SQUID_CONF_B64" | base64 -d > /tmp/squid.conf
for forward in ${FORWARDS:-}; do
  listen="${forward%%:*}"
  target="${forward#*:}"
  socat "TCP-LISTEN:${listen},fork,reuseaddr" "TCP:${target}" &
done
exec squid -N -f /tmp/squid.conf
