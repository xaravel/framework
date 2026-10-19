---
title: 'Retro 5 item 1: guard the ratchet PR job against fork PRs'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
baseline_revision: 'd6e11def78f019261de08ba752e92743725b3eab'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      A fork PR whose ratchet failure an admin bypasses reaches merge_group, which runs the PR's own workflow copy with no fork check.
    evidence: |-
      ratchet.yml merge_group steps trust the pull_request_target gate; admins can bypass required checks (AGENTS.md policy note). Pre-existing trust model.
    location: >-
      .github/workflows/ratchet.yml merge_group steps
    severity: low
---

<intent-contract>

## Intent

**Problem:** `.github/workflows/ratchet.yml` runs under `pull_request_target` and checks out and runs the PR head from `head.repo.full_name` with no same-repository guard (Epic 5 retro finding C1, action item `epic-5-retro-item-1-ratchet-fork-guard`). On this public repo a fork PR skips first-time-contributor approval and runs its own code in the base branch's cache scope.

**Approach:** Run every `pull_request_target` step that checks out or executes PR code only when `github.event.pull_request.head.repo.full_name == github.repository`, as `oracle.yml:261` does. Because `ratchet` is a required check, a fork PR fails closed: a dedicated step fails the job with a clear error before any PR code is fetched. Document it in the workflow comment, `docs/ops/ratchet.md` and `docs/ops/ci.md`, and assert it in the workflow-shape XTs.

## Boundaries & Constraints

**Always:** The fork's repository name reaches the shell only through `env`, never `${{ }}` in `run`. The base checkout stays `job.steps[0]` (XT-conformance-120). Push and merge-group steps are unchanged.

**Never:** Skip the job for forks (a skipped required check counts as passing). Touch `packages/**` or `conformance/expectations/**`. Remove any existing assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Same-repo PR | `head.repo.full_name == github.repository` | refusal step skipped; PR checkout, scope, overlay, install, run, story run as before | none |
| Fork PR | `head.repo.full_name != github.repository` | refusal step prints `::error::` naming the fork and exits 1; no PR checkout or PR code runs | job fails, `ratchet` red |
| Push / merge_group | not `pull_request_target` | unchanged | none |

</intent-contract>

## Code Map

- `.github/workflows/ratchet.yml:9-24,89-122` -- comment block; PR checkout (`:93`) and the five PR `run` steps keyed `github.event_name == 'pull_request_target'`.
- `.github/workflows/oracle.yml:259-262` -- existing guard pattern to mirror.
- `conformance/tests/xaravel/ratchet.test.ts:223-276` (XT-conformance-246) -- asserts exact `[if, run, dir]` list of run steps; must gain the refusal step and the guarded condition.
- `conformance/tests/xaravel/ci-pipeline.test.ts:160-168` (XT-conformance-119 PR flow) -- filters steps by exact `if`; update to the guarded condition.
- `conformance/tests/xaravel/ci-pipeline.test.ts:356-367` (XT-conformance-120) -- requires `steps[0]` be the base checkout; filters `merge_group` steps (refusal step must not mention merge_group).
- `docs/ops/ratchet.md:66-84` CI section; `docs/ops/ci.md:14-18` Ratchet row and paragraph.

## Tasks & Acceptance

**Execution:**
- `.github/workflows/ratchet.yml` -- add step "Refuse a fork PR" after the base checkout (`if: github.event_name == 'pull_request_target' && github.event.pull_request.head.repo.full_name != github.repository`, `env: HEAD_REPO`, prints `::error::` and exits 1); change the PR checkout and the five PR run steps to `if: github.event_name == 'pull_request_target' && github.event.pull_request.head.repo.full_name == github.repository`; extend the comment block.
- `conformance/tests/xaravel/ratchet.test.ts` -- XT-conformance-246: expect the refusal step first among PR runs, the guarded condition on every PR-code step (including the PR checkout), the refusal reading the repo name through env only.
- `conformance/tests/xaravel/ci-pipeline.test.ts` -- XT-conformance-119: filter on the guarded condition.
- `docs/ops/ratchet.md`, `docs/ops/ci.md` -- state the guard and the fail-closed fork rule.

**Acceptance Criteria:**
- Given `ratchet.yml`, when the XTs parse it, then every step that checks out `pr/` or runs with `pr` is conditioned on the same-repository guard, and a fork-only step exits 1 before them.
- Given the repo, when `bun run test`, `bun run typecheck` and `bun run lint` run, then they pass.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 13 findings — high 0, medium 3, low 5, false 4, maybe-false 0 (intent-alignment reported no defect: the diff implements the step-level reading the fail-closed rule requires)
- findings:
  - `[low]` `[patch]` (edge) Deleted fork leaves HEAD_REPO empty in the error — message now uses `${HEAD_REPO:-<deleted fork>}`; the XT runs it with an empty value.
  - `[medium]` `[patch]` (verification-gap) No assertion against a job-level `if`, which would turn the refusal into a passing skip — XT-conformance-246 asserts `job.if` is undefined.
  - `[medium]` `[patch]` (verification-gap) Refusal script only text-matched — XT-conformance-246 now executes it with bash and asserts exit 1 and the `::error::` naming the fork.
  - `[low]` `[patch]` (blind) Header comment's safety list omitted the guard — added, matching docs/ops/ratchet.md.
  - `[low]` `[patch]` (blind) Message said "reopen the PR", impossible for a fork — now "open a new PR from it", in the workflow and ratchet.md.
  - `[false]` `[reject]` (blind) Cache-scope justification unsupported — `pull_request_target` runs share the base branch's Actions cache scope and the runner's cache token is reachable from the job, so PR code can write entries; the risk the retro names stands.
  - `[low]` `[patch]` (blind) Deleted fork gives an empty error — same root cause as the edge finding; same fix.
  - `[medium]` `[patch]` (blind) Refusal not protected against continue-on-error or a job-level `if` — continue-on-error was already asserted for every step (ratchet.test.ts loop); the job-level `if` part shares the verification-gap fix.
  - `[false]` `[reject]` (blind) Guard loop blind spots (`cd pr`, `./pr`) — the exact ordered `[if, run, dir]` list and exact checkout list fail on any new run or checkout step, so an unguarded PR step cannot be added silently.
  - `[low]` `[defer]` (blind, intent R3) Admin bypass of the refusal reaches merge_group, which runs the PR's copy unguarded — pre-existing trust model of merge_group, and admin bypass is a Maintainer policy; recorded in `deferred`.
  - `[low]` `[patch]` (blind) `label(run ?? undefined)` no-op — now `label(run)`; other style nits rejected as cosmetic.
  - `[low]` `[reject]` (blind) No contributor notice that fork PRs cannot merge — docs/ops/ratchet.md and ci.md state it; a CONTRIBUTING page is new surface beyond the item.
  - `[false]` `[reject]` (blind) Spec untracked, action item not marked, Protected Paths on planning branch — the orchestrator commits the spec and marks the item with SPS in this PR; MAINT-2026-10-16 approves Phase 0 Protected Path changes.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/ratchet.test.ts conformance/tests/xaravel/ci-pipeline.test.ts` -- expected: pass
- `bun run typecheck && bun run lint` -- expected: pass

## Auto Run Result

Status: done

- **Change:** `ratchet.yml` runs the PR checkout and every PR-code step only for a same-repository PR; a new "Refuse a fork PR" step fails the required check for a fork PR before any PR code is fetched.
- **Files:** `.github/workflows/ratchet.yml` (guard, refusal step, comment); `conformance/tests/xaravel/ratchet.test.ts` (XT-conformance-246 pins guards, no job-level `if`, and executes the refusal); `conformance/tests/xaravel/ci-pipeline.test.ts` (XT-conformance-119 filter); `docs/ops/ratchet.md`, `docs/ops/ci.md`.
- **Review:** 7 patched entries (3 medium, 4 low), 1 deferred (admin bypass into merge_group), 4 false and 1 low rejected, reasons in the triage log.
- **Follow-up review:** false; no high patched and the two medium test gaps are closed by executable assertions.
- **Verification:** `bun run test` 237 pass 0 fail; `bun run typecheck` exit 0; `bun run lint` exit 0.
- **Residual risk:** the fork path runs only live on GitHub; the shape tests do not evaluate expressions against an event payload. First fork PR should be watched.
