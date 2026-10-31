---
title: 'Story 16.1: Schema types and serializer'
type: 'feature'
created: '2026-10-30'
status: 'blocked'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/PORTING.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-16-context.md'
  - '{project-root}/decisions/DIV-12.md'
  - '{project-root}/decisions/DIV-9.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@xaravel/json-schema` is an empty scaffold (`src/index.ts` is `export {};`), so App Developers cannot build JSON Schemas with Laravel's fluent builder, and Story 16.1's 235 Test IDs are `not-ported-yet`.

**Approach:** Port `JsonSchema`, `JsonSchemaTypeFactory`, `Serializer` and `Types/*` from `illuminate/json-schema` line for line, plus the ten Upstream test files, their enum fixtures and XT-json-schema-1. `JsonSchema.fromArray` and the Deserializer are Story 16.2.

## Boundaries & Constraints

**Always:**
- Keep Upstream's class, method and parameter names, defaults and messages byte for byte (`The provided class must be a BackedEnum.`, `Unsupported [<class>] type.`).
- Files `packages/json-schema/src/<sub-path>/<Class>.ts`, one public class each, named exports, each ending with `registerClass('Illuminate\\JsonSchema\\…', X)`; `JsonSchemaTypeFactory` implements `@xaravel/contracts/json-schema`'s `JsonSchema` token.
- `JsonSchema::__callStatic` becomes explicit static delegators (`object`, `array`, `string`, `integer`, `number`, `boolean`, `union`, `anyOf`) to `new JsonSchemaTypeFactory()`; no Proxy (AD-26).
- DIV-12.2: methods keep their names (`title()`, `enum()`, `required()`, …); state lives under non-colliding private names. Serializer reads it through a package-internal accessor returning Upstream's properties in PHP declaration order, parent first (`required, title, description, default, enum, nullable`, then the subclass's), so output key order matches `get_object_vars`.
- `toString()` is `jsonEncode(this.toArray(), JSON_PRETTY_PRINT)` (`?: ''`), `[Symbol.toPrimitive]` returns it; `get_class` is `fqcn()`, the anonymous-class message uses `get_debug_type`'s `Type@anonymous`; `'strval'` is `toPhpString`.
- Values: `null` only absent; lists are `Array`, string-keyed maps plain objects, other keys `PhpArray`; numeric-string property names stay strings in `required`; integral floats carry the DIV-9.4 marker; sync only.
- Ported Tests: `portedTest` + `@xaravel/assert`, local `TypeTest extends TestCase` keeping Upstream's helpers, providers as datasets, fixtures `IntBackedEnum`, `StringBackedEnum`, `UnitEnum` as AD-26 enum classes under `tests/ported/framework/tests/JsonSchema/Fixtures/Enums/`.

**Never:**
- No validator dependency until ESC-16.1-1 is ruled; no hand-mapped enum values until ESC-16.1-2 is ruled; no consequence ids until ESC-16.1-3 is ruled.
- No Deserializer or `fromArray` (Story 16.2), no edit outside `packages/json-schema/**`, this Story's Expectations lines and its Escalations; no `JSON.stringify`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Object with required prop | `object({age: integer().min(0).required()}).title('User')` | `toString()` keys `title, properties{age{minimum,type}}, type, required[age]` | none |
| Nullable | `string().nullable()` | `type: ['string','null']` | none |
| Unset flags | `required()->required(false)`, `nullable()->nullable(false)` | flag omitted | none |
| Union nullable | `union(['string','null'])` | `null` normalised into nullability, not duplicated | none |
| AnyOf nullable | `anyOf([...]).nullable()` | `anyOf` gains `{type:'null'}` | none |
| Numeric-string key | `object({'123': string().required()})` | `required: ['123']` (strings) | none |
| Bad enum class | `enum('NonExistentEnumClass')`, `enum(stdClass)`, `enum(UnitEnum)` | throws | `InvalidArgumentException('The provided class must be a BackedEnum.')` |
| Unknown Type | anonymous `extends Type` `.toArray()` | throws | `RuntimeException('Unsupported [Illuminate\JsonSchema\Types\Type@anonymous…')` |

</intent-contract>

## Code Map

- `conformance/upstream/framework/src/Illuminate/JsonSchema/{JsonSchema,JsonSchemaTypeFactory,Serializer}.php`, `Types/*.php` -- source to port (Type.php 132 lines, Serializer.php 129).
- `conformance/upstream/framework/tests/JsonSchema/*Test.php` (not DeserializerTest), `Fixtures/Enums/*.php` -- tests to port; TypeTest providers: valid 93 rows (:160), invalid 79 rows (:343); validator helpers :459-484.
- `packages/contracts/src/json-schema/JsonSchema.ts` -- contract token the factory implements.
- `@xaravel/runtime/php` -- `jsonEncode`, `JSON_PRETTY_PRINT`, `array_filter`, `ARRAY_FILTER_USE_BOTH`, `array_map`, `in_array`, `is_subclass_of`, `BackedEnum`, `stdClass`, `get_debug_type`, `toPhpString`, `PhpArray`, `InvalidArgumentException`, `RuntimeException`, `registerClass`, `fqcn`.
- `packages/collections/tests/ported/framework/tests/Support/SupportArrTest.test.ts` -- Ported Test shape; `packages/config/tests/xaravel/` -- `xaravelTest` shape.
- `conformance/expectations/json-schema/framework/tests/JsonSchema/*.jsonl` (not DeserializerTest) -- Expectations to update.
- PORTING.md:617-625 -- DIV-12.2 pair rows for every Type class.

## Tasks & Acceptance

**Execution:**
- `packages/json-schema/src/{JsonSchema,JsonSchemaTypeFactory,Serializer}.ts`, `src/Types/{Type,StringType,IntegerType,NumberType,BooleanType,ArrayType,ObjectType,AnyOfType,UnionType}.ts` -- port as above, docblock on every public member.
- `packages/json-schema/src/index.ts` -- named exports.
- `packages/json-schema/tests/ported/framework/tests/JsonSchema/*.test.ts` and `Fixtures/Enums/*.ts` -- the ten test files.
- `packages/json-schema/tests/xaravel/serializer.test.ts` -- XT-json-schema-1: fluent schemas serialize to Upstream's bytes through `jsonEncode`.
- Expectations lines -- `pass` for each passing ID; waiting IDs keep `not-ported-yet` with their `escalation`.

**Acceptance Criteria:**
- Given the ten test files, when `bun run harness --story 16.1` runs, then every Test ID passes with no difference, or waits on its Escalation.
- Given a fluent schema, when serialized, then the JSON equals Upstream's byte for byte (XT-json-schema-1).
- Given 16.1's new exports, when `bun run api-surface:gate json-schema` runs, then every member is matched or explained (16.2's Deserializer members excepted until 16.2).

## Spec Change Log

## Review Triage Log

## Design Notes

Three questions were raised in one round before building (lessons, epics 14 and 15), each stopping only its own Test IDs:

- **ESC-16.1-1** (`contract`): `opis/json-schema` has no AD-22 owner; 174 TypeTest IDs assert through it. Recommended: test-only `ajv` devDependency behind Upstream's helper names.
- **ESC-16.1-2** (`contract`, runtime-builtins rule): `array_column` (Type::enum), plus `rawurldecode` for 16.2. `get_object_vars` deliberately not requested (DIV-12.2, see Always).
- **ESC-16.1-3** (`protected-path`): no `json-schema` consequence row; stops XT-json-schema-1.

Under the 2026-10-30 amendment to the MAINT ruling, `contract` and `protected-path` Escalations need a second key, so the orchestrator does not rule on them. The other 61 Test IDs need none of the three, but the Story cannot close with them open, so planning halts here, as Stories 15.1 and 15.2 did.

## Verification

**Commands:**
- `bun run scan:builtins json-schema` -- run 2026-10-30: `array_column`, `get_class`, `get_object_vars`, `rawurldecode` (16.2) as calls; `date`, `strval` as strings; `isset`/`unset`.
- `bun run harness --story 16.1`, `bun run harness --xaravel --id 'XT-json-schema-*'`, `bun run api-surface:gate json-schema` -- no difference.
- `bun run typecheck`, `bun run lint`, `bun run expectations:check`, `bun run escalations:check`, `bun run divergence:check` -- clean.
- `bun run harness` (full) and `bun run story:check 16.1` -- pass once the Escalations are ruled.

## Auto Run Result

Status: blocked
Blocking condition: intent gap. ESC-16.1-1 (no owner for the Opis validator; stops 174 TypeTest IDs), ESC-16.1-2 (runtime `array_column`, and `rawurldecode` for 16.2; stops four enum dataset rows) and ESC-16.1-3 (no `json-schema` consequence row; stops XT-json-schema-1) were raised in one round. All three need a second key (MAINT-2026-10-16, amendment 2026-10-30). The plan above is complete for the other 61 Test IDs. Once the three are ruled, set this spec to `ready-for-dev` and resume at implementation.
