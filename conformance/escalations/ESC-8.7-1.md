---
test_ids:
  - XT-conformance-166
  - XT-conformance-167
trigger: open-question
proposed: >-
  The Maintainer rules on the three questions below. Recommended: (1) the
  pilot translations type-check against declaration-only `.d.ts` files for
  `Collection`, `LazyCollection`, `Arr`, `Str` and `Stringable`, kept only
  on the unmerged `pilot/porting` branch and generated from
  `conformance/api-surface/{collections,support}.jsonl`; this is not a stub
  under F-8 because no graded test runs against it and none of it reaches
  `main`. (2) "Meets the assertion floor" is checked statically for the
  pilot: for every sampled Test ID, each assertion kind the Inventory
  records appears at least as often among the translation's assertion call
  sites, with an `adapted:DIV-<n>.<k>` marker on any shortfall. The executed
  floor is checked when Epics 14 and 18 port these tests for real. (3) The
  Fidelity Review of the pilot waits for ESC-8.5-1. Once the reviewer Apps
  exist, it runs on a `story/8.7` PR that carries the translations for review
  only and is closed unmerged. Until then Story 8.7 stays blocked.
  The sample is stratified: all 4 Mockery rows, then `sampleIds` from
  `conformance/harness/select.ts` per file and data-provider stratum, at
  least 60 IDs in all.
evidence: >-
  Story 8.7's first criterion (epics.md, Story 8.7) asks that the pilot
  translations type-check, meet the assertion floor against the Inventory,
  and pass a Fidelity Review. In Phase 0 none of the three can be met as
  written. `packages/collections/src/index.ts` and
  `packages/support/src/index.ts` contain only `export {};`, and
  `conformance/api-surface/*.jsonl` holds Upstream member records, not
  declarations. A translation that imports `Collection` fails `tsc` unless
  someone writes declarations for another Component, which AGENTS.md and
  `conformance/review/fidelity.md` F-8 forbid as a stub. The floor is
  measured only at run time (`conformance/harness/compare.ts:19-33`, the
  executed AssertionCounter), so it needs the implementation, and no static
  counter exists. The Fidelity Review tool refuses a head that is not
  `story/<id>` (`tools/fidelity-review/fidelity-review.ts:41`), reads the
  sample from the manifest's `test_ids`, which are empty for Story 8.7, and
  posts nothing until ESC-8.5-1's Apps, `fidelity` environment and API key
  exist. ESC-8.5-1 names this pilot as the first supervised run.
---

# ESC-8.7-1: what "type-check", "assertion floor" and "Fidelity Review" mean for a Phase 0 pilot

Covers FR-8.2, Story 8.7, XT-conformance-166 and XT-conformance-167.

The pilot translates at least 60 Upstream tests from `SupportCollectionTest`, `SupportArrTest`, `SupportStrTest` and `SupportStringableTest` before `@xaravel/collections` and `@xaravel/support` exist (Epics 14 and 18). The criterion reads as if those packages existed. Each check has at least two defensible readings, and they lead to different work. Choosing between them is not the orchestrator's call: two of the readings touch the no-stub rule, and one depends on ESC-8.5-1.

## Questions

1. **Type-check.** Against what? (a) Declaration-only `.d.ts` files on the unmerged `pilot/porting` branch, generated from the API surface (recommended). (b) Nothing: the pilot is checked only by its own syntax (`tsc --noResolve`-style). (c) Defer the pilot until Epics 14 and 18 land, which reorders the Phase 0 exit (Story 8.8 needs the pilot report).
2. **Assertion floor.** Against what? (a) A static count of assertion call sites per kind against the Inventory's executed counts (recommended; loops and data-provider rows make this approximate, and the report lists every case where it is). (b) The executed floor, which requires the implementation and so the same deferral as 1(c).
3. **Fidelity Review.** It cannot run until ESC-8.5-1 is ruled and the Apps exist. Should the pilot (a) wait for it (recommended), or (b) use a recorded review by two independent agent passes against `conformance/review/fidelity.md`, reported in `docs/porting/pilot-report.md`, as a stand-in?

## Pool, for reference

From `conformance/inventory/collections.jsonl` and `support.jsonl`: SupportCollectionTest has 780 Test IDs (744 data-provider rows), SupportArrTest 87, SupportStrTest 268 (149 provider rows), and SupportStringableTest 140. Only 4 rows use Mockery (`testToArrayCallsToArrayOnEachItemInCollection#0/#1` and `testJsonSerializeCallsToArrayOrJsonSerializeOnEachItemInCollection#0/#1`), so a plain seeded sample of 60 would almost certainly miss them. The sample has to be stratified, as the proposal says.

## Ambiguities in `PORTING.md` already found

These go in the pilot report once the pilot runs:

- No rule for turning a `#[DataProvider]` method into the `dataset` option (`PORTING.md` line 70 gives only the shape).
- No Mockery rule at all.
