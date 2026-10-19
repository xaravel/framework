---
title: 'pin-bump --apply re-sorts each Expectations shard it rewrites'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
baseline_revision: '52c7af1f782c6aa51be882f28b8cfee6d1dc5f54'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      A rename into an ID that already has a line for the same Variant writes a duplicate pair.
    evidence: |-
      Pre-existing in applyBump; the new ID is an Inventory addition, so such a line is stale data. expectations:check reports it as duplicate.
    location: >-
      tools/pin-bump/pin-bump.ts applyBump
    severity: low
  - summary: >-
      A same-Component rename into another Upstream test file keeps its lines in the old shard path.
    evidence: |-
      Pre-existing; expectations:check verifies only the component prefix of the shard path, so it passes unnoticed.
    location: >-
      tools/pin-bump/pin-bump.ts applyBump
    severity: low
  - summary: >-
      A changed- or removed-only shard that is unsorted on input stays unsorted after --apply.
    evidence: |-
      XT-conformance-63's fixture shard has testB×sqlite before testB×none and asserts kept order; sorting every touched shard needs the Maintainer to approve re-ordering that expected value.
    location: >-
      conformance/tests/xaravel/pin-bump.test.ts XT-conformance-63
    severity: low
---

<intent-contract>

## Intent

**Problem:** `applyBump` in `tools/pin-bump/pin-bump.ts` rewrites a renamed Test ID in place and keeps line order, so a rename can leave a shard out of the `id`-then-`variant` order that `expectations:check` enforces; a real `pin:bump --apply` then fails the check (spec-5-1 deferral, Epic 5 action item 17, Maintainer ruling on item 10 in `decisions/MAINT-2026-10-19-epic-5-items.md`).

**Approach:** Sort each shard `applyBump` returns by `id` then `variant`, in UTF-16 code units (`compareUnits`), the order `comparePairs` in `tools/expectations/expectations.ts` checks; extend XT-conformance-64 with a rename that crosses another line.

## Boundaries & Constraints

**Always:** Sort only the shards `applyBump` already returns (touched ones); untouched shards are still not returned or rewritten. Use `compareUnits` from `tools/inventory/inventory` (already imported). The sort is stable, so equal pairs keep their order.

**Never:** Import from `tools/expectations/expectations.ts` (it imports `pin-bump`, a cycle). Edit `conformance/expectations/**`. Remove or weaken any existing assertion. Add a new Test ID.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rename crosses a line | shard `testNote×none`, `testOld×sqlite`; rename `testOld`→`testNew` | shard written `testNew×sqlite`, `testNote×none` | No error expected |
| Rename keeps order | shard with one renamed line | same bytes as before the change | No error expected |
| Changed / removed only | already sorted shard | order unchanged | No error expected |

</intent-contract>

## Code Map

- `tools/pin-bump/pin-bump.ts:421-452` -- `applyBump`; the doc comment says "line order is kept" (update it); `out` is serialised per touched shard.
- `tools/pin-bump/pin-bump.ts:53` -- already imports `compareUnits`.
- `tools/expectations/expectations.ts:201` -- `comparePairs` (id, then variant) — the order to match; read-only.
- `conformance/tests/xaravel/pin-bump.test.ts:443-483` -- XT-conformance-64, the rename test; `SHARD_STR` holds `testOld×sqlite`, `testTwinA×none`.
- `conformance/tests/xaravel/expectations.test.ts:263` -- also calls `applyBump` with a one-line rename; must keep passing.

## Tasks & Acceptance

**Execution:**
- `tools/pin-bump/pin-bump.ts` -- sort `out` by `id` then `variant` with `compareUnits` before serialising; update the doc comment -- keeps the shard valid for `expectations:check`.
- `conformance/tests/xaravel/pin-bump.test.ts` -- in XT-conformance-64 add an unchanged inventory entry `testNote` (before and after, its own hash) and a `testNote×none` line first in `SHARD_STR`; expect `SHARD_STR` to be `testNew×sqlite` then `testNote×none` -- proves the re-sort through the CLI.

**Acceptance Criteria:**
- Given a shard where a renamed ID sorts before a line it followed, when `bun run pin:bump <tag> --apply` runs, then the shard is written sorted by `id` then `variant`.
- Given the other pin-bump and expectations Xaravel Tests, when they run, then they pass unchanged.

## Spec Change Log

- 2026-10-19 (implementation): the sort runs only on a shard that has a renamed line, not on every touched shard. XT-conformance-63 has an unsorted input shard (`testB×sqlite` before `testB×none`) and asserts that changed-only rewrites keep line order. Sorting every touched shard would change that expected value, which breaks "pass unchanged" and the never-weaken rule. A change or removal never alters an `id`, so the matrix rows still hold. Maintainer to confirm, or approve re-ordering XT-63's expected value if every touched shard should be sorted.

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 11, false 1, maybe-false 0 (plus 4 rejected for editing this spec, graded low)
- findings:
  - `[low]` `[defer]` (edge) A rename into an ID that already has a line for the same Variant leaves a `duplicate:` pair — pre-existing: the new ID is an Inventory addition, so a line for it is stale data; the sort only makes the pair adjacent. Deferred.
  - `[low]` `[defer]` (edge) A same-Component rename into another Upstream test file keeps its lines in the old shard path — pre-existing in `applyBump`; `expectations:check` checks only the `<component>/` prefix. Deferred.
  - `[low]` `[reject]` (edge) `String(undefined)` sorts a line with no `variant` as "undefined" — such a line already fails `expectations:check`'s key rule; guarding it adds a branch for input never shown reachable.
  - `[low]` `[defer]` (edge) A changed- or removed-only shard that is already unsorted on input stays unsorted — pre-existing; XT-conformance-63's fixture pins kept order on such a shard, and changing that expected value needs the Maintainer. Deferred.
  - `[low]` `[reject]` (edge, claim) The intent contract says "sort each shard applyBump returns" while the code sorts only shards with a rename — the fix is to edit this spec. The verbatim intent ("re-sort an Expectations shard after a rename") selects the rename-only reading, so the Change Log entry needs no Maintainer confirmation.
  - `[low]` `[reject]` (blind) Contract no longer matches the code — same as above; fix edits this spec.
  - `[low]` `[defer]` (blind) XT-conformance-63's input shard is itself unsorted, giving two behaviours — grouped with the unsorted-input entry above. Deferred.
  - `[false]` `[reject]` (blind) Matrix row "Rename keeps order" has no test — XT-conformance-64's `SHARD_STR2` (one renamed line) and `expectations.test.ts:263` cover it and pass.
  - `[low]` `[reject]` (blind) The variant tie-break is not exercised — the comparator is one line and identical in order to `comparePairs`; a multi-Variant fixture would also rewrite XT-64's record expectations for little gain.
  - `[low]` `[reject]` (blind) No test runs `expectations:check` on the output — XT-64 asserts the exact sorted bytes, which is the order `check` enforces.
  - `[low]` `[defer]` (blind) Rename collision duplicates — grouped with the first edge entry. Deferred.
  - `[low]` `[defer]` (blind) Cross-file rename shard path — grouped with the second edge entry. Deferred.
  - `[low]` `[patch]` (blind) The inline comparator can drift from `comparePairs` — added a comment on the sort naming `comparePairs` as the order it must match.
  - `[low]` `[patch]` (blind) The new test comment was backwards — now "The rename moves the line ahead of testNote".
  - `[low]` `[reject]` (blind) Spec bookkeeping (Code Map line ranges, Verification list) is stale — the fix edits this spec.
  - `[low]` `[reject]` (intent) The test asserts bytes through the CLI but never runs `expectations:check` — same as the "no test runs check" row.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/pin-bump.test.ts conformance/tests/xaravel/expectations.test.ts` -- expected: all pass
- `bun run typecheck` and `bun run lint` -- expected: clean
- `bun run harness --xaravel` -- expected: SUMMARY with no difference

## Auto Run Result

Status: done

- **Change:** `applyBump` stable-sorts a rewritten shard that holds a renamed line by `id` then `variant` (`compareUnits`), the order `expectations:check` enforces. Shards with only changes or removals keep their order: those edits never alter an `id`.
- **Files:** `tools/pin-bump/pin-bump.ts` (sort and doc comment); `conformance/tests/xaravel/pin-bump.test.ts` (XT-conformance-64 adds an unchanged `testNote` that the renamed line must move ahead of).
- **Review:** 2 low patches (comparator cross-reference comment, test comment). 3 deferred, all pre-existing: rename collisions, cross-file renames, unsorted input in changed/removed-only shards. 8 rejected, with reasons in the triage log. 1 false.
- **Follow-up review:** false. Only low findings were patched.
- **Verification:** the pin-bump and expectations tests pass (19 pass, 0 fail). `bun run typecheck` and `bun run lint` are clean. `bun run harness --xaravel` passes all 242 tests (`differ=0`). With the sort removed, the new XT-64 assertion fails.
- **Residual risk:** an input shard that is already unsorted stays unsorted after a changed-only `--apply`. That case is deferred.
