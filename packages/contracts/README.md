# @xaravel/contracts

Xaravel's port of Laravel's illuminate/contracts component. Part of Xaravel, a TypeScript port of Laravel.

It ports `illuminate/contracts` from Laravel v13.37.0.

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## Usage

A contract is a TypeScript interface plus a runtime token of the same name, made with `contract()`. The token's `brand` is `Symbol.for('<FQCN>')`, and the interface requires it, so a class that `implements` the contract without the brand getter does not compile:

```ts
import { contract } from "@xaravel/contracts";

declare const BillingBrand: unique symbol;
export interface Billing {
  readonly [Billing.brand]: true;
  charge(amount: number): void;
}
export const Billing = contract<Billing, typeof BillingBrand>("App\\Contracts\\Billing", { charge: ["amount"] });

class StripeBilling implements Billing {
  get [Billing.brand]() {
    return true as const;
  }

  charge(amount: number): void {}
}

new StripeBilling() instanceof Billing; // true
```

The token carries its method names at `Symbol.for('xaravel.contract.methods')` and their parameter names at `Symbol.for('xaravel.contract.parameters')`, which test doubles read.

A third argument lists the contract tokens it extends, for example `contract<NotFoundExceptionInterface, typeof NotFoundExceptionInterfaceBrand>("Psr\\Container\\NotFoundExceptionInterface", {}, [ContainerExceptionInterface])`. The token keeps them at `Symbol.for('xaravel.contract.parents')`, so a test double of the contract is also an instance of each parent; an implementing class still carries every brand in its chain itself.

A fourth argument holds Upstream's interface constants, kept as frozen properties of the token (`Filesystem.VISIBILITY_PUBLIC === "public"`; a static interface method is an exported `<X>Static` interface instead), and a fifth lists the PHP names of the methods of built-in parents such as `Countable` or `IteratorAggregate` (`["count"]`), kept at `Symbol.for('xaravel.contract.builtins')` so test doubles can configure them.

`Pipeline` (`@xaravel/contracts/pipeline`) is a declared thenable: it keeps Upstream's `then(destination)` and also declares the `PromiseLike` form (ESC-10.2-2), and `@xaravel/contracts/events` exports the type `ShouldBeDiscoveredStatic`, the static side of `ShouldBeDiscovered`.

`@xaravel/contracts/psr` exports the PSR interfaces and their tokens: `ContainerInterface`, `ContainerExceptionInterface` and `NotFoundExceptionInterface` (psr/container), `LoggerInterface` and `LoggerAwareInterface` (psr/log), and `CacheInterface`, `CacheException` and `InvalidArgumentException` (psr/simple-cache), plus the structural `DateInterval` type.

The core and service contracts are at `@xaravel/contracts/<namespace>`, one subpath per `Illuminate\Contracts` namespace: `support`, `container`, `config`, `foundation`, `pipeline`, `events`, `bus`, `queue`, `cache`, `redis`, `encryption`, `hashing`, `filesystem`, `process`, `translation`, `validation`, `debug`, `concurrency` and `json-schema` (for example `import { Repository } from "@xaravel/contracts/cache"`). A concrete class a contract names (`Request`, `Collection`, `Batch`, …) is a structural interface in `src/structural/`, re-exported as a type by each subpath that names it.

The web and application contracts are at `auth`, `auth/access`, `auth/middleware`, `broadcasting`, `console`, `cookie`, `database`, `database/eloquent`, `database/events`, `database/query`, `http`, `image`, `log`, `mail`, `notifications`, `pagination`, `routing`, `session`, `session/middleware` and `view` (for example `import { Guard } from "@xaravel/contracts/auth"`). A nested namespace is its own subpath, which its parent's does not re-export. `@xaravel/contracts/database` also exports the class `ModelIdentifier`, `@xaravel/contracts/view` the exception `ViewCompilationException`, and `@xaravel/contracts/database/eloquent` the type `CastableStatic`, the static side of `Castable`. `Support\Renderable::render()` returns a `Promise<string>`, as every view render does (AD-11). `View\Factory::make()` and `file()` are sync pending ESC-10.3-1, `Console\Kernel::queue()` returns the structural thenable `PendingDispatch` with no `thenable` line in `async-surface.json` pending ESC-10.3-2, and the structural `SessionHandlerInterface` carries the session-handler async roots (`read`, `write`, `destroy`, `gc`).

## Dependencies

- `@xaravel/runtime` (workspace): allowed for every package (AD-2).
