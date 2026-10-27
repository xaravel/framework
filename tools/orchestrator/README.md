# Orchestrator

Moves Xaravel forward unattended, one Story per iteration, under the Maintainer ruling `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. `run.sh` resets a dedicated clone to `origin/main`, then runs a fresh headless Claude Code session on `iteration.md`. That session merges an open orchestrator PR, runs sprint planning, or builds the next Story with `bmad-build-auto` and then PRs and merges it.

It runs on a dedicated host under launchd. Each Maintainer names that host in `XARAVEL_ORCH_HOST`, in their own git-ignored `.claude/settings.local.json`; the commands below use it. Sessions use `claude-opus-5-5` unless `XARAVEL_ORCH_MODEL` overrides it. Each session runs with `--permission-mode auto`, so a classifier still reviews every action. When it refuses a step, such as an `--admin` merge, the session does not work around it: it marks the Story `blocked` and reports it on the status issue for the Maintainer.

Between iterations `run.sh` waits 1 minute after `progress` or `idle`, and 15 minutes after a failure. When a failed iteration's log says Claude's usage limit was hit ("You've hit your session limit · resets 11:50pm …"), it instead sleeps until two minutes after that reset time (at most 8 hours) and records `usage limit; sleeping …` in `history`.

Before it resets the clone, `run.sh` commits any uncommitted work on a `story/*` or `planning/*` branch as a local, unpushed `[orchestrator wip]` commit and records it in `history`. That work comes from an iteration that died mid-Story, for example on the usage limit. The next iteration checks that branch out and resumes from it instead of starting over. The WIP commits disappear when the PR is squash-merged.

## Watching it

`tools/orchestrator/status.sh [lines]` prints the host's time, the last iterations, the clone's branch, a STOP file, a usage-limit hit and the newest narration. Run it on the host, or from another machine with `XARAVEL_ORCH_HOST=<ssh destination>` set. From a Claude Code session in this repository, `/orchestrator-monitor [minutes]` (`.claude/skills/orchestrator-monitor/`) briefs you and then reports every few minutes. Put `XARAVEL_ORCH_HOST` in your git-ignored `.claude/settings.local.json` under `"env"`, never in a committed file.

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

- The GitHub issue **Maintainer inbox** (label `orchestrator`) lists everything waiting on the Maintainer: rulings, Escalations, blocked Stories, retro items and PRs, with what holds the loop first. Every iteration rewrites its body. It gets a comment only once a day, as a digest, and when something new starts holding the loop. Rule on it in one sitting.
- The GitHub issue **Orchestrator status** (label `orchestrator`) gets one comment per merge, block or retrospective. Subscribe to it. Each Story merge comment ends with a progress line from `tools/orchestrator/progress.sh`: Stories done out of all, and a loose estimate of the days left at the last three days' pace.
- `ssh "$XARAVEL_ORCH_HOST" cat ~/.xaravel-orchestrator/history` prints one line per iteration.
- `ssh "$XARAVEL_ORCH_HOST" "tail -F ~/.xaravel-orchestrator/latest.log | jq -r 'select(.type==\"assistant\") | .message.content[]? | select(.type==\"text\") | .text'"` shows the live narration.

## Stopping

- `ssh "$XARAVEL_ORCH_HOST" touch ~/.xaravel-orchestrator/STOP` stops it after the current iteration. Delete the file and run `launchctl kickstart gui/$(id -u)/com.xaravel.orchestrator` to resume.
- `launchctl bootout gui/$(id -u)/com.xaravel.orchestrator` stops it immediately.

## Codex fallback

When the Maintainer's Claude subscription is spent, the loop can run on the Codex CLI instead (`decisions/MAINT-2026-10-25-codex-fallback.md`). The host needs `codex` signed in with the Maintainer's ChatGPT subscription (`codex login status`). That is subscription compute, not a metered API.

- **Switch:** `ssh "$XARAVEL_ORCH_HOST" 'echo XARAVEL_ORCH_CLI=codex >> ~/.xaravel-orchestrator/env'`. The next iteration runs on Codex. `XARAVEL_ORCH_CODEX_MODEL` picks a model; unset uses Codex's default.
- **Switch back:** delete that line, or set `XARAVEL_ORCH_CLI=claude`. `status.sh` prints `cli:`.
- **What `run.sh` does differently:**
  - It copies `.claude/skills` to `.agents/skills`, where Codex reads skills, and keeps that copy out of `git status`.
  - It runs `codex exec` with `tools/orchestrator/codex.md` in front of `iteration.md`. That preamble maps Claude Code's tools to Codex and records the trial lessons.
  - Codex runs in its `workspace-write` sandbox with `--approve-for-me` and the network on. It may write only the clone (`.git` included), the state dir and `~/.cache`, `~/.claude`, `~/.bun`, `~/.config/gh` and `~/.codex`. A command the sandbox refuses can be escalated once to Codex's automatic reviewer, which decides as Claude's auto-mode classifier does (`codex.md` item 2). `git push` and `gh` authenticate through `~/.config/gh/hosts.yml`.
  - After Codex's "Selected model is at capacity" error, it waits 5 minutes instead of 15.
- **Known limits, from the 2026-10-25 trial:**
  - Capacity errors are frequent.
  - `apply_patch` can stall on medium-sized edits, so the preamble sends large edits through the shell.
  - There are 4 subagent slots, so the review layers run two at a time.
  - The Fidelity Review's reviewer 1 is Claude when it is available.
  - A Codex loop has not yet merged a unit end to end. Watch its first iterations.
