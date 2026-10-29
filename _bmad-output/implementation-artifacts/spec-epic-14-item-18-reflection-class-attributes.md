---
title: 'Reflector.getClassAttributes returns a Collection (epic-14-item-18-reflection-class-attributes)'
type: 'feature'
created: '2026-10-29'
status: 'in-review'
baseline_revision: '00dfa4bcc06c1bb1d5ff978133de0c480cd6ac8c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/decisions/MAINT-2026-10-29-story-14-8.md'
  - '{project-root}/decisions/DIV-12.md'
  - '{project-root}/PORTING.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `Reflector.getClassAttributes` (packages/reflection) still throws `BlockedByComponentError("collections")`, the boundary ESC-13.1-10 set while Collections was unported, so `SupportReflectorTest::testGetClassAttributes` is `skip` / `blocked-by:collections`. Collections is now on `main` (Epic 14), and the Maintainer's ruling `decisions/MAINT-2026-10-29-story-14-8.md` (ESC-14.8-1 part 3) routes this item to land before Story 14.8 resumes.

**Approach:** Port Upstream `Reflector::getClassAttributes` line for line over `@xaravel/collections`' `Collection`: per walked class a `Collection` of attribute instances keyed by the class name, and the result is `new Collection($attributes)` when `includeParents`, else `array_first($attributes)`. Unblock the Ported Test (Upstream's assertions unchanged, its higher-order reads written per DIV-12.16), flip its Expectations line to `pass`, and update the XT test and docs that described the boundary.

## Boundaries & Constraints

**Always:** Edit only `packages/reflection/**` and the one Expectations line `Illuminate\Tests\Support\SupportReflectorTest::testGetClassAttributes` in `conformance/expectations/reflection/framework/tests/Support/SupportReflectorTest.jsonl`, plus this spec and sprint-status bookkeeping. Keep Upstream's order: every walked class's attributes are built (`newInstance()`) in walk order. Sync; `null` the only absent value. Every assertion of Upstream's `testGetClassAttributes` keeps its expected values; each line marks its adaptation (`// adapted:DIV-12.15`, plus `adapted:DIV-12.16` where it reads `->map->string` / `->sum->number` as `__get(...)`). The Expectations line carries `adapted: "DIV-12.15"`, as its sibling `testGetClassAttribute` does.

**Never:** Change `getClassAttribute`, any other `Reflector` or `ReflectsClosures` behaviour, any other component (collections, runtime, contracts), any other Expectations line, or the item's `action` / `owner` / `epic`. No new DIV clause, no skips, no weakened assertion, no stub.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Own class only | `getClassAttributes(ChildClass, StrAttr)` | `Collection` of ChildClass's `StrAttr` instances in source order (`map->string` = quick, brown, fox) | none |
| With parents | `getClassAttributes(ChildClass, StrAttr, true)` | `Collection` keyed `fqcn(ChildClass)`, `fqcn(ParentClass)`, each value a `Collection` of instances; `toArray()` gives nested arrays | none |
| No match | `getClassAttributes(ChildClass, UnusedAttr)` / with `true` | empty `Collection` (`toArray()` `[]`) / `{Child: [], Parent: []}` | none |
| Instance argument | `getClassAttributes(new TaggedChild(), Tag)` | same as the class | none |
| Unknown FQCN | `getClassAttributes("Missing\\Name", Tag)` | — | `ReflectionException` from `new ReflectionClass`, as Upstream |

</intent-contract>

## Code Map

- `packages/reflection/src/Reflector.ts:12-14` -- header bullet describing the boundary; rewrite to describe the port.
- `packages/reflection/src/Reflector.ts:19-20` -- `import type { Collection } from "@xaravel/contracts/bus"` (placeholder type) and `BlockedByComponentError` import; switch to `Collection` from `@xaravel/collections`, drop the unused import.
- `packages/reflection/src/Reflector.ts:155-167` -- `getClassAttributes` stub to replace. `classAttributeLists` (168-183) is `getClassAttribute`'s plain-array loop; leave it as is.
- `conformance/upstream/framework/src/Illuminate/Reflection/Reflector.php:88-102` -- Upstream source.
- `conformance/upstream/framework/tests/Support/SupportReflectorTest.php:79-119` -- Upstream test.
- `packages/runtime/src/php/arrayFunctions.ts:605` -- `array_first` (runtime export via `@xaravel/runtime/php`).
- `packages/collections/src/Traits/EnumeratesValues.ts:734` -- `Collection.__get(key)` gives a `HigherOrderCollectionProxy` (DIV-12.16); `packages/collections/src/HigherOrderCollectionProxy.ts:40` `__get` returns `unknown`.
- `packages/reflection/tests/ported/framework/tests/Support/SupportReflectorTest.test.ts:16-20,96-124,180-219` -- header note, `SupportReflectorTestCollections` case, `AttributeCollection` / `CollectionReflector` view, and the blocked body.
- `packages/reflection/tests/xaravel/reflection.test.ts:282,401-404` -- XT-reflection-1 consequence text and the `BlockedByComponentError` assertions.
- `packages/reflection/docs/reflection.md:54,108` -- docs describing the boundary.
- `packages/reflection/package.json` / `tsconfig.json` -- already list `@xaravel/collections` (no change).

## Tasks & Acceptance

**Execution:**
- `packages/reflection/src/Reflector.ts` -- implement `getClassAttributes` as Upstream (keyed plain object of `new Collection(instances)` per class; `includeParents ? new Collection(attributes) : array_first(attributes)`), return type `Collection`; update header and docblock -- the ruling's repair.
- `packages/reflection/tests/ported/framework/tests/Support/SupportReflectorTest.test.ts` -- run `testGetClassAttributes` under `SupportReflectorTest` (registers the fixtures), delete the Collections case and the typed view, write `->map->string` as `.__get("map").__get("string")` and `->sum->number` as `.__get("sum").__get("number")` with `adapted:DIV-12.16` beside the existing `adapted:DIV-12.15`; update the header note -- unblock without changing an assertion.
- `conformance/expectations/reflection/framework/tests/Support/SupportReflectorTest.jsonl` -- line for `testGetClassAttributes`: `status: pass`, `reason: null`, `adapted: "DIV-12.15"` -- the ruling names this line.
- `packages/reflection/tests/xaravel/reflection.test.ts` -- XT-reflection-1: replace the blocked assertions with checks that the result is a `Collection`, keyed by FQCN with parents, built in walk order (the `built` log), works for an instance argument and throws `ReflectionException` for an unknown FQCN; update its consequence text -- the test this change makes stale.
- `packages/reflection/docs/reflection.md` -- describe what `getClassAttributes` returns; drop the boundary note.

**Acceptance Criteria:**
- Given Collections on `main`, when `bun run harness --component reflection` runs, then `SupportReflectorTest::testGetClassAttributes` passes and matches its Expectations line, with no other difference.
- Given the change, when `bun run harness`, `bun run typecheck`, `bun run lint` and `bun run divergence:check` run, then each exits 0.
- Given the item, when `bun run fidelity:review status --item epic-14-item-18-reflection-class-attributes --spec <this spec>` runs, then it prints `current`.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bun test packages/reflection` -- expected: all pass.
- `bun run harness --component reflection` then `bun run harness` -- expected: no differences, SUMMARY clean.
- `bun run typecheck && bun run lint && bun run divergence:check` -- expected: exit 0.
- `bun run api-surface:gate reflection` -- expected: 0 unexplained.

## Fidelity Review

### Reviewer 1: reject at tree 651e1a38ebb400af82c3352f5f74149069128a7c

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `00dfa4bcc06c1bb1d5ff978133de0c480cd6ac8c`, on 2026-10-29T18:48:32.365Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | fail | The changed Ported Test is supplied, but its Upstream source and Inventory source row are absent, so assertion subjects, values and order cannot be confirmed. |
| F-2: No expected value is weakened | fail | The diff preserves existing exact comparisons and expected values, but the missing Upstream test prevents confirming that those values are not weakened. |
| F-3: No assertion is removed without a DIV clause | fail | The port retains 11 assertions, but Upstream's assertion count is unavailable; neither cited DIV record permits fewer assertions. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The only changed Expectations line changes skip to pass; no new skip reason requires justification or precedence review. |
| F-5: Every `adapted` marker matches its clause | pass | DIV-12.15 covers the attribute fixtures, and DIV-12.16 permits the explicit higher-order __get calls. The casts do not change the assertions or expected values. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this change. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-reflection-1 checks Collection results, attribute construction order, parent keys, nested Collection types, instance input, empty matches and unknown-class failure. XT-reflection-3 checks its declared Expectations invariants. Neither cites a numbered consequence bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | The changes stay within Reflection and its Expectations shard. The implementation consumes the existing Collections API rather than implementing or faking another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | The complete Reflector source and declaration inventory contain no async methods or @​asyncRoot tags. Its synchronous reflection and Collection operations agree with AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes, so there are no changed setup or exprs inputs to compare. |

Findings:

- **F-1** `packages/reflection/tests/ported/framework/tests/Support/SupportReflectorTest.test.ts`: Supply the Inventory source row and Upstream PHP source for testGetClassAttributes, including its fixture dependencies, so all 11 assertions can be compared. _(missing evidence)_
- **F-2** `packages/reflection/tests/ported/framework/tests/Support/SupportReflectorTest.test.ts`: Supply Upstream testGetClassAttributes so its assertion strictness, expected values and exception expectations can be compared with the enabled port. _(missing evidence)_
- **F-3** `packages/reflection/tests/ported/framework/tests/Support/SupportReflectorTest.test.ts`: Supply the complete Upstream testGetClassAttributes body to verify that every Upstream assertion has a counterpart. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"651e1a38ebb400af82c3352f5f74149069128a7c","base":"00dfa4bcc06c1bb1d5ff978133de0c480cd6ac8c","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-29T18:48:32.365Z","items":[{"id":"F-1","result":"fail","note":"The changed Ported Test is supplied, but its Upstream source and Inventory source row are absent, so assertion subjects, values and order cannot be confirmed.","findings":[{"path":"packages/reflection/tests/ported/framework/tests/Support/SupportReflectorTest.test.ts","detail":"Supply the Inventory source row and Upstream PHP source for testGetClassAttributes, including its fixture dependencies, so all 11 assertions can be compared.","kind":"missing-evidence"}]},{"id":"F-2","result":"fail","note":"The diff preserves existing exact comparisons and expected values, but the missing Upstream test prevents confirming that those values are not weakened.","findings":[{"path":"packages/reflection/tests/ported/framework/tests/Support/SupportReflectorTest.test.ts","detail":"Supply Upstream testGetClassAttributes so its assertion strictness, expected values and exception expectations can be compared with the enabled port.","kind":"missing-evidence"}]},{"id":"F-3","result":"fail","note":"The port retains 11 assertions, but Upstream's assertion count is unavailable; neither cited DIV record permits fewer assertions.","findings":[{"path":"packages/reflection/tests/ported/framework/tests/Support/SupportReflectorTest.test.ts","detail":"Supply the complete Upstream testGetClassAttributes body to verify that every Upstream assertion has a counterpart.","kind":"missing-evidence"}]},{"id":"F-4","result":"n/a","note":"The only changed Expectations line changes skip to pass; no new skip reason requires justification or precedence review.","findings":[]},{"id":"F-5","result":"pass","note":"DIV-12.15 covers the attribute fixtures, and DIV-12.16 permits the explicit higher-order __get calls. The casts do not change the assertions or expected values.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this change.","findings":[]},{"id":"F-7","result":"pass","note":"XT-reflection-1 checks Collection results, attribute construction order, parent keys, nested Collection types, instance input, empty matches and unknown-class failure. XT-reflection-3 checks its declared Expectations invariants. Neither cites a numbered consequence bullet.","findings":[]},{"id":"F-8","result":"pass","note":"The changes stay within Reflection and its Expectations shard. The implementation consumes the existing Collections API rather than implementing or faking another Component.","findings":[]},{"id":"F-9","result":"pass","note":"The complete Reflector source and declaration inventory contain no async methods or @asyncRoot tags. Its synchronous reflection and Collection operations agree with AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes, so there are no changed setup or exprs inputs to compare.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 651e1a38ebb400af82c3352f5f74149069128a7c

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `00dfa4bcc06c1bb1d5ff978133de0c480cd6ac8c`, on 2026-10-29T18:48:32.365Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | fail | The change edits the Ported Test testGetClassAttributes in packages/reflection/tests/ported/framework/tests/Support/SupportReflectorTest.test.ts. It switches the test case from SupportReflectorTestCollections to SupportReflectorTest and rewrites the higher-order reads as __get calls. The prompt's Inventory section says the item assigns no Ported Test IDs, so it carries no Upstream source for SupportReflectorTest::testGetClassAttributes. Without it, assertion order, subjects and values cannot be matched against Upstream. |
| F-2: No expected value is weakened | pass | Each assertion in testGetClassAttributes was compared before and after the change. Every expected value is unchanged: [], the keyed empty map, ['quick','brown','fox'], ['quick','brown','fox','lazy','dog'], 7, 12, 5, 5, the FQCN key list, and assertContainsOnlyInstancesOf StrAttr. Every assertion still uses assertSame. Only the expression form changed: '.map.string' became '.__get("map").__get("string")', plus a type-only 'as Collection' cast. The item says the Upstream assertions stay unchanged. In XT-reflection-1, the replaced BlockedByComponentError checks give way to stronger checks of the new behaviour, not looser ones. |
| F-3: No assertion is removed without a DIV clause | pass | The diff removes no assertion from testGetClassAttributes. Its assertions are still the same 13 calls, in the same order. Only the CollectionReflector view and the blocked test case were removed, and neither holds assertions. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no skip line. It turns testGetClassAttributes from skip blocked-by:collections into pass, now that Collections exists and the ported body runs against it. |
| F-5: Every `adapted` marker matches its clause | pass | Markers adapted:DIV-12.15 sit on the @​attribute fixture uses, as before; DIV-12.15 covers PHP attributes as @​attribute. Markers adapted:DIV-12.16 sit on lines where '$c->map->string' becomes 'c.__get('map').__get('string')' and '->sum->number' becomes '.__get('sum').__get('number')', exactly the __get form DIV-12.16 prescribes. The 'as Collection' cast is a type assertion only. The Expectations adapted field DIV-12.15 names an existing clause that the test uses. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no error fixtures and no assigned committed Oracle requests. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-reflection-1's new consequence clause says getClassAttributes returns a Collection of the class's instances. With includeParents it says a Collection keyed by FQCN whose values are Collections, with matches built in walk order, for a class or an instance, and a ReflectionException for an unknown FQCN. The body checks every one of these: assertInstanceOf Collection, the values, 'built' order with and without parents, keys equal to [fqcn(TaggedChild), fqcn(TaggedParent)], every value instanceof Collection, the instance argument, empty results via toArray, and the ReflectionException on 'Missing\\Name'. The string cites no FR-<n>.<k> or AD-<n>.<k> bullet token. XT-reflection-3 is unchanged and still holds: the new pass line has a null reason and adapted DIV-12.15, an existing clause. |
| F-8: No stub, fake or partial implementation of another Component | pass | Reflector.getClassAttributes now uses the real Collection from @​xaravel/collections; the README already lists it as a dependency. It no longer imports the type-only Collection from @​xaravel/contracts/bus. No stub, fake or hard-coded return is added, and all edits are in packages/reflection plus reflection's own Expectations shard. The implementation mirrors Upstream's do/while loop: new Collection of newInstance() results keyed by reflectionClass.name, then new Collection(attributes) or the first entry (array_first for reset). |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in Reflector.ts. getClassAttributes and every other export stay sync; they do no IO and take no callback. No tag is missing or false. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-1** `packages/reflection/tests/ported/framework/tests/Support/SupportReflectorTest.test.ts`: Missing: the Inventory row and Upstream source lines (framework/tests/Support/SupportReflectorTest.php::testGetClassAttributes) for the changed Ported Test. The review cannot confirm that each assertion matches Upstream's subject, expected value and order without them. Add the Test ID to the review's evidence, for example by assigning it to the item. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"651e1a38ebb400af82c3352f5f74149069128a7c","base":"00dfa4bcc06c1bb1d5ff978133de0c480cd6ac8c","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-29T18:48:32.365Z","items":[{"id":"F-1","result":"fail","note":"The change edits the Ported Test testGetClassAttributes in packages/reflection/tests/ported/framework/tests/Support/SupportReflectorTest.test.ts. It switches the test case from SupportReflectorTestCollections to SupportReflectorTest and rewrites the higher-order reads as __get calls. The prompt's Inventory section says the item assigns no Ported Test IDs, so it carries no Upstream source for SupportReflectorTest::testGetClassAttributes. Without it, assertion order, subjects and values cannot be matched against Upstream.","findings":[{"path":"packages/reflection/tests/ported/framework/tests/Support/SupportReflectorTest.test.ts","detail":"Missing: the Inventory row and Upstream source lines (framework/tests/Support/SupportReflectorTest.php::testGetClassAttributes) for the changed Ported Test. The review cannot confirm that each assertion matches Upstream's subject, expected value and order without them. Add the Test ID to the review's evidence, for example by assigning it to the item.","kind":"missing-evidence"}]},{"id":"F-2","result":"pass","note":"Each assertion in testGetClassAttributes was compared before and after the change. Every expected value is unchanged: [], the keyed empty map, ['quick','brown','fox'], ['quick','brown','fox','lazy','dog'], 7, 12, 5, 5, the FQCN key list, and assertContainsOnlyInstancesOf StrAttr. Every assertion still uses assertSame. Only the expression form changed: `.map.string` became `.__get(\"map\").__get(\"string\")`, plus a type-only `as Collection` cast. The item says the Upstream assertions stay unchanged. In XT-reflection-1, the replaced BlockedByComponentError checks give way to stronger checks of the new behaviour, not looser ones.","findings":[]},{"id":"F-3","result":"pass","note":"The diff removes no assertion from testGetClassAttributes. Its assertions are still the same 13 calls, in the same order. Only the CollectionReflector view and the blocked test case were removed, and neither holds assertions.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no skip line. It turns testGetClassAttributes from skip blocked-by:collections into pass, now that Collections exists and the ported body runs against it.","findings":[]},{"id":"F-5","result":"pass","note":"Markers adapted:DIV-12.15 sit on the @attribute fixture uses, as before; DIV-12.15 covers PHP attributes as @attribute. Markers adapted:DIV-12.16 sit on lines where `$c->map->string` becomes `c.__get('map').__get('string')` and `->sum->number` becomes `.__get('sum').__get('number')`, exactly the __get form DIV-12.16 prescribes. The `as Collection` cast is a type assertion only. The Expectations adapted field DIV-12.15 names an existing clause that the test uses.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no error fixtures and no assigned committed Oracle requests.","findings":[]},{"id":"F-7","result":"pass","note":"XT-reflection-1's new consequence clause says getClassAttributes returns a Collection of the class's instances. With includeParents it says a Collection keyed by FQCN whose values are Collections, with matches built in walk order, for a class or an instance, and a ReflectionException for an unknown FQCN. The body checks every one of these: assertInstanceOf Collection, the values, `built` order with and without parents, keys equal to [fqcn(TaggedChild), fqcn(TaggedParent)], every value instanceof Collection, the instance argument, empty results via toArray, and the ReflectionException on 'Missing\\\\Name'. The string cites no FR-<n>.<k> or AD-<n>.<k> bullet token. XT-reflection-3 is unchanged and still holds: the new pass line has a null reason and adapted DIV-12.15, an existing clause.","findings":[]},{"id":"F-8","result":"pass","note":"Reflector.getClassAttributes now uses the real Collection from @xaravel/collections; the README already lists it as a dependency. It no longer imports the type-only Collection from @xaravel/contracts/bus. No stub, fake or hard-coded return is added, and all edits are in packages/reflection plus reflection's own Expectations shard. The implementation mirrors Upstream's do/while loop: new Collection of newInstance() results keyed by reflectionClass.name, then new Collection(attributes) or the first entry (array_first for reset).","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in Reflector.ts. getClassAttributes and every other export stay sync; they do no IO and take no callback. No tag is missing or false.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```
