---
title: 'Runtime UnhandledMatchError and callMethod (epic-14-item-7-runtime-match-error-dynamic-call)'
type: 'feature'
created: '2026-10-26'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 'c7730c8255696369344ee20774e51b3b0b3614c1'
context:
  - '{project-root}/decisions/ESC-14.2-6.md'
  - '{project-root}/decisions/ESC-14.2-7.md'
  - '{project-root}/decisions/MAINT-2026-10-26-runtime-builtins.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-retro-14-runtime-sort-string-functions.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 14.2's last 4 Test IDs are held. `Collection::sortBy`'s `match ($descending)` has no `default` arm, so PHP throws `UnhandledMatchError` (ESC-14.2-6, approved by the monitor). The fixture `TestAccessorEloquentTestStub` calls `$this->$accessor()` with a name that PHP resolves case-insensitively (ESC-14.2-7, approved by the Maintainer). `@xaravel/runtime` has neither. This is action item `epic-14-item-7-runtime-match-error-dynamic-call`.

**Scope:** `packages/runtime/**` only, under amendment 2026-10-22 of `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. This spec and sprint status may change too. PORTING.md's `callMethod` row is already on `main` (#475).

**Approach:** `@xaravel/runtime/php` and the package root export three things, each ported from PHP 8.5.11 (`Zend/zend_execute.c` `zend_match_unhandled_error`, `Zend/zend_smart_str.c` `smart_str_append_scalar` / `smart_str_append_double` / `smart_str_append_escaped_truncated`, and `Zend/zend_vm_def.h` `ZEND_INIT_METHOD_CALL` with `zend_std_get_method` / `zend_undefined_method`):

- the class `UnhandledMatchError`;
- `unhandledMatch(subject)`, which builds the error a `match` with no matching arm throws;
- `callMethod(object, name, ...args)`.

## Boundaries & Constraints

**Always:**
- **Values and messages** are the ones PHP 8.5.11 gives on the host, recorded by a new probe.
- **UnhandledMatchError** extends the runtime's PHP `Error`, takes `Error`'s constructor unchanged (`new UnhandledMatchError("m", 3)`), and is registered as `UnhandledMatchError` in its own file `src/php/UnhandledMatchError.ts` (AD-3, AD-10).
- **unhandledMatch(subject)** returns (never throws) a new `UnhandledMatchError`. A port writes `throw unhandledMatch(x)` where PHP's `match` has no matching arm. Its message is `Unhandled match case ` followed by the subject, as `smart_str_append_scalar` renders it at `precision` 14 and `exception_string_param_max_len` 15:
  - `null` and `undefined` are `NULL`; `true` / `false`; an int (number or bigint) in decimal.
  - A float is `formatFloat`'s text, with `.0` added when it is finite and has no `.` (`1.0`, `-0.0`, `1.0E+20`, `0.3`, `INF`, `NAN`).
  - A string is quoted with `'` and taken as its UTF-8 bytes. At most the first 15 bytes are escaped, and `...` is added inside the quotes when the string is longer. Escaping turns `\n \r \t \f \v`, ESC and `\` into `\n \r \t \f \v \e \\`. Any other byte below 32 or above 126 becomes `\xHH`, with upper-case hex.
  - An array (by `phpType`) is `of type array`. An object is `of type <getDebugType>`, so a Closure is `of type Closure`. A class constructor or a contract token is a class-string, so it renders as a string.
- **callMethod(object, name, ...args)** gives PHP's `$object->$name(...$args)`, checked in PHP's order:
  1. A `name` that is not a JS string, a `__toString` object included, throws PHP's `Error` `Method name must be a string`.
  2. An `object` whose PHP type is not `object` throws PHP's `Error` `Call to a member function <name>() on <phpTypeName>`. That type reads `null`, `true`, `string`, `array`, `int` or `float`; a class constructor or a contract token reads `string`.
  3. A Closure handles `__invoke` in any case by calling the function with `args`.
  4. Otherwise the method is looked up on the object's class as `method_exists` does: `findMethod` exact, then case-insensitively over the prototype chain, then the static chain, then `__toString` as the `toString()` port. One resolver is shared with `method_exists`, with no second copy. A prototype method is called with `this` = the object; a static method with `this` = the object's class (PHP's `static::`). The method's result is returned unchanged.
  5. If no method is found, the class's `__call`, found by the same resolver, is called as `__call(name, args)`, `args` being a JS array and `name` keeping the caller's case.
  6. Otherwise it throws PHP's `Error` `Call to undefined method <getDebugType(object)>::<name>()`.
- **Tests.** The new XT cases use `xaravelTest` and `@xaravel/assert`. A probe records every value PHP gives. A recompute case checks every probe label against the runtime, and a fresh-process case checks that the root and `@xaravel/runtime/php` export each new name as the same object.

**Never:**
- Change an existing export or behaviour. `method_exists` keeps its results exactly, and its XT-runtime-73 cases still pass.
- Add `UnhandledMatchError` to `Symbol.for('xaravel.php.classes')`, the grader's map of root throwables. Like `Closure` and the other later classes, it stays out, so XT-runtime-35's 24-entry map is unchanged.
- Port PHP's visibility checks: a JS method has none, so the "Call to private method" error is not ported. Also not ported: Closure's `bind`, `bindTo`, `call` and `fromCallable` through `callMethod`. Those throw a JS `TypeError` naming the unported Closure method. A Closure name that is not a PHP Closure method throws PHP's undefined-method `Error` for `Closure`.
- Import `@xaravel/contracts` (AD-2), touch `conformance/**`, `decisions/**`, PORTING.md or another package, add a DIV clause, or change an existing assertion.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected | Error |
|---|---|---|---|
| match scalars | `null`, `true`, `false`, `5`, `-5`, `2n**62n`, `float(1)`, `1.5`, `0.1+0.2`, `1e20`, `-0`, `INF`, `NAN`, `1e15` | `NULL`, `true`, `false`, `5`, `-5`, `4611686018427387904`, `1.0`, `1.5`, `0.3`, `1.0E+20`, `-0.0`, `INF`, `NAN`, `1.0E+15` | none |
| match strings | `''`, `'abc'`, `"a\nb\tc\\d\x1b\x01\x7f"`, `'é'`×8, 16 and 15 ASCII chars, `"\r\f\v"` | PHP's quoted, escaped and cut text | none |
| match others | `[]`, `[1]`, `{a:1}`, `new stdClass`, a registered class's object, a closure | `of type array` ×3, `of type stdClass`, `of type <FQCN>`, `of type Closure` | none |
| call exact / case | `foo`, `FOO`, static `st`, `ST` from a subclass | the method's result; `st` sees the subclass as `this` | none |
| call `__call` | a missing name, a name differing only in case from nothing, on a class with `__call` (and one declaring `__CALL`) | `__call(name, args)` with the caller's case | none |
| call undefined | `nope`, `''` on a class without `__call`; `nope` on a closure | — | `Error` `Call to undefined method A::nope()` / `A::()` / `Closure::nope()` |
| bad name | `1`, `null`, `true`, a `__toString` object | — | `Error` `Method name must be a string` (before the object check) |
| non-object | `null`, `true`, `false`, `5`, `1.5`, `'str'`, `[1]`, a class constructor | — | `Error` `Call to a member function foo() on null` / `true` / `false` / `int` / `float` / `string` / `array` / `string` |
| closure | `__invoke` / `__INVOKE` with `3` on `a => a*2`; `bind` | `6`; then a JS `TypeError` | as stated |

</intent-contract>

## Code Map

- `packages/runtime/src/php/objectFunctions.ts`: `subjectOf` :37, `hasMethodNamed` :140, `classHasMethod` :150 (refactor into a resolver that returns the found function and whether it is static; `classHasMethod` keeps its boolean), `method_exists` :170. `callMethod` goes here.
- `packages/runtime/src/php/reflectionTargets.ts`: `findMethod` :84 (exact; returns `fn`, `isStatic`), `classChain` :62.
- `packages/runtime/src/php/scalarString.ts`: `formatFloat` :59 (precision 14) and `stringPort` :12 (the `__toString` port).
- `packages/runtime/src/php/phpType.ts`: `phpType`, `phpTypeName` (`zend_zval_value_name`), `getDebugType` (`A@anonymous` for an unregistered subclass, as PHP names an anonymous class).
- `packages/runtime/src/php/Closure.ts`: `isClassConstructor`, `isClosureValue`. `registry/registry.ts`: `isContractToken`.
- `packages/runtime/src/php/mangle.ts`: `utf8` (the UTF-8 encoder).
- `packages/runtime/src/php/ValueError.ts`: the pattern for an `Error` subclass file. `src/php/Error.ts` is the parent.
- `packages/runtime/src/php/index.ts` and `src/index.ts`: the export lists. XT-runtime-37 (`tests/xaravel/docs.test.ts`) requires every exported name in backticks somewhere under `docs/`.
- `packages/runtime/docs/exceptions.md` (the class table row for `Error`) and `docs/php-functions.md` (add a section).
- `packages/runtime/tests/xaravel/php-sort-string-functions.{test.ts,probe.php,probe.txt}`: the probe, recompute and fresh-process pattern to copy (XT-runtime-74..76).
- Read-only callers: `conformance/upstream/framework/src/Illuminate/Collections/Collection.php` (`sortBy`'s `match`), and `SupportCollectionTest.php` `TestAccessorEloquentTestStub`.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/UnhandledMatchError.ts`: add the class and `unhandledMatch` (ESC-14.2-6).
- `packages/runtime/src/php/objectFunctions.ts`: add the shared method resolver and `callMethod`, and update the header (ESC-14.2-7).
- `packages/runtime/src/php/index.ts` and `packages/runtime/src/index.ts`: export `UnhandledMatchError`, `unhandledMatch` and `callMethod`.
- `packages/runtime/docs/exceptions.md` and `docs/php-functions.md`: document each export and its limits.
- `packages/runtime/tests/xaravel/php-match-dynamic-call.probe.php` and `.probe.txt`: the PHP evidence (`php -d error_reporting=0 php-match-dynamic-call.probe.php > php-match-dynamic-call.probe.txt`).
- `packages/runtime/tests/xaravel/php-match-dynamic-call.test.ts`: XT-runtime-77 (`UnhandledMatchError` and `unhandledMatch`), XT-runtime-78 (`callMethod`), and XT-runtime-79 (the probe recompute and the fresh-process export check).

**Acceptance Criteria:**
- Given the matrix rows, when XT-runtime-77..79 run, then each row holds and every probe label matches PHP 8.5.11.
- Given the existing `method_exists` cases (XT-runtime-73), when they run after the resolver refactor, then they still pass.
- Given the change, when `bun run harness`, `bun run typecheck`, `bun run lint` and `bun run async-surface --check runtime` run, then they report no differences and no errors.
- Given the item, when `bun run fidelity:review status --item epic-14-item-7-runtime-match-error-dynamic-call --spec <this spec>` runs, then it prints `current`.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 23 findings (Blind 12, Edge 7, Verification gap 1, Intent 3; rows marked "2 rows" group two findings of one root cause) — high 0, medium 1, low 21, false 1, maybe-false 0
- findings:
  - `[medium]` `patch` Blind: `callMethod` returns `undefined` from a method with no `return` (AD-9) — patched: the `__invoke`, method and `__call` paths go through `normalizeNull`; docs and an XT-runtime-78 assertion.
  - `[low]` `patch` Blind: PHP 8.5's `Closure::getCurrent` is missing from the unported list — patched: added, with an assertion.
  - `[low]` `patch` Blind + Edge (2 rows): a lone surrogate in a string subject is silently written as `\xEF\xBF\xBD` — patched: throws the runtime's JS `TypeError` naming `unhandledMatch`, as every other string function does; docs and an assertion.
  - `[low]` `patch` Blind + Verification gap (2 rows): a `static __call` was taken as the fallback, with `this` the class, and the branch was untested — patched: only an instance `__call` is taken, as in PHP; a static `__call` gives the undefined-method `Error`, asserted; docs say `__callStatic` takes no part.
  - `[low]` `patch` Blind: `callMethod(obj, "toString")` finds the `__toString` port under its JS name — patched: listed under "Not ported" (the same holds for `method_exists`).
  - `[low]` `patch` Blind + Edge (2 rows): a symbol or out-of-int64 bigint `object` built a PHP `Error` `on symbol` / `on int` — patched: `phpType` runs first and throws the runtime's JS `TypeError`; documented and asserted.
  - `[low]` `reject` Blind: no enum-case or anonymous-class-constructor subject test — an enum case is an object, which the registered-class row already covers through `getDebugType`; an unregistered class constructor is a class-string as `stringOf` gives it everywhere else.
  - `[low]` `patch` Blind: exceptions.md's "the 22 classes above other than `UnhandledMatchError`" misreads with 23 in the table — patched: reworded.
  - `[low]` `patch` Blind: XT-runtime-77 hard-coded the map size 24 — patched: asserts only that `UnhandledMatchError` is not on the map.
  - `[low]` `reject` Blind: the spec's Verification section omits commands — its fix edits this build's spec; the commands ran (Auto Run Result).
  - `[low]` `patch` Blind: export lists out of case-insensitive order — patched: `unhandledMatch` before `UnhandledMatchError`.
  - `[low]` `reject` Blind: `stringOf` exported from `typeTests.ts` for one caller — a module-level internal export not in the package's export lists, as `requiredCallback` was in item 6; moving it is restructuring with no observable gain.
  - `[low]` `patch` Edge (2 rows): `callMethod(fn, "constructor")` read `Object.prototype.constructor` from the unported record — patched: the list is a `Map`; PHP's undefined-method `Error` for `Closure::constructor()`, asserted.
  - `[low]` `patch` Edge (2 rows): an exact match on a parent beat a case-insensitive override on a subclass (`S::FOO` over `P::foo`), unlike PHP — patched: each holder is tried exactly and then case-insensitively before its parent; probe label `call.override` records PHP's `child FOO`; `method_exists` results unchanged.
  - `[low]` `reject` Edge: names of JS intrinsics on the static or prototype chain (`Error.captureStackTrace`) are found as methods — the same lookup `method_exists` and `findMethod` already make (pre-existing, DIV-3.2 / DIV-9.14 chains); no port calls such a name dynamically; a guard per intrinsic adds branches for an unlikely input.
  - `[low]` `reject` Intent: the message is built by a third export, `unhandledMatch`, not by the class — descriptive. `new UnhandledMatchError(message)` must keep PHP `Error`'s constructor, so the subject cannot go through it; a factory is the smallest surface that gives PHP's message.
  - `[low]` `reject` Intent: the tests exercise runtime fixtures, not Story 14.2's consumers — descriptive; the consumers are Story 14.2's work, outside this item's runtime scope.
  - `[false]` `reject` Intent: `method_exists` internals refactored against "no other runtime behaviour changes" — the refactor changes no result; XT-runtime-73 and the new `method_exists` assertions pass.
- Fidelity Review: 2 pass verdicts at tree 3d8a82b9 (pre-patch); re-run on the patched tree below.

## Verification

**Commands:**
- `bun test packages/runtime` -- expected: all pass
- `bun run typecheck` and `bun run lint` -- expected: no errors
- `bun run harness` -- expected: no differences, ending in a `SUMMARY` line

## Fidelity Review

### Reviewer 1: pass at tree 3d8a82b9fc2549702334b704f4adb5d11aeee194

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `c7730c8255696369344ee20774e51b3b0b3614c1`, on 2026-10-27T01:11:38.777Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are added or changed; the action item assigns none. |
| F-2: No expected value is weakened | pass | The new tests compare complete results and exception class/message strings exactly against the supplied PHP probe record. No existing expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test or existing assertion is removed or changed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The action item relies on no Oracle error fixtures; the PHP probe records are not Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-77 checks the error hierarchy and subject rendering; XT-runtime-78 checks dynamic lookup, invocation, fallback and errors; XT-runtime-79 compares every probe label and fresh-process export identity. These checks cover their declared consequences. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed implementation, documentation and test files remain within the assigned runtime component. The helpers implement runtime behavior authorized by ESC-14.2-6 and ESC-14.2-7, with no implementation of another component. |
| F-9: Every `@asyncRoot` tag is true | pass | The touched source files contain no asyncRoot tags. The new implementations perform synchronous formatting, lookup and invocation without IO or an async callback contract requiring a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"3d8a82b9fc2549702334b704f4adb5d11aeee194","base":"c7730c8255696369344ee20774e51b3b0b3614c1","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-27T01:11:38.777Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are added or changed; the action item assigns none.","findings":[]},{"id":"F-2","result":"pass","note":"The new tests compare complete results and exception class/message strings exactly against the supplied PHP probe record. No existing expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test or existing assertion is removed or changed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The action item relies on no Oracle error fixtures; the PHP probe records are not Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-77 checks the error hierarchy and subject rendering; XT-runtime-78 checks dynamic lookup, invocation, fallback and errors; XT-runtime-79 compares every probe label and fresh-process export identity. These checks cover their declared consequences.","findings":[]},{"id":"F-8","result":"pass","note":"All changed implementation, documentation and test files remain within the assigned runtime component. The helpers implement runtime behavior authorized by ESC-14.2-6 and ESC-14.2-7, with no implementation of another component.","findings":[]},{"id":"F-9","result":"pass","note":"The touched source files contain no asyncRoot tags. The new implementations perform synchronous formatting, lookup and invocation without IO or an async callback contract requiring a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 3d8a82b9fc2549702334b704f4adb5d11aeee194

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `c7730c8255696369344ee20774e51b3b0b3614c1`, on 2026-10-27T01:11:38.777Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests changed; only Xaravel Tests. |
| F-2: No expected value is weakened | n/a | No Upstream expected values; no Ported Test changed. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests changed, so no assertion count compared. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations skip lines added. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted markers or DIV clauses cited. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixtures relied on; none are errors. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-77/78/79 bodies check what the strings claim: probe-recorded PHP values for match messages and callMethod cases, plus Xaravel-only extras; XT-79 checks all labels and the fresh-process exports. Strings cite no FR/AD tokens. |
| F-8: No stub, fake or partial implementation of another Component | pass | Change is confined to packages/runtime (src, docs, tests), as ESC-14.2-6/7 and the runtime-builtins MAINT rule approve; no other Component's behaviour stubbed. |
| F-9: Every `@asyncRoot` tag is true | pass | No @​asyncRoot tags added or kept; unhandledMatch, callMethod and the resolver are sync and do no Driver IO and take no async callback (callMethod invokes arbitrary user methods, not a callback parameter). |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request files changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"3d8a82b9fc2549702334b704f4adb5d11aeee194","base":"c7730c8255696369344ee20774e51b3b0b3614c1","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-27T01:11:38.777Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests changed; only Xaravel Tests.","findings":[]},{"id":"F-2","result":"n/a","note":"No Upstream expected values; no Ported Test changed.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests changed, so no assertion count compared.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations skip lines added.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted markers or DIV clauses cited.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixtures relied on; none are errors.","findings":[]},{"id":"F-7","result":"pass","note":"XT-77/78/79 bodies check what the strings claim: probe-recorded PHP values for match messages and callMethod cases, plus Xaravel-only extras; XT-79 checks all labels and the fresh-process exports. Strings cite no FR/AD tokens.","findings":[]},{"id":"F-8","result":"pass","note":"Change is confined to packages/runtime (src, docs, tests), as ESC-14.2-6/7 and the runtime-builtins MAINT rule approve; no other Component's behaviour stubbed.","findings":[]},{"id":"F-9","result":"pass","note":"No @asyncRoot tags added or kept; unhandledMatch, callMethod and the resolver are sync and do no Driver IO and take no async callback (callMethod invokes arbitrary user methods, not a callback parameter).","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request files changed.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 254d7aea2c3b2132f073d495da0b6888c810bf8b

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `c7730c8255696369344ee20774e51b3b0b3614c1`, on 2026-10-27T01:19:34.564Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are added or changed; the action item assigns none. |
| F-2: No expected value is weakened | pass | Compared the new test expectations with the supplied PHP probe outputs. PHP values and exception messages are compared exactly; no existing expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions or stale cross-component test assertions are removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The action item relies on no Oracle error fixtures; the supplied PHP probe records are not Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-77 through XT-runtime-79 with their consequences and helpers. They check match-error inheritance and rendering, dynamic dispatch and errors, every recorded probe label, and fresh-process export identity. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared all changed paths and implementations with the runtime action-item scope and ESC-14.2-6/7. All changes belong to runtime; none implements another Component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source declarations with AD-6 and DIV-1. The new helpers are synchronous, perform no IO, and require no async-root tags; no tags are retained in these files. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"254d7aea2c3b2132f073d495da0b6888c810bf8b","base":"c7730c8255696369344ee20774e51b3b0b3614c1","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-27T01:19:34.564Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are added or changed; the action item assigns none.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the new test expectations with the supplied PHP probe outputs. PHP values and exception messages are compared exactly; no existing expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions or stale cross-component test assertions are removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The action item relies on no Oracle error fixtures; the supplied PHP probe records are not Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-77 through XT-runtime-79 with their consequences and helpers. They check match-error inheritance and rendering, dynamic dispatch and errors, every recorded probe label, and fresh-process export identity.","findings":[]},{"id":"F-8","result":"pass","note":"Compared all changed paths and implementations with the runtime action-item scope and ESC-14.2-6/7. All changes belong to runtime; none implements another Component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source declarations with AD-6 and DIV-1. The new helpers are synchronous, perform no IO, and require no async-root tags; no tags are retained in these files.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 254d7aea2c3b2132f073d495da0b6888c810bf8b

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `c7730c8255696369344ee20774e51b3b0b3614c1`, on 2026-10-27T01:19:34.564Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test; only Xaravel Tests (XT-runtime-77..79) are added. |
| F-2: No expected value is weakened | n/a | No Ported Test or stale_tests file is touched, so no Upstream expected value exists to weaken. The new Xaravel Tests use exact assertSame comparisons against PHP 8.5.11 probe output. Their only substring checks (assertStringContainsString) are on Xaravel-only JS TypeError messages, which have no PHP counterpart. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so no Upstream assertion can lose its counterpart; no stale_tests file is listed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change touches no Expectations line; evidence (i) confirms no added skip line. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV-<n>.<k> marker and no Expectations adapted field is touched. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed Oracle fixture is an error; the tests rely on a committed PHP probe record, not Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared each consequence string with its test body. XT-runtime-77 checks UnhandledMatchError's class, parent Error, Throwable, constructor behaviour and TypeError, and unhandledMatch returning (not throwing) the error. The probe labels match.class, match.scalars, match.strings and match.others cover null, bools, ints, floats, strings (escaped and cut at 15 bytes), arrays and objects. Spot-checked runtime rendering (formatFloat for 1e14/1e15/1e-5, the 1.2345678901235E+17 case) against the probe. XT-runtime-78 checks callMethod's order: non-string name, then non-object (call.badName, call.nonObject); Closure __invoke in any case (call.closure); exact and case-insensitive resolution and __toString (call.exact, call.override); 'this' the object or, for a static method, its class (explicit assertions plus st()); __call with the caller's case (call.magic); the undefined-method Error (call.undefined). XT-runtime-79 recomputes every probe label, checks the label sets are equal, and does the root/php identity check in-process and in a fresh process. No FR/AD <n>.<k> tokens are cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files are under packages/runtime, the item's only component. callMethod and unhandledMatch are runtime builtins approved by ESC-14.2-6/ESC-14.2-7 under MAINT-2026-10-26-runtime-builtins. Nothing stubs or fakes another component's behaviour. The refactor of method_exists into resolveMethod keeps the same boolean results (exact or case-insensitive on either chain, plus the __toString port). |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in index.ts, php/index.ts, UnhandledMatchError.ts, objectFunctions.ts or typeTests.ts. The new exports (unhandledMatch, UnhandledMatchError, callMethod, stringOf) are synchronous, return no declared Promise or thenable type, and reach no Driver-contract IO root, so none needs a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"254d7aea2c3b2132f073d495da0b6888c810bf8b","base":"c7730c8255696369344ee20774e51b3b0b3614c1","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-27T01:19:34.564Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test; only Xaravel Tests (XT-runtime-77..79) are added.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test or stale_tests file is touched, so no Upstream expected value exists to weaken. The new Xaravel Tests use exact assertSame comparisons against PHP 8.5.11 probe output. Their only substring checks (assertStringContainsString) are on Xaravel-only JS TypeError messages, which have no PHP counterpart.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so no Upstream assertion can lose its counterpart; no stale_tests file is listed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change touches no Expectations line; evidence (i) confirms no added skip line.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV-<n>.<k> marker and no Expectations adapted field is touched.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed Oracle fixture is an error; the tests rely on a committed PHP probe record, not Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"Compared each consequence string with its test body. XT-runtime-77 checks UnhandledMatchError's class, parent Error, Throwable, constructor behaviour and TypeError, and unhandledMatch returning (not throwing) the error. The probe labels match.class, match.scalars, match.strings and match.others cover null, bools, ints, floats, strings (escaped and cut at 15 bytes), arrays and objects. Spot-checked runtime rendering (formatFloat for 1e14/1e15/1e-5, the 1.2345678901235E+17 case) against the probe. XT-runtime-78 checks callMethod's order: non-string name, then non-object (call.badName, call.nonObject); Closure __invoke in any case (call.closure); exact and case-insensitive resolution and __toString (call.exact, call.override); `this` the object or, for a static method, its class (explicit assertions plus st()); __call with the caller's case (call.magic); the undefined-method Error (call.undefined). XT-runtime-79 recomputes every probe label, checks the label sets are equal, and does the root/php identity check in-process and in a fresh process. No FR/AD <n>.<k> tokens are cited.","findings":[]},{"id":"F-8","result":"pass","note":"All changed files are under packages/runtime, the item's only component. callMethod and unhandledMatch are runtime builtins approved by ESC-14.2-6/ESC-14.2-7 under MAINT-2026-10-26-runtime-builtins. Nothing stubs or fakes another component's behaviour. The refactor of method_exists into resolveMethod keeps the same boolean results (exact or case-insensitive on either chain, plus the __toString port).","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in index.ts, php/index.ts, UnhandledMatchError.ts, objectFunctions.ts or typeTests.ts. The new exports (unhandledMatch, UnhandledMatchError, callMethod, stringOf) are synchronous, return no declared Promise or thenable type, and reach no Driver-contract IO root, so none needs a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: done

- **Change:** `@xaravel/runtime/php` and the package root export PHP's `UnhandledMatchError` (extends `Error`, registered under its PHP name, off the grader's class map), `unhandledMatch(subject)` (PHP 8.5.11's `Unhandled match case …` message, `smart_str_append_scalar` rendering) and `callMethod(object, name, ...args)` (PHP's `$object->$name(...$args)`: one resolver with `method_exists`, nearest holder first, exact then case-insensitive; an instance `__call`; PHP's `Error`s).
- **Files:** `packages/runtime/src/php/UnhandledMatchError.ts` (new class and factory); `src/php/objectFunctions.ts` (shared `resolveMethod`, `callMethod`); `src/php/typeTests.ts` (`stringOf` module export); `src/php/index.ts`, `src/index.ts` (exports); `docs/exceptions.md`, `docs/php-functions.md`; `tests/xaravel/php-match-dynamic-call.{probe.php,probe.txt,test.ts}` (XT-runtime-77..79).
- **Review:** 23 findings; 15 patched (1 medium, 14 low), 0 deferred, 8 rejected with reasons in the triage log. Follow-up review: `false` (no high, one medium patched).
- **Verification:** `bun test packages/runtime` 79 pass; `bun run typecheck`, `bun run lint`, `bun run async-surface --check runtime`, `bun run registration:check` clean; `bun run harness` `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0` (not-run: backends not installed locally); probe re-run matches `probe.txt`; Fidelity Review `current` at tree 254d7aea2c3b2132f073d495da0b6888c810bf8b (2 pass).
- **Residual risks:** PHP visibility checks and Closure's `bind` / `bindTo` / `call` / `fromCallable` / `getCurrent` through `callMethod` are not ported (documented; the latter throw a JS `TypeError`). JS intrinsic names on a class's chains resolve as methods, as `method_exists` already does.
