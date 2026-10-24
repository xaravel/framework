---
title: 'Story 10.4: Container alias table and canonical tokens'
type: 'feature'
created: '2026-10-24'
status: 'in-review'
baseline_revision: 'a02d058c0463f814522c232ec31c0e4f5f8158d1'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
  - '{project-root}/conformance/escalations/ESC-10.4-1.md'
  - '{project-root}/AGENTS.md'
warnings:
  - oversized
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@xaravel/contracts/aliases` does not exist. The Container (Epic 17), facades and providers need Upstream's container aliases as data, and one canonical token per service, so that `app('cache')`, `app(CacheManager)` and `app(Cache\Factory)` resolve to one instance (AD-1.4).

**Approach:** Port `Application::registerCoreContainerAliases`, each service provider's string bindings, and the providers' class-to-class `alias()` calls verbatim as frozen data. Derive the services from that data, give each one canonical token by AD-1's rule as completed by ESC-10.4-1's Option 1, and export `canonicalToken(abstract)` and `validateAliasTable(table)`. ESC-10.4-1 waits on a ruling. The Story builds Option 1 and ends `blocked` on it if it is still open, with everything built.

## Boundaries & Constraints

**Always:**
- **Data, verbatim** (AD-1.4). `src/aliases/table.ts` exports three frozen constants. FQCNs have no leading `\`, and `self::class` is `Illuminate\Foundation\Application`.
  - `CORE_CONTAINER_ALIASES: Readonly<Record<string, readonly string[]>>` holds the 40 keys of `registerCoreContainerAliases`, keys and aliases in Upstream order.
  - `PROVIDER_BINDINGS: Readonly<Record<string, string>>` maps each string abstract that a `*ServiceProvider.php` binds with `singleton`, `bind` or `scoped`, and that is not a core key, to the FQCN of the class its closure builds. There are 15, in provider file path order, then line order: `memcached.connector`, `db.factory`, `db.transactions`, `migration.repository`, `migrator`, `migration.creator`, `composer`, `pipeline`, `queue.worker`, `queue.listener`, `queue.routes`, `translation.loader`, `validation.presence`, `view.finder` and `view.engine.resolver`. Read each FQCN from the closure through the file's `use` lines. Out of scope, as no provider binding: `Application`'s path, env and cache-flag instances, `Router::setRoutes`, the `instance('routes', …)` side effect inside the `url` closure, the testing traits' keys, and the Laravel Cloud `queue.failer` override.
  - `PROVIDER_ALIASES: readonly (readonly [abstract: string, alias: string])[]` holds the providers' `alias(X::class, Y::class)` calls in file and line order: Broadcasting (1), Bus (2), Notifications (2).
- **Services.** A service is a core key with its aliases, a provider binding's key with its one FQCN, or a provider alias chain keyed by its first abstract FQCN. Bus's two calls chain `Bus\Dispatcher` → `Contracts\Bus\Dispatcher` → `QueueingDispatcher` into one service. A **contract alias** is an alias FQCN for which `@xaravel/contracts` exports a token. Find it by walking the subpath modules' exports for frozen objects with an own `CLASS_FQCN`.
- **Canonical rule** (ESC-10.4-1, Option 1).
  - The canonical token is the contract alias that no other contract alias of the service has in its `CONTRACT_PARENTS` closure.
  - When several qualify, the first in Upstream order wins.
  - When the service has no contract alias, its string key is canonical.
- **`canonicalToken(abstract)`**. An abstract is a string, a contract token or a class.
  - A string is a key or an alias FQCN, and a leading `\` is accepted.
  - A token or class goes through runtime `fqcn()`, which throws for an unregistered class (AD-10).
  - It returns the service's canonical token: a `ContractToken` object, or the key string.
  - An abstract that is in no service is returned unchanged, as Upstream's `getAlias` does.
  - It never returns `undefined`.
- **`aliasResolver(table)`** returns the `canonicalToken` function of any table of the same three-part shape. `canonicalToken` is the resolver of the real table. Building a resolver runs `validateAliasTable(table)`, so importing `aliases` validates the real table.
- **`validateAliasTable(table)`** throws runtime `LogicException` naming the alias in brackets:
  - `[<alias>] is aliased to itself.` (Upstream `Container::alias`'s message);
  - `[<alias>] is aliased by two services, [<a>] and [<b>].`;
  - `[<alias>] names a contract that @xaravel/contracts does not export.`, for an FQCN under `Illuminate\Contracts\`, `Psr\Container\`, `Psr\SimpleCache\` or `Psr\Log\` with no token;
  - `[<alias>] has no canonical contract.`, for every alias of a service with neither a contract alias nor a string key.
- `package.json` gains `"./aliases": "./src/aliases/index.ts"`. The README lists the subpath.
- Tests use `xaravelTest`, `Assert` and the `support/contract-namespaces.ts` helpers. Expected data is derived from the Upstream PHP sources under `upstreamOrWarn` (`XARAVEL_UPSTREAM=require`), plus a literal canonical table, copied from Design Notes, that runs without the snapshot. Consequence strings cite AD-1.3 and AD-1.4, and ESC-10.4-1 for -11 and -12.

**Never:**
- Edit outside these paths: `packages/contracts/**`, this spec, `stories/10.4.md`'s `status:` line, sprint status and `_bmad-output/implementation-artifacts/`, and `conformance/escalations/ESC-10.4-*.md`.
- Import any package other than `@xaravel/runtime` from `src/`.
- Register a class under an Upstream implementation FQCN in a test, such as a fake `CacheManager`. That would stub another Component. Use `aliasResolver` with an `App\…` test table and `registerTestClass` instead.
- Change `Contract.ts`, an existing contract, or another Story's tests.
- Cite `exceptions.jsonl` or `additions.jsonl`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| verbatim (XT-10) | Upstream `registerCoreContainerAliases`, provider files | the three constants equal the parsed data, in order, and are frozen | none |
| string key (XT-11) | `canonicalToken('cache')` | the `Cache\Factory` token | none |
| class FQCN (XT-11) | `'Illuminate\\Cache\\CacheManager'`, `'\\Illuminate\\Cache\\CacheManager'` | the `Cache\Factory` token | none |
| another contract (XT-11) | the `Psr\Container\ContainerInterface` token | the `Foundation\Application` token | none |
| class argument (XT-11) | `aliasResolver(t)(Probe)`, with `Probe` registered as `App\Probe`, an alias of `App\Contract` in `t` | `App\Contract`'s token | an unregistered class throws `fqcn()`'s TypeError |
| siblings (XT-11) | `'mailer'`, the `MailQueue` token | the `Mail\Mailer` token | none |
| no contract (XT-11) | `'blade.compiler'`, the BladeCompiler FQCN, `'migrator'` | `'blade.compiler'`, `'blade.compiler'`, `'migrator'` | none |
| unknown (XT-11) | `'nope'`, an unaliased token | unchanged | none |
| invalid (XT-12) | a class-alias set with no contract; an alias under two keys; a self alias; an unexported `Illuminate\Contracts\X` | `LogicException` naming the alias | the real table validates |

</intent-contract>

## Code Map

- `packages/contracts/src/Contract.ts` -- `CLASS_FQCN`, `CONTRACT_PARENTS` and `ContractToken`. Read-only.
- `packages/contracts/src/index.ts` and `src/<sub>/index.ts` (41 `exports` subpaths) -- the token sources. `aliases` imports each `index.ts` relatively.
- `packages/runtime/src/registry/registry.ts:108` `fqcn`, `:332` `registerTestClass`; `@xaravel/runtime/php` `LogicException`.
- `packages/contracts/tests/xaravel/support/contract-namespaces.ts` -- `REPO`, `upstreamOrWarn`, `closure(token)` (the parents closure) and `upstreamPath`.
- `packages/contracts/tests/xaravel/web.test.ts:206` -- the `xaravelTest` form.
- `conformance/upstream/framework/src/Illuminate/Foundation/Application.php` `registerCoreContainerAliases`; `*/*ServiceProvider.php` (`Database/DatabaseServiceProvider.php:60,79`, `Database/MigrationServiceProvider.php:61,80,96`, `Cache/CacheServiceProvider.php:30`, `Translation/TranslationServiceProvider.php:42`, `Validation/ValidationServiceProvider.php:52`, `View/ViewServiceProvider.php:84,117`, `Queue/QueueServiceProvider.php:242,291,303`, `Pipeline/PipelineServiceProvider.php:23`, `Foundation/Providers/ComposerServiceProvider.php:18`; aliases at `Broadcasting/BroadcastServiceProvider.php:25`, `Bus/BusServiceProvider.php:31,35`, `Notifications/NotificationServiceProvider.php:36,40`).
- `conformance/tests/xaravel/scaffold.test.ts:228` -- `SUBPATH_EXPORTS` already lists `aliases`. Read-only.
- `tools/api-surface/api-surface.ts` -- only Upstream FQCN names are compared, so the new functions and constants must report 0 extra. Verify this. Read-only.

## Tasks & Acceptance

**Execution:**
- `packages/contracts/src/aliases/table.ts` -- the three verbatim constants -- AD-1.4.
- `packages/contracts/src/aliases/canonical.ts` -- the token index, services, `validateAliasTable`, `aliasResolver`, `canonicalToken` -- AD-1.4, ESC-10.4-1.
- `packages/contracts/src/aliases/index.ts` -- the re-exports.
- `packages/contracts/package.json`, `README.md` -- the `./aliases` subpath.
- `packages/contracts/tests/xaravel/aliases.test.ts` -- XT-contracts-10, -11 and -12, covering every matrix row.

**Acceptance Criteria:**
- Given the package, when `bun run harness --xaravel --id 'XT-contracts-*'` runs, then XT-contracts-1..12 and -18 pass.
- Given the package, when `bun run typecheck`, `bun run lint`, `bun run registration:check`, `bun run escalations:check`, `bun run async-surface --all --check`, `bun run api-surface --details contracts` (0 unexplained) and the full `bun run harness` run, then each passes with no differences.

## Spec Change Log

## Review Triage Log

## Design Notes

**Canonical table** (Option 1). Contract names are relative to `Illuminate\Contracts\`.

| Service | Canonical |
|---|---|
| app | Foundation\Application |
| auth | Auth\Factory |
| auth.driver | Auth\Guard |
| auth.password | Auth\PasswordBrokerFactory |
| auth.password.broker | Auth\PasswordBroker |
| cache | Cache\Factory |
| cache.store | Cache\Repository |
| config | Config\Repository |
| cookie | Cookie\QueueingFactory |
| encrypter | Encryption\Encrypter |
| events | Events\Dispatcher |
| filesystem | Filesystem\Factory |
| filesystem.disk | Filesystem\Filesystem |
| filesystem.cloud | Filesystem\Cloud |
| hash.driver | Hashing\Hasher |
| log | Psr\Log\LoggerInterface |
| mail.manager | Mail\Factory |
| mailer | Mail\Mailer |
| queue | Queue\Factory |
| queue.connection | Queue\Queue |
| redis | Redis\Factory |
| redis.connection | Redis\Connection |
| router | Routing\Registrar |
| session.store | Session\Session |
| translator | Translation\Translator |
| url | Routing\UrlGenerator |
| validator | Validation\Factory |
| view | View\Factory |
| Illuminate\Broadcasting\BroadcastManager | Broadcasting\Factory |
| Illuminate\Bus\Dispatcher | Bus\QueueingDispatcher |
| Illuminate\Notifications\ChannelManager | Notifications\Dispatcher |

Every other core key (12) and all 15 provider bindings are their own canonical key.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-contracts-*'` -- expected: 13 of 13 pass.
- `bun run typecheck`, `bun run lint`, `bun run registration:check`, `bun run escalations:check`, `bun run async-surface --all --check` -- expected: each exits 0.
- `bun run api-surface --details contracts` -- expected: 765 matched, 0 unexplained, no detail line.
- `bun run harness` -- expected: no differences.
- `bun run fidelity:review review --story 10.4` -- expected: two `pass` verdicts, or rejects routed to Escalations.
