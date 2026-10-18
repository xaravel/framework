---
title: 'Story 4.2: `portedTest` and `xaravelTest` declarations with assertion counting'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: '5819318df56d42e395fac013033a39c9401c4599'
review_loop_iteration: 2
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      No test shows that two declared tests running at once keep separate assertion counts, or that an assertion recorded after its test finished is noticed.
    evidence: |-
      AssertionCounter.ts holds per-test counts in an AsyncLocalStorage, but every fixture test runs sequentially. Nothing in the repo uses test.concurrent yet; the gap matters once the harness (Epic 5) or 4.3+ run tests concurrently (review pass 1, verification-gap and blind layers).
    location: >-
      packages/assert/src/declarations/AssertionCounter.ts
    severity: low
  - summary: >-
      Code under test can patch AsyncLocalStorage.prototype or bun's test function and so drop or fake assertion counts.
    evidence: |-
      The counter calls storage.getStore and storage.run through the shared AsyncLocalStorage prototype, and Declarations.ts calls bun's test at declaration time; nothing captures or freezes them. This is the same intrinsics gap Story 4.1 deferred (freezing JS intrinsics), and it has no owning Story yet (review pass 2, blind layer).
    location: >-
      packages/assert/src/declarations/AssertionCounter.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Ported Tests and Xaravel Tests have no declaration API. Nothing counts assertions, so a test that asserts nothing passes, and the harness (Epic 5) has no assertion-kind multiset for the FR-113 floor (FR-2, FR-113, FR-115).

**Approach:** Add `portedTest`, `xaravelTest` and `recordAssertion` to `@xaravel/assert`. Each declared test runs inside an assertion-counting context, reports `{id, type, consequence, assertions}` to a global reporter protocol when it finishes, and (for `portedTest`) fails on zero assertions and runs inside a `test` frame when the runtime's scope protocol exists. The grader-side protocols get an owner through ESC-4.2-1.

## Boundaries & Constraints

**Always:**
- The grader imports no graded package; only relative, `node:` and `bun:` imports (XT-assert-3).
- The scope protocol and reporter protocol are read from `globalThis` by `Symbol.for` at test run time, never imported.
- Every new export goes through `src/index.ts`'s freeze loop.
- A test's own error wins over the zero-assertions failure. The report is sent whether the test passes or fails.
- `null` is the only absent value in the report payload (AD-9).

**Never:**
- Change PhpComparison semantics or XT-assert-1/2.
- Count assertions through bun's `expect`.
- Run case lifecycle hooks other than `setUp`/`tearDown` (AD-25's full order belongs to `@xaravel/testing`'s TestCase, Story 57, which runs inside its own `setUp`/`tearDown`).
- Write a reporter, harness or `bunfig.toml` preload (Epic 5).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Keyed dataset | `portedTest('A::t', {dataset: {'one': [1], 'two': [2]}}, fn)` | tests `A::t#one`, `A::t#two`; `fn(1)` / `fn(2)` | none |
| List dataset | `dataset: [[1, 2], [3, 4]]` | tests `A::t#0`, `A::t#1`; args spread | a non-array row is passed as one argument |
| No dataset | `portedTest('A::t', {}, fn)` | one test labelled `A::t` | none |
| Bad dataset | `{}`/`[]`, integer-like key in an object, non-object | declaration throws `TypeError` | no test registered |
| Duplicate label | the same full Test ID declared twice in one process | second declaration throws `Error` naming the ID | FR-2 |
| Bad id | `portedTest('', …)`; `xaravelTest('assert-4', …)` | declaration throws `TypeError` | XT ids match `^XT-[a-z0-9]+(-[a-z0-9]+)*-[1-9][0-9]*$` |
| Empty consequence | `xaravelTest('XT-a-1', '  ', fn)` | declaration throws `TypeError` | AC 4 |
| Zero assertions | portedTest body records none and does not throw | test fails, message contains `zero assertions` | xaravelTest never fails for this |
| Body throws | portedTest body throws after 0 assertions | the body's error is the failure | report still sent |
| Out of test | `recordAssertion('assertTrue')` outside any declared test | no-op | none |
| Bad kind | `recordAssertion('')` or non-identifier | throws `TypeError` | kind matches `^[A-Za-z_][A-Za-z0-9_]*$` |

</intent-contract>

## Code Map

- `packages/assert/src/index.ts` -- named exports + freeze loop (exports and their `prototype`). Add the three new functions to the loop and the export list.
- `packages/assert/src/comparison/PhpComparison.ts` -- unchanged; style reference (header comment citing the Story/ADs, `Symbol.for` brands at the top).
- `packages/assert/tests/xaravel/comparison.test.ts:207-260` -- XT-assert-3 pins the exact export list `["phpLooseEquals", "phpStrictEquals"]`; extend it to the five names (still exact) so the freeze checks cover the new exports. Its src import scan already allows `node:`/`bun:`.
- `packages/assert/tests/xaravel/` -- XT tests run as plain `bun:test` titled `XT-assert-<n>: …` (as 4.1 does); `xaravelTest` is not used to test itself. Package tsconfig `rootDir: "."`: tests may not import `tools/`.
- `packages/assert/tests/ported/.gitkeep` -- untouched.
- Bun 1.4.3: `bun test ./<file>.fixture.ts` runs a file whose name does not match bun's test glob (so the root `bun test` skips it); `--reporter=junit --reporter-outfile=<path>` writes `<testcase name="…">` with entity-escaped names and `<failure message="…">` (probed 2026-10-18).
- `stories/4.2.md` -- component `assert`, XT-assert-4..7; status kept in step with sprint status.
- `conformance/escalations/ESC-4.1-1.md` -- format reference for ESC-4.2-1 (`test_ids`, `trigger` from `tools/escalations/escalations.ts:85`, `proposed`, `evidence`, body with options); `bun run escalations:check` validates.

## Tasks & Acceptance

**Execution:**
- `packages/assert/src/declarations/AssertionCounter.ts` -- `recordAssertion(kind)` plus internal `runCounted(fn)` returning the kind multiset; per-test state in an `AsyncLocalStorage` from `node:async_hooks`, so concurrent tests do not mix counts -- the counter 4.3–4.6 report into.
- `packages/assert/src/declarations/portedTest.ts` -- `portedTest(id, options, body)` per Design Notes -- AC 1–3.
- `packages/assert/src/declarations/xaravelTest.ts` -- `xaravelTest(id, consequence, fn)` per Design Notes -- AC 3–4.
- `packages/assert/src/index.ts` -- export and freeze `portedTest`, `xaravelTest`, `recordAssertion`.
- `packages/assert/tests/xaravel/fixtures/declarations.fixture.ts` -- a fixture file that installs a fake scope protocol and a reporter that appends JSON lines to `process.env.XT_ASSERT_REPORT_FILE`, then declares portedTests (keyed + list dataset, case class, zero assertions, body throws, with assertions) and an xaravelTest with no assertions.
- `packages/assert/tests/xaravel/declarations.test.ts` -- XT-assert-4..7, one per AC in order. 4–6 spawn `bun test ./…/declarations.fixture.ts --reporter=junit` from the repo root and read the junit names/failures and the report file; 7 checks declaration-time throws directly (plus bad ids, datasets, duplicates from the matrix). When the child leaves no junit, report or probe file, fail with the child's stdout/stderr, not a bare `ENOENT`.
- Fixture and test additions (amendment 1): a `Map` dataset with mixed int and string keys (`#0`, `#1`, `#nested-01`); `Point`'s constructor calls the frame check; `setUp`, the body and `tearDown` append `{id, phase}` lines to a phase file, and XT-assert-4 asserts the exact phases for every case-backed test, including `tearDown` after a throwing body and after a throwing `setUp`; a test whose body and `tearDown` both throw fails with the body's message; a test whose body throws and whose reporter refuses it fails with the body's message; a reporter returning a rejected promise fails its test; XT-assert-7 rejects a sparse list and a duplicate `Map` key (`1` and `"1"`).
- Fixture and test additions (amendment 2): the fixture declares one Test ID twice from a loop and twice through a local helper function, and XT-assert-7 asserts both second declarations throw the FR-2 `Error` and registered nothing; `Point.setUp` and `tearDown` are `async` and `await` before checking the frame, so an async hook finishes before the body and the frame survives the `await`; every test that spawns a child `bun test` passes an explicit timeout of 60 000 ms to `test()`.
- ESC-4.2-1 (amendment 2): add `XT-assert-5` and `XT-assert-7` to `test_ids` (items 5 and 6 govern them); make `proposed` state items 4–8 as open questions with a proposed answer each, matching the body; item 3 also asks how Story 57's TestCase learns its name and dataset (PHPUnit's `name()`, `dataName()`, `providedData()`), proposing that a later Story extend the `case` construction contract; (8) `--rerun-each` is unsupported, so the harness reruns in a fresh process; (9) the grader keeps its own `AsyncLocalStorage` for counting, because it may not import `@xaravel/runtime/scope` (AD-15 isolation); propose reading AD-5's "only framework `AsyncLocalStorage`" as covering graded packages only.
- `packages/assert/tests/xaravel/comparison.test.ts` -- XT-assert-3 export list becomes the five names.
- `conformance/escalations/ESC-4.2-1.md` -- `trigger: contract`, `test_ids: [XT-assert-4, XT-assert-6]`: the reporter protocol (Story 5.3 must consume it), the scope call shape (Story 9.1 must install it), and `case` running only `setUp`/`tearDown` (Story 57's TestCase must fit). Proposed: adopt as written here. Exists from attempt 1; edit in place and add (amendment 1): (4) the installers (Story 5.3's preload, Story 9.1) define both globals non-writable and non-configurable, so code under test cannot replace or silence them (AD-15); (5) `recordAssertion` is public only so 4.3–4.6 and `@xaravel/mockery` can count, and a Ported Test that calls it directly fakes an assertion: ask that Story 6.2's lint ban it under `tests/ported`; (6) upstream tests marked `@doesNotPerformAssertions` / `expectNotToPerformAssertions()` would fail FR-113's "zero assertions" rule as written: ask who decides (a DIV clause, or an `expectNotToPerformAssertions` TestCase method in Story 4.4 that records an explicit kind); (7) `xaravelTest` opens no scope frame, which Story 9.1's Xaravel Tests must accept or change.
- `stories/4.2.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml` -- status.

**Acceptance Criteria:**
- Given the fixture with a keyed and a list dataset and `case: Point`, when it runs under `bun test`, then the junit names are exactly the full Test IDs (`<id>#<key>`, `<id>#<index>`, bare `<id>` without dataset), `this instanceof Point` holds in body, `setUp` and `tearDown`, and with the fake protocol installed the body runs inside the callback of `run('test', …)` (the fake records the frame as active during `setUp`, body and `tearDown`); with no protocol the same tests pass.
- Given a portedTest that records no assertion, when it finishes, then its junit failure message contains `zero assertions`, while a throwing body fails with its own message and an assertion-free xaravelTest passes.
- Given the fixture's tests, when each finishes, then the report file holds one line per test with `type`, `id` (full Test ID), `consequence` (`null` for ported) and `assertions` equal to the kinds recorded (e.g. `{"assertSame":2,"assertTrue":1}`, keys sorted), including failing tests.
- Given `xaravelTest('XT-assert-99', '', fn)` or `'   '`, when declared, then it throws `TypeError` before any test is registered.

## Spec Change Log

### 2026-10-18 — Amendment 1 (review pass 1, bad_spec)
- **Trigger:** (a) the dataset forms cannot express PHPUnit providers that mix int and named keys: two Inventory groups (`ValidationValidatorTest::testExcludeIf`, `…testExcludeIfWhenValidationFails`: `#0`..`#6`, then `#nested-01`..) cannot get their real Test IDs; (b) the process-wide duplicate set makes `bun test --rerun-each 2` fail on the second evaluation (probed); (c) the run order put `setUp` outside the `try`, so a failing `setUp` skipped `tearDown`, and a throwing `tearDown` replaced the body's error, unlike PHPUnit's `runBare`.
- **Amended:** Design Notes (new "Dataset forms" and "Duplicate Test IDs"; "Run order" and "Reporter protocol" rewritten); Tasks (ESC-4.2-1 items 4–7, fixture and test additions).
- **Known-bad state avoided:** wrong Test IDs for mixed-key providers; every rerun failing at load; leaked case state after a failing `setUp`; a teardown error masking the real failure.
- **KEEP:** everything else from attempt 1 (saved at `/tmp/xt42-attempt-1.patch`; reuse its code and tests): the AsyncLocalStorage counter and `runCounted` that never rejects; frozen reports with sorted kinds; `registerTests` registering nothing when any ID collides; the `datasetRows` validation; labels; the xaravelTest id regex and blank-consequence check; the fixture's fake scope protocol and JSONL reporter, the env switches, and running the fixture with and without the scope protocol; the junit parsing; the exact expected lists in XT-assert-4..7; XT-assert-3's five-name export list; ESC-4.2-1 items 1–3 as written.

### 2026-10-18 — Amendment 2 (review pass 2, bad_spec)
- **Trigger:** amendment 1's call-site rule lets a loop or a shared helper declare one full Test ID twice in one evaluation (reproduced by the verification-gap layer: `4 pass, 0 fail`, no FR-2 error), and it contradicts the intent's matrix row "the same full Test ID declared twice in one process: second declaration throws".
- **Amended:** Design Notes "Duplicate Test IDs" (process-wide set, no call site; `--rerun-each` unsupported); Tasks (rerun fixture dropped; loop and helper duplicate probes; async hooks; explicit child-run timeouts; ESC-4.2-1 items 8–9, `test_ids`, consistent `proposed`, item 3 name/data question).
- **Known-bad state avoided:** silent duplicate Test IDs from loops and helpers; a duplicate check that depends on bun's stack format.
- **KEEP:** everything in attempt 2 (`/tmp/xt42-attempt-2.patch`; reuse it) except the call-site logic in `Declarations.ts` and `rerun.fixture.ts`: the runBare lifecycle with first-error-wins, the `Map` dataset form, hole rejection, the awaited reporter, the phase file written through the reporter, every fixture case and expected list in XT-assert-4..7, the child-output diagnostics, XT-assert-3's five names, and ESC-4.2-1 items 1–7 as attempt 2 wrote them (now edited, not rewritten).

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 31 findings — high 0, medium 6, low 17, false 4, maybe-false 0 (the intent-alignment layer filed a descriptive report with no defect claims: AC 1, 2 and 4 are tested at the bun test surface; AC 3's reporter is the producer side of a protocol Epic 5 has not built, which ESC-4.2-1 records)
- findings:
  - `[medium]` `[patch]` (verification-gap) nothing checks that `tearDown` ran — carried into amendment 1: phase file asserted in XT-assert-4.
  - `[low]` `[patch]` (verification-gap) case construction inside the frame unchecked — carried: `Point` constructor calls the frame check.
  - `[low]` `[patch]` (verification-gap) body error winning over reporter error untested — carried: fixture test with both.
  - `[low]` `[defer]` (verification-gap) concurrent tests never mixing counts is untested — nothing runs declared tests concurrently yet; deferred.
  - `[false]` `[reject]` (verification-gap) `this` is `undefined` without `case`, against AD-9 — AD-9 forbids returning `undefined`; a missing `this` binding is not a returned value, and the spec chooses it.
  - `[low]` `[reject]` (verification-gap) `Object.isFrozen(report)` in the fixture is shallow — `runCounted` freezes `assertions` itself; a test-only gap nobody meets.
  - `[low]` `[reject]` (edge-case) `recordAssertion('__proto__')` sets the prototype — no PHPUnit or Mockery kind is named `__proto__`; the fix is a new guard.
  - `[low]` `[reject]` (edge-case) a bun timeout sends no report — the junit failure still records the test; the harness treats a missing report as a failure; the fix needs new timeout plumbing.
  - `[low]` `[patch]` (edge-case) an async reporter's rejected promise is unhandled — carried: the reporter's return value is awaited.
  - `[low]` `[reject]` (edge-case) `test()` throwing mid-registration leaves IDs declared — only when declaring inside a running test, which bun itself rejects; a new guard.
  - `[medium]` `[bad_spec]` (edge-case) `--rerun-each` re-evaluation fails every rerun with duplicate errors — confirmed by probe (`1 fail 1 error`); amendment 1 keys IDs by call site.
  - `[medium]` `[bad_spec]` (edge-case) a throwing `setUp` skips `tearDown` — the spec's run order caused it; amendment 1 follows `runBare`.
  - `[medium]` `[bad_spec]` (edge-case) a throwing `tearDown` replaces the body's error — same root cause as the previous row; amendment 1: the first error wins.
  - `[low]` `[reject]` (edge-case) a `scope.run` that never awaits `inner` — only a broken runtime protocol can do it, and the body then fails loudly; a new guard.
  - `[false]` `[reject]` (edge-case) a non-constructible `case` passes the declaration check — every test then fails loudly with the construction error, which is correct behaviour.
  - `[low]` `[patch]` (edge-case) a sparse list dataset silently drops its holes — carried: holes throw `TypeError` (a direct correction).
  - `[low]` `[reject]` (edge-case) a Test ID with surrounding whitespace or `#` — the FR-2 Inventory check (CI) rejects an ID that is not in the Inventory; a new validation rule.
  - `[low]` `[reject]` (edge-case) a consequence with newlines or padding — cosmetic in a label; no consumer parses it yet.
  - `[medium]` `[patch]` (edge-case) code under test can replace the reporter or scope global — the grader cannot own another package's global; carried as ESC-4.2-1 item 4 (installers define them non-writable).
  - `[low]` `[patch]` (edge-case) a missing junit/report file hides the child's output — carried: fail with the child's stdout/stderr.
  - `[medium]` `[bad_spec]` (blind) `setUp`/`tearDown` error handling — same entry as the edge-case lifecycle rows.
  - `[medium]` `[patch]` (blind) no way to port a `@doesNotPerformAssertions` test — FR-113 and the AC say zero assertions fail, so the rule is the Maintainer's; carried as ESC-4.2-1 item 6.
  - `[low]` `[patch]` (blind) `recordAssertion` lets a test fake an assertion — carried as ESC-4.2-1 item 5 (lint ban under `tests/ported`).
  - `[medium]` `[patch]` (blind) code under test can replace the hooks — same entry as the edge-case reporter-global row (ESC item 4).
  - `[low]` `[reject]` (blind) the report lacks outcome and label — the harness takes the outcome from bun's own result and joins on `id`; ESC-4.2-1 lets Story 5.3 ask for more.
  - `[medium]` `[bad_spec]` (blind) datasets cannot express mixed or non-sequential int keys — confirmed in the Inventory (2 mixed groups, 0 gapped); amendment 1 adds the `Map` form.
  - `[low]` `[reject]` (blind) `portedTest` barely validates the Test ID — same as the edge-case whitespace row; CI's Inventory check owns it.
  - `[low]` `[defer]` (blind) concurrency untested, and late assertions after a test ends go uncounted — same entry as the verification-gap concurrency row.
  - `[low]` `[patch]` (blind) `runFixture` failures are hard to debug (bare `ENOENT`, a narrow junit regex) — carried: the child output on a missing file; the regex matches what bun 1.4.3 writes (probed).
  - `[low]` `[patch]` (blind) duplicate checks are per process only, and `xaravelTest` opens no frame — cross-process FR-2 is CI's check; the frame choice is carried as ESC-4.2-1 item 7.
  - `[false]` `[reject]` (blind) the spec's `in-review` differs from sprint status `review` — the spec and sprint-status use separate status vocabularies by design.

### 2026-10-18 — Review pass
- verdicts: 27 findings — high 0, medium 3, low 19, false 5, maybe-false 0 (the intent-alignment layer again filed a descriptive report; its one concrete divergence, a second `AsyncLocalStorage` against AD-5's "only framework `AsyncLocalStorage`", is triaged below)
- findings:
  - `[medium]` `[bad_spec]` (verification-gap) a loop or helper declaring one Test ID twice from one call site is not rejected — reproduced by the layer; amendment 2 returns to a process-wide set.
  - `[medium]` `[bad_spec]` (verification-gap, other) the same-call-site exemption is a defect, not only untested — same entry; amendment 2.
  - `[medium]` `[bad_spec]` (edge-case) same ID twice from one call site registers silently — same entry; amendment 2.
  - `[low]` `[reject]` (edge-case) `scope.run` resolving early or calling `inner` twice — carried: same claim as pass 1's row; only a broken runtime protocol does it.
  - `[low]` `[reject]` (edge-case) a timed-out test sends no report — carried: same claim as pass 1's row.
  - `[false]` `[reject]` (edge-case) `Error.stackTraceLimit = 0` makes `callSite` null — amendment 2 removes stack inspection, so the path no longer exists.
  - `[low]` `[reject]` (edge-case) an object key like `"99999999999999999999"` is rejected though PHP keeps it a string — no Upstream provider uses such a key; the fix adds a branch.
  - `[low]` `[reject]` (edge-case) junit hex character references (`&#x27;`) are not decoded — bun 1.4.3 writes decimal references (probed: `&#10;`).
  - `[medium]` `[bad_spec]` (edge-case, claim) the matrix says a second declaration in one process throws, the code allows it from the same site — same entry; amendment 2.
  - `[low]` `[reject]` (edge-case, claim) a hung test sends no report — carried: same as the timeout row.
  - `[medium]` `[bad_spec]` (blind) loops and helpers bypass the FR-2 check — same entry; amendment 2.
  - `[medium]` `[bad_spec]` (blind) the matrix row is out of date after amendment 1 — same root cause: amendment 1 broke the intent's row; amendment 2 restores it.
  - `[low]` `[patch]` (blind) ESC-4.2-1 `test_ids` omit XT-assert-5 and XT-assert-7 — carried into amendment 2 (a direct correction).
  - `[low]` `[patch]` (blind) ESC `proposed` reads as settled while the body asks open questions — carried into amendment 2: `proposed` states each item as a question with its proposed answer.
  - `[false]` `[reject]` (blind) `stories/4.2.md` keeps `test_ids: []` — `test_ids` lists Upstream Test IDs; the Story's XT tests are in `xaravel_test_ids`, which already lists XT-assert-4..7.
  - `[medium]` `[patch]` (blind) the case instance never learns its Test ID or dataset row (`name()`, `dataName()`, `providedData()`) — a contract for Story 57, not this Story's AC; carried as an ESC-4.2-1 item 3 question.
  - `[low]` `[reject]` (blind) negative int keys cannot be written as ints, while a `Map` string `"-1"` labels `#-1` — the label is what PHPUnit prints for key -1, so the Test ID comes out right; no Upstream provider needs it.
  - `[low]` `[defer]` (blind) code under test can patch `AsyncLocalStorage.prototype` or bun's `test` — the same intrinsics gap Story 4.1 deferred; deferred.
  - `[low]` `[patch]` (blind) async `setUp`/`tearDown` are never tested — carried: async hooks in the fixture.
  - `[low]` `[patch]` (blind) the child-process tests rely on bun's 5 s default timeout — carried: explicit 60 000 ms timeouts.
  - `[low]` `[patch]` (intent-alignment) a second `AsyncLocalStorage` against AD-5's "only framework `AsyncLocalStorage`" — the grader cannot import the scope module (AD-15), so it is raised, not decided: carried as ESC-4.2-1 item 9.
  - `[false]` `[reject]` (intent-alignment) the "full Test ID" is not checked against the Inventory spelling — checked during triage: the Inventory spells dataset IDs `<id>#<key>` (`…::testExcludeIf#0`, `…#nested-01`).
  - `[low]` `[reject]` (intent-alignment) the scope protocol is tested only against a fake — the real one is Story 9.1's; ESC-4.2-1 item 2 names the shape it must install.
  - `[low]` `[reject]` (intent-alignment) AC 3's reporter has no consumer yet — Epic 5 builds it; ESC-4.2-1 item 1 hands it the payload.
  - `[low]` `[reject]` (intent-alignment) no real assertion feeds the counter — Stories 4.3–4.6 add them; `recordAssertion` is their entry point.
  - `[false]` `[reject]` (intent-alignment) XT-assert-4..7 are not written with `xaravelTest` — epics.md line 1408 defers the move to Epic 5 (Story 5.9).
  - `[low]` `[reject]` (intent-alignment) FR-2 Inventory membership is not checked at declaration — CI's check (Epic 5) owns it.

### 2026-10-18 — Review pass
- verdicts: 19 findings — high 0, medium 0, low 16, false 3, maybe-false 0 (the intent-alignment layer filed a descriptive report repeating pass 2's divergences, all already triaged there; no new defect claims)
- findings:
  - `[low]` `[patch]` (edge-case) the child `Bun.spawnSync` has no timeout, so a hung fixture blocks the event loop past the test timeout — patched: `timeout: 50_000`, failing with the child's output on `exitedDueToTimeout`.
  - `[low]` `[reject]` (edge-case) a plain-object key `""` labels `<id>#` while the `Map` form rejects `""` — PHP allows the empty key and the label is what the Inventory would hold; no Upstream provider uses it.
  - `[low]` `[reject]` (edge-case) symbol keys in a plain-object dataset are dropped — a port never writes symbol keys; the fix adds a guard.
  - `[low]` `[patch]` (verification-gap) the no-reporter path is never run — patched: `XT_ASSERT_NO_REPORTER=1` run compared with the reporter run.
  - `[low]` `[patch]` (verification-gap) a case class without `setUp`/`tearDown` is never exercised — patched: `Plain` case, `testPlainCase`.
  - `[low]` `[patch]` (verification-gap) reporter error before zero-assertions precedence is untested for Ported Tests — patched: `testNothingAndReporterRefuses`.
  - `[low]` `[patch]` (blind) one instance across `setUp`, body and `tearDown` is unchecked — patched: per-instance token in the phase lines; rows get distinct tokens.
  - `[low]` `[reject]` (blind) a throwing `case` constructor is untested — the error propagates as the test's failure; unlikely in practice.
  - `[low]` `[patch]` (blind) assertions recorded in `setUp`/`tearDown` are untested — patched: `testSetUpAsserts`.
  - `[low]` `[reject]` (blind) `this` is typed `object` when `case` is omitted — the fix needs overloads; a body that uses `this` without a case fails loudly at run time.
  - `[low]` `[patch]` (blind) ESC item 4's non-writable globals would break the fixture's fake globals — patched: ESC item 4 has installers skip when a child run opts out.
  - `[false]` `[reject]` (blind) nothing stops the fixture from being collected — bun's test glob does not match `*.fixture.ts`, and if it were collected its deliberate failures would fail the root run loudly.
  - `[low]` `[patch]` (blind) ESC body unnumbered, item 6 without a proposed answer — patched: numbered items 1–10 with an answer each.
  - `[low]` `[patch]` (blind) the duplicate set is per module copy — patched: ESC item 10 (load the grader from one path per process).
  - `[false]` `[reject]` (blind) the spec cites `/tmp` patches and repeats triage headings — the fix edits this build's spec.
  - `[low]` `[reject]` (blind) the junit regex is narrow — carried: same claim as pass 1's row (matches what bun 1.4.3 writes).
  - `[low]` `[patch]` (blind) XT-assert-7 checks probes only with the scope protocol — patched: both runs.
  - `[low]` `[patch]` (blind) the zero-assertions message is checked by substring only — patched: exact text.
  - `[false]` `[reject]` (blind) `Declarations.ts` ends with an extra blank line — cosmetic; removed anyway in the patch round, so no defect remains.

## Design Notes

**Labels.** Ported: `<id>` or `<id>#<key>`; object keys verbatim (a Pest port writes the key `dataset "prompts/list"`), list keys as the index. Xaravel: `<id>: <consequence>`, keeping today's `XT-…: …` title form. The bare Test ID label is what the harness matches; Variant comes from `XARAVEL_VARIANT`, never the label.

**Dataset forms (amendment 1).** An `Array` (labels `#<index>`; holes are rejected with `TypeError`, never silently dropped), a plain object (string keys verbatim; integer-like keys rejected, as JS reorders them), or a `Map` whose keys are safe non-negative integers or non-empty strings, labelled `#<key>` in insertion order. The `Map` form carries PHPUnit providers that mix int and named keys, as `ValidationValidatorTest::testExcludeIf` does (`#0`..`#6`, then `#nested-01`..). An integer-like string `Map` key is treated as the int it names, so `"1"` and `1` collide (duplicate → `TypeError`). An empty `Map` throws.

**Run order (portedTest, per test; amendment 1).** `runCounted` → if `globalThis[Symbol.for('xaravel.scope.run')]` is a function, `await run('test', inner)` (mirrors AD-5 `runInFrame(kind, fn)`), else `await inner()`. `inner`, PHPUnit `runBare` order: `const self = options.case ? new options.case() : undefined` (inside the frame); then `try { await self.setUp?.(); await body.apply(self, args) } catch (e) { first = e }`; then `tearDown` always runs when `self` has one, even after a failing `setUp`, and its error is thrown only when nothing threw before (the first error wins). After `runCounted`, report; then throw the body/lifecycle error, else the reporter's error, else (portedTest only, count 0) `Error('<label>: Ported Test executed zero assertions (FR-113)')`.

**Duplicate Test IDs (amendment 2, replaces amendment 1's call-site rule).** One process-wide set of full Test IDs, as the intent's matrix row says: any second declaration of an ID in the process throws the FR-2 `Error`, whatever its call site (a loop, a shared helper or another file). No call-site or stack inspection. `bun test --rerun-each` is therefore not supported for declared tests: it re-evaluates the file in the same process (probed: `1 fail 1 error`). The harness reruns a test in a fresh process instead (Story 5.8); ESC-4.2-1 records this for Story 5.3/5.8. No rerun fixture and no `--rerun-each` check.

**Reporter protocol.** `globalThis[Symbol.for('xaravel.harness.report')]`, if a function, is called once per finished test with a frozen `{ type: 'ported' | 'xaravel', id: string, consequence: string | null, assertions: Record<string, number> }` (keys sorted). Called after the run, so failing tests report too; its return value is awaited, so a rejected promise fails the test like a throw. A reporter that throws fails that test, but a body or lifecycle error wins. Absent → nothing is sent.

**Counter.** `recordAssertion` increments the current store's map; nested `runCounted` is not used. xaravelTest also counts (for 5.9's run) but never fails on zero.

## Verification

**Commands:**
- `bun test packages/assert` -- expected: XT-assert-2..7 pass (XT-assert-1 as on main).
- `bun run typecheck`, `bun run lint`, `bun run graph:check`, `bun run escalations:check`, `bun run ownership:check` -- expected: clean.
- `bun test` (root) -- expected: the fixture file is not collected; no new failures.

## Auto Run Result

Status: done

**Summary.** `@xaravel/assert` now declares tests.
- `portedTest(id, { case, dataset }, async function () {…})` registers one bun test per dataset row, labelled with its full Test ID (`<id>`, `<id>#<key>`, `<id>#<index>`; list, plain object or `Map` datasets).
- The body runs with `this` a fresh `case` instance, in PHPUnit `runBare` order (`setUp`, body, then `tearDown` always; the first error wins). When `globalThis[Symbol.for('xaravel.scope.run')]` exists, everything runs inside `run('test', …)`.
- `xaravelTest(id, consequence, fn)` checks the `XT-<c>-<n>` id and rejects a blank consequence at declaration.
- `recordAssertion(kind)` counts per test in an `AsyncLocalStorage`. Every finished test, passing or failing, sends a frozen `{type, id, consequence, assertions}` (kinds sorted) to `globalThis[Symbol.for('xaravel.harness.report')]` when one is installed. A Ported Test with zero assertions fails with `<label>: Ported Test executed zero assertions (FR-113)`.
- A full Test ID declared twice in one process throws the FR-2 `Error`.
- ESC-4.2-1 hands these protocols to their consumers (Stories 5.3, 9.1, 57, 6.2, 4.4) for a ruling.

**Files.**
- `packages/assert/src/declarations/AssertionCounter.ts` -- `recordAssertion`, internal `runCounted`.
- `packages/assert/src/declarations/Declarations.ts` -- registration, duplicate check, reporter protocol.
- `packages/assert/src/declarations/portedTest.ts` -- `portedTest`, dataset forms, lifecycle, scope frame.
- `packages/assert/src/declarations/xaravelTest.ts` -- `xaravelTest`.
- `packages/assert/src/index.ts` -- exports and freezes the three new functions.
- `packages/assert/tests/xaravel/declarations.test.ts` -- XT-assert-4..7 (child `bun test` runs in scope, no-scope and no-reporter modes).
- `packages/assert/tests/xaravel/fixtures/declarations.fixture.ts` -- the fixture those runs execute.
- `packages/assert/tests/xaravel/comparison.test.ts` -- XT-assert-3's exact export list now has five names.
- `conformance/escalations/ESC-4.2-1.md` -- the grader-side protocol contracts and open questions (items 1–10).
- `stories/4.2.md`, `sprint-status.yaml` -- status.

**Review.** Three passes, with two bad_spec loopbacks (amendments 1 and 2).
- Pass 1: 31 findings. The bad_spec entries were mixed-key datasets, `--rerun-each`, and `setUp`/`tearDown` error handling.
- Pass 2: 27 findings. The bad_spec was amendment 1's call-site duplicate exemption, which let loops and helpers through and contradicted the intent's matrix.
- Pass 3: 19 findings. 13 low patched; the rest rejected with reasons in the Review Triage Log.
- Deferred, in frontmatter: concurrent-count isolation is untested; JS intrinsics (`AsyncLocalStorage.prototype`, bun `test`) are not tamper-proof.
- Patched in pass 3 by verdict: high 0, medium 0, low 13.

**Follow-up review recommended: false.** Pass 3 patched only low entries, and amendment 2's code was reviewed in pass 3.

**Verification.**
- `bun test packages/assert`: 7 pass, 0 fail.
- `bun test` (root): 135 pass, 0 fail. Neither fixture is collected.
- `bun run typecheck`, `lint`, `graph:check`, `escalations:check` (10 escalations), and `ownership:check`: clean.

**Residual risks.**
- ESC-4.2-1 is open. Until it is ruled on, Story 5.3 (reporter), 9.1 (scope call shape), 57 (case construction) and 4.4 (`expectNotToPerformAssertions`) have no binding contract.
- `bun test --rerun-each` is unsupported for declared tests.
- Real assertions start feeding the counter only from Story 4.3.
