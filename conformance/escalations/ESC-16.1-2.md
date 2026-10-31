---
test_ids:
  - "Illuminate\\Tests\\JsonSchema\\TypeTest::test_produces_valid_json_schemas#11"
  - "Illuminate\\Tests\\JsonSchema\\TypeTest::test_produces_valid_json_schemas#26"
  - "Illuminate\\Tests\\JsonSchema\\TypeTest::test_produces_invalid_json_schemas#10"
  - "Illuminate\\Tests\\JsonSchema\\TypeTest::test_produces_invalid_json_schemas#24"
trigger: contract
proposed: >-
  Option 1 (recommended): a monitor- or Maintainer-approved runtime item
  (`packages/runtime` only, under decisions/MAINT-2026-10-26-runtime-builtins.md)
  exports the PHP builtins illuminate/json-schema calls that
  `@xaravel/runtime/php` lacks, each under its PHP name and behaviour with
  XT-runtime cases against PHP's results: (a) `array_column`, with its
  `$column_key` and `$index_key` forms over lists of arrays and of objects
  (Type::enum reads the public `value` of each backed enum case); (b)
  `rawurldecode`, which Story 16.2's Deserializer calls, raised in this round
  so 16.2 does not stop on it (lessons, epic 14). Story 16.1 then ports
  `Type::enum` as `array_column(values.cases(), 'value')`. Not requested:
  `get_object_vars`, because the Serializer reads it inside a closure bound
  to the Type, and under DIV-12.2 the Types' state (`title`, `enum`,
  `required`, …) cannot live in own properties of the method names, so a
  runtime `get_object_vars` could not see it; the Story ports that read as a
  package-internal accessor that returns the Upstream properties in PHP's
  declaration order (parent class first). `get_class` is `fqcn()` (PORTING.md
  idiom table, AD-10), with `get_debug_type`'s `P@anonymous` form for the
  anonymous Type in SerializerTest. Option 2: `packages/json-schema` maps the
  cases by hand; it builds, but it is the second implementation PORTING.md's
  idiom table ("Nothing else re-implements them") forbids.
evidence: >-
  `bun run scan:builtins json-schema` on 2026-10-30 reports, not in
  @xaravel/runtime/php: `array_column`
  (framework/src/Illuminate/JsonSchema/Types/Type.php:98), `get_class`
  (Serializer.php:49), `get_object_vars` (Serializer.php:26, :113, :123),
  `rawurldecode` (Deserializer.php:588), and `date` / `strval` as strings
  only (StringTypeTest.php:44, Deserializer.php:169: no call to port;
  the callable `'strval'` in Serializer.php:83 is PHP's `(string)` conversion,
  which ports to the runtime's `toPhpString` per PORTING.md's idiom table).
  Type::enum is reached with a class string by
  TypeTest.php:176 (validSchemasProvider row #11), :194 (#26), :358
  (invalidSchemasProvider row #10) and :375 (#24); the three
  `test_throws_*` tests stop at `is_subclass_of`, which the runtime exports.
  These four rows also wait on ESC-16.1-1.
---

# ESC-16.1-2: runtime `array_column` (and `rawurldecode` for Story 16.2)

`Type::enum(StringBackedEnum::class)` collects the cases' values with `array_column`, which `@xaravel/runtime/php` does not export. Option 1 adds it to the runtime under the runtime-builtins rule, together with `rawurldecode`, the one other builtin the Component calls (in Story 16.2's Deserializer), so Epic 16 raises its builtins in one round.
