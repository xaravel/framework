---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportArrTest::testPush"
trigger: contract
proposed: >-
  Publish a public runtime PHP offset-assignment operation over a Ref, covering arrays, null/false conversion, scalar errors, strings and ArrayAccess, before releasing Arr.push and its set repair. Keep one shared owner for implicit PHP offset-write semantics; do not emulate them partly in collections.
evidence: >-
  offsetReference correctly exposes a userland offsetGet scalar, but no public runtime write operation supplies the following PHP assignment. With offsetExists false, offsetSet a no-op and offsetGet returning 12, pinned PHP 8.5.11 Arr.set(root, x.y, 1) throws Error Cannot use a scalar value as an array after its explicit initialization and omitted DIV-9.17 notice. The attempted collections method returns {y:1} because ownPhpArray silently makes an array. The same path is reachable from push when userland offsetGet changes between its selection and reference read. Hold push whole; retain five complete independent typed accessors and all prior tests.
---

# ESC-14.6-8: assignment through an arbitrary offset reference

Runtime prerequisites 13/14 solved class strings and reference acquisition. A reference may nevertheless contain a scalar when a userland offsetGet returns a value different from the earlier is_array read or ignores an explicit offsetSet initialization. The missing operation is the assignment through that reference, not reference acquisition. Public runtime exports have offsetReference but no arbitrary offset write/assignment seam. The binder, array_push and PhpArray.set are not substitutes: they have different contracts, exception messages or receivers.

## Reproduced pinned PHP 8.5.11 case

```php
require 'conformance/upstream/framework/src/Illuminate/Macroable/Traits/Macroable.php';
require 'conformance/upstream/framework/src/Illuminate/Collections/Arr.php';
class A implements ArrayAccess {
    function offsetExists($k): bool { return false; }
    function offsetGet($k): mixed { return 12; }
    function offsetSet($k, $v): void {}
    function offsetUnset($k): void {}
}
$a = new A;
try { var_dump(Illuminate\Support\Arr::set($a, 'x.y', 1)); }
catch (Throwable $e) { echo get_class($e), ': ', $e->getMessage(); }
```

Observed: `Error: Cannot use a scalar value as an array`, after the indirect-modification notice that DIV-9.17 intentionally omits. The attempted Bun integration instead returns `{ y: 1 }`. The error, scalar/string write rules, explicit initialization and partial-mutation timing are not waived by DIV-9.17. A string receiver additionally has numeric versus nonnumeric offset rules; a local integer-only guard is an incomplete shared-language implementation.

## Additional review repairs preserved for resumption

- In pending push, snapshot variadic by-value values before any userland key coercion. A coercion callback can mutate an original appended array.
- Bind the Ref's underlying value for validation, then select from the current caller Ref value after key coercion, rather than using the binder's earlier array copy. Reproduced PHP key `__toString` that appends 2 to caller x=[1], then push 3: PHP returns/stores x=[1,2,3]; attempted Bun returns/stores x=[1,3]. A direct two-line correction belongs in the eventual whole method, not an active partial release.
- Keep all completed typed accessor bodies/assertions, token/default/copy diagnostics and four Support holds. Only testPush remains not-ported-yet.
- Deeply editing an already-built 50,000-level root also exposes the pre-existing recursive runtime valueCopy limit. Creation in the iterative attempt passed; no full deep-copy capability is claimed. This is a separate pre-existing runtime limitation, not a new skip.

## Additional pending verification

Add direct tests for set value snapshot before Stringable key conversion; false offsetExists despite stored data; different values from its two offsetGet reads; builtin write-through composed with overridden offsetExists/offsetSet; throwing offsetSet with exact retained mutation and call order; and overridden Arr.array returning non-array, so array_push fails before set. These are pending, not passing coverage claims.

## Complete pending attempt and regression evidence

The following diff is documentary, not executable. It preserves the complete canonical testPush translation, whole attempted push/set methods and every added regression, including the positive iterative/copy/order/throwing/custom-return work. Five typed accessors are released separately. On resumption correct the reviewed assignment and argument-order defects rather than applying this patch blindly. Earlier canonical originals remain unchanged in ESC-14.6-1/3/7.

```diff
diff --git a/_bmad-output/implementation-artifacts/spec-14-6-arr-helpers.md b/_bmad-output/implementation-artifacts/spec-14-6-arr-helpers.md
index 54e5bf20..7f839e17 100644
--- a/_bmad-output/implementation-artifacts/spec-14-6-arr-helpers.md
+++ b/_bmad-output/implementation-artifacts/spec-14-6-arr-helpers.md
@@ -2,9 +2,9 @@
 title: 'Story 14.6: Arr helpers'
 type: feature
 created: '2026-10-27'
-status: blocked
-baseline_revision: 37c7d46812f1a8928aa9c180ec9cb9691343a0fa
-review_loop_iteration: 4
+status: in-review
+baseline_revision: 4809ad1a1f623da9ec4063053ff417d39358e698
+review_loop_iteration: 5
 followup_review_recommended: false
 context:
   - '{project-root}/AGENTS.md'
@@ -57,42 +57,37 @@ deferred:

 </intent-contract>

-## Current resume scope (2026-10-27)
+## Current resume scope (2026-10-28)

-The intent-contract above is preserved verbatim. Its historical “blocked until missing contracts land” condition is now satisfied: `epic-14-item-12-runtime-binder-arrayaccess-union` is done and the public binder handles `ArrayAccess|array`. The prior nine independent methods and their reviewed regressions already exist; preserve them. Resume only the six released Test IDs and their complete methods. Earlier review records and Auto Run Result below describe previous trees, not this run's status or current blockers.
+The intent-contract is preserved verbatim. Runtime prerequisites 12, 13 and 14 are done on main. Decisions ESC-14.6-5/6/7 and MAINT-2026-10-27-story-14-6-third release all six held methods. Complete the five accessors and push, including the expressly assigned Arr.set ArrayAccess repair. Historical repair instructions, blocked results and verdicts later in this file describe previous trees only; do not restore their holds. Preserve all nine previously completed helpers, prior assertions and four legitimate Support holds. No current dependency or intent gap was found.

-## Implementation contract stops (current run)
+## Code Map

-Review reproduced that all five accessors consume class-string tokens corrupted by shared valueCopy (ESC-14.6-6). Arr.array incorrectly accepts the copied string as an array, nested tokens are corrupted in valid arrays, and boolean/float/integer diagnose array instead of string. ArrayAccess offset reference writeback remains missing (ESC-14.6-7). Hold all six whole/absent; preserve all complete translations, attempted implementations and regression evidence in those Escalations. The published result is blocked: 77 pass, four blocked-by:support, six not-ported-yet. No runtime or grader workaround is supplied.
+- `stories/14.6.md`, `PORTING.md`, `_bmad-output/implementation-artifacts/epic-14-context.md` and architecture AD-6/9/22/26 are scope and porting evidence. The manifest owns 87 Test IDs and XT-collections-12. Read-only except authorized status bookkeeping outside implementation.
+- `conformance/upstream/framework/src/Illuminate/Collections/Arr.php:82/100/406/653/1031/1066/1198` is the read-only array/boolean/float/integer/set/push/string source. Accessors explicitly call Arr::get; push uses static::array and static::set, has a declared array return, and mutates before return validation. set has no declared array return: a root leaf returns the ArrayAccess handle, a nested path returns its innermost array, and null replaces the Ref value.
+- `conformance/upstream/framework/tests/Support/SupportArrTest.php` is canonical read-only test evidence. `conformance/escalations/ESC-14.6-6.md` preserves all five complete translated tests, tentative methods, boundary/default/copy/dispatch matrix and token regressions. `ESC-14.6-7.md` preserves complete testPush, dispatch/state regressions and runnable PHP 8.5.11 probe. These are historical records: reuse evidence without editing or assuming the old implementation attempt is correct.
+- `decisions/ESC-14.6-5.md`, `decisions/ESC-14.6-6.md`, `decisions/ESC-14.6-7.md`, `decisions/MAINT-2026-10-27-story-14-6-third.md` release the holds. `decisions/DIV-9.md:49` permits only omission of the indirect-modification notice (DIV-9.17); all writeback and returned-value outcomes still match PHP. Earlier ESC-14.6-2 ruling preserves DateTime-dependent blocked-by:support bodies.
+- `packages/runtime/src/php/userlandArguments.ts:86/101` exports bindPhpArguments/phpReturn through `@xaravel/runtime`; bind all actual supplied arguments before body lookup, preserve ArrayAccess handles, copy arrays, normalize weak typed defaults and declared returns. `valueCopy.ts` now classifies tokens as strings and preserves them nested; `is_array/is_bool/is_int/is_float/is_string`, gettype/sprintf, PhpFloat and array_push are public runtime seams. Read-only: add no local token/coercion/reference builtin.
+- `packages/runtime/src/php/offsetReference.ts:25`, public export `packages/runtime/src/php/index.ts:192`, and `packages/runtime/tests/xaravel/php-offset-reference.test.ts` are the new read-only reference contract. offsetReference returns a genuine Ref: builtin/inherited ArrayObject offsetGet writes through; userland/overriding offsetGet returns a detached local Ref with no offsetSet writeback. Missing builtin offsets become null slots. The helper treats null as empty-string offset; Arr.set must implement its own upstream null-root replacement before invoking it. Never special-case ArrayObject subclasses locally.
+- `packages/collections/src/Arr.ts:494/806` existing get/set and internal arrayRead/setKey/ownPhpArray/asCallerForm are reuse points. Current set rebuilds ArrayAccess roots as arrays and must change: keep the root handle, use offsetExists/offsetSet for explicit upstream accesses and offsetReference for traversal, including detached userland behavior; preserve ordinary list/map/PhpArray copy and next-free semantics and innermost return. Direct root-leaf assignment must use offsetSet and return the object handle, not a fabricated array.
+- `packages/collections/tests/ported/framework/tests/Support/SupportArrTest.test.ts`, `packages/collections/tests/xaravel/arr.test.ts`, `conformance/expectations/collections/framework/tests/Support/SupportArrTest.jsonl:33-37/58`, `packages/collections/docs/collections.md` are implementation targets. Preserve every previous assertion and fixture; six own held lines become observed passes, four Support holds stay. Compiler/lint callback probes and all other helpers are preservation-only.

-## Code Map
+## Current review repair requirements (2026-10-28)
+
+Re-derive the complete implementation from baseline using the saved positive attempt at `/Users/ea/.xaravel-orchestrator/tmp/14.6-before-review-rederive.patch`. KEEP every complete canonical body, released method, exact exception, runtime binder/return and offsetReference usage, all previous assertions and added typed/token/default/copy/dispatch/ArrayAccess regressions, docs and six truthful Expectations. Never restore the historical runtime holds.

-- `stories/14.6.md`, `PORTING.md`, `_bmad-output/implementation-artifacts/epic-14-context.md`, architecture Capability Map AD-6/9/22/26 -- scope, parity, Ref, callback and options rules; read before editing.
-- `conformance/upstream/framework/src/Illuminate/Collections/Arr.php:82/100/406/653/1066/1198` -- read-only exact array/boolean/float/integer/push/string contracts. Accessors spell `Arr::get`; preserve that explicit dispatch. Push spells `static::array` and `static::set`; use `this` and preserve its actual set return.
-- `conformance/upstream/framework/tests/Support/SupportArrTest.php` -- read-only complete five testItGets* bodies and testPush (line 86). Historical `conformance/escalations/ESC-14.6-1.md` and `ESC-14.6-3.md` preserve pending originals and scalar/default regressions; do not edit those historical records.
-- `decisions/ESC-14.6-5.md`, `decisions/MAINT-2026-10-27-story-14-6-binder.md`, sprint action `epic-14-item-12-runtime-binder-arrayaccess-union: done` -- released shared contract and required fresh Fidelity Review. Prior ESC-14.6-2 decision keeps DateTime-dependent bodies blocked-by:support.
-- `packages/runtime/src/php/userlandArguments.ts:86/101`, public exports `packages/runtime/src/php/index.ts:209/210` -- read-only `bindPhpArguments` binds every supplied argument before the body, validates defaults even when unused, keeps ArrayAccess handles, copies arrays; `phpReturn` normalizes scalar/array returns. Types: ArrayAccess|array input, string|int|null key, nullable typed default. Call binder with actual arguments (not synthesized defaults) and declaring FQCN.
-- `packages/runtime/src/php/arrBuiltins.ts:24` -- read-only `array_push(Ref, ...values)` keeps next-free indices and copies appended values. Public is_array/is_bool/is_int/is_float/is_string, gettype/sprintf, PhpFloat and phpReturn supply selected-value validation, PHP diagnostics and honest return representation; never reproduce PHP coercion locally.
-- `packages/collections/src/Arr.ts:494/806` -- existing get copies arrays and preserves handles; set mutates a Ref and returns the innermost modified array. Reuse Ref, valueCopy, public runtime helpers. Preserve all prior sorting/callback/traversal changes; no unrelated API re-derivation.
-- `packages/collections/tests/ported/framework/tests/Support/SupportArrTest.test.ts`, `packages/collections/tests/xaravel/arr.test.ts` -- append complete released bodies and focused XT-collections-12 regressions; preserve all existing assertions, fixtures, copy/arity/dispatch and compiler/lint probes.
-- `conformance/expectations/collections/framework/tests/Support/SupportArrTest.jsonl:33-37/58`, `packages/collections/docs/collections.md` -- six owned runtime-held lines become truthful passes; four existing Support holds stay. Docs currently claim six absent methods and must reflect released behavior. `stories/14.6.md` status is orchestrator bookkeeping, not permission to change ownership/test IDs.
-
-## Review repair requirements (current run, supersedes execution tasks for released methods)
-
-- Preserve the entire reviewed attempt at `$TMPDIR/14.6-resume-review.diff`. Restore only this run's package code, executable test additions and docs to HEAD; keep every prior assertion and implementation unchanged.
-- Expand ESC-14.6-6 to all five testItGets* IDs. Preserve all five complete canonical translations and whole tentative methods there, clearly pending. Record executable reproductions for token selected as array, nested token preservation and exact scalar errors; use runtime Stringable import, not a nonexistent contracts/support export. Keep original Upstream expectations and adapted regex markers.
-- Preserve the new XT boundary/default/dot/literal-key/coercion/observable lookup ordering regressions as pending evidence in ESC-14.6-6. Do not execute or claim pass for absent methods. A complete instrumented ArrayAccess fixture should establish invalid default rejection precedes offset lookup once runtime contract lands.
-- Expand ESC-14.6-7 pending evidence with runnable pinned PHP reproductions for builtin versus overriding ArrayObject nested writeback, root-leaf mutation then return TypeError, and null-key replacement. No local reference behavior emulation.
-- Restore all six own Expectations to not-ported-yet; route five accessors to ESC-14.6-6 and push to ESC-14.6-7. Preserve all other fields/lines and four Support holds.
-- Update package docs and Arr.ts header only to describe all six actual holds. No accessor/push implementation supplied. No other component or grader change. Story remains blocked; six-method completion ACs below are not claimed.
+- `Arr.set` must copy its by-value `value_` argument at entry, before null-key/key conversion or any userland offset callback. Userland offsetExists currently mutates a supplied `{child:[1]}` to `[1,2]` before leaf copy; the stored value must remain the entry snapshot while object handles remain shared.
+- Derive `Arr.set` traversal iteratively, including reconstruction of copied array parents and genuine offset references, preserving all explicit offsetExists/Get/Set effects and detached versus write-through behavior. A 50,000-segment initially empty path must succeed without a native recursive-call limit; no arbitrary depth cap or local runtime copy/reference replacement.
+- Correct set JSDoc to include the root-leaf ArrayAccess handle return.
+- Add XT12 integration coverage for exact offset-call ordering on existing array, missing and non-array userland children; partial explicit initialization retained when a later offset operation throws; detached non-array replacement; root-leaf push mutation and declared-return error on overriding and independent userland objects; overridden set that mutates and returns an invalid scalar. Preserve successful/failed final state, identity and exact relevant diagnostics. Add a deep-path regression that checks public set success by iterative observation, without invoking a recursively copying helper on the 50,000-level root.

 ## Tasks & Acceptance

 **Execution:**
 - `packages/collections/tests/ported/framework/tests/Support/SupportArrTest.test.ts` -- translate all five testItGets* and testPush bodies from pinned Upstream, retaining subjects, expected values, exception regex/object and assertion order. Apply only approved DIV adaptations (including push's by-reference Ref). Run the fast Story baseline after translation and before implementation.
 - `packages/collections/src/Arr.ts` -- implement whole array/boolean/float/integer/string methods in Upstream order. Bind all parameters through public bindPhpArguments before any get or selected-value check; then preserve Upstream predicates, exact InvalidArgumentException message and explicit Arr.get dispatch. Normalize returns with phpReturn: integer number | bigint, float number | PhpFloat, string primitive; array values remain isolated and object handles intact. Defaults remain null and nullable; selected null fails the selected-value check. No local PHP declaration/coercion substitute.
-- `packages/collections/src/Arr.ts` -- implement whole push with Ref first parameter and variadic values. Bind the underlying Ref.value input and key before executing the body, use this.array with [] default, runtime array_push on a Ref, and this.set on caller Ref; return the same result Upstream returns. Preserve supplied ArrayAccess handle semantics, nested/null keys, next-free append state and value separation. If a required shared contract is missing, raise precise Escalation instead of replacing it locally.
-- `packages/collections/tests/xaravel/arr.test.ts` -- extend existing XT12 for every pending ESC-14.6-3 scalar/default case: bigint integer, tagged float versus int rejection, class-string return normalization, invalid unused defaults for all five accessors, coercible defaults, invalid array/key/omission and selected-null error contracts. Exercise valid lists/maps/PhpArrays and ArrayObject, full union diagnostics and handles, array return isolation. Exercise push nested/null/no-values/multiple-values paths, Ref mutation and return, copy isolation, sparse next-free state, errors before mutation and subclass array/set forwarding. Preserve all earlier assertions and callback probes.
+- `packages/collections/src/Arr.ts` -- implement whole push with Ref first parameter and variadic values. Bind the underlying Ref.value input and key with actual argument count before executing the body, without replacing the caller Ref by the binder copy; use this.array with [] default, runtime array_push on a Ref, and this.set on caller Ref; validate the result with phpReturn(fn, "array", result) after mutation, preserving return TypeError timing. Repair set for ArrayAccess roots through offsetReference as mapped above; keep the root object handle and upstream explicit offsetSet effects. Return the same successful result Upstream returns. Preserve supplied ArrayAccess handle semantics, nested/null keys, next-free append state and value separation. If a required shared contract is missing, raise precise Escalation instead of replacing it locally.
+- `packages/collections/tests/xaravel/arr.test.ts` -- extend existing XT12 for every pending ESC-14.6-3 scalar/default case: bigint integer, tagged float versus int rejection, class-string return normalization, invalid unused defaults for all five accessors, coercible defaults, invalid array/key/omission and selected-null error contracts. Exercise valid lists/maps/PhpArrays and ArrayObject, full union diagnostics and handles, array return isolation. Exercise push nested/null/no-values/multiple-values paths, Ref mutation and return, copy isolation, sparse next-free state, errors before mutation and subclass array/set forwarding. Port the pinned ESC-7 integration outcomes into XT12: builtin and inherited ArrayObject nested write-through; overriding/userland offsetGet leaves the nested root unchanged while returning its detached modified array (DIV-9.17 suppresses only notice); a root leaf mutates via offsetSet then push throws exact declared-return TypeError; null-key array replacement succeeds while ArrayObject selection throws before mutation. Assert direct Arr.set root-leaf handle identity and nested return, missing/non-array child initialization, deeper paths and existing plain-array isolation. Preserve all ESC-6 pending token cases including nested identity, string normalization and string diagnostics for the other four accessors. Preserve all earlier assertions and callback probes.
 - `conformance/expectations/collections/framework/tests/Support/SupportArrTest.jsonl` -- change only these six held IDs to observed pass/adaptation metadata, remove their obsolete runtime hold metadata; preserve all four valid Support holds and all other lines.
 - `packages/collections/docs/collections.md` -- document released typed accessors, upfront PHP parameter binding, honest scalar representations and Ref push with a short example; remove obsolete six-held claim and retain actual Support dependencies. Remove stale absent-method comment in Arr.ts.
 - `_bmad-output/implementation-artifacts/spec-14-6-arr-helpers.md` -- append this run's results/reviews after verification and fresh Fidelity --loop-cli codex; orchestrator synchronizes Story/manifest status only after completion checks. Keep historical reviews unchanged.
@@ -100,7 +95,7 @@ Review reproduced that all five accessors consume class-string tokens corrupted
 **Acceptance Criteria:**
 - Given the 87 assigned Test IDs, when the full Story harness runs after the six complete translations, then 83 pass and the four existing Support-dependent bodies retain their valid blocked-by:support expectations, with zero differences and no not-ported-yet IDs.
 - Given public Arr typed accessor calls, when inputs/keys/defaults are supplied, then every argument binds before lookup, valid representations return PHP-compatible typed values and invalid parameters or selected values produce the corresponding PHP/Upstream exception, even for unused defaults.
-- Given public Arr.push on a Ref, when values are appended to nested or null-key targets, then the caller mutation, return value, dispatch, ordering, next-free index and value-copy behavior match Upstream without mutating an independent source array.
+- Given public Arr.push and Arr.set on Refs containing PHP arrays or ArrayAccess objects, when nested, root-leaf or null-key writes run, then caller handle identity, write-through versus detached userland behavior, mutation-before-return-error timing, successful return, dispatch, next-free state and copy isolation match the pinned PHP outcomes; only the DIV-9.17 notice is omitted.
 - Given preserved prior helpers and Support holds, when Collections/Xaravel/full verification and fresh Fidelity run, then earlier behavior remains verified, no assertion or expectation is weakened, Fidelity is current and story:check 14.6 passes before completion.

 ## Verification
@@ -115,6 +110,13 @@ Review reproduced that all five accessors consume class-string tokens corrupted

 ## Spec Change Log

+- 2026-10-28 review repair: verified call-stack failure at 50,000 dot segments and callback mutation of the by-value set argument before copy. Amended active requirements to iterative reference traversal and entry copy, with call-order/throwing/custom-return regressions. KEEP all six canonical tests, all methods, binder/offset seams, copy/dispatch/typed matrices, four Support holds and immutable prior verdicts. Attempt saved under state tmp; code reverted by reverse hunks before re-derivation. Review loop 5.
+
+
+- 2026-10-28: Re-planned against completed runtime items 13/14 and approved ESC-6/7; removed active hold/repair directives, mapped public offsetReference and required whole Arr.set ArrayAccess repair plus PHP integration regressions. Prevents rebuilding object roots or losing mutation-before-return-error behavior. KEEP verbatim intent, historical reviews/results, every prior assertion/helper and four Support holds. Ready-for-development gate passed; no unresolved contract found.
+
+- 2026-10-28: Resume transition to draft after runtime prerequisite items 13 and 14 landed on main; re-plan this existing spec against the resolved ESC-14.6-6/7 contracts.
+
 2026-10-27 — Review repair: shared token copy corrupts all five accessor paths, not only string. Expand whole-method contract hold to five accessors, preserve all translations/attempt/regressions and add executable offset reference evidence. KEEP all baseline package behavior and assertions, unchanged intent/history and Support holds. Avoid releasing partial methods that misclassify PHP strings.

 2026-10-27 — Resume transition blocked → draft after runtime action epic-14-item-12-runtime-binder-arrayaccess-union landed and ESC-14.6-5's ruling released the six held IDs. Replaced active map/tasks/acceptance/verification with the remaining six whole methods/tests and runtime binding/return seams; prior nine-method increment is preservation-only. KEEP the verbatim intent-contract, every historical review/verdict/result and existing assertion. Historical hold instructions below are superseded only for the released runtime contracts. Planning gate re-read the workflow and this spec: actionable ordered files, public Given/When/Then AC, exact parity evidence, no unresolved dependency or intent gap; ready-for-dev.
@@ -128,6 +130,26 @@ Review reproduced that all five accessors consume class-string tokens corrupted

 ## Review Triage Log

+### 2026-10-28 — Resume review pass 1
+- verdicts: 13 findings — high 0, medium 2, low 6, false 5, maybe-false 0
+- findings:
+  - `[medium]` `[bad_spec]` Blind recursive set depth — reproduced native RangeError at 50,000 segments on an empty root; Upstream is iterative. Require iterative reference traversal, no depth cap; preserve all good paths.
+  - `[medium]` `[bad_spec]` Blind by-value set argument snapshot — reproduced offsetExists mutating supplied child from [1] to [1,2] before stored copy. Require entry valueCopy before callbacks; preserve shared object handles.
+  - `[low]` `[patch]` Blind set return JSDoc — root-leaf ArrayAccess returns handle; direct wording correction is included in re-derivation requirements.
+  - `[low]` `[patch]` Blind offset ordering coverage — tests assert state but no precise set offset trace; direct existing/missing/non-array trace assertions included in re-derivation.
+  - `[low]` `[patch]` Blind throwing-offset retained initialization — no throwing callback branch in new tests; add direct exception and explicit mutation checks during re-derivation.
+  - `[low]` `[patch]` Blind detached non-array child — new custom object cases omit existing scalar replacement; add direct branch assertion during re-derivation.
+  - `[low]` `[patch]` Blind custom root-leaf push return error — builtin case exists but custom offsetSet result/diagnostics lack checks; add direct variants during re-derivation.
+  - `[low]` `[patch]` Blind overridden set invalid return — forwarding case returns parent's normal value; add direct mutation-then-invalid-return test during re-derivation.
+  - `[false]` `[reject]` Intent released-hold premise outside diff — read approved ESC-5/6/7, Maintainer third-run ruling and completed runtime items 12/13/14 on baseline main; conditional resume premise is established in repository evidence.
+  - `[false]` `[reject]` Intent only six of 87 direct tests changed — 81 existing bodies remain; full Story harness checks all 87 with zero differences, plus all 12 Collections XT.
+  - `[false]` `[reject]` Intent extra parity through XT rather than canonical bodies — direct six bodies retain complete original assertions; additional consequences belong in XT12 under AD-15, with original subjects unchanged.
+  - `[false]` `[reject]` Intent set repair beyond absent members — approved MAINT-2026-10-27-story-14-6-third explicitly assigns Arr.set repair through the new seam; no scope mismatch.
+  - `[false]` `[reject]` Intent no execution evidence in diff — verification is run by workflow, not encoded as expected values: 87 Story and 1,029 Collections comparisons, 12 XT, typecheck/lint/rule checks and 21,817 full comparisons passed; spec final result records evidence at Finalize.
+
+Edge-case and verification-gap layers returned no findings. Fidelity both passed at f5f8e8d26c04027d23cd9d7a02c2c4e02ecb7f71; implementation changes invalidate those passes, so fresh review is required. Patches are lower than the bad-spec loopback and will be re-derived with preserved positive work.
+
+
 ### 2026-10-27 — Current resume review pass 2
 - verdicts: 15 findings — high 0, medium 0, low 5, false 10, maybe-false 0
 - findings:
@@ -785,6 +807,106 @@ None.
 {"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"5a9195c971bdd3daa60ed067903f801562ffc241","base":"37c7d46812f1a8928aa9c180ec9cb9691343a0fa","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-28T00:52:34.785Z","items":[{"id":"F-1","result":"n/a","note":"No executable Ported Test is added or changed; the translations in the new Escalations are explicitly pending documentation.","findings":[]},{"id":"F-2","result":"pass","note":"The documented pending translations preserve Upstream's expected values, exception classes and message patterns. No executable assertion or expected value changes.","findings":[]},{"id":"F-3","result":"pass","note":"No executable assertion is removed. The six pending translations retain their corresponding Upstream assertions and exception expectations.","findings":[]},{"id":"F-4","result":"pass","note":"The six edited skip lines retain not-ported-yet for wholly absent methods. Their documented blocker is the earlier runtime Component, which cannot validly use blocked-by; no higher-precedence applicable reason is evidenced.","findings":[]},{"id":"F-5","result":"pass","note":"The pending translations' DIV-9.2 markers cover Ref boxing and array representation; DIV-10.1 covers equivalent RegExp conversion. Changed Expectations lines introduce no adaptation.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this change.","findings":[]},{"id":"F-7","result":"n/a","note":"Evidence (e) confirms that no Xaravel Test, helper, fixture or setup is touched.","findings":[]},{"id":"F-8","result":"pass","note":"The only framework source edit updates a collections comment. Runtime fixes remain proposals in Escalations; no other Component implementation or local workaround is added.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the complete touched Arr.ts and its declarations with AD-6 and DIV-1: its methods remain synchronous, callbacks are synchronous, and no async-root tag or IO terminal requires tagging.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no conformance/oracle-requests file.","findings":[]}],"prior":[]}
 ```

+### Reviewer 1: pass at tree f5f8e8d26c04027d23cd9d7a02c2c4e02ecb7f71
+
+Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `4809ad1a1f623da9ec4063053ff417d39358e698`, on 2026-10-28T18:55:26.879Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.
+
+| Item | Result | Note |
+| --- | --- | --- |
+| F-1: Assertions match Upstream | pass | Compared the five added typed-accessor tests and testPush with their supplied Upstream bodies. Assertions preserve subjects, expected values and order. |
+| F-2: No expected value is weakened | pass | The added tests retain Upstream comparison strictness, exception classes and message constraints. Converted regular expressions preserve the original patterns. |
+| F-3: No assertion is removed without a DIV clause | pass | Each added typed-accessor test retains both value assertions and both exception expectations; testPush retains four value assertions and its exception-object expectation. |
+| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff removes six skips and introduces no new skip lines. |
+| F-5: Every `adapted` marker matches its clause | pass | DIV-10.1 permits the equivalent RegExp conversions; DIV-9.2 permits testPush's Ref arguments and value reads without changing expected values. |
+| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no relied-upon Oracle error fixtures. |
+| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-collections-12's complete body and helpers with its consequence: it checks key normalization and order, null handling, copy isolation, async-callback rejection and lazy traversal cleanup. |
+| F-8: No stub, fake or partial implementation of another Component | pass | Changes implement Collections behavior in Collections paths. ArrayAccess reference handling uses the runtime seam explicitly approved by ESC-14.6-7 rather than implementing another Component locally. |
+| F-9: Every `@asyncRoot` tag is true | pass | Compared Arr.ts's complete source and declaration inventory with AD-6 and DIV-1. Its synchronous helpers require no async-root tags, and none are present. |
+| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |
+
+Findings:
+
+None.
+
+```json
+{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"f5f8e8d26c04027d23cd9d7a02c2c4e02ecb7f71","base":"4809ad1a1f623da9ec4063053ff417d39358e698","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-28T18:55:26.879Z","items":[{"id":"F-1","result":"pass","note":"Compared the five added typed-accessor tests and testPush with their supplied Upstream bodies. Assertions preserve subjects, expected values and order.","findings":[]},{"id":"F-2","result":"pass","note":"The added tests retain Upstream comparison strictness, exception classes and message constraints. Converted regular expressions preserve the original patterns.","findings":[]},{"id":"F-3","result":"pass","note":"Each added typed-accessor test retains both value assertions and both exception expectations; testPush retains four value assertions and its exception-object expectation.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff removes six skips and introduces no new skip lines.","findings":[]},{"id":"F-5","result":"pass","note":"DIV-10.1 permits the equivalent RegExp conversions; DIV-9.2 permits testPush's Ref arguments and value reads without changing expected values.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no relied-upon Oracle error fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-collections-12's complete body and helpers with its consequence: it checks key normalization and order, null handling, copy isolation, async-callback rejection and lazy traversal cleanup.","findings":[]},{"id":"F-8","result":"pass","note":"Changes implement Collections behavior in Collections paths. ArrayAccess reference handling uses the runtime seam explicitly approved by ESC-14.6-7 rather than implementing another Component locally.","findings":[]},{"id":"F-9","result":"pass","note":"Compared Arr.ts's complete source and declaration inventory with AD-6 and DIV-1. Its synchronous helpers require no async-root tags, and none are present.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[]}
+```
+
+### Reviewer 2: pass at tree f5f8e8d26c04027d23cd9d7a02c2c4e02ecb7f71
+
+Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `4809ad1a1f623da9ec4063053ff417d39358e698`, on 2026-10-28T18:55:26.879Z.
+
+| Item | Result | Note |
+| --- | --- | --- |
+| F-1: Assertions match Upstream | pass | Compared the five added typed-accessor tests and testPush with their Inventory source excerpts. Assertions preserve the subjects, expected values, exception expectations and order. |
+| F-2: No expected value is weakened | pass | The added tests retain Upstream's exact comparisons and exception classes. Converted message patterns preserve the original patterns under DIV-10.1; push retains its exact exception message. |
+| F-3: No assertion is removed without a DIV clause | pass | All assertions and exception expectations in the six added Ported Tests have counterparts; none is dropped. |
+| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff removes six skip statuses and introduces no skip reason. |
+| F-5: Every `adapted` marker matches its clause | pass | DIV-10.1 permits the equivalent RegExp conversions. DIV-9.2 covers push's Ref arguments and value readback without changing expected values. |
+| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no relied-on Oracle error fixture. |
+| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-collections-12's complete body with its consequence: it checks key normalization and order, dot access, null semantics, copy isolation, callback rejection, and lazy traversal and cleanup. |
+| F-8: No stub, fake or partial implementation of another Component | pass | Implementation changes stay in collections and use shared runtime operations. ArrayAccess reference behavior delegates to the seam expressly authorized by ESC-14.6-7; no other Component implementation is added. |
+| F-9: Every `@asyncRoot` tag is true | pass | Compared Arr.ts's complete source and declaration inventory with AD-6 and DIV-1. Its methods remain synchronous, perform no IO and accept no permitted async callbacks; no async-root tag is needed. |
+| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |
+
+Findings:
+
+None.
+
+```json
+{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"f5f8e8d26c04027d23cd9d7a02c2c4e02ecb7f71","base":"4809ad1a1f623da9ec4063053ff417d39358e698","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-28T18:55:26.879Z","items":[{"id":"F-1","result":"pass","note":"Compared the five added typed-accessor tests and testPush with their Inventory source excerpts. Assertions preserve the subjects, expected values, exception expectations and order.","findings":[]},{"id":"F-2","result":"pass","note":"The added tests retain Upstream's exact comparisons and exception classes. Converted message patterns preserve the original patterns under DIV-10.1; push retains its exact exception message.","findings":[]},{"id":"F-3","result":"pass","note":"All assertions and exception expectations in the six added Ported Tests have counterparts; none is dropped.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff removes six skip statuses and introduces no skip reason.","findings":[]},{"id":"F-5","result":"pass","note":"DIV-10.1 permits the equivalent RegExp conversions. DIV-9.2 covers push's Ref arguments and value readback without changing expected values.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-collections-12's complete body with its consequence: it checks key normalization and order, dot access, null semantics, copy isolation, callback rejection, and lazy traversal and cleanup.","findings":[]},{"id":"F-8","result":"pass","note":"Implementation changes stay in collections and use shared runtime operations. ArrayAccess reference behavior delegates to the seam expressly authorized by ESC-14.6-7; no other Component implementation is added.","findings":[]},{"id":"F-9","result":"pass","note":"Compared Arr.ts's complete source and declaration inventory with AD-6 and DIV-1. Its methods remain synchronous, perform no IO and accept no permitted async callbacks; no async-root tag is needed.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
+```
+
+### Reviewer 1: pass at tree 5a3501b19f152e1eb7616965cf942cf2f3834c16
+
+Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `4809ad1a1f623da9ec4063053ff417d39358e698`, on 2026-10-28T19:03:18.611Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.
+
+| Item | Result | Note |
+| --- | --- | --- |
+| F-1: Assertions match Upstream | pass | Compared the five added typed-accessor tests and testPush with their Upstream sources. Assertions preserve subjects, expected values and order. |
+| F-2: No expected value is weakened | pass | The added tests retain Upstream comparison strength, exception classes and messages. Converted regular expressions preserve the original patterns. |
+| F-3: No assertion is removed without a DIV clause | pass | All assertions and exception expectations in the six added Ported Tests have counterparts; none is dropped. |
+| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff removes six skips and introduces no skip reason. |
+| F-5: Every `adapted` marker matches its clause | pass | DIV-10.1 permits the equivalent RegExp conversions. DIV-9.2 permits Ref arguments and value reads in testPush; expected array contents remain unchanged. |
+| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied on by this change. |
+| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-12 checks its declared key order, key normalization, null semantics, copy isolation, callback rejection and lazy traversal consequences through explicit assertions and compiler/lint probes. |
+| F-8: No stub, fake or partial implementation of another Component | pass | Changed implementation code stays in collections and uses the runtime offsetReference seam approved by ESC-14.6-7. No implementation of another Component is added. |
+| F-9: Every `@asyncRoot` tag is true | pass | Compared Arr.ts declarations and bodies with AD-6 and DIV-1. Its methods remain synchronous, perform no IO and accept no async-enabled callbacks requiring tags; no @​asyncRoot tags are retained. |
+| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |
+
+Findings:
+
+None.
+
+```json
+{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"5a3501b19f152e1eb7616965cf942cf2f3834c16","base":"4809ad1a1f623da9ec4063053ff417d39358e698","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-28T19:03:18.611Z","items":[{"id":"F-1","result":"pass","note":"Compared the five added typed-accessor tests and testPush with their Upstream sources. Assertions preserve subjects, expected values and order.","findings":[]},{"id":"F-2","result":"pass","note":"The added tests retain Upstream comparison strength, exception classes and messages. Converted regular expressions preserve the original patterns.","findings":[]},{"id":"F-3","result":"pass","note":"All assertions and exception expectations in the six added Ported Tests have counterparts; none is dropped.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff removes six skips and introduces no skip reason.","findings":[]},{"id":"F-5","result":"pass","note":"DIV-10.1 permits the equivalent RegExp conversions. DIV-9.2 permits Ref arguments and value reads in testPush; expected array contents remain unchanged.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied on by this change.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-12 checks its declared key order, key normalization, null semantics, copy isolation, callback rejection and lazy traversal consequences through explicit assertions and compiler/lint probes.","findings":[]},{"id":"F-8","result":"pass","note":"Changed implementation code stays in collections and uses the runtime offsetReference seam approved by ESC-14.6-7. No implementation of another Component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Compared Arr.ts declarations and bodies with AD-6 and DIV-1. Its methods remain synchronous, perform no IO and accept no async-enabled callbacks requiring tags; no @asyncRoot tags are retained.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[]}
+```
+
+### Reviewer 2: pass at tree 5a3501b19f152e1eb7616965cf942cf2f3834c16
+
+Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `4809ad1a1f623da9ec4063053ff417d39358e698`, on 2026-10-28T19:03:18.611Z.
+
+| Item | Result | Note |
+| --- | --- | --- |
+| F-1: Assertions match Upstream | pass | Compared the five added typed-accessor tests and testPush with their supplied Upstream sources. Assertion subjects, expected values, exception expectations and order match. |
+| F-2: No expected value is weakened | pass | The added tests retain Upstream's exact comparisons, exception classes and messages. Converted regular expressions preserve the original patterns; Ref adaptations preserve expected values. |
+| F-3: No assertion is removed without a DIV clause | pass | All assertions and exception expectations in the six added Ported Tests have counterparts. No assertion is dropped. |
+| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff removes six skips and adds no Expectations line set to skip. |
+| F-5: Every `adapted` marker matches its clause | pass | Compared the added markers and Expectations adaptations with DIV-9.2 and DIV-10.1. Ref boxing and equivalent RegExp conversion stay within those clauses. |
+| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this change. |
+| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-collections-12's consequence with its complete body and helpers. It checks key normalization and order, null semantics, value-copy isolation, async-callback rejection and lazy traversal cleanup. |
+| F-8: No stub, fake or partial implementation of another Component | pass | The implementation changes remain in collections and use the shared runtime argument-binding, type-checking and offset-reference APIs. The ArrayAccess integration follows ESC-14.6-7 without implementing another Component locally. |
+| F-9: Every `@asyncRoot` tag is true | pass | Compared Arr.ts's complete source and declaration inventory with AD-6 and DIV-1. It has no asyncRoot tags, performs synchronous operations and accepts only synchronous callbacks; no new method requires a tag. |
+| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |
+
+Findings:
+
+None.
+
+```json
+{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"5a3501b19f152e1eb7616965cf942cf2f3834c16","base":"4809ad1a1f623da9ec4063053ff417d39358e698","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-28T19:03:18.611Z","items":[{"id":"F-1","result":"pass","note":"Compared the five added typed-accessor tests and testPush with their supplied Upstream sources. Assertion subjects, expected values, exception expectations and order match.","findings":[]},{"id":"F-2","result":"pass","note":"The added tests retain Upstream's exact comparisons, exception classes and messages. Converted regular expressions preserve the original patterns; Ref adaptations preserve expected values.","findings":[]},{"id":"F-3","result":"pass","note":"All assertions and exception expectations in the six added Ported Tests have counterparts. No assertion is dropped.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff removes six skips and adds no Expectations line set to skip.","findings":[]},{"id":"F-5","result":"pass","note":"Compared the added markers and Expectations adaptations with DIV-9.2 and DIV-10.1. Ref boxing and equivalent RegExp conversion stay within those clauses.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this change.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-collections-12's consequence with its complete body and helpers. It checks key normalization and order, null semantics, value-copy isolation, async-callback rejection and lazy traversal cleanup.","findings":[]},{"id":"F-8","result":"pass","note":"The implementation changes remain in collections and use the shared runtime argument-binding, type-checking and offset-reference APIs. The ArrayAccess integration follows ESC-14.6-7 without implementing another Component locally.","findings":[]},{"id":"F-9","result":"pass","note":"Compared Arr.ts's complete source and declaration inventory with AD-6 and DIV-1. It has no asyncRoot tags, performs synchronous operations and accepts only synchronous callbacks; no new method requires a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
+```
+
 ## Historical review repair requirements (prior run; released runtime holds superseded above)

 - `packages/collections/src/Arr.ts` -- use this for every newly added upstream static:: delegation, preserving hardcoded Arr only where Upstream spells Arr. Extend sort/desc public types to PHP callable tuples/objects while rejecting async function/invokable callbacks. Fix every/some bare-generator traversal through public runtime primitives, without materializing input or importing runtime internals; prove short-circuiting with throw-on-overread sources.
diff --git a/conformance/expectations/collections/framework/tests/Support/SupportArrTest.jsonl b/conformance/expectations/collections/framework/tests/Support/SupportArrTest.jsonl
index de532986..52c540af 100644
--- a/conformance/expectations/collections/framework/tests/Support/SupportArrTest.jsonl
+++ b/conformance/expectations/collections/framework/tests/Support/SupportArrTest.jsonl
@@ -30,11 +30,11 @@
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testHasAnyMethod","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testIsAssoc","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testIsList","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
-{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testItGetsABoolean","variant":"none","status":"skip","reason":"not-ported-yet","adapted":null,"escalation":"ESC-14.6-6"}
-{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAFloat","variant":"none","status":"skip","reason":"not-ported-yet","adapted":null,"escalation":"ESC-14.6-6"}
-{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAString","variant":"none","status":"skip","reason":"not-ported-yet","adapted":null,"escalation":"ESC-14.6-6"}
-{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnArray","variant":"none","status":"skip","reason":"not-ported-yet","adapted":null,"escalation":"ESC-14.6-6"}
-{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnInteger","variant":"none","status":"skip","reason":"not-ported-yet","adapted":null,"escalation":"ESC-14.6-6"}
+{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testItGetsABoolean","variant":"none","status":"pass","reason":null,"adapted":"DIV-10.1","escalation":null}
+{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAFloat","variant":"none","status":"pass","reason":null,"adapted":"DIV-10.1","escalation":null}
+{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAString","variant":"none","status":"pass","reason":null,"adapted":"DIV-10.1","escalation":null}
+{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnArray","variant":"none","status":"pass","reason":null,"adapted":"DIV-10.1","escalation":null}
+{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnInteger","variant":"none","status":"pass","reason":null,"adapted":"DIV-10.1","escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testJoin","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testKeyBy","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testLast","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
@@ -55,7 +55,7 @@
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testPrepend","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testPrependKeysWith","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testPull","variant":"none","status":"pass","reason":null,"adapted":"DIV-9.2","escalation":null}
-{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testPush","variant":"none","status":"skip","reason":"not-ported-yet","adapted":null,"escalation":"ESC-14.6-7"}
+{"id":"Illuminate\\Tests\\Support\\SupportArrTest::testPush","variant":"none","status":"pass","reason":null,"adapted":"DIV-9.2","escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testQuery","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testRandom","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
 {"id":"Illuminate\\Tests\\Support\\SupportArrTest::testRandomNotIncrementingKeys","variant":"none","status":"pass","reason":null,"adapted":null,"escalation":null}
diff --git a/packages/collections/docs/collections.md b/packages/collections/docs/collections.md
index 5ac05bf6..b7ab5eb2 100644
--- a/packages/collections/docs/collections.md
+++ b/packages/collections/docs/collections.md
@@ -157,7 +157,7 @@ Collection.proxy("adults"); // adds a proxied method, as Laravel's proxy()
 ## Divergences

 - **DIV-1:** collections are sync; a sync member's callback must be sync, and a callback that may be async goes to the async companion (`filterAsync`, `rejectAsync`, `partitionAsync`, `everyAsync`, `containsAsync`, `firstAsync`), which awaits it (DIV-1 Callbacks, DIV-1.2).
-- **DIV-9.2:** PHP's by-reference arrays (`Arr.forget`, `Arr.pull`, `Arr.set`) are a `Ref`.
+- **DIV-9.2:** PHP's by-reference arrays (`Arr.forget`, `Arr.pull`, `Arr.set`, `Arr.push`) are a `Ref`.
 - **DIV-9.15:** spreading a keyed PHP array into `push(...)` or `unshift(...)` spreads its values, `...array_values(a)`.
 - **DIV-12.6:** index reads are `get(k)` (or `offsetGet(k)`), not `c[k]`.
 - **DIV-12.16:** higher-order messages are `__get(name)` and `__call(method, args)` calls, not magic properties.
@@ -228,4 +228,20 @@ Story 14.6 now also supports `isAssoc`, `isList`, recursive sorting with PHP fla

 Use `Arr.sortRecursive(input, { options: SORT_NATURAL, descending: true })` to sort recursively in descending natural order. Its positional equivalent is `Arr.sortRecursive(input, SORT_NATURAL, true)`; `descending` also accepts `SortDirection.Ascending` or `SortDirection.Descending`.

-Six Test IDs remain `not-ported-yet`: all five typed accessors are whole and absent under `ESC-14.6-6` because shared runtime value-copy corrupts class-string tokens, including tokens nested in valid arrays and scalar diagnostics. `push` is whole and absent under `ESC-14.6-7` pending public ArrayAccess offset reference writeback. Complete translations, tentative methods and pending regressions remain in those Escalations; no unchecked accessor or local reference workaround is supplied. The complete accessible/arrayable DateTime tests now use `blocked-by:support` under the Maintainer ruling in `decisions/ESC-14.6-2.md`. Carbon-key plucking and `toCssStyles` retain their complete test bodies and throw `BlockedByComponentError("support")` at their Carbon / `Str.finish` dependency seams, for Support (Epic 19) to clear.
+The typed accessors `array`, `boolean`, `float`, `integer` and `string` accept PHP arrays and `ArrayAccess` objects with dot keys. Every supplied argument binds through PHP's weak parameter rules before lookup, including an unused nullable default. Selected values must already have the requested PHP type: selected null raises the upstream `InvalidArgumentException`, while invalid parameters raise PHP's `TypeError`. Integer results are `number | bigint`; float results are `number | PhpFloat` (integral floats carry the runtime marker); class-string tokens returned by `string` normalize to primitive strings. Array results are isolated copies and object values keep their handles.
+
+`push` takes the caller's array in a `Ref`, appends one or more values (or none), and returns the innermost array that `set` returns. A null key replaces the entire array after appending:
+
+```ts
+import { Arr } from "@xaravel/collections";
+import { Ref } from "@xaravel/runtime";
+
+const items = new Ref<unknown>({ office: { furniture: ["Desk"] } });
+Arr.push(items, "office.furniture", "Chair", "Lamp"); // { furniture: ["Desk", "Chair", "Lamp"] }
+Arr.array(items.value, "office.furniture"); // ["Desk", "Chair", "Lamp"]
+Arr.integer({}, "missing", "3"); // 3, PHP weak default coercion
+```
+
+For `ArrayAccess` roots, `set` keeps the object's handle. Builtin or inherited `ArrayObject.offsetGet` writes through nested references; overriding or userland `offsetGet` returns a detached array, so nested writes stay local (DIV-9.17 omits PHP's indirect-modification notice only). A root-leaf `push` mutates via `offsetSet` and then throws its declared array-return `TypeError`, because `set` returns the root object. A null-key `push` on an `ArrayAccess` object fails the array selection before mutation.
+
+The complete accessible/arrayable DateTime tests now use `blocked-by:support` under the Maintainer ruling in `decisions/ESC-14.6-2.md`. Carbon-key plucking and `toCssStyles` retain their complete test bodies and throw `BlockedByComponentError("support")` at their Carbon / `Str.finish` dependency seams, for Support (Epic 19) to clear.
diff --git a/packages/collections/src/Arr.ts b/packages/collections/src/Arr.ts
index 5ca7e059..2996c0d0 100644
--- a/packages/collections/src/Arr.ts
+++ b/packages/collections/src/Arr.ts
@@ -1,5 +1,5 @@
 // Laravel's Illuminate\Support\Arr (v13.37.0). Story 14.6 completes the independent array helpers.
-// Typed accessors and push remain whole and absent pending ESC-14.6-6 (all five accessors) and ESC-14.6-7 (push). CSS styles reach Support through a throwing Str.finish dependency seam.
+// CSS styles reach Support through a throwing Str.finish dependency seam.
 // PHP array arguments accept lists, plain maps and PhpArrays, with value-copy isolation (AD-9).
 // By-reference parameters use Ref (DIV-9.2), while ArrayAccess objects retain PHP's handle semantics.
 // Callbacks are synchronous (AD-6); PHP callable forms resolve through the shared runtime.
@@ -24,6 +24,7 @@ import {
   array_all,
   array_any,
   arrayAppend,
+  array_push,
   callUnpacked,
   array_pop,
   array_slice,
@@ -55,6 +56,14 @@ import {
   explode,
   InvalidArgumentException,
   is_array,
+  is_bool,
+  is_float,
+  is_int,
+  gettype,
+  sprintf,
+  phpReturn,
+  offsetReference,
+  type PhpFloat,
   is_null,
   is_object,
   is_string,
@@ -173,6 +182,36 @@ export class Arr extends mixin(null, Macroable) {
     return result.value;
   }

+  /** Get an array item using dot notation, binding PHP parameters before lookup. */
+  static array(_array: unknown, _key: unknown, _defaultValue: unknown = null): unknown {
+    const fn = "Illuminate\\Support\\Arr::array";
+    const [array, key, defaultValue] = bindPhpArguments(fn, [
+      { name: "array", type: "ArrayAccess|array" },
+      { name: "key", type: "string|int|null" },
+      { name: "default", type: "?array", default: null },
+    ], Array.from(arguments));
+    const selected = Arr.get(array, key, defaultValue);
+    if (!is_array(selected)) {
+      throw new InvalidArgumentException(sprintf("Array value for key [%s] must be an array, %s found.", key, gettype(selected)));
+    }
+    return phpReturn(fn, "array", selected);
+  }
+
+  /** Get a boolean item using dot notation, binding PHP parameters before lookup. */
+  static boolean(_array: unknown, _key: unknown, _defaultValue: unknown = null): boolean {
+    const fn = "Illuminate\\Support\\Arr::boolean";
+    const [array, key, defaultValue] = bindPhpArguments(fn, [
+      { name: "array", type: "ArrayAccess|array" },
+      { name: "key", type: "string|int|null" },
+      { name: "default", type: "?bool", default: null },
+    ], Array.from(arguments));
+    const selected = Arr.get(array, key, defaultValue);
+    if (!is_bool(selected)) {
+      throw new InvalidArgumentException(sprintf("Array value for key [%s] must be a boolean, %s found.", key, gettype(selected)));
+    }
+    return phpReturn(fn, "bool", selected) as boolean;
+  }
+
   /** Collapse an array of arrays (or of `Enumerable`s) into a single array. */
   static collapse(array: unknown): unknown {
     const results: unknown[] = [];
@@ -394,6 +433,21 @@ export class Arr extends mixin(null, Macroable) {
     return valueCopy(result);
   }

+  /** Get a float item using dot notation, binding PHP parameters before lookup. */
+  static float(_array: unknown, _key: unknown, _defaultValue: unknown = null): number | PhpFloat {
+    const fn = "Illuminate\\Support\\Arr::float";
+    const [array, key, defaultValue] = bindPhpArguments(fn, [
+      { name: "array", type: "ArrayAccess|array" },
+      { name: "key", type: "string|int|null" },
+      { name: "default", type: "?float", default: null },
+    ], Array.from(arguments));
+    const selected = Arr.get(array, key, defaultValue);
+    if (!is_float(selected)) {
+      throw new InvalidArgumentException(sprintf("Array value for key [%s] must be a float, %s found.", key, gettype(selected)));
+    }
+    return phpReturn(fn, "float", selected) as number | PhpFloat;
+  }
+
   /**
    * Remove one or many array items from a given array using "dot" notation. `array` is PHP's `&$array` (DIV-9.2): the
    * new array is written to `array.value`, and an `ArrayAccess` object on the path loses the key in place.
@@ -563,6 +617,21 @@ export class Arr extends mixin(null, Macroable) {
     return false;
   }

+  /** Get an integer item using dot notation, binding PHP parameters before lookup. */
+  static integer(_array: unknown, _key: unknown, _defaultValue: unknown = null): number | bigint {
+    const fn = "Illuminate\\Support\\Arr::integer";
+    const [array, key, defaultValue] = bindPhpArguments(fn, [
+      { name: "array", type: "ArrayAccess|array" },
+      { name: "key", type: "string|int|null" },
+      { name: "default", type: "?int", default: null },
+    ], Array.from(arguments));
+    const selected = Arr.get(array, key, defaultValue);
+    if (!is_int(selected)) {
+      throw new InvalidArgumentException(sprintf("Array value for key [%s] must be an integer, %s found.", key, gettype(selected)));
+    }
+    return phpReturn(fn, "int", selected) as number | bigint;
+  }
+
   /** Determine whether an array has keys other than sequential integers starting at zero. */
   static isAssoc(array: unknown): boolean {
     [array] = bindPhpArguments("Illuminate\\Support\\Arr::isAssoc", [{ name: "array", type: "array" }], [...arguments]);
@@ -797,55 +866,71 @@ export class Arr extends mixin(null, Macroable) {
   }

   /**
-   * Set an array item to a given value using "dot" notation, creating the arrays on the way down; a `null` key replaces
-   * the entire array. `array` is PHP's `&$array` (DIV-9.2): the new array is written to `array.value`. Returns the
-   * innermost array the value was set in.
+   * Set an array item using "dot" notation, creating arrays on the way down; a null key replaces the root.
+   * `array` is PHP's `&$array` (DIV-9.2). Returns the innermost modified array, or the same ArrayAccess handle
+   * for a root-leaf assignment.
    */
   static set(array: Ref<unknown>, key: unknown, value_: unknown): unknown {
+    // PHP binds the by-value argument before key conversion or any userland offset callback.
+    const supplied = valueCopy(value_);
     if (is_null(key)) {
-      array.value = valueCopy(value_);
-
-      return valueCopy(array.value);
+      array.value = supplied;
+      return valueCopy(supplied);
     }

-    const keys = new Ref<unknown>(explode(".", key));
-
-    // PHP's `$array = &$array[$key]`: each array passed on the way down, with the key it is left by. PHP writes into a
-    // `null` as into an empty array.
-    const path: [unknown, unknown][] = [];
-    let current: unknown = valueCopy(array.value ?? []);
-
-    for (const [i, segment] of arrayEntries(keys.value as object)) {
-      if (Number(count(keys.value)) === 1) {
-        break;
-      }
-
-      keys.value = unsetKey(keys.value, i);
-
-      // If the key doesn't exist at this depth, we will just create an empty array
-      // to hold the next value, allowing us to create the arrays to hold final
-      // values at the correct depth. Then we'll keep digging into the array.
-      let child = arrayRead(current as object, segment);
-      if (child === null || !is_array(child)) {
-        child = [];
+    const keys = explode(".", key);
+    const root = new Ref<unknown>(valueCopy(array.value ?? []));
+    let reference = root;
+    const parents: { reference: Ref<unknown>; current: unknown; segment: string }[] = [];
+
+    // Each frame owns its array values. Only runtime offset references decide whether object writes reach storage.
+    for (let depth = 0; depth < keys.length - 1; depth++) {
+      const current = reference.value;
+      const segment = keys[depth]!;
+      if (current instanceof ArrayAccess) {
+        if (!current.offsetExists(segment) || !is_array(current.offsetGet(segment))) {
+          current.offsetSet(segment, []);
+        }
+        reference = offsetReference(current, segment);
+      } else {
+        const child = arrayRead((current ?? []) as object, segment);
+        parents.push({ reference, current, segment });
+        reference = new Ref(is_array(child) ? child : []);
       }
-
-      path.push([current, segment]);
-      current = child;
     }

-    let updated = asCallerForm(current, ownPhpArray(current).set(array_shift(keys) as never, valueCopy(value_)));
-    const innermost = updated;
-
-    // Each rebuilt level keeps the form its keys give, and a `PhpArray` stays one.
-    for (let index = path.length - 1; index >= 0; index--) {
-      const [parent, part] = path[index]!;
-      updated = asCallerForm(parent, setKey(parent, part, updated));
+    const current = reference.value;
+    const leaf = keys[keys.length - 1]!;
+    let result: unknown;
+    if (current instanceof ArrayAccess) {
+      current.offsetSet(leaf, supplied);
+      result = current;
+    } else {
+      reference.value = asCallerForm(current, ownPhpArray(current ?? []).set(leaf, supplied));
+      result = valueCopy(reference.value);
     }
+    for (let index = parents.length - 1; index >= 0; index--) {
+      const parent = parents[index]!;
+      parent.reference.value = asCallerForm(parent.current, ownPhpArray(parent.current ?? []).set(parent.segment, reference.value));
+      reference = parent.reference;
+    }
+    array.value = root.value;
+    return result;
+  }

-    array.value = updated;
-
-    return valueCopy(innermost);
+  /** Append values to a dot-keyed array, writing through the caller's Ref (DIV-9.2). */
+  static push(array: Ref<unknown>, _key: unknown, ...values: unknown[]): unknown {
+    const fn = "Illuminate\\Support\\Arr::push";
+    const args = Array.from(arguments);
+    if (args.length > 0) args[0] = array.value;
+    const [boundArray, key] = bindPhpArguments(fn, [
+      { name: "array", type: "ArrayAccess|array" },
+      { name: "key", type: "string|int|null" },
+    ], args);
+    const boundValues = valueCopy(values);
+    const target = new Ref(this.array(boundArray, key, []));
+    array_push(target, ...boundValues);
+    return phpReturn(fn, "array", this.set(array, key, target.value));
   }

   /** Shuffle an array into a reindexed list, copying nested array values. */
@@ -901,6 +986,21 @@ export class Arr extends mixin(null, Macroable) {
     return this.sortRecursive(array, options, SortDirection.Descending);
   }

+  /** Get a string item using dot notation, binding PHP parameters before lookup. */
+  static string(_array: unknown, _key: unknown, _defaultValue: unknown = null): string {
+    const fn = "Illuminate\\Support\\Arr::string";
+    const [array, key, defaultValue] = bindPhpArguments(fn, [
+      { name: "array", type: "ArrayAccess|array" },
+      { name: "key", type: "string|int|null" },
+      { name: "default", type: "?string", default: null },
+    ], Array.from(arguments));
+    const selected = Arr.get(array, key, defaultValue);
+    if (!is_string(selected)) {
+      throw new InvalidArgumentException(sprintf("Array value for key [%s] must be a string, %s found.", key, gettype(selected)));
+    }
+    return phpReturn(fn, "string", selected) as string;
+  }
+
   /** Compile conditional CSS classes. */
   static toCssClasses(array: unknown): string {
     const classes: unknown[] = [];
diff --git a/packages/collections/tests/ported/framework/tests/Support/SupportArrTest.test.ts b/packages/collections/tests/ported/framework/tests/Support/SupportArrTest.test.ts
index 273be2d0..c71bc104 100644
--- a/packages/collections/tests/ported/framework/tests/Support/SupportArrTest.test.ts
+++ b/packages/collections/tests/ported/framework/tests/Support/SupportArrTest.test.ts
@@ -26,6 +26,67 @@ class SupportArrTest extends TestCase {
 }
 // Carbon belongs to Support (Epic 19); retain the complete upstream test body below.
 class Carbon { constructor(_value: string) { throw new BlockedByComponentError("support"); } }
+portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAString', { case: SupportArrTest }, async function () {
+  const test_array = { string: 'foo bar', integer: 1234 };
+  this.assertSame('foo bar', Arr.string(test_array, 'string'));
+  this.assertSame('default', Arr.string(test_array, 'missing_key', 'default'));
+  this.expectException(InvalidArgumentException);
+  this.expectExceptionMessageMatches(/^Array value for key \[integer\] must be a string, (.*) found./); // adapted:DIV-10.1
+  Arr.string(test_array, 'integer');
+});
+
+portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnInteger', { case: SupportArrTest }, async function () {
+  const test_array = { string: 'foo bar', integer: 1234 };
+  this.assertSame(1234, Arr.integer(test_array, 'integer'));
+  this.assertSame(999, Arr.integer(test_array, 'missing_key', 999));
+  this.expectException(InvalidArgumentException);
+  this.expectExceptionMessageMatches(/^Array value for key \[string\] must be an integer, (.*) found./); // adapted:DIV-10.1
+  Arr.integer(test_array, 'string');
+});
+
+portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAFloat', { case: SupportArrTest }, async function () {
+  const test_array = { string: 'foo bar', float: 12.34 };
+  this.assertSame(12.34, Arr.float(test_array, 'float'));
+  this.assertSame(56.78, Arr.float(test_array, 'missing_key', 56.78));
+  this.expectException(InvalidArgumentException);
+  this.expectExceptionMessageMatches(/^Array value for key \[string\] must be a float, (.*) found./); // adapted:DIV-10.1
+  Arr.float(test_array, 'string');
+});
+
+portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsABoolean', { case: SupportArrTest }, async function () {
+  const test_array = { string: 'foo bar', boolean: true };
+  this.assertTrue(Arr.boolean(test_array, 'boolean'));
+  this.assertTrue(Arr.boolean(test_array, 'missing_key', true));
+  this.expectException(InvalidArgumentException);
+  this.expectExceptionMessageMatches(/^Array value for key \[string\] must be a boolean, (.*) found./); // adapted:DIV-10.1
+  Arr.boolean(test_array, 'string');
+});
+
+portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnArray', { case: SupportArrTest }, async function () {
+  const test_array = { string: 'foo bar', array: ['foo', 'bar'] };
+  this.assertSame(['foo', 'bar'], Arr.array(test_array, 'array'));
+  this.assertSame([1, 'two'], Arr.array(test_array, 'missing_key', [1, 'two']));
+  this.expectException(InvalidArgumentException);
+  this.expectExceptionMessageMatches(/^Array value for key \[string\] must be an array, (.*) found./); // adapted:DIV-10.1
+  Arr.array(test_array, 'string');
+});
+
+portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testPush', { case: SupportArrTest }, async function () {
+  let array = new Ref<unknown>([]); // adapted:DIV-9.2
+  Arr.push(array, 'office.furniture', 'Desk'); // adapted:DIV-9.2
+  this.assertEquals(['Desk'], Arr.get(array.value, 'office.furniture')); // adapted:DIV-9.2
+  Arr.push(array, 'office.furniture', 'Chair', 'Lamp'); // adapted:DIV-9.2
+  this.assertEquals(['Desk', 'Chair', 'Lamp'], Arr.get(array.value, 'office.furniture')); // adapted:DIV-9.2
+  array = new Ref<unknown>([]); // adapted:DIV-9.2
+  Arr.push(array, null, 'Chris', 'Nuno'); // adapted:DIV-9.2
+  this.assertEquals(['Chris', 'Nuno'], array.value); // adapted:DIV-9.2
+  Arr.push(array, null, 'Taylor'); // adapted:DIV-9.2
+  this.assertEquals(['Chris', 'Nuno', 'Taylor'], array.value); // adapted:DIV-9.2
+  this.expectExceptionObject(new InvalidArgumentException('Array value for key [foo.bar] must be an array, boolean found.'));
+  array = new Ref<unknown>({ foo: { bar: false } }); // adapted:DIV-9.2
+  Arr.push(array, 'foo.bar', 'baz'); // adapted:DIV-9.2
+});
+
 portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testAdd', { case: SupportArrTest }, async function () {
   let array: any = Arr.add({ name: 'Desk' }, 'price', 100);
   this.assertEquals({ name: 'Desk', price: 100 }, array);
diff --git a/packages/collections/tests/xaravel/arr.test.ts b/packages/collections/tests/xaravel/arr.test.ts
index 8ba37b64..3c61790f 100644
--- a/packages/collections/tests/xaravel/arr.test.ts
+++ b/packages/collections/tests/xaravel/arr.test.ts
@@ -5,9 +5,362 @@ import { join, resolve } from "node:path";
 import { Assert, xaravelTest } from "@xaravel/assert";
 import { Arr, Collection, LazyCollection } from "@xaravel/collections";
 import { Arrayable, Jsonable } from "@xaravel/contracts/support";
-import { ArgumentCountError, ArrayIterator, JsonSerializable, stdClass, arrayAppend, arrayEntries, Error as PhpError, keyed, PhpArray, Ref, valueCopy, SortDirection, SORT_NATURAL, TypeError as PhpTypeError, UnhandledMatchError } from "@xaravel/runtime";
+import { ArgumentCountError, ArrayAccess, ArrayObject, ArrayIterator, InvalidArgumentException, JsonSerializable, Stringable, float, stdClass, arrayAppend, arrayEntries, Error as PhpError, keyed, PhpArray, Ref, valueCopy, registerClass, SortDirection, SORT_NATURAL, TypeError as PhpTypeError, UnhandledMatchError } from "@xaravel/runtime";

 xaravelTest("XT-collections-12", "FR-23: Arr dot get/set/has/forget preserve PHP keys, insertion order, null semantics and array value copies; synchronous callable forms reject async callbacks and lazy traversal stops and cleans up correctly", async () => {
+  const fails = (invoke: () => unknown, klass: new (...args: any[]) => unknown, message: string | null = null): void => {
+    let error: unknown = null;
+    try { invoke(); } catch (caught) { error = caught; }
+    Assert.assertInstanceOf(klass, error);
+    if (message !== null) Assert.assertSame(message, (error as PhpTypeError).getMessage());
+  };
+  const typedCases = [
+    ["array", [1], [2], "array", "an array"],
+    ["boolean", true, "0", "bool", "a boolean"],
+    ["float", float(2), "3", "float", "a float"],
+    ["integer", 2, "3", "int", "an integer"],
+    ["string", "ok", 3, "string", "a string"],
+  ] as const;
+  for (const [method, selected, default_, type, label] of typedCases) {
+    const call = Arr[method] as (...args: unknown[]) => unknown;
+    const fn = "Illuminate\\Support\\Arr::" + method;
+    for (const input of [{ key: selected }, new PhpArray([["key", selected]]), new ArrayObject({ key: selected })]) {
+      Assert.assertSame(selected, call(input, "key"));
+    }
+    Assert.assertSame(selected, call([selected], 0));
+    fails(() => call({ key: selected }, "key", new stdClass()), PhpTypeError,
+      fn + "(): Argument #3 ($default) must be of type ?" + type + ", stdClass given");
+    fails(() => call({ key: null }, "key"), InvalidArgumentException,
+      "Array value for key [key] must be " + label + ", NULL found.");
+    fails(() => call({}, "key"), InvalidArgumentException);
+    fails(() => call(), ArgumentCountError,
+      "Too few arguments to function " + fn + "(), 0 passed and at least 2 expected");
+    fails(() => call(null, "key"), PhpTypeError,
+      fn + "(): Argument #1 ($array) must be of type ArrayAccess|array, null given");
+    fails(() => call({}, []), PhpTypeError,
+      fn + "(): Argument #2 ($key) must be of type string|int|null, array given");
+    const expected = method === "boolean" ? false : method === "float" ? float(3) : method === "integer" ? 3 : method === "string" ? "3" : [2];
+    Assert.assertSame(expected, call({}, "missing", default_));
+  }
+  Assert.assertSame(9223372036854775807n, Arr.integer({ key: 9223372036854775807n }, "key"));
+  Assert.assertSame(float(2), Arr.float({ key: float(2) }, "key"));
+  fails(() => Arr.float({ key: 2 }, "key"), InvalidArgumentException);
+  fails(() => Arr.integer({ key: float(2) }, "key"), InvalidArgumentException);
+  const typedHandle = new stdClass();
+  const typedSource = { key: { child: [1], typedHandle } };
+  const typedCopy = Arr.array(typedSource, "key") as typeof typedSource.key;
+  typedCopy.child.push(2);
+  Assert.assertSame([1], typedSource.key.child);
+  Assert.assertSame(typedHandle, typedCopy.typedHandle);
+  class ExplicitTypedGetArr extends Arr {
+    static override get(): unknown { throw new Error("typed accessors must use Arr.get"); }
+  }
+  Assert.assertSame([1], ExplicitTypedGetArr.array({ key: [1] }, "key"));
+  Assert.assertTrue(ExplicitTypedGetArr.boolean({ key: true }, "key"));
+  Assert.assertSame(float(2), ExplicitTypedGetArr.float({ key: float(2) }, "key"));
+  Assert.assertSame(2, ExplicitTypedGetArr.integer({ key: 2 }, "key"));
+  Assert.assertSame([1], Arr.array([1], null));
+  const accessorArrayObject = new ArrayObject({ key: [1] });
+  const accessorArrayCopy = Arr.array(accessorArrayObject, "key") as number[];
+  accessorArrayCopy.push(2);
+  Assert.assertSame([1], accessorArrayObject.offsetGet("key"));
+
+
+Assert.assertSame("Stringable", Arr.string({ key: Stringable }, "key"));
+Assert.assertSame("Stringable", Arr.string({}, "key", Stringable));
+fails(() => Arr.array({ key: Stringable }, "key"), InvalidArgumentException,
+  "Array value for key [key] must be an array, string found.");
+Assert.assertSame(Stringable, (Arr.array({ key: { token: Stringable } }, "key") as { token: unknown }).token);
+for (const [method, label] of [["boolean", "a boolean"], ["float", "a float"], ["integer", "an integer"]] as const) {
+  fails(() => Arr[method]({ key: Stringable }, "key"), InvalidArgumentException,
+    "Array value for key [key] must be " + label + ", string found.");
+}
+const allTypedCases = typedCases;
+for (const [method, selected, default_, type] of allTypedCases) {
+  const call = Arr[method] as (...args: unknown[]) => unknown;
+    const fn = "Illuminate\\Support\\Arr::" + method;
+    for (const [invalid, actual] of [[null, "null"], [1, "int"], ["bad", "string"], [true, "true"], [new stdClass(), "stdClass"], [Stringable, "string"]] as const) {
+      fails(() => call(invalid, "key"), PhpTypeError,
+        fn + "(): Argument #1 ($array) must be of type ArrayAccess|array, " + actual + " given");
+    }
+    fails(() => call({}), ArgumentCountError,
+      "Too few arguments to function " + fn + "(), 1 passed and at least 2 expected");
+    Assert.assertSame(selected, call({ key: selected }, "key", null));
+  Assert.assertSame(selected, call({ outer: { inner: selected } }, "outer.inner"));
+  Assert.assertSame(selected, call({ "outer.inner": selected, outer: { inner: null } }, "outer.inner"));
+  Assert.assertSame(selected, call({ key: selected }, "key", default_));
+  class LookupProbe extends ArrayObject {
+    reads: unknown[] = [];
+    override offsetExists(key: Parameters<ArrayObject['offsetExists']>[0]): boolean { this.reads.push(["exists", key]); return super.offsetExists(key); }
+    override offsetGet(key: Parameters<ArrayObject['offsetGet']>[0]): unknown { this.reads.push(["get", key]); return super.offsetGet(key); }
+  }
+  const probe = new LookupProbe({ key: selected });
+  fails(() => call(probe, "key", new stdClass()), PhpTypeError,
+    "Illuminate\\Support\\Arr::" + method + "(): Argument #3 ($default) must be of type ?" + type + ", stdClass given");
+  Assert.assertSame([], probe.reads);
+  Assert.assertSame(selected, call(probe, "key"));
+  Assert.assertSame([["exists", "key"], ["get", "key"]], probe.reads);
+}
+Assert.assertSame("3", Arr.string({}, "missing", 3));
+  Assert.assertTrue((Arr.array({ key: { token: Stringable } }, "key") as { token: unknown }).token === Stringable);
+  Assert.assertTrue((Arr.array({}, "missing", { token: Stringable }) as { token: unknown }).token === Stringable);
+  Assert.assertSame("ok", Arr.string({ "1": "ok" }, true));
+  Assert.assertSame("ok", Arr.string({ "1": "ok" }, float(1)));
+fails(() => Arr.string({ key: null }, "key"), InvalidArgumentException,
+  "Array value for key [key] must be a string, NULL found.");
+
+  class ExplicitGetArr extends Arr {
+    static override get(): unknown { throw new Error("typed accessors must use Arr.get"); }
+  }
+  Assert.assertSame("ok", ExplicitGetArr.string({ key: "ok" }, "key"));
+  const pushSource = { office: { furniture: ["Desk"] } };
+  const pushRef = new Ref<unknown>(pushSource);
+  Assert.assertSame({ furniture: ["Desk", "Chair", "Lamp"] }, Arr.push(pushRef, "office.furniture", "Chair", "Lamp"));
+  Assert.assertSame(["Desk"], pushSource.office.furniture);
+  Assert.assertSame({ furniture: ["Desk", "Chair", "Lamp"] }, Arr.push(pushRef, "office.furniture"));
+  const appended = { child: [1], typedHandle };
+  Arr.push(pushRef, "office.furniture", appended);
+  appended.child.push(2);
+  Assert.assertSame([1], Arr.get(pushRef.value, "office.furniture.3.child"));
+  Assert.assertSame(typedHandle, Arr.get(pushRef.value, "office.furniture.3.typedHandle"));
+  const pushSparse = new PhpArray<number, unknown>([[5, "old"]]);
+  pushSparse.delete(5);
+  const sparseRef = new Ref<unknown>(pushSparse);
+  Assert.assertSame(new PhpArray([[6, "new"]]), Arr.push(sparseRef, null, "new"));
+  Assert.assertSame(new PhpArray([[6, "new"]]), sparseRef.value);
+  const beforeFailure = valueCopy(pushRef.value);
+  fails(() => Arr.push(pushRef, []), PhpTypeError);
+  Assert.assertSame(beforeFailure, pushRef.value);
+  const invalidRef = new Ref<unknown>(null);
+  fails(() => Arr.push(invalidRef, "key"), PhpTypeError);
+  Assert.assertNull(invalidRef.value);
+  class ForwardPushArr extends Arr {
+    static calls: unknown[] = [];
+    static override array(array: unknown, key: unknown, defaultValue: unknown = null): unknown {
+      this.calls.push(["array", key, defaultValue]);
+      return super.array(array, key, defaultValue);
+    }
+    static override set(array: Ref<unknown>, key: unknown, value: unknown): unknown {
+      this.calls.push(["set", key, value]);
+      return super.set(array, key, value);
+    }
+  }
+  const forwarded = new Ref<unknown>([]);
+  Assert.assertSame({ child: [1] }, ForwardPushArr.push(forwarded, "parent.child", 1));
+  Assert.assertSame([["array", "parent.child", []], ["set", "parent.child", [1]]], ForwardPushArr.calls);
+  const variadicSource = { child: [1] };
+  class CopyBeforeDispatchArr extends Arr {
+    static override array(array: unknown, key: unknown, defaultValue: unknown = null): unknown {
+      variadicSource.child.push(2);
+      return super.array(array, key, defaultValue);
+    }
+  }
+  const variadicRef = new Ref<unknown>([]);
+  Assert.assertSame({ values: [{ child: [1] }] }, CopyBeforeDispatchArr.push(variadicRef, "values", variadicSource));
+  Assert.assertSame([1, 2], variadicSource.child);
+  const pushReturned = Arr.push(pushRef, "office.furniture") as { furniture: unknown[] };
+  pushReturned.furniture.push("return-only");
+  Assert.assertSame(4, (Arr.array(pushRef.value, "office.furniture") as unknown[]).length);
+  Arr.push(pushRef, "office.furniture", "caller-only");
+  Assert.assertSame("return-only", pushReturned.furniture.at(-1));
+  for (const args of [[], [new Ref([])]]) {
+    fails(() => (Arr.push as (...args: unknown[]) => unknown)(...args), ArgumentCountError,
+      "Too few arguments to function Illuminate\\Support\\Arr::push(), " + args.length + " passed and exactly 2 expected");
+  }
+  class InvalidPushLookup extends ArrayObject {
+    reads: unknown[] = [];
+    override offsetExists(key: Parameters<ArrayObject["offsetExists"]>[0]): boolean {
+      this.reads.push(key);
+      return super.offsetExists(key);
+    }
+  }
+  const invalidPushLookup = new InvalidPushLookup({ key: [] });
+  const invalidPushLookupRef = new Ref<unknown>(invalidPushLookup);
+  fails(() => Arr.push(invalidPushLookupRef, []), PhpTypeError,
+    "Illuminate\\Support\\Arr::push(): Argument #2 ($key) must be of type string|int|null, array given");
+  Assert.assertSame([], invalidPushLookup.reads);
+  Assert.assertTrue(invalidPushLookupRef.value === invalidPushLookup);
+  Assert.assertSame({ key: [] }, invalidPushLookup.getArrayCopy());
+
+
+  // PHP 8.5.11 integration outcomes from ESC-14.6-7; DIV-9.17 omits only the notice.
+  class InheritedOffsetGet extends ArrayObject {}
+  class UserlandOffsetGet extends ArrayObject {
+    override offsetGet(key: Parameters<ArrayObject["offsetGet"]>[0]): unknown { return super.offsetGet(key); }
+  }
+  class UserlandAccess implements ArrayAccess {
+    get [ArrayAccess.brand](): true { return true; }
+    stored: unknown = { x: [] };
+    writes: [unknown, unknown][] = [];
+    offsetExists(key: unknown): boolean { return Arr.has(this.stored, key); }
+    offsetGet(key: unknown): unknown { return Arr.get(this.stored, key); }
+    offsetSet(key: unknown, value: unknown): void {
+      this.writes.push([key, valueCopy(value)]);
+      const ref = new Ref(this.stored);
+      Arr.set(ref, key, value);
+      this.stored = ref.value;
+    }
+    offsetUnset(key: unknown): void {
+      const ref = new Ref(this.stored);
+      Arr.forget(ref, key);
+      this.stored = ref.value;
+    }
+  }
+  for (const object of [new ArrayObject({ x: [] }), new InheritedOffsetGet({ x: [] })]) {
+    const ref = new Ref<unknown>(object);
+    Assert.assertSame({ y: [1] }, Arr.push(ref, "x.y", 1));
+    Assert.assertTrue(ref.value === object);
+    Assert.assertSame({ x: { y: [1] } }, object.getArrayCopy());
+    Assert.assertSame({ leaf: [2] }, Arr.set(ref, "x.deeper.leaf", [2]));
+    Assert.assertTrue(ref.value === object);
+    Assert.assertSame({ x: { y: [1], deeper: { leaf: [2] } } }, object.getArrayCopy());
+    const supplied = { child: [1], typedHandle };
+    Assert.assertTrue(Arr.set(ref, "leaf", supplied) === object);
+    supplied.child.push(2);
+    Assert.assertSame([1], Arr.get(object, "leaf.child"));
+    Assert.assertTrue(Arr.get(object, "leaf.typedHandle") === typedHandle);
+    for (const child of [null, false, 12, "scalar", new stdClass()]) {
+      object.offsetSet("replace", child);
+      Assert.assertSame({ value: [3] }, Arr.set(ref, "replace.value", [3]));
+      Assert.assertSame({ value: [3] }, object.offsetGet("replace"));
+    }
+    Assert.assertSame({ value: [4] }, Arr.set(ref, "missing.value", [4]));
+    Assert.assertSame({ value: [4] }, object.offsetGet("missing"));
+  }
+  for (const object of [new UserlandOffsetGet({ x: [] }), new UserlandAccess()]) {
+    const ref = new Ref<unknown>(object);
+    Assert.assertSame({ y: [1] }, Arr.push(ref, "x.y", 1));
+    Assert.assertTrue(ref.value === object);
+    Assert.assertSame({ x: [] }, object instanceof ArrayObject ? object.getArrayCopy() : object.stored);
+    Assert.assertSame({ leaf: [2] }, Arr.set(ref, "x.deep.leaf", [2]));
+    Assert.assertSame({ x: [] }, object instanceof ArrayObject ? object.getArrayCopy() : object.stored);
+    if (object instanceof UserlandAccess) Assert.assertSame([], object.writes);
+    // Initialization is an explicit offsetSet even when subsequent reference writes are detached.
+    Assert.assertSame({ value: [3] }, Arr.set(ref, "missing.value", [3]));
+    Assert.assertSame([], object.offsetGet("missing"));
+    if (object instanceof UserlandAccess) Assert.assertSame([["missing", []]], object.writes);
+    Assert.assertTrue(Arr.set(ref, "leaf", [4]) === object);
+    Assert.assertSame([4], object.offsetGet("leaf"));
+  }
+  class OrderedAccess extends UserlandAccess {
+    calls: unknown[][] = [];
+    throwOnGet = false;
+    override offsetExists(key: unknown): boolean {
+      this.calls.push(["exists", key]);
+      return super.offsetExists(key);
+    }
+    override offsetGet(key: unknown): unknown {
+      this.calls.push(["get", key]);
+      if (this.throwOnGet) throw new PhpError("offset read failed");
+      return super.offsetGet(key);
+    }
+    override offsetSet(key: unknown, value: unknown): void {
+      this.calls.push(["set", key, valueCopy(value)]);
+      super.offsetSet(key, value);
+    }
+  }
+  for (const [stored, calls, final] of [
+    [{ x: [] }, [["exists", "x"], ["get", "x"], ["get", "x"]], { x: [] }],
+    [[], [["exists", "x"], ["set", "x", []], ["get", "x"]], { x: [] }],
+    [{ x: 12 }, [["exists", "x"], ["get", "x"], ["set", "x", []], ["get", "x"]], { x: [] }],
+  ] as const) {
+    const object = new OrderedAccess();
+    object.stored = stored;
+    const ref = new Ref<unknown>(object);
+    Assert.assertSame({ leaf: [1] }, Arr.set(ref, "x.leaf", [1]));
+    Assert.assertTrue(ref.value === object);
+    Assert.assertSame(calls, object.calls);
+    Assert.assertSame(final, object.stored);
+  }
+  const throwingAccess = new OrderedAccess();
+  throwingAccess.stored = [];
+  throwingAccess.throwOnGet = true;
+  const throwingRef = new Ref<unknown>(throwingAccess);
+  fails(() => Arr.set(throwingRef, "missing.leaf", 1), PhpError, "offset read failed");
+  Assert.assertTrue(throwingRef.value === throwingAccess);
+  Assert.assertSame({ missing: [] }, throwingAccess.stored);
+  Assert.assertSame([["exists", "missing"], ["set", "missing", []], ["get", "missing"]], throwingAccess.calls);
+  // A userland offsetGet can return a non-array after the explicit initialization; that replacement stays detached.
+  class NonArrayOffset extends OrderedAccess {
+    override offsetGet(key: unknown): unknown { this.calls.push(["get", key]); return null; }
+  }
+  const nonArrayOffset = new NonArrayOffset();
+  nonArrayOffset.stored = { x: 12 };
+  Assert.assertSame({ leaf: 1 }, Arr.set(new Ref(nonArrayOffset), "x.leaf", 1));
+  Assert.assertSame({ x: [] }, nonArrayOffset.stored);
+  Assert.assertSame([["exists", "x"], ["get", "x"], ["set", "x", []], ["get", "x"]], nonArrayOffset.calls);
+
+  const entryValue = { child: [1], typedHandle };
+  class MutatingOffsetExists extends UserlandAccess {
+    override offsetExists(key: unknown): boolean {
+      entryValue.child.push(2);
+      return super.offsetExists(key);
+    }
+  }
+  const mutatingAccess = new MutatingOffsetExists();
+  const entryResult = Arr.set(new Ref(mutatingAccess), "x.leaf", entryValue) as { leaf: typeof entryValue };
+  Assert.assertSame([1, 2], entryValue.child);
+  Assert.assertSame([1], entryResult.leaf.child);
+  Assert.assertTrue(entryResult.leaf.typedHandle === typedHandle);
+  Assert.assertSame({ x: [] }, mutatingAccess.stored);
+
+  registerClass("ArrOverridingOffsetFixture", UserlandOffsetGet);
+  registerClass("ArrIndependentOffsetFixture", UserlandAccess);
+  for (const [object, name] of [
+    [new UserlandOffsetGet({ x: [] }), "ArrOverridingOffsetFixture"],
+    [new UserlandAccess(), "ArrIndependentOffsetFixture"],
+  ] as const) {
+    const ref = new Ref<unknown>(object);
+    fails(() => Arr.push(ref, "x", 1), PhpTypeError,
+      "Illuminate\\Support\\Arr::push(): Return value must be of type array, " + name + " returned");
+    Assert.assertTrue(ref.value === object);
+    Assert.assertSame({ x: [1] }, object instanceof ArrayObject ? object.getArrayCopy() : object.stored);
+  }
+  class InvalidSetReturnArr extends Arr {
+    static override set(array: Ref<unknown>, key: unknown, value: unknown): unknown {
+      super.set(array, key, value);
+      return 42;
+    }
+  }
+  const invalidSetReturnRef = new Ref<unknown>({ x: [] });
+  fails(() => InvalidSetReturnArr.push(invalidSetReturnRef, "x", 1), PhpTypeError,
+    "Illuminate\\Support\\Arr::push(): Return value must be of type array, int returned");
+  Assert.assertSame({ x: [1] }, invalidSetReturnRef.value);
+
+  const deepRef = new Ref<unknown>([]);
+  Assert.assertSame({ leaf: 1 }, Arr.set(deepRef, [...Array<string>(49_999).fill("child"), "leaf"].join("."), 1));
+  let deepCurrent = deepRef.value;
+  for (let depth = 0; depth < 49_999; depth++) {
+    Assert.assertTrue(deepCurrent !== null && typeof deepCurrent === "object");
+    deepCurrent = (deepCurrent as { child: unknown }).child;
+  }
+  Assert.assertSame({ leaf: 1 }, deepCurrent);
+
+  const leafObject = new ArrayObject({ x: [] });
+  const leafRef = new Ref<unknown>(leafObject);
+  fails(() => Arr.push(leafRef, "x", 1), PhpTypeError,
+    "Illuminate\\Support\\Arr::push(): Return value must be of type array, ArrayObject returned");
+  Assert.assertTrue(leafRef.value === leafObject);
+  Assert.assertSame({ x: [1] }, leafObject.getArrayCopy());
+  const nullObject = new ArrayObject({ x: [] });
+  const nullObjectRef = new Ref<unknown>(nullObject);
+  fails(() => Arr.push(nullObjectRef, null, 1), InvalidArgumentException,
+    "Array value for key [] must be an array, object found.");
+  Assert.assertTrue(nullObjectRef.value === nullObject);
+  Assert.assertSame({ x: [] }, nullObject.getArrayCopy());
+  const nullArrayRef = new Ref<unknown>({ x: [] });
+  Assert.assertSame(new PhpArray<string | number, unknown>([["x", []], [0, 1]]), Arr.push(nullArrayRef, null, 1));
+  Assert.assertSame(new PhpArray<string | number, unknown>([["x", []], [0, 1]]), nullArrayRef.value);
+  const replaceObjectRef = new Ref<unknown>(nullObject);
+  const replacementRoot = { replacement: [1] };
+  Assert.assertSame(replacementRoot, Arr.set(replaceObjectRef, null, replacementRoot));
+  replacementRoot.replacement.push(2);
+  Assert.assertSame({ replacement: [1] }, replaceObjectRef.value);
+  Assert.assertSame({ x: [] }, nullObject.getArrayCopy());
+  const nestedSparseRef = new Ref<unknown>({ parent: { sparse: pushSparse } });
+  Assert.assertSame({ sparse: new PhpArray([[6, "next"]]) }, Arr.push(nestedSparseRef, "parent.sparse", "next"));
+  Assert.assertSame([[6, "next"]], arrayEntries(Arr.get(nestedSparseRef.value, "parent.sparse") as object));
+  Assert.assertSame([], arrayEntries(pushSparse));
   const recursive = new PhpArray<string | number, unknown>([
     ["z", new PhpArray<string, unknown>([["b", [10, 2, 1]], ["a", { value: [3, 1, 2] }]])],
     [4, ["item10", "item2", "item1"]],
diff --git a/stories/14.6.md b/stories/14.6.md
index 23ab6b20..9df81aa2 100644
--- a/stories/14.6.md
+++ b/stories/14.6.md
@@ -2,7 +2,7 @@
 story_id: "14.6"
 epic: 14
 component: collections
-status: blocked
+status: in-progress
 title: "`Arr` helpers"
 sprint_key: 14-6-arr-helpers
 test_ids:

```
