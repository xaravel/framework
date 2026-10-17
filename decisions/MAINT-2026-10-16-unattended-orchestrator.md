---
decision: approved
decided_by: Maintainer
date: 2026-10-16
scope: tools/orchestrator/
---

# Maintainer ruling: unattended orchestrator

I, the Maintainer, approve running `tools/orchestrator/` unattended on the M1 host, under these standing rules. This file is the written approval AD-16 asks for.

## Merges

- The orchestrator merges its own PRs once its own review passes and every check present on the PR is green. This includes PRs that change Protected Paths: each Story in Epics 1–8 and later counts as a Maintainer-approved Infrastructure Story.
- After Story 1.7 adds Code Owner review to the `main` ruleset, the orchestrator may merge with `gh pr merge --admin` under the Maintainer's identity.
- Exception: `AGENTS.md` and any `CLAUDE.md` still change only when the Maintainer asks. A PR that touches `AGENTS.md` waits for the Maintainer.

## Decisions during a Story

- Choose the recommended or best-case option. Do not wait for the Maintainer.
- The orchestrator may rule on an Escalation itself: it writes `decisions/ESC-<story-id>-<n>.md` with `decision: approved | rejected` and `decided_by: orchestrator (MAINT-2026-10-16)`. It does this only when the ruling does **not**:
  - weaken the grader: remove an assertion, weaken an expected value, add a skip, or add an `adapted:` marker without an existing DIV clause;
  - add a divergence outside DIV-1..12;
  - make Xaravel measurably slower, or move it away from a faithful port of Laravel on Bun.
- Any Escalation in those three classes waits for the Maintainer. The orchestrator marks the Story `blocked`, reports it on the status issue and moves on to other Stories.

## Never

The orchestrator never pushes directly to `main` and never publishes to npm. It never commits secrets or an `APP_KEY`, and never weakens the grader to make a test pass.

## Revoking

Delete this file, or create `~/.xaravel-orchestrator/STOP` on the M1.
