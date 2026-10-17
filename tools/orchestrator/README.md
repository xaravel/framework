# Orchestrator

Moves Xaravel forward unattended, one Story per iteration, under the Maintainer ruling `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. `run.sh` resets a dedicated clone to `origin/main`, then runs a fresh headless Claude Code session on `iteration.md`. That session merges an open orchestrator PR, runs sprint planning, or builds the next Story with `bmad-build-auto` and then PRs and merges it.

It runs on the M1 under launchd. Each session runs with `--permission-mode auto`, so a classifier still reviews every action. When it refuses a step, such as an `--admin` merge, the session does not work around it: it marks the Story `blocked` and reports it on the status issue for the Maintainer.

## Setup (once, on the host)

```sh
git clone https://github.com/xaravel/framework.git ~/repos/xaravel
gh auth login && gh auth setup-git
mkdir -p ~/.xaravel-orchestrator && chmod 700 ~/.xaravel-orchestrator
echo "CLAUDE_CODE_OAUTH_TOKEN=<from claude setup-token>" > ~/.xaravel-orchestrator/env
chmod 600 ~/.xaravel-orchestrator/env
sed "s|__HOME__|$HOME|g" ~/repos/xaravel/tools/orchestrator/com.xaravel.orchestrator.plist \
  > ~/Library/LaunchAgents/com.xaravel.orchestrator.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.xaravel.orchestrator.plist
```

## Watching

- The GitHub issue **Orchestrator status** (label `orchestrator`) gets one comment per merge, block or wait. Subscribe to it.
- `ssh m1 cat ~/.xaravel-orchestrator/history` prints one line per iteration.
- `ssh m1 "tail -f ~/.xaravel-orchestrator/latest.log | jq -r 'select(.type==\"assistant\") | .message.content[]? | select(.type==\"text\") | .text'"` shows the live narration.

## Stopping

- `ssh m1 touch ~/.xaravel-orchestrator/STOP` stops it after the current iteration. Delete the file and run `launchctl kickstart gui/$(id -u)/com.xaravel.orchestrator` to resume.
- `launchctl bootout gui/$(id -u)/com.xaravel.orchestrator` stops it immediately.
