# Epic 16 Context: JsonSchema

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Port Laravel 13's `illuminate/json-schema` as `@xaravel/json-schema`, so App Developers build JSON Schemas with the same fluent builder as Laravel. That means `JsonSchema.object/array/string/integer/number/boolean/union/anyOf`, the type modifiers, `toArray()` / `toString()`, and `JsonSchema.fromArray()`. The serialized JSON must be byte-identical to Upstream's, and a schema must round-trip through the deserializer. This is the last Phase 1 core Component. Later, MCP Tools (and through them AI tools and validation) describe their input shapes with it.

## Stories

- Story 16.1: Schema types and serializer
- Story 16.2: Schema deserializer

## Requirements & Constraints

- **Types and serializer (16.1).**
  - These Ported Tests all pass, or carry a valid Skip Reason other than `not-ported-yet`: `TypeTest`, `StringTypeTest`, `IntegerTypeTest`, `NumberTypeTest`, `BooleanTypeTest`, `ArrayTypeTest`, `ObjectTypeTest`, `AnyOfTypeTest`, `UnionTypeTest` and `SerializerTest`. That is 235 Test IDs.
  - `TypeTest`'s two data providers expand to 93 valid and 79 invalid rows, Test IDs `#0..#n`.
- **Deserializer (16.2).** All 45 `DeserializerTest` IDs pass.
- **Xaravel Tests.**
  - XT-json-schema-1 (16.1): the fluent API serializes byte-identically to Upstream through `jsonEncode`.
  - XT-json-schema-2 (16.2): serialize, then deserialize, then serialize again gives identical output for every schema 16.1's tests build.
  - XT-json-schema-3 (16.2): the Epic-close checks.
- **Consequence row.** `tools/xt-coverage/consequences.ts` has no `json-schema` row yet, and Xaravel Tests need one. Under the consequence-rows ruling, the row is the Epic's Covers line plus AD-2 and AD-6. FR-84 has no testable-consequence list, so the row is AD-2 and AD-6. `tools/` is a Protected Path, so if the row is missing when 16.1 needs it, raise an Escalation; do not add it in the Story.
- **Epic close (in 16.2).**
  - `bun run api-surface:gate json-schema` passes with zero unexplained members. `conformance/api-surface/json-schema.jsonl` has 60 Upstream members, and no additions or exceptions are recorded yet. Run the gate in 16.1 too, because 16.1 adds most of the exports.
  - The package docs mirror Laravel's JSON Schema docs and have a Divergences section.
  - Every public API has a docblock, and `async-surface.json` is present.
  - The README records the reason for every dependency.
  - `LICENSE` keeps Laravel's MIT notice.
  - Any `blocked-by:json-schema` lines elsewhere are re-verified.
- **Story done.**
  - A full (not fast) `bun run harness --story <id>` run, then `bun run story:check <id>`.
  - Fidelity Review approval, no open Escalations, and CI green.
  - Update both the sprint-status key and the manifest `status`.

## Technical Decisions

- **Package edges.** Mirror Upstream `composer.json`: `illuminate/json-schema` requires only `illuminate/contracts`. The scaffold already declares `@xaravel/contracts` and `@xaravel/runtime`. Any other edge needs an Escalation, never an edit to another package.
- **Contract.** `Illuminate\Contracts\JsonSchema\JsonSchema` already exists in `@xaravel/contracts/json-schema`, with structural `Type`, `ObjectType`, etc. `JsonSchemaTypeFactory` implements it.
- **Sync only.** Nothing in this Component reaches an async root. Never return `T | Promise<T>`. No per-request state.
- **PHP constructs.**
  - `JsonSchema::__callStatic` becomes explicit generated static delegators to `new JsonSchemaTypeFactory()`, typed by the contract. Never use a Proxy.
  - `Type extends JsonSchema` stays.
  - `__toString` becomes `toString()` plus `[Symbol.toPrimitive]`. `toString()` is `jsonEncode(toArray(), JSON_PRETTY_PRINT)`; the runtime has `JSON_PRETTY_PRINT`.
  - `static::` becomes `this` in static methods.
  - `Closure|array` parameters accept a JS function.
- **Property and method with one name (DIV-12.2).** The method keeps the name, and the state moves behind Upstream's getters. The PORTING pair list covers `description`, `enum`, `nullable`, `required`, `title`, `default`, `format`, `pattern`, `multipleOf`, `items`, `schemas` and `types` on each Type class.
- **Serializer.** It reads Upstream's `get_object_vars($type)`, so output key order follows the declaration order of the properties. Keep Upstream's property order, `$ignore` (`required`, `nullable`) and the `RuntimeException('Unsupported [<FQCN>] type.')`, using `fqcn()` for `get_class`.
- **Enums.**
  - `enum(class-string<BackedEnum>)` takes a ported enum class, which has static instances and `cases()` and is never a TS `enum`.
  - The test fixtures `IntBackedEnum`, `StringBackedEnum` and `UnitEnum` are ported the same way.
  - A non-BackedEnum class throws `InvalidArgumentException('The provided class must be a BackedEnum.')`.
- **Value model.**
  - `null` is the only absent value.
  - Lists are `Array`, string-keyed maps are plain objects, and anything else is a `PhpArray`. Numeric-string property names must stay strings in `required` (there are tests for this).
  - Integral floats (`NumberTypeTest` `*_as_float`) carry the runtime float marker (DIV-9.4).
  - Use `jsonEncode`, never `JSON.stringify`.
- **Runtime builtins.**
  - Use `@xaravel/runtime/php` and never re-implement a builtin.
  - Upstream `src/` calls `get_object_vars`, `get_class` and `rawurldecode`, which the runtime does not appear to export (`get_class` maps to `fqcn()`).
  - List every missing builtin and construct (Deserializer included) before building, and raise them as `contract` Escalations in one round.
- **Opis validator, open point.**
  - `TypeTest`'s `produces_valid` / `produces_invalid` rows (172 IDs) validate each schema with the Upstream test dependency `opis/json-schema`.
  - No planning artifact assigns an owner or a substitute. The research deps map only suggests `ajv` as the npm equivalent.
  - Do not choose locally: raise an Escalation (`divergence` or `contract`) for those rows, and carry on with the rest.
- **Layout and identity.** Files are `src/<Upstream sub-path>/<ClassName>.ts`, for example `src/Types/StringType.ts`, one public class per file, named exports only. Each file ends with `registerClass('Illuminate\\JsonSchema\\…', X)`, and identity uses `fqcn()`. Exceptions are the runtime's SPL classes, with Upstream's messages.
- **Tests.**
  - Use only `portedTest(...)` and `@xaravel/assert`. Data providers become a `dataset`.
  - Mark each changed assertion `// adapted:DIV-<n>.<k>` with an existing clause.
  - A new or changed divergence, or a `php-only` skip, is an Escalation.
  - Never stub another Component.

## Cross-Story Dependencies

- **Scaffold state.** `packages/json-schema` currently holds:
  - `package.json`, with deps on contracts and runtime and devDeps on assert and mockery;
  - `tsconfig.json`, `README.md` and `LICENSE`;
  - `src/index.ts`, which is `export {};`;
  - empty `docs/`, `tests/ported/` and `tests/xaravel/`.

  The Expectations shards exist under `conformance/expectations/json-schema/framework/tests/JsonSchema/`, and every line is `not-ported-yet`.
- **16.2 builds on 16.1.** It needs the types and the Serializer: `JsonSchema.fromArray` calls `Deserializer.deserialize`, and XT-json-schema-2 replays 16.1's schemas. Both Stories edit `packages/json-schema`. The Epic-close gate is in 16.2.
- **Upstream Epics used as they are:** Runtime (9) and Contracts (10).
- **Later consumers.** MCP's Tool input schemas (Phase 8) use `@xaravel/json-schema`.
