---
test_ids:
  - XT-conformance-101
trigger: open-question
proposed: >-
  (1) A Ported Test runs only on the Variants its Inventory `backends` name
  (AD-15: "Variants: from the Test Inventory's `backends` … The runner selects
  one with `XARAVEL_VARIANT`"). `portedTest(...)` reads `XARAVEL_VARIANT` and
  does not declare the test on a Variant outside its Test ID's `backends`, so
  it neither runs nor reports there; the harness also passes `bun test` only
  the Ported Test files that hold a Test ID of that Variant. No result that is
  graded today changes: `compare` already drops reports for a Test ID on a
  Variant it does not belong to. A report that still arrives for a non-member
  Variant becomes an `UNKNOWN` difference, so the filter cannot rot silently.
  (2) On a full run the harness removes and recreates `.cache/sqlite/` before
  every Variant run whose backend is `sqlite` (`sqlite`,
  `queue-database@sqlite`), not once per backend, so each such Variant starts
  empty (AD-17). The next Conformance Infrastructure Story takes both, before
  the first Phase 1 Ported Test lands (Story 8.7's pilot at the latest).
evidence: >-
  Every Variant run spawns `bun test` over every Ported Test file: `let files
  = allFiles` (conformance/harness/harness.ts:613), narrowed only by a
  `--story`/`--component` selection, never by Variant. Nothing under
  `packages/` reads `XARAVEL_VARIANT` (set at harness.ts:372). `compare`
  grades only the Variant's Expectations lines and ignores other known Test
  IDs' reports (conformance/harness/compare.ts:237-271), so a hang, crash or
  backend error in a test on a Variant it does not belong to costs a run and
  can fail it with no line naming why. With 13 Variants in conformance/variants
  that is up to 13 runs of the whole suite. Backend preparation is memoised
  per backend (`prepared`, harness.ts:572-576), so `prepareSqlite` resets
  `.cache/sqlite/` once, before `queue-database@sqlite`, and the `sqlite`
  Variant then starts from whatever that run and the `queue-redis@redis`,
  `redis` and `session-redis@redis` runs between them left there, since every
  run gets `XARAVEL_SQLITE_DIR` (conformance/harness/isolation.ts:508-516).
  Epic 5 retro finding H3, action item 6.
---

# ESC-5.3-4: run a Ported Test only on its own Variants, and give each SQLite Variant a fresh cache

The Epic 5 retrospective ([epic-5-retro-2026-10-19.md](../../_bmad-output/implementation-artifacts/epic-5-retro-2026-10-19.md), finding H3, action item 6) found that the harness Story 5.3 built runs every Ported Test on every Variant and throws away the results that do not belong. No Ported Test exists yet, so nothing is wrong today. The first Phase 1 ports will hit it. Two questions are for the Maintainer.

1. **Variant membership.** AD-15 says a test's Variants come from its Inventory `backends` and that the runner selects one with `XARAVEL_VARIANT`. It does not say what a test does on a Variant outside its `backends`. Today it runs there. Proposed: `portedTest` does not declare it there, and the harness passes `bun test` only the files that have a Test ID for the Variant. Grading does not change, because those results are already dropped. A stray report becomes an `UNKNOWN` difference.
2. **SQLite state between Variants.** AD-17 puts SQLite files under `.cache/`, and Story 5.5 resets `.cache/sqlite/` on a full run, but only once per backend. `sqlite` and `queue-database@sqlite` share it, and so do the Variants that run between them. Proposed: reset it before every Variant whose backend is `sqlite`.

Neither change weakens the grader or adds a divergence. Both make a run cheaper and stricter. Raised by the orchestrator for the Maintainer to rule (the retro names the Maintainer as the ruler).
