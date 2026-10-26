# @xaravel/collections

Xaravel's port of Laravel's illuminate/collections component. Part of Xaravel, a TypeScript port of Laravel.

It ports `illuminate/collections` from Laravel v13.37.0.

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## Documentation

See [docs/collections.md](docs/collections.md) for `Collection`, `LazyCollection`, `Arr` and the helpers, and for the Divergences from Laravel.

```ts
import { collect, LazyCollection } from "@xaravel/collections";

collect({ name: "taylor" }).get("name"); // "taylor"
LazyCollection.range(1, 3).all(); // [1, 2, 3]
```

## Dependencies

- `@xaravel/conditionable` (workspace): Upstream `composer.json` `require` (AD-2).
- `@xaravel/contracts` (workspace): allowed for every package (AD-2).
- `@xaravel/macroable` (workspace): Upstream `composer.json` `require` (AD-2).
- `@xaravel/runtime` (workspace): allowed for every package (AD-2).
- `@xaravel/http` (optional peer): Upstream `composer.json` `suggest`, reached only by token, alias or guarded `import()` (AD-2).
