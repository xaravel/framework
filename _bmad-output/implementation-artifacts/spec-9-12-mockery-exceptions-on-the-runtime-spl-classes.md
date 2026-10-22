---
title: "Story 9.12: Mockery exceptions on the runtime's SPL classes"
type: 'feature'
created: '2026-10-22'
baseline_revision: '553464e33da57f48164bd072d1b806c8b21392d2'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.12.md'
  - '{project-root}/decisions/ESC-9.11-1.md'
  - '{project-root}/decisions/ESC-4.5-1.md'
  - '{project-root}/packages/runtime/docs/exceptions.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@xaravel/mockery` keeps grader-internal copies of PHP's `\Exception` and seven SPL classes (`packages/mockery/src/php/`) that extend the JS `Error`. A Mockery failure is therefore never `instanceof` the runtime's `\RuntimeException`, `\BadMethodCallException`, … and a Ported Test's `expectException(\BadMethodCallException::class)` cannot match it (ESC-4.5-1 item 2, the Mockery half of DIV-9.8 after ESC-9.11-1).

**Approach:** As the grader does in Story 9.11 (`packages/assert/src/Framework/Exception/RuntimeExceptionParent.ts`), put one internal, unexported, unfrozen parent class between each copy and its PHP parent. When `globalThis[Symbol.for('xaravel.php.classes')]` is published, each parent's constructor and prototype are re-parented onto the runtime class of the same PHP name. With no map, the chain is today's (plus the internal parent).

## Boundaries & Constraints

**Always:**
- Edit only `packages/mockery/**`, this spec, and the Story's status lines (`sprint-status.yaml`, `stories/9.12.md` `status:`).
- Grader isolation (AD-2): nothing in `packages/mockery/src` imports `@xaravel/runtime`; the map is read by its symbol only, and a test that needs the runtime loads it only in a child `bun` process.
- **Copies and PHP parents** (PHP's SPL tree): `Exception` (root, parent JS `Error`), `RuntimeException` and `LogicException` (`Exception`), `InvalidArgumentException` and `BadFunctionCallException` (`LogicException`), `BadMethodCallException` (`BadFunctionCallException`), `OutOfBoundsException` and `UnexpectedValueException` (`RuntimeException`). Unlinked, each copy extends its parent copy through its internal parent; linked, the internal parent of copy `N` sits on the runtime's `map[N]`, so every Mockery exception is `instanceof` the runtime SPL classes PHP's Mockery 1.6.15 reaches, `map.Exception`, the JS `Error`, and never `map.Error`.
- **When it links:** at module load when the map is already published, else on the first construction of any copy or subclass, an `instanceof` on a copy, or `graderExceptionClass()` after it appears. All eight parents link together; linking is one-way.
- **`instanceof` a copy:** once linked, `v instanceof <copy N>` is `v instanceof map[N]` (the copies stand for PHP's one class of that name, so a runtime `\RuntimeException` is also `instanceof` Mockery's copy, and a `RuntimeException` copy instance is `instanceof` the `Exception` copy). Only the copy itself delegates; a subclass (Mockery's own exceptions) keeps the default `instanceof`. Unlinked, the default.
- **Same behaviour in both modes:** `getMessage()`, `getCode()`, `getPrevious()`, the JS `message`, `name` (the short class name, as today) and `Reflect.ownKeys` are the same with and without the map. `code` is an own, writable, non-enumerable property and a non-null `previous` is the JS `cause`, in both modes (as the grader's parent does). Linked, construction runs the runtime constructor, so its PHP argument coercion applies (string message, int code, `Error | null` previous).
- The copies stay frozen and unexported as today (`src/index.ts` freeze loop); the internal parents are never exported or frozen.
- Comments in each copy cite its PHP parent and this Story; `packages/mockery/README.md` states the SPL linking, when it applies and its late-load limit.
- Xaravel Test conventions of `packages/mockery/tests/xaravel/*.test.ts`: header naming the Story, the F-10 note (no Upstream test inputs: this is the follow-up of ESC-4.5-1 item 2, as ESC-9.11-1 splits it), children with a `timeout`.

**Never:**
- Edit `packages/assert/**`, `packages/runtime/**`, `decisions/**`, `PORTING.md`, `docs/**`, `conformance/**`, `tools/**`, or `stories/**` beyond the status line. Closing DIV-9.8 is the planning change ESC-9.11-1 names, not this Story.
- Import the runtime from `src/`, export the internal parents, or unfreeze a copy.
- Edit an existing test's expected value; XT-mockery-1..11 pass unchanged.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No map | child `bun`, no runtime: each copy built with `("m", 5, prev)` and Mockery's own exceptions (`BadMethodCallException`, `NoMatchingExpectationException`, `InvalidCountException`, `Mockery\Exception\RuntimeException`, `InvalidArgumentException`) | chain copy → internal parent → parent copy … → JS `Error`; getters `m`/`5`/`prev`; `name` short class name; `instanceof` each copy along the PHP chain | — |
| Runtime first / Mockery first | child loads the runtime then Mockery; and Mockery, then the runtime, then builds | every row `instanceof` its runtime SPL classes along PHP's chain, `map.Exception`, `Error`, not `map.Error`; getters, `message`, `name`, own keys equal to the no-map run; copies frozen | — |
| Late load | Mockery exceptions built, runtime loaded, nothing new built; then an `instanceof` on a copy | after the copy `instanceof`, the earlier instances are `instanceof` the runtime classes; getters unchanged | — |
| expectException | linked: a Mockery `BadMethodCallException` from an unexpected call; grader `Constraint\Exception(map.BadMethodCallException)`, `assertInstanceOf(map.BadMethodCallException, e)`; a TestCase body under `expectException(map.BadMethodCallException)` that makes the call; same under `expectException(map.RuntimeException)` | match; passes; test passes (PHPUnit verifies a non-PHPUnit exception); fails with the grader's `Constraint\Exception` failure, whose message names `Mockery\Exception\BadMethodCallException` and `RuntimeException` (it is a `\LogicException`, as in PHP) | — |
| Delegated instanceof | linked: `new map.RuntimeException("x") instanceof <RuntimeException copy>`; `<RuntimeException copy instance> instanceof <Exception copy>`; a `NoMatchingExpectationException` `instanceof BadMethodCallException` (Mockery's) | true; true; false | — |
| Coercion | linked: a copy built with a non-int code | the runtime's `TypeError` (PHP's message) | thrown |

</intent-contract>

## Code Map

- `packages/mockery/src/php/Exception.ts:1-30` -- the root copy: its constructor, `#code`/`#previous` and getters move to the internal parent; it keeps `static [FQCN] = "Exception"`.
- `packages/mockery/src/php/{RuntimeException,LogicException,InvalidArgumentException,BadFunctionCallException,BadMethodCallException,OutOfBoundsException,UnexpectedValueException}.ts` -- 7-line copies, `extends` their parent copy; each switches to `extends splParent("<Name>", <ParentCopy>)` (or the module's equivalent).
- `packages/mockery/src/support/values.ts:26` (`FQCN = Symbol.for("xaravel.class.fqcn")`), `shortClassName`, `classNameOf:66` (own brand only).
- `packages/mockery/src/support/classes.ts:48-70` -- `graderExceptionClass`: link before resolving.
- `packages/mockery/src/index.ts:107-215` -- imports and freezes the copies; the header comment (`:15-16`) says they are not exported.
- `packages/mockery/src/Mockery/Exception.ts`, `Mockery/Exception/*.ts`, `Mockery/CountValidator/Exception.ts`, `JMac/Testing/Exceptions/DoubleException.ts` -- Mockery's own exceptions on the copies (string-only `super` calls).
- `packages/assert/src/Framework/Exception/RuntimeExceptionParent.ts` (read-only) -- the reference linking pattern (lazy link, `delete` runtime `name`, own `code`, getters on the parent).
- `packages/runtime/src/php/phpClasses.ts:40-84`, `Exception.ts`, `throwableArguments.ts:134-175` (read-only) -- the map (all eight names present), the constructor coercion, `initThrowable` (own `name` = brand, own `code`).
- `packages/assert/tests/xaravel/exceptions-spl.test.ts` (read-only) -- the child-process idiom, `runTest` body runner and `Reflect.ownKeys` comparison to follow.
- `packages/mockery/tests/xaravel/mockery.test.ts:710-727` (XT-mockery-3) -- `instanceof` the copies; must stay green.

## Tasks & Acceptance

**Execution:**
- `packages/mockery/src/php/SplParent.ts` (new, internal) -- the parent factory, the map reader, `link()` and the delegated static `Symbol.hasInstance`.
- `packages/mockery/src/php/*.ts` -- each copy on its internal parent; comments cite PHP parent, Story 9.12.
- `packages/mockery/src/support/classes.ts` -- link in `graderExceptionClass`.
- `packages/mockery/README.md` -- the SPL linking paragraph.
- `packages/mockery/tests/xaravel/exceptions-spl.test.ts` (new) -- XT-mockery-12, the matrix rows above in child processes.
- `stories/9.12.md` -- `status:` line only.

**Acceptance Criteria:**
- Given Story 9.10's SPL protocol and Story 9.11's grader side, when Mockery throws or compares exceptions, then its exceptions extend the runtime's SPL classes when the map is published and keep today's chain when it is absent, and `expectException` on a Mockery failure matches as in PHP (XT-mockery-12).
- Given the whole grader suite, when it runs, then XT-mockery-1..11 and XT-assert-1..21 still pass.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass

Layers: Blind Hunter, Edge Case Hunter, Verification Gap (no gaps), Intent Alignment, Fidelity Review (both reviewers pass at tree `53dcbfa`).

- verdicts: 23 findings — high 0, medium 2, low 18, false 3, maybe-false 0 (Intent Alignment's descriptive observations are logged as 5 rows)
- findings:
  - `[low]` `[patch]` Edge: four children of 50 s each run inside a 120 s test timeout — `CHILD_TIMEOUT` raised above `4 * SPAWN_TIMEOUT`.
  - `[low]` `[reject]` Edge: a parent env with `XARAVEL_NO_SCOPE_GLOBAL=1` leaks into the children — nothing in the repo's harness, CI or scripts sets it (`git grep`), and the sibling XT-assert-18 spawns the same way; a guard adds code for a case no run reaches.
  - `[low]` `[patch]` Edge: linked `getCode()` can return the runtime's `bigint` while typed `number` — typed `number | bigint`, as the runtime's `Exception.getCode()`.
  - `[false]` `[reject]` Edge: `setPrototypeOf` throwing mid-loop leaves a parent half-linked — the parents are never frozen or made non-extensible, so `Object.setPrototypeOf` on them cannot throw.
  - `[low]` `[reject]` Edge: `SplClass` declares a static `[FQCN]` the parent does not define — every copy declares its own (`override` needs the base declaration), `classNameOf` reads own brands only, and nothing reads a parent's brand.
  - `[low]` `[patch]` Edge: a numeric-string code reads differently linked and unlinked — unlinked keeps today's raw value by design (keep today's behaviour without the map); the README now states the coercion difference (grouped with the Blind coercion row).
  - `[low]` `[patch]` Blind: `getCode()` bigint typing — same root as the Edge row.
  - `[low]` `[patch]` Blind: the modes coerce arguments differently and the README does not say so — README sentence added.
  - `[low]` `[reject]` Blind: the construction and `graderExceptionClass()` late-load triggers are untested — every trigger calls the same `linkSplParents()`, the `mockery-first` mode links by construction, and `late-load` covers the re-parenting of earlier instances; a sub-mode per trigger adds children for one shared path.
  - `[false]` `[reject]` Blind: a partly filled class map never links — the runtime publishes one frozen map holding all 24 names (`phpClasses.ts:43-70`), so a partial map is not reachable.
  - `[medium]` `[patch]` Blind: Mockery's own exceptions that reach `\OutOfBoundsException` and `\UnexpectedValueException` are not rows — `Mockery\Exception`, `CountValidator\Exception`, `InvalidOrderException` and a `DoubleException` added.
  - `[low]` `[patch]` Blind: the test names classes by `constructor.name` — it now reports the FQCN brand.
  - `[low]` `[patch]` Blind: the child times out before reporting — same root as the Edge timeout row.
  - `[false]` `[reject]` Blind: the Story status lines are missing from the diff — they were set to `in-progress` in the Story's first commit (`553464e`), the baseline, and move to `done` at the end.
  - `[low]` `[patch]` Blind: the PHP tree is written twice in the test (a ternary beside `CHAIN`) — derived from `CHAIN`.
  - `[low]` `[reject]` Blind: nothing checks that each `splParent` call names the right PHP parent — XT-mockery-12 asserts every copy's parent against `CHAIN` in every mode, which catches a wrong pairing; a runtime table adds a second copy of the tree.
  - `[low]` `[patch]` Blind: the README omits that a linked copy's `instanceof` also matches runtime instances — README sentence added.
  - `[low]` `[reject]` Blind: the own-keys assertion pins Bun's internal `Error` keys — the sibling XT-assert-18 pins the same list for Bun 1.4.3 (pinned in `.bun-version`), and each linked run is also compared with the no-map run.
  - `[medium]` `[patch]` Intent: the "compares" half of AC1 is never exercised — a linked-mode row checks that the grader's `ExceptionComparator` accepts two Mockery exceptions.
  - `[low]` `[reject]` Intent: `andThrow('<SPL name>')` still builds the copy, and SPL names outside the eight are not found — the copy is linked, so it is `instanceof` PHP's class as AC1 asks; other SPL names are pre-existing and outside the copies the AC names.
  - `[low]` `[reject]` Intent: `expectException` is shown through a re-implemented `runTest`, not a `portedTest` under the harness — the grader's XT-assert-18 idiom; graded packages cannot be loaded in-process by a grader test (AD-2).
  - `[low]` `[reject]` Intent: lazy linking leaves an early-built exception unlinked until a trigger — documented in the README and tested (`late-load`); ESC-9.11-1's design note asks for lazy resolution.
  - `[low]` `[reject]` Intent: delegated `instanceof` and linked coercion go beyond the text — both follow "as in PHP" (one class per PHP name; PHP's constructor types) and are tested; descriptive.

### 2026-10-22 — Review pass (Finalize re-check: Fidelity Review of the patched tree)

Fidelity Review only, on tree `0f28a37`: reviewer 1 (codex) pass, reviewer 2 (claude) pass.

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none

## Design Notes

- **Why a parent per copy.** The copies are frozen (`src/index.ts`), so their own `[[Prototype]]` cannot change; and PHP's tree has eight levels Mockery needs (`\OutOfBoundsException` for `CountValidator\Exception`, `\UnexpectedValueException` for `Mockery\Exception`, …), so one shared parent (the grader's single `RuntimeExceptionParent`) is not enough.
- **Why `Symbol.hasInstance`.** Linked, copy `RuntimeException`'s chain runs through `map.RuntimeException`, not through copy `Exception`, so without delegation `new RuntimeException() instanceof <Exception copy>` would turn false only when the runtime is loaded.

## Verification

**Commands:**
- `bun test packages/mockery packages/assert` -- expected: pass, XT-mockery-12 included.
- `bun run harness --xaravel --id 'XT-mockery-*'` -- expected: no difference.
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check` -- expected: clean.

## Fidelity Review

### Reviewer 1: pass at tree 53dcbfa8967b5cd09e29f8300458f18c9c8fc280

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `553464e33da57f48164bd072d1b806c8b21392d2`, on 2026-10-22T23:30:36.943Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and none are added or changed. |
| F-2: No expected value is weakened | pass | The diff adds exact expectations in XT-mockery-12; it changes or weakens no existing expected value. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-mockery-12 checks the declared SPL chains, exclusion of PHP Error, exception matching, fallback chains, and getter and own-key parity across load orders. Its consequence cites no FR or AD bullet tokens. |
| F-8: No stub, fake or partial implementation of another Component | pass | All implementation changes stay in mockery and link its internal copies through the runtime-owned symbol protocol authorized by ESC-4.5-1 and ESC-9.11-1; no other Component is stubbed. |
| F-9: Every `@asyncRoot` tag is true | pass | The supplied source and declaration inventory contain no asyncRoot tags. The changed methods perform synchronous prototype linking, construction, getters, and lookup, requiring no async tags under AD-6. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"53dcbfa8967b5cd09e29f8300458f18c9c8fc280","base":"553464e33da57f48164bd072d1b806c8b21392d2","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-22T23:30:36.943Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and none are added or changed.","findings":[]},{"id":"F-2","result":"pass","note":"The diff adds exact expectations in XT-mockery-12; it changes or weakens no existing expected value.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-mockery-12 checks the declared SPL chains, exclusion of PHP Error, exception matching, fallback chains, and getter and own-key parity across load orders. Its consequence cites no FR or AD bullet tokens.","findings":[]},{"id":"F-8","result":"pass","note":"All implementation changes stay in mockery and link its internal copies through the runtime-owned symbol protocol authorized by ESC-4.5-1 and ESC-9.11-1; no other Component is stubbed.","findings":[]},{"id":"F-9","result":"pass","note":"The supplied source and declaration inventory contain no asyncRoot tags. The changed methods perform synchronous prototype linking, construction, getters, and lookup, requiring no async tags under AD-6.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 53dcbfa8967b5cd09e29f8300458f18c9c8fc280

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `553464e33da57f48164bd072d1b806c8b21392d2`, on 2026-10-22T23:30:36.943Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty, so there are no Inventory rows or Upstream source. The diff adds or changes no Ported Test, only the Xaravel Test XT-mockery-12 and grader source. |
| F-2: No expected value is weakened | n/a | There is no Ported Test, so no expected value can be compared with Upstream's. XT-mockery-12 is a new Xaravel Test and no existing expected value changes. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, and evidence (a) shows no adapted:DIV marker. There is no Upstream assertion count to compare. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip: no conformance expectations file is touched and test_ids is empty. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV-<n>.<k> marker or an Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): there are no assigned Oracle requests, no base error fixtures and no changed fixtures. The Story relies on no Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Checked XT-mockery-12's consequence clause by clause against its body. - Linked case: in the runtime-first and mockery-first runs, each row's instances.runtime equals PHP's chain from CHAIN, and phpError (instanceof the runtime's Error) is false. The ROWS parents match Mockery 1.6.15: NoMatchingExpectation leads to UnexpectedValueException through Mockery\Exception, InvalidCount to OutOfBounds through CountValidator\Exception, and Mockery\Exception\RuntimeException to \Exception. - expectException: badMethodCall is null under expectException(\BadMethodCallException), and RuntimeException is rejected with PHPUnit's message. - No-map case: map is false, each chain is 'php parent copy', and copies are instanceof along PHP's chain. - Same either way: getters, message, name, own keys and the code descriptor are compared with the no-map rows in both linked modes and in late-load. The string cites no FR or AD tokens. The body checks at least what the string claims. |
| F-8: No stub, fake or partial implementation of another Component | pass | Code changes stay inside packages/mockery (the Story's component): src/php/*, the new src/php/SplParent.ts and src/support/classes.ts. The runtime is only read through the published globalThis[Symbol.for('xaravel.php.classes')] protocol (ESC-4.5-1 item 2, ESC-9.11-1). Nothing stubs, fakes or hard-codes runtime behaviour; with no map, the copies keep their own chain. The test imports packages/runtime only in a child process, to exercise the real runtime. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in any changed src file. Every new or kept export (splParent, linkSplParents, the SplParent constructor, getters and Symbol.hasInstance, graderExceptionClass and the copy classes) is synchronous. None reaches an IO root or accepts a callback, so none needs a tag and no tag is false. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"53dcbfa8967b5cd09e29f8300458f18c9c8fc280","base":"553464e33da57f48164bd072d1b806c8b21392d2","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-22T23:30:36.943Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty, so there are no Inventory rows or Upstream source. The diff adds or changes no Ported Test, only the Xaravel Test XT-mockery-12 and grader source.","findings":[]},{"id":"F-2","result":"n/a","note":"There is no Ported Test, so no expected value can be compared with Upstream's. XT-mockery-12 is a new Xaravel Test and no existing expected value changes.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, and evidence (a) shows no adapted:DIV marker. There is no Upstream assertion count to compare.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip: no conformance expectations file is touched and test_ids is empty.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV-<n>.<k> marker or an Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): there are no assigned Oracle requests, no base error fixtures and no changed fixtures. The Story relies on no Oracle fixture.","findings":[]},{"id":"F-7","result":"pass","note":"Checked XT-mockery-12's consequence clause by clause against its body.\n- Linked case: in the runtime-first and mockery-first runs, each row's instances.runtime equals PHP's chain from CHAIN, and phpError (instanceof the runtime's Error) is false. The ROWS parents match Mockery 1.6.15: NoMatchingExpectation leads to UnexpectedValueException through Mockery\\Exception, InvalidCount to OutOfBounds through CountValidator\\Exception, and Mockery\\Exception\\RuntimeException to \\Exception.\n- expectException: badMethodCall is null under expectException(\\BadMethodCallException), and RuntimeException is rejected with PHPUnit's message.\n- No-map case: map is false, each chain is 'php parent copy', and copies are instanceof along PHP's chain.\n- Same either way: getters, message, name, own keys and the code descriptor are compared with the no-map rows in both linked modes and in late-load.\nThe string cites no FR or AD tokens. The body checks at least what the string claims.","findings":[]},{"id":"F-8","result":"pass","note":"Code changes stay inside packages/mockery (the Story's component): src/php/*, the new src/php/SplParent.ts and src/support/classes.ts. The runtime is only read through the published globalThis[Symbol.for('xaravel.php.classes')] protocol (ESC-4.5-1 item 2, ESC-9.11-1). Nothing stubs, fakes or hard-codes runtime behaviour; with no map, the copies keep their own chain. The test imports packages/runtime only in a child process, to exercise the real runtime.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in any changed src file. Every new or kept export (splParent, linkSplParents, the SplParent constructor, getters and Symbol.hasInstance, graderExceptionClass and the copy classes) is synchronous. None reaches an IO root or accepts a callback, so none needs a tag and no tag is false.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 0f28a375b5e54f6afea6ca0c0bdbcd54929e755c

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `553464e33da57f48164bd072d1b806c8b21392d2`, on 2026-10-22T23:34:49.576Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and none are added or changed. |
| F-2: No expected value is weakened | pass | The added Xaravel Test uses exact expected values; no existing assertion or Upstream expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed, so no Upstream assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied upon by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-mockery-12 checks its declared SPL ancestry, exclusion of PHP Error, exception matching, absent-map chain, and getter/property parity across load orders, including late linking. Its consequence cites no numbered FR or AD bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | Production changes stay within mockery and consume the runtime class-map protocol authorized by ESC-4.5-1 and ESC-9.11-1; they add no substitute implementation of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | The supplied changed-source declarations contain no asyncRoot tags, IO roots, or async callback APIs. Their synchronous implementations agree with AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"0f28a375b5e54f6afea6ca0c0bdbcd54929e755c","base":"553464e33da57f48164bd072d1b806c8b21392d2","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-22T23:34:49.576Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and none are added or changed.","findings":[]},{"id":"F-2","result":"pass","note":"The added Xaravel Test uses exact expected values; no existing assertion or Upstream expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed, so no Upstream assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied upon by this Story.","findings":[]},{"id":"F-7","result":"pass","note":"XT-mockery-12 checks its declared SPL ancestry, exclusion of PHP Error, exception matching, absent-map chain, and getter/property parity across load orders, including late linking. Its consequence cites no numbered FR or AD bullet.","findings":[]},{"id":"F-8","result":"pass","note":"Production changes stay within mockery and consume the runtime class-map protocol authorized by ESC-4.5-1 and ESC-9.11-1; they add no substitute implementation of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"The supplied changed-source declarations contain no asyncRoot tags, IO roots, or async callback APIs. Their synchronous implementations agree with AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 0f28a375b5e54f6afea6ca0c0bdbcd54929e755c

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `553464e33da57f48164bd072d1b806c8b21392d2`, on 2026-10-22T23:34:49.576Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and the change adds or changes no Ported Test, so there are no Upstream assertions to compare against. |
| F-2: No expected value is weakened | n/a | There are no Ported Tests and no Upstream expected values. The only test touched is the new Xaravel Test XT-mockery-12, which has no Upstream source. |
| F-3: No assertion is removed without a DIV clause | n/a | The change has no Ported Test whose assertions could be counted against Upstream's. Evidence (a) shows no adapted:DIV marker. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change edits no Expectations line and sets no test to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV-<n>.<k> marker or an Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no base, assigned or changed Oracle fixture is an error. The manifest assigns no Ported Tests. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | I compared XT-mockery-12's consequence string with its body, part by part. (1) With the runtime map, the runtime-first and mockery-first rows assert that every exception is instanceof the runtime SPL classes along PHP's CHAIN and that phpError (instanceof map.Error) is false. (2) 'expectException matches a Mockery failure as in PHP' is checked by runTest(map.BadMethodCallException) returning null, while runTest(map.RuntimeException) fails with ExpectationFailedException. The constraint and assertInstanceOf results are also checked. (3) 'Without the map, today's chain is kept' is checked by none.map false, each chain sitting on its 'php parent copy' ending at the JS Error, and the copies along the chain. (4) 'Getters, message, name and own keys the same either way' is checked by comparing the linked rows' getters with none.rows' getters, which cover ownKeys, the code descriptor and cause. The parents in ROWS match Mockery 1.6.15: RuntimeException extends \Exception, Mockery\Exception extends UnexpectedValueException, and CountValidator\Exception extends OutOfBoundsException. The string cites no FR/AD bullet, and ESC-4.5-1 item 2 is the ruling the test implements (ESC-9.11-1). |
| F-8: No stub, fake or partial implementation of another Component | pass | Every source change is under packages/mockery (component mockery): src/php/*, src/support/classes.ts and the README. The runtime is read only through globalThis[Symbol.for('xaravel.php.classes')], as ESC-4.5-1 item 2 and ESC-9.11-1 prescribe. No other Component's behaviour is stubbed, faked or hard-coded. The test's child process imports the real runtime and assert sources and fakes neither. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tag in any changed src file. The new exports are splParent, linkSplParents, SplName, SplThrowable and SplClass; graderExceptionClass is changed. All of them are synchronous, do no IO, take no async callback and return no Promise or thenable, so no tag is required and no kept tag needs checking. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"0f28a375b5e54f6afea6ca0c0bdbcd54929e755c","base":"553464e33da57f48164bd072d1b806c8b21392d2","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-22T23:34:49.576Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and the change adds or changes no Ported Test, so there are no Upstream assertions to compare against.","findings":[]},{"id":"F-2","result":"n/a","note":"There are no Ported Tests and no Upstream expected values. The only test touched is the new Xaravel Test XT-mockery-12, which has no Upstream source.","findings":[]},{"id":"F-3","result":"n/a","note":"The change has no Ported Test whose assertions could be counted against Upstream's. Evidence (a) shows no adapted:DIV marker.","findings":[]},{"id":"F-4","result":"n/a","note":"The change edits no Expectations line and sets no test to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV-<n>.<k> marker or an Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no base, assigned or changed Oracle fixture is an error. The manifest assigns no Ported Tests.","findings":[]},{"id":"F-7","result":"pass","note":"I compared XT-mockery-12's consequence string with its body, part by part. (1) With the runtime map, the runtime-first and mockery-first rows assert that every exception is instanceof the runtime SPL classes along PHP's CHAIN and that phpError (instanceof map.Error) is false. (2) 'expectException matches a Mockery failure as in PHP' is checked by runTest(map.BadMethodCallException) returning null, while runTest(map.RuntimeException) fails with ExpectationFailedException. The constraint and assertInstanceOf results are also checked. (3) 'Without the map, today's chain is kept' is checked by none.map false, each chain sitting on its 'php parent copy' ending at the JS Error, and the copies along the chain. (4) 'Getters, message, name and own keys the same either way' is checked by comparing the linked rows' getters with none.rows' getters, which cover ownKeys, the code descriptor and cause. The parents in ROWS match Mockery 1.6.15: RuntimeException extends \\Exception, Mockery\\Exception extends UnexpectedValueException, and CountValidator\\Exception extends OutOfBoundsException. The string cites no FR/AD bullet, and ESC-4.5-1 item 2 is the ruling the test implements (ESC-9.11-1).","findings":[]},{"id":"F-8","result":"pass","note":"Every source change is under packages/mockery (component mockery): src/php/*, src/support/classes.ts and the README. The runtime is read only through globalThis[Symbol.for('xaravel.php.classes')], as ESC-4.5-1 item 2 and ESC-9.11-1 prescribe. No other Component's behaviour is stubbed, faked or hard-coded. The test's child process imports the real runtime and assert sources and fakes neither.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tag in any changed src file. The new exports are splParent, linkSplParents, SplName, SplThrowable and SplClass; graderExceptionClass is changed. All of them are synchronous, do no IO, take no async callback and return no Promise or thenable, so no tag is required and no kept tag needs checking.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: done

**Summary.** Mockery's eight grader-internal PHP copies (`packages/mockery/src/php/`) now each sit on an internal, unexported, unfrozen parent built by `splParent()`. When the runtime publishes `Symbol.for('xaravel.php.classes')`, all eight parents are re-parented onto the runtime classes of the same PHP names: at load, on construction, on an `instanceof` on a copy, or from `graderExceptionClass()`. Every Mockery exception is then `instanceof` the runtime SPL classes along PHP's chain, never `\Error`, and `expectException` matches it as in PHP. With no map, the chain is today's. Getters, `message`, `name` and own keys are the same in both modes.

**Files changed.**
- `packages/mockery/src/php/SplParent.ts` (new): the parent factory, map reader, `linkSplParents()` and the delegated `Symbol.hasInstance`.
- `packages/mockery/src/php/{Exception,RuntimeException,LogicException,InvalidArgumentException,BadFunctionCallException,BadMethodCallException,OutOfBoundsException,UnexpectedValueException}.ts`: each extends its `splParent`, with a comment citing its PHP parent.
- `packages/mockery/src/support/classes.ts`: `graderExceptionClass` links first.
- `packages/mockery/README.md`: the "PHP's SPL classes" section.
- `packages/mockery/tests/xaravel/exceptions-spl.test.ts` (new): XT-mockery-12, run in four child modes (no runtime, runtime first, Mockery first, late load).

**Review.** 23 findings in the first pass. 11 rows were patched, in 7 fixes:
- 2 medium: the extra Mockery exception rows, and the `ExceptionComparator` row.
- 9 low: the timeouts, the `bigint` code type, the two README sentences, FQCN names in the test, and the tree derived from `CHAIN`.

Nothing was deferred. 12 findings were rejected, each with its reason in the triage log:
- 3 false: the half-link, the partial map, and the status lines.
- 9 low: the env var, the parent `[FQCN]` type, the per-trigger late-load modes, the parent-pairing table, Bun's own keys, and four descriptive intent rows.

The Fidelity Review passed with both reviewers, at tree `53dcbfa` and again at the patched tree `0f28a37`.

**Follow-up review recommendation: true** (first pass, 2 medium patched, 0 high). The unverified risk: the new XT-mockery-12 rows for `Mockery\Exception`, `CountValidator\Exception`, `InvalidOrderException`, `DoubleException`, and the comparator row were checked only by the Fidelity re-check, not by the other review layers.

**Verification.** All clean after the patches:
- `bun test packages/mockery packages/assert`: 33 pass, 0 fail.
- `bun run harness --xaravel --id 'XT-mockery-*'`: 12 of 12, no differences.
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check` and `bun run registration:check`.

**Residual risks.**
- An exception built before the runtime loads links only on the next trigger (documented).
- Unlinked construction keeps today's raw argument values, while linked construction applies PHP's coercion (documented).
- DIV-9.8's closure is the planning change ESC-9.11-1 names, after this Story.
