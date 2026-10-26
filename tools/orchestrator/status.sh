#!/usr/bin/env bash
# Prints the unattended orchestrator's status for a person or a monitoring
# session: host time, the last iterations, the clone's branch, a STOP file,
# a usage-limit hit and the newest narration lines. It runs on the
# orchestrator's host, or on a remote one over SSH when XARAVEL_ORCH_HOST is
# set (an ssh destination such as an alias in ~/.ssh/config). Read-only.
#
# Usage: tools/orchestrator/status.sh [narration-lines]   (default 3)
# Env:   XARAVEL_ORCH_HOST   ssh destination; unset = this machine
#        XARAVEL_ORCH_STATE  state dir on the host (default ~/.xaravel-orchestrator)
#        XARAVEL_REPO        orchestrator clone on the host (default ~/repos/xaravel)
set -uo pipefail

LINES="${1:-3}"
case "$LINES" in ''|*[!0-9]*) echo "usage: status.sh [narration-lines]" >&2; exit 2 ;; esac

remote() {
  cat <<'REMOTE'
set -uo pipefail
STATE="${XARAVEL_ORCH_STATE:-$HOME/.xaravel-orchestrator}"
REPO="${XARAVEL_REPO:-$HOME/repos/xaravel}"
echo "time: $(date '+%Y-%m-%d %H:%M %Z')"
if [ ! -d "$STATE" ]; then echo "no orchestrator state at $STATE"; exit 1; fi
echo "branch: $(git -C "$REPO" branch --show-current 2>/dev/null || echo '?')"
if pgrep -f "claude -p" >/dev/null 2>&1 || pgrep -f "codex exec -C $REPO" >/dev/null 2>&1; then echo "iteration: running"; else echo "iteration: not running (between iterations, or stopped)"; fi
cli="$(grep -h '^XARAVEL_ORCH_CLI=' "$STATE/env" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d "\"' ")"
echo "cli: ${cli:-claude}"
[ -e "$STATE/STOP" ] && echo "STOP file: present"
echo "history:"; tail -3 "$STATE/history" 2>/dev/null | sed 's/^/  /'
log="$(ls -t "$STATE"/logs/*.log 2>/dev/null | head -1)"
if [ -n "$log" ]; then
  mod="$(stat -f %Sm -t %H:%M "$log" 2>/dev/null || date -r "$log" +%H:%M 2>/dev/null)"
  echo "latest log: $(basename "$log") (written $mod)"
  grep -oE "hit your (session|usage) limit[^\"]{0,60}" "$log" 2>/dev/null | tail -1 | sed 's/^/usage limit: /'
  grep -q "Selected model is at capacity" "$log" 2>/dev/null && echo "model at capacity: yes (Codex)"
  echo "narration:"
  # Claude's stream-json assistant text, or Codex's --json agent messages; non-JSON lines are skipped.
  jq -rR 'fromjson? | if .type=="assistant" then (.message.content[]? | select(.type=="text") | .text)
         elif .type=="item.completed" and .item.type=="agent_message" then .item.text else empty end' "$log" 2>/dev/null \
    | tail -n "__LINES__" | sed 's/^/  /'
fi
REMOTE
}

script="$(remote | sed "s/__LINES__/$LINES/")"
if [ -n "${XARAVEL_ORCH_HOST:-}" ]; then
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$XARAVEL_ORCH_HOST" \
    "XARAVEL_ORCH_STATE='${XARAVEL_ORCH_STATE:-}' XARAVEL_REPO='${XARAVEL_REPO:-}' bash -s" <<<"$script"
else
  bash -c "$script"
fi
