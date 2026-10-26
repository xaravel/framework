# Contracts

`@xaravel/contracts` is Xaravel's port of Laravel's `illuminate/contracts` and of the PSR interfaces the framework
names (`psr/container`, `psr/simple-cache`, `psr/log`). A contract is the agreed shape of a service: packages built in
parallel type against it and resolve it from the container without importing each other's code. The package depends
only on `@xaravel/runtime`, and every other package may depend on it.

## What a contract is

Each Upstream interface is two things under one name:

- a TypeScript `interface`, which types a value; and
- a frozen runtime **token**, made with `contract()`, which the container uses as a key and `instanceof` checks against.

The token's `brand` is `Symbol.for('<Upstream FQCN>')`. The interface requires `readonly [X.brand]: true`, so a class
that `implements` a contract without the brand getter does not compile:

```ts
import { Repository } from "@xaravel/contracts/cache";

class ArrayRepository implements Repository {
  get [Repository.brand]() {
    return true as const;
  }
  // … Repository's methods
}

new ArrayRepository() instanceof Repository; // true: Symbol.hasInstance reads the brand through the prototype chain
```

`fqcn(Repository)` is `"Illuminate\\Contracts\\Cache\\Repository"`. A token is never registered as a class, so
`resolveClass` does not resolve its name. `contract(...)` records each token it makes with `@xaravel/runtime`'s
`registerContractToken` instead (ESC-13.1-7), so the FQCN resolves to the token as PHP's interface name does:
`interfaceExists(name)` is true and `new ReflectionClass(name)` reflects the token. Names are case-insensitive, and the
first token made under a name stays recorded. The token also carries, read from the committed API surface:

- its method names at `Symbol.for('xaravel.contract.methods')`, and each method's parameter names at
  `Symbol.for('xaravel.contract.parameters')`, which Mockery and PHPUnit doubles read;
- the tokens it extends at `Symbol.for('xaravel.contract.parents')`, so a double of a child is an instance of each
  parent;
- Upstream's interface constants as frozen own properties (`Filesystem.VISIBILITY_PUBLIC === "public"`); a static
  interface method is an exported `<X>Static` interface instead;
- the PHP names of the methods of built-in parents (`Countable`, `ArrayAccess`, `IteratorAggregate`, `Stringable`) at
  `Symbol.for('xaravel.contract.builtins')`.

Marker contracts (`ShouldQueue`, `ShouldBroadcast`, …) have no methods: a class carries the brand getter, and
`hasBrand(classOrInstance, Token)` from `@xaravel/runtime/php` checks it without instantiating the class.

Where Upstream names a concrete class in a signature (`Request`, `Collection`, `Batch`, …), the package declares a
structural interface in `src/structural/`, re-exported as a type by each subpath that names it, so a contract never
imports an implementation package.

## Typing and injecting a contract

Import the contract from the subpath of its Upstream namespace, in kebab case: `Illuminate\Contracts\Cache\Repository`
is `import { Repository } from "@xaravel/contracts/cache"`, and `Illuminate\Contracts\Auth\Access\Gate` is
`@xaravel/contracts/auth/access`. A nested namespace is its own subpath, which its parent's does not re-export. The PSR
interfaces are at `@xaravel/contracts/psr`.

TypeScript erases parameter types, so the container never autowires from a type hint. A dependency is declared with
`inject` from `@xaravel/runtime`, keyed by parameter name, with the token as the value (DIV-3):

```ts
import { inject } from "@xaravel/runtime";
import { Repository } from "@xaravel/contracts/cache";

@inject({ cache: Repository })
class ReportController {
  constructor(cache: Repository) {
    // …
  }
}
```

The same name is the type in the signature and the token in the map. Importing a contract with `import type` and then
injecting it is a lint error, because the type import has no runtime token.

Every service has one canonical token. `@xaravel/contracts/aliases` holds Upstream's container aliases verbatim as
data, and `canonicalToken(abstract)` maps a string key, an FQCN, a token or a registered class to it, so
`app("cache")`, `app("Illuminate\\Cache\\CacheManager")` and `app(Factory)`, with `Factory` imported from
`@xaravel/contracts/cache`, are one instance (AD-1). The subpath also exports the table itself as
`CORE_CONTAINER_ALIASES`, `PROVIDER_BINDINGS` and `PROVIDER_ALIASES`, `validateAliasTable(table)`, which throws a
`LogicException` on an inconsistent table, and `aliasResolver(table, tokens?)`, which builds the `canonicalToken` of
another table; and the types `Abstract`, `AliasTable` and `AliasResolver`.

The package root, `@xaravel/contracts`, exports the token mechanism: `contract()`, the symbol constants `CLASS_FQCN`,
`CONTRACT_METHODS`, `CONTRACT_PARAMETERS`, `CONTRACT_PARENTS` and `CONTRACT_BUILTINS` (the `Symbol.for` keys above),
and the types `ContractToken` and `ContractStatic`.

## Names and values

- Upstream's class, method, parameter and constant names are kept; methods and parameters are camelCase.
- `null` is the only absent value. No contract method returns `undefined`.
- A method with two or more optional parameters also accepts an options object holding them
  (`json(data, status, headers, options)` or `json({ status: 201 })`).
- `__toString` is `toString()`, `ArrayAccess` is `offsetExists` / `offsetGet` / `offsetSet` / `offsetUnset`,
  `Countable` is `count()`, `IteratorAggregate` is `getIterator()`, and `__invoke` keeps its name.
- A method that performs IO, or takes a callback that may be async, returns a Promise and names its async root in an
  `@asyncRoot` tag. The package's committed `async-surface.json` lists every such method, and
  `bun run async-surface --check contracts` fails when it drifts from the declarations.

`bun run api-surface:gate contracts` holds the package to Upstream: every declaration and member below must be
matched, with the same parameter names, defaults and nullability, and nothing is explained by a citation.

## Reference

One row per Upstream interface or class, with the subpath that exports it and its export name. An interface's name is
both its TypeScript interface and its runtime token; a class's name is the class itself.

| Upstream FQCN | Kind | Import | Export |
| --- | --- | --- | --- |
| `Illuminate\Contracts\Auth\Access\Authorizable` | interface | `@xaravel/contracts/auth/access` | `Authorizable` |
| `Illuminate\Contracts\Auth\Access\Gate` | interface | `@xaravel/contracts/auth/access` | `Gate` |
| `Illuminate\Contracts\Auth\Authenticatable` | interface | `@xaravel/contracts/auth` | `Authenticatable` |
| `Illuminate\Contracts\Auth\CanResetPassword` | interface | `@xaravel/contracts/auth` | `CanResetPassword` |
| `Illuminate\Contracts\Auth\Factory` | interface | `@xaravel/contracts/auth` | `Factory` |
| `Illuminate\Contracts\Auth\Guard` | interface | `@xaravel/contracts/auth` | `Guard` |
| `Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests` | interface | `@xaravel/contracts/auth/middleware` | `AuthenticatesRequests` |
| `Illuminate\Contracts\Auth\MustVerifyEmail` | interface | `@xaravel/contracts/auth` | `MustVerifyEmail` |
| `Illuminate\Contracts\Auth\PasswordBroker` | interface | `@xaravel/contracts/auth` | `PasswordBroker` |
| `Illuminate\Contracts\Auth\PasswordBrokerFactory` | interface | `@xaravel/contracts/auth` | `PasswordBrokerFactory` |
| `Illuminate\Contracts\Auth\StatefulGuard` | interface | `@xaravel/contracts/auth` | `StatefulGuard` |
| `Illuminate\Contracts\Auth\SupportsBasicAuth` | interface | `@xaravel/contracts/auth` | `SupportsBasicAuth` |
| `Illuminate\Contracts\Auth\UserProvider` | interface | `@xaravel/contracts/auth` | `UserProvider` |
| `Illuminate\Contracts\Broadcasting\Broadcaster` | interface | `@xaravel/contracts/broadcasting` | `Broadcaster` |
| `Illuminate\Contracts\Broadcasting\Factory` | interface | `@xaravel/contracts/broadcasting` | `Factory` |
| `Illuminate\Contracts\Broadcasting\HasBroadcastChannel` | interface | `@xaravel/contracts/broadcasting` | `HasBroadcastChannel` |
| `Illuminate\Contracts\Broadcasting\ShouldBeUnique` | interface | `@xaravel/contracts/broadcasting` | `ShouldBeUnique` |
| `Illuminate\Contracts\Broadcasting\ShouldBroadcast` | interface | `@xaravel/contracts/broadcasting` | `ShouldBroadcast` |
| `Illuminate\Contracts\Broadcasting\ShouldBroadcastNow` | interface | `@xaravel/contracts/broadcasting` | `ShouldBroadcastNow` |
| `Illuminate\Contracts\Broadcasting\ShouldRescue` | interface | `@xaravel/contracts/broadcasting` | `ShouldRescue` |
| `Illuminate\Contracts\Bus\Dispatcher` | interface | `@xaravel/contracts/bus` | `Dispatcher` |
| `Illuminate\Contracts\Bus\QueueingDispatcher` | interface | `@xaravel/contracts/bus` | `QueueingDispatcher` |
| `Illuminate\Contracts\Cache\CanFlushLocks` | interface | `@xaravel/contracts/cache` | `CanFlushLocks` |
| `Illuminate\Contracts\Cache\Factory` | interface | `@xaravel/contracts/cache` | `Factory` |
| `Illuminate\Contracts\Cache\Lock` | interface | `@xaravel/contracts/cache` | `Lock` |
| `Illuminate\Contracts\Cache\LockProvider` | interface | `@xaravel/contracts/cache` | `LockProvider` |
| `Illuminate\Contracts\Cache\LockTimeoutException` | class | `@xaravel/contracts/cache` | `LockTimeoutException` |
| `Illuminate\Contracts\Cache\Repository` | interface | `@xaravel/contracts/cache` | `Repository` |
| `Illuminate\Contracts\Cache\Store` | interface | `@xaravel/contracts/cache` | `Store` |
| `Illuminate\Contracts\Concurrency\Driver` | interface | `@xaravel/contracts/concurrency` | `Driver` |
| `Illuminate\Contracts\Config\Repository` | interface | `@xaravel/contracts/config` | `Repository` |
| `Illuminate\Contracts\Console\Application` | interface | `@xaravel/contracts/console` | `Application` |
| `Illuminate\Contracts\Console\Isolatable` | interface | `@xaravel/contracts/console` | `Isolatable` |
| `Illuminate\Contracts\Console\Kernel` | interface | `@xaravel/contracts/console` | `Kernel` |
| `Illuminate\Contracts\Console\PromptsForMissingInput` | interface | `@xaravel/contracts/console` | `PromptsForMissingInput` |
| `Illuminate\Contracts\Container\BindingResolutionException` | class | `@xaravel/contracts/container` | `BindingResolutionException` |
| `Illuminate\Contracts\Container\CircularDependencyException` | class | `@xaravel/contracts/container` | `CircularDependencyException` |
| `Illuminate\Contracts\Container\Container` | interface | `@xaravel/contracts/container` | `Container` |
| `Illuminate\Contracts\Container\ContextualAttribute` | interface | `@xaravel/contracts/container` | `ContextualAttribute` |
| `Illuminate\Contracts\Container\ContextualBindingBuilder` | interface | `@xaravel/contracts/container` | `ContextualBindingBuilder` |
| `Illuminate\Contracts\Container\SelfBuilding` | interface | `@xaravel/contracts/container` | `SelfBuilding` |
| `Illuminate\Contracts\Cookie\Factory` | interface | `@xaravel/contracts/cookie` | `Factory` |
| `Illuminate\Contracts\Cookie\QueueingFactory` | interface | `@xaravel/contracts/cookie` | `QueueingFactory` |
| `Illuminate\Contracts\Database\ConcurrencyErrorDetector` | interface | `@xaravel/contracts/database` | `ConcurrencyErrorDetector` |
| `Illuminate\Contracts\Database\Eloquent\Builder` | interface | `@xaravel/contracts/database/eloquent` | `Builder` |
| `Illuminate\Contracts\Database\Eloquent\Castable` | interface | `@xaravel/contracts/database/eloquent` | `Castable` |
| `Illuminate\Contracts\Database\Eloquent\CastsAttributes` | interface | `@xaravel/contracts/database/eloquent` | `CastsAttributes` |
| `Illuminate\Contracts\Database\Eloquent\CastsInboundAttributes` | interface | `@xaravel/contracts/database/eloquent` | `CastsInboundAttributes` |
| `Illuminate\Contracts\Database\Eloquent\ComparesCastableAttributes` | interface | `@xaravel/contracts/database/eloquent` | `ComparesCastableAttributes` |
| `Illuminate\Contracts\Database\Eloquent\DeviatesCastableAttributes` | interface | `@xaravel/contracts/database/eloquent` | `DeviatesCastableAttributes` |
| `Illuminate\Contracts\Database\Eloquent\SerializesCastableAttributes` | interface | `@xaravel/contracts/database/eloquent` | `SerializesCastableAttributes` |
| `Illuminate\Contracts\Database\Eloquent\SupportsPartialRelations` | interface | `@xaravel/contracts/database/eloquent` | `SupportsPartialRelations` |
| `Illuminate\Contracts\Database\Events\MigrationEvent` | interface | `@xaravel/contracts/database/events` | `MigrationEvent` |
| `Illuminate\Contracts\Database\LostConnectionDetector` | interface | `@xaravel/contracts/database` | `LostConnectionDetector` |
| `Illuminate\Contracts\Database\ModelIdentifier` | class | `@xaravel/contracts/database` | `ModelIdentifier` |
| `Illuminate\Contracts\Database\Query\Builder` | interface | `@xaravel/contracts/database/query` | `Builder` |
| `Illuminate\Contracts\Database\Query\ConditionExpression` | interface | `@xaravel/contracts/database/query` | `ConditionExpression` |
| `Illuminate\Contracts\Database\Query\Expression` | interface | `@xaravel/contracts/database/query` | `Expression` |
| `Illuminate\Contracts\Debug\ExceptionHandler` | interface | `@xaravel/contracts/debug` | `ExceptionHandler` |
| `Illuminate\Contracts\Debug\ShouldntReport` | interface | `@xaravel/contracts/debug` | `ShouldntReport` |
| `Illuminate\Contracts\Encryption\DecryptException` | class | `@xaravel/contracts/encryption` | `DecryptException` |
| `Illuminate\Contracts\Encryption\EncryptException` | class | `@xaravel/contracts/encryption` | `EncryptException` |
| `Illuminate\Contracts\Encryption\Encrypter` | interface | `@xaravel/contracts/encryption` | `Encrypter` |
| `Illuminate\Contracts\Encryption\StringEncrypter` | interface | `@xaravel/contracts/encryption` | `StringEncrypter` |
| `Illuminate\Contracts\Events\Dispatcher` | interface | `@xaravel/contracts/events` | `Dispatcher` |
| `Illuminate\Contracts\Events\ShouldBeDiscovered` | interface | `@xaravel/contracts/events` | `ShouldBeDiscovered` |
| `Illuminate\Contracts\Events\ShouldDispatchAfterCommit` | interface | `@xaravel/contracts/events` | `ShouldDispatchAfterCommit` |
| `Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit` | interface | `@xaravel/contracts/events` | `ShouldHandleEventsAfterCommit` |
| `Illuminate\Contracts\Filesystem\Cloud` | interface | `@xaravel/contracts/filesystem` | `Cloud` |
| `Illuminate\Contracts\Filesystem\Factory` | interface | `@xaravel/contracts/filesystem` | `Factory` |
| `Illuminate\Contracts\Filesystem\FileNotFoundException` | class | `@xaravel/contracts/filesystem` | `FileNotFoundException` |
| `Illuminate\Contracts\Filesystem\Filesystem` | interface | `@xaravel/contracts/filesystem` | `Filesystem` |
| `Illuminate\Contracts\Filesystem\LockTimeoutException` | class | `@xaravel/contracts/filesystem` | `LockTimeoutException` |
| `Illuminate\Contracts\Foundation\Application` | interface | `@xaravel/contracts/foundation` | `Application` |
| `Illuminate\Contracts\Foundation\CachesConfiguration` | interface | `@xaravel/contracts/foundation` | `CachesConfiguration` |
| `Illuminate\Contracts\Foundation\CachesRoutes` | interface | `@xaravel/contracts/foundation` | `CachesRoutes` |
| `Illuminate\Contracts\Foundation\ExceptionRenderer` | interface | `@xaravel/contracts/foundation` | `ExceptionRenderer` |
| `Illuminate\Contracts\Foundation\MaintenanceMode` | interface | `@xaravel/contracts/foundation` | `MaintenanceMode` |
| `Illuminate\Contracts\Hashing\Hasher` | interface | `@xaravel/contracts/hashing` | `Hasher` |
| `Illuminate\Contracts\Http\Kernel` | interface | `@xaravel/contracts/http` | `Kernel` |
| `Illuminate\Contracts\Image\Driver` | interface | `@xaravel/contracts/image` | `Driver` |
| `Illuminate\Contracts\Image\Transformation` | interface | `@xaravel/contracts/image` | `Transformation` |
| `Illuminate\Contracts\JsonSchema\JsonSchema` | interface | `@xaravel/contracts/json-schema` | `JsonSchema` |
| `Illuminate\Contracts\Log\ContextLogProcessor` | interface | `@xaravel/contracts/log` | `ContextLogProcessor` |
| `Illuminate\Contracts\Mail\Attachable` | interface | `@xaravel/contracts/mail` | `Attachable` |
| `Illuminate\Contracts\Mail\Factory` | interface | `@xaravel/contracts/mail` | `Factory` |
| `Illuminate\Contracts\Mail\MailQueue` | interface | `@xaravel/contracts/mail` | `MailQueue` |
| `Illuminate\Contracts\Mail\Mailable` | interface | `@xaravel/contracts/mail` | `Mailable` |
| `Illuminate\Contracts\Mail\Mailer` | interface | `@xaravel/contracts/mail` | `Mailer` |
| `Illuminate\Contracts\Notifications\Dispatcher` | interface | `@xaravel/contracts/notifications` | `Dispatcher` |
| `Illuminate\Contracts\Notifications\Factory` | interface | `@xaravel/contracts/notifications` | `Factory` |
| `Illuminate\Contracts\Pagination\CursorPaginator` | interface | `@xaravel/contracts/pagination` | `CursorPaginator` |
| `Illuminate\Contracts\Pagination\LengthAwarePaginator` | interface | `@xaravel/contracts/pagination` | `LengthAwarePaginator` |
| `Illuminate\Contracts\Pagination\Paginator` | interface | `@xaravel/contracts/pagination` | `Paginator` |
| `Illuminate\Contracts\Pipeline\Hub` | interface | `@xaravel/contracts/pipeline` | `Hub` |
| `Illuminate\Contracts\Pipeline\Pipeline` | interface | `@xaravel/contracts/pipeline` | `Pipeline` |
| `Illuminate\Contracts\Process\InvokedProcess` | interface | `@xaravel/contracts/process` | `InvokedProcess` |
| `Illuminate\Contracts\Process\ProcessResult` | interface | `@xaravel/contracts/process` | `ProcessResult` |
| `Illuminate\Contracts\Queue\ClearableQueue` | interface | `@xaravel/contracts/queue` | `ClearableQueue` |
| `Illuminate\Contracts\Queue\EntityNotFoundException` | class | `@xaravel/contracts/queue` | `EntityNotFoundException` |
| `Illuminate\Contracts\Queue\EntityResolver` | interface | `@xaravel/contracts/queue` | `EntityResolver` |
| `Illuminate\Contracts\Queue\Factory` | interface | `@xaravel/contracts/queue` | `Factory` |
| `Illuminate\Contracts\Queue\Interruptible` | interface | `@xaravel/contracts/queue` | `Interruptible` |
| `Illuminate\Contracts\Queue\Job` | interface | `@xaravel/contracts/queue` | `Job` |
| `Illuminate\Contracts\Queue\Monitor` | interface | `@xaravel/contracts/queue` | `Monitor` |
| `Illuminate\Contracts\Queue\PreparesForDispatch` | interface | `@xaravel/contracts/queue` | `PreparesForDispatch` |
| `Illuminate\Contracts\Queue\Queue` | interface | `@xaravel/contracts/queue` | `Queue` |
| `Illuminate\Contracts\Queue\QueueableCollection` | interface | `@xaravel/contracts/queue` | `QueueableCollection` |
| `Illuminate\Contracts\Queue\QueueableEntity` | interface | `@xaravel/contracts/queue` | `QueueableEntity` |
| `Illuminate\Contracts\Queue\ShouldBeEncrypted` | interface | `@xaravel/contracts/queue` | `ShouldBeEncrypted` |
| `Illuminate\Contracts\Queue\ShouldBeUnique` | interface | `@xaravel/contracts/queue` | `ShouldBeUnique` |
| `Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing` | interface | `@xaravel/contracts/queue` | `ShouldBeUniqueUntilProcessing` |
| `Illuminate\Contracts\Queue\ShouldQueue` | interface | `@xaravel/contracts/queue` | `ShouldQueue` |
| `Illuminate\Contracts\Queue\ShouldQueueAfterCommit` | interface | `@xaravel/contracts/queue` | `ShouldQueueAfterCommit` |
| `Illuminate\Contracts\Redis\Connection` | interface | `@xaravel/contracts/redis` | `Connection` |
| `Illuminate\Contracts\Redis\Connector` | interface | `@xaravel/contracts/redis` | `Connector` |
| `Illuminate\Contracts\Redis\Factory` | interface | `@xaravel/contracts/redis` | `Factory` |
| `Illuminate\Contracts\Redis\LimiterTimeoutException` | class | `@xaravel/contracts/redis` | `LimiterTimeoutException` |
| `Illuminate\Contracts\Routing\BindingRegistrar` | interface | `@xaravel/contracts/routing` | `BindingRegistrar` |
| `Illuminate\Contracts\Routing\Registrar` | interface | `@xaravel/contracts/routing` | `Registrar` |
| `Illuminate\Contracts\Routing\ResponseFactory` | interface | `@xaravel/contracts/routing` | `ResponseFactory` |
| `Illuminate\Contracts\Routing\UrlGenerator` | interface | `@xaravel/contracts/routing` | `UrlGenerator` |
| `Illuminate\Contracts\Routing\UrlRoutable` | interface | `@xaravel/contracts/routing` | `UrlRoutable` |
| `Illuminate\Contracts\Session\Middleware\AuthenticatesSessions` | interface | `@xaravel/contracts/session/middleware` | `AuthenticatesSessions` |
| `Illuminate\Contracts\Session\Session` | interface | `@xaravel/contracts/session` | `Session` |
| `Illuminate\Contracts\Support\Arrayable` | interface | `@xaravel/contracts/support` | `Arrayable` |
| `Illuminate\Contracts\Support\CanBeEscapedWhenCastToString` | interface | `@xaravel/contracts/support` | `CanBeEscapedWhenCastToString` |
| `Illuminate\Contracts\Support\DeferrableProvider` | interface | `@xaravel/contracts/support` | `DeferrableProvider` |
| `Illuminate\Contracts\Support\DeferringDisplayableValue` | interface | `@xaravel/contracts/support` | `DeferringDisplayableValue` |
| `Illuminate\Contracts\Support\HasOnceHash` | interface | `@xaravel/contracts/support` | `HasOnceHash` |
| `Illuminate\Contracts\Support\Htmlable` | interface | `@xaravel/contracts/support` | `Htmlable` |
| `Illuminate\Contracts\Support\Jsonable` | interface | `@xaravel/contracts/support` | `Jsonable` |
| `Illuminate\Contracts\Support\MessageBag` | interface | `@xaravel/contracts/support` | `MessageBag` |
| `Illuminate\Contracts\Support\MessageProvider` | interface | `@xaravel/contracts/support` | `MessageProvider` |
| `Illuminate\Contracts\Support\Renderable` | interface | `@xaravel/contracts/support` | `Renderable` |
| `Illuminate\Contracts\Support\Responsable` | interface | `@xaravel/contracts/support` | `Responsable` |
| `Illuminate\Contracts\Support\ValidatedData` | interface | `@xaravel/contracts/support` | `ValidatedData` |
| `Illuminate\Contracts\Translation\HasLocalePreference` | interface | `@xaravel/contracts/translation` | `HasLocalePreference` |
| `Illuminate\Contracts\Translation\Loader` | interface | `@xaravel/contracts/translation` | `Loader` |
| `Illuminate\Contracts\Translation\Translator` | interface | `@xaravel/contracts/translation` | `Translator` |
| `Illuminate\Contracts\Validation\CompilableRules` | interface | `@xaravel/contracts/validation` | `CompilableRules` |
| `Illuminate\Contracts\Validation\DataAwareRule` | interface | `@xaravel/contracts/validation` | `DataAwareRule` |
| `Illuminate\Contracts\Validation\Factory` | interface | `@xaravel/contracts/validation` | `Factory` |
| `Illuminate\Contracts\Validation\ImplicitRule` | interface | `@xaravel/contracts/validation` | `ImplicitRule` |
| `Illuminate\Contracts\Validation\InvokableRule` | interface | `@xaravel/contracts/validation` | `InvokableRule` |
| `Illuminate\Contracts\Validation\ParameterizedRule` | interface | `@xaravel/contracts/validation` | `ParameterizedRule` |
| `Illuminate\Contracts\Validation\Rule` | interface | `@xaravel/contracts/validation` | `Rule` |
| `Illuminate\Contracts\Validation\UncompromisedVerifier` | interface | `@xaravel/contracts/validation` | `UncompromisedVerifier` |
| `Illuminate\Contracts\Validation\ValidatesWhenResolved` | interface | `@xaravel/contracts/validation` | `ValidatesWhenResolved` |
| `Illuminate\Contracts\Validation\ValidationRule` | interface | `@xaravel/contracts/validation` | `ValidationRule` |
| `Illuminate\Contracts\Validation\Validator` | interface | `@xaravel/contracts/validation` | `Validator` |
| `Illuminate\Contracts\Validation\ValidatorAwareRule` | interface | `@xaravel/contracts/validation` | `ValidatorAwareRule` |
| `Illuminate\Contracts\View\Engine` | interface | `@xaravel/contracts/view` | `Engine` |
| `Illuminate\Contracts\View\Factory` | interface | `@xaravel/contracts/view` | `Factory` |
| `Illuminate\Contracts\View\View` | interface | `@xaravel/contracts/view` | `View` |
| `Illuminate\Contracts\View\ViewCompilationException` | class | `@xaravel/contracts/view` | `ViewCompilationException` |
| `Psr\Container\ContainerExceptionInterface` | interface | `@xaravel/contracts/psr` | `ContainerExceptionInterface` |
| `Psr\Container\ContainerInterface` | interface | `@xaravel/contracts/psr` | `ContainerInterface` |
| `Psr\Container\NotFoundExceptionInterface` | interface | `@xaravel/contracts/psr` | `NotFoundExceptionInterface` |
| `Psr\Log\LoggerAwareInterface` | interface | `@xaravel/contracts/psr` | `LoggerAwareInterface` |
| `Psr\Log\LoggerInterface` | interface | `@xaravel/contracts/psr` | `LoggerInterface` |
| `Psr\SimpleCache\CacheException` | interface | `@xaravel/contracts/psr` | `CacheException` |
| `Psr\SimpleCache\CacheInterface` | interface | `@xaravel/contracts/psr` | `CacheInterface` |
| `Psr\SimpleCache\InvalidArgumentException` | interface | `@xaravel/contracts/psr` | `InvalidArgumentException` |

The 11 classes are the contracts' own exceptions and `ModelIdentifier`. They are real classes, registered under their
Upstream FQCN.

## Xaravel-only seams

The only cross-package seams with no Upstream interface are added to three subpaths (AD-27): `async` and `testing`
hold nothing else, and `view` adds its seams, as types only, beside Upstream's View contracts. A new seam needs an
Escalation.

- `@xaravel/contracts/async` (AD-6): `THENABLE_TYPES`, the frozen list of the Upstream FQCNs of the types that can be
  awaited directly (the query Builders, the Relations, the `Pending*` builders and both Pipelines), which
  `bun run async-surface` reads; and the type `NotPromise<T>`, which a sync API uses to reject an async callback.
- `@xaravel/contracts/view` (AD-11): the compiled-view ABI. `RenderContext` is what a compiled view's `render(ctx)`
  takes, and `RenderLoop` is the shape of one entry of its loop stack (Upstream's `addLoop` entry); `BladeHelper`, `BladeEnvMethod` and `BladeFunction` name the helpers a `Blade.directive` handler's emitted
  source may call.
- `@xaravel/contracts/testing` (AD-25): `TEST_HOOK_ORDER` and its element type `TestHook`, Laravel's order:
  `createApplication`, each `setUp<Trait>`, `afterApplicationCreated`, the test, then the `beforeApplicationDestroyed`
  callbacks, the `tearDown<Trait>` ones included, in registration order.

## Protection

`conformance/protected-paths` lists `/packages/contracts/ after-phase:1`. Once the Maintainer signs
`decisions/PHASE-1-EXIT.md`, `packages/contracts/**` is a Protected Path: a Story PR that touches it fails the
protected-paths check unless the Maintainer approves it, so changing a shared interface needs an Escalation (AD-16).

## Divergences

- **DIV-1** (async IO terminals): IO methods return Promises. Cache stores, session handlers, queue connections,
  filesystem, Redis, mail and broadcasting contracts are async where any Upstream driver does IO, and so is
  `Psr\SimpleCache\CacheInterface`. `View\Factory::make()` and `file()` stay sync, and `render()` awaits the creator
  dispatch `make()` started (DIV-1.5).
- **DIV-3** (explicit injection tokens): a contract is injected by its token through `inject`, never by a type hint.
- **DIV-9** (PHP value model): `null` is the only absent value, marker interfaces are brands checked with
  `hasBrand`, and by-reference parameters take a `Ref<T>`; both come from `@xaravel/runtime/php`.
- **DIV-12** (PHP member namespaces): an option pair accepts either form. No contract declares a member DIV-12 renames;
  `ModelIdentifier::useMorphMap()` keeps its method name, and Upstream's protected static `$useMorphMap` state is not
  part of the surface (Xaravel holds it per unit frame, AD-5).
