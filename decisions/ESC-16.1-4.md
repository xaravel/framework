---
decision: approved
decided_by: Maintainer
date: 2026-10-31
escalation_sha256: "65cee3277a2a23ebdb3fd124416e7b87d54e439abd64699c13379f4bfab78df7"
---

# ESC-16.1-4: approved, option 1 (the two UnionTypeTest round-trip tests move to Story 16.2)

The Maintainer approved option 1 on 2026-10-31, in the Maintainer's session, on the orchestrator's and the monitor's recommendation.

`UnionTypeTest::test_it_round_trips_a_union` and `::test_it_round_trips_a_nullable_union` call `JsonSchema::fromArray`, which is the Deserializer, Story 16.2's scope. This ruling's PR moves the two Test IDs from `stories/16.1.md` to `stories/16.2.md` (Protected). Their Expectations lines stay `not-ported-yet` until Story 16.2 ports them with `DeserializerTest`.
