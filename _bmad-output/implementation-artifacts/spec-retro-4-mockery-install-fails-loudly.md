---
title: 'Retro 4 item 4: Mockery global install fails loudly when a global is already taken'
type: 'bugfix'
created: '2026-10-18'
status: 'done'
baseline_revision: 'fb20226c0e7408433c0cd041871461d25254aad9'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      portedTest and TestCase call any function in Symbol.for('xaravel.mockery.run') or 'xaravel.mockery.mock' even when @xaravel/mockery was never imported or its rejected import was caught.
    evidence: |-
      packages/assert/src/declarations/portedTest.ts:39 and packages/assert/src/Framework/TestCase.ts:25 read the globals without checking their origin; this change makes only Mockery's own load fail loudly. Tamper resistance of the globals is ESC-4.2-1 item 4 (Stories 5.3, 9.1), unruled.
    location: >-
      packages/assert/src/declarations/portedTest.ts:39
    severity: low
---

<intent-contract>

## Intent

**Problem:** `install()` in `packages/mockery/src/Mockery.ts` returns silently when `globalThis[Symbol.for('xaravel.mockery.mock')]` or `Symbol.for('xaravel.mockery.run')` already has a property. Code loaded before Mockery that defines `xaravel.mockery.run` as `fn => fn()` turns off every Mockery verification with no error, because `portedTest`/`xaravelTest` call whatever function sits there. Epic 4 retrospective finding R4, action item `epic-4-retro-item-4-mockery-install-fails-loudly`.

**Approach:** Before defining either global, Mockery checks both slots. A slot that is absent is installed as now (non-writable, non-configurable, non-enumerable, frozen function). A slot that already holds the exact value this module would install is left as is (a no-op). Any other existing property, on either slot, makes the module's evaluation throw `LogicException` naming the symbol, and neither global is installed by that evaluation.

## Boundaries & Constraints

**Always:** Check both slots before defining either, so a conflict on `run` does not leave a half-installed `mock`. The error is Mockery's `LogicException` (`packages/mockery/src/php/LogicException.ts`), thrown at module load so `import '@xaravel/mockery'` rejects. Its message names the taken symbol (`Symbol.for('xaravel.mockery.run')` or `…mock`) and says the global was already defined by other code. Update the header comment of `Mockery.ts` and of `packages/mockery/src/index.ts` if it describes the skip.

**Never:** Add an environment opt-out switch (ESC-4.2-1 item 4 proposes one; it is unruled and belongs to Stories 5.3/9.1). Touch `recordAssertion` (deferred to Story 6.2 by the retro). Change `@xaravel/assert`, Oracle requests, fixtures or `conformance/**`. Remove any assertion except the old "already defined is left alone" expectation, which this item reverses by design; replace it with the stronger throw expectation. Edit anything outside `packages/mockery/**`, this spec and the retro document's R4 status line.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| R4 repro | child process sets `globalThis[Symbol.for('xaravel.mockery.run')] = async fn => fn()`, then imports `packages/mockery/src/index.ts` | import rejects; the fake `run` is still the value; `xaravel.mockery.mock` is not defined | `LogicException`, message names `xaravel.mockery.run` |
| `mock` taken | child sets only `xaravel.mockery.mock` to a function, then imports Mockery | import rejects; `xaravel.mockery.run` is not defined | `LogicException`, message names `xaravel.mockery.mock` |
| Non-function value | child defines `xaravel.mockery.run` as `undefined` via `defineProperty` | import rejects (a present property counts, whatever its value) | `LogicException` |
| Clean load | nothing pre-defined | both globals installed non-writable, non-configurable, function-valued (existing assertions) | none |

</intent-contract>

## Code Map

- `packages/mockery/src/Mockery.ts:193-201` -- `install(key, value)` and its two calls; replace with a check-both-then-define install.
- `packages/mockery/src/Mockery.ts:1-23` -- header comment (Test finish paragraph) to mention the loud failure.
- `packages/mockery/src/index.ts:1-10` -- header comment describing what loading installs.
- `packages/mockery/src/php/LogicException.ts` -- the exception class to throw (already imported in `Mockery.ts`).
- `packages/mockery/tests/xaravel/mockery.test.ts:141-155` -- fixture-free test; lines 152-155 spawn a child with `bun --eval` that pre-defines `run` and expects `kept`. Reverse that row to expect the throw, and add the matrix rows with the same `Bun.spawnSync` pattern and `SPAWN_TIMEOUT`.
- Read-only: `packages/assert/src/declarations/portedTest.ts:39` and `packages/assert/src/Framework/TestCase.ts:25` read the globals; `packages/assert/tests/xaravel/fixtures/mock.fixture.ts` fakes only `xaravel.scope.run` and `xaravel.harness.report`, never a Mockery global, so it is unaffected. `tools/mockery-coverage/coverage.ts:374` reads `run` after loading Mockery.

## Tasks & Acceptance

**Execution:**
- `packages/mockery/src/Mockery.ts` -- check both slots, throw `LogicException` on a foreign property, then define both; update header comment -- fixes R4.
- `packages/mockery/src/index.ts` -- header comment wording if it describes skipping.
- `packages/mockery/tests/xaravel/mockery.test.ts` -- replace the "left alone" child run with child runs for each matrix row, asserting exit code, the error class name and message, and the state of both globals after the failed import.

**Acceptance Criteria:**
- Given the R4 repro child, when it runs on the baseline source, then it prints that the fake was kept and exits 0; with the fix it reports `LogicException` naming `xaravel.mockery.run` (shown by running the child against a temp copy of the baseline, never by overwriting tracked files).
- Given the change, when `bun test`, `bun run typecheck`, `bun run lint` and `bun run mockery:coverage` run, then they pass.

## Spec Change Log

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 19 findings — high 0, medium 0, low 15, false 4, maybe-false 0
- findings:
  - `[low]` `[patch]` (edge) A second evaluation or copy of Mockery always throws, since `mockGlobal`/`runGlobal` are new per evaluation — true; a second copy keeps separate containers, so the first copy's run protocol could not verify its mocks and failing loudly is the right outcome. Patched: the message now names "another copy of @xaravel/mockery" and the comments say the own-value check is per evaluation.
  - `[low]` `[patch]` (edge) The own-value branch is unreachable in practice — true; kept to match the intent contract, comments now describe it as per evaluation (same patch as above).
  - `[low]` `[reject]` (edge) A non-extensible `globalThis` gives a raw TypeError and might half-install — no code in the repo freezes or seals `globalThis`; a guard adds a branch for an undemonstrated state.
  - `[low]` `[patch]` (edge) `JSON.parse` of a crashed child's stdout hides its exit code and stderr — patched: parse only on exit 0 with non-empty stdout, else keep the raw text.
  - `[low]` `[reject]` (edge) No test for the own-value no-op path — the path cannot be reached by any load, so a test would need to reach into module internals.
  - `[low]` `[patch]` (edge, claim) Comments imply re-loading Mockery is safe — same root cause and patch as the first row.
  - `[low]` `[patch]` (intent) Reading B (Mockery's own re-evaluation is a no-op) diverges: a re-evaluation throws and blames "other code" — same root cause and patch as the first row; the intent contract fixes reading A ("the exact value this module would install").
  - `[low]` `[patch]` (intent) Accessor properties are rejected but untested — patched: a child row defines a getter on `run` and expects `LogicException`, `mock` not installed.
  - `[low]` `[patch]` (verification-gap, other) The own-value branch and its comment describe unobservable behaviour — same root cause and patch as the first row.
  - `[low]` `[patch]` (blind) Unreachable own-value branch, untested — same root cause and patch as the first row.
  - `[low]` `[patch]` (blind) A second Mockery copy throws a misleading "other code" message — same root cause and patch as the first row.
  - `[low]` `[patch]` (blind) Accessor branch untested — same patch as the intent accessor row.
  - `[low]` `[reject]` (blind) No case with both slots taken — the throw names the first slot in list order; which one is named is not part of the contract, and both are left untouched by construction (nothing is defined before the check loop ends).
  - `[low]` `[patch]` (blind) A crashed child hides its diagnostics — same patch as the edge JSON.parse row.
  - `[false]` `[reject]` (blind) The failure cases do not prove the existing property is unchanged — `installAll` defines only slots whose descriptor was `undefined`, and the throw happens before any define, so an existing slot cannot be touched; the identity checks plus `Object.hasOwn` on the other slot show nothing was installed.
  - `[false]` `[reject]` (blind) The clean-load row gets no new check — the existing in-process assertions (`mockery.test.ts:142-150`) check that a clean load installs both globals non-writable and non-configurable, which is the row.
  - `[low]` `[defer]` (blind) `portedTest`/`TestCase` still call any function in `xaravel.mockery.run` when Mockery is never imported or its import rejection is caught — pre-existing in `@xaravel/assert`, which the intent excludes; ESC-4.2-1 item 4 (Stories 5.3, 9.1) owns tamper resistance of the globals. Deferred.
  - `[false]` `[reject]` (blind) The diff omits the spec and retro changes — the review diff is `packages/**` by design; the spec and retro status line are reviewed with it at finalization.
  - `[false]` `[reject]` (blind) No evidence of the baseline repro — the implementer ran the R4 child in a temporary worktree at the baseline: it printed `kept: true` and exited 0; recorded under Auto Run Result.

## Verification

**Commands:**
- `bun test packages/mockery` -- expected: all pass.
- `bun test` -- expected: all pass.
- `bun run typecheck` -- expected: exit 0.
- `bun run lint` -- expected: no errors.
- `bun run mockery:coverage` -- expected: exit 0.

## Auto Run Result

Status: done

**Summary:** Loading `@xaravel/mockery` now checks both global slots (`Symbol.for('xaravel.mockery.mock')`, `Symbol.for('xaravel.mockery.run')`) before defining either. A property that is not this evaluation's own value, of any kind or value, makes the load throw `LogicException` naming the symbol, and neither global is installed. A planted `run` can no longer silently turn off Mockery verification (retro finding R4).

**Files changed:**
- `packages/mockery/src/Mockery.ts` -- `installAll` replaces the skipping `install`; header comment describes the loud failure and the second-copy case.
- `packages/mockery/src/index.ts` -- header comment.
- `packages/mockery/tests/xaravel/mockery.test.ts` -- the "left alone" child run is replaced by four child runs: R4 repro, `mock` taken, `undefined`-valued `run`, getter on `run`; each checks the error name and message and both slots afterwards.
- `_bmad-output/implementation-artifacts/epic-4-retro-2026-10-18.md` -- R4 status line.

**Review:** 19 findings (high 0, medium 0, low 15, false 4). Patched 11 low rows (3 root causes): the message and comments now cover a second copy of the module, a crashed child keeps its diagnostics, and the accessor branch has a test. Deferred 1 low: `@xaravel/assert` still calls any function in the slot when Mockery is never loaded (ESC-4.2-1 item 4). Rejected: 3 low and 4 false, with reasons in the triage log.

**Follow-up review:** not recommended. Only low entries were patched (11 low, 0 medium, 0 high).

**Verification:** `bun test` 154 pass / 0 fail; `bun test packages/mockery` 10 pass; `bun run typecheck` exit 0; `bun run lint` exit 0; `bun run mockery:coverage` exit 0. In a temporary worktree at the baseline, the R4 repro child kept the fake `run` and exited 0; with the fix it gets `LogicException` naming `xaravel.mockery.run`, and `mock` is not installed.

**Residual risk:** a second copy of Mockery in one process now fails at import instead of loading silently. Two copies would keep separate containers, so this is the intended loud failure. Code that plants a fake `run` in a process that never loads Mockery is not caught here (deferred).
