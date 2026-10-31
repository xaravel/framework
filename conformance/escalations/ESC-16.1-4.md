---
test_ids:
  - "Illuminate\\Tests\\JsonSchema\\UnionTypeTest::test_it_round_trips_a_nullable_union"
  - "Illuminate\\Tests\\JsonSchema\\UnionTypeTest::test_it_round_trips_a_union"
trigger: protected-path
proposed: >-
  Option 1 (recommended): an Infrastructure change moves the two Test IDs from
  stories/16.1.md to stories/16.2.md, whose Story ports
  `JsonSchema::fromArray` and the Deserializer, and Story 16.2 ports them with
  DeserializerTest. Their Expectations lines stay `not-ported-yet` until then.
  Option 2: Story 16.1 also ports `JsonSchema::fromArray` and
  `Deserializer::deserialize`, which the 16.1 spec and epic-16-context assign
  to Story 16.2 ("No Deserializer or `fromArray` (Story 16.2)"), so that
  ruling would change Story 16.2's scope.
evidence: >-
  conformance/upstream/framework/tests/JsonSchema/UnionTypeTest.php:85-94
  (`test_it_round_trips_a_union`) and :96-104
  (`test_it_round_trips_a_nullable_union`) each call
  `JsonSchema::fromArray($schema)`, which returns
  `Deserializer::deserialize($schema)` (src/Illuminate/JsonSchema/JsonSchema.php
  :20-30). stories/16.1.md lists both Test IDs through the
  `UnionTypeTest.php::*` selector, while
  _bmad-output/implementation-artifacts/spec-16-1-schema-types-and-serializer.md
  (Boundaries, Never) and epic-16-context.md (Stories, Deserializer) put
  `fromArray` and the Deserializer in Story 16.2. A Story never stubs or
  partially implements work to pass a test, and `stories/` is a Protected
  Path, so Story 16.1 cannot move them itself. Story 16.1's other 233 Test
  IDs do not depend on this ruling.
---

# ESC-16.1-4: two UnionTypeTest IDs need `JsonSchema::fromArray`, which is Story 16.2's

`UnionTypeTest`'s two round-trip tests build their type with `JsonSchema::fromArray`, the Deserializer entry point that the 16.1 spec reserves for Story 16.2. Option 1 moves the two Test IDs to Story 16.2's manifest; until a ruling, they stay `not-ported-yet` in Story 16.1.
