---
title: 'Story 5.9: Xaravel Test coverage check and the Story done check'
type: 'feature'
created: '2026-10-19'
baseline_revision: '95294d55d982d9e50e9379cd639cbbdbd2dc49ea'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/AGENTS.md'
warnings: [oversized]
deferred:
  - summary: >-
      The 56 renumbered duplicate Xaravel Tests (XT-conformance-198..253) belong to no Story manifest, so story:check for their original Stories checks only the first declaration of each ID.
    evidence: |-
      story-manifests.md forbids Story PRs from editing stories/*.md (a Protected Path), so the IDs are recorded as off-manifest. Attaching them to their Stories needs a Maintainer-approved manifest amendment. Raise it at the Epic 5 retrospective.
    location: >-
      _bmad-output/implementation-artifacts/story-manifests.md (Off-manifest IDs)
    severity: medium
  - summary: >-
      Consequence IDs are bullet ordinals, so a PRD or spine edit that inserts a bullet shifts later IDs; existing citations then silently point at different bullets.
    evidence: |-
      xt:consequences --check flags the regenerated file, but not the tests whose citations now name a different bullet. The fix is a design change: pin each citation to its text hash, or re-check citations on regeneration.
    location: >-
      tools/xt-coverage/consequences.ts
    severity: medium
  - summary: >-
      story:check's GitHub paths (review listing, workflow-run lookup by head_sha, job-log redirect) are tested only against a fake API, plus one manual live run.
    evidence: |-
      The live run of story:check 5.8 on 2026-10-19 passed full-run from the real ratchet job log and listed the reviews. Paging past 100 runs per sha is unhandled; that is unlikely for one PR head.
    location: >-
      tools/story-check/story-check.ts githubClauses
    severity: low
---

<intent-contract>

## Intent

**Problem:**
- "Done" is claimed, not computed. Nothing checks a Story against the PRD §3 done definition.
- Nothing lists which FR consequences and AD rules have no passing Xaravel Test (FR-115).
- None of the ~226 Epic 1–4 Xaravel Tests uses `xaravelTest`. They are plain `test("XT-…: …")` calls, the harness never runs them, and 22 of their IDs are declared more than once.
- Epic 3 retro S5 and R6, assigned to this Story by `epic-3-retro-item-9`, are still open:
  - nothing requires a Differential Test ID to have a verified fixture;
  - XT `date-format` requests run on the real clock;
  - XT `validation-message` requests have no translator, so they become signed `setup` errors;
  - Pest Test IDs become signed `fatal` fixtures.

**Approach:**
- A generator transcribes the PRD's FR consequences and the spine's AD rules into `conformance/xaravel-consequences/<component>.jsonl`, with mechanical IDs.
- `bun run xt:coverage <component>` runs the Xaravel Tests under the harness and lists every consequence that no passing test cites.
- `bun run story:check <story-id>` reports pass or fail for each done-definition clause, plus the Differential-fixture clause.
- Every existing Xaravel Test is converted to `xaravelTest`, and the harness gains a Xaravel run.
- `tools/oracle` is fixed for the three R6 cases.

## Boundaries & Constraints

**Always:**
- **Consequence IDs.**
  - `FR-<n>.<k>` is the k-th (1-based) top-level bullet of FR-n's `**Consequences (testable):**` list in the PRD. `AD-<n>.<k>` is the k-th top-level bullet of AD-n's `**Rule:**` list in the spine.
  - The text is the bullet with its nested lines, whitespace collapsed to single spaces.
  - Lines are `{"id","text"}`, written with `JSON.stringify`, one per line with LF, all FR lines (by n, then k) before all AD lines (by n, then k). Each line's `id` is unique.
  - `conformance` takes FR-1..9 and FR-111..116, and AD-15, 16, 17, 21 and 28 (the spine's Capability Map row for the Conformance System). This Story writes only `conformance.jsonl`.
- **Declaring.** A `xaravelTest` declares consequence `X` when its consequence string contains `X` as a whole token: `(?<![\w.-])(FR|AD)-\d+\.\d+(?![\w.])`. A bare `FR-3` declares nothing.
- **Coverage.** A consequence is covered when at least one Xaravel Test that passed in the run declares it. The test may live in any component directory, because the Conformance System spans `conformance/`, `packages/assert` and `packages/mockery`.
- **Xaravel run** in `runHarness`:
  - one `bun test` with the same preload, junit and env as a Variant run, but `XARAVEL_VARIANT=none`;
  - over `conformance/tests/xaravel/**/*.test.ts` and `packages/*/tests/xaravel/**/*.test.ts`;
  - it reads `type: "xaravel"` reports, and runs after every Variant run;
  - before it starts, the harness stops its Redis and releases the lock, because Xaravel Tests start their own harness runs (XT-conformance-105 runs one on the real root).
- **Harness CLI.**
  - A full run (no filter, not `--fast`) also does the Xaravel run.
  - `--xaravel` does only the Xaravel run; `--id` globs then filter XT IDs.
  - `runHarness` runs no Xaravel Tests unless `options.xaravel` asks for them, so the Ratchet and existing callers are unchanged.
- **Harness report.**
  - One line per selected Xaravel Test that failed, was missing or was late: `<id> [xaravel] FAIL|MISSING|LATE`.
  - `- [xaravel] UNDECLARED <testcase name>` for a junit testcase with no report.
  - `ERROR [xaravel] bun test exited <n> with no failing testcase`.
  - Each of these is a difference. A skipped Xaravel Test (`markTestSkipped`) is not.
  - Before SUMMARY: `XARAVEL tests=<n> passed=<p> failed=<f> skipped=<s>`.
  - The SUMMARY format is unchanged, and `isFullRun` is reused, not changed.
- **`xaravelTest(id, consequence, fn, timeout?)`.** The optional 4th argument is bun's per-test timeout in milliseconds.
- **Converting the existing tests.**
  - The consequence is the existing label text after `XT-<c>-<n>: `, verbatim, citations included.
  - Every assertion, timeout and hook survives.
  - Each PHP gate that used `test.skip` becomes a `markTestSkipped(<reason>)` inside the body. `XARAVEL_PHP_FIXTURES=require` must still fail when PHP is unmet.
  - The first declaration of a duplicated ID keeps it. Later ones get new IDs from `XT-conformance-198`, in file order.
  - The four unlabelled mockery tests get `XT-mockery-8` onward.
  - Every new ID is recorded under Off-manifest IDs in `story-manifests.md`.
  - `stories/*.md` is never edited.
- **`story:check <story-id> [--pr <n>]`.** It prints `PASS|FAIL <clause>: <detail>` for each clause in this order: `manifest`, `tests`, `xaravel-tests`, `fixtures`, `approvals`, `escalations`, `full-run`. Each failing item goes on its own indented line, at most 20 per clause, then `  … <m> more`. The last line is `STORY-CHECK <id> pass|fail`. The exit code is 0 when every clause passes, 1 when any fails, 2 on a usage error.
  - `manifest`: `parseManifest` has no violations, so a manifest with no assigned tests fails.
  - `tests`: a full harness `--story` run (never fast). Each Test ID × Variant line passes when its status is `pass` and it does not differ, or when it is a `skip` whose reason is not `not-ported-yet` and `checkLine` accepts it. `fail-known`, `quarantined`, a difference, NOT-RUN and no Expectations line all fail. With no `test_ids` the clause passes as `none assigned`.
  - `xaravel-tests`: every `xaravel_test_ids` entry passes in a Xaravel run filtered to those IDs. A skip fails.
  - `fixtures`: this clause covers every assigned ID (`test_ids` ∪ `xaravel_test_ids`) that is the `id` of a committed request (`committedRequests`), minus the requests in `nondeterminism.jsonl`. Each such request needs `conformance/fixtures/<component>/<sha256>.json`, and `verifyFixture` must accept it against `oracle.pub`. A fixture whose `output.error.stage` is `fatal` or `setup` also fails, unless the ID's Inventory `oracle` map is non-empty and has no `pass`.
  - `approvals`: the PR is `--pr` or else the most recently updated PR with head `story/<id>` (any state). Its reviews are reduced to each reviewer's latest `APPROVED`, `CHANGES_REQUESTED` or `DISMISSED` state, excluding the PR author. It needs at least two distinct `APPROVED` logins.
  - `escalations`: no `ESC-<id>-<n>` may have `escalationStatus` `open`.
  - `full-run`: among the PR head's workflow runs (`/actions/runs?head_sha=`), take the latest named `ratchet`, then its job `ratchet`, then the job log (`/actions/jobs/<id>/logs`). The last `SUMMARY ` line in it, with the timestamp removed, must satisfy `isFullRun`.
  - With no `GH_TOKEN`, `approvals` and `full-run` FAIL with `cannot check: GH_TOKEN is not set`. They never pass silently. The repo comes from `GITHUB_REPOSITORY`, else from the `origin` remote.
- **Oracle (R6).**
  - For an XT target (`BareTestCase`), `evaluate.php` applies `date-format`'s `input.now` through `Illuminate\Support\Carbon::setTestNow`.
  - It gives `BareTestCase` Upstream's `getIlluminateArrayTranslator()` (an `en` `Translator` over an `ArrayLoader`).
  - `judgeStoryRequests` rejects a Pest Test ID with a reason that names it.
  - The fixture generator refuses a Pest ID before it evaluates anything, so none is ever signed.
  - Real-PHP tests use the existing `phpTest` gate.
- **XT IDs.** XT-conformance-126 covers AC1, 127 AC2 and 128 AC3. XT-conformance-196 covers the AC4 fixtures clause and 197 the AC4 Oracle fixes, both off-manifest.
- **Escalation.** `conformance/escalations/ESC-5.9-1.md` (`trigger: open-question`, `test_ids: [XT-conformance-126]`) raises two questions:
  - Consequence files for htmx, boost, skeleton and installer. Their epics name partial FR sets (FR-96 htmx only, FR-15..17 non-auth).
  - Who refines the existing tests' FR-level citations to `FR-n.k`. Until someone does, `xt:coverage conformance` correctly fails.

  Proposed: (1) add each component's row to the generator map in an Infrastructure change before its epic's coverage AC; (2) the Epic 5 retrospective files an action item to refine the citations.

**Never:**
- No weakened assertion, removed test or new skip in any converted test.
- No edit to `stories/*.md` or `AGENTS.md`. No change to the Ratchet's behaviour.
- No `expect` from bun:test in Ported Tests. Xaravel Tests may keep it.
- No change to `conformance/protected-paths`, `tools/ownership` or `tools/protected-paths` beyond a new `text(path)` method on the `GitHub` client.
- No hand-edited consequence file. The `--check` drift mode is the source of truth.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Covered | a passing XT declares `FR-3.1`, and the file has `FR-3.1` | `FR-3.1` not listed | exit 0 when nothing is uncovered |
| Uncovered | a failing or skipped XT declares `FR-3.2`, or none does | `UNCOVERED FR-3.2: <text>` | exit 1, final `XT-COVERAGE conformance consequences=<n> covered=<c> uncovered=<u>` |
| Unknown component | `xt:coverage nope` | `xt:coverage: conformance/xaravel-consequences/nope.jsonl does not exist` | exit 1 |
| No assigned tests | manifest with empty `test_ids` and `xaravel_test_ids` | `FAIL manifest: …` | exit 1 |
| No token | `GH_TOKEN` unset | `FAIL approvals: cannot check: GH_TOKEN is not set`, and the same for `full-run` | exit 1 |
| Fast last run | log's last SUMMARY ends ` mode=fast seed=…` | `FAIL full-run: … was a fast run` | exit 1 |
| Missing fixture | assigned XT has a committed request, no fixture | `FAIL fixtures:` with the ID and its sha256 | exit 1 |
| Error fixture | XT fixture `stage: fatal` | `FAIL fixtures:` with the ID and stage | exit 1 |
| Undeclared test | `test("x")` in an XT file | `- [xaravel] UNDECLARED x` | counted difference |
| Pest request | `conformance/oracle-requests/<s>.jsonl` with a Pest ID | judge rejects with a reason naming the ID | never signed |

</intent-contract>

## Code Map

- `conformance/harness/harness.ts`: header :1-104, `PORTED_GLOB` :128, `HarnessOptions` :137, `HarnessResult` :171, `isFullRun` :191, `readHarnessOut` :273 (keeps only `ported` :294), `runVariant` :318, `storyIds` :386, `runHarness` :408 (lock :454, cleanup :425, SUMMARY :597), `parseArgs` :617. Add the Xaravel run here, or in a sibling `xaravel.ts`.
- `conformance/harness/junit.ts`: `parseJunit`. A testcase name is the declaration label `<id>: <consequence>`.
- `conformance/harness/compare.ts`: `Difference` :86, `Result`/`Outcome` :72.
- `packages/assert/src/declarations/xaravelTest.ts`: add the `timeout` argument. `Declarations.ts:61` `registerTests` passes the timeout to `test(label, fn, timeout)`. The `TestReport` shape is unchanged.
- `packages/assert` exports `markTestSkipped` (PHPUnit Assert); skipped reports carry `skipped`.
- `tools/ownership/ownership.ts`: `parseManifest` :222, `Manifest` :137.
- `tools/expectations/reasons.ts`: `contextFor` :150, `checkLine` :278. `tools/pin-bump/pin-bump.ts`: `readExpectations` :365, `readWorkingInventory`.
- `tools/escalations/escalations.ts`: `parseEscalationId` :210, `escalationStatus` :332, `ESCALATIONS_DIR` :92, `TRIGGERS` :95.
- `tools/protected-paths/protected-paths.ts`: `GitHub` :374 (`json` :393, `paged` :401). Env `GITHUB_API_URL`, `GH_TOKEN`. Add `text(path)`.
- `tools/oracle/verify.ts`: `committedRequests` :79, `verificationKey` :114. `tools/oracle/fixtures.ts`: `verifyFixture` :127, `readNondeterminism` :317, the evaluation entry :392-395. `tools/oracle/story-requests.ts`: `judgeStoryRequests` :88-158. `tools/oracle/evaluate.php`: `testTarget` :288-301, `date-format` :426-428, `validation-message` prelude :429-437, `BareTestCase` :449-451. `conformance/oracle/schema.json` defines `now`'s form.
- Tests:
  - `conformance/tests/xaravel/*.test.ts` (36 files) and `packages/{assert,mockery}/tests/xaravel/*.test.ts`: the conversion targets. The duplicate IDs, and the two tests that fail under the preload (XT-conformance-185, which does `delete global[LATE]` at harness.test.ts:625; XT-mockery-7 at mockery.test.ts:983), are listed in Design Notes.
  - `harness.test.ts` `makeRoot` (temp-root pattern) and `ownership.test.ts:132` `runPr` (fake GitHub via `Bun.serve`).
  - `oracle-fixtures.test.ts:337-366` (`phpTest`, `LOCAL_INSTALL`).
- Live evidence (2026-10-19, PR #162): `/actions/runs?head_sha=` lists the `pull_request_target` `ratchet` run, and `/actions/jobs/<id>/logs` holds `<ts>Z SUMMARY variants=11 run=7 not-run=4 checked=22639 differ=0`.
- `@xaravel/assert` does not resolve from `conformance/tests/`. Add a root `devDependencies` entry `"@xaravel/assert": "workspace:*"` and run `bun install`, unless `root-baseline.test.ts` forbids it; if it does, use a relative import of the package entry.
- Docs: `docs/ops/harness.md` (the Xaravel run), new `docs/ops/done-check.md`, `conformance/README.md`.

## Tasks & Acceptance

**Execution:**
- `tools/xt-coverage/consequences.ts`: generator, with `--check`. Root script `xt:consequences`. Writes `conformance/xaravel-consequences/conformance.jsonl`.
- `tools/xt-coverage/coverage.ts`: `bun run xt:coverage <component> [--root]`. A pure `coverage(consequences, results)` plus the CLI, which uses `runHarness({xaravel})`.
- `tools/story-check/story-check.ts`: `bun run story:check`. Pure clause functions plus the CLI.
- `conformance/harness/harness.ts` (+ `xaravel.ts`): the Xaravel run, `--xaravel`, the `xaravel` option and result, the report lines, and the header docs.
- `packages/assert/src/declarations/{xaravelTest,Declarations}.ts`: the timeout.
- `tools/protected-paths/protected-paths.ts`: `GitHub.text`.
- `tools/oracle/{evaluate.php,story-requests.ts,fixtures.ts}`: the R6 fixes.
- Convert every XT file. Renumber the duplicates. Fix XT-conformance-185 and XT-mockery-7 so they pass both plain and under the preload: save, replace and restore a configurable descriptor, or run the hook-interception part in a child `bun` without the preload. Every assertion is kept.
- `conformance/tests/xaravel/done-check.test.ts`: XT-126, 127, 128, 196 and 197. 197 may live in `oracle-fixtures.test.ts`.
- `conformance/escalations/ESC-5.9-1.md`, the `story-manifests.md` IDs, root `package.json` scripts, `bun.lock` and the docs.

**Acceptance Criteria:**
- **AC1 (XT-conformance-126).** Given `conformance/xaravel-consequences/conformance.jsonl`, generated from the PRD and spine and passing `--check`, when `bun run xt:coverage conformance` runs, then it lists every consequence with no passing `xaravelTest` that declares it, and exits 1 if any remain.
- **AC2 (XT-conformance-127).** Given `bun run story:check <story-id>`, when it runs, then it reports PASS or FAIL for each done clause, and a manifest with no assigned tests fails. This is proven against temp roots and a fake GitHub API.
- **AC3 (XT-conformance-128).** Given the Epic 1–4 Xaravel Tests, when the full harness runs, then every test in an XT file is a `xaravelTest`, all of them run in the Xaravel run, none is UNDECLARED, and no ID is duplicated.
- **AC4 (XT-conformance-196 and 197).**
  - Given assigned Differential IDs, `story:check` fails each one with no verified fixture, or with an unexpected `fatal` or `setup` error fixture.
  - XT `date-format` honours `now`, XT `validation-message` evaluates with a translator, and Pest IDs are rejected with a reason and never signed.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 49 findings — high 0, medium 18, low 14, false 6, maybe-false 11
- findings:
  - **Intent Alignment** (descriptive)
    - `[maybe-false]` `[reject]` No Epic-level done verdict (reading N-b). The ACs name only `story:check` and `xt:coverage <component>`, and the Epic gate is the coverage command. Implemented reading N-a.
    - `[maybe-false]` `[reject]` AC1 is proven on synthetic roots and ships only `conformance.jsonl`. This is recorded design; ESC-5.9-1 routes the other components and the citation refinement to the Maintainer.
    - `[medium]` `[patch]` `full-run` checks only "not fast", not that CI passed (PRD §3). Grouped with the Blind Hunter `full-run` row: the clause now also requires `differ=0`.
    - `[maybe-false]` `[reject]` `approvals` counts any two non-author approvals, not specifically Fidelity reviews. This matches the AC literally; Story 8.5 owns the Fidelity Review.
    - `[false]` `[reject]` AC2 is proven only against fakes. The live `story:check 5.8` run read the real reviews and ratchet log (full-run PASS).
    - `[medium]` `[patch]` CI's grading path does not do the Xaravel run. Grouped with the Verification Gap CI row: `ci.yml` now runs `bun run harness --xaravel`.
    - `[false]` `[reject]` A Differential Test with no committed request passes. `docs/ops/oracle.md` defines the Differential set as closed: a Test ID is Differential exactly when a request captures its input. Per-Component completeness (S5) was assigned to this Story as the per-Story clause.
    - `[false]` `[reject]` "Pest IDs the image cannot run": the image runs no Pest ID (evaluate.php binds every request to a PHPUnit TestCase), so rejecting all of them is the only reading.
    - `[low]` `[reject]` Scope goes beyond the AC (Epic 5 tests, timeout argument, renumbering, `GitHub.text`). Each is needed for AC3 or AC2; informational only.
  - **Verification Gap**
    - `[medium]` `[patch]` Nothing tests the lock release before the Xaravel run. Added a fixture-root full run whose Xaravel Test starts a harness on its own root.
    - `[medium]` `[patch]` The `tests` NOT-RUN branch is never exercised. Added a pgsql line on an unreachable backend to XT-127.
    - `[low]` `[patch]` The `escalations` approved path is untested. Added an approved-decision case to XT-127.
    - `[medium]` `[patch]` No CI job runs the Xaravel run (AC3). Added a `bun run harness --xaravel` step to the `ci.yml` `check` job.
    - `[low]` `[patch]` The `xaravelTest` timeout check is untested. Added `0`, `-1` and `NaN` cases to XT-assert-7.
    - `[low]` `[reject]` XT-197's PHP-free Pest checks sit inside `phpTest`. CI runs them under `XARAVEL_PHP_FIXTURES=require` (`ci.yml` php-fixtures job).
  - **Blind Hunter**
    - `[medium]` `[patch]` `full-run` passes a run that differs. The clause now fails on `differ≠0`.
    - `[medium]` `[patch]` CI never does the Xaravel run. Same fix as the Verification Gap CI row.
    - `[medium]` `[patch]` `testsClause` ignores harness ERROR lines (id `-`). Those differences are now failing items.
    - `[false]` `[reject]` `fixtures` does not require a fixture for Differential IDs without a request. Same refutation as the Intent row (closed Differential set).
    - `[medium]` `[patch]` The XT `date-format` frozen clock leaks to later requests in the same process. `setTestNow()` is now reset after the request.
    - `[false]` `[reject]` `now` is spliced in as raw PHP. `schema.json:123` defines `now` as "the PHP source of the setTestNow argument".
    - `[low]` `[patch]` Coverage silently drops unknown citations. It now writes a stderr warning per unknown declared ID. Renumbering drift is deferred.
    - `[low]` `[patch]` The Story's own new tests cite only FR-level IDs. They now cite the bullets they verify.
    - `[medium]` `[defer]` The 56 renumbered tests belong to no Story. Fixing it needs a manifest amendment (`stories/*.md` is Protected); deferred to the Epic 5 retrospective.
    - `[low]` `[patch]` The renumbering note's line numbers are inconsistent. Corrected to the current lines.
    - `[medium]` `[patch]` `story:check` passes `GH_TOKEN` to the test processes. The harness env now drops `GH_TOKEN` and `GITHUB_TOKEN`.
    - `[medium]` `[patch]` `approvals` counts stale reviews and an unrelated `--pr`. It now counts only reviews on the head sha, and fails when the `--pr` head is not `story/<id>`. The any-state fallback part is rejected as low (rare, and the fix adds branches).
    - `[low]` `[patch]` The Pest suite list is hard-coded. It now uses `PEST_SUITES`. The batch-abort half is rejected: a loud refusal is correct, and the extractor never emits a Pest ID.
    - `[low]` `[reject]` No recursion guard for the Xaravel run. `runHarness` runs no Xaravel Tests unless asked, and no test runs the real root's full Xaravel run; a guard adds branches.
    - `[low]` `[patch]` The bullet-parser header contradicts the code. Comment corrected. The repeated-heading case is rejected: the PRD has none, and `--check` would show it.
    - `[low]` `[reject]` Duplicate IDs show as generic FAIL, and an empty glob passes silently. `xaravelTest` throws at declaration naming the duplicate; the glob guard adds a branch for a typo case.
    - `[low]` `[patch]` The docs disagree on conversion scope and count. Unified to "every Xaravel Test in the three XT directories (231)".
  - **Edge Case Hunter**
    - `[medium]` `[patch]` `fixtures` ignores timeout, bindings, setUp and tearDown error stages. Every non-null `output.error` now counts.
    - `[low]` `[patch]` An all-`skip` oracle map excuses an error fixture. The excuse now needs every outcome to be `fail`.
    - `[maybe-false]` `[reject]` Rejected request lines leave the due set. The `oracle` workflow's story judge rejects such a file before merge, so on `main` it cannot exist. Settled by checking `committedRequests` violations on a merged root.
    - `[medium]` `[patch]` `xaravelClause` ignores an `ERROR [xaravel]` crash. It now fails on it.
    - `[medium]` `[patch]` `testsClause` ignores ERROR differences. Same fix as the Blind Hunter row.
    - `[low]` `[reject]` A `--xaravel` glob matching nothing passes. Same as the Blind Hunter row.
    - `[medium]` `[patch]` `--pr` with another branch's PR. Same fix as the Blind Hunter approvals row.
    - `[medium]` `[patch]` Stale approvals. Same fix as the Blind Hunter approvals row.
    - `[maybe-false]` `[reject]` A filtered or `--xaravel` SUMMARY is accepted as full. Story 5.4's `isFullRun` contract says filters do not make a sample, and CI's ratchet job never runs `--xaravel`.
    - `[medium]` `[patch]` `full-run` accepts `differ>0`. Same fix as the Blind Hunter row.
    - `[maybe-false]` `[defer]` More than 100 runs per sha, or `pull_request_target` under the base sha. The live check (PR #162) shows `pull_request_target` runs under the PR head sha. Paging is deferred as low and unverified.
    - `[false]` `[reject]` `GitHub.text` forwards the bearer to blob storage. The live `story:check 5.8` read the job log through the redirect.
    - `[maybe-false]` `[reject]` The token regex rejects a trailing period (`FR-3.1.`). The regex is fixed by the intent contract; changing it means editing the spec.
    - `[maybe-false]` `[reject]` A section with a sub-heading ends early. The PRD and spine have none; the generator would throw loudly.
    - `[maybe-false]` `[reject]` `--check` misses a stale file for a removed component. There is only one file; low.
    - `[maybe-false]` `[reject]` XT `date-format` does not set `$this->now`. XT requests are authored for Xaravel, with no Upstream class to mirror; `Carbon::now()` honours `now`.
    - `[maybe-false]` `[reject]` "Honours now" claim, `$this->now` (duplicate of the row above).

## Design Notes

- **Duplicated IDs.** The first occurrence keeps the ID; later ones are renumbered from 198.
  - conformance-47: component-map:289,403
  - conformance-69: oracle-extract:787,820,842,870,910
  - conformance-70: oracle-extract:931,999
  - conformance-71: oracle-fixtures:188,291,366
  - conformance-72: oracle-fixtures:440,490,547,572,626
  - conformance-74: oracle-verify:99,110,171,181,228
  - conformance-77: oracle-story:215,276,343,387,411,427
  - conformance-78: oracle-story:510,569,605
  - conformance-79: oracle-story:627,679,710
  - conformance-80: api-surface:240,365,412
  - conformance-81: api-surface:443,462
  - conformance-83: scans:153,230
  - conformance-84: scans:651,688
  - conformance-89: expectations:94,124,152
  - conformance-90: expectations:169,182,196,209,234,249
  - conformance-91: expectations:277,292,305,377
  - conformance-92: skip-reasons:137,149
  - conformance-98: skip-reasons:222,244,270,304
  - conformance-115: ratchet:100,222,276
  - conformance-116: ownership-lines:85,124,175
  - conformance-119: ci-pipeline:137,182,264
  - conformance-187: oracle-merge-order:109,176,202,261,278
  - conformance-188: oracle-recheck:180,261,312
- **Unlabelled mockery tests:** mockery.test.ts:153, 300, 417 and 667.
- **Why bullet-ordinal IDs.** Nothing in the PRD, spine or SPEC numbers consequences. Ordinals are mechanical and reproducible, and the drift check catches any renumbering after a PRD edit.
- **Why converted tests cite nothing new.** Mapping 226 tests to bullets is judgment that the Fidelity Review must check. Claiming coverage without that review would make coverage claimed, not computed. ESC-5.9-1 routes the work.
- **Why the lock is released before the Xaravel run.** It uses no backend, and its own tests start harness runs on the real root.
- **Live-only.** `story:check`'s GitHub paths are tested against a fake API. One live read-only run (`GH_TOKEN=$(gh auth token) bun run story:check 5.8`) is part of verification. Expect `approvals` to FAIL, because the orchestrator runs as the Maintainer (Epic 1 retro item 12 waiver).

## Verification

**Commands:**
- `bun install --frozen-lockfile` (after updating the lock), `bun run typecheck`, `bun run lint`: no errors.
- `bun test conformance/tests/xaravel packages/assert/tests/xaravel packages/mockery/tests/xaravel`: all pass.
- `bun run harness`: the XARAVEL line shows failed=0, and SUMMARY shows differ=0.
- `bun run xt:consequences --check`: exit 0. `bun run xt:coverage conformance`: runs and lists the uncovered consequences (expected to be non-zero).
- `bun run escalations:check`, `bun run ownership:check`, `bun run workflows:check`: pass.
- `GH_TOKEN=$(gh auth token) bun run story:check 5.8`: prints all 7 clauses.

## Auto Run Result

Status: done

**Summary.**
- `conformance/xaravel-consequences/conformance.jsonl` holds 96 consequences, generated by `xt:consequences`, with a `--check` drift mode.
- `bun run xt:coverage <component>` lists consequences that no passing `xaravelTest` cites.
- `bun run story:check <story-id>` checks seven clauses: manifest, tests, xaravel-tests, fixtures, approvals, escalations and full-run.
- The harness now has a Xaravel run: a full run includes it, `--xaravel` runs only it, and CI runs `bun run harness --xaravel`.
- All 231 Xaravel Tests are converted to `xaravelTest`. Duplicate IDs were renumbered to XT-conformance-198..253, and four unlabelled mockery tests became XT-mockery-8..11.
- The Oracle fixes for Epic 3 retro R6 are in: an XT `date-format` request honours `now` and resets it, an XT `validation-message` request gets a translator, and Pest IDs are rejected and never signed.
- ESC-5.9-1 asks the Maintainer about consequence files for the other components and about refining the existing tests' citations.

**Files.**
- **Harness:** `conformance/harness/{harness,xaravel}.ts`, the Xaravel run.
- **New tools:**
  - `tools/xt-coverage/{consequences,coverage}.ts`: the generator and the coverage check.
  - `tools/story-check/story-check.ts`: the done check.
- **Changed code:**
  - `packages/assert/src/declarations/{xaravelTest,Declarations}.ts`: the timeout argument.
  - `tools/protected-paths/protected-paths.ts`: `GitHub.text`.
  - `tools/oracle/{evaluate.php,story-requests.ts,fixtures.ts}`: the R6 fixes.
  - `.github/workflows/ci.yml`: the Xaravel run step.
- **Tests:**
  - every `conformance/tests/xaravel/*.test.ts` and `packages/{assert,mockery}/tests/xaravel/*.test.ts` file, converted;
  - `conformance/tests/xaravel/done-check.test.ts`, new: XT-126, 127, 128 and 196. XT-197 is in `oracle-fixtures.test.ts`.
- **Data and records:** `conformance/xaravel-consequences/conformance.jsonl`, `conformance/escalations/ESC-5.9-1.md`, `story-manifests.md` (the off-manifest IDs).
- **Docs and config:** `docs/ops/{done-check,harness}.md`, `conformance/README.md`, `package.json` scripts, `tsconfig.json` includes.

**Review.** One pass, 49 findings: 23 patched (medium 15, low 8), 4 deferred, 22 rejected. Each finding's reason is in the Review Triage Log.

**Follow-up review: recommended.** 15 medium entries were patched. The specific unverified risks are the patched `story:check` approvals and full-run logic on a live PR with real reviews, and the new CI `harness --xaravel` step's first run on linux-x64.

**Verification.**
- Install, typecheck, lint, `xt:consequences --check`, `escalations:check`, `ownership:check`, `workflows:check` and the CODEOWNERS check: all clean.
- `bun test`: 231 pass, 0 fail.
- `bun run harness`: `XARAVEL tests=231 passed=231 failed=0` and `SUMMARY … differ=0`.
- `bun run harness --xaravel`: 231 passed.
- Live `story:check 5.8`: all 7 clauses printed. `full-run` PASS from the real ratchet log. `approvals` FAIL, because the orchestrator runs as the Maintainer and has no second identity. `escalations` FAIL, because ESC-5.8-1 is open.
- `xt:coverage conformance` runs and reports uncovered consequences, as expected until ESC-5.9-1 is ruled.

**Residual risks.**
- The CI step adds about 55 s to the `check` job.
- The XT tests now run under the hardened preload in CI as well.
- `story:check` can never pass `approvals` while the orchestrator runs as the Maintainer (Epic 1 retro item 12).
- ESC-5.9-1 waits on the Maintainer.
