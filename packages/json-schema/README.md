# @xaravel/json-schema

Xaravel's port of Laravel's illuminate/json-schema component. Part of Xaravel, a TypeScript port of Laravel.

It ports `illuminate/json-schema` from Laravel v13.37.0: the fluent `JsonSchema` builder, the `Serializer` and the `Deserializer` behind `JsonSchema.fromArray`. The documentation is [docs/json-schema.md](docs/json-schema.md), with the package's Divergences.

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## Dependencies

- `@xaravel/contracts` (workspace): Upstream's `illuminate/json-schema` requires `illuminate/contracts`, and `JsonSchemaTypeFactory` implements its `Illuminate\Contracts\JsonSchema\JsonSchema` contract (AD-2.1, AD-2.2).
- `@xaravel/runtime` (workspace): PHP's value model, builtins and exceptions, and the Class Registry every class registers in (AD-2.2).
- `@xaravel/assert` and `@xaravel/mockery` (workspace devDependencies, tests only): the grader the Ported Tests and Xaravel Tests run under (AD-2.7, AD-2.8).
- `ajv` 8.17.1 and `ajv-formats` 3.0.1 (devDependencies, tests only): the Ported `TypeTest` validates the schemas this package produces with `ajv` (draft 2020-12 build, `ajv/dist/2020`) where Upstream's test uses `opis/json-schema` 2.6.0, a test-only dependency no Laravel API exposes. The Oracle records Opis's verdict for every dataset row, so the harness checks row by row that `ajv` agrees ([ESC-16.1-1](../../conformance/escalations/ESC-16.1-1.md)). No runtime code imports them (NFR-2).
