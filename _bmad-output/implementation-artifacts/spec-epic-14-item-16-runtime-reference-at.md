---
title: 'Runtime referenceAt for arbitrary PHP offset receivers'
type: feature
created: '2026-10-28'
status: done
baseline_revision: bad6cad886fddac267dd11f754d9246edc8ac3e6
review_loop_iteration: 1
followup_review_recommended: true
context:
  - decisions/ESC-14.6-9.md
  - decisions/MAINT-2026-10-28-story-14-6-fifth.md
  - AGENTS.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 14.6 cannot faithfully translate PHP offset reference acquisition after an implicit write when the receiver can be a string or scalar. The existing offsetReference accepts ArrayAccess only.

**Approach:** Export referenceAt(ref, key) from @xaravel/runtime/php for PHP 8.5.11's &$x[$k], or &$x[] when key is null. Check the whole receiver matrix against PHP and compose with existing offsetAssign and offsetReference.

## Boundaries & Constraints

**Always:** Keep PHP errors, observable partial writes, key coercion, array value copy and object handles. Null is the only absent value. Reuse runtime's shared value primitives. Omit notices/deprecations only under DIV-9.17. Follow AD-6, AD-9, AD-19, AD-23 and AD-26. Scope is packages/runtime and this item's implementation records. Record independent PHP 8.5.11 probe output.

**Never:** Change Collections, contracts, grader, expectations, divergences, architecture, PORTING.md or the item's action/owner/epic. Never implement Arr or fake another component. Existing exports and behavior remain.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Arrays | List, plain map, mixed PhpArray, existing/missing/append key | Ref to slot; missing slot becomes null; writes observable via receiver; array copies isolated, object handles shared | PHP key validation and append overflow |
| Empty scalars | null or false receiver | Becomes array before acquiring reference, including partial writes before invalid key error | PHP errors |
| Other scalars | true, int, float | Receiver preserved | PHP Error Cannot use a scalar value as an array |
| Strings | Numeric, nonnumeric, null and invalid key types | PHP reference error/offset-type precedence; earlier offsetAssign writes retained | PHP's exact Error/TypeError |
| Objects | Builtin/inherited ArrayObject, overridden/userland ArrayAccess, plain class | Delegate offsetReference with same write-through/detachment and handle semantics; ordinary object rejected | PHP errors |
| Chained writes | offsetAssign then referenceAt; ESC-14.6-9's x.0.z, x.1.z, x.y.z, x.0 | Same results, errors and retained receiver state as pinned PHP | Numeric intermediate strings cannot yield a local array Ref |

</intent-contract>

## Code Map

- `packages/runtime/src/php/offsetReference.ts`: existing ArrayAccess reference acquisition and captured target used during coercion.
- `packages/runtime/src/php/offsetAssign.ts`: arbitrary receiver assignment, null append convention and array copy helpers.
- `packages/runtime/src/php/Ref.ts`, `PhpArray.ts`, `arrayFunctions.ts`, `phpType.ts`: values, key normalization and classification; reuse rather than duplicate semantics.
- `packages/runtime/src/php/index.ts`: public export barrel.
- `packages/runtime/tests/xaravel/php-offset-assign.test.ts`, `php-offset-reference.test.ts`: existing test/probe conventions; preserve assertions.
- `conformance/escalations/ESC-14.6-9.md`: read-only pinned cases and documentary pending Collections attempt.
- `decisions/ESC-14.6-9.md`: binding approved contract, read-only.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/referenceAt.ts` and export barrel: add reusable offset reference acquisition.
- `packages/runtime/tests/xaravel/php-reference-at.probe.php` and `.probe.txt`: record PHP 8.5.11 results across matrix and chained writes.
- `packages/runtime/tests/xaravel/php-reference-at.test.ts`: public export XT-runtime cases checking recorded results, reference aliasing, copy isolation and failure state.
- `packages/runtime/docs/php-values.md`: document the public helper beside offsetAssign/reference behavior, using the existing docs location if named differently.

**Acceptance Criteria:**
- Given any matrix receiver, when acquiring and writing its reference through the public export, then results/errors/retained state match the independently executed PHP 8.5.11 probe.
- Given all existing runtime consumers, when full harness/typecheck/lint run, then there are zero differences and no regressions.
- Given the completed item, when fidelity review runs with --item epic-14-item-16-runtime-reference-at --loop-cli codex, then status is current before merge.

## Spec Change Log

### 2026-10-28 — alias preservation repair
General review reproduced lost aliases after arrayAppend, array_pop and sort, a cast losing cells, and copying a deleted slot resurrecting it. The original plan preserved cells only through offsetAssign and valueCopy, leaving existing array operations unaware. Re-derive shared reference storage and carry cells with their surviving elements through array conversions, append/pop/shift/unshift/splice, sorting/reindexing and array-returning operations. Prune deleted/truncated properties before copying, preserve independently acquired copy siblings, and copy referenced slots without recursively descending into the referenced value. KEEP all receiver/error/key/ArrayAccess cases, copy boundaries, nested-reference and overwrite/unset/reinsert/replace assertions, public exports and all previous tests. Add independent PHP evidence for the review reproducers. Attempt saved in retro-14-reference-at-attempt-1.patch; delete it when the corrected implementation completes.

## Review Triage Log

### 2026-10-28 — Review pass 1
- verdicts: 16 findings — high 4, medium 4, low 5, false 3, maybe-false 0
- findings:
  - `[high]` `[bad_spec]` Blind: append/push drop captured slots — reproduced arrayAppend leaving [2,1,9,4] after reference write; require shared propagation across mutators.
  - `[high]` `[bad_spec]` Blind: pop drops surviving references — reproduced [2,1] after reference write; preserve surviving cells.
  - `[high]` `[bad_spec]` Blind: sorting drops reference identity — reproduced sorted [1,2,9] after reference write; cells must travel with entries during reindexing.
  - `[medium]` `[bad_spec]` Blind: toPhpArray drops native cells — reproduced cast x=8 with original alias still 1; preserve copy-time cells.
  - `[medium]` `[bad_spec]` Blind: slice/filter/values rebuild entries without cells — shared entry reconstruction loses identity; cover existing array-returning paths with PHP probes.
  - `[low]` `[bad_spec]` Blind: deletion/list truncation/PhpArray coverage missing — add lifecycle cases alongside stale-cell correction.
  - `[low]` `[bad_spec]` Blind: acquiring references from copies insufficiently covered — add shared acquired cell and independent new sibling cases.
  - `[false]` `[reject]` Blind: reset/end lose captured slot writes — direct public repro gives [7,1,9] for both; copied shared cells retain alias value even if owner identity changes.
  - `[medium]` `[bad_spec]` Blind: valueCopy descends referenced slots before restoring cells — source loops recursively copy values before restoring shared cells; bypass descent for reference entries while keeping existing non-reference recursion guard.
  - `[high]` `[bad_spec]` Edge: copy resurrects deleted referenced slot — independently reproduced {y:2,x:1}; prune before copying.
  - `[medium]` `[bad_spec]` Verification: deleted slot resurrected by valueCopy — same independently reproduced defect, same shared-storage repair.
  - `[low]` `[reject]` Intent: pinned paths exercised at intermediate receiver — runtime-only prerequisite intentionally tests relevant operations; full Collections integration belongs to Story 14.6.
  - `[low]` `[reject]` Intent: representative matrix rather than Cartesian product — categories and relevant key precedence are covered; exhaustive operation combinations are unbounded, targeted lifecycle repairs added above.
  - `[false]` `[reject]` Intent: selected alias lifecycle versus full observable identity — descriptive observation, concrete omissions are already routed above; no independent bad outcome specified.
  - `[low]` `[reject]` Intent: shared primitives changed beyond helper — necessary for acquired PHP references; existing regression checks and new isolation cases verify unchanged no-reference consumers.
  - `[false]` `[reject]` Intent: source diff cannot establish landing order — orchestrator runs one prerequisite item and does not resume Collections this iteration.
- Fidelity Review: two pass verdicts on the first attempted tree; changed tree requires new review after repair.

### 2026-10-28 — Review pass 2
- verdicts: 16 findings — high 3, medium 1, low 8, false 4, maybe-false 0
- findings:
  - `[high]` `[patch]` Blind: multi-array null array_map drops nested tuple cells — reproduced PHP [[7],[[7,2]],7] versus stale port tuple; now constructs cell-bearing tuples, with pinned regression.
  - `[false]` `[reject]` Blind: foreign branded copy loses internal cells — public referenceAt normalizes foreign branded arrays to runtime storage before acquiring a cell; no public path attaches internal cells to a foreign implementation.
  - `[false]` `[reject]` Blind: PhpArray iteration scans cells quadratically — arrayCells skips native-property pruning for branded PhpArray; each call is a WeakMap lookup and constant-time brand branch.
  - `[low]` `[patch]` Blind: referenced source recursive collision coverage — added independent PHP source-reference collision rows.
  - `[low]` `[patch]` Blind: splice replacement reference coverage — added reference-preserving replacement/reindex regression.
  - `[low]` `[patch]` Blind: combine duplicate keys coverage — added a captured-source duplicate-key overwrite row.
  - `[low]` `[patch]` Blind: two keys sharing cell coverage — added shared-cell sorting/filter/removal rows.
  - `[high]` `[patch]` Blind: callback mutations read stale values — independently reproduced filter result [1,0] versus PHP [1]; entries and sort buckets now read live cell values, with callback/comparator probes.
  - `[low]` `[patch]` Blind: overflow with acquired maximum-key reference — added retained receiver/ref probe after failure.
  - `[false]` `[reject]` Blind: verification and Fidelity records stale — review snapshot preceded concurrently appended fresh verdicts; finalization refreshes records, without editing earlier immutable verdicts.
  - `[high]` `[patch]` Edge: array_combine key conversion reverts reference mutation — live entry reads after user conversion preserve the updated value; pinned object-key regression added.
  - `[medium]` `[patch]` Verification: scalar replacement detachment not verified — extended PHP evidence and assertions for both scalar replacement branches, source/ref/result before and after later reference write.
  - `[low]` `[reject]` Intent: carried pinned consumer paths observation — runtime-only prerequisite intentionally tests intermediate operations; Collections integration remains Story 14.6.
  - `[low]` `[reject]` Intent: carried representative matrix observation — category coverage plus targeted interactions, rather than unbounded Cartesian combinations.
  - `[low]` `[reject]` Intent: carried shared-primitives observation — acquired reference semantics require supporting changes; ordinary-value regression checks remain green.
  - `[false]` `[reject]` Intent: carried landing-order observation — one prerequisite unit this iteration, no Collections work.
- Patched entries by verdict: high 3, medium 1, low 5. No deferred findings.

## Design Notes

A reference denotes a captured slot, not a fresh local array value. Investigate PHP slot lifetime and repeated references, including receiver replacement and sibling writes; preserve existing offsetReference semantics. Key null uses the authorized append convention even though PHP's explicit null array key is the empty string.

## Repair Tasks

- `packages/runtime/src/php/arrayReference*.ts`, `arrayFunctions.ts`, `arrayRefFunctions.ts`, `PhpArray.ts`, `valueCopy.ts`, and other runtime array readers/writers as needed: preserve slot cells through existing transformations and distinguish deletion from overwrite.
- `packages/runtime/tests/xaravel/php-reference-at.probe.php`, `.probe.txt`, `.test.ts`: preserve all existing assertions and add append/pop/sort/cast/filter/slice/values, list truncation, PhpArray deletion, copied-reference acquisition and recursive referenced-value copy probes.
- Keep work within packages/runtime and this item's records. Do not edit grader/expectations/DIV/other components.

## Verification

- Execute the PHP probe using the pinned PHP 8.5.11 interpreter (existing Docker conventions); compare recorded output.
- `bun run harness --xaravel --id 'XT-runtime-*'`: all runtime Xaravel Tests run with zero differences; runtime has no ported Test IDs.
- `bun run typecheck` and `bun run lint`: exit zero.
- `bun run harness`: zero differences.
- `bun run fidelity:review status --item epic-14-item-16-runtime-reference-at --spec _bmad-output/implementation-artifacts/spec-epic-14-item-16-runtime-reference-at.md`: current after review.

## Implementation Verification

PHP 8.5.11 probe reproduces committed output exactly. Runtime Xaravel Tests: 115 passed, zero failures. Typecheck and lint pass. Full escalated harness: 477 Xaravel Tests (472 passed, five skipped), 21,817 comparisons, zero differences; seven unavailable backend Variants NOT-RUN. Initial sandbox run timed out XT-conformance-25/40; identical escalated run passed.

## Fidelity Review

### Reviewer 1: pass at tree eb275615c40949102b635b386f15750ffc439d21

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `bad6cad886fddac267dd11f754d9246edc8ac3e6`, on 2026-10-28T22:21:12.479Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared changed probe expectations and Xaravel assertions with the supplied PHP evidence. Comparisons remain exact; the existing export expectation only gains referenceAt:false. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertion is changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted assertion marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared the touched Xaravel Test bodies with their consequences and PHP probes. Exact recorded-row comparisons cover acquisition, ArrayAccess delegation, aliases, copies, nested references and preceding string writes; existing resolver checks retain their coverage. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and implementation responsibilities with the runtime-only scope. All changes implement runtime PHP value semantics or their documentation and tests; no other Component is implemented. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared changed source declarations and retained tags with AD-6 and DIV-1. The new helpers perform synchronous value operations, accept no async callbacks and require no asyncRoot tags; changed files retain none. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"eb275615c40949102b635b386f15750ffc439d21","base":"bad6cad886fddac267dd11f754d9246edc8ac3e6","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-28T22:21:12.479Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared changed probe expectations and Xaravel assertions with the supplied PHP evidence. Comparisons remain exact; the existing export expectation only gains referenceAt:false.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertion is changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted assertion marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared the touched Xaravel Test bodies with their consequences and PHP probes. Exact recorded-row comparisons cover acquisition, ArrayAccess delegation, aliases, copies, nested references and preceding string writes; existing resolver checks retain their coverage.","findings":[]},{"id":"F-8","result":"pass","note":"Compared changed paths and implementation responsibilities with the runtime-only scope. All changes implement runtime PHP value semantics or their documentation and tests; no other Component is implemented.","findings":[]},{"id":"F-9","result":"pass","note":"Compared changed source declarations and retained tags with AD-6 and DIV-1. The new helpers perform synchronous value operations, accept no async callbacks and require no asyncRoot tags; changed files retain none.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree eb275615c40949102b635b386f15750ffc439d21

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `bad6cad886fddac267dd11f754d9246edc8ac3e6`, on 2026-10-28T22:21:12.479Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | The diff preserves existing expected values and exact assertions. The resolver fixture only adds referenceAt:false, consistent with a helper that is not a PHP global function; new reference tests compare exact PHP probe rows. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no assertion adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. PHP probe rows recording caught errors are not Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-114 through 118 compare acquisition, ArrayAccess delegation, copying, aliases, nested references and preceding string writes with the corresponding PHP probe rows or explicit identity and copy assertions. The affected XT-runtime-83 through 85 retain checks matching their declared consequences. No consequence tokens require additional mapping. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed source, documentation and tests are within the declared runtime component. The implementation provides runtime PHP reference semantics without implementing another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source declarations and retained tag inventory contain no asyncRoot tags. The added helpers perform synchronous value and reference operations, accept no async callbacks and require no tags under AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"eb275615c40949102b635b386f15750ffc439d21","base":"bad6cad886fddac267dd11f754d9246edc8ac3e6","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-28T22:21:12.479Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"The diff preserves existing expected values and exact assertions. The resolver fixture only adds referenceAt:false, consistent with a helper that is not a PHP global function; new reference tests compare exact PHP probe rows.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no assertion adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item. PHP probe rows recording caught errors are not Oracle error fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-114 through 118 compare acquisition, ArrayAccess delegation, copying, aliases, nested references and preceding string writes with the corresponding PHP probe rows or explicit identity and copy assertions. The affected XT-runtime-83 through 85 retain checks matching their declared consequences. No consequence tokens require additional mapping.","findings":[]},{"id":"F-8","result":"pass","note":"All changed source, documentation and tests are within the declared runtime component. The implementation provides runtime PHP reference semantics without implementing another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source declarations and retained tag inventory contain no asyncRoot tags. The added helpers perform synchronous value and reference operations, accept no async callbacks and require no tags under AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 231eeff9668f32506f5b8d971f1b411733dcf56b

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `bad6cad886fddac267dd11f754d9246edc8ac3e6`, on 2026-10-28T22:30:34.460Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and changes no Ported Tests. |
| F-2: No expected value is weakened | pass | The new tests use exact comparisons against the supplied PHP probe results. The existing export expectation only adds referenceAt:false; no existing expected value or comparison is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff adds or changes no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted assertion markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The touched Xaravel Test bodies check their declared consequences through exact PHP probe comparisons and explicit checks of copying, handles, aliases, detachment, recursion and export identity. No consequence cites an FR or AD bullet token. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed paths belong to the declared runtime component. The reference cells and array-operation changes implement runtime PHP value semantics, with no implementation of another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source declarations and retained tags were compared with AD-6 and DIV-1. These files retain no asyncRoot tags, and their implementations are synchronous without IO roots or callbacks permitted to require async derivation. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"231eeff9668f32506f5b8d971f1b411733dcf56b","base":"bad6cad886fddac267dd11f754d9246edc8ac3e6","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-28T22:30:34.460Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and changes no Ported Tests.","findings":[]},{"id":"F-2","result":"pass","note":"The new tests use exact comparisons against the supplied PHP probe results. The existing export expectation only adds referenceAt:false; no existing expected value or comparison is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff adds or changes no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted assertion markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"The touched Xaravel Test bodies check their declared consequences through exact PHP probe comparisons and explicit checks of copying, handles, aliases, detachment, recursion and export identity. No consequence cites an FR or AD bullet token.","findings":[]},{"id":"F-8","result":"pass","note":"All changed paths belong to the declared runtime component. The reference cells and array-operation changes implement runtime PHP value semantics, with no implementation of another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source declarations and retained tags were compared with AD-6 and DIV-1. These files retain no asyncRoot tags, and their implementations are synchronous without IO roots or callbacks permitted to require async derivation.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 231eeff9668f32506f5b8d971f1b411733dcf56b

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `bad6cad886fddac267dd11f754d9246edc8ac3e6`, on 2026-10-28T22:30:34.460Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared the new exact assertions with the supplied PHP probe outputs and the existing fixture diff. Expected values are preserved; resolver.exports only adds referenceAt:false. |
| F-3: No assertion is removed without a DIV clause | n/a | There are no changed Ported Tests whose assertion counts require comparison with Upstream. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change introduces no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted assertion markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no relied-on Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-114 through 123 and the affected existing tests with their consequence strings. Their exact probe comparisons and additional assertions check the declared reference, copying, mutation, error and export behavior; no consequence bullet tokens are cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared all changed paths and implementations with the action item's runtime scope. The changes implement runtime PHP value behavior without adding another Component's stub or fake. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source and declaration inventory with AD-6 and DIV-1. No retained or added asyncRoot tags exist in these files, and the new helpers perform synchronous value operations with no permitted async callback or IO root. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"231eeff9668f32506f5b8d971f1b411733dcf56b","base":"bad6cad886fddac267dd11f754d9246edc8ac3e6","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-28T22:30:34.460Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the new exact assertions with the supplied PHP probe outputs and the existing fixture diff. Expected values are preserved; resolver.exports only adds referenceAt:false.","findings":[]},{"id":"F-3","result":"n/a","note":"There are no changed Ported Tests whose assertion counts require comparison with Upstream.","findings":[]},{"id":"F-4","result":"n/a","note":"The change introduces no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted assertion markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no relied-on Oracle error fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-114 through 123 and the affected existing tests with their consequence strings. Their exact probe comparisons and additional assertions check the declared reference, copying, mutation, error and export behavior; no consequence bullet tokens are cited.","findings":[]},{"id":"F-8","result":"pass","note":"Compared all changed paths and implementations with the action item's runtime scope. The changes implement runtime PHP value behavior without adding another Component's stub or fake.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source and declaration inventory with AD-6 and DIV-1. No retained or added asyncRoot tags exist in these files, and the new helpers perform synchronous value operations with no permitted async callback or IO root.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree d9af6bbbccbec4f5111ccbf55f050f349e919390

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `bad6cad886fddac267dd11f754d9246edc8ac3e6`, on 2026-10-28T22:34:57.912Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns and changes no Ported Tests; the added tests are Xaravel Tests. |
| F-2: No expected value is weakened | pass | Compared the added expectations with the supplied PHP probe output and the existing test diff. Comparisons retain exact values, exception classes and messages; the export fixture only adds referenceAt:false. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no assertion adaptation markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. The PHP probe text is independent evidence, not an Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-114 through XT-runtime-125 and the affected existing tests with their consequence strings. Their assertions check acquisition errors, delegation, copying, alias lifetime, reconstruction and live callbacks against exact probe rows. No consequence tokens require additional bullet matching. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared all changed paths with the runtime scope in the action entry. Implementation changes remain in runtime and implement shared PHP value semantics; no other Component is stubbed or partially implemented. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source bodies and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags, introduce no asynchronous methods, and perform synchronous value operations with synchronous callbacks. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"d9af6bbbccbec4f5111ccbf55f050f349e919390","base":"bad6cad886fddac267dd11f754d9246edc8ac3e6","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-28T22:34:57.912Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns and changes no Ported Tests; the added tests are Xaravel Tests.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the added expectations with the supplied PHP probe output and the existing test diff. Comparisons retain exact values, exception classes and messages; the export fixture only adds referenceAt:false.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no assertion adaptation markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item. The PHP probe text is independent evidence, not an Oracle fixture.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-114 through XT-runtime-125 and the affected existing tests with their consequence strings. Their assertions check acquisition errors, delegation, copying, alias lifetime, reconstruction and live callbacks against exact probe rows. No consequence tokens require additional bullet matching.","findings":[]},{"id":"F-8","result":"pass","note":"Compared all changed paths with the runtime scope in the action entry. Implementation changes remain in runtime and implement shared PHP value semantics; no other Component is stubbed or partially implemented.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source bodies and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags, introduce no asynchronous methods, and perform synchronous value operations with synchronous callbacks.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree d9af6bbbccbec4f5111ccbf55f050f349e919390

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `bad6cad886fddac267dd11f754d9246edc8ac3e6`, on 2026-10-28T22:34:57.912Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns and changes no Ported Tests. |
| F-2: No expected value is weakened | pass | The diff preserves existing exact comparisons and expected values. The resolver fixture only adds referenceAt:false, consistent with a helper having no PHP global-function name. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item; PHP probe rows are not Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-runtime-114 through XT-runtime-125 check their declared consequences against the supplied probe rows. Full comparison of the indirectly touched XT-runtime-83 through XT-runtime-85 is unavailable because their probe data and source are omitted. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed implementation files belong to the declared runtime Component. Array cells and reference acquisition implement runtime PHP semantics without adding another Component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source files retain no @​asyncRoot tags. Their listed declarations and implementations are synchronous value operations with synchronous PHP callbacks, consistent with AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-set-functions.probe.php`: Supply the omitted probe source and php-set-functions.probe.txt outputs selected by XT-runtime-83 through XT-runtime-85. Their bodies delegate substantial claimed behavior to these records, whose unchanged portions are unavailable for comparison. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"d9af6bbbccbec4f5111ccbf55f050f349e919390","base":"bad6cad886fddac267dd11f754d9246edc8ac3e6","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-28T22:34:57.912Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns and changes no Ported Tests.","findings":[]},{"id":"F-2","result":"pass","note":"The diff preserves existing exact comparisons and expected values. The resolver fixture only adds referenceAt:false, consistent with a helper having no PHP global-function name.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item; PHP probe rows are not Oracle error fixtures.","findings":[]},{"id":"F-7","result":"fail","note":"XT-runtime-114 through XT-runtime-125 check their declared consequences against the supplied probe rows. Full comparison of the indirectly touched XT-runtime-83 through XT-runtime-85 is unavailable because their probe data and source are omitted.","findings":[{"path":"packages/runtime/tests/xaravel/php-set-functions.probe.php","detail":"Supply the omitted probe source and php-set-functions.probe.txt outputs selected by XT-runtime-83 through XT-runtime-85. Their bodies delegate substantial claimed behavior to these records, whose unchanged portions are unavailable for comparison.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"All changed implementation files belong to the declared runtime Component. Array cells and reference acquisition implement runtime PHP semantics without adding another Component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source files retain no @asyncRoot tags. Their listed declarations and implementations are synchronous value operations with synchronous PHP callbacks, consistent with AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: done.

Implemented public referenceAt for every approved receiver category and its composition with offsetAssign/offsetReference. Shared runtime reference cells preserve aliases through copying, conversions, mutation, sorting and retained-entry array operations, including callback/key-coercion mutations.

Files: referenceAt.ts dispatches acquisition; arrayReference.ts/arrayReferenceCells.ts own captured cells and entry metadata; PhpArray.ts, casts.ts and valueCopy.ts preserve identity and copy boundaries; arrayFunctions.ts/arrayRefFunctions.ts and offsetAssign.ts propagate surviving cells; offsetReference.ts shares coercion targets; public barrels export the helper; php-values.md documents behavior. PHP probe source/output and XT-runtime-114..125 verify receiver/errors, retained writes, alias lifetime, transformations and callback liveness. Existing export inventory gains only referenceAt:false. Sprint status records this item done using SPS.

Review: all four general layers ran twice. Pass 1 routed shared-storage defects through one spec repair loop; pass 2 patched three high, one medium and five low findings. No findings deferred. Rejections and their individual evidence are recorded above. Earlier Fidelity verdicts remain immutable; final status is current at tree d9af6bbbccbec4f5111ccbf55f050f349e919390: reviewer 1 passes, reviewer 2's sole F-7 missing-evidence finding counts under MAINT-2026-10-24-evidence-gaps and is routed to the Maintainer inbox. Claude was unavailable at the configured path, so reviewer 1 records the Codex fallback.

Final verification: exact PHP 8.5.11 probe reproduction; full harness exit 0, 21,817 comparisons with zero differences, 484 Xaravel Tests (479 passed, five skipped), seven unavailable backend Variants NOT-RUN; typecheck, lint and diff whitespace checks pass. Initial sandbox infrastructure timeouts were resolved by the identical escalated harness. Final sandbox PHP comparison stalled and was stopped after three minutes; the identical verification command passed escalated.

Follow-up review recommended: true (three high patched entries). Specific residual verification risk: callback-driven reference changes under additional comparison flags and combinations beyond the pinned comparator/coercion probes; no known failing case remains. Story 14.6 integration is the next unit, not part of this runtime prerequisite.
