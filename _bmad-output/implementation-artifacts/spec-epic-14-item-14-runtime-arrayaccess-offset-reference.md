---
title: 'Runtime ArrayAccess offset references'
type: feature
created: '2026-10-28'
status: blocked
baseline_revision: a9495b72c38a173e8de94523f6beea38c71a6d97
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/decisions/MAINT-2026-10-27-story-14-6-third.md'
  - '{project-root}/conformance/escalations/ESC-14.6-7.md'
  - '{project-root}/decisions/DIV-9.md'
warnings: []
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
- [x] `packages/runtime/src/php/offsetReference.ts` — implement/document reusable public offset reference using existing Ref/storage/value-copy primitives.
- [x] `packages/runtime/src/php/index.ts`, `packages/runtime/src/index.ts` — export seam and relevant type.
- [x] `packages/runtime/tests/xaravel/php-offset-reference.test.ts` and probe files — test all matrix rows at the runtime surface; preserve pinned PHP evidence. Root-leaf and null-key cases test runtime operations and document consumer-only Arr policies without importing collections.

**Acceptance Criteria:**
- Given a builtin ArrayObject or subclass retaining offsetGet, when a helper writes via the public offset reference, then the original object retains identity and its nested offset changes as in PHP.
- Given userland offsetGet returning an array, when the reference is changed, then the caller sees its local result while original storage remains unchanged, with no notice.
- Given the pinned root-leaf and null-key probe cases, when runtime operations are exercised, then leaf writes and array-root replacement preserve PHP outcomes; collections return-type validation remains for Story 14.6.
- Given existing runtime users, when verification runs, then no prior behavior or export regresses and the full harness has no differences.

## Spec Change Log

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

## Verification

- `bun run harness --xaravel --id 'XT-runtime-*'` — all available runtime cases match. The originally specified `--component runtime` selects no Ported Test IDs; runtime coverage is in the Xaravel suite.
- `bun run harness` — no differences; NOT-RUN backends allowed.
- `bun run typecheck` — success.
- `bun run lint` — success.
- `bun run fidelity:review review --item epic-14-item-14-runtime-arrayaccess-offset-reference --spec _bmad-output/implementation-artifacts/spec-epic-14-item-14-runtime-arrayaccess-offset-reference.md --loop-cli codex` — counted approval on current tree; run during review after other layers.
- `bun run fidelity:review status --item epic-14-item-14-runtime-arrayaccess-offset-reference --spec _bmad-output/implementation-artifacts/spec-epic-14-item-14-runtime-arrayaccess-offset-reference.md` — current before merge.

Implementation verification (2026-10-28):
- Exact pinned escalation probe executed with PHP 8.5.11; output preserved in `packages/runtime/tests/xaravel/php-offset-reference.probe.txt`.
- Runtime Xaravel harness: 102 passed, 0 failed, 0 differences. After the final detached-assignment copy check, `bun run harness --xaravel --id 'XT-runtime-10*'`: 6 passed, 0 failed, 0 differences.
- `bun run typecheck`: success. `git diff --check`: success.
- Existing resolver export-inventory evidence regenerated with PHP 8.5.11 for the new non-PHP export (`offsetReference: false`); existing assertions retained.

## Auto Run Result

Status: blocked.

Blocking condition: permission denied: `bun run fidelity:review review --item epic-14-item-14-runtime-arrayaccess-offset-reference --spec _bmad-output/implementation-artifacts/spec-epic-14-item-14-runtime-arrayaccess-offset-reference.md --loop-cli codex`.

Automatic approval review rejected execution because the command may transmit repository code and the spec to external reviewer services without destination-specific authorization. The iteration prohibits retrying a denied action another way. The Maintainer must resolve authorization for the required reviewer destinations before this item resumes; no Fidelity verdict or waiver is claimed.

The implementation is preserved in `pending-epic-14-item-14-runtime-arrayaccess-offset-reference.patch` beside this spec and reverted from packages/runtime. Apply it only on resumption, repair the detached-slot defect and finish triage/review. The item remains in-progress and is routed to waiting_on_maintainer. Story 14.6 must not resume until this prerequisite is done. Delete the pending patch in the completion PR.

Attempted tree verification: full harness outside sandbox exited 0, checked=21817 differ=0; 459 Xaravel tests passed, five skipped. Runtime suite 102/102 and focused six tests passed; typecheck and lint passed. These results describe the saved attempt, not a completed or approved implementation.
