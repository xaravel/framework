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
# Which CLI runs the iteration: claude (default) or codex, the fallback when the
# Claude subscription is spent (decisions/MAINT-2026-10-25-codex-fallback.md).
# Set it in "$STATE/env" (XARAVEL_ORCH_CLI=codex); the next iteration picks it up.
CLI="${XARAVEL_ORCH_CLI:-claude}"
case "$CLI" in claude|codex) ;; *) echo "XARAVEL_ORCH_CLI must be claude or codex, not '$CLI'" >&2; exit 2 ;; esac
[ "$CLI" = codex ] && MODEL="codex:${XARAVEL_ORCH_CODEX_MODEL:-default}"

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

# An iteration that died mid-Story (usage limit, crash, kill) leaves its work
# uncommitted on a story/* or planning/* branch. Commit it there, locally and
# unpushed, before the reset below discards it; the next iteration resumes
# from that branch (iteration.md, sections 2D and 2F).
wip_save() {
  local br
  br="$(git -C "$REPO" symbolic-ref --short -q HEAD)" || return 0
  case "$br" in story/*|planning/*) ;; *) return 0 ;; esac
  [ -n "$(git -C "$REPO" status --porcelain)" ] || return 0
  if git -C "$REPO" add -A && git -C "$REPO" commit -q -m "[orchestrator wip] $br: uncommitted work saved by run.sh before reset"; then
    say "saved uncommitted work on $br as $(git -C "$REPO" rev-parse --short HEAD) [orchestrator wip]"
  else
    say "could not save uncommitted work on $br; see git status"
  fi
}
wip_save >>"$log" 2>&1

if ! (cd "$REPO" && git fetch -q --prune origin && git checkout -q -f main \
      && git reset -q --hard origin/main && git clean -fdq) >>"$log" 2>&1; then
  say "git sync failed; see $log"; sleep 900; exec /bin/bash "$REPO/tools/orchestrator/run.sh"
fi

# One Codex iteration (tools/orchestrator/codex.md, then iteration.md). Codex reads
# skills from .agents/skills, so it gets a fresh copy of .claude/skills, kept out
# of git status. Its workspace-write sandbox writes only the clone (.git named
# explicitly), the state dir and the caches the tools need; approval_policy=never
# makes anything outside fail at once instead of waiting on an approver. ~/.codex
# is writable so a nested `codex exec`, the Fidelity Review's Codex reviewer, can
# start its app-server; without it the reviewer fails with "Operation not
# permitted (os error 1)". The Maintainer approved this on 2026-10-26.
codex_iteration() {
  local model=()
  [ -n "${XARAVEL_ORCH_CODEX_MODEL:-}" ] && model=(-m "$XARAVEL_ORCH_CODEX_MODEL")
  mkdir -p "$STATE/tmp" "$REPO/.agents" || return 1
  rm -rf "$REPO/.agents/skills" && cp -R "$REPO/.claude/skills" "$REPO/.agents/skills" || return 1
  grep -qx '.agents/' "$REPO/.git/info/exclude" 2>/dev/null || echo '.agents/' >> "$REPO/.git/info/exclude"
  (cd "$REPO" && TMPDIR="$STATE/tmp" codex exec -C "$REPO" --add-dir "$REPO/.git" --add-dir "$STATE" \
      --add-dir "$HOME/.cache" --add-dir "$HOME/.claude" --add-dir "$HOME/.bun" --add-dir "$HOME/.config/gh" \
      --add-dir "$HOME/.codex" \
      --sandbox workspace-write -c approval_policy='"never"' -c sandbox_workspace_write.network_access=true \
      ${model[@]+"${model[@]}"} --json --color never \
      "$(cat tools/orchestrator/codex.md tools/orchestrator/iteration.md)" </dev/null)
}

if [ "$CLI" = codex ]; then
  codex_iteration >>"$log" 2>&1
else
  (cd "$REPO" && claude -p "$(cat tools/orchestrator/iteration.md)" --model "$MODEL" \
      --permission-mode auto --output-format stream-json --verbose) >>"$log" 2>&1
fi
rc=$?
outcome=""
[ -f "$STATE/outcome" ] && outcome="$(tr -d '[:space:]' < "$STATE/outcome")"
say "rc=$rc model=$MODEL outcome=${outcome:-none} log=$log"

case "$outcome" in
  progress) sleep 60 ;;
  idle)     sleep 60 ;;    # the Maintainer may unblock it at any time (2026-10-23)
  stop)     touch "$STATE/STOP"; exit 0 ;;
  *)
    if wait="$(limit_wait "$log")"; then
      # Usage limit: every iteration before the reset would fail at once.
      say "usage limit; sleeping ${wait#* }s until ${wait%% *}"
      sleep "${wait#* }"
    elif grep -q "Selected model is at capacity" "$log" 2>/dev/null; then
      say "model at capacity; sleeping 300s"
      sleep 300   # Codex's provider-side capacity error clears in minutes
    else
      sleep 900   # crash, auth failure or no outcome: back off
    fi ;;
esac
exec /bin/bash "$REPO/tools/orchestrator/run.sh"
