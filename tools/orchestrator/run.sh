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
  *)        sleep 900 ;;   # crash, auth failure, rate limit or no outcome: back off
esac
exec /bin/bash "$REPO/tools/orchestrator/run.sh"
