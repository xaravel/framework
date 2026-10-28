---
title: 'Runtime ArrayAccess offset references'
type: feature
created: '2026-10-28'
status: done
baseline_revision: e002d3dc322de5015e23044eda459c81a331fdaa
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/decisions/MAINT-2026-10-27-story-14-6-third.md'
  - '{project-root}/conformance/escalations/ESC-14.6-7.md'
  - '{project-root}/decisions/DIV-9.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 14.6 cannot faithfully port Arr.set/push because the runtime exposes offset values but no reference to an ArrayAccess offset. Action item epic-14-item-14-runtime-arrayaccess-offset-reference supplies this prerequisite, under the Maintainer's ruling.

**Approach:** Publish a reusable synchronous offset-reference seam from both runtime entry points. It accepts an ArrayAccess object and offset, exposes a Ref-compatible value for by-reference helpers, and preserves PHP's builtin versus userland offsetGet behavior.

## Boundaries & Constraints

**Always:** Scope is packages/runtime plus this item's implementation records. Preserve existing exports and behavior. Keep object handles and PHP array value-copy semantics. Follow AD-9/10/19 and DIV-9.17. Use the pinned PHP probe in ESC-14.6-7 as evidence; new XT-runtime tests exercise the public seam. Userland offsetGet array modifications are detached and raise no notice.

**Never:** Change collections, contracts, assert, grader data, protected rules, or another component. Do not implement Arr methods here or fake collections to satisfy an acceptance test. No PHP indirect-modification notice is emitted. No unrelated runtime behavior changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Builtin nested offset | ArrayObject with x=[]; reference x, assign y=[1] through reference | Root is x={y:[1]}, caller's result is {y:[1]}, root handle preserved | None |
| Inherited offsetGet | ArrayObject subclass without override | Same write-through as builtin | None |
| Userland offsetGet | Subclass delegates offsetGet to parent; modify array offset through reference | Root x remains [], local result is {y:[1]} | No notice (DIV-9.17) |
| Other ArrayAccess | Userland implementation returns an array | Reference changes remain local; no offsetSet writeback | No notice |
| Direct root leaf | Assign x=[1] directly using offsetSet | Mutation reaches root, distinct from indirect reference semantics | Existing behavior preserved |
| Null key | Array root replacement belongs to Ref; ArrayObject null selection belongs to consumer | Offset seam handles PHP null offset without replacing root object; no Arr policy added | Existing consumer validation remains outside scope |

</intent-contract>

## Code Map

- `packages/runtime/src/php/ArrayObject.ts` — offsetGet/offsetSet and shared storage. Compare actual inherited offsetGet to builtin, never constructor name.
- `packages/runtime/src/php/arrayStorage.ts` — boxOf/boxSet storage reuse; handle wrappers correctly.
- `packages/runtime/src/php/Ref.ts` — Ref-compatible value seam; by-reference functions assign value.
- `packages/runtime/src/php/valueCopy.ts` — copies arrays, preserves objects.
- `packages/runtime/src/php/ArrayAccess.ts` — existing interface/token, no contracts dependency.
- `packages/runtime/src/php/index.ts`, `packages/runtime/src/index.ts` — public exports.
- `packages/runtime/tests/xaravel/` — xaravelTest and Assert convention; store PHP probe evidence here.
- `conformance/escalations/ESC-14.6-7.md` — read-only exact pinned reference outcomes, including Arr's root-leaf return error and null-key rejection.

## Tasks & Acceptance

**Execution:**
- [x] `_bmad-output/implementation-artifacts/pending-epic-14-item-14-runtime-arrayaccess-offset-reference.patch` — restore the saved implementation with git apply; remove this patch only when the completed change lands.
- [x] `packages/runtime/src/php/offsetReference.ts`, `packages/runtime/src/php/arrayStorage.ts` — repair captured references so unset/reinsert detaches the old slot, and follow PHP probe evidence for ordinary overwrite as well; use existing storage identity/sequence primitives where suitable.
- [x] `packages/runtime/tests/xaravel/php-offset-reference.test.ts` and its PHP probe — resolve every interrupted-review lead below with PHP-backed cases, especially detach, wrapped exchange, sibling modification, object handles and keys; evaluate ArrayIterator against the explicit ArrayObject contract without unrelated expansion.
- [x] `packages/runtime/src/php/offsetReference.ts` — implement/document reusable public offset reference using existing Ref/storage/value-copy primitives.
- [x] `packages/runtime/src/php/index.ts`, `packages/runtime/src/index.ts` — export seam and relevant type.
- [x] `packages/runtime/tests/xaravel/php-offset-reference.test.ts` and probe files — test all matrix rows at the runtime surface; preserve pinned PHP evidence. Root-leaf and null-key cases test runtime operations and document consumer-only Arr policies without importing collections.

**Acceptance Criteria:**
- Given a builtin ArrayObject or subclass retaining offsetGet, when a helper writes via the public offset reference, then the original object retains identity and its nested offset changes as in PHP.
- Given userland offsetGet returning an array, when the reference is changed, then the caller sees its local result while original storage remains unchanged, with no notice.
- Given the pinned root-leaf and null-key probe cases, when runtime operations are exercised, then leaf writes and array-root replacement preserve PHP outcomes; collections return-type validation remains for Story 14.6.
- Given existing runtime users, when verification runs, then no prior behavior or export regresses and the full harness has no differences.

## Spec Change Log

- 2026-10-28 implementation evidence: an independent PHP 8.5.11 probe found ordinary overwrite can detach captured ArrayObject references too. Removed the planning inference that overwrite must share; slot behavior follows PHP evidence. KEEP the unchanged intent contract and pinned Arr cases.

- 2026-10-28 resume: PR #510 authorizes the installed Codex/Claude reviewer destinations (tools/orchestrator/codex.md item 9) and removes the waiting gate. Resume as draft because the saved implementation still needs the recorded unset/reinsertion repair and expanded PHP evidence. Preserve the intent contract.

## Review Triage Log

### 2026-10-28 — Interrupted review

Fidelity Review was not run: automatic approval review denied the command before process creation. No retry or alternate execution was attempted. The four general layers ran in two batches. Their findings are retained below as repair leads, not as completed triage or approval; review must resume before this implementation lands.

- Blind hunter: the reference resolves a captured key after unset, recreating a missing offset; it also follows a new value reinserted under that key. PHP 8.5.11 independently confirmed the old reference instead remains detached. Edge-case hunter independently reported the reinsertion defect. Repair requires persistent slot identity, not lookup by key.
- Blind hunter: builtin ArrayIterator follows the userland branch. Check whether that builtin belongs in the authorized public seam contract before extending implementation scope.
- Blind hunter: inherited methods, wrapped storage, missing-offset creation and null-offset selection lack independent PHP probe rows beyond the original Arr probe.
- Blind hunter: nestedWrite replaces the entire offset; add existing-sibling coverage for actual nested modification.
- Blind hunter: add initial object-valued offset coverage for handle preservation, beyond later assignment.
- Blind hunter: add PHP-backed numeric-string, boolean, float and invalid-key coverage, including unchanged storage on failure.
- Blind hunter: wrapper detachment coverage creates the tested missing-offset reference from inner; obtain it through wrapper before exchanging storage.
- Verification-gap layer: no gaps filed under that layer's evidence rules.
- Intent auditor: implementation follows the runtime-prerequisite reading. Actual Arr traversal, root-leaf return TypeError and null-root InvalidArgumentException are consumer behaviors reserved for Story 14.6 by the ruling; tests here exercise the runtime operations and retain complete PHP reference output. No completed Arr implementation is claimed. The missing PHP notice remains authorized by DIV-9.17.

### 2026-10-28 — Resumed review pass
- verdicts: 16 findings — high 0, medium 2, low 9, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: public lifetime rules missing — add the direct overwrite/unset/reinsertion and original-storage exchange rules to php-values.md, matching the proven slot behavior.
  - `[low]` `[patch]` Blind: fresh replacement references lack regression coverage — add PHP-backed old/new reference writes after replacement, preventing stale-slot resurrection regressions.
  - `[low]` `[patch]` Blind: wrapper and inner simultaneous references lack coverage — add PHP-backed sharing assertions for this supported wrapper path.
  - `[low]` `[patch]` Blind: inner storage exchange lacks coverage — add PHP-backed assertions retaining the old captured box while wrappers follow the new storage.
  - `[low]` `[patch]` Blind: userland initially object-valued offset lacks coverage — add a public-seam regression for preserved object handles and local replacement.
  - `[low]` `[patch]` Blind: missing userland key invocation lacks coverage — assert one normalized-key getter call, local null and no exists/write calls.
  - `[medium]` `[patch]` Blind: invalid-key messages unverified — PHP independently says on ArrayObject (or the subclass), while the new seam propagated normalizeKey's on array; correct this seam's error context and compare exact probe messages. Leave existing offset methods unchanged.
  - `[low]` `[patch]` Blind: iterator mutation with an outstanding ArrayObject reference lacks coverage — add PHP-backed shared-storage write/delete tests, without widening the seam to ArrayIterator.
  - `[low]` `[patch]` Blind: reference writes bypass sequence helpers — existing slot insertion already registers its sequence and reference assignment changes no key; add live-cursor regression assertions to preserve that invariant.
  - `[low]` `[patch]` Blind: negative/bigint/prototype-sensitive keys lack coverage — add PHP-backed key rows and assert safe normalization.
  - `[medium]` `[patch]` Edge: undefined offset throws — reproduced Cannot access offset of type undefined on array, unlike the existing ArrayObject boundary; normalize undefined to null before either branch and test it.
  - `[false]` `[reject]` Intent: Arr probe versus runtime seam surface — the ruling explicitly makes this a runtime prerequisite; the unchanged intent reserves actual Arr traversal for Story 14.6. Runtime outcome comparisons are appropriate here.
  - `[false]` `[reject]` Intent: consumer errors appear only in PHP evidence — those errors are explicitly outside this runtime item's implementation; no Arr validation is claimed and Story 14.6 retains that responsibility.
  - `[false]` `[reject]` Intent: null offset selects empty-string slot — this is the explicit runtime-null policy; consumer whole-root selection remains outside this item, so no mismatch occurs.
  - `[false]` `[reject]` Intent: ArrayIterator takes detached branch — the Maintainer's action expressly requires builtin ArrayObject and subclasses retaining its getter; ArrayIterator native write-through is not part of that granted contract. The probe transparently records the distinction.
  - `[false]` `[reject]` Intent: matrix coverage means runtime prerequisite coverage — that is exactly the matrix's declared surface; the audit names runtime IDs and claims no completed Arr implementation.
- Verification-gap reviewer: no verification gaps found. Fidelity Review: both reviewers passed; reviewer 1 used the recorded Codex fallback because the configured Claude binary was unavailable. Runtime patches require a fresh counted review before completion.

### 2026-10-28 — Finalize Fidelity rerun
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- Both reviewers passed on the patched tree. Final status: current, two passes. Claude unavailability and the Codex fallback are recorded by the tool; no waiver or evidence-gap pass was used.

## Verification

- `bun run harness --xaravel --id 'XT-runtime-*'` — all available runtime cases match. The originally specified `--component runtime` selects no Ported Test IDs; runtime coverage is in the Xaravel suite.
- `bun run harness` — no differences; NOT-RUN backends allowed.
- `bun run typecheck` — success.
- `bun run lint` — success.
- `bun run fidelity:review review --item epic-14-item-14-runtime-arrayaccess-offset-reference --spec _bmad-output/implementation-artifacts/spec-epic-14-item-14-runtime-arrayaccess-offset-reference.md --loop-cli codex` — counted approval on current tree; run during review after other layers.
- `bun run fidelity:review status --item epic-14-item-14-runtime-arrayaccess-offset-reference --spec _bmad-output/implementation-artifacts/spec-epic-14-item-14-runtime-arrayaccess-offset-reference.md` — current before merge.

Implementation verification (2026-10-28, original saved attempt):
- Exact pinned escalation probe executed with PHP 8.5.11; output preserved in `packages/runtime/tests/xaravel/php-offset-reference.probe.txt`.
- Runtime Xaravel harness: 102 passed, 0 failed, 0 differences. After the final detached-assignment copy check, `bun run harness --xaravel --id 'XT-runtime-10*'`: 6 passed, 0 failed, 0 differences.
- `bun run typecheck`: success. `git diff --check`: success.
- Existing resolver export-inventory evidence regenerated with PHP 8.5.11 for the new non-PHP export (`offsetReference: false`); existing assertions retained.

## Auto Run Result

Status: done.

Completed resume: published synchronous `offsetReference` / `OffsetReference` from both runtime entry points. Captured ArrayObject slots share reference writes and detach on direct overwrite/unset; wrappers and storage exchange follow pinned PHP behavior. Userland getters retain local array values and preserve object handles. Undefined offsets normalize to null and invalid-key errors name the PHP target class.

Files: `offsetReference.ts` implements the seam; `arrayStorage.ts` tracks slot identity; `ArrayObject.ts` declares the existing ArrayAccess contract; both `index.ts` files export the API; `php-values.md` documents it; `php-offset-reference.test.ts` and both PHP probe pairs verify behavior; the set-functions probe pair records the added non-PHP helper export. The saved patch is deleted.

Review: 16 findings triaged (2 medium, 9 low, 5 false); all eleven patch findings fixed, none deferred. Each rejected finding and its evidence is recorded above. The final Fidelity rerun yielded two passes for the patched tree, and Finalize status prints current. Follow-up review recommendation: false; the fixed boundaries have PHP-backed regression tests and final counted review, with no specific unverified implementation risk remaining. Patched counts: high 0, medium 2, low 9.

Final verification: full harness outside sandbox exited 0, checked=21817 differ=0; 461 Xaravel tests passed, five skipped; seven unavailable backend variants NOT-RUN. Focused runtime cases: eight passed, zero differences. Typecheck, lint and diff checks passed. The matrix audit below remains valid, supplemented by XT-runtime-106's boundary cases. Story 14.6 consumer traversal and errors remain outside this runtime prerequisite.

### Original interrupted attempt (historical)

Status: blocked.

Blocking condition: permission denied: `bun run fidelity:review review --item epic-14-item-14-runtime-arrayaccess-offset-reference --spec _bmad-output/implementation-artifacts/spec-epic-14-item-14-runtime-arrayaccess-offset-reference.md --loop-cli codex`.

Automatic approval review rejected execution because the command may transmit repository code and the spec to external reviewer services without destination-specific authorization. The iteration prohibits retrying a denied action another way. The Maintainer must resolve authorization for the required reviewer destinations before this item resumes; no Fidelity verdict or waiver is claimed.

The implementation is preserved in `pending-epic-14-item-14-runtime-arrayaccess-offset-reference.patch` beside this spec and reverted from packages/runtime. Apply it only on resumption, repair the detached-slot defect and finish triage/review. The item remains in-progress and is routed to waiting_on_maintainer. Story 14.6 must not resume until this prerequisite is done. Delete the pending patch in the completion PR.

Attempted tree verification: full harness outside sandbox exited 0, checked=21817 differ=0; 459 Xaravel tests passed, five skipped. Runtime suite 102/102 and focused six tests passed; typecheck and lint passed. These results describe the saved attempt, not a completed or approved implementation.

Resume verification (2026-10-28): restored and repaired the saved implementation; 103 runtime Xaravel cases and seven focused cases passed, typecheck/lint/diff checks passed. XT-runtime-105 consumes 20 PHP-backed operation rows; the final ArrayIterator evidence row documents the explicitly excluded builtin. Pending patch removed from the completion tree. Full harness and reviews follow.

Matrix audit: builtin nested offset and inherited offsetGet run in XT-runtime-101/105; userland override and other ArrayAccess in XT-runtime-102; direct leaf and null-key prerequisites in XT-runtime-103; wrapped storage and value-copy/handle semantics in XT-runtime-104/105. All five IDs ran in the 103-case runtime harness; no matrix row is skipped.

Full resume harness outside sandbox: exit 0, checked=21817 differ=0; Xaravel tests=465 passed=460 failed=0 skipped=5; seven unavailable backend variants NOT-RUN. The first sandbox run was terminated after slow infrastructure subprocesses. Typecheck and lint passed.

## Fidelity Review

### Reviewer 1: pass at tree 33487a4d0a713fffb993c3382dcccefa5b620f5b

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `e002d3dc322de5015e23044eda459c81a331fdaa`, on 2026-10-28T18:18:59.375Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Existing expected values remain unchanged; resolver.exports adds only offsetReference:false, matching the PHP probe's function_exists check. New offset-reference expectations match the supplied probes. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change introduces no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no assertion adapted markers or Expectations adapted fields to compare with DIV clauses. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The supplied Xaravel Test bodies check their declared consequences: write-through, detached userland values, leaf/null prerequisites, wrapped storage, copying, handles and slot identity. Existing probe comparisons retain their checks. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files belong to the assigned runtime component. The reference-writing test helper implements no Collections behavior; Arr policies remain with the consumer. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source files contain no asyncRoot tags. Their implementations are synchronous and introduce neither IO roots nor callbacks allowed to be async, so no tags are required. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"33487a4d0a713fffb993c3382dcccefa5b620f5b","base":"e002d3dc322de5015e23044eda459c81a331fdaa","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-28T18:18:59.375Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Existing expected values remain unchanged; resolver.exports adds only offsetReference:false, matching the PHP probe's function_exists check. New offset-reference expectations match the supplied probes.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change introduces no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no assertion adapted markers or Expectations adapted fields to compare with DIV clauses.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle error fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"The supplied Xaravel Test bodies check their declared consequences: write-through, detached userland values, leaf/null prerequisites, wrapped storage, copying, handles and slot identity. Existing probe comparisons retain their checks.","findings":[]},{"id":"F-8","result":"pass","note":"All changed files belong to the assigned runtime component. The reference-writing test helper implements no Collections behavior; Arr policies remain with the consumer.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source files contain no asyncRoot tags. Their implementations are synchronous and introduce neither IO roots nor callbacks allowed to be async, so no tags are required.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 33487a4d0a713fffb993c3382dcccefa5b620f5b

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `e002d3dc322de5015e23044eda459c81a331fdaa`, on 2026-10-28T18:18:59.375Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared changed probe expectations with the PHP probes and existing assertions. The export expectation adds offsetReference:false; no existing expected value or comparison is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no assertion adaptation markers or Expectations adapted fields to validate. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied upon by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared the touched Xaravel Tests with their consequence strings and supplied probes. Assertions cover write-through, detached userland arrays, leaf/null prerequisites, wrapped storage, copying, handles and slot identity. Existing resolver tests retain exact probe comparisons. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared all changed paths and behavior with the action item's runtime scope. Implementation stays in runtime; the reference-writing test helper does not implement Collections behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared changed source declarations and retained tags with AD-6 and DIV-1. The new seam and touched storage methods are synchronous, perform no IO and accept no async callbacks; no async-root tag is required. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"33487a4d0a713fffb993c3382dcccefa5b620f5b","base":"e002d3dc322de5015e23044eda459c81a331fdaa","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-28T18:18:59.375Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared changed probe expectations with the PHP probes and existing assertions. The export expectation adds offsetReference:false; no existing expected value or comparison is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no assertion adaptation markers or Expectations adapted fields to validate.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied upon by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared the touched Xaravel Tests with their consequence strings and supplied probes. Assertions cover write-through, detached userland arrays, leaf/null prerequisites, wrapped storage, copying, handles and slot identity. Existing resolver tests retain exact probe comparisons.","findings":[]},{"id":"F-8","result":"pass","note":"Compared all changed paths and behavior with the action item's runtime scope. Implementation stays in runtime; the reference-writing test helper does not implement Collections behavior.","findings":[]},{"id":"F-9","result":"pass","note":"Compared changed source declarations and retained tags with AD-6 and DIV-1. The new seam and touched storage methods are synchronous, perform no IO and accept no async callbacks; no async-root tag is required.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

All eleven patch findings were applied with focused runtime verification (eight cases, zero differences). Finalize detected stale Fidelity records on the patched tree, so review_loop_iteration advances to 1 and the Fidelity layer runs again; no standing reject exists.

### Reviewer 1: pass at tree e1976a0b005d5532f228a4a6834e894295302d4f

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `e002d3dc322de5015e23044eda459c81a331fdaa`, on 2026-10-28T18:23:06.917Z. Fallback: claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared the new test expectations with the supplied PHP probes and the existing fixture diff. Exact comparisons remain exact; the export fixture only adds offsetReference:false. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no adapted assertion markers or Expectations adapted fields to compare with DIV clauses. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixtures relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared the touched Xaravel Test bodies, helpers and probe outputs with their consequence strings. They check write-through, detached userland values, copying, handles, slot boundaries and iterator visibility as declared; existing resolver checks retain their coverage. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared all changed paths and implementation bodies with the runtime component scope. The seam implements runtime reference behavior; the test helper performs a reference assignment without implementing Collections behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source files and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags, and the added seam and storage operations are synchronous without async callbacks or IO. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"e1976a0b005d5532f228a4a6834e894295302d4f","base":"e002d3dc322de5015e23044eda459c81a331fdaa","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":"claude unavailable: not installed: /nonexistent/claude-disabled-until-reset: not found","date":"2026-10-28T18:23:06.917Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the new test expectations with the supplied PHP probes and the existing fixture diff. Exact comparisons remain exact; the export fixture only adds offsetReference:false.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no adapted assertion markers or Expectations adapted fields to compare with DIV clauses.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixtures relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared the touched Xaravel Test bodies, helpers and probe outputs with their consequence strings. They check write-through, detached userland values, copying, handles, slot boundaries and iterator visibility as declared; existing resolver checks retain their coverage.","findings":[]},{"id":"F-8","result":"pass","note":"Compared all changed paths and implementation bodies with the runtime component scope. The seam implements runtime reference behavior; the test helper performs a reference assignment without implementing Collections behavior.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source files and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags, and the added seam and storage operations are synchronous without async callbacks or IO.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree e1976a0b005d5532f228a4a6834e894295302d4f

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `e002d3dc322de5015e23044eda459c81a331fdaa`, on 2026-10-28T18:23:06.917Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | The diff preserves existing expected values and exact comparisons. The resolver fixture adds only offsetReference:false, consistent with its being a runtime helper rather than a PHP global function. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no assertion adaptation markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixtures relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared all supplied touched Xaravel Tests with their consequence strings and PHP probes. Their assertions cover write-through, detached userland values, slot identity, copies, handles, null offsets and iterator boundaries; existing resolver tests retain their declared checks. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files belong to the declared runtime component. The seam implements runtime offset references; the tests leave Arr behavior to its consumer and introduce no other component implementation. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source bodies and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags and introduce no IO or async callback API requiring one. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"e1976a0b005d5532f228a4a6834e894295302d4f","base":"e002d3dc322de5015e23044eda459c81a331fdaa","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-28T18:23:06.917Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"The diff preserves existing expected values and exact comparisons. The resolver fixture adds only offsetReference:false, consistent with its being a runtime helper rather than a PHP global function.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no assertion adaptation markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixtures relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared all supplied touched Xaravel Tests with their consequence strings and PHP probes. Their assertions cover write-through, detached userland values, slot identity, copies, handles, null offsets and iterator boundaries; existing resolver tests retain their declared checks.","findings":[]},{"id":"F-8","result":"pass","note":"All changed files belong to the declared runtime component. The seam implements runtime offset references; the tests leave Arr behavior to its consumer and introduce no other component implementation.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source bodies and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags and introduce no IO or async callback API requiring one.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```
