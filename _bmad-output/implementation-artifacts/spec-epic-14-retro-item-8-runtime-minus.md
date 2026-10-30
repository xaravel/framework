---
title: 'Runtime minus: PHP 8.5.11 subtraction'
type: feature
created: '2026-10-30'
status: done
baseline_revision: 8f70fc93b1fc561209054af20f18052f0560ea97
review_loop_iteration: 1
followup_review_recommended: false
context:
  - decisions/MAINT-2026-10-29-epic-14-retro-minus.md
  - decisions/MAINT-2026-10-26-runtime-builtins.md
  - AGENTS.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 14 retro item 7 needs PHP's `$a - $b` for `LazyCollection::range`'s descending step (`$from -= abs($step)`), and `@xaravel/runtime/php` has `plus` and `divide` but no helper for `-` (`decisions/MAINT-2026-10-29-epic-14-retro-minus.md`).

**Approach:** Export `minus(a, b)` from `@xaravel/runtime/php` and the package root, built beside `plus` in `arithmetic.ts` on the same private `operands`/`numeric` classification: PHP numeric-string coercion (leading-numeric strings included), exact int64 subtraction that overflows to float as PHP does, a float result carrying the float marker, and PHP's `TypeError` `Unsupported operand types: <a> - <b>` for an array, an object or a non-numeric string.

## Boundaries & Constraints

**Always:** Reuse `operands(a, b, "-")`, `double` and `float` so `minus` classifies exactly as `plus` and `divide` do. Arrays are never subtracted (PHP has no array `-`): `[] - []` throws. Null is the only absent value (AD-9); sync only (AD-6). PHP's warning for a leading-numeric string (`A non-numeric value encountered`) is not raised, as for `plus` (DIV-9.17). Record evidence from the local PHP 8.5.11 in a committed probe. Scope: `packages/runtime` and this item's records under `_bmad-output/implementation-artifacts/`.

**Never:** Change Collections or any other component, the grader, Expectations, divergences, `PORTING.md` (its row already names `minus`), the architecture, or the item's `action`/`owner`/`epic`. Never change `plus`, `divide` or any other runtime behaviour, or remove an export. Never register `minus` in the PHP function-name resolver: `-` is an operator, not a PHP function (`function_exists('minus')` is false, as for `plus`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ints | `5 - 3`, `3 - 5`, `9007199254740993 - 1`, `PHP_INT_MIN - -1`, `PHP_INT_MAX - PHP_INT_MAX` | int 2, int -2; exact int64 (9007199254740992, -9223372036854775807, 0) | none |
| Overflow | `PHP_INT_MIN - 1`, `PHP_INT_MAX - -1`, `PHP_INT_MIN - PHP_INT_MAX` | float -9.223372036854776E+18, 9.223372036854776E+18, -1.8446744073709552E+19 | none |
| Floats | `5.5 - 1`, `1 - 0.1`, `float(3) - 1`, `0 - -0.0`, `-0.0 - 0`, INF/NAN operands | float 4.5, 0.9, float 2, +0, -0, INF/NAN as PHP | none |
| Coerced scalars | `"10" - 3`, `"2.5" - "1"`, `"1e3" - 1`, `" 7" - "7 "`, `true - false`, `null - 1`, `"9223372036854775808" - 1` | PHP's results (int 7, float 1.5, float 999, int 0, int 1, int -1, float) | none |
| Leading-numeric | `"12abc" - 2`, `" 12tail" - 2`, `"0x1A" - 1` | int 10, int 10, int -1 | warning omitted (DIV-9.17) |
| Unsupported | `[] - 1`, `1 - []`, `[1] - [1]`, `"x" - 1`, `1 - ""`, `stdClass - 1`, closure `- 1` | throws | PHP `TypeError` `Unsupported operand types: array - int` (and the matching type names) |

</intent-contract>

## Code Map

- `packages/runtime/src/php/arithmetic.ts` -- `numeric` (lines 18-31), `operands(a, b, operator)` (33-41, builds the `Unsupported operand types: <a> <op> <b>` TypeError), `double`, `plus` (48-57, int64 exact with `INT_MIN`/`INT_MAX` overflow to `float(...)`). Add `minus` after `plus`, typed `number | bigint | PhpFloat` like `divide`.
- `packages/runtime/src/php/index.ts:203`, `packages/runtime/src/index.ts:268` -- arithmetic export lines; add `minus` to both (root and subpath must be the same object).
- `packages/runtime/docs/php-chunk-sort-arith-callables.md:7` -- names `plus` and `divide`; add `minus` (XT-runtime-37 requires every export named in `docs/`).
- `packages/runtime/tests/xaravel/php-set-functions.probe.php:75` -- `$exports` lists every root function export (with `plus`); add `minus` in sorted position, then regenerate `php-set-functions.probe.txt` with `php -d error_reporting=0 php-set-functions.probe.php > php-set-functions.probe.txt` from that directory. The registry count (104, test line 691) does not change.
- `packages/runtime/tests/xaravel/php-array-sum.{probe.php,probe.txt,test.ts}` -- the probe/test pattern to copy: `out(label, value)` lines, `t($v)` typed values, `attempt` for throws, a `cases` map recomputed through the public export, and a key-set equality check.
- Last Xaravel Test ID is XT-runtime-129; new tests start at XT-runtime-130.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/arithmetic.ts` -- add exported `minus(a, b)`: `operands(a, b, "-")`, int pair subtracted as BigInt with overflow to `float(Number(l) - Number(r))`, otherwise `float(double(l) - double(r))` -- PHP's `sub_function`.
- `packages/runtime/src/php/index.ts`, `packages/runtime/src/index.ts` -- export `minus` -- public from both entrypoints.
- `packages/runtime/docs/php-chunk-sort-arith-callables.md` -- name `minus` beside `plus` and `divide`.
- `packages/runtime/tests/xaravel/php-minus.probe.php` and `.probe.txt` -- PHP 8.5.11 results for every matrix row, as `[gettype, value]` with NAN/INF/±0 by name and throws as `"<class>: <message>"`.
- `packages/runtime/tests/xaravel/php-minus.test.ts` -- XT-runtime-130: every probe label recomputed through `@xaravel/runtime/php`'s `minus`, int/float identity checked, root and subpath identity, probe key set equal to the cases' key set.
- `packages/runtime/tests/xaravel/php-set-functions.probe.{php,txt}` -- add `minus` to `$exports` and regenerate -- the test the new export makes stale, same component.

**Acceptance Criteria:**
- Given each matrix input, when `minus` is called through `@xaravel/runtime/php`, then its JSON-encoded typed result, or the exception class and message, equals the PHP 8.5.11 probe's record.
- Given the full suite, when `bun run harness`, `bun run typecheck` and `bun run lint` run, then the harness reports zero differences and all three exit 0.
- Given the finished item, when `bun run fidelity:review status --item epic-14-retro-item-8-runtime-minus --spec _bmad-output/implementation-artifacts/spec-epic-14-retro-item-8-runtime-minus.md` runs, then it prints `current`.

## Spec Change Log

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 12 findings — high 0, medium 0, low 8, false 4, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: the probe needs an outside `error_reporting=0` flag and prints warnings when run plainly — its header says to run it with error_reporting=0, the same convention as `php-array-sum.probe.php`; the committed record and the spec's Verification command both use the flag, so no wrong record can result.
  - `[low]` `[reject]` Blind: the probe does not print `PHP_VERSION` — the runtime probes share this convention (rejected on the same grounds for item 17); the local PHP is 8.5.11 and the record re-runs identically.
  - `[low]` `[patch]` Blind: the identity assertions in the test's `subtract` run inside the `try`, so a failing assertion is caught and recorded as a result string — direct correction: only `p.minus(a, b)` is inside the `try` now; the assertions and `t(difference)` run after it.
  - `[low]` `[reject]` Blind: no check that bigint operands with a small difference return a plain `number` — `minus` returns `intKey(difference)`, the same normalisation `plus` uses and the existing `plus` tests (XT-runtime-87) pin; no defect.
  - `[low]` `[reject]` Blind: missing coercion edge cases (`"1e1000"`, below-int64 strings, contract-token strings) — `minus` uses the same private `numeric`/`operands` as `plus` and `divide`, whose tests cover those paths; no defect shown.
  - `[low]` `[reject]` Blind: the doc sentence does not say `divide` also throws for arrays, nor that `minus` is not in the resolver — the sentence is accurate ("and PHP errors"); adding the extra clauses is not a correction of a wrong statement.
  - `[low]` `[reject]` Blind: `minus` copies `plus`'s int64 overflow logic — two three-line branches; a shared helper would refactor `plus`, which the item says to leave unchanged.
  - `[false]` `[reject]` Blind: the item's follow-up (item 7 out of `waiting_on_maintainer`, item 8 `done`) is missing — the orchestrator makes both edits in this PR after the build loop, as for earlier items; they are bookkeeping outside the reviewed diff.
  - `[false]` `[reject]` Blind: the spec is not in the reviewed diff — by design: the spec is the claims file, given to the edge-case layer separately.
  - `[low]` `[reject]` Blind: overflow cases do not test rounding of just-out-of-range results (`PHP_INT_MIN - 1025`) — the fallback is IEEE double subtraction of the two converted operands, as PHP's `sub_function` does on overflow; no defect shown.
  - `[false]` `[reject]` Blind: no large-int minus float case — `[p.PHP_INT_MAX, p.float(1)]` already covers an int beyond 2^53 against a float, and it matches PHP.
  - `[false]` `[reject]` Intent: reading R2 (the PR itself unparks item 7) is not in the diff — the same as the follow-up row: the orchestrator's PR carries the `retro-gates.yaml` and sprint-status edits.
- Edge Case Hunter: no findings. Verification Gap: no findings. Fidelity Review: two pass verdicts at tree ba950c225280b153eb2ef21249597243ad5484c9 before the patch; the patch changes the tree, so the Finalize re-check runs it again.

## Verification

**Commands:**
- `cd packages/runtime/tests/xaravel && php -d error_reporting=0 php-minus.probe.php | diff - php-minus.probe.txt` -- expected: no output; the same for `php-set-functions`.
- `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: zero differences.
- `bun run typecheck` and `bun run lint` -- expected: exit 0.
- `bun run harness` -- expected: zero differences (NOT-RUN Variants allowed).
- `bun run fidelity:review status --item epic-14-retro-item-8-runtime-minus --spec _bmad-output/implementation-artifacts/spec-epic-14-retro-item-8-runtime-minus.md` -- expected: `current`.

## Auto Run Result

Status: done

**Summary.** `@xaravel/runtime/php` and the package root export `minus(a, b)`, PHP 8.5.11's `$a - $b`. It classifies its operands with the same private `operands`/`numeric` as `plus` and `divide`. Two ints subtract exactly as int64 and overflow to float as PHP does; any float operand gives a float with the float marker. An array, an object or a non-numeric string throws PHP's `TypeError` `Unsupported operand types: <a> - <b>`. It is not in the PHP function-name resolver, since `-` is an operator.

**Files changed.**
- `packages/runtime/src/php/arithmetic.ts`: the `minus` export.
- `packages/runtime/src/php/index.ts`, `packages/runtime/src/index.ts`: export it.
- `packages/runtime/docs/php-chunk-sort-arith-callables.md`: names `minus` beside `plus` and `divide`.
- `packages/runtime/tests/xaravel/php-minus.{probe.php,probe.txt,test.ts}`: the PHP 8.5.11 evidence and XT-runtime-130.
- `packages/runtime/tests/xaravel/php-set-functions.probe.{php,txt}`: `minus` added to the root export list and the record regenerated from PHP. This was the one test the new export made stale, in the same component.

**Review.** One pass with 12 findings: 1 low patched (the test's identity assertions moved out of the `try`), 0 deferred, and 11 rejected with the reasons in the Review Triage Log. Patched by verdict: high 0, medium 0, low 1. The Fidelity Review passed twice at `ba950c225280b153eb2ef21249597243ad5484c9`, then twice again at the patched tree `46de759093e94f2911df595089df5544e1f4f844`, and its status there is `current`.

**Follow-up review:** false. No high or medium finding was patched.

**Verification.**
- Both probes, re-run with the local PHP 8.5.11, match their records exactly.
- `bun run typecheck` and `bun run lint` both exit 0.
- Full `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`, with 503 Xaravel Tests (498 passed, 5 skipped). The 7 NOT-RUN Variants are backends that are not running locally.

**Residual risks.**
- Item 7 still has to use `minus` for `LazyCollection.range`'s descending step; no consumer exercises it yet.

## Fidelity Review

### Reviewer 1: pass at tree ba950c225280b153eb2ef21249597243ad5484c9

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `8f70fc93b1fc561209054af20f18052f0560ea97`, on 2026-10-30T07:07:35.774Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are added or changed, and no Ported Test IDs are assigned. |
| F-2: No expected value is weakened | pass | The diff preserves existing expected values and adds exact PHP probe comparisons; exception classes and messages are not generalized. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted assertion markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-130 compares matching PHP subtraction inputs and exact typed outputs, including overflow, coercion, signed zero and unsupported-operand errors. The affected existing tests retain their consequence checks and include minus in the root-export probe. |
| F-8: No stub, fake or partial implementation of another Component | pass | All shown changes remain within the authorized runtime component; minus implements runtime arithmetic without substituting another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The touched source files retain no asyncRoot tags. The new minus export and arithmetic helpers are synchronous and perform neither IO nor async callback execution. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"ba950c225280b153eb2ef21249597243ad5484c9","base":"8f70fc93b1fc561209054af20f18052f0560ea97","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T07:07:35.774Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are added or changed, and no Ported Test IDs are assigned.","findings":[]},{"id":"F-2","result":"pass","note":"The diff preserves existing expected values and adds exact PHP probe comparisons; exception classes and messages are not generalized.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted assertion markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-130 compares matching PHP subtraction inputs and exact typed outputs, including overflow, coercion, signed zero and unsupported-operand errors. The affected existing tests retain their consequence checks and include minus in the root-export probe.","findings":[]},{"id":"F-8","result":"pass","note":"All shown changes remain within the authorized runtime component; minus implements runtime arithmetic without substituting another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The touched source files retain no asyncRoot tags. The new minus export and arithmetic helpers are synchronous and perform neither IO nor async callback execution.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree ba950c225280b153eb2ef21249597243ad5484c9

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `8f70fc93b1fc561209054af20f18052f0560ea97`, on 2026-10-30T07:07:35.774Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and no Ported Test, so there are no Upstream assertions to compare against. Every touched test is a Xaravel Test (XT-runtime-130, plus XT-runtime-83/84/85 through the shared probe files). |
| F-2: No expected value is weakened | pass | No Ported Test is touched. In the Xaravel Tests, the only change to existing evidence is php-set-functions.probe.php/.txt. It adds 'minus' to the list of root exports with function_exists false. That matches php-minus.probe.txt (function_exists('minus') is false and is_callable is false), and minus is not added to PHP_FUNCTIONS. No recorded value was loosened or changed to fit Xaravel's output. XT-runtime-130 compares every label with assertSame against the exact JSON from PHP. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed. The XT-runtime-83/84/85 bodies are unchanged; only their probe data gained one entry. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations line, so no new skip reason exists. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no '// adapted:DIV-<n>.<k>' marker and no Expectations 'adapted' field. The DIV-9.17 mentions are prose: a docblock and test comments saying the leading-numeric warning is not raised. That matches DIV-9.17's widened text ('every notice, warning and deprecation' from a construct helper). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The prompt reports no assigned Oracle request and no error fixture, base or changed. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-130 claims that minus subtracts as PHP 8.5.11's $a - $b does, keeps int64 and float identity, and throws PHP's TypeError for unsupported operands. The body recomputes every label in php-minus.probe.txt (ints, overflow, floats, coerced, leading, unsupported, function) and requires the recorded and computed label sets to be equal. It checks the gettype/isFloat marker on every result, bigint results (9007199254740993n-1, PHP_INT_MIN-(-1)), plain number for small ints, -0 and NaN, and instanceof p.TypeError. I traced minus against the recorded PHP output: numeric() / operands() coercion, overflow to float, the 'Unsupported operand types: <a> - <b>' names (bool, Closure, ArrayObject) and fqcn 'TypeError' all match. The consequence string cites no FR/AD id. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every change is inside packages/runtime (arithmetic.ts, both index exports, docs, tests), which the item's 'runtime' component scope allows. No stub, fake or hard-coded behaviour of another Component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | minus is a synchronous function with no Promise, IO or callback, and it carries no @​asyncRoot tag. Evidence (g) reports no @​asyncRoot tags in arithmetic.ts, src/index.ts or src/php/index.ts, so no tag is kept falsely and no new async export is untagged. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"ba950c225280b153eb2ef21249597243ad5484c9","base":"8f70fc93b1fc561209054af20f18052f0560ea97","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T07:07:35.774Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and no Ported Test, so there are no Upstream assertions to compare against. Every touched test is a Xaravel Test (XT-runtime-130, plus XT-runtime-83/84/85 through the shared probe files).","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test is touched. In the Xaravel Tests, the only change to existing evidence is php-set-functions.probe.php/.txt. It adds 'minus' to the list of root exports with function_exists false. That matches php-minus.probe.txt (function_exists('minus') is false and is_callable is false), and minus is not added to PHP_FUNCTIONS. No recorded value was loosened or changed to fit Xaravel's output. XT-runtime-130 compares every label with assertSame against the exact JSON from PHP.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed. The XT-runtime-83/84/85 bodies are unchanged; only their probe data gained one entry.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations line, so no new skip reason exists.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no `// adapted:DIV-<n>.<k>` marker and no Expectations `adapted` field. The DIV-9.17 mentions are prose: a docblock and test comments saying the leading-numeric warning is not raised. That matches DIV-9.17's widened text ('every notice, warning and deprecation' from a construct helper).","findings":[]},{"id":"F-6","result":"n/a","note":"The prompt reports no assigned Oracle request and no error fixture, base or changed.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-130 claims that minus subtracts as PHP 8.5.11's $a - $b does, keeps int64 and float identity, and throws PHP's TypeError for unsupported operands. The body recomputes every label in php-minus.probe.txt (ints, overflow, floats, coerced, leading, unsupported, function) and requires the recorded and computed label sets to be equal. It checks the gettype/isFloat marker on every result, bigint results (9007199254740993n-1, PHP_INT_MIN-(-1)), plain number for small ints, -0 and NaN, and instanceof p.TypeError. I traced minus against the recorded PHP output: numeric() / operands() coercion, overflow to float, the 'Unsupported operand types: <a> - <b>' names (bool, Closure, ArrayObject) and fqcn 'TypeError' all match. The consequence string cites no FR/AD id.","findings":[]},{"id":"F-8","result":"pass","note":"Every change is inside packages/runtime (arithmetic.ts, both index exports, docs, tests), which the item's 'runtime' component scope allows. No stub, fake or hard-coded behaviour of another Component is added.","findings":[]},{"id":"F-9","result":"pass","note":"minus is a synchronous function with no Promise, IO or callback, and it carries no @asyncRoot tag. Evidence (g) reports no @asyncRoot tags in arithmetic.ts, src/index.ts or src/php/index.ts, so no tag is kept falsely and no new async export is untagged.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 46de759093e94f2911df595089df5544e1f4f844

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `8f70fc93b1fc561209054af20f18052f0560ea97`, on 2026-10-30T07:24:34.608Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are added or changed, and no Ported Test IDs are assigned. |
| F-2: No expected value is weakened | pass | The changed probe expectation adds minus:false while preserving existing expected values. New subtraction cases use exact typed results and exact exception messages. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations lines are set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted assertion markers or Expectations adapted fields are added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixtures relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-130 checks the PHP probe's matching inputs and exact typed outputs, overflow, coercion, signed zero, non-finite results and unsupported-operand errors. Existing affected tests retain their checks, including every root export's resolver status. |
| F-8: No stub, fake or partial implementation of another Component | pass | All supplied changes are within the authorized runtime component. minus implements runtime arithmetic through shared coercion helpers without implementing another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The touched source files keep no asyncRoot tags. The new minus export and its arithmetic helpers are synchronous and perform no IO or async callback handling, consistent with AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"46de759093e94f2911df595089df5544e1f4f844","base":"8f70fc93b1fc561209054af20f18052f0560ea97","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T07:24:34.608Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are added or changed, and no Ported Test IDs are assigned.","findings":[]},{"id":"F-2","result":"pass","note":"The changed probe expectation adds minus:false while preserving existing expected values. New subtraction cases use exact typed results and exact exception messages.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations lines are set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted assertion markers or Expectations adapted fields are added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixtures relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-130 checks the PHP probe's matching inputs and exact typed outputs, overflow, coercion, signed zero, non-finite results and unsupported-operand errors. Existing affected tests retain their checks, including every root export's resolver status.","findings":[]},{"id":"F-8","result":"pass","note":"All supplied changes are within the authorized runtime component. minus implements runtime arithmetic through shared coercion helpers without implementing another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The touched source files keep no asyncRoot tags. The new minus export and its arithmetic helpers are synchronous and perform no IO or async callback handling, consistent with AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 46de759093e94f2911df595089df5544e1f4f844

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `8f70fc93b1fc561209054af20f18052f0560ea97`, on 2026-10-30T07:24:34.608Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Test and no Expectations line, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | pass | No Ported Test is changed. The only changed expected value is the added "minus":false key in php-set-functions.probe.txt resolver.exports. It is PHP's own function_exists('minus') result from the updated probe.php $exports list. The new php-minus probe records PHP output, and the test compares it exactly with assertSame on JSON. Nothing is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, and no assertion is removed. XT-runtime-83/84/85 bodies are unchanged; only the probe data they read gained one key. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted:DIV marker and no Expectations adapted field is added or changed. The DIV-9.17 citations are in comments and docs about the probe's warnings, not adaptation markers. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) says there are no Oracle fixtures, error or otherwise, for this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-130 recomputes every probe label through minus and asserts exact JSON equality. Checked against the code: int64 bigint results; overflow uses float(Number(a)-Number(b)) as PHP does; the float marker is kept and checked per case, with -0/+0, INF and NAN; numeric and leading-numeric string coercion goes through parseNumeric(allowErrors); the TypeError 'Unsupported operand types: <a> - <b>' comes from operands() with bool/class/Closure names. It also checks root export identity and TypeError class. This covers the consequence string, which cites no FR/AD token. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changes are in packages/runtime (src, docs, its own tests and probes). Nothing stubs or fakes another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | minus is synchronous and correctly has no tag. Evidence (g) lists no @​asyncRoot tags in the changed source files (index.ts, php/index.ts, arithmetic.ts), and no new export is async. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"46de759093e94f2911df595089df5544e1f4f844","base":"8f70fc93b1fc561209054af20f18052f0560ea97","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T07:24:34.608Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Test and no Expectations line, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test is changed. The only changed expected value is the added \"minus\":false key in php-set-functions.probe.txt resolver.exports. It is PHP's own function_exists('minus') result from the updated probe.php $exports list. The new php-minus probe records PHP output, and the test compares it exactly with assertSame on JSON. Nothing is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, and no assertion is removed. XT-runtime-83/84/85 bodies are unchanged; only the probe data they read gained one key.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted:DIV marker and no Expectations adapted field is added or changed. The DIV-9.17 citations are in comments and docs about the probe's warnings, not adaptation markers.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) says there are no Oracle fixtures, error or otherwise, for this item.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-130 recomputes every probe label through minus and asserts exact JSON equality. Checked against the code: int64 bigint results; overflow uses float(Number(a)-Number(b)) as PHP does; the float marker is kept and checked per case, with -0/+0, INF and NAN; numeric and leading-numeric string coercion goes through parseNumeric(allowErrors); the TypeError 'Unsupported operand types: <a> - <b>' comes from operands() with bool/class/Closure names. It also checks root export identity and TypeError class. This covers the consequence string, which cites no FR/AD token.","findings":[]},{"id":"F-8","result":"pass","note":"All changes are in packages/runtime (src, docs, its own tests and probes). Nothing stubs or fakes another Component.","findings":[]},{"id":"F-9","result":"pass","note":"minus is synchronous and correctly has no tag. Evidence (g) lists no @asyncRoot tags in the changed source files (index.ts, php/index.ts, arithmetic.ts), and no new export is async.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file is changed.","findings":[]}],"prior":[]}
```
