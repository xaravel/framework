---
title: 'stdClass exposes its properties to PHP comparison (epic-14-retro-item-6-stdclass-props-hook)'
type: 'bugfix'
created: '2026-10-29'
status: 'done'
baseline_revision: '0b4a934f9c0147b98ade62c535a496b909ab31a5'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/conformance/review/fidelity.md'
warnings: []
deferred:
  - summary: >-
      A stdClass that mixes integer-like and string property names lists them integer-like first (JS own-key order), so `<=>`, and so sort / max / min, over such objects can differ from PHP's insertion order.
    evidence: |-
      `(object)['b'=>1, 1=>2] <=> (object)['b'=>2, 1=>1]` gives -1 in PHP (b compared first) and 1 in the port (1 compared first). stdClass stores its properties as own JS properties, which list integer-like keys first; jsonDecode.ts already records the same order limit for jsonEncode / phpSerialize, so the root cause predates this item (before it, the comparison was always uncomparable). A fix needs insertion-order tracking on stdClass, or a DIV clause through an Escalation; no DIV clause covers it today.
    location: >-
      packages/runtime/src/php/stdClass.ts, packages/runtime/src/php/jsonDecode.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `stdClass` has no `[Symbol.for('xaravel.php.props')]()` hook, so `compareObject` (`packages/runtime/src/php/looseEquals.ts`) treats two stdClass objects as uncomparable: `(object)['a'=>1] == (object)['a'=>1]` is false and `<=>` gives 1. Collection's `contains`, `unique`, `max`, `min`, `sort` and `sortDesc` over stdClass items, and over `jsonDecode` objects, therefore differ from PHP (retro finding L2, `_bmad-output/implementation-artifacts/epic-14-retro-2026-10-29.md`).

**Approach:** Give `stdClass` the props hook, returning its own enumerable string properties, in order, as a `PhpArray` (an `undefined` value reads as `null`), so the runtime's existing `==` / `<=>` object path compares them as PHP's `zend_std_compare_objects` does. Add an XT-runtime and an XT-collections test, each recomputing a PHP 8.5.11 probe.

## Boundaries & Constraints

**Always:** Change only `packages/runtime/**` and `packages/collections/**` (plus this spec and its records). The hook is a non-enumerable prototype method, so `Object.keys`, property writes and the `[property: string]: unknown` index signature are unchanged. `jsonEncode`, `phpSerialize`, the `(array)` cast and assert's display read stdClass through `objectProps`; their output must stay the same (probe rows pin it). Every expected value in the new tests is what PHP 8.5.11 printed, recorded in a `.probe.php` / `.probe.txt` pair; the collections probe runs Upstream at the Pin.

**Never:** Remove or weaken an assertion; add a skip or an `adapted:` marker; add a public export; touch `conformance/expectations/**`, another component or a Protected Path outside these two packages. Do not add the hook to other classes: the general userland case is deferred to Epic 36 (L2).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `==` | `{a:1}=={a:1}`, `{a:1}=={a:2}`, `{a:1}=={b:1}`, `{a:1,b:2}=={b:2,a:1}`, empty == empty, nested `{o:{a:1}}=={o:{a:1}}`, `{1:'x'}` == `json_decode('{"1":"x"}')`, `{a:1} == ['a'=>1]` | PHP's booleans | none |
| `<=>` | `{a:1}<=>{a:2}` both ways, `{a:1}<=>{b:1}` both ways, `{a:1}<=>{a:1,b:2}` both ways, `{a:1}<=>ArrayObject(['a'=>1])` | PHP's -1/0/1 | none |
| recursion | two distinct stdClass objects each holding itself, compared with `==`; one compared with itself | `Error: Nesting level too deep - recursive dependency?`; `true` | throws |
| codecs unchanged | `json_encode` of empty stdClass and of `{1:'x',a:2}`; `serialize({a:1})`; `(array){1:'x'}` | PHP's strings / array | none |
| Collection | `[{a:1},{a:1},{a:2}]`: `contains({a:1})`, `contains({a:3})`, `unique()`, `max()->a`, `min()->a`, `sort()->values()`, `sortDesc()->values()` | PHP's values | none |
| jsonDecode objects | `collect(json_decode('[{"a":1},{"a":1},{"a":2}]'))`: `unique()->count()`, `contains(json_decode('{"a":1}'))` | `2`, `true` | none |

</intent-contract>

## Code Map

- `packages/runtime/src/php/stdClass.ts` -- class with only an index signature; add the hook (model: `__PHP_Incomplete_Class.ts:46`, `Collection.ts:247` returns `new PhpArray([...])`).
- `packages/runtime/src/php/looseEquals.ts:134-178` -- `props()` / `compareObject`: same prototype, then compares the two props arrays with `compare`, recursion guarded; identity shortcut at `:226`. No change needed.
- `packages/runtime/src/php/mangle.ts:148-158` -- `objectProps`: class table (stdClass has none), else the hook (`propsEntries`, keys as strings), else own keys. Must give the same pairs as today.
- `packages/runtime/src/php/phpSerialize.ts:115`, `arrayStorage.ts:147`, `arrBuiltins.ts:99`, `arrayFunctions.ts` -- `objectProps` readers; unchanged output.
- `packages/assert/src/comparison/PhpComparison.ts:120,220-235` -- assert's `objectProps` prefers the hook (branded keys through `brandedKey`) over own keys (`stringKey`): same entries. Read-only.
- `packages/runtime/src/php/PhpArray.ts` -- `new PhpArray(entries)` normalises `"1"` to `1`.
- `packages/runtime/src/php/jsonDecode.ts:190` -- builds `stdClass` for objects.
- `packages/runtime/docs/php-values.md:54-55` -- Objects bullet; say stdClass carries the hook.
- `packages/runtime/tests/xaravel/php-traversable-generator.{probe.php,probe.txt,test.ts}` -- template for a probe-recomputing XT-runtime test.
- `packages/collections/tests/xaravel/generator-sources.probe.php` and `collections.test.ts:2419-2459` -- template for an Upstream-at-the-Pin probe and its XT-collections test.
- Next IDs: XT-runtime-129, XT-collections-21.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/stdClass.ts` -- add `[PHP_PROPS](): PhpArray` returning own enumerable string keys and values (`?? null`); update the header comment.
- `packages/runtime/docs/php-values.md` -- Objects bullet names stdClass's hook.
- `packages/runtime/tests/xaravel/php-stdclass-compare.probe.php` / `.probe.txt` / `.test.ts` -- XT-runtime-129: the `==`, `<=>`, recursion and codecs rows, recomputed from the probe.
- `packages/collections/tests/xaravel/stdclass-items.probe.php` / `.probe.txt` and XT-collections-21 in `packages/collections/tests/xaravel/collections.test.ts` -- the Collection and jsonDecode rows, recomputed from the probe.

**Acceptance Criteria:**
- Given stdClass or `jsonDecode` objects, when they reach any matrix row, then the port gives the PHP 8.5.11 probe's recorded value, checked by XT-runtime-129 and XT-collections-21.
- Given the existing suites, when `bun run harness` runs, then it prints no differences, and `bun run harness --xaravel`, `bun run typecheck` and `bun run lint` pass.

## Spec Change Log

## Review Triage Log

### 2026-10-29 — Review pass
- verdicts: 20 findings — high 0, medium 3, low 10, false 7, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) the hook's "in order" claim hides that integer-like names come first, so a mixed-key `<=>` differs from PHP — grouped with edge 1 / edge 4: the limit is stated in `stdClass.ts` and `php-values.md`; the behaviour itself is deferred (see the defer row).
  - `[low]` `[reject]` (blind) a `class X extends stdClass` inherits the hook and skips declared members — no class in `packages/` extends `stdClass` (verification layer grep); guarding it adds a branch and a `mangle.ts` import for an unreachable case; the general userland case is deferred to Epic 36 by L2.
  - `[low]` `[reject]` (blind) the `?? null` branch is untested — `undefined` and `null` are both PHP null to `phpType`, so `==` gives the same result either way; an `undefined` property is not something a port writes (AD-9); a test would pin no PHP-visible behaviour.
  - `[low]` `[patch]` (blind) assert's comparison of stdClass now goes through the hook, unchecked — added an `Assert.assertEquals` row over an integer-like property name in XT-runtime-129.
  - `[low]` `[patch]` (blind) matrix gaps: phpUnserialize stdClass, mutual recursion — added probe rows in XT-runtime-129. `!=` and `search` / `duplicates` / `sortBy` rows not added: they negate or reuse the same `looseEquals` / `spaceship` the existing rows pin.
  - `[false]` `[reject]` (blind) Expectations impact unaccounted — `bun run harness` printed `differ=0` over 21,817 lines, and `--component collections` `differ=0` (verification layer), so no Upstream Test ID changed status.
  - `[low]` `[reject]` (blind) every encode builds a `PhpArray` and converts keys back — the action asks for a `PhpArray`; the cost is one O(n) map per encode of a small object; changing the return shape is not a direct correction.
  - `[medium]` `[defer]` (edge 1) `(object)['b'=>1,1=>2] <=> (object)['b'=>2,1=>1]` gives 1, PHP -1 — verified; root cause is stdClass storing properties as JS own keys (integer-like first), already recorded in `jsonDecode.ts:18-20` for the codecs; needs insertion-order tracking or a DIV clause. Deferred (frontmatter).
  - `[low]` `[reject]` (edge 2) a registered subclass with a property table gets own-keys-only comparison — same as blind 2: unreachable today.
  - `[false]` `[reject]` (edge 3) assert now sees `null` for an `undefined` property — assert's display already maps own-key `undefined` through PHP null semantics; no PHP-visible value is `undefined` (AD-9), so no displayed value changes for a ported value.
  - `[medium]` `[defer]` (edge 4) the "as `zend_std_compare_objects` does" claim fails for numeric property names — same root cause as edge 1; the comment now states the limit, the behaviour is deferred.
  - `[false]` `[reject]` (verification-gap) no gaps found — no finding to act on.
  - `[false]` `[reject]` (intent R1-R2) the fix changes the runtime while L2's expectations live at Collection — intended: the action names the runtime hook and XT-collections cases at Collection; both surfaces are tested.
  - `[low]` `[patch]` (intent) `max` / `min` / `sort` not run over `jsonDecode` objects (R3) — added `jsonDecode` rows to XT-collections-21's probe.
  - `[low]` `[reject]` (intent) `median` from L2 not covered — not added: Upstream `median` needs a key (`median('a')`), which plucks numbers, so it never compares the objects and would not reach the hook.
  - `[false]` `[reject]` (intent) assert's comparison untested — duplicate of blind 4, patched there.
  - `[low]` `[patch]` (intent) LazyCollection not exercised — added LazyCollection `unique` / `contains` rows.
  - `[false]` `[reject]` (intent) Fidelity Review and checks not shown in the diff — they run in this review and Finalize; the diff is not where they are recorded.
  - `[false]` `[reject]` (intent) no `conformance/expectations/**` change — consistent with the intent; differ=0 shows none was needed.
  - `[medium]` `[patch]` (fidelity F-7, reviewer 1 reject at tree 80389fe17d45508a8bf75baf51217c539889ca48) XT-runtime-129 claims `jsonDecode` objects compare through `<=>` but has only `==` rows — added `<=>` rows over `jsonDecode` objects to the probe and test.

### 2026-10-29 — Review pass (Finalize re-check: Fidelity Review on the patched tree)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. Reviewer 1 (codex/gpt-6.1-sol) and reviewer 2 (claude/claude-opus-5-5) pass at tree 6fa466c1436072b318b46e138aa4c0552448c974; `status --item` prints `current`.

## Verification

**Commands:**
- `bun test packages/runtime/tests/xaravel/php-stdclass-compare.test.ts packages/collections/tests/xaravel/collections.test.ts` -- expected: pass
- `bun run harness` and `bun run harness --xaravel` -- expected: no differences
- `bun run typecheck` and `bun run lint` -- expected: clean

## Fidelity Review

### Reviewer 1: reject at tree 80389fe17d45508a8bf75baf51217c539889ca48

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `0b4a934f9c0147b98ade62c535a496b909ab31a5`, on 2026-10-30T05:28:31.502Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed, and no Ported Test IDs are assigned. |
| F-2: No expected value is weakened | pass | The added tests compare complete probe outputs with assertSame; no existing expected value or exception expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or modifies no Expectations skip line. |
| F-5: Every `adapted` marker matches its clause | n/a | The diff adds no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this change. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-collections-21 covers its declared operations, but XT-runtime-129 does not exercise every comparison its consequence declares. |
| F-8: No stub, fake or partial implementation of another Component | pass | The production change implements runtime's stdClass property hook within the authorized runtime and collections scope; it introduces no substitute behavior for another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | The complete changed stdClass source has no async tags, IO, or async callbacks. Its new property hook correctly remains synchronous under AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file is changed. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-stdclass-compare.test.ts`: XT-runtime-129 declares that jsonDecode objects compare through both == and <=>, but jsonDecode appears only in the equality cases. Add a decoded-object spaceship case and its matching PHP probe output, or narrow the consequence to the behavior exercised.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"80389fe17d45508a8bf75baf51217c539889ca48","base":"0b4a934f9c0147b98ade62c535a496b909ab31a5","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T05:28:31.502Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed, and no Ported Test IDs are assigned.","findings":[]},{"id":"F-2","result":"pass","note":"The added tests compare complete probe outputs with assertSame; no existing expected value or exception expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or modifies no Expectations skip line.","findings":[]},{"id":"F-5","result":"n/a","note":"The diff adds no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this change.","findings":[]},{"id":"F-7","result":"fail","note":"XT-collections-21 covers its declared operations, but XT-runtime-129 does not exercise every comparison its consequence declares.","findings":[{"path":"packages/runtime/tests/xaravel/php-stdclass-compare.test.ts","detail":"XT-runtime-129 declares that jsonDecode objects compare through both == and <=>, but jsonDecode appears only in the equality cases. Add a decoded-object spaceship case and its matching PHP probe output, or narrow the consequence to the behavior exercised.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"The production change implements runtime's stdClass property hook within the authorized runtime and collections scope; it introduces no substitute behavior for another Component.","findings":[]},{"id":"F-9","result":"pass","note":"The complete changed stdClass source has no async tags, IO, or async callbacks. Its new property hook correctly remains synchronous under AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 80389fe17d45508a8bf75baf51217c539889ca48

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `0b4a934f9c0147b98ade62c535a496b909ab31a5`, on 2026-10-30T05:28:31.502Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and no Ported Test. The only changed tests are Xaravel Tests (XT-collections-21, XT-runtime-129), so no Upstream assertions need matching. |
| F-2: No expected value is weakened | n/a | No Ported Test or Upstream expected value is touched. The new Xaravel Tests use exact assertSame comparisons against PHP 8.5.11 probe records. No stale_tests file is listed. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed and no assertion is removed. The diff only adds two Xaravel Tests and their probe files. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or changes no Expectations line, so there is no skip reason to judge (evidence (i) also says none). |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an adapted:DIV-<n>.<k> marker, and no Expectations adapted field changes (evidence (a)). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no assigned Oracle fixture whose output is an error, and no changed fixture. The new tests use committed PHP probe records, not Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-129: its cases recompute each probe label against php-stdclass-compare.probe.php/.txt. eq covers == by properties, ignoring key order, nested objects, a jsonDecode object, and object against array. spaceship covers <=> one way and reversed, for differing values, differing keys and differing counts, and against ArrayObject. recursion covers the self-referencing pair throwing PHP's nesting Error while x == x is true. codecs covers jsonEncode, phpSerialize and toPhpArray (the (array) cast) against PHP's output. The extra assertions show the hook is non-enumerable and on the prototype. That covers every part of the consequence string, which cites no FR/AD token. XT-collections-21: contains, unique, max/min, sort/sortDesc over stdClass items and unique/contains over jsonDecode objects are each recomputed and compared with stdclass-items.probe.txt, which comes from running Upstream at the Pin. The label-set check guards against a skipped label. The body matches its consequence. |
| F-8: No stub, fake or partial implementation of another Component | pass | The action item lists runtime and collections. The source change is to packages/runtime/src/php/stdClass.ts, which is runtime's own class: a real props hook built from the object's own properties, with no hard-coded values. The collections change is test-only and runs the real runtime and Collection code. No stub, fake or partial implementation of another Component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows stdClass.ts has no @​asyncRoot tags. Its only new member, [PHP_PROPS](): PhpArray, is synchronous, does no IO and takes no callback. So no tag is needed and none is missing under AD-6.2/6.13, DIV-1 or ESC-6.4-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"80389fe17d45508a8bf75baf51217c539889ca48","base":"0b4a934f9c0147b98ade62c535a496b909ab31a5","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T05:28:31.502Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and no Ported Test. The only changed tests are Xaravel Tests (XT-collections-21, XT-runtime-129), so no Upstream assertions need matching.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test or Upstream expected value is touched. The new Xaravel Tests use exact assertSame comparisons against PHP 8.5.11 probe records. No stale_tests file is listed.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed and no assertion is removed. The diff only adds two Xaravel Tests and their probe files.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or changes no Expectations line, so there is no skip reason to judge (evidence (i) also says none).","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an adapted:DIV-<n>.<k> marker, and no Expectations adapted field changes (evidence (a)).","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no assigned Oracle fixture whose output is an error, and no changed fixture. The new tests use committed PHP probe records, not Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-129: its cases recompute each probe label against php-stdclass-compare.probe.php/.txt. eq covers == by properties, ignoring key order, nested objects, a jsonDecode object, and object against array. spaceship covers <=> one way and reversed, for differing values, differing keys and differing counts, and against ArrayObject. recursion covers the self-referencing pair throwing PHP's nesting Error while x == x is true. codecs covers jsonEncode, phpSerialize and toPhpArray (the (array) cast) against PHP's output. The extra assertions show the hook is non-enumerable and on the prototype. That covers every part of the consequence string, which cites no FR/AD token. XT-collections-21: contains, unique, max/min, sort/sortDesc over stdClass items and unique/contains over jsonDecode objects are each recomputed and compared with stdclass-items.probe.txt, which comes from running Upstream at the Pin. The label-set check guards against a skipped label. The body matches its consequence.","findings":[]},{"id":"F-8","result":"pass","note":"The action item lists runtime and collections. The source change is to packages/runtime/src/php/stdClass.ts, which is runtime's own class: a real props hook built from the object's own properties, with no hard-coded values. The collections change is test-only and runs the real runtime and Collection code. No stub, fake or partial implementation of another Component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows stdClass.ts has no @asyncRoot tags. Its only new member, [PHP_PROPS](): PhpArray, is synchronous, does no IO and takes no callback. So no tag is needed and none is missing under AD-6.2/6.13, DIV-1 or ESC-6.4-1.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 6fa466c1436072b318b46e138aa4c0552448c974

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `0b4a934f9c0147b98ade62c535a496b909ab31a5`, on 2026-10-30T05:32:50.779Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed, and no Ported Test IDs are assigned. |
| F-2: No expected value is weakened | pass | The added tests compare exact encoded values with the supplied PHP probe outputs; no existing expected value or exception expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or modifies no Expectations skip line. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The item relies on no Oracle error fixture; the local probe's captured exceptions are exact test values. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Both changed Xaravel Tests exercise their declared operations against matching PHP probes and verify all recorded labels. XT-runtime-129 now includes decoded-object spaceship comparisons, matching its consequence. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes stay within the authorized runtime and collections components. The stdClass hook exposes actual properties through the existing protocol, without implementing another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The complete changed stdClass source has no async tags; its new property hook performs synchronous property enumeration and PhpArray construction, requiring no tag under AD-6. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/php-stdclass-compare.test.ts`: XT-runtime-129 declares that jsonDecode objects compare through both == and <=>, but jsonDecode appears only in the equality cases. Add a decoded-object spaceship case and its matching PHP probe output, or narrow the consequence to the behavior exercised. **fixed**: The new json_decode.spaceship case checks four decoded-object comparisons, with matching PHP expressions and the recorded output [-1,1,0,1].

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"6fa466c1436072b318b46e138aa4c0552448c974","base":"0b4a934f9c0147b98ade62c535a496b909ab31a5","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T05:32:50.779Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed, and no Ported Test IDs are assigned.","findings":[]},{"id":"F-2","result":"pass","note":"The added tests compare exact encoded values with the supplied PHP probe outputs; no existing expected value or exception expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or modifies no Expectations skip line.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The item relies on no Oracle error fixture; the local probe's captured exceptions are exact test values.","findings":[]},{"id":"F-7","result":"pass","note":"Both changed Xaravel Tests exercise their declared operations against matching PHP probes and verify all recorded labels. XT-runtime-129 now includes decoded-object spaceship comparisons, matching its consequence.","findings":[]},{"id":"F-8","result":"pass","note":"Changes stay within the authorized runtime and collections components. The stdClass hook exposes actual properties through the existing protocol, without implementing another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The complete changed stdClass source has no async tags; its new property hook performs synchronous property enumeration and PhpArray construction, requiring no tag under AD-6.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/php-stdclass-compare.test.ts","detail":"XT-runtime-129 declares that jsonDecode objects compare through both == and <=>, but jsonDecode appears only in the equality cases. Add a decoded-object spaceship case and its matching PHP probe output, or narrow the consequence to the behavior exercised.","fixed":true,"note":"The new json_decode.spaceship case checks four decoded-object comparisons, with matching PHP expressions and the recorded output [-1,1,0,1]."}]}
```

### Reviewer 2: pass at tree 6fa466c1436072b318b46e138aa4c0552448c974

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `0b4a934f9c0147b98ade62c535a496b909ab31a5`, on 2026-10-30T05:32:50.779Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Expectations line is added or changed, so no Ported Test is assigned; only Xaravel Tests are touched. |
| F-2: No expected value is weakened | pass | No Ported Test or Upstream expected value is touched. The two Xaravel Tests are new and compare exactly (assertSame on jsonEncode) with the recorded PHP 8.5.11 probe output, which is not weakened. No stale_tests are listed. |
| F-3: No assertion is removed without a DIV clause | pass | No Ported Test changes and no assertion is removed. The collections.test.ts diff only adds an import and XT-collections-21; the runtime test file is new. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No added adapted marker and no Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no Oracle fixture is assigned or changed, and none is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-129 checks == and <=> on stdClass and on jsonDecode objects (eq, spaceship, json_decode.spaceship), phpUnserialize with == (unserialize), assertEquals on equal objects, the self-referencing and mutually referencing nesting error with x == x true (recursion, recursion.mutual), and that jsonEncode, phpSerialize and toPhpArray are unchanged (codecs), all against the probe output; it also checks the hook is non-enumerable. XT-collections-21 checks contains, unique, max, min, sort and sortDesc over stdClass items, unique, contains, max, min and sort over jsonDecode objects, and LazyCollection's unique and contains, all against PHP output. Both tests check that their case labels match the probe's labels exactly. No FR or AD tokens are cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | The source change is the props hook on runtime's own stdClass (packages/runtime/src/php/stdClass.ts); the other changes are tests and docs in runtime and collections, both listed components. No stub or fake of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g): stdClass.ts has no @​asyncRoot tags. The new [PHP_PROPS]() method is synchronous and returns a PhpArray, so it needs no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ is changed. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/php-stdclass-compare.test.ts`: XT-runtime-129 declares that jsonDecode objects compare through both == and <=>, but jsonDecode appears only in the equality cases. Add a decoded-object spaceship case and its matching PHP probe output, or narrow the consequence to the behavior exercised. **fixed**: php-stdclass-compare.test.ts now has a json_decode.spaceship case with four spaceship comparisons on jsonDecode objects. The probe .php and .txt carry the matching line [-1,1,0,1], so the body exercises jsonDecode objects with both == and <=>, as declared.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"6fa466c1436072b318b46e138aa4c0552448c974","base":"0b4a934f9c0147b98ade62c535a496b909ab31a5","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T05:32:50.779Z","items":[{"id":"F-1","result":"n/a","note":"No Expectations line is added or changed, so no Ported Test is assigned; only Xaravel Tests are touched.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test or Upstream expected value is touched. The two Xaravel Tests are new and compare exactly (assertSame on jsonEncode) with the recorded PHP 8.5.11 probe output, which is not weakened. No stale_tests are listed.","findings":[]},{"id":"F-3","result":"pass","note":"No Ported Test changes and no assertion is removed. The collections.test.ts diff only adds an import and XT-collections-21; the runtime test file is new.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No added adapted marker and no Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no Oracle fixture is assigned or changed, and none is an error.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-129 checks == and <=> on stdClass and on jsonDecode objects (eq, spaceship, json_decode.spaceship), phpUnserialize with == (unserialize), assertEquals on equal objects, the self-referencing and mutually referencing nesting error with x == x true (recursion, recursion.mutual), and that jsonEncode, phpSerialize and toPhpArray are unchanged (codecs), all against the probe output; it also checks the hook is non-enumerable. XT-collections-21 checks contains, unique, max, min, sort and sortDesc over stdClass items, unique, contains, max, min and sort over jsonDecode objects, and LazyCollection's unique and contains, all against PHP output. Both tests check that their case labels match the probe's labels exactly. No FR or AD tokens are cited.","findings":[]},{"id":"F-8","result":"pass","note":"The source change is the props hook on runtime's own stdClass (packages/runtime/src/php/stdClass.ts); the other changes are tests and docs in runtime and collections, both listed components. No stub or fake of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g): stdClass.ts has no @asyncRoot tags. The new [PHP_PROPS]() method is synchronous and returns a PhpArray, so it needs no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ is changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/php-stdclass-compare.test.ts","detail":"XT-runtime-129 declares that jsonDecode objects compare through both == and <=>, but jsonDecode appears only in the equality cases. Add a decoded-object spaceship case and its matching PHP probe output, or narrow the consequence to the behavior exercised.","fixed":true,"note":"php-stdclass-compare.test.ts now has a json_decode.spaceship case with four spaceship comparisons on jsonDecode objects. The probe .php and .txt carry the matching line [-1,1,0,1], so the body exercises jsonDecode objects with both == and <=>, as declared."}]}
```

## Auto Run Result

Status: done

**Summary.** `stdClass` now carries the props hook (`[Symbol.for('xaravel.php.props')]()`, a non-enumerable prototype method returning its own enumerable string properties as a `PhpArray`), so `==` and `<=>` compare two stdClass objects, `jsonDecode` and `phpUnserialize` objects included, by their properties as PHP 8.5.11 does. Collection and LazyCollection `contains`, `unique`, `max`, `min`, `sort` and `sortDesc` over such objects now give PHP's results. `jsonEncode`, `phpSerialize` and the `(array)` cast are unchanged.

**Files changed.**
- `packages/runtime/src/php/stdClass.ts` — the hook; header states the integer-like key order limit.
- `packages/runtime/docs/php-values.md` — Objects bullet names the hook and the order limit.
- `packages/runtime/tests/xaravel/php-stdclass-compare.{probe.php,probe.txt,test.ts}` — XT-runtime-129.
- `packages/collections/tests/xaravel/stdclass-items.{probe.php,probe.txt}`, `collections.test.ts` — XT-collections-21 (Upstream at the Pin).

**Review findings.** Pass 1: 20 findings (medium 3, low 10, false 7). Patched: F-7 `<=>` over `jsonDecode` objects; the order-limit wording; the assert, mutual-recursion and `phpUnserialize` rows; the `jsonDecode` max/min/sort rows; the LazyCollection rows. Deferred: one item (integer-like property order, two rows). Rejected, with reasons in the triage log: subclass inheritance (unreachable), the `?? null` test, the encode cost, `median` (needs a key and never compares objects), and the false rows. Pass 2 (Fidelity re-check): 0 findings, `current` at tree 6fa466c1436072b318b46e138aa4c0552448c974.

**Follow-up review recommendation:** false. Patched entries: high 0, medium 1 (F-7, a test row verified by a passing run), low 5.

**Verification.** `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`, exit 0. `bun run harness --xaravel`: 500 tests, 495 passed, 0 failed, 5 skipped. `bun run typecheck` and `bun run lint` are clean.

**Residual risks.** Integer-like property names compare in JS key order (deferred). The nesting error is the JS `Error` that `looseEquals` already threw before this change, not the runtime's PHP `Error` class, for arrays and objects alike.
