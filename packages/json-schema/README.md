# @xaravel/json-schema

Xaravel's port of Laravel's illuminate/json-schema component. Part of Xaravel, a TypeScript port of Laravel.

It ports `illuminate/json-schema` from Laravel v13.37.0.

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## Dependencies

- `@xaravel/contracts` (workspace): allowed for every package (AD-2).
- `@xaravel/runtime` (workspace): allowed for every package (AD-2).
- `ajv` 8.17.1 and `ajv-formats` 3.0.1 (devDependencies, tests only): the Ported `TypeTest` validates the schemas this package produces with `ajv` (draft 2020-12 build, `ajv/dist/2020`) where Upstream's test uses `opis/json-schema` 2.6.0, a test-only dependency no Laravel API exposes. The Oracle records Opis's verdict for every dataset row, so the harness checks row by row that `ajv` agrees ([ESC-16.1-1](../../conformance/escalations/ESC-16.1-1.md)). No runtime code imports them (NFR-2).
