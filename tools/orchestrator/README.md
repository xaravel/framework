# Orchestrator

Moves Xaravel forward unattended, one Story per iteration, under the Maintainer ruling `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. `run.sh` resets a dedicated clone to `origin/main`, then runs a fresh headless Claude Code session on `iteration.md`. That session merges an open orchestrator PR, runs sprint planning, or builds the next Story with `bmad-build-auto` and then PRs and merges it.

It runs on the M1 under launchd. Sessions use `claude-opus-5-5` unless `XARAVEL_ORCH_MODEL` overrides it. Each session runs with `--permission-mode auto`, so a classifier still reviews every action. When it refuses a step, such as an `--admin` merge, the session does not work around it: it marks the Story `blocked` and reports it on the status issue for the Maintainer.

Between iterations `run.sh` waits 1 minute after `progress`, 30 minutes after `idle`, and 15 minutes after a failure. When a failed iteration's log says Claude's usage limit was hit ("You've hit your session limit · resets 11:50pm …"), it instead sleeps until two minutes after that reset time (at most 8 hours) and records `usage limit; sleeping …` in `history`.

Before it resets the clone, `run.sh` commits any uncommitted work on a `story/*` or `planning/*` branch as a local, unpushed `[orchestrator wip]` commit and records it in `history`. That work comes from an iteration that died mid-Story, for example on the usage limit. The next iteration checks that branch out and resumes from it instead of starting over. The WIP commits disappear when the PR is squash-merged.

## Setup (once, on the host)

```sh
git clone https://github.com/xaravel/framework.git ~/repos/xaravel
gh auth login && gh auth setup-git
mkdir -p ~/.xaravel-orchestrator && chmod 700 ~/.xaravel-orchestrator
claude setup-token   # save the printed token in ~/.claude-auth-token
chmod 600 ~/.claude-auth-token
sed "s|__HOME__|$HOME|g" ~/repos/xaravel/tools/orchestrator/com.xaravel.orchestrator.plist \
  > ~/Library/LaunchAgents/com.xaravel.orchestrator.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.xaravel.orchestrator.plist
```

## Watching

- The GitHub issue **Orchestrator status** (label `orchestrator`) gets one comment per merge, block or wait. Subscribe to it.
- `ssh m1 cat ~/.xaravel-orchestrator/history` prints one line per iteration.
- `ssh m1 "tail -F ~/.xaravel-orchestrator/latest.log | jq -r 'select(.type==\"assistant\") | .message.content[]? | select(.type==\"text\") | .text'"` shows the live narration.

## Stopping

- `ssh m1 touch ~/.xaravel-orchestrator/STOP` stops it after the current iteration. Delete the file and run `launchctl kickstart gui/$(id -u)/com.xaravel.orchestrator` to resume.
- `launchctl bootout gui/$(id -u)/com.xaravel.orchestrator` stops it immediately.
