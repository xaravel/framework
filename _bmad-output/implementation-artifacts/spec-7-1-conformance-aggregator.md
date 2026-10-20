---
title: 'Story 7.1: Conformance aggregator'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: 'c43cd9f6df37ea71e702c6a702996062a9a17cd9'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/stories/7.1.md'
warnings: ['oversized']
deferred:
  - summary: >-
      .github/rulesets/agent-push.json must exclude refs/heads/dashboard-data before it is re-enabled at the Epic 8 checkpoint, or the dashboard history push fails on every merge.
    evidence: |-
      The ruleset restricts creation and update on every branch except main, story/** and gh-readonly-queue/**, with only OrganizationAdmin as a bypass actor. It is disabled today. Story 7.1 may not edit it (it is a Protected Path; spec Never), so the need is recorded only in docs/ops/identities.md and docs/ops/conformance-report.md.
    location: >-
      .github/rulesets/agent-push.json
    severity: medium
---

<intent-contract>

## Intent

**Problem:** No tool computes the Conformance Rate or the SM-1 alpha-gate figure, so the dashboard (7.2) and Boost `conformance.rate` (7.3) would each have to define the numbers themselves, and no history across commits exists (FR-5, SM-1).

**Approach:** Add `tools/conformance-report/`. `bun run conformance:report` reads the Inventory, the Expectations File, the package table (phases) and the Baseline Pin, and writes `report.json`. `bun run conformance:history` appends one record per commit to `history.jsonl` on a `dashboard-data` branch, and a new `.github/workflows/dashboard.yml` job `dashboard` runs both on every push to `main`.

## Boundaries & Constraints

**Always:**
- **Pairs.** One pair per Expectations line (`id` × `variant`). Each pair's Component is the Inventory entry's `component` for its `id`.
- **Rate.** `rate = passing / pairs` over every pair; `not-ported-yet` stays in the denominator. `rate` is `null` when `pairs` is 0. Only `status: "pass"` counts as passing.
- **Bucket.** Each bucket (overall and per Component) has `pairs`, `passing`, `rate`, `statuses` (all four of `pass`, `fail-known`, `skip`, `quarantined`, zeros included), `reasons` and `reasonsDetail`.
  - `reasons` is keyed by kind, all seven kinds present: `not-ported-yet`, `blocked-by`, `intentional-divergence`, `php-only`, `upstream-skip`, `deferred`, `out-of-scope`. The kind is the reason's text before the first `:`.
  - `reasonsDetail` is keyed by the full reason string.
  - `adapted` counts lines whose `adapted` is non-null.
  - `failKnown` is the same number as `statuses["fail-known"]`, but a separate field and never part of any skip count.
- **Alpha gate (SM-1).** Consider only lines that are on a variant in `ALPHA_VARIANTS` (`tools/inventory/inventory.ts`) and belong to a Component whose `packages.jsonl` phase is 1–8.
  - A line is *applicable* unless it is a `skip` whose reason kind is `php-only`, `upstream-skip`, `deferred` or `out-of-scope`.
  - A Test ID is applicable when it has at least one applicable alpha line. It passes when **every** one of its applicable alpha lines is `pass`. So `quarantined`, `fail-known`, `intentional-divergence` and `not-ported-yet` all count as not passing.
  - The report records `applicable` (Test IDs), `passing`, `rate`, `target: 0.9`, the variants and Components used, and a `perVariant` breakdown (`applicable` and `passing` per variant).
  - It also records `remaining` (`not-ported-yet` and `blocked-by` line counts in scope) and `met`. `met` is `rate >= 0.9` and both `remaining` counts are 0.
- **Report header.** `report.json` carries `schema: 1`, `commit` (the full SHA from `git rev-parse HEAD` at `--root`, or `null` outside git) and `pin` (`tag` and `commit` of the `laravel/framework` Baseline Pin line). Keys are written in a fixed order, and Components sorted with `compareUnits`.
- **CLI conventions.** Reuse the existing readers: `readWorkingInventory`, `readExpectations`, `readTable`, `readPin`, `ALPHA_VARIANTS` and `compareUnits`. Follow the tool conventions: a header usage comment, `main(argv)`, `--root`, and exit codes 0 = ok, 1 = data error, 2 = usage.
- **History record.** `history.jsonl` lines look like `{"commit","pin":{"tag","commit"},"overall":{"pairs","passing"},"alpha":{"applicable","passing"},"components":{<c>:{"pairs","passing"}}}`, taken from `report.json`. The key is (commit, pin). Appending a key that is already present is a no-op and exits 0.
- **History mechanics.** The tool fetches `--branch` (default `dashboard-data`) from `--remote` (default `origin`), or creates it as an orphan with only `history.jsonl` when it is missing. It commits with git plumbing or a temporary worktree, never touching the caller's HEAD, index or working tree, then pushes, retrying on a non-fast-forward rejection up to 3 times (refetch and re-append).
- **Workflow.**
  - The top level is `permissions: contents: read`. Only job `dashboard` holds `contents: write`.
  - It triggers on `push` to `main`, with `concurrency: {group: dashboard, cancel-in-progress: false}`.
  - Actions are SHA-pinned like `ci.yml`. It runs `bun install --frozen-lockfile --ignore-scripts`, then `conformance:report`, then `conformance:history`.
  - A comment says that Story 7.2 adds the Pages publish to this same job.

**Never:**
- Import any graded package (`packages/*` other than `@xaravel/assert` in tests).
- Edit `conformance/expectations/**`, the Inventory, `tools/workflow-permissions/`, `conformance/protected-paths` or `tools/ownership/`.
- Shrink the denominator, or merge `fail-known` into skips.
- Build the dashboard page or the Pages deploy (Story 7.2).
- Commit `report.json`: its default output is `.cache/conformance/report.json`, which is gitignored.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Real repo | today's data (all lines `skip`) | `overall.pairs` = line count, `passing` 0, `rate` 0, `alpha.met` false | exit 0, prints `conformance:report: wrote <path> (<p>/<n> pairs passing; alpha <a>/<b>)` |
| Mixed fixture | pass, fail-known, quarantined, skip with each reason kind, adapted line | per-status, per-kind and per-reason counts exact; `failKnown` not in any skip count | — |
| Alpha exclusions | phase-9 Component; non-alpha variant (`mysql`); `php-only` line | none of these is counted in `alpha.applicable` | — |
| Every-variant rule | Test ID passes on `sqlite`, `fail-known` on `pgsql` | applicable, not passing | — |
| Divergence | `skip` with `intentional-divergence:DIV-3` on alpha | applicable, not passing | — |
| Unknown id | Expectations line whose id is not in the Inventory | — | exit 1, `conformance:report: <shard>: unknown Test ID <id>` |
| Bad flag | `--nope` | — | exit 2 with usage |
| History new branch | bare remote without `dashboard-data` | orphan branch created with one `history.jsonl` line | exit 0 |
| History repeat | same commit and pin appended again | file unchanged, no new commit | exit 0, says `already recorded` |
| History pin change | same commit, new pin | second line appended | exit 0 |

</intent-contract>

## Code Map

- `tools/inventory/inventory.ts` -- `InventoryEntry` (l.118), `ALPHA_VARIANTS` (l.93), `compareUnits` (l.167).
- `tools/pin-bump/pin-bump.ts` -- `readWorkingInventory(root)` (l.316), `readExpectations(root)` (l.365), which returns untyped `{path, lines}` shards.
- `tools/expectations/reasons.ts` -- `STATUSES` (l.57) and the reason grammar (header l.15–25). It has no exported kind list, so define `REASON_KINDS` in the new tool.
- `tools/scaffold/table.ts:269` `readTable`, `tools/scaffold/scaffold.ts:16` `TABLE_PATH` -- `packages.jsonl` rows with `name` and `phase`. `reasons.ts` `contextFor` (l.150) shows the phase map built from them.
- `tools/upstream/upstream.ts` -- `readPin(root)` (l.104), `PinEntry {repo,name,tag,commit,tree}`.
- `tools/registration/registration.ts` + `conformance/tests/xaravel/registration.test.ts` -- the template for a tool and its XT file (Story 6.6, commit f8d878e).
- `conformance/tests/xaravel/skip-reasons.test.ts` -- the fixture-root pattern: `mkdtempSync`, a minimal package table, inventory and shard, `Bun.spawnSync` CLI calls, cleanup in `afterAll`.
- `tools/workflow-permissions/workflow-permissions.ts:19` -- `ALLOWED_WRITE_JOBS` already allows `dashboard.yml#dashboard`.
- `.github/workflows/ci.yml` -- the SHA pins for checkout and setup-bun, and the install-step idiom.
- `.github/rulesets/agent-push.json` -- disabled now. Once enabled it would block pushes to `dashboard-data`, so document the needed exclude; do not edit the file.
- `conformance/xaravel-consequences/conformance.jsonl` -- consequence tokens `FR-5.1`..`FR-5.5`.

## Tasks & Acceptance

**Execution:**
- `tools/conformance-report/report.ts` -- create. Export `REASON_KINDS`, `computeReport(root)` and `main(argv)`; the CLI has `--root` and `--out`. Implements the Always rules.
- `tools/conformance-report/history.ts` -- create. Export `historyRecord(report)`, `appendHistory({root, remote, branch, report})` and `main(argv)`; the CLI has `--root`, `--report`, `--remote` and `--branch`. This is the single place the data-branch mechanics live.
- `package.json` -- add `"conformance:report": "bun --no-env-file tools/conformance-report/report.ts"` and `"conformance:history": "bun --no-env-file tools/conformance-report/history.ts"`.
- `tsconfig.json` -- add `"tools/conformance-report/*.ts"` to `include`.
- `.github/workflows/dashboard.yml` -- create, per the Workflow rules.
- `conformance/tests/xaravel/conformance-report.test.ts` -- create three tests, each covering all of its matrix rows with fixture roots and a bare git remote under tmp:
  - `XT-conformance-143` (consequence cites FR-5.1): bucket counts, and the CLI writes `report.json`.
  - `XT-conformance-144` (cites FR-5.2): the alpha-gate rules.
  - `XT-conformance-145` (cites FR-5.4 and FR-5.5): history append, orphan creation, idempotence, a new line on a Pin change, the caller's `git status` and HEAD unchanged. It also asserts on `dashboard.yml`: the `push: branches: [main]` trigger, the `dashboard` job runs both scripts, and `checkWorkflows` reports no violations.
- `docs/ops/conformance-report.md` -- create. Cover usage, the `report.json` schema and every definition, the history record and branch, and the limits: the live workflow push is unverified until its first run on `main`, and `agent-push.json` needs `refs/heads/dashboard-data` excluded before it is enabled.
- `docs/ops/identities.md` -- add one line next to the agent-push enablement note about the `dashboard-data` exclude.

**Acceptance Criteria:**
- Given the Inventory and the Expectations File, when `bun run conformance:report` runs, then it writes `report.json` with the per-Component and overall buckets above (XT-conformance-143).
- Given the SM-1 rule, when the report is computed, then `alpha` holds passing over applicable Test IDs for Phase 1–8 Components on every alpha variant, with `quarantined`, `fail-known` and `intentional-divergence` not passing (XT-conformance-144).
- Given a push to `main`, when `dashboard.yml` runs, then `conformance:history` appends a record keyed by commit and Baseline Pin to `dashboard-data` (XT-conformance-145; the live push is verified only at its first run on `main`).

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 39 findings — high 0, medium 6, low 24, false 4, maybe-false 5
- findings:
  - **Intent-alignment layer**
    - `[low]` `[reject]` The intent might want `report.json` persisted or published so 7.3 can reach it (R1b). 7.2 runs in the same job, and 7.3 can call `computeReport` itself; the AC asks only that it be written.
    - `[maybe-false]` `[reject]` The "count per Skip Reason" granularity is unclear. Both `reasons` (by kind) and `reasonsDetail` (by full string) are emitted, so either reading is met.
    - `[maybe-false]` `[reject]` SM-1 might be meant per variant (R2-B). `perVariant` exposes it, and SM-1's unit is "Applicable Test IDs"; the per-ID reading is recorded in Design Notes. If true it would be low only: no number is lost.
    - `[maybe-false]` `[reject]` Applicability is decided per line, not per ID. A Test ID with a `php-only` skip on one variant and a real result on another is still testable there; settled by the same SM-1 reading.
    - `[false]` `[reject]` `none` is not in the PRD alpha list. `ALPHA_VARIANTS` is the repo's existing alpha definition (Epic 2, used by baseline and devcontainer). Unit tests run on `none`, so dropping it would leave most Phase 1–8 Test IDs out of the gate.
    - `[low]` `[reject]` `met` and `target` go beyond the AC's "figure". They are additive fields from SM-1's own target and harm nothing.
    - `[low]` `[reject]` The live push and real Actions run are unverified. This is inherent to the surface; it is stated in the spec, the docs and the Auto Run Result.
    - `[low]` `[reject]` XT consequences cite page-level FR-5.2/5.4/5.5 while proving only the data. The page is 7.2's; the tokens name the requirement chain.
  - **Verification-gap layer**
    - `[medium]` `[patch]` The non-fast-forward retry path and the `REJECTED` regex were untested. Added a competing-push case to XT-conformance-145. It checks `REJECTED` against real git stderr and that the CLI appends on top of a competing tip. The loop's retry branch itself is still not driven, because the CLI refetches just before it pushes.
    - `[low]` `[patch]` The duplicate-pair, unknown-status and missing-variant data errors were untested. Added fixtures to XT-conformance-143.
    - `[low]` `[reject]` `readReport` does not check the type of `pin.commit`. The report is produced by the paired tool in the same job; a corrupt report is unlikely, and the fix adds guards.
    - `[maybe-false]` `[reject]` Fetching and pushing from a shallow checkout is unexercised. Git supports fetching and pushing an unrelated branch from a shallow clone; the first run on `main` settles it. If true it would be low only: the job fails loudly.
  - **Edge-case layer**
    - `[medium]` `[patch]` Concurrency group: a newer push cancels a pending run, so bursts of 3+ pushes drop records. Real, but rare behind the merge queue. The false "every push in order" claim was corrected in the workflow comment and docs; the group was kept as the spec requires.
    - `[low]` `[patch]` A missing `laravel/framework` Pin line gave an opaque error. Now a named DataError, with a test.
    - `[low]` `[reject]` A non-git root nested in another repo picks up the enclosing HEAD. The tool always runs at the repo root; it is unlikely, and the fix adds a branch.
    - `[low]` `[reject]` Missing report fields make `sameKey` match loosely. Same reasoning as the `readReport` row.
    - `[low]` `[reject]` A bare reason kind (`deferred`) is accepted. `expectations:reasons` runs in `ci.yml` (l.130) and rejects it before data reaches `main`.
    - `[low]` `[reject]` An empty-string `adapted` is counted. It is unlikely, and the Expectations check governs the format.
    - `[low]` `[reject]` An Inventory Component with no package-table row drops out of the alpha gate. `scaffold:check` and `component-map:check` run in CI; it is unlikely, and the fix adds a guard.
    - `[low]` `[patch]` The history.ts comments said the branch is fetched into FETCH_HEAD. Comments corrected.
    - `[false]` `[reject]` `--branch` validation depends on argument order. `check-ref-format` with a full ref name does not depend on the repository, so the result is the same either way.
    - `[medium]` `[patch]` The concurrency claim in the workflow comment. Same root cause as the concurrency row above; corrected.
    - `[maybe-false]` `[reject]` A commit claim for a nested root. Same as the nested-root row; low if true.
  - **Blind layer**
    - `[medium]` `[patch]` The concurrency group drops pending runs. Grouped with the edge-case concurrency row; claim corrected.
    - `[low]` `[reject]` The aggregator accepts reasons that `reasons.ts` rejects, and ignores `reason` on non-skip lines. `expectations:reasons` is a CI check on every PR.
    - `[low]` `[reject]` Inventory pairs without an Expectations line would shrink the denominator. `expectations:check` (ci.yml l.128) requires exactly one line per Inventory pair on every PR, so `main` cannot hold that state.
    - `[low]` `[reject]` A Component missing from the package table. Same as the edge-case row.
    - `[low]` `[reject]` The record has no timestamp and no monotonicity check. Neither is in the 7.1 ACs; the record is keyed as the AC says, and line order is push order.
    - `[low]` `[patch]` The history.ts header contradicts the code. Same as the edge-case comment row; fixed.
    - `[low]` `[reject]` A leftover `refs/xaravel-history/<branch>` ref and loose objects. These are documented in the docs, invisible to status, and harmless on the CI runner. The test checks HEAD, index and working tree, which is what the spec promises.
    - `[low]` `[patch]` Running the tool locally could push a wrong record to `origin`. Added a docs warning; a guard would add a flag, and nothing but the workflow runs it.
    - `[medium]` `[patch]` Retry path untested. Grouped with the verification-gap row; test added.
    - `[low]` `[reject]` `readReport` shape validation is loose. Same as the verification-gap row.
    - `[low]` `[patch]` Missing Pin line. Same as the edge-case row; fixed.
    - `[medium]` `[patch]` `persist-credentials: true` exposes the write token to every step. The token is now given only to the history step, through `GIT_CONFIG_*` env; checkout uses `persist-credentials: false`.
    - `[low]` `[patch]` The pin assertion was brittle and did not check for SHAs. It now asserts 40-hex SHA pins, each also used in `ci.yml`.
    - `[false]` `[reject]` XT-143 does not assert the real-repo row values. The row's invariant (pairs = line count, exit 0, summary line) is asserted; `passing 0` would break on the first port, and `met` false is asserted in 144.
    - `[low]` `[defer]` The `agent-push.json` exclude for `dashboard-data` is only documented. Story 7.1 may not edit the ruleset (spec Never); deferred, and reported on the status issue for the Epic 8 checkpoint.
    - `[false]` `[reject]` "Fetch first" wording might not match under `--quiet`. Disproved by the new test, which captures real stderr.

## Design Notes

**Reading SM-1's "pass on every alpha Backend Variant".** A Test ID is the unit, as SM-1 says ("Applicable Test IDs"). It passes only when it passes on each alpha variant it runs on. The `perVariant` breakdown keeps the per-variant numbers visible, so 7.2 can show either view without redefining anything.

**The data branch** is `dashboard-data`; nothing earlier names one. A separate branch keeps `main` linear and free of bot commits, and Story 7.2's Pages build reads `history.jsonl` from it.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-conformance-14[345]'` -- expected: all three pass.
- `bun run conformance:report` -- expected: exit 0, writes `.cache/conformance/report.json`, and `overall.pairs` equals the Expectations line count (23,291 today).
- `bun run typecheck && bun run lint && bun run workflows:check` -- expected: clean.
- `bun run story:check 7.1` -- expected: pass.

## Auto Run Result

Status: done

**Summary.** `bun run conformance:report` (`tools/conformance-report/report.ts`) writes `report.json`. It holds the per-Component and overall Conformance Rate buckets (statuses, Skip Reason kinds and full reasons, `adapted`, and `failKnown` kept apart from skips) and the SM-1 alpha gate (per-Test-ID over every alpha variant, plus a `perVariant` breakdown, `remaining` and `met`). `bun run conformance:history` (`history.ts`) appends a (commit, Baseline Pin)-keyed record to `history.jsonl` on the `dashboard-data` branch. The new `.github/workflows/dashboard.yml` job `dashboard` runs both on every push to `main`.

**Files.**
- `tools/conformance-report/report.ts`: the aggregator.
- `tools/conformance-report/history.ts`: the data-branch append, using plumbing only and retrying on rejection.
- `.github/workflows/dashboard.yml`: the push-to-main job. Only this job holds write scope, and only the history step gets the token.
- `conformance/tests/xaravel/conformance-report.test.ts`: XT-conformance-143, 144 and 145.
- `docs/ops/conformance-report.md`: the schema, definitions, history mechanics and limits.
- `docs/ops/identities.md`: the `dashboard-data` exclude needed before `agent-push` is re-enabled.
- `package.json`, `tsconfig.json`: the scripts and the typecheck include.

**Review.** 39 findings, routed in one pass with no loopback:
- 13 rows patched, 9 fixes in all (rows sharing a root cause were fixed once). The patched rows are 6 medium and 7 low; none was high.
- 1 deferred: the `agent-push.json` exclude.
- 25 rejected, each with its reason in the triage log.

**Follow-up review recommended:** false. No high was patched. The two medium entries (the token scope and the concurrency claim) were each verified directly by the updated XT-conformance-145.

**Verification.**
- `bun run harness --xaravel`: 255/255 pass, including XT-conformance-143..145.
- `conformance:report` on the repo: 0/23291 pairs, alpha 0/18395.
- `typecheck`, `lint`, `workflows:check`, `scaffold:check` and `graph:check` are clean.
- `story:check 7.1`: the tests, xaravel-tests, fixtures and escalations checks pass. The approvals and full-run checks need the PR to exist, so they are checked on the PR.

**Residual risks.**
- The live history push is unverified until the first `dashboard` run on `main`.
- The retry branch is not driven by a test.
- A burst of 3 or more pushes during one run leaves the middle commits without a record.
- `agent-push.json` needs a `refs/heads/dashboard-data` exclude before the Epic 8 checkpoint re-enables it.

