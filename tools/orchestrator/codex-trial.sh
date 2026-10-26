#!/bin/bash
# One trial orchestrator iteration on the Codex CLI, isolated from the live
# Claude loop: its own clone and state directory, push disabled, gh signed out,
# and the lowest CPU priority. It never touches $HOME/repos/xaravel or
# $HOME/.xaravel-orchestrator.
#
#   tools/orchestrator/codex-trial.sh setup   # clone, skills copy, bun install
#   tools/orchestrator/codex-trial.sh smoke   # tiny codex exec: can it see skills and subagents?
#   tools/orchestrator/codex-trial.sh run     # one iteration (codex-trial.md + iteration.md)
set -u
export PATH="$HOME/.local/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
TRIAL="${XARAVEL_TRIAL_DIR:-$HOME/xaravel-codex-trial}"
export XARAVEL_ORCH_STATE="${XARAVEL_TRIAL_STATE:-$HOME/.xaravel-codex-trial-state}"
STATE="$XARAVEL_ORCH_STATE"
BRANCH="${XARAVEL_TRIAL_BRANCH:-planning/codex-loop-trial}"
CODEX="${XARAVEL_TRIAL_CODEX:-codex}"
mkdir -p "$STATE/logs" "$STATE/gh-signed-out"

# Isolation for every command below: no GitHub credentials, no push target.
unset GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN
export GH_CONFIG_DIR="$STATE/gh-signed-out"
export GIT_TERMINAL_PROMPT=0

case "${1:-}" in
  setup)
    [ "$TRIAL" != "$HOME/repos/xaravel" ] || { echo "refusing: TRIAL is the live loop's checkout" >&2; exit 2; }
    if [ ! -d "$TRIAL/.git" ]; then
      git clone -q https://github.com/xaravel/framework.git "$TRIAL" || exit 1
    fi
    cd "$TRIAL" || exit 1
    git config remote.origin.pushurl "no-push://codex-trial"
    git fetch -q origin && git checkout -q -B "$BRANCH" "origin/$BRANCH" || exit 1
    # Codex reads .agents/skills; Claude Code reads .claude/skills (xarabot AGENTS.md).
    rm -rf .agents/skills && mkdir -p .agents && cp -R .claude/skills .agents/skills
    # Keep the copy and trial state out of git status, so the iteration sees a clean tree.
    grep -qx '.agents/' .git/info/exclude 2>/dev/null || echo '.agents/' >> .git/info/exclude
    nice -n 19 bun install --frozen-lockfile >/dev/null || exit 1
    echo "setup ok: $TRIAL on $(git rev-parse --short HEAD), $(ls .agents/skills | wc -l | tr -d ' ') skills"
    ;;
  smoke)
    cd "$TRIAL" || exit 1
    nice -n 19 "$CODEX" exec -C "$TRIAL" --sandbox read-only --ephemeral --color never \
      "Answer in five short lines and run no commands. 1) Name three skills you can load whose names start with bmad-. 2) Can you spawn subagents in this session (yes/no, and the tool name)? 3) Which file gives you this repository's instructions? 4) Which model are you? 5) Is anything about this setup likely to block an unattended run?" \
      2>&1 | tail -20
    ;;
  run)
    cd "$TRIAL" || exit 1
    git fetch -q origin && git checkout -q -f "$BRANCH" && git reset -q --hard "origin/$BRANCH" && git clean -fdq -e .agents/ || exit 1
    rm -f "$STATE/outcome" "$STATE/trial-report.md"
    log="$STATE/logs/$(date +%Y%m%d-%H%M%S).jsonl"
    prompt="$(cat tools/orchestrator/codex-trial.md tools/orchestrator/iteration.md)"
    # workspace-write keeps writes inside the clone, $STATE, and the caches the tools need (uv's, and the
    # Fidelity Review's `claude -p` session files); never $HOME/repos/xaravel. The network is needed for
    # bun and the Fidelity Review's Claude reviewer. Approvals go to Codex's automatic reviewer;
    # --approve-for-me implies the workspace-write sandbox (it refuses an explicit --sandbox).
    nice -n 19 "$CODEX" exec -C "$TRIAL" --add-dir "$STATE" --add-dir "$HOME/.cache" --add-dir "$HOME/.claude" \
      -c sandbox_workspace_write.network_access=true --approve-for-me --json --color never \
      -o "$STATE/last-message.md" "$prompt" >"$log" 2>&1
    rc=$?
    echo "rc=$rc outcome=$(cat "$STATE/outcome" 2>/dev/null || echo none) log=$log report=$STATE/trial-report.md"
    ;;
  *)
    echo "usage: $0 setup|smoke|run" >&2; exit 2 ;;
esac
