---
title: 'Epic 1 retro item 1: CI job for bun test, typecheck, lint, scaffold:check and graph:check'
type: 'chore'
created: '2026-10-17'
status: 'done'
baseline_revision: 'ac7c19e5d2af7415c5f82e4000698fe99614f56c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md'
warnings: []
deferred:
  - summary: >-
      root-baseline test spawns `bun install --frozen-lockfile` without `--ignore-scripts`, so the `check` job may run dependency lifecycle scripts.
    evidence: |-
      conformance/tests/xaravel/root-baseline.test.ts:39 (pre-existing). Settle by checking whether any locked dependency declares install scripts.
    location: >-
      conformance/tests/xaravel/root-baseline.test.ts:39
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** No workflow runs `bun test`, `tsc -b`, oxlint, `scaffold:check` or `graph:check` (retro finding R1); Epic 1 deferred this gating to Story 1.7, whose ACs never covered it, so a PR that breaks a test, a type, a lint rule, the scaffold or the dependency graph merges green.

**Approach:** Add one `check` job to `.github/workflows/ci.yml` that installs from the frozen lockfile and runs those five gates on `pull_request`, `merge_group` and `push` to `main` (the triggers `ci.yml` already has), and extend XT-conformance-33 to pin the new job's shape.

## Boundaries & Constraints

**Always:** reuse the exact pinned `actions/checkout` (with `persist-credentials: false`) and `oven-sh/setup-bun` (`bun-version-file: .bun-version`) steps the `audit` job uses; job holds no `permissions` of its own (inherits `contents: read`); install with `bun install --frozen-lockfile --ignore-scripts`; run gates through the existing `package.json` scripts (`bun run test|typecheck|lint|scaffold:check|graph:check`); no `continue-on-error` or `if` on the job or its steps; `bun run workflows:check` stays clean.

**Never:** change `.github/rulesets/main.json`, `tools/ruleset/` or the required-check list (retro item 2, Maintainer-owned); add secrets, `id-token`, or `pull_request_target`; remove or weaken any existing assertion in XT-conformance-33; implement Story 5.7's Ratchet, harness or service matrix.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Green PR | PR to main, all gates pass | `check` job succeeds | No error expected |
| Broken gate | any of the five commands exits non-zero | `check` job fails at that step | later steps do not run; job red |
| Merge queue | `merge_group` checks_requested | `check` job runs on the group commit | same as PR |

</intent-contract>

## Code Map

- `.github/workflows/ci.yml` -- workflow with `audit` and `workflow-permissions` jobs; add `check` job after them, update header comment (currently says the full pipeline arrives later).
- `conformance/tests/xaravel/repository-policy.test.ts:669-716` -- XT-conformance-33 pins `ci.yml`: line 681 asserts job keys equal `["audit", "workflow-permissions"]`; widen to include `check` and add shape assertions for it (steps, runs, no permissions/continue-on-error/if).
- `package.json` scripts -- `test`, `typecheck` (`bun --bun tsc -b`), `lint` (`bun --bun oxlint --type-aware`), `scaffold:check`, `graph:check` already exist; reuse.
- `tools/workflow-permissions/workflow-permissions.ts:17` -- `ALLOWED_WRITE_JOBS`; the new job needs no write scope, so no change.

## Tasks & Acceptance

**Execution:**
- `.github/workflows/ci.yml` -- add job `check` (checkout, setup-bun, frozen install, then one step each: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run scaffold:check`, `bun run graph:check`); refresh header comment -- closes R1.
- `conformance/tests/xaravel/repository-policy.test.ts` -- in XT-conformance-33 change the job-key assertion to `["audit", "check", "workflow-permissions"]` and assert the `check` job's step uses/with, its exact run list, and absence of `permissions`, `continue-on-error` and `if` -- keeps the workflow shape pinned.

**Acceptance Criteria:**
- Given `ci.yml`, when parsed, then it has a `check` job whose run steps are exactly the frozen install followed by the five gate commands, with the same pinned checkout/setup-bun steps as `audit`.
- Given the repo, when `bun test`, `bun run typecheck`, `bun run lint`, `bun run workflows:check` run locally, then all pass.
- Given the PR, when CI runs, then the `check` job runs and succeeds.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 15 findings — high 0, medium 1, low 11, false 2, maybe-false 1
- findings:
  - `[low]` `[reject]` (intent-alignment) Diff proves the YAML shape, not that gates run green on ubuntu-latest — descriptive; the PR's own CI run is the runtime evidence for AC 3, checked before merge.
  - `[medium]` `[patch]` (verification-gap) XT-33 does not pin the package.json script bodies, so a gate could become a no-op — added exact script-body assertions to XT-conformance-33.
  - `[low]` `[patch]` (edge-case) `check` has no `timeout-minutes`; a hung gate holds a queue entry for 360 min — added `timeout-minutes: 30` and asserted it.
  - `[low]` `[reject]` (edge-case) XT-33 does not forbid env/working-directory/defaults on `check` — unlikely in everyday use; guard adds complexity.
  - `[false]` `[reject]` (edge-case) Claim that R1 is closed although `check` is not required — the spec's Never clause and intent keep required checks for retro item 2; nothing claims gating.
  - `[maybe-false]` `[defer]` (blind) root-baseline test spawns `bun install --frozen-lockfile` without `--ignore-scripts` inside `check` — pre-existing test behaviour; would need checking whether any locked dep has lifecycle scripts.
  - `[medium]` `[patch]` (blind) Script bodies unpinned — same root cause as the verification-gap row; same patch.
  - `[low]` `[patch]` (blind) No `timeout-minutes` — same root cause as the edge-case row; same patch.
  - `[low]` `[reject]` (blind) Slowest gate runs first — cosmetic ordering; every gate still runs on a green tree.
  - `[false]` `[reject]` (blind) Spec omits Protected Path approval — MAINT-2026-10-16 amendments are that approval for orchestrator PRs.
  - `[low]` `[reject]` (blind) `check` pinned under XT-33's audit-titled test — retitling a Test ID touches traceability for little gain.
  - `[low]` `[patch]` (blind) ci.yml header does not say `check` is advisory — added a clause naming retro item 2.
  - `[low]` `[reject]` (blind) Job name `check` is generic — name chosen by the intent; item 2 can rename when it requires it.
  - `[low]` `[reject]` (blind) `const check` shadowed by an arrow param — lint is clean; cosmetic.
  - `[low]` `[reject]` (blind) Spec does not record Q3 or CI-only assumptions; `runs-on` unpinned — the PR CI run verifies the environment; runner change is unlikely and guarded by CODEOWNERS.

## Verification

**Commands:**
- `bun test` -- expected: all pass
- `bun run typecheck` -- expected: clean
- `bun run lint` -- expected: clean
- `bun run workflows:check` -- expected: OK
- `bun run scaffold:check && bun run graph:check` -- expected: OK

## Auto Run Result

Status: done

- **Change:** new `check` job in `.github/workflows/ci.yml` runs `bun run test`, `typecheck`, `lint`, `scaffold:check` and `graph:check` after a frozen, script-free install, on `pull_request`, `merge_group` and push to `main`, with `timeout-minutes: 30`. Closes retro finding R1 at the workflow level; it gates merges only once retro item 2 makes it required.
- **Files:**
  - `.github/workflows/ci.yml` -- adds the `check` job and updates the header comment (advisory until item 2).
  - `conformance/tests/xaravel/repository-policy.test.ts` -- XT-conformance-33 pins the `check` job's shape, its timeout and the five package.json script bodies.
- **Review:** 15 findings. 3 patched (1 medium: script bodies pinned; 2 low: timeout, advisory comment). 1 deferred (lifecycle scripts in root-baseline test, unverified). Rejected: runtime evidence (covered by the PR CI run), env/working-directory guard, "R1 closed" claim (false), gate order, Protected Path approval (false; MAINT amendments), test title, job name, shadowing, Q3/runs-on.
- **Follow-up review:** false (patched: 0 high, 1 medium, 2 low).
- **Verification:** `bun test` 38 pass / 0 fail; `bun run typecheck`, `bun run lint` clean; `workflows:check` OK (6); `scaffold:check` OK; `graph:check` OK (53 packages).
- **Residual risk:** the gates have only run on macOS; the first Linux run is on this PR's CI.
