# @xaravel/conditionable

Xaravel's port of Laravel's illuminate/conditionable component. Part of Xaravel, a TypeScript port of Laravel.

It ports `illuminate/conditionable` from Laravel v13.37.0.

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## Documentation

See [docs/conditionable.md](docs/conditionable.md) for `when`, `unless` and `HigherOrderWhenProxy`, and for the Divergences from Laravel.

```ts
import { Conditionable } from "@xaravel/conditionable";
import { mixin, registerClass } from "@xaravel/runtime";

class Report extends mixin(null, Conditionable) {}

registerClass("App\\Support\\Report", Report);
```

## Dependencies

- `@xaravel/contracts` (workspace): allowed for every package (AD-2).
- `@xaravel/runtime` (workspace): allowed for every package (AD-2).
