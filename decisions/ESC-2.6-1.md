---
decision: approved
decided_by: Maintainer
date: 2026-10-17
escalation_sha256: e95a8ef21af7205d1eab6e0c3129a3e5bc1610751872242e20dfc177ef3ba1c6
---

# ESC-2.6-1: approved, option 1 (findings file with a pinned floor)

The Maintainer approved option 1 in the Maintainer's session on 2026-10-17, in these words: "Option 1 approved."

Upstream tests whose assertion multiset differs between the two baseline attempts are listed in a committed findings file, `conformance/inventory/oracle-nondeterminism.jsonl` (id, variant, both attempts, and the multiset to record). For a listed test, `merge` records the file's pinned multiset: the lowest count Upstream can produce. For `DatabaseEloquentModelAttributeCastingTest::testAttributesByDefaultDontCacheBooleans`, that is `{"assertIsBool":2}`. `merge` still fails on any difference that is not listed.

Rationale:

- **The Oracle stays faithful.** Upstream runs exactly as Upstream runs. Nothing is seeded, so a test that is random in Laravel is random in the baseline (option 2 rejected).
- **The grader keeps its floor.** The FR-113 check still applies to these tests, at a value every faithful run can meet (option 3, no floor, rejected).
- **New non-determinism still surfaces.** Only the listed findings get a pinned value, and any other difference still fails the baseline.
