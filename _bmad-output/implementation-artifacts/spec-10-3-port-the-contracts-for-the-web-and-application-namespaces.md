---
title: 'Story 10.3: Port the contracts for the web and application namespaces'
type: 'feature'
created: '2026-10-23'
status: 'ready-for-dev'
baseline_revision: '40f8532893425af6385d278a177c358f0e919bea'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-10-2-port-the-contracts-for-the-core-and-service-namespaces.md'
  - '{project-root}/conformance/escalations/ESC-10.3-1.md'
  - '{project-root}/PORTING.md'
  - '{project-root}/AGENTS.md'
warnings:
  - oversized
deferred: []
---

# Story 10.3: Port the contracts for the web and application namespaces

<intent-contract>

## Intent

**Problem:** `@xaravel/contracts` lacks the `Illuminate\Contracts` interfaces of 14 namespaces: Auth (with Auth\Access and Auth\Middleware), Broadcasting, Console, Cookie, Database (with Database\Eloquent, Database\Events and Database\Query), Http, Image, Log, Mail, Notifications, Pagination, Routing, Session (with Session\Middleware) and View. That is 64 interfaces and 2 classes (`Database\ModelIdentifier`, `View\ViewCompilationException`), 326 API-surface rows, which Phase 4–8 packages need. `bun run api-surface --details contracts` lists all 66 as missing.

**Approach:** Port each one exactly as Story 10.2 did: the same file shape, members, parents, statics, signatures, structural types and async rules (10.2 spec, "Boundaries & Constraints" Always, first and second pass). XT-contracts-8 checks the port, and XT-contracts-9 checks that the API-surface diff for all of `Illuminate\Contracts` is clean. One question is raised as `conformance/escalations/ESC-10.3-1.md` and waits on the Maintainer: whether `View\Factory::make/file` are sync. AD-11 says the view helper is sync. AD-6 makes the method async, because it dispatches the `creating:` event. The port takes that Escalation's recommended option, so the Story ends `blocked` on it, with everything built.

## Boundaries & Constraints

**Always:**
- **The 10.2 rules apply unchanged.** That covers:
  - one contract per file, with the `declare const XBrand` / `interface` / `contract()` shape and the FQCN header;
  - `members` = the FQCN's method rows in file order, with raw PHP parameter names, declared methods only;
  - `parents` = Upstream `extends` tokens, in order;
  - TS signatures, including the AD-26 options overloads, `null` never `undefined`, and no `T | Promise<T>`;
  - `@asyncRoot` tags, and `async-surface.json` regenerated with `bun run async-surface contracts`;
  - marker tokens with `{}` members;
  - exception classes ending in `registerClass`;
  - imports only from `@xaravel/runtime` or relative paths.
- **Subpaths.** Subpaths follow `SUBPATH_EXPORTS`: `auth`, `auth/access`, `auth/middleware`, `broadcasting`, `console`, `cookie`, `database`, `database/eloquent`, `database/events`, `database/query`, `http`, `image`, `log`, `mail`, `notifications`, `pagination`, `routing`, `session`, `session/middleware`, `view`.
  - A nested namespace lives in `src/<a>/<b>/` with its own `index.ts`.
  - `package.json` `exports` gains exactly these 20 entries, each `"./<sub>": "./src/<sub>/index.ts"`.
  - A parent namespace's `index.ts` does not re-export its nested namespaces.
- **Reserved words.** `$arguments` becomes `args` and `$class` becomes `className`; Session and ResponseFactory's `$default` becomes `defaultValue`. The docblock notes each rename, and `members` keeps the raw names. The API-surface tool's `RESERVED` list already exempts all three.
- **Statics.**
  - `Auth\PasswordBroker` passes the statics `{ RESET_LINK_SENT: "passwords.sent", PASSWORD_RESET: "passwords.reset", INVALID_USER: "passwords.user", INVALID_TOKEN: "passwords.token", RESET_THROTTLED: "passwords.throttled" }`, with values read from the Upstream file.
  - `Database\Eloquent\Castable.ts` exports `interface CastableStatic { castUsing(args: PhpArrayLike): ClassString | CastsAttributes | CastsInboundAttributes }`. Its token has `{}` members.
  - No token in scope has built-in parents, so `builtins` is empty everywhere.
- **Concrete types** (AD-1.2) become structural types in `src/structural/`, each a subset of Upstream's public members, checked against the source.
  - A type takes its short name, or a namespace-prefixed name when that short name is taken: `AuthAccessResponse`, `HttpResponse` (Illuminate\Http\Response), `SymfonyRequest`, `SymfonyCookie`.
  - The new types: Auth\Access\Response, Symfony Request, InputInterface, Symfony Cookie, PendingDispatch (a thenable, after `PendingBatch.ts`), Broadcasting\Channel, Eloquent\Model, Database\Grammar, Image\ImagePipeline, Monolog `ProcessorInterface` and `LogRecord`, Mail\Attachment, SentMessage, PendingMail, Pagination\Cursor, Routing\Route, PendingResourceRegistration, Illuminate\Http\Response, JsonResponse, RedirectResponse, StreamedEvent, Symfony StreamedResponse, StreamedJsonResponse, BinaryFileResponse, `SplFileInfo`, `BackedEnum` and `SessionHandlerInterface`.
  - `SessionHandlerInterface` declares `open`/`close` sync and `read`/`write`/`destroy`/`gc` async. Each async one is tagged `@asyncRoot SessionHandlerInterface.<same>`; it is AD-6's session-handler root.
  - Where Upstream names `Illuminate\Database\Eloquent\Builder` or `Query\Builder`, the contract token type is used, as 10.2's rule says.
- **Log parent.** `Log\ContextLogProcessor` extends Monolog's `ProcessorInterface`, which is no contract. Its TS interface extends the structural `ProcessorInterface` (`__invoke(record: LogRecord): LogRecord`), with no parent token, as a built-in parent is handled.
- **`Database\ModelIdentifier`** is a class ported in full.
  - It has public `class` (TS property `class` is legal), `id`, `relations`, `connection`, and `collectionClass = null`.
  - Its constructor is `(className, id, relations, connection)`.
  - It has `useCollectionClass`, `getClass` and `static useMorphMap(useMorphMap = true)`.
  - The morph-map flag is an Upstream static setter: it is held per frame through `frameStatic` (AD-5; PORTING.md), never in a module variable.
  - The morph map is read by looking up `Illuminate\Database\Eloquent\Relations\Relation` at call time with runtime's `resolveClass`, and calling its static `getMorphAlias` / `getMorphedModel`. This is PHP autoloading and needs no import of the database package. An unregistered Relation throws runtime's not-found error, as PHP fails.
  - It ends with `registerClass`.
- **`View\ViewCompilationException`** extends runtime `Exception` and ends with `registerClass`.
- **Async.** The Design Notes table lists every async method. Everything else is sync.
  - `Support\Renderable.render` (10.2's file, edited in place) becomes `Promise<string>` with `@asyncRoot callback`. AD-11: a render is a compiled module's `Promise<string>`, and every Upstream Renderable (View, Mailable, MailMessage) renders a view. So `View\View extends Renderable` type-checks.
  - XT-contracts-5's async table gains `Support\Renderable.render → callback`.
- **XT-contracts-5 is scoped.** Its last loop, "every async-surface entry outside `src/psr/` is consumed", is limited to the 19 namespaces' subpath directories and its `STRUCTURAL_ASYNC` files. Its exact-table comparison is limited the same way. XT-contracts-8 covers the new files.
- **XT-contracts-7 is updated.** Its check that "some detail line names a Story 10.3 namespace", which can no longer hold, becomes a check that `matched` is at least the number of member rows of the 19 namespaces in `contracts.jsonl`. Its `LATER` constant and its consequence string are updated to match. No other assertion changes.
- **Shared test code.** XT-contracts-5's row, Upstream-parent, statics and async-table helpers move into `packages/contracts/tests/xaravel/support/contract-namespaces.ts` (named exports, no test of its own). XT-contracts-5 and -8 both import it, so the two run one implementation (lessons, epic 4). The `XARAVEL_UPSTREAM=require` rule applies to XT-contracts-8's Upstream-derived parts too.
- **Tests.** The tests use `xaravelTest` and `Assert` only.
  - XT-contracts-8's consequence string cites AD-1.1, AD-1.2 and AD-6.
  - XT-contracts-9's cites AD-1.1 and AD-1.6.

**Never:**
- Edit outside these paths:
  - `packages/contracts/**`;
  - this spec, `stories/10.3.md`'s `status:` line and sprint status;
  - `_bmad-output/implementation-artifacts/`;
  - `conformance/escalations/ESC-10.3-*.md`.

  In particular, never edit `tools/**`, other `conformance/**` files, or `@xaravel/runtime`, `assert` or `mockery`.
- Cite `exceptions.jsonl` or `additions.jsonl`.
- Import any package but `@xaravel/runtime`.
- Stub the database package.
- Add parent methods to `members`.
- Edit Story 10.1's tests (`contract.test.ts`, `psr.test.ts`, `brand-compile.test.ts`).
- Change `Contract.ts`.
- Add a DIV clause or an async root.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| exports (XT-8) | `import * as m` from each of the 20 subpaths | the runtime exports are exactly that namespace's `interface` and `class` rows, by short name | none |
| identity and metadata (XT-8) | each token, compared with the rows | `fqcn`, `brand`, `CONTRACT_METHODS` and `CONTRACT_PARAMETERS` match the rows, as in XT-5 | none |
| parents (XT-8) | each Upstream `extends` | StatefulGuard→[Guard], ShouldBroadcastNow→[ShouldBroadcast], QueueingFactory→[Cookie\Factory], Eloquent\Builder→[Query\Builder], ConditionExpression→[Expression], LengthAwarePaginator→[Paginator], View→[Renderable]; ContextLogProcessor→[] | none |
| statics (XT-8) | `PasswordBroker`; a class with `static castUsing` | the five constants equal Upstream's and are frozen; `CastableStatic` is satisfied | none |
| ModelIdentifier (XT-8) | `new ModelIdentifier('App\\User', 5, [], 'mysql')` | `getClass()` is `App\User`; `useCollectionClass('X')` returns `this`; `collectionClass` defaults to `null`; `fqcn` is the FQCN | with `useMorphMap()` set and no Relation registered, `getClass()` throws runtime's not-found error |
| exception (XT-8) | `new ViewCompilationException('m')` | `instanceof` runtime `Exception`; message `m`; `fqcn` registered | none |
| doubles (XT-8) | Mockery `Double.for(StatefulGuard)` and PHPUnit `createMock(StatefulGuard)` | `instanceof` StatefulGuard and Guard | none |
| async (XT-8) | the `async-surface.json` entries for the new files | exactly the Design Notes table with its roots, plus `SessionHandlerInterface`'s four; `Console\Kernel.queue` has a `thenable` line | none |
| API surface (XT-9) | spawned `bun run api-surface --details contracts` | exits 0: 0 missing, 0 extra, 0 mismatched, 0 renamed, 0 unexplained, and no detail line | the failure lists every detail line |

</intent-contract>

## Code Map

- `packages/contracts/src/cache/Repository.ts`, `src/filesystem/Filesystem.ts` (statics), `src/events/ShouldBeDiscovered.ts` (the `<X>Static` pattern), `src/queue/EntityNotFoundException.ts` (exception class) and `src/structural/PendingBatch.ts` (a thenable structural): the shapes to copy.
- `packages/contracts/src/support/Renderable.ts`: edited in place to an async `render`.
- `packages/contracts/src/Contract.ts`: `contract(fqcn, members, parents, statics, builtins)`. Read-only.
- `packages/contracts/tests/xaravel/namespaces.test.ts` (XT-5):
  - its async table is at about line 90;
  - `STRUCTURAL_ASYNC` is at line 144;
  - the consumed loop is at lines 531-540.

  Its helpers move to `tests/xaravel/support/contract-namespaces.ts`.
- `packages/contracts/tests/xaravel/api-surface.test.ts` (XT-7): `LATER` and the sanity assertion are at lines 15 and 43. XT-9 can live in the same file or in `api-surface-all.test.ts`.
- `packages/contracts/tests/xaravel/structural.test.ts:35` (XT-6): `NAMESPACES` stays the 19.
- `tools/api-surface/api-surface.ts:196` (`RESERVED`), plus the statics and `<X>Static` reading from #350. Read-only.
- `tools/async-surface/async-surface.ts:113` (tag syntax) and `tools/lint-rules/thenables.ts:40` (`THENABLE_TYPES`; it includes PendingDispatch). Read-only.
- `packages/runtime/src/scope/scope.ts:194` (`frameStatic`) and `packages/runtime/src/registry/registry.ts:149` (`resolveClass`).
- `conformance/upstream/framework/src/Illuminate/Contracts/<Ns>/*.php`: the sources. Implementations are under `src/Illuminate/<Component>/` (async evidence).
- `conformance/tests/xaravel/scaffold.test.ts:228`: `SUBPATH_EXPORTS`. Read-only.

## Tasks & Acceptance

**Execution:**
- `packages/contracts/src/structural/*.ts` -- add the new structural types -- AD-1.2.
- `packages/contracts/src/<sub>/*.ts` -- port the 64 interfaces and 2 classes, with an `index.ts` per subpath -- the core of the Story.
- `packages/contracts/src/support/Renderable.ts` -- make `render` async -- AD-11.
- `packages/contracts/package.json` -- add the 20 `exports` entries.
- `packages/contracts/async-surface.json` -- regenerate.
- `packages/contracts/tests/xaravel/support/contract-namespaces.ts`, `namespaces.test.ts` -- extract the helpers, scope XT-5, and add the Renderable row.
- `packages/contracts/tests/xaravel/web.test.ts` -- XT-contracts-8, covering every matrix row.
- `packages/contracts/tests/xaravel/api-surface.test.ts` -- update XT-7 and add XT-contracts-9.
- `packages/contracts/README.md` -- update the subpath list.
- `conformance/escalations/ESC-10.3-1.md` -- raised in planning.

**Acceptance Criteria:**
- Given the package, when `bun run harness --xaravel --id 'XT-contracts-*'` runs, then XT-contracts-1..9 and -18 pass.
- Given `bun run api-surface --details contracts`, when it runs, then the summary shows 765 matched and 0 unexplained.
- Given the package, when these run: `bun run typecheck`, `bun run lint`, `bun run registration:check`, `bun run escalations:check`, `bun run async-surface --all --check` and the full `bun run harness`, then each passes with no differences.

## Spec Change Log

## Review Triage Log

## Design Notes

**Async table** (AD-6, DIV-1). Roots are named as 10.2 names them. Mail transports are `Symfony\Component\Mailer\Transport\TransportInterface.send`, and session handlers `SessionHandlerInterface.read|write|destroy`.

| Contract | Async methods | `@asyncRoot` |
|---|---|---|
| Auth\Access\Authorizable | can | callback |
| Auth\Access\Gate | allows denies check any authorize inspect raw | callback |
| Auth\CanResetPassword | sendPasswordResetNotification | callback |
| Auth\Guard | validate | Database\ConnectionInterface.select |
| Auth\Guard | setUser | callback (SessionGuard fires `Authenticated`) |
| Auth\MustVerifyEmail | markEmailAsVerified markEmailAsUnverified | Database\ConnectionInterface.update |
| Auth\MustVerifyEmail | sendEmailVerificationNotification | callback |
| Auth\PasswordBroker | sendResetLink reset | Database\ConnectionInterface.select |
| Auth\StatefulGuard | attempt once loginUsingId onceUsingId | Database\ConnectionInterface.select |
| Auth\StatefulGuard | login | SessionHandlerInterface.destroy (`migrate(true)`) |
| Auth\StatefulGuard | logout | Database\ConnectionInterface.update |
| Auth\SupportsBasicAuth | basic onceBasic | Database\ConnectionInterface.select |
| Auth\UserProvider | retrieveById retrieveByToken retrieveByCredentials | Database\ConnectionInterface.select |
| Auth\UserProvider | updateRememberToken rehashPasswordIfRequired | Database\ConnectionInterface.update |
| Broadcasting\Broadcaster | auth broadcast | Broadcasting\Broadcaster.<same> |
| Console\Application | call | callback |
| Console\Kernel | bootstrap handle call terminate | callback |
| Http\Kernel | bootstrap handle terminate | callback |
| Mail\Mailable | send | Symfony\Component\Mailer\Transport\TransportInterface.send |
| Mail\Mailable, Mail\MailQueue | queue / later | Queue\Queue.pushOn / Queue\Queue.laterOn |
| Mail\Mailer | raw send sendNow | Symfony\Component\Mailer\Transport\TransportInterface.send |
| Notifications\Dispatcher, Notifications\Factory | send sendNow | callback |
| Pagination\Paginator, Pagination\CursorPaginator | render | callback (AD-11 render) |
| Routing\Registrar | substituteBindings | callback |
| Routing\Registrar | substituteImplicitBindings | Database\ConnectionInterface.select |
| Routing\ResponseFactory | view | callback (Upstream's Response renders a Renderable on `setContent`) |
| Routing\UrlRoutable | resolveRouteBinding resolveChildRouteBinding | Database\ConnectionInterface.select |
| Session\Session | start | SessionHandlerInterface.read |
| Session\Session | save | SessionHandlerInterface.write |
| Session\Session | invalidate regenerate migrate | SessionHandlerInterface.destroy |
| Support\Renderable | render | callback |
| View\Engine | get | callback |

**Sync, and why:**
- Guard `check`, `guest`, `user`, `id` and `hasUser`: AD-6, loaded-once.
- `Console\Kernel.all` and `output`: AD-5 forbids lazy bootstrap, so Upstream's `bootstrap()` call is a no-op.
- `Console\Kernel.queue`: it returns a thenable `PendingDispatch`, so it gets a `thenable` line and no tag.
- Session reads and writes: loaded-once.
- `UrlGenerator`, `Cookie`, Cast contracts, `Image\Driver`: Image is no AD-6 root, and Intervention works in memory.
- `View\Factory`: all of it, under ESC-10.3-1 option 1.
- `Broadcaster.validAuthenticationResponse`: it signs locally.
- `Http\Kernel.getApplication`.

`Promise` parameters are never accepted where Upstream is sync.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-contracts-*'` -- expected: 10 of 10 pass.
- `bun run api-surface --details contracts` -- expected: no detail lines, and `0 unexplained`.
- `bun run typecheck`, `bun run lint`, `bun run registration:check`, `bun run escalations:check`, `bun run async-surface --all --check` -- expected: each exits 0.
- `bun run harness` -- expected: no differences.
- `bun run fidelity:review review --story 10.3` -- expected: two `pass` verdicts, or rejects routed to Escalations.
