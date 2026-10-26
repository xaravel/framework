# @xaravel/reflection

Xaravel's port of Laravel's illuminate/reflection component. Part of Xaravel, a TypeScript port of Laravel.

It ports `illuminate/reflection` from Laravel v13.37.0.

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## Documentation

See [docs/reflection.md](docs/reflection.md) for `Reflector` and `ReflectsClosures`, how they read declared types from `inject` and `returns` metadata, and the Divergences from Laravel. `Reflector.isParameterSubclassOf` resolves interface hints through the contract tokens `contract(...)` records, and `Reflector.isParameterBackedEnumWithStringBackingType` reads an AD-26 enum's `static backingType` through `ReflectionEnum`.

```ts
import { Reflector } from "@xaravel/reflection";
import { inject } from "@xaravel/runtime";
import { ReflectionFunction } from "@xaravel/runtime/php";

const listener = inject({ event: OrderShipped }, (event: OrderShipped) => {});

Reflector.getParameterClassName(new ReflectionFunction(listener).getParameters()[0]); // fqcn(OrderShipped)
```

## Dependencies

- `@xaravel/collections` (workspace): Upstream `composer.json` `require` (AD-2).
- `@xaravel/contracts` (workspace): allowed for every package (AD-2).
- `@xaravel/runtime` (workspace): allowed for every package (AD-2).
