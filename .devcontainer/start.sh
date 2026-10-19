#!/bin/sh
# The workspace's start command (Story 5.10): CI's install, then idle.
# The Compose healthcheck reports healthy once /tmp/xaravel-ready exists,
# that is, once the frozen-lockfile install has finished.
set -eu
rm -f /tmp/xaravel-ready
cd /workspaces/xaravel
bun install --frozen-lockfile --ignore-scripts
touch /tmp/xaravel-ready
exec sleep infinity
