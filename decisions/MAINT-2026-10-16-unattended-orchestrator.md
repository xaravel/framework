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

## Amendment 2026-10-17: the protected-paths check

The `protected-paths` check (Story 1.4) fails any PR that touches a Protected Path without my approving review on the head commit. The orchestrator opens PRs as my account, and GitHub does not let me approve my own PRs, so that check cannot pass on them. This ruling is my approval of those changes.

- On an orchestrator PR, a `protected-paths` failure does not block the merge when every violation it reports is `needs @edanisko's approving review on the head commit`, and every other check is green. The orchestrator then merges, using `--admin` once the check is required.
- Any other `protected-paths` violation, such as `codeowners drift` or `truncated file list`, still blocks.
- The orchestrator never edits `conformance/protected-paths`, `tools/protected-paths/` or `.github/workflows/protected-paths.yml` to make the check pass.

## Amendment 2026-10-17 (2): the ownership check

The `ownership` check (Story 1.5) allows a Story to edit only `packages/<component>/**`, its Expectations, its oracle requests and its Escalations. Phase 0 Stories are infrastructure and must edit more than that, and every orchestrator Story also updates its own records in `_bmad-output/implementation-artifacts/`. This ruling is my approval of both.

- On an orchestrator PR, an `ownership` failure does not block the merge when every violation is `out of scope:` and is either a path in a Story from Epics 1–8, or a path under `_bmad-output/implementation-artifacts/` in any Story. The other merge conditions still apply.
- A `missing manifest` violation, or an out-of-scope path outside `_bmad-output/implementation-artifacts/` in a Story from Epic 9 on, still blocks.
- The orchestrator never edits `tools/ownership/`, a manifest's `component`, or `.github/workflows/ownership.yml` to make the check pass.

## Amendment 2026-10-18: Phase 0 retrospective fixes in `packages/**`

`decisions/MAINT-2026-10-17-epic-1-items.md` (item 15) forbids `packages/**` and `conformance/expectations/**` on `planning/*` branches. The orchestrator does retrospective action items on `planning/retro-<N>-*` branches, and an action item has no Story manifest, so a fix to a grader package could not merge (Epic 4 retro items 1-3, PR #126). This is my approval of a Phase 0 exception, matching the one the second amendment gives Phase 0 Stories.

- On a `planning/retro-<N>-*` branch with N ≤ 8, an `ownership` failure does not block the merge when every violation is `planning scope:` for a path under `packages/**`, or another violation this ruling already allows. The other merge conditions still apply, and the orchestrator merges with `--admin`.
- A `planning scope:` violation for `conformance/expectations/**` still blocks on every branch: no retrospective fix may change grader data.
- From Epic 9 on (N ≥ 9) the rule stays strict. The Maintainer decides the route for code-changing retrospective items at the Epic 8 checkpoint. (Decided by the amendment of 2026-10-22 below.)

## Amendment 2026-10-21: missing Fidelity Review evidence

Three Stories in a row (ESC-9.1-4, ESC-9.2-1, ESC-9.2-2) stopped because the Fidelity Review rejected a correct change for evidence its tool never gave the reviewers. This is my approval for the orchestrator to fix that kind of gap itself, under section G, without waiting for me.

- **When.** A Fidelity Review `reject` whose findings ask for evidence that exists in the repository (a rule, a decision record, a file the change relies on) but that `tools/fidelity-review/fidelity-review.ts` does not put in the prompt. The orchestrator raises the Escalation as usual, rules on it itself, and records `decided_by: orchestrator (MAINT-2026-10-16, amendment 2026-10-21)`.
- **What it may change.** Only what the prompt shows the reviewers: it may add an evidence item, or supply an existing item in more cases, in `tools/fidelity-review/fidelity-review.ts`, with tests in `conformance/tests/xaravel/fidelity-review.test.ts` for each new case, and it may update the matching wording in `conformance/review/fidelity.md` and `docs/ops/fidelity-review.md` so they say what the prompt now carries.
- **Where the wording goes** (added 2026-10-21, after #289). In `conformance/review/fidelity.md`, a sentence that says what the prompt now carries goes in the evidence notes above the checklist items, never in an item's **Check.** paragraph. A Check states only what passes and what fails, and that changes only through me.
- **What it may never change.** A checklist item's check (F-1..F-10), the verdict rule, the verdict schema, the standing-reject rule (ESC-8.8-1), how reviewers or their CLIs are chosen, the `story:check` approvals clause, or any evidence it would remove or narrow. A gap that needs one of those is mine.
- **How it merges.** On a `planning/esc-<id>` branch, merged like the orchestrator's other planning PRs: an expected `protected-paths` failure merges with `--admin` under the first amendment. The PR body names the reject's tree and the finding it answers, and ISSUE reports it. The Story then re-runs its Fidelity Review on a changed tree, as the standing-reject rule requires.

## Amendment 2026-10-22: code-changing retrospective items from Epic 9 on

Epic 9's retrospective found no route for an action item that changes `packages/**` once N ≥ 9 (finding P5, action item `epic-9-retro-item-2-retro-code-route`). This is my ruling: such an item is done on a retrospective branch, limited to the components it names, and only after the same review a Story gets.

- **Which items.** An action item from epic N ≥ 9 that the orchestrator owns, that passes step D's waiting test, and whose `action` names at least one `packages/<component>`. Its scope is the paths a Story of each named component may edit (`allowedPath` in `tools/ownership/ownership.ts`), plus its own records under `_bmad-output/implementation-artifacts/`.
- **Outside the scope.** A fix that needs another component, another Protected Path, or any `conformance/expectations/**` line is not done this way. The orchestrator sets the item `in-progress`, records why under its finding, and the item waits for me.
- **How it is built.** On `planning/retro-<N>-<slug>`, through `bmad-build-auto` with every review layer a Story gets. That includes the Fidelity Review, run for the item: `bun run fidelity:review review --item <id> --spec <the item's spec>`. The tool reads the item from sprint status and reviews only its scope. The item's checks run as a Story's do: the full `bun run harness` with no differences, `bun run typecheck` and `bun run lint`.
- **When it merges.** Only when `bun run fidelity:review status --item <id> --spec <the item's spec>` prints `current`: two `pass` verdicts for the head tree. A reject stands until its findings are fixed (ESC-8.8-1).
- **Missing evidence** (added 2026-10-22, after #326). An action item has no Story id, so it cannot raise the Escalation the 2026-10-21 amendment works through. When an item's reject asks for evidence that is in the repository but not in the prompt, the orchestrator fixes the tool anyway.
  - It keeps to that amendment's "What it may change" and "What it may never change".
  - It works on `planning/retro-<N>-evidence-<slug>`, with no Escalation.
  - The PR body names the reject's tree and the finding it answers, and the item's finding in the retrospective records it.
  - The item then re-runs its Fidelity Review on the changed tree.
- **Other questions.** Any other question that would need an Escalation for a Story makes the item wait for me.
- **The checks.** An `ownership` failure does not block when every violation is `planning scope:` for a path under `packages/<component>/**` of a component the item names, or one this ruling already allows. A `planning scope:` violation for `conformance/expectations/**`, or for any other component, still blocks. The first amendment covers `protected-paths` (`packages/assert/` and `packages/mockery/` are Protected). The orchestrator merges with `--admin`. The PR body names the item, its components and the reviewed tree.
- **What it may never change.** An item's `action`, `owner` or `epic` in sprint status, to widen or move its scope: the review reads the scope from `action`. A new item is added only by a retrospective or by a Maintainer ruling (added 2026-10-23, ESC-10.1-6). The other rules of this file still hold, the grader rules included.

N ≤ 8 keeps the 2026-10-18 rule.

## Amendment 2026-10-30: a second key for `contract` and `protected-path` Escalations

Twice in two days (ESC-14.8-1/2 in #523/#524, ESC-15.1-2/3 in #550) the orchestrator ruled on its own `contract` and `protected-path` Escalations under "Decisions during a Story". The rulings were sound, but I want a second, independent judgment on every such ruling before it lands. So, from now on:

- **The orchestrator does not write the decision** for a `contract` or `protected-path` Escalation. It raises the Escalation with its recommendation, marks the Story `blocked` (or the item waiting), lists it under Rulings in INBOX and moves on.
- **The second key** is the monitor, under my standing rules (`decisions/MAINT-2026-10-26-runtime-builtins.md` and the others recorded in `decisions/`), or me. A recommendation that only applies an existing ruling of mine to the same kind of change (as ESC-15.1-2 applied ESC-11.1-2) still needs that second key; it simply gets it quickly.
- **Unchanged:** the 2026-10-21 amendment. The orchestrator still fixes and rules on the Fidelity Review's own evidence gaps itself. So are its rulings on other triggers within "Decisions during a Story".

## Revoking

Delete this file, or create `~/.xaravel-orchestrator/STOP` on the M1.
