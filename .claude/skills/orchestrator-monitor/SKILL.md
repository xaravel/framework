---
name: orchestrator-monitor
description: 'Monitor the unattended Xaravel orchestrator (tools/orchestrator/) from a Claude Code session: brief the Maintainer on where it stands, then report on it every few minutes. Use when the user asks to monitor, watch or check on the orchestrator, or runs /orchestrator-monitor [minutes].'
---

# Orchestrator monitor

You watch the unattended orchestrator (`tools/orchestrator/README.md`) for the Maintainer. First you give a one-screen briefing. Then you schedule a recurring check-in every N minutes; N is the argument, 5 by default. You observe and report. You change nothing unless the user asks in the conversation.

## Where the orchestrator runs

Get the status from `tools/orchestrator/status.sh [narration-lines]`. It runs on the orchestrator's host, or over SSH when `XARAVEL_ORCH_HOST` is set. Each Maintainer sets that, and the optional `XARAVEL_ORCH_STATE` and `XARAVEL_REPO`, in their own git-ignored `.claude/settings.local.json` under `"env"`, for example `{"env": {"XARAVEL_ORCH_HOST": "build-box"}}`. Never commit a host name. If the script says there is no orchestrator state, tell the user to set `XARAVEL_ORCH_HOST` and stop.

Find the GitHub repository with `gh repo view --json nameWithOwner -q .nameWithOwner`. Find the status issue with `gh issue list --label orchestrator --state open`. The orchestrator reports there, and every comment it posts starts with `🤖`.

## Briefing (once, at the start)

Run `status.sh 5`, `gh pr list --state all --limit 5`, and read the last few comments on the status issue. In a few lines, report:
- where the work is: the current Story or retrospective item and its step, plus what merged recently;
- anything waiting on the Maintainer: unmerged PRs whose body lacks the orchestrator footer, `waiting_on_maintainer` entries in `_bmad-output/implementation-artifacts/retro-gates.yaml`, and Escalations under `conformance/escalations/` that have no decision;
- problems: failed iterations (`rc!=0` or `outcome=none` in history), a usage-limit hit, a STOP file.

## The check-in

Schedule the check-in with the session's scheduling tool (CronCreate, `*/N * * * *`, recurring). Give it a prompt that tells a later turn to do the steps below. Tell the user its job ID, and that it lasts only as long as this session.

At every check-in, run `status.sh 2` and `gh pr list --state all --limit 3`. Take the time from the script's `time:` line, which is the host's clock, not from log text. Never reply with just a dash or with nothing. Always say something:

- **Default:** one line with the time, what the loop is doing (Story or item, and step), and the CI line for an open orchestrator PR:
  `gh pr checks <n> --json bucket -q '(map(select(.bucket!="pending" and .bucket!="skipping"))|length) as $d | (map(select(.bucket!="skipping"))|length) as $t | "\($d)/\($t) = \(($d*100/$t)|floor)%"'`
  Also run `gh pr view <n> --json mergeable`, and flag `CONFLICTING`: GitHub does not run `pull_request` checks on a conflicting PR. If a `baseline.yml` run for the PR's branch is in progress, add its job count, and note that "attempt 2" legs are determinism pairs, not retries.
- **Notable since the last check-in:** give a few lines instead. Notable means a PR opened or merged, a Story blocked, an Escalation raised, a failed iteration, the loop idle and waiting on the Maintainer, a STOP file, an auth or usage-limit error, or anything the Maintainer must act on. For a block or a failure, read that iteration's log (the `log=` path in history) and say why, in plain words.
- **Quiet but long:** if the same step has run much longer than usual, check that the latest log is still being written (`latest log: … (written HH:MM)`) before calling it stuck.

## Rules

- A check-in observes. It never restarts, kills, pushes, merges or edits anything on the host or on GitHub.
- Ask the Maintainer before any live GitHub setting change: rulesets, secrets, variables, environments, repository settings. This applies even to restoring an earlier state.
- If a process on the host must be stopped, ask first. Then find it with `pgrep -fl` and kill only its exact PID. Never `pkill -f` a pattern: the orchestrator's `claude -p` command line contains its whole prompt, and a pattern can match and kill the iteration itself.
- Explain the orchestrator's terms the first time they come up: Story, Escalation, Oracle fixture, retrospective, expected `protected-paths` and `ownership` failures.
