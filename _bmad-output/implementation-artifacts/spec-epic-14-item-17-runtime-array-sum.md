---
title: 'Runtime array_sum with PHP 8.5.11 behaviour'
type: feature
created: '2026-10-29'
status: done
baseline_revision: 4871478472a0871b773314979cf89405a415b783
review_loop_iteration: 1
followup_review_recommended: false
context:
  - decisions/ESC-14.8-2.md
  - decisions/MAINT-2026-10-29-story-14-8.md
  - decisions/DIV-9.md
  - AGENTS.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 14.8's `testFlatMapIsLazy` calls PHP's `array_sum` inside a callback, and `@xaravel/runtime/php` has no `array_sum` (ESC-14.8-2). The Story stays blocked until the runtime exports it.

**Approach:** Export `array_sum(array)` under its PHP name from `@xaravel/runtime/php` and the package root. It follows PHP 8.5.11: start from int 0 and add each value in order with the runtime's existing PHP `plus`, skipping each operand PHP's `add_function` rejects. Register it in the PHP function-name resolver, so `'array_sum'` works as a callable string like every other PHP-named export.

## Boundaries & Constraints

**Always:** Reuse the runtime's existing numeric classification and `plus` (int64 exactness, overflow to float, the float marker on float results, leading-numeric strings). Take the argument through the existing `array` parameter helper, so a non-array throws PHP's `TypeError: array_sum(): Argument #1 ($array) must be of type array, <type> given`. Do not raise PHP's warnings: `Addition is not supported on type <type>` and `A non-numeric value encountered` are omitted under DIV-9.17. Results and exceptions still follow PHP. Null is the only absent value (AD-9). Sync only (AD-6). The scope is `packages/runtime` and this item's records under `_bmad-output/implementation-artifacts/`. Record evidence from the local PHP 8.5.11 in a committed probe.

**Never:** Change Collections, contracts, the grader, Expectations, divergences, the architecture, `PORTING.md`, or the item's `action`/`owner`/`epic`. Never change other runtime behaviour or remove an export. Never add `array_product` or other functions the item does not name.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Empty | `[]` | int 0 | none |
| Ints | `[1,2,3]`, bigint values, `[PHP_INT_MAX, 1]`, `[PHP_INT_MIN, -1]` | int 6; exact int64; overflow gives float ±9.223372036854776E+18 | none |
| Floats | `[1, 2.5]`, `[0.1, 0.2]`, `[1.0]`, `[-0.0]`, INF/-INF, NAN | float 3.5, 0.30000000000000004, float 1, float 0, NAN | none |
| Coerced scalars | numeric strings (`"1"`, `"2.5"`, `"1e3"`, `" 3"`, `"3 "`, `"9223372036854775808"`), `true`, `false`, `null` | added as PHP adds them (`1009.5`, bools 1/0, null 0, an overflowing string as float) | none |
| Leading-numeric strings | `"12abc"`, `"0x1A"` | the numeric prefix is added (13, 1 with a following 1) | warning omitted (DIV-9.17) |
| Unsupported operands | arrays, `stdClass`, a closure, an `ArrayObject`, `"abc"`, `""`, a class-string that is not numeric | skipped; the sum of the rest | warning omitted (DIV-9.17) |
| Keyed arrays | string-keyed maps, `PhpArray`, values held by references | values summed in PHP order; keys ignored; no mutation of the argument | none |
| Non-array argument | int, string, null, object | throws | PHP `TypeError` with `Argument #1 ($array)` and the given type |
| Callable string | `array_map('array_sum', [[1,2],[3]])`; `phpFunction('ARRAY_SUM')` with 0 or 2 arguments | `[3,3]`; ArgumentCountError `array_sum() expects exactly 1 argument, <n> given` | as PHP |

</intent-contract>

## Code Map

- `packages/runtime/src/php/arithmetic.ts` -- private `numeric(value)` (lines 18-31) returns null for exactly the operands `add_function` rejects (array, object, non-numeric string); `plus(a, b)` (line 46) is PHP `+` with int64 overflow to float. Add `array_sum` here. `arrayFunctions.ts` cannot hold it: `arithmetic.ts` already imports `arrayUnion` from it.
- `packages/runtime/src/php/phpArguments.ts:141` -- `arrayParameter(fn, position, name, value)`: the `Z_PARAM_ARRAY` entries, or PHP's TypeError.
- `packages/runtime/src/php/index.ts:203` -- arithmetic export line; add `array_sum`. Check the package root `src/index.ts` re-exports `@xaravel/runtime/php` names the same way (XT-runtime-85 compares root and subpath identity).
- `packages/runtime/src/php/phpFunctions.ts:112` -- resolver registry; add `entry("array_sum", array_sum, 1, 1)` and its import.
- `packages/runtime/tests/xaravel/php-set-functions.test.ts:691` -- registry size assertion (103); it becomes 104, with its comment saying array_sum was added. The registry-vs-root and `function_exists` probes must stay consistent.
- `packages/runtime/tests/xaravel/php-set-functions.probe.php:73,75` -- `$registry` and `$exports` name lists; add `array_sum` to both in sorted position, then regenerate `php-set-functions.probe.txt` with `php -d error_reporting=0 php-set-functions.probe.php > php-set-functions.probe.txt` from that directory.
- `packages/runtime/tests/xaravel/php-chunk-sort-arith-callables.{probe.php,probe.txt,test.ts}` -- the probe pattern to copy: `<label>\t<json>` lines, a `PROBE_CASES` map recomputed by the runtime, and a key-set equality check.
- `packages/runtime/tests/xaravel/docs.test.ts` -- XT-runtime-37 requires every export to be named in `docs/`; document it in `packages/runtime/docs/php-chunk-sort-arith-callables.md` beside `plus`.
- The last Xaravel Test ID used is XT-runtime-125 (`php-reference-at.test.ts`); new tests start at XT-runtime-126.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/arithmetic.ts` -- add an exported `array_sum(array)` that folds `plus` over the values whose `numeric` is non-null, starting from int 0 -- PHP 8.5.11's `php_array_binop`.
- `packages/runtime/src/php/index.ts`, `packages/runtime/src/php/phpFunctions.ts` -- export it and register it in the resolver -- so it is public and works as a callable string.
- `packages/runtime/tests/xaravel/php-array-sum.probe.php` and `.probe.txt` -- record PHP 8.5.11 results for every matrix row, with throws written as `"<class>: <message>"` and floats keeping their markers -- the independent evidence.
- `packages/runtime/tests/xaravel/php-array-sum.test.ts` -- XT-runtime-126: every recorded label recomputed through the public export, int and float identity checked (`is_float`), the argument unchanged afterwards, and the probe's key set equal to the cases' key set; XT-runtime-127: the resolver and `array_map('array_sum', …)` rows -- the runtime cases checked against PHP.
- `packages/runtime/tests/xaravel/php-set-functions.{probe.php,probe.txt,test.ts}` -- add `array_sum` to the registry and exports lists, regenerate the record, and set the count to 104 -- tests that adding the export makes stale, in the same component.
- `packages/runtime/docs/php-chunk-sort-arith-callables.md` -- one sentence on `array_sum`, citing DIV-9.17 for the omitted warnings.

**Acceptance Criteria:**
- Given each matrix input, when `array_sum` is called through `@xaravel/runtime/php`, then the JSON-encoded result, its int/float type, or the exception class and message equal the PHP 8.5.11 probe's record.
- Given the full suite, when `bun run harness`, `bun run typecheck` and `bun run lint` run, then there are zero differences and both exit 0.
- Given the finished item, when `bun run fidelity:review status --item epic-14-item-17-runtime-array-sum --spec _bmad-output/implementation-artifacts/spec-epic-14-item-17-runtime-array-sum.md` runs, then it prints `current`.

## Spec Change Log

## Review Triage Log

### 2026-10-29 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 7, false 9, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: docs and JSDoc wrongly say a non-numeric string is skipped (PHP converts it to 0) — the local PHP 8.5.11 run of `array_sum(["abc", 1])` raises `array_sum(): Addition is not supported on type string`, the skip warning, not `A non-numeric value encountered`; PHP does skip it, and the docs describe that correctly.
  - `[false]` `[reject]` Blind: objects with a numeric cast (GMP, BcMath\Number) are skipped instead of added — the runtime has no class with a numeric cast (no GMP or BcMath, as the edge-case and intent layers also found), so no value can reach that path.
  - `[low]` `[reject]` Blind: no test proves values are summed in order — no ordering defect exists (the loop reads `arrayParameter` entries, PHP order, as every runtime array function does); an untested order with no defect.
  - `[low]` `[patch]` Blind: `array_sum` is typed `unknown`, unlike `divide` — direct correction: the return type is now `number | bigint | PhpFloat`.
  - `[low]` `[reject]` Blind: each element is classified twice (`numeric` gate, then `plus`) — negligible cost; a separate fold helper would add a second addition path, against reusing `plus` as the single source.
  - `[low]` `[reject]` Blind: the probe does not print `PHP_VERSION` — every runtime probe follows the same convention (its header names PHP 8.5.11 and the regeneration command); a version line here alone would not change that, and no wrong record exists.
  - `[low]` `[patch]` Blind: `check()` passes vacuously when a requested label is missing, so XT-runtime-127 run alone could pass with no evidence — direct correction: `check` now asserts that each requested label is present.
  - `[false]` `[reject]` Blind: the sprint-status update for the item is missing — the orchestrator sets the item `done` with SPS in the same PR after the build loop, as for item 16.
  - `[low]` `[reject]` Blind: the matrix's Floats row compresses INF/-INF/NAN results and -0 — the fix edits this build's spec; the probe and test record each value exactly.
  - `[low]` `[reject]` Blind: the matrix's Leading-numeric row is unclear and leaves out two probe rows — the fix edits this build's spec; the probe covers the rows.
  - `[false]` `[reject]` Blind: the acceptance criterion says "both" for three commands — wording in this build's spec only; all three exit 0 and the harness reports zero differences.
  - `[false]` `[reject]` Blind: no test checks a safe-range int result is a `number`, not a `bigint` — `plus` returns `intKey(sum)`, which already gives a `number` for every safe int, and that is pinned by the existing `plus` tests (XT-runtime-86..90); no defect.
  - `[false]` `[reject]` Intent: the Story 14.8 consumer import site is not exercised — the route (`decisions/MAINT-2026-10-29-story-14-8.md`, step 5) keeps that port for Story 14.8; the export's signature accepts its `number[]` argument.
  - `[false]` `[reject]` Intent: "objects without numeric conversion" is built as "all objects" — the same as the second Blind row: no runtime object has a numeric conversion.
  - `[false]` `[reject]` Intent: resolver registration goes beyond the literal "exports" — every PHP-named runtime export is in the resolver, and XT-runtime-84 requires it ("the registry lists every PHP-named function export of the package root"); the change only adds to the record, regenerated from PHP.
  - `[false]` `[reject]` Intent: the evidence is a local PHP 8.5.11 recording, not the Oracle — the Oracle pins the same PHP 8.5.11, and recorded host probes are the runtime items' established evidence (items 9–16); the item's action asks for "XT-runtime cases against PHP".
- Edge Case Hunter: no findings (two test-strength observations noted as non-defects). Verification Gap: no findings. Fidelity Review: two pass verdicts at tree aeecf38090ef0acb04408978adc17c1126c7cf92; the patches change the tree, so the Finalize re-check runs it again.

## Verification

**Commands:**
- `cd packages/runtime/tests/xaravel && php -d error_reporting=0 php-array-sum.probe.php | diff - php-array-sum.probe.txt` -- expected: no output. Do the same for `php-set-functions`.
- `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: zero differences.
- `bun run typecheck` and `bun run lint` -- expected: exit 0.
- `bun run harness` -- expected: zero differences (NOT-RUN Variants allowed).
- `bun run fidelity:review status --item epic-14-item-17-runtime-array-sum --spec _bmad-output/implementation-artifacts/spec-epic-14-item-17-runtime-array-sum.md` -- expected: `current`.

## Auto Run Result

Status: done

**Summary.** `@xaravel/runtime/php` and the package root export `array_sum(array)`, PHP 8.5.11's. It starts from int 0 and adds each value in order through the runtime's `plus`, skipping each operand PHP rejects (an array, an object, a non-numeric string). PHP's warnings are not raised (DIV-9.17). It is registered in the PHP function-name resolver, so `'array_sum'` works as a callable string.

**Files changed.**
- `packages/runtime/src/php/arithmetic.ts`: the `array_sum` export, typed `number | bigint | PhpFloat`.
- `packages/runtime/src/php/index.ts`, `packages/runtime/src/index.ts`: export it.
- `packages/runtime/src/php/phpFunctions.ts`: the resolver entry `array_sum` (1, 1).
- `packages/runtime/docs/php-chunk-sort-arith-callables.md`: one sentence on it.
- `packages/runtime/tests/xaravel/php-array-sum.{probe.php,probe.txt,test.ts}`: the PHP 8.5.11 evidence, plus XT-runtime-126 (values) and XT-runtime-127 (callable string).
- `packages/runtime/tests/xaravel/php-set-functions.{probe.php,probe.txt,test.ts}`: `array_sum` added to the registry and export lists, the record regenerated from PHP, and the count raised to 104. These were the tests the new export made stale, all in the same component.

**Review.** One pass with 16 findings: 2 low patched (the return type, and `check` asserting that each requested label is present), 0 deferred, and 14 rejected with the reasons in the Review Triage Log. Patched by verdict: high 0, medium 0, low 2. The Fidelity Review passed twice at `aeecf38090ef0acb04408978adc17c1126c7cf92`, then twice again at the patched tree `792921246bce2c7a85126541ea197d075800aea4`, and its status there is `current`.

**Follow-up review:** false. No high or medium finding was patched.

**Verification.**
- Both probes, re-run with the local PHP 8.5.11, match their records exactly.
- `bun run harness --xaravel --id 'XT-runtime-*'`: 124 of 124 passed.
- `bun run typecheck` and `bun run lint` both exit 0.
- Full `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`, with 489 Xaravel Tests (484 passed, 5 skipped). The 7 NOT-RUN Variants are backends that are not running locally.

**Residual risks.**
- No runtime object has a numeric cast (GMP, `BcMath\Number`). If one is added later, it must join `numeric()` for `array_sum` to add it as PHP does.
- Story 14.8 still has to import the export and register `testFlatMapIsLazy`.

## Fidelity Review

### Reviewer 1: pass at tree aeecf38090ef0acb04408978adc17c1126c7cf92

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4871478472a0871b773314979cf89405a415b783`, on 2026-10-29T18:22:44.032Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | The existing exact registry count changes from 103 to 104 for the added array_sum entry; existing probe expectations are retained with that entry inserted. New tests compare exact PHP probe values and exception messages. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no assertion adapted markers or Expectations adapted fields. Warning omission is explicitly covered by the supplied DIV-9.17 ruling. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixtures relied upon by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-126 checks PHP probe sums, coercions, rejected operands, numeric identity, errors and unchanged inputs; XT-runtime-127 checks callable resolution and exact arity errors. The touched existing tests retain their probe, registry and export checks. No consequence bullet tokens require validation. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changes remain within the declared runtime component. array_sum uses existing runtime arithmetic and parameter validation, with no substitute implementation of another component. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source files retain no asyncRoot tags. The new array_sum implementation performs synchronous arithmetic without IO or async callbacks, so it correctly remains untagged. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"aeecf38090ef0acb04408978adc17c1126c7cf92","base":"4871478472a0871b773314979cf89405a415b783","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-29T18:22:44.032Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"The existing exact registry count changes from 103 to 104 for the added array_sum entry; existing probe expectations are retained with that entry inserted. New tests compare exact PHP probe values and exception messages.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no assertion adapted markers or Expectations adapted fields. Warning omission is explicitly covered by the supplied DIV-9.17 ruling.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixtures relied upon by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-126 checks PHP probe sums, coercions, rejected operands, numeric identity, errors and unchanged inputs; XT-runtime-127 checks callable resolution and exact arity errors. The touched existing tests retain their probe, registry and export checks. No consequence bullet tokens require validation.","findings":[]},{"id":"F-8","result":"pass","note":"All changes remain within the declared runtime component. array_sum uses existing runtime arithmetic and parameter validation, with no substitute implementation of another component.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source files retain no asyncRoot tags. The new array_sum implementation performs synchronous arithmetic without IO or async callbacks, so it correctly remains untagged.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree aeecf38090ef0acb04408978adc17c1126c7cf92

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `4871478472a0871b773314979cf89405a415b783`, on 2026-10-29T18:22:44.032Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test. Only Xaravel Tests (XT-runtime-126/127, and XT-runtime-84's registry count) are touched, so there is no Upstream assertion to compare. |
| F-2: No expected value is weakened | pass | There is no Ported Test. In the touched Xaravel Tests, the only changed expected value is XT-runtime-84's registry count, 103 to 104. The registry really gains array_sum, and the PHP probe's $registry/$exports lists and the recorded resolver.reflection/counts/exports lines were updated to match. That is an exact assertSame on the new true value, not a loosening. XT-runtime-126/127 compare exact encoded JSON with assertSame against PHP 8.5.11 probe output. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is touched. No assertion is removed from the changed Xaravel Test: XT-runtime-84 keeps every assertion and only updates the count. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or changes no Expectations line, and no skip reason is set. |
| F-5: Every `adapted` marker matches its clause | n/a | No // adapted:DIV marker and no Expectations adapted field is added. The DIV-9.17 citations in the docblock, docs and test comments match the clause, which explicitly names array_sum's 'Addition is not supported on type' warning as not raised, with the operand skipped (ESC-14.8-2). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no assigned or changed Oracle fixture that is an error. The tests rely on a committed host PHP probe, not on Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-126's consequence covers: adds as PHP 8.5.11 does, skips rejected operands, keeps int64/float identity, leaves the argument unchanged. Its body checks the labels empty/ints/floats/coerced/leading/unsupported/keyed/errors against the PHP 8.5.11 probe record. sums() checks that keys and values are identical before and after each call and that the float marker agrees with gettype. The test also adds bigint, NaN, -0 and TypeError checks, and checks that the probe labels match the cases. XT-runtime-127's consequence covers callable-string resolution with argument-count errors. Its body checks the 'callable' label (array_map, is_callable, case-insensitive and backslash-qualified names, call_user_func_array, ArgumentCountError for 0 and 2 arguments) and the registry entry identity. Neither consequence cites an FR/AD token. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files are under packages/runtime (src, docs, tests), which is the item's only listed component. array_sum is a full runtime builtin, not a stub of another component, and no other component's behaviour is faked or hard-coded. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tag in any changed source file (index.ts, php/index.ts, arithmetic.ts, phpFunctions.ts). The new export array_sum is synchronous, does no IO and takes no callback, so it correctly has no tag. No existing tag in these files is kept or changed. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"aeecf38090ef0acb04408978adc17c1126c7cf92","base":"4871478472a0871b773314979cf89405a415b783","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-29T18:22:44.032Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test. Only Xaravel Tests (XT-runtime-126/127, and XT-runtime-84's registry count) are touched, so there is no Upstream assertion to compare.","findings":[]},{"id":"F-2","result":"pass","note":"There is no Ported Test. In the touched Xaravel Tests, the only changed expected value is XT-runtime-84's registry count, 103 to 104. The registry really gains array_sum, and the PHP probe's $registry/$exports lists and the recorded resolver.reflection/counts/exports lines were updated to match. That is an exact assertSame on the new true value, not a loosening. XT-runtime-126/127 compare exact encoded JSON with assertSame against PHP 8.5.11 probe output.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is touched. No assertion is removed from the changed Xaravel Test: XT-runtime-84 keeps every assertion and only updates the count.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or changes no Expectations line, and no skip reason is set.","findings":[]},{"id":"F-5","result":"n/a","note":"No // adapted:DIV marker and no Expectations adapted field is added. The DIV-9.17 citations in the docblock, docs and test comments match the clause, which explicitly names array_sum's 'Addition is not supported on type' warning as not raised, with the operand skipped (ESC-14.8-2).","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no assigned or changed Oracle fixture that is an error. The tests rely on a committed host PHP probe, not on Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-126's consequence covers: adds as PHP 8.5.11 does, skips rejected operands, keeps int64/float identity, leaves the argument unchanged. Its body checks the labels empty/ints/floats/coerced/leading/unsupported/keyed/errors against the PHP 8.5.11 probe record. sums() checks that keys and values are identical before and after each call and that the float marker agrees with gettype. The test also adds bigint, NaN, -0 and TypeError checks, and checks that the probe labels match the cases. XT-runtime-127's consequence covers callable-string resolution with argument-count errors. Its body checks the 'callable' label (array_map, is_callable, case-insensitive and backslash-qualified names, call_user_func_array, ArgumentCountError for 0 and 2 arguments) and the registry entry identity. Neither consequence cites an FR/AD token.","findings":[]},{"id":"F-8","result":"pass","note":"All changed files are under packages/runtime (src, docs, tests), which is the item's only listed component. array_sum is a full runtime builtin, not a stub of another component, and no other component's behaviour is faked or hard-coded.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tag in any changed source file (index.ts, php/index.ts, arithmetic.ts, phpFunctions.ts). The new export array_sum is synchronous, does no IO and takes no callback, so it correctly has no tag. No existing tag in these files is kept or changed.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 792921246bce2c7a85126541ea197d075800aea4

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4871478472a0871b773314979cf89405a415b783`, on 2026-10-29T18:26:38.862Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Tests and changes none; there are no Upstream assertion sequences to compare. |
| F-2: No expected value is weakened | pass | The changed tests retain exact comparisons. The registry count increases from 103 to 104 for the added array_sum entry; existing probe expectations are retained with that entry inserted. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or changes no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation markers or Expectations adapted fields are added or changed. Warning suppression agrees with the supplied DIV-9.17 ruling. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixtures relied on by this item; probe error strings are ordinary expected data. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared the touched test bodies and helpers with their consequences. Exact probe comparisons cover sums, numeric identities, rejected operands, errors and callable resolution; argument preservation and registry identity receive explicit assertions. Existing tests retain their declared checks. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changes stay within the runtime component named by the action item. array_sum implements runtime arithmetic using existing helpers and is exported and registered as a callable; no other component is stubbed. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source files and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags, and the added synchronous arithmetic performs no IO and accepts no async callback requiring one. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes, so there are no changed Oracle request inputs to compare. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"792921246bce2c7a85126541ea197d075800aea4","base":"4871478472a0871b773314979cf89405a415b783","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-29T18:26:38.862Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Tests and changes none; there are no Upstream assertion sequences to compare.","findings":[]},{"id":"F-2","result":"pass","note":"The changed tests retain exact comparisons. The registry count increases from 103 to 104 for the added array_sum entry; existing probe expectations are retained with that entry inserted.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or changes no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation markers or Expectations adapted fields are added or changed. Warning suppression agrees with the supplied DIV-9.17 ruling.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixtures relied on by this item; probe error strings are ordinary expected data.","findings":[]},{"id":"F-7","result":"pass","note":"Compared the touched test bodies and helpers with their consequences. Exact probe comparisons cover sums, numeric identities, rejected operands, errors and callable resolution; argument preservation and registry identity receive explicit assertions. Existing tests retain their declared checks.","findings":[]},{"id":"F-8","result":"pass","note":"All changes stay within the runtime component named by the action item. array_sum implements runtime arithmetic using existing helpers and is exported and registered as a callable; no other component is stubbed.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source files and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags, and the added synchronous arithmetic performs no IO and accepts no async callback requiring one.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes, so there are no changed Oracle request inputs to compare.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 792921246bce2c7a85126541ea197d075800aea4

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `4871478472a0871b773314979cf89405a415b783`, on 2026-10-29T18:26:38.862Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and has no Inventory rows. Only Xaravel Tests (XT-runtime-126/127, plus the php-set-functions updates) are added or changed. |
| F-2: No expected value is weakened | pass | There are no Ported Tests. In XT-runtime-84 the registry count changes from 103 to 104 because array_sum is added; it stays an exact assertSame. The php-set-functions probe records only gain array_sum entries (reflection ["array_sum",1,1,false,[]], argument-count messages, export true). No expected value is loosened. |
| F-3: No assertion is removed without a DIV clause | pass | No Ported Test is touched. In php-set-functions.test.ts only the count line and its comment change; every existing assertion and probe label is kept. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no '// adapted:DIV-<n>.<k>' markers and no Expectations adapted fields. DIV-9.17 appears only in docblocks and comments, and its text explicitly covers array_sum's 'Addition is not supported on type' warning (ESC-14.8-2). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | There are no assigned Oracle requests or fixtures, and no changed fixture is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-126 recomputes every PHP 8.5.11 probe label (empty, ints, floats, coerced, leading, unsupported, keyed, errors). Each sum is compared as [gettype, value], so int64 and float identity are checked, and sums() checks that each argument is unchanged entry by entry. I traced the code against the probe: numeric() returns null for arrays, objects, closures and non-numeric or empty strings, so they are skipped; leading-numeric strings are parsed with allowErrors; plus() handles int64 overflow to float and keeps the float marker. These give the recorded values. XT-runtime-127 checks the callable label: array_map, is_callable, call_user_func_array, case-insensitive and leading-backslash names, and ArgumentCountError for 0 and 2 arguments. It also checks the registry entry identity. Neither consequence string cites an FR or AD token. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every change is under packages/runtime (src, docs, tests), which is within the item's single component. No stub, fake or partial implementation of another component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in index.ts, arithmetic.ts, php/index.ts or phpFunctions.ts. The new array_sum export is synchronous, does no IO and takes no callback, so it correctly has no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"792921246bce2c7a85126541ea197d075800aea4","base":"4871478472a0871b773314979cf89405a415b783","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-29T18:26:38.862Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and has no Inventory rows. Only Xaravel Tests (XT-runtime-126/127, plus the php-set-functions updates) are added or changed.","findings":[]},{"id":"F-2","result":"pass","note":"There are no Ported Tests. In XT-runtime-84 the registry count changes from 103 to 104 because array_sum is added; it stays an exact assertSame. The php-set-functions probe records only gain array_sum entries (reflection [\"array_sum\",1,1,false,[]], argument-count messages, export true). No expected value is loosened.","findings":[]},{"id":"F-3","result":"pass","note":"No Ported Test is touched. In php-set-functions.test.ts only the count line and its comment change; every existing assertion and probe label is kept.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no `// adapted:DIV-<n>.<k>` markers and no Expectations adapted fields. DIV-9.17 appears only in docblocks and comments, and its text explicitly covers array_sum's 'Addition is not supported on type' warning (ESC-14.8-2).","findings":[]},{"id":"F-6","result":"n/a","note":"There are no assigned Oracle requests or fixtures, and no changed fixture is an error.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-126 recomputes every PHP 8.5.11 probe label (empty, ints, floats, coerced, leading, unsupported, keyed, errors). Each sum is compared as [gettype, value], so int64 and float identity are checked, and sums() checks that each argument is unchanged entry by entry. I traced the code against the probe: numeric() returns null for arrays, objects, closures and non-numeric or empty strings, so they are skipped; leading-numeric strings are parsed with allowErrors; plus() handles int64 overflow to float and keeps the float marker. These give the recorded values. XT-runtime-127 checks the callable label: array_map, is_callable, call_user_func_array, case-insensitive and leading-backslash names, and ArgumentCountError for 0 and 2 arguments. It also checks the registry entry identity. Neither consequence string cites an FR or AD token.","findings":[]},{"id":"F-8","result":"pass","note":"Every change is under packages/runtime (src, docs, tests), which is within the item's single component. No stub, fake or partial implementation of another component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in index.ts, arithmetic.ts, php/index.ts or phpFunctions.ts. The new array_sum export is synchronous, does no IO and takes no callback, so it correctly has no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ is changed.","findings":[]}],"prior":[]}
```
