#!/usr/bin/env bash
# Xaravel unattended orchestrator driver. Runs one fresh headless Claude Code
# session per iteration (tools/orchestrator/iteration.md) until a STOP file
# appears or an iteration reports `stop`. Sessions run in auto permission
# mode, so a classifier reviews every action.
set -uo pipefail

export PATH="$HOME/.local/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
REPO="${XARAVEL_REPO:-$HOME/repos/xaravel}"
export XARAVEL_ORCH_STATE="${XARAVEL_ORCH_STATE:-$HOME/.xaravel-orchestrator}"
STATE="$XARAVEL_ORCH_STATE"
mkdir -p "$STATE/logs"

# CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`).
if [ -f "$STATE/env" ]; then set -a; . "$STATE/env"; set +a; fi

say() { echo "$(date -u +%FT%TZ) $*" | tee -a "$STATE/history"; }

while :; do
  if [ -e "$STATE/STOP" ]; then say "STOP file present; exiting"; exit 0; fi

  log="$STATE/logs/$(date +%Y%m%d-%H%M%S).log"
  ln -sf "$log" "$STATE/latest.log"
  rm -f "$STATE/outcome"

  if ! (cd "$REPO" && git fetch -q --prune origin && git checkout -q -f main \
        && git reset -q --hard origin/main && git clean -fdq) >>"$log" 2>&1; then
    say "git sync failed; see $log"; sleep 900; continue
  fi

  (cd "$REPO" && claude -p "$(cat tools/orchestrator/iteration.md)" \
      --permission-mode auto --output-format stream-json --verbose) >>"$log" 2>&1
  rc=$?
  outcome="$(tr -d '[:space:]' < "$STATE/outcome" 2>/dev/null || true)"
  say "rc=$rc outcome=${outcome:-none} log=$log"

  case "$outcome" in
    progress) sleep 60 ;;
    idle)     sleep 1800 ;;
    stop)     touch "$STATE/STOP"; exit 0 ;;
    *)        sleep 900 ;;   # crash, rate limit or no outcome: back off
  esac
done
