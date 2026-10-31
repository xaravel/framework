---
test_ids:
  - XT-json-schema-1
trigger: protected-path
proposed: >-
  Option 1 (recommended): conformance/api-surface/additions.jsonl gains eight
  lines, one for each static delegator AD-26 puts on
  `Illuminate\JsonSchema\JsonSchema` in place of `__callStatic`
  (`object`, `anyOf`, `integer`, `number`, `string`, `boolean`, `array`,
  `union`), each `{"component":"json-schema","fqcn":"Illuminate\\JsonSchema\\JsonSchema","member":"<name>","citation":"<id>"}`
  with the citation the ruling names (this Escalation's id, or a new DIV-12
  clause for `__callStatic` forwarding, which DIV-12.10 covers only for
  Macroable). Option 2: the gate learns AD-26's `__callStatic` row and
  matches the delegators to the class's `@method static` docblock, an
  Infrastructure change to tools/api-surface; Upstream's surface export
  records no `@method` lines today, so it would need that export too.
evidence: >-
  `bun run api-surface:gate json-schema` on story/16.1 reports
  `extra method Illuminate\JsonSchema\JsonSchema::object` and the same for
  `anyOf`, `integer`, `number`, `string`, `boolean`, `array` and `union`
  (8 items), besides the Deserializer and `fromArray`, which are Story 16.2's.
  Upstream declares them only as `@method static` tags on JsonSchema
  (conformance/upstream/framework/src/Illuminate/JsonSchema/JsonSchema.php:8-17)
  and resolves them through `__callStatic`; AD-26 (PORTING.md § Construct
  mapping, `__call` / `__callStatic` forwarding) makes them explicit
  delegating methods, and the 16.1 spec requires exactly these eight.
  conformance/api-surface/additions.jsonl is Protected (`/conformance/`), and
  every addition there cites a ruling or clause.
---

# ESC-16.1-6: the API-surface gate needs additions for JsonSchema's eight static delegators

AD-26 turns `JsonSchema::__callStatic` into eight explicit static methods, which the API-surface gate reports as extra because Upstream lists them only in a docblock. Option 1 records them in the Protected `additions.jsonl`; until a ruling the gate reports those 8 items.
