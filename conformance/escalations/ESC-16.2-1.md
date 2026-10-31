---
test_ids:
  - "XT-json-schema-2"
trigger: divergence
proposed: >-
  Option 1 (recommended): no divergence. XT-json-schema-2 keeps checking
  every schema Story 16.1's tests build against Upstream's own round trip,
  byte for byte (round-trip.probe.php, run on PHP 8.5.11 over the same
  serialized schemas), and checks the identity `serialize(fromArray(
  serialize(s))) === serialize(s)` for every schema whose Upstream round
  trip is the identity. The one schema listed below, whose round trip
  Upstream's own Deserializer changes, is checked against Upstream's bytes
  only, and the ruling states that this meets the Story's acceptance
  criterion ("any schema produced in Story 16.1's tests"), as the port
  behaves exactly as Upstream. The test fails if any other schema stops
  round-tripping without being listed here. Option 2: the port's
  Deserializer (or Serializer) diverges from Upstream so that a one-member
  union stays a union, under a new DIV clause; this breaks parity with
  Upstream's `Deserializer::resolveType`, which collapses a one-name
  `type` array to that name, and with `test_it_does_not_treat_a_single_
  type_plus_null_as_a_union`'s reasoning. Option 3: drop the one-member
  union from XT-json-schema-1's builder list, which changes a 16.1 test to
  fit the AC and is not recommended.
evidence: >-
  XT-json-schema-2 replays every schema Story 16.1's tests serialize (the
  ten Ported Test files named by stories/16.1.md, the TypeTest datasets
  included, and XT-json-schema-1's serializer.test.ts) through a capture
  preload, which records every schema the tests serialize and every Type
  the builders return, 176 distinct serialized schemas. The port's round
  trip equals Upstream's on all 176, byte for byte. For 175 the round trip
  is the identity. One is not, in Upstream as in the port:
  `{"type":["string"]}`, built by XT-json-schema-1's synchronous-builder
  check (`JsonSchema.union(["string"])` and `factory.union(["string"])`,
  packages/json-schema/tests/xaravel/serializer.test.ts). Upstream's
  `Serializer::serialize` writes a one-member `UnionType` as the type
  array `["string"]`; `Deserializer::resolveType`
  (conformance/upstream/framework/src/Illuminate/JsonSchema/Deserializer.php:333)
  filters out `null`, and when one name is left (`count($names) > 1` is
  false) takes `$names[0]`, so `fromArray` builds a `StringType` and the
  second serialization is `{"type":"string"}`. Upstream on the host's PHP
  8.5.11 gives exactly that (packages/json-schema/tests/xaravel/round-trip.probe.txt,
  the line for `{"type":["string"]}`). The Story's AC and the spec's
  XT-json-schema-2 bullet ask for identical serializations "for every
  schema 16.1's tests build"; the spec says a schema Upstream does not
  round-trip is never dropped or adapted silently but raised in one
  Escalation listing every such schema. This is that Escalation; no other
  schema is affected.
---

# ESC-16.2-1: Upstream's Deserializer does not round-trip a one-member union (XT-json-schema-2)

Of the 176 schemas Story 16.1's tests build, one, `{"type":["string"]}` (`JsonSchema.union(["string"])` in XT-json-schema-1), comes back from `fromArray` as a `StringType`, `{"type":"string"}`, in Upstream on PHP 8.5.11 and in the port alike. Option 1 accepts Upstream's behaviour and keeps XT-json-schema-2's byte-for-byte check against Upstream for it; option 2 would need a new divergence. XT-json-schema-2 implements option 1's checks and passes; the Story waits on the ruling.
