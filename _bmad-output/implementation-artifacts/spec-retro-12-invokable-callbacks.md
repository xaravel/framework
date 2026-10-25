---
title: 'Invokable objects as when / unless callbacks (epic-12-retro-item-1-invokable-callbacks)'
type: 'bugfix'
created: '2026-10-25'
status: 'done'
baseline_revision: '9e53594967e2b8502b8aa3afce19fb46a40003f6'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-retro-2026-10-25.md'
warnings: []
deferred:
  - summary: >-
      Mockery's process-wide generated-class counter makes XT-mockery-11 depend on whether an earlier Xaravel Test in the same bun test process created a mock.
    evidence: |-
      packages/mockery/src/Mockery/Mock.ts numbers generated classes (Mockery_<n>_...) with a process-wide counter; XT-mockery-11 compares an in-process message with a fresh child's. A mock made in conditionable.test.ts (sorted earlier in the harness's single process) turned Mockery_0_XtFoo into Mockery_1_XtFoo and failed it. This item isolated its mock in a child process; packages/mockery is outside its scope.
    location: >-
      packages/mockery/src/Mockery/Mock.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `callableArgument` (`packages/conditionable/src/Traits/Conditionable.ts:87-100`) throws `must be of type ?callable, <class> given` for every non-function, so an object with an `__invoke` method is rejected as a `when` / `unless` callback or default. PHP's `?callable` accepts such an object, and the repo already treats one as callable (`packages/macroable/src/Traits/Macroable.ts:229`). Retro finding L2; no DIV clause covers the gap.

**Approach:** `callableArgument` also accepts an instance of a class (an object PHP sees as an object, not an array, float or class-string) whose `__invoke` is a function, and returns a function that calls `object.__invoke(self, value)`, so `invoke` and the default branch are unchanged. Pin it with XT-conditionable-4 and update `docs/conditionable.md`.

## Boundaries & Constraints

**Always:** Edit only `packages/conditionable/**` and this item's records under `_bmad-output/implementation-artifacts/`. The `__invoke` call keeps the object as `this` (a method call, as Macroable's `callMacro` does). The `?callable` check stays on entry, on every branch, for `callback` and `defaultValue` alike. An invokable callback's result follows the same `result ?? this` rule, including an async `__invoke`'s own Promise (DIV-1.6, unchanged). An invokable object passed as the **condition** is not called: PHP calls `$value` only when it is a `Closure`, so it stays a (truthy) value.

**Never:** Accept a plain object, null-prototype object or PHP array marker (`typeNameOf` → `array`) with an `__invoke` key: a PHP array is callable only as `[object, 'method']`, which is L3's Maintainer question, as are callable strings. Change the error messages for any value rejected today other than invokable instances, any existing assertion, `HigherOrderWhenProxy` (it takes no callable), another package, `conformance/**`, or the item's `action` / `owner` / `epic`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Invokable callback | `logger.when(true, new Invokable())` | `__invoke(logger, true)` runs with `this` the object; its result, or `logger` when it returns `null` | none |
| Invokable default | `logger.unless(true, null, new Invokable())` | `__invoke(logger, true)` runs; result `?? logger` | none |
| Not taken | `logger.when(false, new Invokable())` | `logger`; `__invoke` not called | none |
| Async `__invoke` | `logger.when(true, new AsyncInvokable())` | its own Promise | none |
| Invokable condition | `logger.when(new Invokable(), cb)` | `cb(logger, <the object>)`; `__invoke` not called | none |
| Plain object | `logger.when(true, { __invoke: () => 1 })` | — | PHP `TypeError` `…::when(): Argument #2 ($callback) must be of type ?callable, array given` |
| Instance, `__invoke` not a function | `class { __invoke = 5 }` instance | — | PHP `TypeError` `…, <class> given` |
| Mockery double | a mock of an invokable class, expecting `__invoke` | the mock's `__invoke` is called with `(self, value)` | none |

</intent-contract>

## Code Map

- `packages/conditionable/src/Traits/Conditionable.ts:54-84` -- `typeNameOf`: `array` for arrays, PHP array markers, plain and null-prototype objects; `float` / `string` for float markers and contract tokens; the class name otherwise. Reuse it to tell an instance from a PHP array.
- `packages/conditionable/src/Traits/Conditionable.ts:86-100` -- `callableArgument`, the only change point; header comment lines 4-5 describe the entry check and need the invokable case.
- `packages/conditionable/src/Traits/Conditionable.ts:118-151` -- `invoke` / `conditional` call the returned function as `fn(self, value)`; unchanged.
- `packages/conditionable/src/Traits/Conditionable.ts:25-28` -- `Callback<S, V, R>` type; widen so an `{ __invoke(self, value): R }` object type-checks, with `R` inferred from `__invoke`.
- `packages/macroable/src/Traits/Macroable.ts:224-233` -- read-only precedent (`callMacro`).
- `packages/conditionable/tests/xaravel/conditionable.test.ts` -- XT-conditionable-1..3; append XT-conditionable-4 after XT-conditionable-3, using the file's `Logger`, `assertThrows`, `PhpTypeError` helpers. `@xaravel/mockery` is already a devDependency.
- `packages/conditionable/docs/conditionable.md:47` (the `?callable` bullet) and `:96` (Divergences, "Callable strings") -- docs to update.

## Tasks & Acceptance

**Execution:**
- `packages/conditionable/src/Traits/Conditionable.ts` -- accept an invokable instance in `callableArgument` and wrap it as `(self, value) => object.__invoke(self, value)`; widen `Callback`; update the header and the function's doc comment -- the fix.
- `packages/conditionable/tests/xaravel/conditionable.test.ts` -- XT-conditionable-4 covering every I/O matrix row, for `when` and `unless` -- the item's XT case.
- `packages/conditionable/docs/conditionable.md` -- the `?callable` bullet says an object with `__invoke` is accepted and called as `object.__invoke(instance, value)`; the Divergences bullet keeps callable strings and arrays (including a plain object with an `__invoke` key) as rejected -- docs follow.

**Acceptance Criteria:**
- Given the change, when `bun test packages/conditionable` runs, then XT-conditionable-1..4 pass, with no existing assertion removed or changed.
- Given the change, when `bun run harness` runs in full, then it reports no difference; `bun run typecheck`, `bun run lint`, `bun run api-surface:gate conditionable` and `bun run async-surface --check conditionable` succeed.
- Given the change, when `git diff --stat` is read against the baseline, then only `packages/conditionable/**` and this item's records change.

## Spec Change Log

- Implementation: the "Mockery double" row runs in a child process (`packages/conditionable/tests/xaravel/fixtures/invokable-mock.fixture.ts`, spawned by XT-conditionable-4). Mockery's generated-class counter (`Mock.ts` `mockCounter`) is process-wide, and XT-mockery-11 compares an in-process `Mockery_0_XtFoo` message with a fresh child's; a mock made in conditionable.test.ts (which sorts first in the harness's single `bun test` process) made it `Mockery_1_XtFoo`, so `bun run harness` reported XT-mockery-11 FAIL. `packages/mockery` is out of scope, so the double is isolated instead.

## Review Triage Log

### 2026-10-25 — Review pass
- verdicts: 17 findings — high 0, medium 2, low 9, false 6, maybe-false 0 (the verification-gap layer reported no gaps)
- findings:
  - `[low]` `[patch]` (edge) XT-conditionable-4 spawns a child but sets no per-test timeout — added an explicit `xaravelTest` timeout, as XT-conditionable-3 has.
  - `[low]` `[patch]` (edge) the `Callback` type admits a plain `{ __invoke }` literal that the runtime rejects — TypeScript's structural types cannot tell a class instance from a literal; the `Callback` doc comment now says so and that a plain object (a PHP array) is rejected at run time.
  - `[low]` `[reject]` (edge) `__invoke` is read again at call time, so a condition closure that reassigns it throws a native error — needs a value closure that mutates its own callback; caching adds code for a case no caller writes.
  - `[low]` `[patch]` (blind) XT-conditionable-4 has no timeout — same as the edge row, patched there.
  - `[low]` `[patch]` (blind) the widened type lets through what the runtime rejects — same as the edge row, patched there.
  - `[false]` `[reject]` (blind) an own arrow-function field or getter named `__invoke` is accepted, where PHP needs a method — Xaravel treats an arrow-function own field as a method elsewhere (`docs/conditionable.md`, proxy members: "unless its value is a function (an arrow-function field), which is delegated as a method"), and Macroable's `callMacro` uses the same property check; consistent with the repo's model of a PHP method.
  - `[medium]` `[defer]` (blind) Mockery's process-wide `mockCounter` makes XT-mockery-11 depend on test order — pre-existing in `packages/mockery`, outside this item's scope; recorded in `deferred`.
  - `[false]` `[reject]` (blind) XT-conditionable-4 is not registered in a manifest — Xaravel Tests need no manifest line: the full `bun run harness` ran 383 Xaravel Tests with XT-conditionable-4 among them, and `stories/` is outside the item's scope (XT-runtime-43 from the previous item has none either).
  - `[low]` `[reject]` (blind) Verification omits two AC commands — the fix edits this build's spec; both commands are run in Verification Performed below.
  - `[low]` `[patch]` (blind) untested accept shapes: an unregistered class and an inherited `__invoke` — added one case, an unregistered subclass of `Invokable`. A rejected `defaultValue` with a valid callback is already covered by the `unless(true, null, bare)` / `unless(false, null, new NotInvokable())` rows.
  - `[low]` `[reject]` (blind) Code Map line numbers go stale after the change — the fix edits this build's spec; the lines are against `baseline_revision`.
  - `[low]` `[patch]` (blind) the docs' "same rule as a callback's" is circular and the `value` sentence sits in the callback bullet — reworded to `result ?? instance` and moved the sentence to the closure-value bullet.
  - `[false]` `[reject]` (blind) the plain-object rejection is recorded without a DIV clause — not caused by this change: PHP rejects an array with an `__invoke` key too, so there is no divergence for it; callable strings and `[object, 'method']` arrays are L3, waiting on the Maintainer as `epic-12-retro-item-3-dual-helper-async-edges`.
  - `[false]` `[reject]` (intent) readings A (any object with a function `__invoke`, as Macroable) and B (class instances only) diverge on plain objects — the intent says "as PHP ?callable does", and Xaravel reads a plain object as a PHP array (`docs/conditionable.md`, truthiness bullet; `typeNameOf`), which PHP's `?callable` rejects; Macroable is cited for how it calls one (`__invoke` with the object as `this`), which the diff follows. Only reading B is consistent with both references.
  - `[false]` `[reject]` (intent) the TS type says reading A while the runtime says B — the same as the edge type row, patched there in the doc comment.
  - `[false]` `[reject]` (intent) the proxy clause of the retro's full item text — `HigherOrderWhenProxy` takes no callable, as the auditor notes.
  - `[medium]` `[patch]` (fidelity, reviewer 1, F-7) XT-conditionable-4 declares an async `__invoke`'s own Promise is returned, but would pass if it were wrapped — added an invokable returning a held Promise, `assertSame` against the `when` callback and `unless` default results.

### 2026-10-25 — Review pass (Finalize re-check, after the patches)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none; the Fidelity Review re-ran on tree `d83310402963989cfd5c942122aee969800571d8` (the patched tree) and both reviewers passed.

## Design Notes

PHP's `is_callable` on an object is true only for a `Closure` or an object of a class with `__invoke`; arrays are callable only as `[obj, 'method']` / `['Class', 'method']`. Xaravel reads a plain object as a PHP array (AD-9), so `{ __invoke }` stays rejected with `array given`, the message PHP gives for an array.

## Verification

**Commands:**
- `bun test packages/conditionable` -- expected: all pass
- `bun run typecheck` and `bun run lint` -- expected: exit 0
- `bun run api-surface:gate conditionable` -- expected: 0 unexplained
- `bun run harness` -- expected: `SUMMARY` with no differences

## Fidelity Review

### Reviewer 1: reject at tree ad6b7a79c83dd7bb600c57515f7f5e2fdf8ef8e4

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `9e53594967e2b8502b8aa3afce19fb46a40003f6`, on 2026-10-25T18:55:40.022Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are added or changed, and the action item assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | The diff preserves existing assertions and expected values; the new invokable cases add exact comparisons and exception checks. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no Oracle error fixture relied on by this change. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared XT-conditionable-1 through XT-conditionable-4 with their bodies and helpers. XT-conditionable-4 checks Promise type and resolved value but does not verify its declared Promise identity guarantee. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files belong to the listed conditionable component. The fixture uses existing Mockery APIs without implementing another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the complete changed framework source with AD-6 and DIV-1.6. The methods remain synchronous dual helpers returning callback results directly, with no async roots requiring tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file is changed. |

Findings:

- **F-7** `packages/conditionable/tests/xaravel/conditionable.test.ts`: XT-conditionable-4 declares that an async __invoke's own Promise is returned, but its assertions would also pass if that Promise were wrapped. Add an invokable that returns a retained Promise and assertSame that Promise against the when/unless result, covering callback and default paths.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"ad6b7a79c83dd7bb600c57515f7f5e2fdf8ef8e4","base":"9e53594967e2b8502b8aa3afce19fb46a40003f6","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-25T18:55:40.022Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are added or changed, and the action item assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"The diff preserves existing assertions and expected values; the new invokable cases add exact comparisons and exception checks.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no Oracle error fixture relied on by this change.","findings":[]},{"id":"F-7","result":"fail","note":"Compared XT-conditionable-1 through XT-conditionable-4 with their bodies and helpers. XT-conditionable-4 checks Promise type and resolved value but does not verify its declared Promise identity guarantee.","findings":[{"path":"packages/conditionable/tests/xaravel/conditionable.test.ts","detail":"XT-conditionable-4 declares that an async __invoke's own Promise is returned, but its assertions would also pass if that Promise were wrapped. Add an invokable that returns a retained Promise and assertSame that Promise against the when/unless result, covering callback and default paths.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"All changed files belong to the listed conditionable component. The fixture uses existing Mockery APIs without implementing another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the complete changed framework source with AD-6 and DIV-1.6. The methods remain synchronous dual helpers returning callback results directly, with no async roots requiring tags.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree ad6b7a79c83dd7bb600c57515f7f5e2fdf8ef8e4

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `9e53594967e2b8502b8aa3afce19fb46a40003f6`, on 2026-10-25T18:55:40.022Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and adds or changes no Ported Test. The only test changes are to Xaravel Tests in packages/conditionable/tests/xaravel/, so there are no Upstream assertions to match. |
| F-2: No expected value is weakened | pass | No Ported Test changed and the item lists no stale_tests. The diff only adds lines to conditionable.test.ts. In XT-conditionable-1, every existing expected value is unchanged, including the '?callable, Xaravel\Tests\Conditionable\Logger given' TypeError, which still holds because Logger has no '__invoke'. The docs edit adds text and loosens no stated behaviour. |
| F-3: No assertion is removed without a DIV clause | pass | No Ported Test changed, and no assertion was removed from XT-conditionable-1/2/3: the hunks in the test file only add a header-comment line, the MOCK_FIXTURE constant and the new helper classes and XT-conditionable-4. No adapted markers were added. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No '// adapted:DIV-<n>.<k>' marker or Expectations 'adapted' field is added or changed. The DIV-1.6 / DIV-12.x citations in the docs and comments are not adapted markers, and they match the clause text shown in (a) and (h). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The item relies on no Oracle fixture: evidence (c) lists no error fixtures and no assigned requests. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | I compared XT-conditionable-4's consequence string with its body. Every claim is checked by an assertion: - The object is called as '__invoke(instance, value)' with the object as 'this': the receiver, self and value are each asserted for both the callback and the default. - The result follows '?? this': "result" is returned, and a null return gives back the logger. - An async '__invoke''s own Promise is returned: an assertInstanceOf Promise check, then the awaited value. - It is not called when its branch is not taken: the call count stays 0 across a when, an unless and a default. - It is not called when it is the condition: the callback sees '[logger, condition]' and the call count is 0. - A plain object or null-prototype object with an '__invoke' key gets an exact 'array given' TypeError. - An instance whose '__invoke' is not a function gets an exact 'NotInvokable given' TypeError on both branches. - A Mockery double works: the fixture asserts the returned values and that the 'once()' expectations verify. The fixture's output is checked exactly. The string cites no FR or AD tokens. XT-conditionable-1/2/3 are unchanged and still check what they declare: the docs Divergences section still cites DIV-1.6, DIV-12.12 and DIV-12.13. |
| F-8: No stub, fake or partial implementation of another Component | pass | The change edits only packages/conditionable (its source, docs and tests), which is within the item's components. The fixture uses @​xaravel/mockery's existing Mockery API as a test tool; it adds no stub, fake or partial implementation of another Component. Nothing in macroable is changed. |
| F-9: Every `@asyncRoot` tag is true | pass | Conditionable.ts holds no real '@​asyncRoot' tag. Line 14 is a comment saying that when / unless take none. when / unless are AD-6 / DIV-1 dual helpers: their declared return type is 'Result<R\|D, this>', the callback's own type, never a declared Promise. The new invokable branch in callableArgument wraps '__invoke' synchronously and returns its result as is, so an async '__invoke' gives back its own Promise, the same as an async closure does. The changed file adds no new exports. async-surface.json is '[]', which is consistent. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"ad6b7a79c83dd7bb600c57515f7f5e2fdf8ef8e4","base":"9e53594967e2b8502b8aa3afce19fb46a40003f6","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-25T18:55:40.022Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and adds or changes no Ported Test. The only test changes are to Xaravel Tests in packages/conditionable/tests/xaravel/, so there are no Upstream assertions to match.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changed and the item lists no stale_tests. The diff only adds lines to conditionable.test.ts. In XT-conditionable-1, every existing expected value is unchanged, including the `?callable, Xaravel\\Tests\\Conditionable\\Logger given` TypeError, which still holds because Logger has no `__invoke`. The docs edit adds text and loosens no stated behaviour.","findings":[]},{"id":"F-3","result":"pass","note":"No Ported Test changed, and no assertion was removed from XT-conditionable-1/2/3: the hunks in the test file only add a header-comment line, the MOCK_FIXTURE constant and the new helper classes and XT-conditionable-4. No adapted markers were added.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No `// adapted:DIV-<n>.<k>` marker or Expectations `adapted` field is added or changed. The DIV-1.6 / DIV-12.x citations in the docs and comments are not adapted markers, and they match the clause text shown in (a) and (h).","findings":[]},{"id":"F-6","result":"n/a","note":"The item relies on no Oracle fixture: evidence (c) lists no error fixtures and no assigned requests.","findings":[]},{"id":"F-7","result":"pass","note":"I compared XT-conditionable-4's consequence string with its body. Every claim is checked by an assertion:\n- The object is called as `__invoke(instance, value)` with the object as `this`: the receiver, self and value are each asserted for both the callback and the default.\n- The result follows `?? this`: \"result\" is returned, and a null return gives back the logger.\n- An async `__invoke`'s own Promise is returned: an assertInstanceOf Promise check, then the awaited value.\n- It is not called when its branch is not taken: the call count stays 0 across a when, an unless and a default.\n- It is not called when it is the condition: the callback sees `[logger, condition]` and the call count is 0.\n- A plain object or null-prototype object with an `__invoke` key gets an exact `array given` TypeError.\n- An instance whose `__invoke` is not a function gets an exact `NotInvokable given` TypeError on both branches.\n- A Mockery double works: the fixture asserts the returned values and that the `once()` expectations verify. The fixture's output is checked exactly.\nThe string cites no FR or AD tokens. XT-conditionable-1/2/3 are unchanged and still check what they declare: the docs Divergences section still cites DIV-1.6, DIV-12.12 and DIV-12.13.","findings":[]},{"id":"F-8","result":"pass","note":"The change edits only packages/conditionable (its source, docs and tests), which is within the item's components. The fixture uses @xaravel/mockery's existing Mockery API as a test tool; it adds no stub, fake or partial implementation of another Component. Nothing in macroable is changed.","findings":[]},{"id":"F-9","result":"pass","note":"Conditionable.ts holds no real `@asyncRoot` tag. Line 14 is a comment saying that when / unless take none. when / unless are AD-6 / DIV-1 dual helpers: their declared return type is `Result<R|D, this>`, the callback's own type, never a declared Promise. The new invokable branch in callableArgument wraps `__invoke` synchronously and returns its result as is, so an async `__invoke` gives back its own Promise, the same as an async closure does. The changed file adds no new exports. async-surface.json is `[]`, which is consistent.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree d83310402963989cfd5c942122aee969800571d8

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `9e53594967e2b8502b8aa3afce19fb46a40003f6`, on 2026-10-25T18:57:57.966Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change adds or modifies no Ported Test. |
| F-2: No expected value is weakened | pass | Compared the test diff with the supplied test bodies: existing expected values and exact comparisons remain unchanged; new assertions add coverage. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted assertion marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-conditionable-1 through XT-conditionable-4 with their bodies and helpers. Assertions cover their declared behavior, including invokable receiver and arguments, branch selection, null fallback, rejection, Mockery invocation, and retained Promise identity on callback and default paths. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and implementation with the action item's scope. Production changes implement Conditionable behavior within its component; the Mockery fixture exercises an existing component without implementing or stubbing its behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the complete changed framework source with AD-6 and DIV-1.6. Its methods remain synchronous dual helpers returning callback results directly, with no declared Promise return or async-root tag requiring justification. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/conditionable/tests/xaravel/conditionable.test.ts`: XT-conditionable-4 declares that an async __invoke's own Promise is returned, but its assertions would also pass if that Promise were wrapped. Add an invokable that returns a retained Promise and assertSame that Promise against the when/unless result, covering callback and default paths. **fixed**: XT-conditionable-4 retains the Promise in held and asserts its identity against when's callback result and unless's default result, detecting Promise wrapping on both paths.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"d83310402963989cfd5c942122aee969800571d8","base":"9e53594967e2b8502b8aa3afce19fb46a40003f6","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-25T18:57:57.966Z","items":[{"id":"F-1","result":"n/a","note":"The change adds or modifies no Ported Test.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the test diff with the supplied test bodies: existing expected values and exact comparisons remain unchanged; new assertions add coverage.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted assertion marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-conditionable-1 through XT-conditionable-4 with their bodies and helpers. Assertions cover their declared behavior, including invokable receiver and arguments, branch selection, null fallback, rejection, Mockery invocation, and retained Promise identity on callback and default paths.","findings":[]},{"id":"F-8","result":"pass","note":"Compared changed paths and implementation with the action item's scope. Production changes implement Conditionable behavior within its component; the Mockery fixture exercises an existing component without implementing or stubbing its behavior.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the complete changed framework source with AD-6 and DIV-1.6. Its methods remain synchronous dual helpers returning callback results directly, with no declared Promise return or async-root tag requiring justification.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/conditionable/tests/xaravel/conditionable.test.ts","detail":"XT-conditionable-4 declares that an async __invoke's own Promise is returned, but its assertions would also pass if that Promise were wrapped. Add an invokable that returns a retained Promise and assertSame that Promise against the when/unless result, covering callback and default paths.","fixed":true,"note":"XT-conditionable-4 retains the Promise in held and asserts its identity against when's callback result and unless's default result, detecting Promise wrapping on both paths."}]}
```

### Reviewer 2: pass at tree d83310402963989cfd5c942122aee969800571d8

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `9e53594967e2b8502b8aa3afce19fb46a40003f6`, on 2026-10-25T18:57:57.966Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs, and the diff touches no file under tests/ported. Only Xaravel Tests and the source changed, so no Upstream assertions need matching. |
| F-2: No expected value is weakened | pass | I compared the earlier tests in conditionable.test.ts (XT-conditionable-1 to 3) with the diff. The diff only adds the new test and its helpers below XT-conditionable-3, plus the header comment; no existing expected value changed. Existing rejections such as '{}' → 'array given' and 'new Logger()' → LOGGER given still hold under the new callableArgument: Logger has no __invoke, and a plain object is typed 'array'. XT-conditionable-4 uses exact assertSame and exact messages throughout. No Ported Test is changed. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed. The diff removes no assertion from any existing Xaravel Test: every hunk in the test file is an addition. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is touched, so no Skip Reason is set. |
| F-5: Every `adapted` marker matches its clause | n/a | No '// adapted:DIV-<n>.<k>' marker and no Expectations 'adapted' field is added or changed. The test cites DIV-1.6 only in a comment, which matches that clause: an async callback's own Promise is returned. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows no assigned Oracle request, and no base or changed fixture is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | I checked the body of XT-conditionable-4 against each part of its consequence string. (1) Callback and default for when/unless are called as __invoke(instance, value) with the object as 'this': the receiver, self and value assertions on callback and fallback check this. (2) Result '?? this': 'result' and 'default' come back, and a null result returns logger. (3) An async __invoke's own Promise: AsyncInvokable resolves for both callback and default, and the retained 'held' Promise is assertSame'd for both callback and default, so a wrapped Promise would fail. (4) Not called when the branch is not taken: 'untouched' has 0 calls across three paths. (5) Not called when it is the condition: 'condition' has 0 calls, and seen is [logger, condition]. (6) A plain object and a null-prototype object with __invoke are rejected with 'array given', and NotInvokable is rejected with its FQCN on both branches. (7) A Mockery double is called through __invoke: the fixture's process exit status, returned values and a null Mockery.close() verify are all asserted. The string cites no FR or AD bullet ids. |
| F-8: No stub, fake or partial implementation of another Component | pass | The source change is only in packages/conditionable/src/Traits/Conditionable.ts (callableArgument and the Callback type), which is this item's own component. Mockery is used only in a test fixture, as a test double; it is not a stub of another component's behaviour. Macroable is not modified. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists one '@​asyncRoot' at line 14. It is prose in the header comment saying that when/unless take no tag, not a tag on a declaration. when/unless are AD-6 dual helpers (AD-6.5, DIV-1.6): they return the callback's own result, and the new invokable wrapper returns __invoke's result unchanged. Neither declares a Promise, so no tag is needed. async-surface.json is [], and no new export is added. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/conditionable/tests/xaravel/conditionable.test.ts`: XT-conditionable-4 declares that an async __invoke's own Promise is returned, but its assertions would also pass if that Promise were wrapped. Add an invokable that returns a retained Promise and assertSame that Promise against the when/unless result, covering callback and default paths. **fixed**: XT-conditionable-4 now adds 'const held = Promise.resolve("held")' and asserts 'Assert.assertSame(held, logger.when(true, new Invokable(held)))' for the callback path and 'Assert.assertSame(held, logger.unless(true, null, new Invokable(held)))' for the default path. A wrapped Promise would fail these identity checks.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"d83310402963989cfd5c942122aee969800571d8","base":"9e53594967e2b8502b8aa3afce19fb46a40003f6","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-25T18:57:57.966Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs, and the diff touches no file under tests/ported. Only Xaravel Tests and the source changed, so no Upstream assertions need matching.","findings":[]},{"id":"F-2","result":"pass","note":"I compared the earlier tests in conditionable.test.ts (XT-conditionable-1 to 3) with the diff. The diff only adds the new test and its helpers below XT-conditionable-3, plus the header comment; no existing expected value changed. Existing rejections such as `{}` → 'array given' and `new Logger()` → LOGGER given still hold under the new callableArgument: Logger has no __invoke, and a plain object is typed 'array'. XT-conditionable-4 uses exact assertSame and exact messages throughout. No Ported Test is changed.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed. The diff removes no assertion from any existing Xaravel Test: every hunk in the test file is an addition.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is touched, so no Skip Reason is set.","findings":[]},{"id":"F-5","result":"n/a","note":"No `// adapted:DIV-<n>.<k>` marker and no Expectations `adapted` field is added or changed. The test cites DIV-1.6 only in a comment, which matches that clause: an async callback's own Promise is returned.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows no assigned Oracle request, and no base or changed fixture is an error.","findings":[]},{"id":"F-7","result":"pass","note":"I checked the body of XT-conditionable-4 against each part of its consequence string. (1) Callback and default for when/unless are called as __invoke(instance, value) with the object as `this`: the receiver, self and value assertions on callback and fallback check this. (2) Result `?? this`: 'result' and 'default' come back, and a null result returns logger. (3) An async __invoke's own Promise: AsyncInvokable resolves for both callback and default, and the retained `held` Promise is assertSame'd for both callback and default, so a wrapped Promise would fail. (4) Not called when the branch is not taken: `untouched` has 0 calls across three paths. (5) Not called when it is the condition: `condition` has 0 calls, and seen is [logger, condition]. (6) A plain object and a null-prototype object with __invoke are rejected with 'array given', and NotInvokable is rejected with its FQCN on both branches. (7) A Mockery double is called through __invoke: the fixture's process exit status, returned values and a null Mockery.close() verify are all asserted. The string cites no FR or AD bullet ids.","findings":[]},{"id":"F-8","result":"pass","note":"The source change is only in packages/conditionable/src/Traits/Conditionable.ts (callableArgument and the Callback type), which is this item's own component. Mockery is used only in a test fixture, as a test double; it is not a stub of another component's behaviour. Macroable is not modified.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists one '@asyncRoot' at line 14. It is prose in the header comment saying that when/unless take no tag, not a tag on a declaration. when/unless are AD-6 dual helpers (AD-6.5, DIV-1.6): they return the callback's own result, and the new invokable wrapper returns __invoke's result unchanged. Neither declares a Promise, so no tag is needed. async-surface.json is [], and no new export is added.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/conditionable/tests/xaravel/conditionable.test.ts","detail":"XT-conditionable-4 declares that an async __invoke's own Promise is returned, but its assertions would also pass if that Promise were wrapped. Add an invokable that returns a retained Promise and assertSame that Promise against the when/unless result, covering callback and default paths.","fixed":true,"note":"XT-conditionable-4 now adds `const held = Promise.resolve(\"held\")` and asserts `Assert.assertSame(held, logger.when(true, new Invokable(held)))` for the callback path and `Assert.assertSame(held, logger.unless(true, null, new Invokable(held)))` for the default path. A wrapped Promise would fail these identity checks."}]}
```

## Auto Run Result

Status: done

**Summary.** `when` / `unless` accept an invokable object (an instance of a class whose `__invoke` is a function) as the callback or default, as PHP's `?callable` does, and call it as `object.__invoke(instance, value)` with the object as `this`; the result follows `result ?? this`, an async `__invoke`'s Promise returned as is (DIV-1.6). A plain or null-prototype object with an `__invoke` key is a PHP array and stays rejected with `array given`; an invokable passed as the condition is not called (finding L2, `epic-12-retro-item-1-invokable-callbacks`).

**Files changed.**
- `packages/conditionable/src/Traits/Conditionable.ts` -- `callableArgument` accepts and wraps an invokable instance; `Callback` type widened; header and doc comments.
- `packages/conditionable/tests/xaravel/conditionable.test.ts` -- XT-conditionable-4, every I/O matrix row for `when` and `unless`, Promise identity, an unregistered subclass with an inherited `__invoke`.
- `packages/conditionable/tests/xaravel/fixtures/invokable-mock.fixture.ts` -- the Mockery-double row, run in a child process (Mockery's process-wide class counter, see `deferred`).
- `packages/conditionable/docs/conditionable.md` -- the `?callable` and closure-value bullets, and the Divergences bullet on callable strings and arrays.

**Review.** First pass: 17 findings; patched 1 medium (Fidelity F-7, Promise identity) and 5 low groups (test timeout, type doc comment, unregistered/inherited case, docs wording); deferred 1 medium (Mockery's process-wide counter, `packages/mockery`, out of scope); rejected 11 with the reasons in the Review Triage Log. Finalize re-check: 0 findings.

**Follow-up review recommended:** false (first pass patched no `high` and one `medium`).

**Verification.** `bun test packages/conditionable/tests/xaravel` 4 pass; `bun run typecheck` and `bun run lint` exit 0; `bun run api-surface:gate conditionable` 0 unexplained; `bun run async-surface --check conditionable` ok; full `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`, `XARAVEL tests=383 passed=378 failed=0 skipped=5` (the 7 not-run Variants have no local backend); `bun run fidelity:review status --item epic-12-retro-item-1-invokable-callbacks` prints `current` for tree `d83310402963989cfd5c942122aee969800571d8`; `git diff --stat` against the baseline touches only `packages/conditionable/**` and this spec.

**Residual risks.** The `Callback` type admits a plain `{ __invoke }` literal that the runtime rejects (documented). PHP callable strings and `[object, 'method']` arrays remain rejected without a DIV clause, pending the Maintainer (`epic-12-retro-item-3-dual-helper-async-edges`).
