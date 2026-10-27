---
title: 'Runtime set functions, array_pad, is_int, arrayUnion and the PHP function-name resolver (epic-14-item-9-runtime-set-functions-callable-names)'
type: 'feature'
created: '2026-10-26'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
baseline_revision: 'f8957ff3de5476dbf99fa080eae5ea6477887bd6'
context:
  - '{project-root}/decisions/ESC-14.4-1.md'
  - '{project-root}/decisions/ESC-14.4-2.md'
  - '{project-root}/conformance/escalations/ESC-14.4-2.md'
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/decisions/MAINT-2026-10-26-runtime-builtins.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-retro-14-runtime-round-string-functions.md'
warnings: ['oversized']
deferred:
  - summary: >-
      packages/collections' callCallable, Conditionable's when / unless and Reflector::isCallable do not read the runtime's phpFunction resolver yet, which amended DIV-9.13 / DIV-9.14 describe.
    evidence: |-
      packages/collections/src/support/callables.ts callCallable throws for every string, so Collection.random / LazyCollection.makeIterator, which check is_callable first, now throw for a registry name; packages/reflection/src/Reflector.ts isCallableValue and packages/conditionable callableArgument still refuse function names. All three are outside this item's packages/runtime scope.
    location: >-
      packages/collections/src/support/callables.ts, packages/reflection/src/Reflector.ts, packages/conditionable/src/Traits/Conditionable.ts
    severity: medium
  - summary: >-
      ReflectionFunction does not read the phpFunctions registry, so new ReflectionFunction('strcasecmp') throws where PHP reflects the function.
    evidence: |-
      Pre-existing; changing it is outside this item's "no other runtime behaviour changes". Documented under "Not ported".
    location: >-
      packages/runtime/src/php/ReflectionFunction.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 14.4's 66 held Test IDs need PHP builtins `@xaravel/runtime` lacks (ESC-14.4-1: the set and merge functions, `array_pad`, `is_int`, and a helper for PHP's array `+`), and eight Upstream tests pass the PHP callable string `'strcasecmp'` as a callback, which the runtime refuses (ESC-14.4-2, DIV-9.13 / DIV-9.14 as amended). This is action item `epic-14-item-9-runtime-set-functions-callable-names`.

**Scope:** `packages/runtime/**` only, under amendment 2026-10-22 of `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. This spec and sprint status may change too.

**Approach:** `@xaravel/runtime/php` and the package root export, under their PHP names, ports of PHP 8.5.11 `ext/standard/array.c` (`array_merge_recursive`, `array_replace`, `array_replace_recursive`, `array_diff`, `array_diff_assoc`, `array_diff_key`, `array_intersect`, `array_udiff`, `array_diff_uassoc`, `array_diff_ukey`, `array_uintersect`, `array_intersect_uassoc`, `array_pad`), `is_int` (`ext/standard/type.c`), and `arrayUnion(a, b)` for `$a + $b` on arrays (`zend_operators.c` `add_function_array`). A new registry of PHP's global functions that the runtime exports resolves a PHP callable string to that export; `callbackParameter` and `is_callable` read it.

## Boundaries & Constraints

**Always:**
- **Values, messages and callback call sequences** are the ones PHP 8.5.11 gives on the host, recorded by a new probe.
- **Set functions.** Each ports its `PHP_FUNCTION` and the shared `php_array_diff` / `php_array_diff_key` / `php_array_intersect` / `php_array_intersect_key` paths as written, keys kept, result in `array`'s order, AD-9 form out (`arrayFromEntries`).
  - Internal data comparison is PHP's string comparison (`(string) $a === (string) $b`; an array reads as `"Array"`), so an object without a `__toString` port throws PHP's `Error` `Object of class <FQCN> could not be converted to string`. Key comparison is PHP's normalised key (`"1"` and `1` are one key).
  - The user-callback forms take the callback as the last argument (`array_udiff($array, ...$arrays, $value_compare_func)`), coerce its result as `php_get_long` does, and call it in PHP's order: where PHP sorts with the callback (`zend_sort` in `php_array_diff` / `php_array_intersect`), the runtime sorts with `zendSort`, so an inconsistent comparator gives PHP's result. The probe records the call log of a logging comparator for each form.
  - Errors as PHP gives them: a non-array argument throws PHP's `TypeError` `<fn>(): Argument #<n> must be of type array, <type> given` (with `($array)` for #1 where PHP names it); too few arguments throws PHP's `ArgumentCountError`; a callback that is no valid callback throws `callbackParameter`'s `TypeError`.
- **array_merge_recursive / array_replace / array_replace_recursive** port `php_array_merge_recursive` / `zend_hash_merge` / `php_array_replace_recursive`: int keys renumbered (merge) or kept (replace), string keys merged into a nested array (merge) or replaced recursively (replace); no argument gives `[]` for `array_merge_recursive`; recursion on a self-referencing value throws PHP's `Error` `Recursion detected`.
- **array_pad(array, length, value)**: `length` as an `int` (`intParameter`); `|length| > HT_MAX_SIZE` throws PHP's `ValueError` `array_pad(): Argument #2 ($length) must not exceed the maximum allowed array size`; no padding when `count >= |length|`; negative pads on the left; int keys renumbered, string keys kept.
- **is_int(value)**: `true` for an int (`phpType` `"int"`: a non-float-marked integral number or a bigint) only.
- **arrayUnion(a, b)**: `a`'s entries, then each entry of `b` whose key `a` lacks; non-arrays throw PHP's `TypeError` `Unsupported operand types: <type> + <type>`.
- **Function-name resolver.** A frozen registry in its own file maps the lower-cased name of every PHP global function that the runtime exports under its PHP name (never a helper such as `arrayEntries` or `arrayUnion`, a class or a constant) to the export, with PHP's required and total parameter counts, variadic flag and by-reference positions.
  - A string callback with no `::`, after one leading `\` is dropped, resolves case-insensitively. The resolved callback checks the argument count as PHP does for an internal function (`ArgumentCountError` `<name>() expects exactly|at least|at most <n> argument(s), <m> given`, `<name>` as PHP's canonical name), wraps a by-reference argument that is no `Ref` in a fresh `Ref` (PHP's warning not reproduced), then calls the export.
  - `callbackParameter` (and so every runtime function that takes a callback) calls a resolved name; a name the registry lacks keeps its current `TypeError`. `is_callable` gives `true` for a resolved name; `callable_name` stays the string as given.
  - `'Class::method'` strings, callable arrays, class constructors and contract tokens keep their current handling.
  - A test checks the registry against PHP: for each entry the probe records `ReflectionFunction`'s counts, variadic flag and by-reference positions, and the runtime's root exports are scanned so a PHP-named function export missing from the registry fails it.
- **Tests.** New XT cases use `xaravelTest` and `@xaravel/assert`. The probe records every value PHP gives; a recompute case checks every probe label against the runtime; a fresh-process case checks the root and `@xaravel/runtime/php` export each new name as the same object. Docs list every new export (XT-runtime-37).

**Never:**
- Change an existing export or behaviour other than a registry name now resolving where it threw.
- Make `packages/reflection`'s `Reflector::isCallable` or `packages/collections`'s `callCallable` read the resolver (outside this item's scope; the resolver is exported as `phpFunction(name)` so their Stories can).
- Reproduce PHP's warnings or deprecations.
- Import `@xaravel/contracts` (AD-2), touch `conformance/**`, `decisions/**`, PORTING.md or another package, add a DIV clause, or change an existing assertion.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected | Error |
|---|---|---|---|
| diff / intersect | `[1,"1",2,"a",null,1.0,true]` against `["1","",2.5]`; keyed arrays; 3 arrays; empty first | PHP's arrays, keys kept | none |
| string compare | values `[]`, a `__toString` object; an object without | `"Array"` / its string | PHP's `Error` |
| diff_key / diff_assoc | `["1"=>a, 1=>b]`, `{a:1,b:"1"}` vs `{a:"1"}` | PHP's arrays | none |
| callback forms | `strcasecmp` string; a closure; a logging closure returning `$a <=> $b`, `$a > $b`, a constant | PHP's arrays and call logs | callback missing or invalid → PHP's / `callbackParameter`'s `TypeError` |
| merge / replace | nested string keys, int keys, scalars merged with arrays, 0 / 1 / 3 arguments | PHP's arrays | non-array → `TypeError` |
| array_pad | `[1,2], 5, 0`; `-5`; `1`; `{a:1, 5:2}, 4, x`; `2**30+1` | PHP's arrays | `ValueError` beyond the limit |
| is_int | `1`, `float(1)`, `1n`, `"1"`, `true`, `null` | `true`, `false`, `true`, `false`… | none |
| arrayUnion | `[1,2]+[3,4,5]`; keyed; `"1"` vs `1` keys | PHP's arrays | non-array → `TypeError` |
| resolver | `'strcasecmp'`, `'STRCASECMP'`, `'\strcasecmp'`, `'nope'`, `'strtoupper'` with 2 args, `'strcasecmp'` with 1, `'reset'` via `array_map` | the call; arity `ArgumentCountError`; `reset` gets a fresh `Ref` | `'nope'` → current `TypeError` |
| is_callable | same names, `callable_name` | PHP's booleans and names | none |

</intent-contract>

## Code Map

- `packages/runtime/src/php/arrayFunctions.ts`: `callbackParameter` :104 (reads the resolver for a string), `unportedCallable` :93 (kept for names it lacks), `requiredCallback` :571, `intersectArguments` :725 and `keyId` :737 (reuse for the set functions), `array_intersect_assoc` :757 (string-compare pattern), `array_merge` :511, `regularCompare` / `zendSort` import (user-callback sorts). The new set and merge functions go here.
- `packages/runtime/src/php/zendSort.ts`: PHP's hybrid insertion sort, for the callback forms.
- `packages/runtime/src/php/typeTests.ts`: `isCallable` :217 (string branch, `separator <= 0`), `is_callable` :291, `is_bool`; `is_int` goes beside it.
- `packages/runtime/src/php/phpArguments.ts`: `arrayParameter`, `intParameter`, `argumentTypeError`; `casts.ts`: `toPhpString`, `toInt`; `ArgumentCountError.ts`.
- New `packages/runtime/src/php/phpFunctions.ts`: the registry and `phpFunction(name)`; it imports the exports it lists (watch for import cycles with `arrayFunctions.ts`, e.g. resolve lazily).
- `packages/runtime/src/php/index.ts` and `src/index.ts`: export lists (case-insensitive order).
- `packages/runtime/docs/php-functions.md` ("Array functions", "Type tests", "Callables", "Not ported") and `docs/php-builtins.md`.
- `packages/runtime/tests/xaravel/php-round-string-functions.{test.ts,probe.php,probe.txt}`: the probe, recompute and fresh-process pattern to copy.
- PHP 8.5.11 sources (fetched to `/tmp/phpsrc-item9/`, not committed): `ext/standard/array.c` :4079-4470 (merge / replace), :4839 (pad), :5165-5565 (intersect), :5566-6070 (diff); `Zend/zend_API.c` (`zend_is_callable_check_func`, `zend_wrong_parameters_count_error`).
- Read-only callers: `conformance/upstream/framework/src/Illuminate/Collections/Collection.php` :289, :312, :335, :675, :698.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/arrayFunctions.ts`: add the thirteen array functions and `arrayUnion`; `callbackParameter` resolves names; update the header.
- `packages/runtime/src/php/phpFunctions.ts`: add the registry and `phpFunction`.
- `packages/runtime/src/php/typeTests.ts`: add `is_int`; `isCallable` resolves names; update `is_callable`'s doc.
- `packages/runtime/src/php/index.ts`, `packages/runtime/src/index.ts`: export every new name.
- `packages/runtime/docs/php-functions.md`, `docs/php-builtins.md`: document each export and its limits.
- `packages/runtime/tests/xaravel/php-set-functions.probe.php` and `.probe.txt`: the PHP evidence (`php -d error_reporting=0 php-set-functions.probe.php > php-set-functions.probe.txt`).
- `packages/runtime/tests/xaravel/php-set-functions.test.ts`: XT-runtime-83 (set, merge, replace, pad, `is_int`, `arrayUnion`), XT-runtime-84 (the resolver, `callbackParameter`, `is_callable`, the registry against PHP's reflection and the root exports), XT-runtime-85 (the probe recompute and the fresh-process export check).
- Existing runtime tests that assert a registry name is refused as a callback or not callable: update only where the amended DIV-9.13 / DIV-9.14 now resolve it, naming each in the Spec Change Log.

**Acceptance Criteria:**
- Given the matrix rows, when XT-runtime-83..85 run, then each row holds and every probe label matches PHP 8.5.11.
- Given the change, when `bun run harness`, `bun run typecheck`, `bun run lint` and `bun run async-surface --check runtime` run, then they report no differences and no errors.
- Given the item, when `bun run fidelity:review status --item epic-14-item-9-runtime-set-functions-callable-names --spec <this spec>` runs, then it prints `current`.

## Spec Change Log

- 2026-10-26, implementation: existing runtime tests that asserted a registry name is refused as a callback or not callable, updated because the amended DIV-9.13 / DIV-9.14 now resolve it (each now uses `'str_rot13'`, a PHP function the runtime does not export, so the refusal it checks still holds): `tests/xaravel/php-functions.test.ts` XT-runtime-58 (`array_filter([1], "strlen")`), `tests/xaravel/php-sort-string-functions.test.ts` XT-runtime-75 (`uasort(…, "strcmp")`), `tests/xaravel/php-type-tests.test.ts` XT-runtime-63 (`is_callable("strlen")` false, now asserted `true`, with `is_callable("str_rot13")` false) and XT-runtime-65 (`array_map("strtoupper", …)`), and `tests/xaravel/php-array-functions.test.ts` XT-runtime-68 (`array_any([1], "strlen")`).
- 2026-10-26, implementation: PHP's argument-count check for the five `"+f"` callback forms (`array_udiff`, `array_diff_uassoc`, `array_diff_ukey`, `array_uintersect`, `array_intersect_uassoc`) uses `zend_parse_parameters`' minimum of 2, where `ReflectionFunction` reports 1 required parameter (probe label `resolver.counts`: `array_udiff() expects at least 2 arguments, 0 given`). The registry keeps the reflected counts the Always rule asks for and adds a `minimum` (2 for those five, else `required`) that the resolved callback checks, so "checks the argument count as PHP does" holds.
- 2026-10-26, implementation: PHP names no parameter in a callback form's callback error (`array_udiff(): Argument #3 must be a valid callback, …`, the variadic `$rest`), so `callbackParameter` takes an optional parameter name (default `callback`, the existing message) and the callback forms pass none. `userCompare` (`php_array_user_compare_unstable`) moved from `arrayRefFunctions.ts` to `arrayFunctions.ts`, unchanged, so `uasort` and the set functions share it without a new import cycle.
- 2026-10-26, implementation: the probe's `is_int(-0)`: PHP's `-0` is the int 0, so the recompute passes `0`; JS `-0` is a float under AD-9 and `is_int(-0)` is `false` (asserted Xaravel-only).
- 2026-10-26, implementation: the ESC-14.4-1 ruling names a PORTING.md idiom-table row for `arrayUnion`; this spec's Never rule keeps PORTING.md out of scope, so the docs and the source comment say only that a port writes `arrayUnion` for `+` on arrays. The row is left for the change the ruling assigns it to.
- 2026-10-26, review: where PHP copies the first array (`zend_array_dup` in `php_array_diff` / `php_array_intersect`, `array_replace` / `array_replace_recursive` and the nested arrays they and `array_merge_recursive` separate, `ZVAL_COPY` in `array_pad`'s no-pad path and `array_diff`'s copy paths, `add_function_array`), the result keeps that array's next free index (probe label `next_free`). A class constructor or contract token whose class-string names an exported function is called as that function by `callbackParameter`, as `is_callable` already answers. A contract token as `array_merge_recursive`'s merged-into value is its class-string. `ReflectionFunction` still does not read the registry (documented under Not ported).

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 21 findings (rows marked "2 rows" count two) — high 0, medium 4, low 11, false 6, maybe-false 0
- findings:
  - `[low]` `patch` Blind: JSDoc of `uasort`, `array_filter`, `array_map`, `requiredCallback`, `array_any` still says a callable string is refused — patched: each says a registry name resolves.
  - `[low]` `patch` Blind: `ReflectionFunction.ts`'s header says no runtime function table exists, now false; `new ReflectionFunction('strcasecmp')` still throws — patched the comment and listed the gap under "Not ported"; the behaviour is pre-existing and changing it is outside "no other runtime behaviour changes" (deferred).
  - `[low]` `patch` Blind: the docs' `'\\strlen'` backslash example is ambiguous as a PHP literal — patched: "two leading backslashes".
  - `[medium]` `patch` Blind + Edge (2 rows): the set, replace, pad and union results lose PHP's next free index where PHP copies argument 1 (`zend_array_dup`), so a later append gets a different key — patched: returned through the next-free helpers, with probe labels.
  - `[low]` `reject` Blind: a throwing comparator plus a later non-array argument does not chain the callback's exception as `getPrevious()` — real but unlikely; the fix adds pending-exception plumbing to every set function.
  - `[low]` `patch` Blind: `arrayUnion(1, 2)` throws where PHP's `+` gives 3 — patched: documented as the array form of `+` only; the throw is loud and stays.
  - `[low]` `patch` Blind: `codePointCompare` copies `looseEquals.ts`'s private string compare — patched: one shared helper.
  - `[low]` `reject` Blind + Edge (2 rows): lone surrogates are ordered by code unit in the set comparisons where `strcmp` throws — a lone surrogate has no PHP form and the set functions now share `looseEquals`'s compare, as `==` does; a guard adds branches for a value users do not meet.
  - `[false]` `reject` Blind: spec record incomplete (deferred list, Verification commands, empty triage log) — its fix edits this build's spec; the triage log is written now, and the PORTING.md `arrayUnion` row already exists on `main` (`PORTING.md:62`).
  - `[false]` `reject` Blind: registry tests are brittle (hard-coded 85, probe lists) — by design: a new PHP-named export missing from the registry must fail XT-runtime-84 / 85.
  - `[false]` `reject` Blind: nothing enforces the import-cycle safety — the Edge layer imported each related module first in a fresh process and all loaded; XT-runtime-85 checks the entry points.
  - `[false]` `reject` Blind + Intent (2 rows): Story 14.4's Collection paths and `when` / `unless` / `Reflector::isCallable` are not shown to use the resolver — the intent keeps the change in `packages/runtime`; Upstream's `*Using` members hand the callback straight to `array_udiff` and kin (Collection.php :289-698), which read `callbackParameter`. Consumer adoption deferred.
  - `[low]` `patch` Blind: header line too wide, missing blank line, two imports out of order — patched.
  - `[low]` `patch` Edge: `array_merge_recursive` wraps a contract-token dest value as an object — patched: the token is its class-string; asserted.
  - `[low]` `patch` Edge: `is_callable(Count)` (a class constructor naming an exported function) is true while `callbackParameter` refuses it — patched: `callbackParameter` resolves the class-string through `phpFunction` first; asserted.
  - `[medium]` `defer` Verification-gap (other) + Intent (2 rows): `Collection.random` / `LazyCollection.makeIterator` check `is_callable` then call `callCallable`, which still refuses strings, so a registry name there now throws — `packages/collections` is outside this item; deferred for Story 14.x to adopt `phpFunction` in `callCallable`.
  - `[false]` `reject` Intent: the PORTING.md `arrayUnion` row is missing — it is on `main` (`PORTING.md:62`, ESC-14.4-1).
- Fidelity Review: 2 pass verdicts at tree c0c77a2441c38b6eef0af96864c4539549cfd273; the patches change the tree, so it re-runs below.

## Verification

**Commands:**
- `bun test packages/runtime` -- expected: all pass
- `bun run typecheck` and `bun run lint` -- expected: no errors
- `bun run harness` -- expected: no differences, ending in a `SUMMARY` line

## Fidelity Review

### Reviewer 1: pass at tree c0c77a2441c38b6eef0af96864c4539549cfd273

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `f8957ff3de5476dbf99fa080eae5ea6477887bd6`, on 2026-10-27T05:40:04.104Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared changed assertions and probe expectations with the supplied PHP results and ESC-14.4-2. Exact comparisons remain exact; callable-name expectations change as the approved resolver ruling requires. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed; the modified runtime tests retain their checks for unsupported callable forms. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or modifies no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no assertion adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no relied-on Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared touched Xaravel Test consequences with their bodies, helpers and probe records. They check the declared array behavior, callback results and call order, errors, resolver metadata, export identity and fresh-process loading. No consequence tokens require additional bullet matching. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared all changed paths and implementations with the runtime action-item scope and ESC-14.4-1/2. Changes remain within runtime and introduce no substitute implementation of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared changed source bodies and declaration inventories with AD-6 and DIV-1. The implementations are synchronous, perform no IO and accept no callbacks permitted to be async; no asyncRoot tags are required or retained. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"c0c77a2441c38b6eef0af96864c4539549cfd273","base":"f8957ff3de5476dbf99fa080eae5ea6477887bd6","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-27T05:40:04.104Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared changed assertions and probe expectations with the supplied PHP results and ESC-14.4-2. Exact comparisons remain exact; callable-name expectations change as the approved resolver ruling requires.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed; the modified runtime tests retain their checks for unsupported callable forms.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or modifies no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no assertion adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no relied-on Oracle error fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"Compared touched Xaravel Test consequences with their bodies, helpers and probe records. They check the declared array behavior, callback results and call order, errors, resolver metadata, export identity and fresh-process loading. No consequence tokens require additional bullet matching.","findings":[]},{"id":"F-8","result":"pass","note":"Compared all changed paths and implementations with the runtime action-item scope and ESC-14.4-1/2. Changes remain within runtime and introduce no substitute implementation of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared changed source bodies and declaration inventories with AD-6 and DIV-1. The implementations are synchronous, perform no IO and accept no callbacks permitted to be async; no asyncRoot tags are required or retained.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree c0c77a2441c38b6eef0af96864c4539549cfd273

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `f8957ff3de5476dbf99fa080eae5ea6477887bd6`, on 2026-10-27T05:40:04.104Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and adds or changes no Ported Test; all touched tests are Xaravel Tests (XT-runtime-58, 63, 65, 68, 75, 83, 84, 85), so there is no Upstream assertion list to compare. |
| F-2: No expected value is weakened | pass | No Ported Test or stale_tests file is touched. In the changed Xaravel Tests, the edits replace an exported function name ('strlen', 'strcmp', 'strtoupper') with an unexported one ('str_rot13'), so each assertion still checks the same exact DIV-9.13 TypeError message. is_callable('strlen') changes from false to true, which is the behaviour ESC-14.4-2 rules and the amended DIV-9.14 records; is_callable('str_rot13') false and true under syntax_only are added. No exact comparison is loosened. |
| F-3: No assertion is removed without a DIV clause | pass | No Ported Test is touched. In the changed Xaravel Tests (XT-runtime-58, 63, 65, 68, 75) every edited assertion keeps its counterpart; only the callable name in the input changes, and XT-runtime-63 gains assertions. Nothing is dropped. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or changes no Expectations line, so no Skip Reason applies (evidence (i) confirms none). |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an '// adapted:DIV-<n>.<k>' marker and no Expectations 'adapted' field changes. DIV-9.13/9.14 are cited only in docs and comments, which match the amended clause text in decisions/DIV-9.md. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed Oracle fixture is an error; the tests rely on host-PHP probe output, not Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-83 checks every claimed behaviour (set functions, callback forms with closures, an invokable and PHP function names, call logs for consistent and inconsistent comparators, merge/replace with Recursion detected, array_pad ValueError, is_int, arrayUnion and the error messages) through 22 probe labels plus direct assertions. XT-runtime-84 checks case-insensitive and leading-backslash resolution, ArgumentCountError, fresh Ref wrapping, refusal of unexported names, the registry against root exports (identity, and function_exists for every root function) and ReflectionFunction counts. XT-runtime-85 recomputes every probe label, checks the label sets are equal, and checks export identity in a fresh process. The changed older tests still check what their descriptions claim. No FR/AD tokens are cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changes are in packages/runtime (src, docs, tests), within the action item's runtime scope. The phpFunction registry lists only runtime exports, and the docs say Reflector::isCallable and Collections' callCallable do not read the resolver yet. No stub or partial implementation of another Component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in any changed source file. Every added export (set functions, array_pad, is_int, arrayUnion, phpFunction, userCompare) is synchronous, does no IO and takes only sync callbacks, matching the files' 'Everything is synchronous' notes; no tag is needed under AD-6 or DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"c0c77a2441c38b6eef0af96864c4539549cfd273","base":"f8957ff3de5476dbf99fa080eae5ea6477887bd6","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-27T05:40:04.104Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and adds or changes no Ported Test; all touched tests are Xaravel Tests (XT-runtime-58, 63, 65, 68, 75, 83, 84, 85), so there is no Upstream assertion list to compare.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test or stale_tests file is touched. In the changed Xaravel Tests, the edits replace an exported function name ('strlen', 'strcmp', 'strtoupper') with an unexported one ('str_rot13'), so each assertion still checks the same exact DIV-9.13 TypeError message. is_callable('strlen') changes from false to true, which is the behaviour ESC-14.4-2 rules and the amended DIV-9.14 records; is_callable('str_rot13') false and true under syntax_only are added. No exact comparison is loosened.","findings":[]},{"id":"F-3","result":"pass","note":"No Ported Test is touched. In the changed Xaravel Tests (XT-runtime-58, 63, 65, 68, 75) every edited assertion keeps its counterpart; only the callable name in the input changes, and XT-runtime-63 gains assertions. Nothing is dropped.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or changes no Expectations line, so no Skip Reason applies (evidence (i) confirms none).","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an `// adapted:DIV-<n>.<k>` marker and no Expectations `adapted` field changes. DIV-9.13/9.14 are cited only in docs and comments, which match the amended clause text in decisions/DIV-9.md.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed Oracle fixture is an error; the tests rely on host-PHP probe output, not Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-83 checks every claimed behaviour (set functions, callback forms with closures, an invokable and PHP function names, call logs for consistent and inconsistent comparators, merge/replace with Recursion detected, array_pad ValueError, is_int, arrayUnion and the error messages) through 22 probe labels plus direct assertions. XT-runtime-84 checks case-insensitive and leading-backslash resolution, ArgumentCountError, fresh Ref wrapping, refusal of unexported names, the registry against root exports (identity, and function_exists for every root function) and ReflectionFunction counts. XT-runtime-85 recomputes every probe label, checks the label sets are equal, and checks export identity in a fresh process. The changed older tests still check what their descriptions claim. No FR/AD tokens are cited.","findings":[]},{"id":"F-8","result":"pass","note":"All changes are in packages/runtime (src, docs, tests), within the action item's runtime scope. The phpFunction registry lists only runtime exports, and the docs say Reflector::isCallable and Collections' callCallable do not read the resolver yet. No stub or partial implementation of another Component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in any changed source file. Every added export (set functions, array_pad, is_int, arrayUnion, phpFunction, userCompare) is synchronous, does no IO and takes only sync callbacks, matching the files' 'Everything is synchronous' notes; no tag is needed under AD-6 or DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree e604cde081cc11707177b31cf1e9363815fc198a

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `f8957ff3de5476dbf99fa080eae5ea6477887bd6`, on 2026-10-27T05:52:34.854Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The item assigns no Ported Test IDs and changes only Xaravel Tests. |
| F-2: No expected value is weakened | pass | Compared changed assertions and probe expectations with the supplied PHP results and ESC-14.4-2. Exact comparisons remain exact; callable-name expectations change consistently with the approved resolver behavior. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are added, changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted assertion markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared touched Xaravel Tests with their consequences, helpers and PHP probe records. Their assertions cover the declared results, errors, callback order, resolver metadata and export identity; no consequence bullet tokens are cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared all changed paths and implementations with the runtime scope and ESC-14.4-1/2. Changes implement runtime behavior within packages/runtime and introduce no substitute for another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared changed source bodies and declaration inventories with AD-6 and DIV-1. The functions are synchronous, their callbacks belong to synchronous APIs, and no async-root tag is required or retained. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"e604cde081cc11707177b31cf1e9363815fc198a","base":"f8957ff3de5476dbf99fa080eae5ea6477887bd6","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-27T05:52:34.854Z","items":[{"id":"F-1","result":"n/a","note":"The item assigns no Ported Test IDs and changes only Xaravel Tests.","findings":[]},{"id":"F-2","result":"pass","note":"Compared changed assertions and probe expectations with the supplied PHP results and ESC-14.4-2. Exact comparisons remain exact; callable-name expectations change consistently with the approved resolver behavior.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are added, changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted assertion markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared touched Xaravel Tests with their consequences, helpers and PHP probe records. Their assertions cover the declared results, errors, callback order, resolver metadata and export identity; no consequence bullet tokens are cited.","findings":[]},{"id":"F-8","result":"pass","note":"Compared all changed paths and implementations with the runtime scope and ESC-14.4-1/2. Changes implement runtime behavior within packages/runtime and introduce no substitute for another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared changed source bodies and declaration inventories with AD-6 and DIV-1. The functions are synchronous, their callbacks belong to synchronous APIs, and no async-root tag is required or retained.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree e604cde081cc11707177b31cf1e9363815fc198a

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `f8957ff3de5476dbf99fa080eae5ea6477887bd6`, on 2026-10-27T05:52:34.854Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and touches no Ported Test, so there are no Upstream assertions to match. Every touched test is an Xaravel Test: XT-runtime-58, 63, 65, 68, 75, 83, 84 and 85. |
| F-2: No expected value is weakened | pass | No Ported Test changes. The changed Xaravel Test expectations follow the rulings. In XT-runtime-63, 'is_callable("strlen")' now expects true, which is PHP's value and what DIV-9.14 says after ESC-14.4-2 amended it. In XT-runtime-58, 65, 68 and 75, the 'unported callable string' checks now use 'str_rot13', a function the runtime does not export, so they still check the exact DIV-9.13 TypeError message. No exact comparison was loosened and no message was generalised. |
| F-3: No assertion is removed without a DIV clause | n/a | There is no Ported Test, so there are no Upstream assertions to count. The edited Xaravel Tests swap one input ('strlen' becomes 'str_rot13') and add assertions; none is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or modifies no Expectations line, so there is no Skip Reason to check. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no '// adapted:DIV-<n>.<k>' marker and no Expectations 'adapted' field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | There are no assigned Oracle fixtures and no error fixtures. The Xaravel Tests rely on the committed PHP probe record ('php-set-functions.probe.txt'), not on Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Each body checks what its consequence string claims. XT-runtime-83 checks the diff, intersect, merge, replace, pad, 'is_int' and union results against PHP's probe labels, including the callback call logs for consistent and inconsistent comparators, 'Recursion detected', the 'array_pad' ValueError and the exact error messages; it adds direct assertions on invokable and function-name callbacks. XT-runtime-84 checks resolution (any case, one leading backslash, no '::'), argument-count errors, fresh 'Ref' wrapping, 'is_callable', the not-exported TypeError, registry identity against the root and '@​xaravel/runtime/php', ReflectionFunction counts, and function_exists parity for every root export through 'resolver.exports'. XT-runtime-85 recomputes every probe label and runs the fresh-process export and resolver checks. The edited XT-runtime-58, 63, 65, 68 and 75 still check their stated consequences. No FR or AD tokens are cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed source file is under 'packages/runtime', the item's only component. No other component's behaviour is stubbed or faked. 'phpFunction' is exported for later Stories (Reflector, Collections) without implementing their behaviour. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no '@​asyncRoot' tags in any changed source file. All new exports are synchronous, return no Promise, and take only synchronous callbacks under PHP semantics, so none is missing a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under 'conformance/oracle-requests/'. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"e604cde081cc11707177b31cf1e9363815fc198a","base":"f8957ff3de5476dbf99fa080eae5ea6477887bd6","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-27T05:52:34.854Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and touches no Ported Test, so there are no Upstream assertions to match. Every touched test is an Xaravel Test: XT-runtime-58, 63, 65, 68, 75, 83, 84 and 85.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changes. The changed Xaravel Test expectations follow the rulings. In XT-runtime-63, `is_callable(\"strlen\")` now expects true, which is PHP's value and what DIV-9.14 says after ESC-14.4-2 amended it. In XT-runtime-58, 65, 68 and 75, the 'unported callable string' checks now use `str_rot13`, a function the runtime does not export, so they still check the exact DIV-9.13 TypeError message. No exact comparison was loosened and no message was generalised.","findings":[]},{"id":"F-3","result":"n/a","note":"There is no Ported Test, so there are no Upstream assertions to count. The edited Xaravel Tests swap one input (`strlen` becomes `str_rot13`) and add assertions; none is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or modifies no Expectations line, so there is no Skip Reason to check.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no `// adapted:DIV-<n>.<k>` marker and no Expectations `adapted` field.","findings":[]},{"id":"F-6","result":"n/a","note":"There are no assigned Oracle fixtures and no error fixtures. The Xaravel Tests rely on the committed PHP probe record (`php-set-functions.probe.txt`), not on Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"Each body checks what its consequence string claims. XT-runtime-83 checks the diff, intersect, merge, replace, pad, `is_int` and union results against PHP's probe labels, including the callback call logs for consistent and inconsistent comparators, `Recursion detected`, the `array_pad` ValueError and the exact error messages; it adds direct assertions on invokable and function-name callbacks. XT-runtime-84 checks resolution (any case, one leading backslash, no `::`), argument-count errors, fresh `Ref` wrapping, `is_callable`, the not-exported TypeError, registry identity against the root and `@xaravel/runtime/php`, ReflectionFunction counts, and function_exists parity for every root export through `resolver.exports`. XT-runtime-85 recomputes every probe label and runs the fresh-process export and resolver checks. The edited XT-runtime-58, 63, 65, 68 and 75 still check their stated consequences. No FR or AD tokens are cited.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed source file is under `packages/runtime`, the item's only component. No other component's behaviour is stubbed or faked. `phpFunction` is exported for later Stories (Reflector, Collections) without implementing their behaviour.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no `@asyncRoot` tags in any changed source file. All new exports are synchronous, return no Promise, and take only synchronous callbacks under PHP semantics, so none is missing a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under `conformance/oracle-requests/`.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: done

**Summary.** `@xaravel/runtime` (root and `/php`) exports `array_diff`, `array_diff_assoc`, `array_diff_key`, `array_intersect`, the callback forms `array_udiff`, `array_diff_uassoc`, `array_diff_ukey`, `array_uintersect`, `array_intersect_uassoc`, `array_merge_recursive`, `array_replace`, `array_replace_recursive`, `array_pad`, `is_int` and `arrayUnion`, ported from PHP 8.5.11 (ESC-14.4-1); and `phpFunction`, a frozen registry of the 85 PHP global functions the runtime exports, which `callbackParameter` and `is_callable` read, so `'strcasecmp'` is called as the runtime's `strcasecmp` (ESC-14.4-2, DIV-9.13 / DIV-9.14 as amended).

**Files.**
- `packages/runtime/src/php/arrayFunctions.ts`: the thirteen functions, `arrayUnion`, name resolution in `callbackParameter`, the shared `userCompare` and next-free helpers.
- `packages/runtime/src/php/phpFunctions.ts` (new): the registry and `phpFunction`.
- `packages/runtime/src/php/typeTests.ts`: `is_int`; `is_callable` resolves names.
- `packages/runtime/src/php/arrayRefFunctions.ts`, `looseEquals.ts`, `ReflectionFunction.ts`: helpers moved or shared, header updated.
- `packages/runtime/src/php/index.ts`, `src/index.ts`: exports.
- `packages/runtime/docs/php-functions.md`, `docs/php-builtins.md`: docs.
- `packages/runtime/tests/xaravel/php-set-functions.{test.ts,probe.php,probe.txt}` (new): XT-runtime-83..85.
- Four existing runtime test files: refusal cases moved to `'str_rot13'` (Spec Change Log).

**Review.** One pass plus the Finalize re-check: 21 findings; 10 entries patched (1 medium: next free index; the rest low), 1 deferred (consumer packages adopting the resolver, medium) plus the `ReflectionFunction` gap (low), rejects as logged in the Review Triage Log.

**Follow-up review recommendation:** false (patched: high 0, medium 1, low 9).

**Verification.** `bun test packages/runtime` 85 pass; `bun run typecheck`, `bun run lint`, `bun run async-surface --check runtime` clean; `bun run harness` `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0` (the 7 not-run are local backends); Fidelity Review `current`: 2 pass verdicts for tree e604cde081cc11707177b31cf1e9363815fc198a.

**Residual risks.** `packages/collections`' `callCallable`, Conditionable's `when` / `unless` and `Reflector::isCallable` do not read the resolver yet (deferred; `Collection.random` with a registry name now throws where PHP calls it). The registry and its modules import each other; safe while every entry is a function declaration.
