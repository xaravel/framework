---
decision: approved
decided_by: Maintainer
date: 2026-10-17
scope: Epic 1 retrospective action items 2, 9, 12, 13, 14 and 15
---

# Maintainer ruling: the Epic 1 retrospective items waiting on the Maintainer

The Maintainer ruled on these items in the Maintainer's session on 2026-10-17.

## Item 2: required checks (finding R2). No change.

The required checks stay `audit`, `ownership` and `protected-paths`. `check`, `workflow-permissions`, `escalations`, `versions` and `release-authority` stay advisory. The item is closed.

## Items 12 and 9: the agent identity (findings R3, D2, D12). Waived until the Epic 8 checkpoint.

AD-16's separate agent identity is waived while the orchestrator runs as the Maintainer through Phase 0, under `decisions/MAINT-2026-10-16-unattended-orchestrator.md` and its amendments. The `Agent pushes` ruleset stays disabled (`enforcement: disabled`) for the same period: no non-admin identity pushes today, and its `gh-readonly-queue/**` exclusion blocked the merge queue. Both items stay open and are taken up at the Epic 8 checkpoint, before framework porting starts. At that point the Maintainer decides whether to create a non-admin agent account, redesign and re-enable `Agent pushes`, and reconcile `story/*`-only pushes with `planning/*`.

## Item 13: live release setup and the `0.0.0` pins (findings R4, R5). Deferred to the first release.

Nothing is published in Phase 0. The release environment, npm Trusted Publishing, the bootstrap publish, and the ruling on the `0.0.0` pins in XT-conformance-1 and XT-conformance-7 wait until the Maintainer prepares the first tag. The item stays open.

## Item 14: widen the Protected list (finding D11). Approved.

`.claude/`, `CLAUDE.md` in any letter case, `.bun-version` and the root `LICENSE` become Protected Paths. AD-16 in the architecture spine is amended in the same PR as this ruling. The orchestrator updates `conformance/protected-paths`, `.github/CODEOWNERS` and their tests (Epic 1 action item 16).

## Item 15: ownership on non-Story branches (finding D3). Approved.

A `planning/*` branch may not change `packages/**` or `conformance/expectations/**`. Framework code and grader data change only through `story/*` branches. `bot/*` keeps AD-16's Expectations-`status`-only rule. AD-16 is amended in the same PR. The orchestrator implements the rule in the ownership check, with tests (Epic 1 action item 17). This is a Story-required change to `tools/ownership/`, not an edit to make a check pass.
