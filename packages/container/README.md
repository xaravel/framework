# @xaravel/container

Xaravel's port of Laravel's illuminate/container component. Part of Xaravel, a TypeScript port of Laravel.

It ports `illuminate/container` from Laravel v13.37.0.

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## Dependencies

- `@xaravel/contracts` (workspace): allowed for every package (AD-2).
- `@xaravel/reflection` (workspace): Upstream `composer.json` `require` (AD-2).
- `@xaravel/runtime` (workspace): allowed for every package (AD-2).
- `@xaravel/auth` (optional peer): Upstream `composer.json` `suggest`, reached only by token, alias or guarded `import()` (AD-2).
- `@xaravel/cache` (optional peer): Upstream `composer.json` `suggest`, reached only by token, alias or guarded `import()` (AD-2).
- `@xaravel/config` (optional peer): Upstream `composer.json` `suggest`, reached only by token, alias or guarded `import()` (AD-2).
- `@xaravel/database` (optional peer): Upstream `composer.json` `suggest`, reached only by token, alias or guarded `import()` (AD-2).
- `@xaravel/filesystem` (optional peer): Upstream `composer.json` `suggest`, reached only by token, alias or guarded `import()` (AD-2).
- `@xaravel/log` (optional peer): Upstream `composer.json` `suggest`, reached only by token, alias or guarded `import()` (AD-2).
