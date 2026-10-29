---
title: 'Remove Enumerable.reduceWithKeys (epic-14-item-19, U2)'
type: 'bugfix'
created: '2026-10-29'
status: 'done'
baseline_revision: 7875f2071fd896bef1ba57292f7ed99b971eb575
review_loop_iteration: 1
followup_review_recommended: false
context:
  - decisions/MAINT-2026-10-29-collections-gate.md
  - decisions/MAINT-2026-10-29-story-14-8.md
  - conformance/escalations/ESC-14.8-1.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `bun run api-surface:gate collections` reports one unexplained line, `collections: extra method Illuminate\Support\Enumerable::reduceWithKeys`. Upstream v13.37.0's `Enumerable` interface declares `reduce`, `reduceInto` and `reduceSpread` but not `reduceWithKeys`, which lives only on the `EnumeratesValues` trait (`EnumeratesValues.php:911`). The Maintainer ruled (U2, `decisions/MAINT-2026-10-29-collections-gate.md`) that it is removed from the interface, and that XT-collections-11 calls it through `Collection`. This is the last remaining work of `epic-14-item-19-collections-api-surface-findings`, and it must land before Story 14.8 resumes.

**Approach:** Delete the `reduceWithKeys` member from the `Enumerable` interface. Keep it on `Collection` and `LazyCollection` through `EnumeratesValues`. In XT-collections-11's fixture, call `reduceWithKeys` only on the `collect([1])` and `LazyCollection.make([1])` targets, not on the `Enumerable`-typed `e`. Update the Collections docs paragraph that lists the open gate findings.

## Boundaries & Constraints

**Always:** Scope is `packages/collections/**` plus this item's records under `_bmad-output/implementation-artifacts/`. `Collection` and `LazyCollection` keep `reduceWithKeys`, with the same behaviour and the same sync-callback typing (AD-6). The fixture still checks, on both concrete classes, that `tsc` and lint reject an async `reduceWithKeys` callback and accept a sync one.

**Never:** Edit `conformance/api-surface/**`, `conformance/expectations/**`, `tools/**`, another package, a DIV, or the item's `action`/`owner`/`epic`. Never remove or weaken any other assertion or operation in XT-collections-11. Never add a cast, an alias or a forwarding member to keep `e.reduceWithKeys` compiling.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Concrete classes | `collect([1]).reduceWithKeys(fn, 0)`, `LazyCollection.make([1]).reduceWithKeys(fn, 0)` | unchanged: compiles, and reduces as before | async callback still a tsc + `no-misused-promises` error |
| Interface | `const e: Enumerable = …; e.reduceWithKeys` | no longer a member of `Enumerable` (TS2339) | not exercised by the fixture |

</intent-contract>

## Code Map

- `packages/collections/src/Enumerable.ts:215-216` -- the `reduceWithKeys` member and its doc comment; delete both. `reduce` (214) and `reduceInto` (218) stay.
- `packages/collections/src/Traits/EnumeratesValues.ts:373` -- the trait implementation that `Collection` and `LazyCollection` get; read-only.
- `packages/collections/tests/xaravel/collections.test.ts:1147-1214` -- XT-collections-11. `operations` (1150) includes `reduceWithKeys(...)` at 1174; `lines` (1184-1192) maps every operation over the three targets `collect([1])`, `LazyCollection.make([1])` and `e`. The invalid fixture expects a diagnostic on every line from 3 on (`diagnosticLines`); the valid fixture (`invalid.replaceAll("async ", "")`) expects `tsc` and oxlint to exit 0, so `e.reduceWithKeys(...)` would fail it once the member is gone. Skip that one operation for target `e` in the `flatMap`.
- `packages/collections/docs/collections.md:303-312` -- the paragraph listing the gate's remaining findings; it names `Enumerable.reduceWithKeys` as awaiting a ruling. Say instead that, after the Maintainer's gate ruling, the remaining lines are cited (DIV-1.2, DIV-12.18, DIV-12.21) and `reduceWithKeys` is no longer on `Enumerable`. Leave the ESC-14.8-2 `array_sum` sentence and "No Epic-close pass is claimed." as they are.
- `conformance/upstream/framework/src/Illuminate/Collections/Enumerable.php:892-914` -- Upstream evidence: `reduce`, `reduceInto`, `reduceSpread`; no `reduceWithKeys`.

## Tasks & Acceptance

**Execution:**
- `packages/collections/src/Enumerable.ts` -- delete the `reduceWithKeys` member -- match Upstream's interface (U2).
- `packages/collections/tests/xaravel/collections.test.ts` -- in XT-collections-11, leave out `reduceWithKeys` only for target `e` -- the ruling's "calls it through Collection"; every other operation and assertion is unchanged.
- `packages/collections/docs/collections.md` -- update the open-findings paragraph as in the Code Map.

**Acceptance Criteria:**
- Given the change, when `bun run api-surface:gate collections` runs, then it reports zero unexplained lines and exits 0.
- Given XT-collections-11, when it runs, then the invalid fixture still reports `reduceWithKeys` diagnostics for `collect([1])` and `LazyCollection.make([1])`, the valid fixture passes, and the test passes.
- Given the change, when `bun run typecheck`, `bun run lint` and the full `bun run harness` run, then all pass with no Expectations difference.

## Spec Change Log

## Review Triage Log

### 2026-10-29 — Review pass
- verdicts: 9 findings — high 0, medium 0, low 6, false 3, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) Docs paragraph credits the gate ruling for every remaining line, though the deferrals and verbatim helper names came from #533 — reworded `packages/collections/docs/collections.md` to name #533 and the ruling separately.
  - `[low]` `[patch]` (blind) "ESC-14.8-1 records those obligations" is stale with zero unexplained lines — same edit: the paragraph now says the gate reports zero unexplained and XT-collections-16 activation stays with Story 14.8.
  - `[low]` `[reject]` (blind) No test asserts `Enumerable` lacks `reduceWithKeys` — the API-surface gate is the AD-15 check for declared members, and XT-collections-16 (Story 14.8) runs it; a type-level probe would duplicate it inside XT-collections-11 for a regression that is unlikely.
  - `[false]` `[reject]` (blind) The `e` exclusion is uncommented and keyed on a string prefix — if the operation is reworded the filter stops matching and the valid fixture fails tsc loudly, so it cannot silently regress; the test file's dense one-line style has no comments for any operation.
  - `[low]` `[reject]` (blind) Spec records no observed evidence or handoff — the fix is an edit to this build's spec; Auto Run Result records the outcomes.
  - (edge-case) no findings. (verification-gap) no gaps.
  - `[low]` `[patch]` (intent) Docs wording goes past U2 by crediting the ruling for O and T1 lines — same root cause and same patch as the first row.
  - `[low]` `[reject]` (intent) Interface removal is exercised only by the gate — same as the third row; the gate is the declared surface for this check.
  - `[false]` `[reject]` (intent) Fidelity Review, harness, typecheck and lint not shown done — they ran: two Fidelity passes at tree 6f6c9af2…, full harness `differ=0`, typecheck and lint exit 0.
  - `[false]` `[reject]` (intent) R1 vs R2 line count — the dropped `e` line checked a member Upstream's `Enumerable` lacks; both concrete Collection targets still check it, which is the ruling's "calls it through Collection".

### 2026-10-29 — Review pass (Finalize re-check, loop 1)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: Fidelity Review re-ran on the patched tree f451ae7af2d8a8e620fd6b3d795505d5d6399d1d: two `pass` verdicts, no F-n lines.

## Verification

**Commands:**
- `bun run api-surface:gate collections` -- expected: `0 unexplained`, exit 0.
- `bun run harness --xaravel --id 'XT-collections-11'` -- expected: no difference.
- `bun run typecheck` and `bun run lint` -- expected: exit 0.
- `bun run harness` -- expected: no differences (`SUMMARY` clean; NOT-RUN Variants allowed).

## Fidelity Review

### Reviewer 1: pass at tree 6f6c9af2109b03befd4c03c796ed0598e30ed7c8

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `7875f2071fd896bef1ba57292f7ed99b971eb575`, on 2026-10-29T23:46:55.642Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The diff adds or changes no Ported Test; no Upstream assertion comparison applies. |
| F-2: No expected value is weakened | pass | XT-collections-11 retains exact diagnostic comparisons and runtime expected values. Filtering reduceWithKeys only for Enumerable follows its removed declaration; both concrete classes retain coverage. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | pass | The retained DIV-9.16 markers check callback exceptions taking precedence over competing generator cleanup exceptions, exactly as that clause permits. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no relied-upon Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-11 checks its declared callback typing, sequential async execution, copying, ordering, reduction and iterator cleanup consequences. The filtered interface call removes coverage only for a member no longer declared there. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed paths belong to collections. Removing an interface declaration and adjusting its typing fixture introduce no implementation of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Enumerable's eight retained callback-root tags correspond to DIV-1's async companions. Its remaining declarations are synchronous or generic dual helpers without declared Promise returns. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"6f6c9af2109b03befd4c03c796ed0598e30ed7c8","base":"7875f2071fd896bef1ba57292f7ed99b971eb575","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-29T23:46:55.642Z","items":[{"id":"F-1","result":"n/a","note":"The diff adds or changes no Ported Test; no Upstream assertion comparison applies.","findings":[]},{"id":"F-2","result":"pass","note":"XT-collections-11 retains exact diagnostic comparisons and runtime expected values. Filtering reduceWithKeys only for Enumerable follows its removed declaration; both concrete classes retain coverage.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"pass","note":"The retained DIV-9.16 markers check callback exceptions taking precedence over competing generator cleanup exceptions, exactly as that clause permits.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no relied-upon Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-11 checks its declared callback typing, sequential async execution, copying, ordering, reduction and iterator cleanup consequences. The filtered interface call removes coverage only for a member no longer declared there.","findings":[]},{"id":"F-8","result":"pass","note":"All changed paths belong to collections. Removing an interface declaration and adjusting its typing fixture introduce no implementation of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Enumerable's eight retained callback-root tags correspond to DIV-1's async companions. Its remaining declarations are synchronous or generic dual helpers without declared Promise returns.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 6f6c9af2109b03befd4c03c796ed0598e30ed7c8

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `7875f2071fd896bef1ba57292f7ed99b971eb575`, on 2026-10-29T23:46:55.642Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and touches no Ported Test. The only test change is to the Xaravel Test XT-collections-11, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | pass | XT-collections-11 still asserts the exact tsc diagnostic lines (assertSame of diagnosticLines) and the exact lint diagnostics, computed from the fixture lines. The only edit stops generating 'e.reduceWithKeys(...)' for the Enumerable-typed receiver, because the change removes that member from the Enumerable interface. That matches the token's method map in Enumerable.ts, which records PHP's interface and has never listed reduceWithKeys. Collection and LazyCollection still declare it through EnumeratesValues, and the fixture still tests both with an async callback. No expected value was loosened or changed to fit Xaravel's output. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there is no Upstream assertion count to compare. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | pass | The change adds no adapted marker. The touched XT-collections-11 keeps its '// adapted:DIV-9.16' markers. Each sits on an assertion that the loop body's or callback's exception wins over a competing generator-finally exception, which is exactly what clause DIV-9.16 describes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The item relies on no Oracle error fixture. Evidence (c) lists none. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-11's consequence string is unchanged. Its body still checks that every sync callback API declared on Collection, LazyCollection and Enumerable rejects async callbacks in tsc and lint. reduceWithKeys is still checked on both classes and is simply no longer an Enumerable member. The rest of the body is untouched. The cited AD-6, DIV-1.2 and DIV-9.16 still name what is tested. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every change is inside packages/collections (src/Enumerable.ts, docs, tests/xaravel). It adds no stub, fake or partial implementation of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Enumerable.ts keeps its '@​asyncRoot callback' tags on mapAsync, eachAsync, filterAsync, rejectAsync, partitionAsync, everyAsync, containsAsync and firstAsync. Each is a DIV-1.2 async companion that accepts a callback which may be async, so AD-6's callback clause holds. The removed reduceWithKeys was sync and untagged, and the change adds no new async export. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"6f6c9af2109b03befd4c03c796ed0598e30ed7c8","base":"7875f2071fd896bef1ba57292f7ed99b971eb575","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-29T23:46:55.642Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and touches no Ported Test. The only test change is to the Xaravel Test XT-collections-11, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"pass","note":"XT-collections-11 still asserts the exact tsc diagnostic lines (assertSame of diagnosticLines) and the exact lint diagnostics, computed from the fixture lines. The only edit stops generating `e.reduceWithKeys(...)` for the Enumerable-typed receiver, because the change removes that member from the Enumerable interface. That matches the token's method map in Enumerable.ts, which records PHP's interface and has never listed reduceWithKeys. Collection and LazyCollection still declare it through EnumeratesValues, and the fixture still tests both with an async callback. No expected value was loosened or changed to fit Xaravel's output.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream assertion count to compare.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"pass","note":"The change adds no adapted marker. The touched XT-collections-11 keeps its `// adapted:DIV-9.16` markers. Each sits on an assertion that the loop body's or callback's exception wins over a competing generator-finally exception, which is exactly what clause DIV-9.16 describes.","findings":[]},{"id":"F-6","result":"n/a","note":"The item relies on no Oracle error fixture. Evidence (c) lists none.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-11's consequence string is unchanged. Its body still checks that every sync callback API declared on Collection, LazyCollection and Enumerable rejects async callbacks in tsc and lint. reduceWithKeys is still checked on both classes and is simply no longer an Enumerable member. The rest of the body is untouched. The cited AD-6, DIV-1.2 and DIV-9.16 still name what is tested.","findings":[]},{"id":"F-8","result":"pass","note":"Every change is inside packages/collections (src/Enumerable.ts, docs, tests/xaravel). It adds no stub, fake or partial implementation of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Enumerable.ts keeps its `@asyncRoot callback` tags on mapAsync, eachAsync, filterAsync, rejectAsync, partitionAsync, everyAsync, containsAsync and firstAsync. Each is a DIV-1.2 async companion that accepts a callback which may be async, so AD-6's callback clause holds. The removed reduceWithKeys was sync and untagged, and the change adds no new async export.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree f451ae7af2d8a8e620fd6b3d795505d5d6399d1d

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `7875f2071fd896bef1ba57292f7ed99b971eb575`, on 2026-10-29T23:49:21.600Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The diff adds or changes no Ported Test; there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | pass | XT-collections-11 retains exact diagnostic comparisons and concrete-class reduceWithKeys coverage. Excluding only Enumerable.reduceWithKeys follows the explicit Maintainer ruling removing that interface member; no expected value is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test changes, so no Upstream assertion counterpart is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip, so no new reason or precedence requires review. |
| F-5: Every `adapted` marker matches its clause | pass | The retained DIV-9.16 assertion markers check callback exceptions taking precedence over competing generator cleanup exceptions, exactly as that clause permits. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-11 checks its declared callback ordering, copying, typing, reduction, lazy enumeration and cleanup consequences. The filtered interface call matches the Maintainer ruling while both concrete classes retain coverage. |
| F-8: No stub, fake or partial implementation of another Component | pass | All three changed paths belong to collections. Removing an interface declaration and adjusting its test adds no substitute behavior for another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Enumerable's eight retained callback-root tags correspond to DIV-1's async companions. Its remaining declarations are synchronous or generic dual helpers and require no additional async-root tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes, so there are no changed setup or expression inputs to compare. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"f451ae7af2d8a8e620fd6b3d795505d5d6399d1d","base":"7875f2071fd896bef1ba57292f7ed99b971eb575","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-29T23:49:21.600Z","items":[{"id":"F-1","result":"n/a","note":"The diff adds or changes no Ported Test; there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"pass","note":"XT-collections-11 retains exact diagnostic comparisons and concrete-class reduceWithKeys coverage. Excluding only Enumerable.reduceWithKeys follows the explicit Maintainer ruling removing that interface member; no expected value is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test changes, so no Upstream assertion counterpart is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip, so no new reason or precedence requires review.","findings":[]},{"id":"F-5","result":"pass","note":"The retained DIV-9.16 assertion markers check callback exceptions taking precedence over competing generator cleanup exceptions, exactly as that clause permits.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-11 checks its declared callback ordering, copying, typing, reduction, lazy enumeration and cleanup consequences. The filtered interface call matches the Maintainer ruling while both concrete classes retain coverage.","findings":[]},{"id":"F-8","result":"pass","note":"All three changed paths belong to collections. Removing an interface declaration and adjusting its test adds no substitute behavior for another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Enumerable's eight retained callback-root tags correspond to DIV-1's async companions. Its remaining declarations are synchronous or generic dual helpers and require no additional async-root tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes, so there are no changed setup or expression inputs to compare.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree f451ae7af2d8a8e620fd6b3d795505d5d6399d1d

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `7875f2071fd896bef1ba57292f7ed99b971eb575`, on 2026-10-29T23:49:21.600Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and no Ported Test; only Enumerable.ts, the docs and Xaravel Test XT-collections-11 change. |
| F-2: No expected value is weakened | pass | XT-collections-11 now leaves 'reduceWithKeys(...)' out only for the Enumerable-typed receiver 'e'. That member was removed from Enumerable to match Upstream (MAINT-2026-10-29-collections-gate U2), and the ruling says the test calls it through Collection. Collection and LazyCollection still assert the async rejection. diagnosticLines is computed from the fixture lines, so the expected values stay exact; nothing is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is touched. The one dropped fixture line belongs to an Xaravel Test and is covered by the Maintainer ruling. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | pass | No adapted marker is added. The kept '// adapted:DIV-9.16' markers in XT-collections-11 are on assertions that the callback exception wins over a competing generator finally exception, which is what DIV-9.16 describes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed fixture is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-11 still checks that every new sync callback API rejects async callbacks in tsc and lint on Collection, LazyCollection and Enumerable. reduceWithKeys is no longer an Enumerable member, so leaving it out for 'e' does not reduce that claim. The bare AD-6, DIV-1.2 and DIV-9.16 citations match the body. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is in packages/collections. No stub or partial implementation of another Component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Enumerable.ts keeps eight '@​asyncRoot callback' tags (mapAsync, eachAsync, filterAsync, rejectAsync, partitionAsync, everyAsync, containsAsync, firstAsync). Each method is async only because its callback may be async, under DIV-1.2 and AD-6's callback clause. No new export is left untagged; the removed member was sync. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"f451ae7af2d8a8e620fd6b3d795505d5d6399d1d","base":"7875f2071fd896bef1ba57292f7ed99b971eb575","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-29T23:49:21.600Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and no Ported Test; only Enumerable.ts, the docs and Xaravel Test XT-collections-11 change.","findings":[]},{"id":"F-2","result":"pass","note":"XT-collections-11 now leaves `reduceWithKeys(...)` out only for the Enumerable-typed receiver `e`. That member was removed from Enumerable to match Upstream (MAINT-2026-10-29-collections-gate U2), and the ruling says the test calls it through Collection. Collection and LazyCollection still assert the async rejection. diagnosticLines is computed from the fixture lines, so the expected values stay exact; nothing is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is touched. The one dropped fixture line belongs to an Xaravel Test and is covered by the Maintainer ruling.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"pass","note":"No adapted marker is added. The kept `// adapted:DIV-9.16` markers in XT-collections-11 are on assertions that the callback exception wins over a competing generator finally exception, which is what DIV-9.16 describes.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed fixture is an error.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-11 still checks that every new sync callback API rejects async callbacks in tsc and lint on Collection, LazyCollection and Enumerable. reduceWithKeys is no longer an Enumerable member, so leaving it out for `e` does not reduce that claim. The bare AD-6, DIV-1.2 and DIV-9.16 citations match the body.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed file is in packages/collections. No stub or partial implementation of another Component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Enumerable.ts keeps eight `@asyncRoot callback` tags (mapAsync, eachAsync, filterAsync, rejectAsync, partitionAsync, everyAsync, containsAsync, firstAsync). Each method is async only because its callback may be async, under DIV-1.2 and AD-6's callback clause. No new export is left untagged; the removed member was sync.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changed.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: done

- **Change:** removed `reduceWithKeys` from the `Enumerable` interface to match Upstream (U2, `decisions/MAINT-2026-10-29-collections-gate.md`); `Collection` and `LazyCollection` keep it through `EnumeratesValues`.
- **Files:** `packages/collections/src/Enumerable.ts` (member deleted); `packages/collections/tests/xaravel/collections.test.ts` (XT-collections-11 leaves out `reduceWithKeys` for the `Enumerable` target only); `packages/collections/docs/collections.md` (open-findings paragraph: every line explained, gate at zero).
- **Review:** 9 findings; 3 low patched as one docs rewording; 3 low and 3 false rejected with reasons in the triage log; nothing deferred.
- **Follow-up review recommended:** false (patched: high 0, medium 0, low 3).
- **Verification:** `bun run api-surface:gate collections` → `0 unexplained`; full `bun run harness` → `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0` (Xaravel 487 passed, 5 skipped, 0 failed; NOT-RUN are the database, queue and redis backends); after the docs patch, `bun run harness --component collections` → `differ=0` and XT-collections-* 17/17 passed; `bun run typecheck` and `bun run lint` exit 0; Fidelity Review two passes at tree f451ae7af2d8a8e620fd6b3d795505d5d6399d1d.
- **Residual risk:** only the API-surface gate checks that `Enumerable` declares no `reduceWithKeys`.
