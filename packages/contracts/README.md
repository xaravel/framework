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

`@xaravel/contracts/psr` exports the PSR interfaces and their tokens: `ContainerInterface`, `ContainerExceptionInterface` and `NotFoundExceptionInterface` (psr/container), `LoggerInterface` and `LoggerAwareInterface` (psr/log), and `CacheInterface`, `CacheException` and `InvalidArgumentException` (psr/simple-cache), plus the structural `DateInterval` type.

## Dependencies

- `@xaravel/runtime` (workspace): allowed for every package (AD-2).
