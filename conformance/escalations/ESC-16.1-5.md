---
test_ids:
  - "Illuminate\\Tests\\JsonSchema\\TypeTest::test_produces_valid_json_schemas#37"
trigger: divergence
proposed: >-
  Option 1 (recommended): the Ported TypeTest's `makeValidator` builds ajv
  with its documented `multipleOfPrecision` option, so ajv decides
  `multipleOf` on a rounded quotient and accepts the row as Opis does,
  and the row passes unchanged; the ruling states
  that this validator setting is no adaptation of the row (ESC-16.1-1 gives
  no rule for validator options) and which precision to use (for example
  `multipleOfPrecision: 12`). Option 2: a new DIV clause records that ajv's
  `multipleOf` is exact IEEE-754 division, and the row is recorded
  `fail-known` (or skipped as `intentional-divergence`) under it. Until a
  ruling, the row is recorded `fail-known` with this Escalation, ported as
  Upstream wrote it.
evidence: >-
  Row #37 of `validSchemasProvider`
  (conformance/upstream/framework/tests/JsonSchema/TypeTest.php:207) is
  `[JsonSchema::number()->multipleOf(0.1), 0.3]`, asserted valid through
  `assertValidOnJsonSchema`. The Oracle's Opis 2.6.0 verdict is valid
  (conformance/inventory: `oracle: {"none": "pass"}` for
  `TypeTest::test_produces_valid_json_schemas#37`). ajv 8.17.1
  (`ajv/dist/2020`, as decisions/ESC-16.1-1.md rules) reports invalid,
  "must be multiple of 0.1", because it checks that `0.3 / 0.1` is an
  integer and IEEE-754 gives 2.9999999999999996. It is the only one of the
  172 dataset rows where the two validators disagree: a run of the Ported
  TypeTest passes the other 92 valid and all 79 invalid rows. The serialized
  schema is Upstream's (`{"multipleOf": 0.1, "type": "number"}`), so the
  difference is the validator's alone. decisions/ESC-16.1-1.md: "A row where
  they disagree is not adapted: it raises its own Escalation naming the row
  and both verdicts." Blast radius of option 1: with `makeValidator` set to
  `new Ajv2020({ strict: false, multipleOfPrecision: 12 })`, a run of the
  Ported TypeTest passes all 172 dataset rows (93 valid, 79 invalid) and its
  9 other tests, so every row then matches the Oracle's Opis verdict (all
  172 are `pass` in conformance/inventory); no row flips, row #37 included,
  and no invalid row becomes valid (the invalid `multipleOf` rows #18, #19,
  #32 and #33, for example `multipleOf(0.5)` with `1.3`, stay invalid). The
  port's other validator settings, which this ruling should cover too:
  `makeValidator` builds ajv with `strict: false`, because ajv's strict mode
  is a lint of the schema itself (it warns, for example, on the union type
  `["string", "null"]` that Upstream emits for a nullable type), which Opis
  does not run; it changes no data verdict in the 172 rows. And the helpers
  pass the data, and the decoded schema, through `validatorValue`, which
  unwraps the runtime's float marker (`float(0)`, DIV-9.4, the port's form
  of Upstream's integral float literals such as `0.0`) to its number,
  because the marker is a `Number` object that ajv would read as a JSON
  object, while Opis reads a PHP float as a number.
---

# ESC-16.1-5: ajv and Opis disagree on `multipleOf(0.1)` for `0.3` (TypeTest valid row #37)

Opis accepts `0.3` as a multiple of `0.1`; ajv divides exactly in IEEE-754 floats and rejects it. This is the only row of the 172 where the two validators disagree. Option 1 sets ajv's `multipleOfPrecision` in `makeValidator`; option 2 records the difference under a new DIV clause. The row is `fail-known` until a ruling.
