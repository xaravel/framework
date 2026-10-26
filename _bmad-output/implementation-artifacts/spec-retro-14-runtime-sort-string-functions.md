---
title: 'Runtime is_null, uasort and PHP string comparisons (epic-14-item-6-runtime-sort-string-functions)'
type: 'feature'
created: '2026-10-26'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
baseline_revision: '027144579fe6a95832a614a98b2ae73116b78ceb'
context:
  - '{project-root}/decisions/ESC-14.2-4.md'
  - '{project-root}/decisions/MAINT-2026-10-26-runtime-builtins.md'
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-retro-14-runtime-array-functions.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 14.2's twelve ESC-14.2-4 Test IDs call `is_null`, and `Collection::sortBy`'s `sortByMany` branch calls `uasort`, `strcmp`, `strcasecmp`, `strnatcmp`, `strnatcasecmp` and `strcoll`; `@xaravel/runtime` exports none of them. The monitor approved option 1 under the runtime-builtins standing rule (`decisions/ESC-14.2-4.md`); this is action item `epic-14-item-6-runtime-sort-string-functions`.

**Scope:** `packages/runtime/**` only, under amendment 2026-10-22 of `decisions/MAINT-2026-10-16-unattended-orchestrator.md`; this spec and sprint status may change too.

**Approach:** `@xaravel/runtime/php` and the package root export, under PHP's names, ports of PHP 8.5.11 (`ext/standard/type.c`, `ext/standard/array.c` `php_usort` / `php_array_user_compare_unstable`, `ext/standard/string.c`, `Zend/zend_operators.c` `zend_binary_strcmp` / `zend_binary_strcasecmp`, `strnatcmp.c`) in coercive typing mode: `is_null`; `uasort` over a `Ref`; and `strcmp`, `strcasecmp`, `strnatcmp`, `strnatcasecmp`, `strcoll`, built on the comparators `arrayRefFunctions.ts` already has for `asort` / `arsort` (no second copy).

## Boundaries & Constraints

**Always:**
- **Values and messages** are PHP 8.5.11's as the host's `php` gives them (a new probe). PHP's warnings and deprecations are not reproduced; the function returns PHP's value.
- **is_null(value)**: `true` for `null` and `undefined` (AD-9), `false` for anything else (a contract token is a string, a `PhpFloat` NaN a float).
- **String comparisons** take two PHP `string` parameters (`$string1`, `$string2`) through `stringParameter` (an int, float, bool or null its string; an object through its `__toString` port; anything else PHP's `TypeError` `strcmp(): Argument #1 ($string1) must be of type string, array given`) and compare UTF-8 bytes. A lone surrogate throws the existing JS `TypeError` naming the function. Results are PHP's ints, not only their signs:
  - `strcmp`: `zend_binary_strcmp` — the first differing bytes' difference (`strcmp("a","c")` is -2), else -1/0/1 by length.
  - `strcasecmp`: `zend_binary_strcasecmp` — the same after ASCII lower-casing (`strcasecmp("A","c")` is -2).
  - `strnatcmp` / `strnatcasecmp`: `strnatcmp_ex`, -1/0/1.
  - `strcoll`: C-locale `strcoll`, which is C `strcmp`: stops at a NUL byte, and gives the byte difference including the terminating 0 (`strcoll("ab","a")` is 98, `strcoll("é","e")` is 94).
- **No second copy.** The exports call `binaryCompare` and `strnatcmp` as they are. The private `localeCompare` is changed in place to C `strcmp`'s value (a byte difference rather than -1/1 at a length end); its sign, all `asort` / `arsort` read, is unchanged.
- **uasort(ref, callback)**: `ref` as `asort` takes it (`referencedArray`; PHP's `TypeError` for a `Ref` holding no array, the DIV-9.2 JS `TypeError` for a non-`Ref`); `callback` is a non-null `callable` as `array_any` takes it (`callbackParameter(..., false)`: `uasort(): Argument #2 ($callback) must be a valid callback, no array or string given` for null, DIV-9.13 for a callable string or array). Returns `true`.
  - Sorts by value, keys kept, with `zendSort` and PHP's stable fallback (ties keep their order); the written-back array keeps a `PhpArray`'s next free index as `asort` does (`keptArray`). An empty array is left as it is (the same JS value), and the callback is not called.
  - The callback gets `(a, b)`. Its result is read as `php_array_user_compare_unstable` reads it: `toInt` (PHP's `zval_get_long`: `0.5` is 0, `"1"` 1, `null` 0), then its sign. A `false` result calls the callback again with the operands swapped and negates that result's sign; `true` is 1.
  - A throw from the callback: PHP calls no further callback (each later comparison is 0, so the stable fallback orders the rest), writes the partly sorted array back, and the exception propagates. The port does the same.
- **Tests.** New XT cases use `xaravelTest` and `@xaravel/assert`. A PHP probe records every PHP-derived value; a recompute case checks every probe label with the runtime; a fresh-process case checks that the root and `@xaravel/runtime/php` export each new name as the same object.

**Never:**
- Change any existing export or behaviour: `asort` / `arsort` results stay the same.
- Import `@xaravel/contracts` from the runtime (AD-2), or add a contract token.
- Touch `conformance/expectations/**`, `decisions/**`, PORTING.md, `AGENTS.md`, or any package other than runtime.
- Port `setlocale` or any locale other than C for `strcoll`, or `usort` / `uksort`.
- Add a DIV clause, or change an existing assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| is_null | `null`, `undefined`, `0`, `""`, `[]`, `false`, a float NaN | `true`, `true`, then `false` | none |
| strcmp / strcasecmp | `("a","c")`, `("ab","a")`, `("a","ab")`, `("a", 1)`, `("A","c")` case-folded, `(null, "")`, `(1.5, "1.5")`, `("é","e")` | PHP's ints (-2, 1, -1, 48, -2, 0, 0, 94) | an array: PHP's `TypeError` naming argument and `$string1` / `$string2` |
| strnatcmp / strnatcasecmp | `("img12","img10")`, `("a2","a10")`, `("A2","a10")`, `("x01","x1")`, `("", "a")` | -1/0/1 as PHP | as above |
| strcoll | `("a","c")`, `("ab","a")`, `("a\0b","a\0c")`, `("é","e")` | -2, 98, 0, 94 | as above |
| uasort | `{x:3,y:1,5:2}` by `a <=> b`; ties under a `0` comparator; results `0.5`, `"1"`, `-7`, `true`, `false`, `null` | PHP's key order, `true` | `Ref(1)`: PHP's `TypeError`; null callback: PHP's `TypeError`; a non-`Ref`: JS `TypeError` |
| uasort throw | callback throws on its 2nd call | the exception propagates; `ref.value` is PHP's partly sorted array | — |
| uasort next free | `PhpArray` `{5:3, 1:1, 9:2}` with 9 unset, then sorted and appended | the append lands where PHP's does | none |

</intent-contract>

## Code Map

- `packages/runtime/src/php/arrayRefFunctions.ts`: `referencedArray` :22, `keptArray` :47, `strnatcmp` :235 (private `strnatcmp_ex`), `binaryCompare` :303 (`zend_binary_strcmp` / `strcasecmp`, returns PHP's exact value), `bytesOf` :320, `localeCompare` :328 (change to C `strcmp`'s value), `sortByValue` :356 (the `zendSort` + stable fallback pattern for `uasort`), `asort` / `arsort`. The new exports go here, beside the comparators.
- `packages/runtime/src/php/arrayFunctions.ts`: `callbackParameter` :104 (module-private; export it internally, not from the package, or mirror `requiredCallback` :570).
- `packages/runtime/src/php/phpArguments.ts`: `stringParameter` :34.
- `packages/runtime/src/php/casts.ts`: `toInt` :90 (PHP's `zval_get_long`).
- `packages/runtime/src/php/zendSort.ts`: `zendSort`.
- `packages/runtime/src/php/typeTests.ts`: `is_string` :88 pattern for `is_null`.
- `packages/runtime/src/php/index.ts`, `src/index.ts`: export lists; XT-runtime-37 (`tests/xaravel/docs.test.ts`) needs every exported name in backticks under `docs/`.
- `packages/runtime/docs/php-functions.md`: § Type tests, § By-reference array functions, § Sorting, § String functions, § Values JS cannot hold, § Not ported.
- `packages/runtime/tests/xaravel/php-array-functions.{test.ts,probe.php,probe.txt}`: the probe, recompute and fresh-process pattern to copy (XT-runtime-73).
- `conformance/upstream/framework/src/Illuminate/Collections/Collection.php` :1640-1680 (`sortByMany`): read-only caller.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/typeTests.ts` -- add `is_null` -- ESC-14.2-4 (1).
- `packages/runtime/src/php/arrayFunctions.ts` -- export `requiredCallback` internally (module export, not package export) -- reuse for `uasort`.
- `packages/runtime/src/php/arrayRefFunctions.ts` -- `uasort`, `strcmp`, `strcasecmp`, `strnatcmp`, `strnatcasecmp`, `strcoll`; `localeCompare` to C `strcmp`'s value; header comment -- ESC-14.2-4 (2).
- `packages/runtime/src/php/index.ts`, `packages/runtime/src/index.ts` -- export the seven names.
- `packages/runtime/docs/php-functions.md` -- document each export and limit.
- `packages/runtime/tests/xaravel/php-sort-string-functions.probe.php` and `.probe.txt` -- PHP evidence (`php -d error_reporting=0 php-sort-string-functions.probe.php > php-sort-string-functions.probe.txt`).
- `packages/runtime/tests/xaravel/php-sort-string-functions.test.ts` -- XT-runtime-74 (`is_null` and the string comparisons), XT-runtime-75 (`uasort`), XT-runtime-76 (probe recompute and fresh-process export check).

**Acceptance Criteria:**
- Given the matrix rows, when XT-runtime-74..76 run, then each row holds and every probe label matches PHP 8.5.11.
- Given the existing XT-runtime-70 `asort` / `arsort` cases, when they run after the `localeCompare` change, then they still pass.
- Given a fresh process, when the root or `@xaravel/runtime/php` loads, then every new name is exported as the same object from both.
- Given the change, when `bun run harness`, `bun run typecheck`, `bun run lint` and `bun run async-surface --check runtime` run, then there are no differences and no errors.
- Given the item, when `bun run fidelity:review status --item epic-14-item-6-runtime-sort-string-functions --spec <this spec>` runs, then it prints `current`.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 13, false 3, maybe-false 0
- findings:
  - `[low]` `patch` Blind: `strcmp` / `strcoll` magnitudes are the libc's `memcmp` / `strcmp` value, which the docs present as PHP's int — patched: the docs say the magnitudes are those PHP 8.5.11 gives on a byte-difference libc, as the probe records, and only the sign is portable.
  - `[low]` `reject` Blind: the string comparisons live in the array module — the spec places them beside the comparators they reuse (no second copy); moving four helpers to a new module is restructuring with no observable gain.
  - `[low]` `reject` Blind: nothing checks `requiredCallback` stays out of the package exports — the export lists are explicit named lists (`docs.test.ts` refuses `export *`), so a leak needs a deliberate list edit; unlikely.
  - `[low]` `reject` Blind: no test of what the callback sees through the `Ref` during a sort — `ref.value` is assigned once after `sortedArray` returns; pinning it needs a new probe case for a path no Collections caller takes.
  - `[low]` `reject` Blind: the throw-on-swapped-retry path is untested — a bool comparator that throws on its retry is unlikely in practice, and the path shares `call`'s single catch with the tested throw path.
  - `[low]` `reject` Blind: NaN, bigint and object callback results are not probed — those are `toInt` branches the existing cast tests pin; `uasort` adds only the sign.
  - `[low]` `reject` Blind: `is_null` of a contract token untested — `is_null` is `value === null || value === undefined`, so a token (an object) cannot be true; an assertion adds nothing.
  - `[low]` `reject` Blind: `userCompare` allocates per comparison and double-wraps the error — one small object per comparison beside a user callback call; no measurable cost.
  - `[low]` `reject` Blind: probe labels checked twice and the probe file re-read per label — the same pattern as XT-runtime-68..73; test-time only.
  - `[false]` `reject` Blind: the docs do not say `null` as a string argument is deprecated — the page's Common rules already say "PHP's warnings and deprecations are not reproduced".
  - `[low]` `patch` Blind: two edited docs lines exceed the 120-column wrap — patched: re-wrapped.
  - `[low]` `patch` Edge: a callback result `toInt` throws on (a symbol, an out-of-range bigint) escapes mid-sort with no write-back — patched: the sign is read inside the call's try, so it takes the throw path (write back, then rethrow).
  - `[low]` `reject` Edge: an async callback's Promise reads as 1 — PHP reads an object result as 1 too; the runtime is sync (AD-6) and no caller passes an async comparator; a guard adds a branch for an unlikely misuse.
  - `[low]` `reject` Edge: a callback can mutate a nested array operand — every runtime callback (`array_filter`, `array_map`, `array_any`) passes values the same way; copying here alone would make `uasort` inconsistent and slower.
  - `[false]` `reject` Intent: no test drives the functions as `sortByMany` composes them — that is Story 14.2's collections code, outside this item's runtime scope; each primitive is probed against PHP.
  - `[false]` `reject` Intent: `testValueRetrieverAcceptsDotNotation`'s `sortBy('foo.bar')` takes the `asort` branch, not `sortByMany` — descriptive; the ruling asks for the runtime exports so `sortBy` ports in full, which this delivers. No defect in the diff.
- Fidelity Review: 2 pass verdicts at tree 61cd2fa8 (reviewer 2 re-run on `claude-opus-5-5`); no findings. Verification gap layer: no findings.

### 2026-10-26 — Review pass (Finalize re-check, loop 1)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The patches changed the reviewed tree, so the Fidelity Review re-ran at tree a7244cac: 2 pass verdicts (codex/gpt-6.1-sol, claude/claude-opus-5-5).

## Auto Run Result

Status: done

**Summary.** `@xaravel/runtime/php` and the package root export `is_null`, `uasort` (a port of `php_usort` / `php_array_user_compare_unstable` over a `Ref`) and `strcmp`, `strcasecmp`, `strnatcmp`, `strnatcasecmp`, `strcoll` (C locale), which call the comparators `asort` / `arsort` already used. `localeCompare` now gives C `strcmp`'s value; its sign, and so every `asort` / `arsort` result, is unchanged.

**Files.**
- `packages/runtime/src/php/typeTests.ts`: `is_null`.
- `packages/runtime/src/php/arrayRefFunctions.ts`: `uasort`, the five string comparisons, `sortedArray` shared with `asort` / `arsort`, `localeCompare` to C `strcmp`'s value.
- `packages/runtime/src/php/arrayFunctions.ts`: `requiredCallback` a module (not package) export.
- `packages/runtime/src/php/index.ts`, `packages/runtime/src/index.ts`: the seven exports.
- `packages/runtime/docs/php-functions.md`: each export, the libc-magnitude note and the limits.
- `packages/runtime/tests/xaravel/php-sort-string-functions.{probe.php,probe.txt,test.ts}`: PHP 8.5.11 evidence and XT-runtime-74..76.

**Review.** 16 findings in the first pass: 3 `low` patched (sign read inside the callback's try; libc-magnitude docs note; docs re-wrap), 0 deferred, 13 rejected with the reasons in the triage log. Finalize re-check: no findings. Patched by verdict: high 0, medium 0, low 3, so no follow-up review is recommended.

**Verification.** Probe re-run diffs clean against `probe.txt`; `bun test packages/runtime` 76 pass; `bun run typecheck`, `bun run lint`, `bun run async-surface --check runtime` clean; `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`; `bun run fidelity:review status --item epic-14-item-6-runtime-sort-string-functions` prints `current` at tree a7244cac.

**Residual risks.** `strcmp` / `strcasecmp` / `strcoll` magnitudes are those of a byte-difference libc (the host's and glibc's); only the sign is portable. No test drives the functions as Story 14.2's `sortByMany` composes them; that is the Story's own work.

## Design Notes

- **Bool results.** PHP 8 deprecates a bool from a comparator but keeps old code working: `false` means "maybe less or equal", so it retries swapped (`php_array_user_compare_unstable`). The probe pins `fn($a, $b) => $a > $b`.
- **After a throw.** `zend_call_function` returns at once while an exception is pending, with an undefined result, which the comparator reads as 0. So the sort finishes with no more calls, and `php_usort` still writes the array back.

## Verification

**Commands:**
- `bun test packages/runtime`: all pass.
- `cd packages/runtime/tests/xaravel && php -d error_reporting=0 php-sort-string-functions.probe.php | diff - php-sort-string-functions.probe.txt`: no output.
- `bun run typecheck`, `bun run lint`, `bun run async-surface --check runtime`: clean.
- `bun run harness`: no differences.

## Fidelity Review

### Reviewer 1: pass at tree 61cd2fa8505e363e3fbd503dc98edf117dcaacee

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `027144579fe6a95832a614a98b2ae73116b78ceb`, on 2026-10-26T21:11:39.112Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are assigned, added or changed; the added tests are Xaravel Tests. |
| F-2: No expected value is weakened | pass | Compared the new expectations with the supplied PHP probe and recorded results. PHP values, ordering, exception classes and messages use exact comparisons; no existing expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions or existing test assertions are removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations lines are set to skip, so Skip Reason justification and precedence do not apply. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation markers or Expectations adapted fields are added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no Oracle error fixtures relied on by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-74 through XT-runtime-76 and their helpers with their consequence strings. Exact probe comparisons cover string results, coercions, errors, sorting stability, callback results and calls, exception write-back and next indexes; export checks include a fresh process. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared all changed paths and implementations with the runtime scope and ESC-14.2-4. Changes remain within runtime and reuse its comparators and sort implementation; no other Component is stubbed or partially implemented. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source files and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags, and the new functions perform synchronous computation with synchronous sorting callbacks, requiring no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"61cd2fa8505e363e3fbd503dc98edf117dcaacee","base":"027144579fe6a95832a614a98b2ae73116b78ceb","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T21:11:39.112Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are assigned, added or changed; the added tests are Xaravel Tests.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the new expectations with the supplied PHP probe and recorded results. PHP values, ordering, exception classes and messages use exact comparisons; no existing expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions or existing test assertions are removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations lines are set to skip, so Skip Reason justification and precedence do not apply.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation markers or Expectations adapted fields are added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no Oracle error fixtures relied on by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-74 through XT-runtime-76 and their helpers with their consequence strings. Exact probe comparisons cover string results, coercions, errors, sorting stability, callback results and calls, exception write-back and next indexes; export checks include a fresh process.","findings":[]},{"id":"F-8","result":"pass","note":"Compared all changed paths and implementations with the runtime scope and ESC-14.2-4. Changes remain within runtime and reuse its comparators and sort implementation; no other Component is stubbed or partially implemented.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source files and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags, and the new functions perform synchronous computation with synchronous sorting callbacks, requiring no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 61cd2fa8505e363e3fbd503dc98edf117dcaacee

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `027144579fe6a95832a614a98b2ae73116b78ceb`, on 2026-10-26T21:11:39.112Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests changed; only Xaravel Tests added. |
| F-2: No expected value is weakened | n/a | No Upstream expected values; no Ported Test touched. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests changed, so no Upstream assertions to count. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations lines added. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted markers added; DIV-9.2 and DIV-9.13 are cited only descriptively. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixtures relied on. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-74/75/76 bodies compare runtime output to PHP-recorded probe values for every case their consequence strings name (is_null, string comparisons, uasort semantics, errors, throw behaviour, next free index, exports). Probe labels are checked bidirectionally. No FR/AD tokens cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | Change is confined to packages/runtime and ESC-14.2-4 explicitly approves these builtins; strcmp-family reuse existing private comparators rather than a second copy; no other Component stubbed. |
| F-9: Every `@asyncRoot` tag is true | pass | No @​asyncRoot tags added; all new functions (uasort, strcmp family, is_null) are synchronous and the callback is a sync comparator. requiredCallback is exported only for internal use and is not exported from the package entries. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request files changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"61cd2fa8505e363e3fbd503dc98edf117dcaacee","base":"027144579fe6a95832a614a98b2ae73116b78ceb","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T21:11:39.112Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests changed; only Xaravel Tests added.","findings":[]},{"id":"F-2","result":"n/a","note":"No Upstream expected values; no Ported Test touched.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests changed, so no Upstream assertions to count.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations lines added.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted markers added; DIV-9.2 and DIV-9.13 are cited only descriptively.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixtures relied on.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-74/75/76 bodies compare runtime output to PHP-recorded probe values for every case their consequence strings name (is_null, string comparisons, uasort semantics, errors, throw behaviour, next free index, exports). Probe labels are checked bidirectionally. No FR/AD tokens cited.","findings":[]},{"id":"F-8","result":"pass","note":"Change is confined to packages/runtime and ESC-14.2-4 explicitly approves these builtins; strcmp-family reuse existing private comparators rather than a second copy; no other Component stubbed.","findings":[]},{"id":"F-9","result":"pass","note":"No @asyncRoot tags added; all new functions (uasort, strcmp family, is_null) are synchronous and the callback is a sync comparator. requiredCallback is exported only for internal use and is not exported from the package entries.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request files changed.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 61cd2fa8505e363e3fbd503dc98edf117dcaacee

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `027144579fe6a95832a614a98b2ae73116b78ceb`, on 2026-10-26T21:13:45.021Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds no Ported Tests or assigned Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared the new runtime expectations with the supplied PHP probe outputs. Values, ordering, exception classes and messages are compared exactly; no existing expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or modifies no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no assertion adapted markers or Expectations adapted fields to check. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The item relies on no Oracle error fixtures; the supplied PHP probe records are not Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-74 through XT-runtime-76 and their helpers with their consequence strings and PHP probes. They check comparisons, coercions, errors, stable keyed sorting, callback results and calls, throw write-back, next indexes, every recorded label and fresh-process export identity. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the changed paths and implementations with the runtime scope and ESC-14.2-4. All changes stay within runtime, reuse its comparators and implement no other Component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the touched source declarations with AD-6 and DIV-1. They retain no asyncRoot tags and introduce synchronous computations and synchronous sort callbacks requiring no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"61cd2fa8505e363e3fbd503dc98edf117dcaacee","base":"027144579fe6a95832a614a98b2ae73116b78ceb","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T21:13:45.021Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds no Ported Tests or assigned Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the new runtime expectations with the supplied PHP probe outputs. Values, ordering, exception classes and messages are compared exactly; no existing expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or modifies no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no assertion adapted markers or Expectations adapted fields to check.","findings":[]},{"id":"F-6","result":"n/a","note":"The item relies on no Oracle error fixtures; the supplied PHP probe records are not Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-74 through XT-runtime-76 and their helpers with their consequence strings and PHP probes. They check comparisons, coercions, errors, stable keyed sorting, callback results and calls, throw write-back, next indexes, every recorded label and fresh-process export identity.","findings":[]},{"id":"F-8","result":"pass","note":"Compared the changed paths and implementations with the runtime scope and ESC-14.2-4. All changes stay within runtime, reuse its comparators and implement no other Component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the touched source declarations with AD-6 and DIV-1. They retain no asyncRoot tags and introduce synchronous computations and synchronous sort callbacks requiring no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 61cd2fa8505e363e3fbd503dc98edf117dcaacee

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `027144579fe6a95832a614a98b2ae73116b78ceb`, on 2026-10-26T21:13:45.021Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and touches no Ported Test or stale_tests file; only Xaravel Tests XT-runtime-74..76 are added, which have no Upstream assertions to match. |
| F-2: No expected value is weakened | n/a | No Ported Test or stale cross-scope test is changed, so no Upstream expected value exists to weaken. The Xaravel Tests compare exact strings (assertSame against the recorded PHP 8.5.11 probe JSON); the only substring check (assertJsTypeError) is on Xaravel-only JS TypeError messages with no PHP counterpart. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there is no Upstream assertion count to compare; no adapted:DIV marker is present. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or changes no Expectations line (evidence (i) confirms no skip lines). |
| F-5: Every `adapted` marker matches its clause | n/a | No '// adapted:DIV-<n>.<k>' marker or Expectations 'adapted' field is added. DIV-9.2 and DIV-9.13 are cited only in docs and runtime messages describing Ref arguments and unported callable strings and arrays, which match those clauses' text. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixture is assigned or relied on; evidence (c) lists no error fixtures, and the tests use the committed PHP probe record instead. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-74 asserts the is_null, strcmp, strcasecmp, strnatcmp, strnatcasecmp, strcoll and strings.errors probe labels exactly. It also covers is_null(undefined), lone-surrogate JS TypeErrors for each comparison, and SORT_LOCALE_STRING order, matching its consequence. XT-runtime-75 asserts the uasort probes: keys kept and ties stable, (int)+sign result reading with false retried swapped, call sequences, the PhpArray next free index, throw write-back with no further calls, and TypeErrors, plus Xaravel-only cases. XT-runtime-76 recomputes every probe label, checks the label sets are equal, and checks export identity in a fresh process. Hand-checked values agree with the implementation (strcmp('é','e')=94, strcoll('a\0','ab')=-98, 1e20 read as positive via floatToInt, next free 3 for the unset list). No FR or AD tokens are cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | All source changes are in packages/runtime, the item's component, as ESC-14.2-4 under MAINT-2026-10-26-runtime-builtins directs. strcmp, strcasecmp, strnatcmp and strnatcasecmp reuse the existing private binaryCompare and strnatcmpEx; strcoll reuses localeCompare, whose change keeps every comparison sign, so asort/arsort ordering is unchanged. requiredCallback was only exported internally. No stub or fake of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in any changed file. Every new export (is_null, uasort, strcmp, strcasecmp, strnatcmp, strnatcasecmp, strcoll) is synchronous, does no IO and returns no Promise. uasort takes a callback but is a sync API, like Collection sort under DIV-1, so it correctly takes no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"61cd2fa8505e363e3fbd503dc98edf117dcaacee","base":"027144579fe6a95832a614a98b2ae73116b78ceb","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T21:13:45.021Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and touches no Ported Test or stale_tests file; only Xaravel Tests XT-runtime-74..76 are added, which have no Upstream assertions to match.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test or stale cross-scope test is changed, so no Upstream expected value exists to weaken. The Xaravel Tests compare exact strings (assertSame against the recorded PHP 8.5.11 probe JSON); the only substring check (assertJsTypeError) is on Xaravel-only JS TypeError messages with no PHP counterpart.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream assertion count to compare; no adapted:DIV marker is present.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or changes no Expectations line (evidence (i) confirms no skip lines).","findings":[]},{"id":"F-5","result":"n/a","note":"No `// adapted:DIV-<n>.<k>` marker or Expectations `adapted` field is added. DIV-9.2 and DIV-9.13 are cited only in docs and runtime messages describing Ref arguments and unported callable strings and arrays, which match those clauses' text.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixture is assigned or relied on; evidence (c) lists no error fixtures, and the tests use the committed PHP probe record instead.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-74 asserts the is_null, strcmp, strcasecmp, strnatcmp, strnatcasecmp, strcoll and strings.errors probe labels exactly. It also covers is_null(undefined), lone-surrogate JS TypeErrors for each comparison, and SORT_LOCALE_STRING order, matching its consequence. XT-runtime-75 asserts the uasort probes: keys kept and ties stable, (int)+sign result reading with false retried swapped, call sequences, the PhpArray next free index, throw write-back with no further calls, and TypeErrors, plus Xaravel-only cases. XT-runtime-76 recomputes every probe label, checks the label sets are equal, and checks export identity in a fresh process. Hand-checked values agree with the implementation (strcmp('é','e')=94, strcoll('a\\0','ab')=-98, 1e20 read as positive via floatToInt, next free 3 for the unset list). No FR or AD tokens are cited.","findings":[]},{"id":"F-8","result":"pass","note":"All source changes are in packages/runtime, the item's component, as ESC-14.2-4 under MAINT-2026-10-26-runtime-builtins directs. strcmp, strcasecmp, strnatcmp and strnatcasecmp reuse the existing private binaryCompare and strnatcmpEx; strcoll reuses localeCompare, whose change keeps every comparison sign, so asort/arsort ordering is unchanged. requiredCallback was only exported internally. No stub or fake of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in any changed file. Every new export (is_null, uasort, strcmp, strcasecmp, strnatcmp, strnatcasecmp, strcoll) is synchronous, does no IO and returns no Promise. uasort takes a callback but is a sync API, like Collection sort under DIV-1, so it correctly takes no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree a7244caccca4eeff7d661f6f0c076ddcfbe61618

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `027144579fe6a95832a614a98b2ae73116b78ceb`, on 2026-10-26T21:19:23.530Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared the new test expectations with the supplied PHP probe and recorded results. PHP values, ordering, exception classes and messages are compared exactly; no existing expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test or existing assertion is changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or changes no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no assertion adapted markers or Expectations adapted fields to compare with DIV clauses. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The action item relies on no Oracle error fixtures; the supplied PHP probe records are not Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-74 through XT-runtime-76 and their helpers with their consequence strings. They check comparison results and coercions, sorting stability and callback calls, exception write-back, next indices, all recorded probe labels and fresh-process export identity. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared all changed paths and implementations with the runtime scope and ESC-14.2-4. Changes remain within runtime, reuse its existing comparators and sorting machinery, and introduce no implementation of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source declarations and complete bodies with AD-6 and DIV-1. They retain no asyncRoot tags and introduce synchronous operations with synchronous sorting callbacks, requiring no new tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"a7244caccca4eeff7d661f6f0c076ddcfbe61618","base":"027144579fe6a95832a614a98b2ae73116b78ceb","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T21:19:23.530Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the new test expectations with the supplied PHP probe and recorded results. PHP values, ordering, exception classes and messages are compared exactly; no existing expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test or existing assertion is changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or changes no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no assertion adapted markers or Expectations adapted fields to compare with DIV clauses.","findings":[]},{"id":"F-6","result":"n/a","note":"The action item relies on no Oracle error fixtures; the supplied PHP probe records are not Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-74 through XT-runtime-76 and their helpers with their consequence strings. They check comparison results and coercions, sorting stability and callback calls, exception write-back, next indices, all recorded probe labels and fresh-process export identity.","findings":[]},{"id":"F-8","result":"pass","note":"Compared all changed paths and implementations with the runtime scope and ESC-14.2-4. Changes remain within runtime, reuse its existing comparators and sorting machinery, and introduce no implementation of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source declarations and complete bodies with AD-6 and DIV-1. They retain no asyncRoot tags and introduce synchronous operations with synchronous sorting callbacks, requiring no new tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree a7244caccca4eeff7d661f6f0c076ddcfbe61618

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `027144579fe6a95832a614a98b2ae73116b78ceb`, on 2026-10-26T21:19:23.530Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and the change adds or changes no Ported Test; there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test and no stale_tests file is touched. The only tests are new Xaravel Tests (XT-runtime-74..76), whose expected values are PHP 8.5.11 probe outputs recorded in php-sort-string-functions.probe.txt. No Upstream expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so no Upstream assertion count applies. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or changes no Expectations line; no skip reason is set. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no '// adapted:DIV-<n>.<k>' marker and no Expectations 'adapted' field. DIV-9.2 and DIV-9.13 are cited only in docs and error messages, not as adaptation markers. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no assigned committed request and no changed fixture whose output is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared each consequence string with its body. XT-runtime-74 checks is_null for null and undefined against PHP's recorded falses. It checks strcmp, strcasecmp and strcoll byte differences and strnatcmp/strnatcasecmp order against the probe, and the string-parameter TypeError messages via strings.errors. Spot-checks against hand calculation agree: strcoll(1,'10') = -48, strcasecmp('É','é') = -32, strcasecmp('Z','a') = 25. XT-runtime-75 covers kept keys and ties (uasort), the (int)-then-sign reading and the false retry (uasort.results, uasort.calls), and the zend_sort call order (uasort.calls). It also covers the PhpArray next free index (uasort.next, kept/push 10), stopping after a throw with write-back and rethrow (uasort.throw plus the identity and symbol cases), and the TypeErrors (uasort.errors). XT-runtime-76 recomputes every probe label, checks the label set matches PROBE_CASES, and checks root and php export identity in a fresh process. No FR/AD tokens are cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | All source edits are in packages/runtime (typeTests.ts, arrayRefFunctions.ts, arrayFunctions.ts, the index files), the action item's own component. The comparators are real ports reused from the existing asort/arsort code, as ESC-14.2-4 requires. requiredCallback is exported only within the runtime package and the package entries do not re-export it. No stub or fake of another Component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tag in any changed source file. The new exports (is_null, uasort, strcmp, strcasecmp, strnatcmp, strnatcasecmp, strcoll) are synchronous, return number/boolean/true, do no IO, and take only sync callbacks (uasort's comparator, as PHP's). None needs a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"a7244caccca4eeff7d661f6f0c076ddcfbe61618","base":"027144579fe6a95832a614a98b2ae73116b78ceb","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T21:19:23.530Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and the change adds or changes no Ported Test; there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test and no stale_tests file is touched. The only tests are new Xaravel Tests (XT-runtime-74..76), whose expected values are PHP 8.5.11 probe outputs recorded in php-sort-string-functions.probe.txt. No Upstream expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so no Upstream assertion count applies.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or changes no Expectations line; no skip reason is set.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no `// adapted:DIV-<n>.<k>` marker and no Expectations `adapted` field. DIV-9.2 and DIV-9.13 are cited only in docs and error messages, not as adaptation markers.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no assigned committed request and no changed fixture whose output is an error.","findings":[]},{"id":"F-7","result":"pass","note":"Compared each consequence string with its body. XT-runtime-74 checks is_null for null and undefined against PHP's recorded falses. It checks strcmp, strcasecmp and strcoll byte differences and strnatcmp/strnatcasecmp order against the probe, and the string-parameter TypeError messages via strings.errors. Spot-checks against hand calculation agree: strcoll(1,'10') = -48, strcasecmp('É','é') = -32, strcasecmp('Z','a') = 25. XT-runtime-75 covers kept keys and ties (uasort), the (int)-then-sign reading and the false retry (uasort.results, uasort.calls), and the zend_sort call order (uasort.calls). It also covers the PhpArray next free index (uasort.next, kept/push 10), stopping after a throw with write-back and rethrow (uasort.throw plus the identity and symbol cases), and the TypeErrors (uasort.errors). XT-runtime-76 recomputes every probe label, checks the label set matches PROBE_CASES, and checks root and php export identity in a fresh process. No FR/AD tokens are cited.","findings":[]},{"id":"F-8","result":"pass","note":"All source edits are in packages/runtime (typeTests.ts, arrayRefFunctions.ts, arrayFunctions.ts, the index files), the action item's own component. The comparators are real ports reused from the existing asort/arsort code, as ESC-14.2-4 requires. requiredCallback is exported only within the runtime package and the package entries do not re-export it. No stub or fake of another Component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tag in any changed source file. The new exports (is_null, uasort, strcmp, strcasecmp, strnatcmp, strnatcasecmp, strcoll) are synchronous, return number/boolean/true, do no IO, and take only sync callbacks (uasort's comparator, as PHP's). None needs a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```
