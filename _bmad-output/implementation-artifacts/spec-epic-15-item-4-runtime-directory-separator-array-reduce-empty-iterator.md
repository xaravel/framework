---
title: 'Runtime DIRECTORY_SEPARATOR, array_reduce and EmptyIterator for the phpdotenv port'
type: feature
created: '2026-10-30'
baseline_revision: f980922201d1a61112969162cb88bd50470f2f6e
status: done
review_loop_iteration: 1
followup_review_recommended: false
context:
  - decisions/ESC-15.2-6.md
  - conformance/escalations/ESC-15.2-6.md
  - decisions/MAINT-2026-10-26-runtime-builtins.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 15.2's port of phpdotenv v5.7.0 and PhpOption 1.10.0 throws `BlockedByComponentError(runtime)` in `Paths::filePaths`, `Option::lift` and `None::getIterator`, because `@xaravel/runtime/php` lacks `DIRECTORY_SEPARATOR`, `array_reduce` and `EmptyIterator` (ESC-15.2-6, approved by the monitor).

**Approach:** As action item `epic-15-item-4-runtime-directory-separator-array-reduce-empty-iterator` rules: export the constant `DIRECTORY_SEPARATOR` (`"/"`), `array_reduce($array, $callback, $initial = null)` taking every PHP callable form through the shared resolver (DIV-9.13), and the class `EmptyIterator` registered under its PHP name, all with PHP 8.5.11 behaviour and XT-runtime cases against a PHP probe.

## Boundaries & Constraints

**Always:** scope `packages/runtime/**` and this item's records; PHP 8.5.11 results; sync only; `array_reduce` is a registry entry (`PHP_FUNCTIONS`, counts from `ReflectionFunction`: 2 required, 3 total); `EmptyIterator` carries the `Iterator` and `Traversable` brands, is not final, ends with `registerClass("EmptyIterator", EmptyIterator)`, and iterates by PHP's `foreach` protocol (`[Symbol.iterator]`, `entries`, `keys`) as `CachingIterator` does; export from both `src/php/index.ts` and `src/index.ts`; existing exports stay.

**Never:** another component (Story 15.2 replaces its own three throws later); PORTING.md, a DIV, the grader or Expectations; other runtime behaviour changes; adding `EmptyIterator` to the `xaravel.php.classes` map (that map lists the throwables and `stdClass` the grader reads; the item asks only for the class registry); `PATH_SEPARATOR` or other constants the item does not name.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| separator | `DIRECTORY_SEPARATOR` | `"/"` | — |
| reduce | `[1,2,3]`, `fn($c,$i)=>$c+$i`, `10`; same with no initial; `[]` with no initial; `[]` with `'x'` | `16`; `6`; `null`; `'x'` | No error |
| reduce keys/order | string-keyed array, a callback logging `($carry, $item)` | called in insertion order with carry and value only (no key) | No error |
| reduce callables | `'max'` (registry name), `'\\MAX'`, `[Class::class,'m']`, `'Class::m'`, `[$obj,'m']`, invokable object, closure | PHP's results | No error |
| reduce bad callback | `null`, `'nope'`, `[1]` | — | `TypeError: array_reduce(): Argument #2 ($callback) must be a valid callback, …` with PHP's tail |
| reduce bad array | `'x'`, `null`, an object | — | `TypeError: array_reduce(): Argument #1 ($array) must be of type array, <type> given` |
| reduce arity | registry call with 1 or 4 arguments | — | `ArgumentCountError: array_reduce() expects at least 2 / at most 3 arguments, n given` |
| empty iterator | `new EmptyIterator` | `valid()` false; `next()`, `rewind()` return null; `iterator_to_array` `[]`; `iterator_count` 0; `json_encode` `{}`; `(array)` `[]`; `==` another true; `serialize` `O:13:"EmptyIterator":0:{}`; `instanceof Iterator`/`Traversable` true | No error |
| empty iterator access | `current()`, `key()` | — | `BadMethodCallException: Accessing the value of an EmptyIterator` / `Accessing the key of an EmptyIterator` |

</intent-contract>

## Code Map

- `packages/runtime/src/php/arrayFunctions.ts:100-135` -- `callbackParameter` / `requiredCallback(fn, position, callback)` (shared resolver, DIV-9.13/14; null throws PHP's "no array or string given"), `arrayParameter` for arg 1. Add `array_reduce` here, documented in the header comment list.
- `packages/runtime/src/php/phpFunctions.ts:~240` -- `PHP_FUNCTIONS` `entry(name, fn, required, total)`; add `entry("array_reduce", array_reduce, 2, 3)`. Registry grows 132 → 133.
- `packages/runtime/src/php/CachingIterator.ts:33-210` -- model for a runtime `Iterator` class: brand getters, `foreachValues` / `foreachIterator` / `foreachKeys` from `liveCursor.ts`, `registerClass` at the end.
- `packages/runtime/src/php/BadMethodCallException.ts` -- the exception to throw.
- `packages/runtime/src/php/EmptyIterator.ts` (new) -- the class.
- `packages/runtime/src/php/index.ts:21,34`, `packages/runtime/src/index.ts:46,81` -- exports (`ArrayIterator`, `array_filter` lines show the lists). `DIRECTORY_SEPARATOR` goes with a new small export (e.g. in `fileFunctions.ts`, beside `file_get_contents`).
- `packages/runtime/docs/php-functions.md` -- `array_reduce` under "Array functions" (line ~148), `DIRECTORY_SEPARATOR` under "Process environment and file read" (line ~733); docs page naming `EmptyIterator` where `ArrayIterator`/`CachingIterator` are documented (grep for `CachingIterator` in `docs/`). XT-runtime-37 (`tests/xaravel/docs.test.ts`) requires every export named in backticks. `README.md:18,23` lists the class and function groups.
- `packages/runtime/tests/xaravel/php-process-environment.{probe.php,probe.txt,test.ts}` -- probe/test pattern to copy (`evidence` map, `attempt`, label-per-case, `xaravelTest`).
- `packages/runtime/tests/xaravel/php-set-functions.{probe.php,probe.txt,test.ts}` -- registry list, exports list and count `132` (test line ~693 and its comment) go stale; update and regenerate the probe output.
- `async-surface.json` / API-surface files in `packages/runtime` -- regenerate if a check reports them stale (XT-runtime-37 checks `async-surface.json`).
- Last Xaravel Test ID is XT-runtime-142; new tests are XT-runtime-143..145.
- Consumers (read-only, Story 15.2 later): `packages/config/src/Dotenv/Store/File/Paths.ts:28`, `src/PhpOption/Option.ts:147`, `src/PhpOption/None.ts:93`.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/arrayFunctions.ts` -- `array_reduce`: `arrayParameter` arg 1, `requiredCallback` arg 2, fold `carry = callback(carry, value)` in order, `initial ?? null` start.
- `packages/runtime/src/php/EmptyIterator.ts` -- the class, as above.
- `packages/runtime/src/php/fileFunctions.ts` -- `export const DIRECTORY_SEPARATOR = "/"` with a comment (Linux and macOS; Windows is not a target).
- `packages/runtime/src/php/phpFunctions.ts`, `src/php/index.ts`, `src/index.ts`, `docs/php-functions.md`, `README.md` -- registry entry, exports, docs.
- `packages/runtime/tests/xaravel/php-reduce-empty-iterator.probe.php`, `.probe.txt` -- PHP 8.5.11 results for each matrix row (classes for the callable forms declared in the probe and mirrored with `registerClass` in the test).
- `packages/runtime/tests/xaravel/php-reduce-empty-iterator.test.ts` -- XT-runtime-143 (`array_reduce`, every matrix row against the probe), XT-runtime-144 (`EmptyIterator` against the probe, plus `fqcn`/`class_exists('EmptyIterator')`, the brands and JS iteration yielding nothing), XT-runtime-145 (`DIRECTORY_SEPARATOR`, registry reflection counts and `ArgumentCountError`s, root and subpath export identity).
- `packages/runtime/tests/xaravel/php-set-functions.*` -- the lists and count this change makes stale.

**Acceptance Criteria:**
- Given each matrix row, when run through the export, then the result (or the thrown class and message) equals the PHP probe's.
- Given `phpFunction("array_reduce")`, then too few or too many arguments throw PHP's `ArgumentCountError`, and `function_exists("array_reduce")` is true.
- Given `class_exists("EmptyIterator")` and `fqcn(new EmptyIterator())`, then true and `"EmptyIterator"`.
- Given `@xaravel/runtime` and `@xaravel/runtime/php`, then each exports `DIRECTORY_SEPARATOR`, `array_reduce` and `EmptyIterator` as the same object.
- Given the full suite, `bun run harness` reports zero differences, `bun run typecheck` and `bun run lint` exit 0, and `bun run fidelity:review status --item epic-15-item-4-runtime-directory-separator-array-reduce-empty-iterator --spec _bmad-output/implementation-artifacts/spec-epic-15-item-4-runtime-directory-separator-array-reduce-empty-iterator.md` prints `current`.

## Spec Change Log

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 17 findings — high 0, medium 0, low 10, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` edge: a raw JS callback that mutates a carry array in place also mutates the caller's `initial` — every runtime builtin (`array_filter`, `array_map`, `uasort`) passes values to callbacks without `valueCopy`; ported userland callbacks copy at their own binding (`userlandArguments.ts`). Only a hand-written JS callback reaches it; the fix adds a copy on every iteration, unlike its siblings.
  - `[false]` `[reject]` intent: no test exercises the three Upstream call shapes in `packages/config` — the item's scope is `packages/runtime` only; Story 15.2 replaces its own throws (ESC-15.2-6), and its XT-config cases will exercise them.
  - `[false]` `[reject]` intent: Linux separator shown only by docs, not evidence — PHP defines `DIRECTORY_SEPARATOR` as `PHP_DIR_SEPARATOR`, `'/'` on every non-Windows build, so the Oracle image's Linux PHP gives `"/"`; CI on Linux runs XT-runtime-145.
  - `[false]` `[reject]` intent: root re-exports go beyond `@xaravel/runtime/php` — "existing exports stay" and items 1-3 export from both; the consumers import from the root.
  - `[false]` `[reject]` intent: the Fidelity Review outcome is not in the diff — the spec records two pass verdicts and `status` printed `current` for the reviewed tree.
  - `[false]` `[reject]` blind: the spec file is missing from the diff — by design the spec goes to the edge-case layer as the claims file; it is committed with the change.
  - `[false]` `[reject]` blind: sprint status still says `open` — the orchestrator sets the item `done` in the PR that lands it, per the intent.
  - `[low]` `[reject]` blind: no fixed-arity registry callback (`strtoupper`) case — the resolver's `ArgumentCountError` for registry callbacks is already pinned against PHP by `php-set-functions` (`resolver.arity`, `resolver.calls`); `array_reduce` uses the same `requiredCallback`.
  - `[low]` `[patch]` blind: no Traversable passed as the array — the runtime already gives PHP's "must be of type array, ArrayIterator given" (checked); two probe rows (`ArrayIterator`, `EmptyIterator`) added to `reduce.bad_array`.
  - `[low]` `[reject]` blind: no case mutates the source during the fold or throws midway — `arrayParameter` returns a snapshot of the entries and a throw propagates from a plain loop; a test would only re-check JS semantics.
  - `[low]` `[reject]` blind: an `undefined` callback is not tested — `undefined` reads as `null` through the shared `callableParameter`, which every callback function uses and existing tests cover.
  - `[false]` `[reject]` blind: subclass behaviour untested (`new SubEmpty == new EmptyIterator`) — checked: the runtime gives `false`, as PHP does; `looseEquals` compares classes before props.
  - `[low]` `[reject]` blind: `next()` / `rewind()` return `undefined` and the test wraps them in `?? null` — a PHP `void` method is a TS `void` method across the runtime (`ArrayIterator`, `CachingIterator`); the label compares the PHP-visible result.
  - `[low]` `[reject]` blind: `[PHP_PROPS]` repeats `stdClass`'s three lines — a shared helper would add internal surface for a three-line method no caller changes; no divergence is named.
  - `[low]` `[patch]` blind: docs wording — "The classes below but `EmptyIterator`" reworded to "Every class below except `EmptyIterator`"; "`initial` for `[]`" now says the callback is not called for an empty array.
  - `[low]` `[reject]` blind: `DIRECTORY_SEPARATOR` listed with file-read functions and no constants section — it sits beside `file_get_contents`, the file-path builtin it serves; a new section for one constant adds nothing a reader would miss.
  - `[low]` `[reject]` blind: no `get_debug_type` / dynamic-property unserialize case for `EmptyIterator` — both run the runtime's generic class-name and props paths, tested for every registered class; nothing about `EmptyIterator` changes them.

### 2026-10-30 — Review pass (Finalize re-check: Fidelity Review on the patched tree 66357ca065df2829d18e28b0a5541091feffe972)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none; both reviewers pass (codex/gpt-6.1-sol, claude/claude-opus-5-5), and `status` prints `current`. The first pair of passes (tree 509cd7e9c18a587feded9f44a8f6684b8e289501) was this pass's Fidelity layer before the patches.

## Verification

**Commands:**
- `cd packages/runtime/tests/xaravel && php -d error_reporting=0 php-reduce-empty-iterator.probe.php | diff - php-reduce-empty-iterator.probe.txt` -- expected: no output; the same for `php-set-functions`.
- `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: zero differences.
- `bun run typecheck` and `bun run lint` -- expected: exit 0.
- `bun run harness` -- expected: zero differences (NOT-RUN Variants allowed).
- `bun run fidelity:review status --item epic-15-item-4-runtime-directory-separator-array-reduce-empty-iterator --spec <this spec>` -- expected: `current`.

## Fidelity Review

### Reviewer 1: pass at tree 509cd7e9c18a587feded9f44a8f6684b8e289501

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `f980922201d1a61112969162cb88bd50470f2f6e`, on 2026-10-30T19:19:11.699Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed, and no Ported Test IDs are assigned. |
| F-2: No expected value is weakened | pass | The changed registry count increases from 132 to 133 for array_reduce; existing exact comparisons remain, and new probe comparisons retain exact values and exception messages. |
| F-3: No assertion is removed without a DIV clause | n/a | There are no changed Ported Tests whose assertion counts require comparison with Upstream. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted assertion marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The supplied test bodies and probe cases check the declared fold order, callable forms, errors, empty iterator behavior, separator, registry metadata and export identity. Existing touched tests retain their declared checks. |
| F-8: No stub, fake or partial implementation of another Component | pass | All reviewed changes stay within packages/runtime and implement runtime builtins expressly authorized by ESC-15.2-6; no other Component's behavior is stubbed. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed declarations introduce synchronous computation and iteration without async-root tags. The retained synchronous file read is explicitly authorized by ESC-15.2-3. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"509cd7e9c18a587feded9f44a8f6684b8e289501","base":"f980922201d1a61112969162cb88bd50470f2f6e","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T19:19:11.699Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed, and no Ported Test IDs are assigned.","findings":[]},{"id":"F-2","result":"pass","note":"The changed registry count increases from 132 to 133 for array_reduce; existing exact comparisons remain, and new probe comparisons retain exact values and exception messages.","findings":[]},{"id":"F-3","result":"n/a","note":"There are no changed Ported Tests whose assertion counts require comparison with Upstream.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted assertion marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"The supplied test bodies and probe cases check the declared fold order, callable forms, errors, empty iterator behavior, separator, registry metadata and export identity. Existing touched tests retain their declared checks.","findings":[]},{"id":"F-8","result":"pass","note":"All reviewed changes stay within packages/runtime and implement runtime builtins expressly authorized by ESC-15.2-6; no other Component's behavior is stubbed.","findings":[]},{"id":"F-9","result":"pass","note":"The changed declarations introduce synchronous computation and iteration without async-root tags. The retained synchronous file read is explicitly authorized by ESC-15.2-3.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 509cd7e9c18a587feded9f44a8f6684b8e289501

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `f980922201d1a61112969162cb88bd50470f2f6e`, on 2026-10-30T19:19:11.699Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change adds or changes no Ported Test; it assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | No Ported Test changed. The only expected-value edit is the registry count 132 to 133 in php-set-functions.test.ts. It follows the new array_reduce entry, and the PHP-recorded probe lists array_reduce, so it is not a weakening. |
| F-3: No assertion is removed without a DIV clause | pass | No assertion was removed. The new Xaravel tests assert every recorded probe label, and the modified one only raised a count. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted markers or Expectations adapted fields appear in the change. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixtures are relied on; the evidence is a PHP probe. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-143, 144 and 145 compute every recorded PHP 8.5.11 probe label and compare it. The labels cover the fold, callable forms, TypeErrors, EmptyIterator behaviour, serialization, brands, the registry counts and ArgumentCountErrors, function_exists and the exports. XT-runtime-145 also asserts DIRECTORY_SEPARATOR and the root and php export identity. Each matches its consequence string, and none cites an FR or AD bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changes are in packages/runtime, which the action item scopes. These are PHP builtins approved by ESC-15.2-6 and are not stubs of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source files carry no @​asyncRoot tags. array_reduce, EmptyIterator and DIRECTORY_SEPARATOR are sync, perform no driver IO, and return no Promise. array_reduce's callback is resolved as for array_any, which is also sync. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request files changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"509cd7e9c18a587feded9f44a8f6684b8e289501","base":"f980922201d1a61112969162cb88bd50470f2f6e","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T19:19:11.699Z","items":[{"id":"F-1","result":"n/a","note":"The change adds or changes no Ported Test; it assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changed. The only expected-value edit is the registry count 132 to 133 in php-set-functions.test.ts. It follows the new array_reduce entry, and the PHP-recorded probe lists array_reduce, so it is not a weakening.","findings":[]},{"id":"F-3","result":"pass","note":"No assertion was removed. The new Xaravel tests assert every recorded probe label, and the modified one only raised a count.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted markers or Expectations adapted fields appear in the change.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixtures are relied on; the evidence is a PHP probe.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-143, 144 and 145 compute every recorded PHP 8.5.11 probe label and compare it. The labels cover the fold, callable forms, TypeErrors, EmptyIterator behaviour, serialization, brands, the registry counts and ArgumentCountErrors, function_exists and the exports. XT-runtime-145 also asserts DIRECTORY_SEPARATOR and the root and php export identity. Each matches its consequence string, and none cites an FR or AD bullet.","findings":[]},{"id":"F-8","result":"pass","note":"All changes are in packages/runtime, which the action item scopes. These are PHP builtins approved by ESC-15.2-6 and are not stubs of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source files carry no @asyncRoot tags. array_reduce, EmptyIterator and DIRECTORY_SEPARATOR are sync, perform no driver IO, and return no Promise. array_reduce's callback is resolved as for array_any, which is also sync.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request files changed.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 66357ca065df2829d18e28b0a5541091feffe972

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `f980922201d1a61112969162cb88bd50470f2f6e`, on 2026-10-30T19:29:47.881Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test or Expectations line is added or changed; no Upstream assertion mapping applies. |
| F-2: No expected value is weakened | pass | The new tests compare exact PHP probe outputs, including exception classes and messages. Existing probe expectations are preserved, with array_reduce added; the exact registry count increases from 132 to 133 accordingly. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests are changed and no Upstream assertions are removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no skip Expectations lines. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation markers or Expectations adapted fields are added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixtures relied upon by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-143 through 145 check their declared fold, callable, error, iterator, separator, registry and export consequences against exact probe outputs and direct assertions. The touched existing tests retain their declared checks and include the new registry entry. |
| F-8: No stub, fake or partial implementation of another Component | pass | All scoped changes remain within packages/runtime. The three builtins implement runtime behavior authorized by ESC-15.2-6, without implementing another Component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed declarations and retained tag inventory contain no async roots. The new functions and iterator methods are synchronous; file_get_contents remains synchronous under ESC-15.2-3's explicit ruling. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"66357ca065df2829d18e28b0a5541091feffe972","base":"f980922201d1a61112969162cb88bd50470f2f6e","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T19:29:47.881Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test or Expectations line is added or changed; no Upstream assertion mapping applies.","findings":[]},{"id":"F-2","result":"pass","note":"The new tests compare exact PHP probe outputs, including exception classes and messages. Existing probe expectations are preserved, with array_reduce added; the exact registry count increases from 132 to 133 accordingly.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests are changed and no Upstream assertions are removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no skip Expectations lines.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation markers or Expectations adapted fields are added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixtures relied upon by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-143 through 145 check their declared fold, callable, error, iterator, separator, registry and export consequences against exact probe outputs and direct assertions. The touched existing tests retain their declared checks and include the new registry entry.","findings":[]},{"id":"F-8","result":"pass","note":"All scoped changes remain within packages/runtime. The three builtins implement runtime behavior authorized by ESC-15.2-6, without implementing another Component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The changed declarations and retained tag inventory contain no async roots. The new functions and iterator methods are synchronous; file_get_contents remains synchronous under ESC-15.2-3's explicit ruling.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 66357ca065df2829d18e28b0a5541091feffe972

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `f980922201d1a61112969162cb88bd50470f2f6e`, on 2026-10-30T19:29:47.881Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and no Ported Test; only Xaravel Tests and runtime source change, so there is no Upstream assertion to compare. |
| F-2: No expected value is weakened | pass | No Ported Test is touched. The only existing expected value that changes is XT-runtime-84's registry count, from 132 to 133. That matches the one added 'entry("array_reduce", array_reduce, 2, 3)' in phpFunctions.ts. php-set-functions.probe.txt was regenerated, adding only array_reduce rows ('["array_reduce",2,3,false,[]]', its ArgumentCountErrors, '"array_reduce":true'); no existing row changed. Nothing was loosened or bent to match Xaravel output. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed and there are no stale_tests, so there are no Upstream assertion counts to compare. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No '// adapted:DIV-<n>.<k>' marker and no Expectations 'adapted' field is added; DIV-9.13 is cited only in prose and docstrings as the shared-resolver rule. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no error fixtures, base or changed, and the touched Xaravel Tests rely on a PHP probe record rather than Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-143 checks the labels reduce, reduce.order, reduce.callables, reduce.bad_callback and reduce.bad_array against the PHP 8.5.11 record. These cover the start value (null by default, returned for []), the callback getting only (carry, value), the callable forms ('max', '\\MAX', [class, method], 'Class::method', [object, method], an invokable, a closure), and the TypeErrors for a non-array and a refused callback. XT-runtime-144 checks the empty and empty.access labels: valid/next/rewind, iterator_to_array and iterator_count, {} as JSON, [] as an array, ==, serialization and unserialization, Iterator and Traversable but not Countable or ArrayAccess, a subclass, class_exists, and both BadMethodCallException messages. Its Xaravel-only lines add registry and JS iteration checks. XT-runtime-145 checks separator, reduce.reflection (2, 3, false), reduce.counts (the ArgumentCountErrors and function_exists), and that the root and the php subpath export the same objects. I spot-checked several recorded values against PHP semantics (16, 6, 'qr', the max fold with a null start giving 7, strcmp(0,'b') giving -50) and they are consistent. None of the description strings cites an FR or AD bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every change is in packages/runtime (src, docs, README, tests/xaravel), the scope the action item lists. No stub, fake or hard-coded behaviour of another Component is added; the ESC-15.2-6 builtins are implemented in the runtime as the ruling directs. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in index.ts, EmptyIterator.ts, arrayFunctions.ts, fileFunctions.ts, php/index.ts or phpFunctions.ts. The new exports (array_reduce, EmptyIterator and its methods, DIRECTORY_SEPARATOR) are all synchronous: they do no IO, and their callbacks are sync PHP-builtin callbacks, not ones DIV-1 allows to be async. So no tag is missing and none is false. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ is touched. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"66357ca065df2829d18e28b0a5541091feffe972","base":"f980922201d1a61112969162cb88bd50470f2f6e","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T19:29:47.881Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and no Ported Test; only Xaravel Tests and runtime source change, so there is no Upstream assertion to compare.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test is touched. The only existing expected value that changes is XT-runtime-84's registry count, from 132 to 133. That matches the one added `entry(\"array_reduce\", array_reduce, 2, 3)` in phpFunctions.ts. php-set-functions.probe.txt was regenerated, adding only array_reduce rows (`[\"array_reduce\",2,3,false,[]]`, its ArgumentCountErrors, `\"array_reduce\":true`); no existing row changed. Nothing was loosened or bent to match Xaravel output.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed and there are no stale_tests, so there are no Upstream assertion counts to compare.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No `// adapted:DIV-<n>.<k>` marker and no Expectations `adapted` field is added; DIV-9.13 is cited only in prose and docstrings as the shared-resolver rule.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no error fixtures, base or changed, and the touched Xaravel Tests rely on a PHP probe record rather than Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-143 checks the labels reduce, reduce.order, reduce.callables, reduce.bad_callback and reduce.bad_array against the PHP 8.5.11 record. These cover the start value (null by default, returned for []), the callback getting only (carry, value), the callable forms ('max', '\\\\MAX', [class, method], 'Class::method', [object, method], an invokable, a closure), and the TypeErrors for a non-array and a refused callback. XT-runtime-144 checks the empty and empty.access labels: valid/next/rewind, iterator_to_array and iterator_count, {} as JSON, [] as an array, ==, serialization and unserialization, Iterator and Traversable but not Countable or ArrayAccess, a subclass, class_exists, and both BadMethodCallException messages. Its Xaravel-only lines add registry and JS iteration checks. XT-runtime-145 checks separator, reduce.reflection (2, 3, false), reduce.counts (the ArgumentCountErrors and function_exists), and that the root and the php subpath export the same objects. I spot-checked several recorded values against PHP semantics (16, 6, 'qr', the max fold with a null start giving 7, strcmp(0,'b') giving -50) and they are consistent. None of the description strings cites an FR or AD bullet.","findings":[]},{"id":"F-8","result":"pass","note":"Every change is in packages/runtime (src, docs, README, tests/xaravel), the scope the action item lists. No stub, fake or hard-coded behaviour of another Component is added; the ESC-15.2-6 builtins are implemented in the runtime as the ruling directs.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in index.ts, EmptyIterator.ts, arrayFunctions.ts, fileFunctions.ts, php/index.ts or phpFunctions.ts. The new exports (array_reduce, EmptyIterator and its methods, DIRECTORY_SEPARATOR) are all synchronous: they do no IO, and their callbacks are sync PHP-builtin callbacks, not ones DIV-1 allows to be async. So no tag is missing and none is false.","findings":[]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ is touched.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: done

**Summary.** `@xaravel/runtime/php` (and the package root) now export the constant `DIRECTORY_SEPARATOR` (`"/"`), `array_reduce($array, $callback, $initial = null)` (a registry entry, 2 required and 3 total arguments, every PHP callable form through the shared resolver, DIV-9.13), and the class `EmptyIterator` registered under its PHP name (`Iterator` and `Traversable` brands, `valid()` false, `current()` / `key()` throwing PHP's `BadMethodCallException` messages, not final). Registry 132 → 133.

**Files changed.**
- `packages/runtime/src/php/EmptyIterator.ts` (new): the class, with a props hook so two compare `==` as in PHP.
- `packages/runtime/src/php/arrayFunctions.ts`: `array_reduce`.
- `packages/runtime/src/php/fileFunctions.ts`: `DIRECTORY_SEPARATOR`.
- `packages/runtime/src/php/phpFunctions.ts`, `src/php/index.ts`, `src/index.ts`: registry entry and exports.
- `packages/runtime/docs/php-functions.md`, `docs/php-builtins.md`, `README.md`: docs.
- `packages/runtime/tests/xaravel/php-reduce-empty-iterator.{probe.php,probe.txt,test.ts}`: XT-runtime-143..145 against PHP 8.5.11.
- `packages/runtime/tests/xaravel/php-set-functions.*`: the registry lists and count this change made stale.

**Review.** Pass 1 had 17 findings: 2 patched (low: two Traversable `reduce.bad_array` probe rows; docs wording), 0 deferred, 15 rejected (7 false, 8 low with reasons in the Review Triage Log: raw-JS carry mutation as every builtin does, resolver arity already pinned, fold snapshot/throw, `undefined` callback, `void` methods, three-line props hook, constant placement, generic class-name paths). Pass 2 was the Finalize re-check: the Fidelity Review on tree `66357ca065df2829d18e28b0a5541091feffe972`, both pass; `status` prints `current`.

**Follow-up review recommended: false.** Patched counts by entry verdict: high 0, medium 0, low 2.

**Verification.**
- Both probes regenerate with no diff against PHP 8.5.11.
- `bun run typecheck` and `bun run lint` exit 0.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`; Xaravel Tests 522, 517 passed, 0 failed, 5 skipped.
- `fidelity:review status --item epic-15-item-4-runtime-directory-separator-array-reduce-empty-iterator` prints `current`.

**Residual risks.**
- Probed on macOS PHP 8.5.11, not inside the Oracle image (no Docker on the host); `DIRECTORY_SEPARATOR` is `/` on every non-Windows PHP build.
- Story 15.2 must still replace its three `BlockedByComponentError(runtime)` throws in `packages/config`.
