# @xaravel/support

Xaravel's port of Laravel's illuminate/support component. Part of Xaravel, a TypeScript port of Laravel.

It ports `illuminate/support` from Laravel v13.37.0.

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## Dependencies

- `@xaravel/collections` (workspace): Upstream `composer.json` `require` (AD-2).
- `@xaravel/conditionable` (workspace): Upstream `composer.json` `require` (AD-2).
- `@xaravel/contracts` (workspace): allowed for every package (AD-2).
- `@xaravel/macroable` (workspace): Upstream `composer.json` `require` (AD-2).
- `@xaravel/reflection` (workspace): Upstream `composer.json` `require` (AD-2).
- `@xaravel/runtime` (workspace): allowed for every package (AD-2).
- `@xaravel/filesystem` (optional peer): Upstream `composer.json` `suggest`, reached only by token, alias or guarded `import()` (AD-2).
- `@xaravel/mockery` (optional peer): for `Facade.shouldReceive` / `spy` / `partialMock`; Graded packages take the grader only as a devDependency, with this exception (AD-2).
