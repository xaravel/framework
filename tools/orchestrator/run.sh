#!/usr/bin/env bash
# Xaravel unattended orchestrator driver. Runs one fresh headless Claude Code
# session (tools/orchestrator/iteration.md), then re-execs itself from the
# freshly synced main, so merged changes to this script take effect on the
# next iteration. Stops when a STOP file appears or an iteration reports
# `stop`. Sessions run in auto permission mode, so a classifier reviews
# every action.
set -uo pipefail

export PATH="$HOME/.local/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
REPO="${XARAVEL_REPO:-$HOME/repos/xaravel}"
export XARAVEL_ORCH_STATE="${XARAVEL_ORCH_STATE:-$HOME/.xaravel-orchestrator}"
STATE="$XARAVEL_ORCH_STATE"
MODEL="${XARAVEL_ORCH_MODEL:-claude-opus-5-5}"
mkdir -p "$STATE/logs"

if [ -f "$STATE/env" ]; then set -a; . "$STATE/env"; set +a; fi
# Claude login token from `claude setup-token`, kept on the host.
if [ -f "$HOME/.claude-auth-token" ]; then
  CLAUDE_CODE_OAUTH_TOKEN="$(tr -d '[:space:]' < "$HOME/.claude-auth-token")"
  export CLAUDE_CODE_OAUTH_TOKEN
fi

say() { echo "$(date -u +%FT%TZ) $*" | tee -a "$STATE/history"; }

# When an iteration ends on Claude's usage limit ("You've hit your session
# limit · resets 11:50pm (America/Los_Angeles)"), print the reset time and the
# seconds to sleep until two minutes after it (at most 8 hours). A time up to
# an hour in the past means the limit has already reset. Prints nothing and
# fails when the log has no such message.
limit_wait() {
  local t target now secs
  t="$(grep -oE "hit your (session|usage) limit[^\"]{0,20}resets [0-9]{1,2}(:[0-9]{2})?(am|pm)" "$1" 2>/dev/null \
       | tail -1 | grep -oE '[0-9]{1,2}(:[0-9]{2})?(am|pm)$')"
  [ -n "$t" ] || return 1
  case "$t" in *:*) ;; *) t="${t%??}:00${t#${t%??}}" ;; esac
  target="$(date -j -f '%Y-%m-%d %I:%M%p' "$(date +%Y-%m-%d) $(echo "$t" | tr '[:lower:]' '[:upper:]')" +%s 2>/dev/null)" || return 1
  now="$(date +%s)"
  if [ "$target" -le "$now" ]; then
    if [ $((now - target)) -le 3600 ]; then echo "$t 120"; return 0; fi
    target=$((target + 86400))
  fi
  secs=$((target - now + 120))
  [ "$secs" -gt 28800 ] && secs=28800
  echo "$t $secs"
}

if [ -e "$STATE/STOP" ]; then say "STOP file present; exiting"; exit 0; fi

log="$STATE/logs/$(date +%Y%m%d-%H%M%S).log"
ln -sf "$log" "$STATE/latest.log"
rm -f "$STATE/outcome"

if ! (cd "$REPO" && git fetch -q --prune origin && git checkout -q -f main \
      && git reset -q --hard origin/main && git clean -fdq) >>"$log" 2>&1; then
  say "git sync failed; see $log"; sleep 900; exec /bin/bash "$REPO/tools/orchestrator/run.sh"
fi

(cd "$REPO" && claude -p "$(cat tools/orchestrator/iteration.md)" --model "$MODEL" \
    --permission-mode auto --output-format stream-json --verbose) >>"$log" 2>&1
rc=$?
outcome=""
[ -f "$STATE/outcome" ] && outcome="$(tr -d '[:space:]' < "$STATE/outcome")"
say "rc=$rc model=$MODEL outcome=${outcome:-none} log=$log"

case "$outcome" in
  progress) sleep 60 ;;
  idle)     sleep 1800 ;;
  stop)     touch "$STATE/STOP"; exit 0 ;;
  *)
    if wait="$(limit_wait "$log")"; then
      # Usage limit: every iteration before the reset would fail at once.
      say "usage limit; sleeping ${wait#* }s until ${wait%% *}"
      sleep "${wait#* }"
    else
      sleep 900   # crash, auth failure or no outcome: back off
    fi ;;
esac
exec /bin/bash "$REPO/tools/orchestrator/run.sh"
