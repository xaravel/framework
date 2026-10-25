# @xaravel/macroable

Xaravel's port of Laravel's illuminate/macroable component. Part of Xaravel, a TypeScript port of Laravel.

It ports `illuminate/macroable` from Laravel v13.37.0.

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## Documentation

See [docs/macroable.md](docs/macroable.md) for `macro`, `mixin`, `hasMacro` and `flushMacros`, and for the Divergences from Laravel.

```ts
import { Macroable } from "@xaravel/macroable";
import { mixin, registerClass } from "@xaravel/runtime";

class Report extends mixin(null, Macroable) {}

registerClass("App\\Support\\Report", Report);
```

## Dependencies

- `@xaravel/contracts` (workspace): allowed for every package (AD-2).
- `@xaravel/runtime` (workspace): allowed for every package (AD-2).
