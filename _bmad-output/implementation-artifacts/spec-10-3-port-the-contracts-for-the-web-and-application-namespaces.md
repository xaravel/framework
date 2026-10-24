---
title: 'Story 10.3: Port the contracts for the web and application namespaces'
type: 'feature'
created: '2026-10-23'
status: 'blocked'
baseline_revision: 'ca1fec4b63b3a591869399bfb1d667aea755eae7'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-10-2-port-the-contracts-for-the-core-and-service-namespaces.md'
  - '{project-root}/conformance/escalations/ESC-10.3-1.md'
  - '{project-root}/PORTING.md'
  - '{project-root}/AGENTS.md'
warnings:
  - oversized
deferred:
  - summary: >-
      Renderable.render is now async while Support\Htmlable.toHtml stays sync, so Upstream's View and paginators, which implement both, cannot render in toHtml.
    evidence: |-
      Upstream View implements Htmlable and AbstractPaginator::toHtml returns (string) $this->render(). AD-11 ("Views as strings") makes View#toString throw; toHtml needs the same treatment, decided by the View and Pagination Stories.
    location: >-
      packages/contracts/src/support/Htmlable.ts
    severity: medium
  - summary: >-
      An AD-26 options-object overload is indistinguishable at runtime from a positional array argument when the first optional parameter is an array (ResponseFactory.json/make, StatefulGuard.attempt, Console\Kernel.call, Mailer.send).
    evidence: |-
      AD-26 asks every function with more than one optional parameter to accept an options object, but gives no discrimination rule when the leading optional parameter is itself a PHP array; a payload whose keys equal the option names would be misread. Story 10.2's contracts follow the same rule. What would settle it: an AD-26 discrimination rule, decided where the first implementation lands.
    location: >-
      packages/contracts/src/routing/ResponseFactory.ts
    severity: medium (unverified)
  - summary: >-
      ModelIdentifier's morph-map round trip with a registered Relation is untested.
    evidence: |-
      Registering a Relation under its FQCN would fake the database Component (AGENTS.md); blocked-by:database. Upstream's ModelSerializationTest morph-map cases cover it when the Database/Queue Stories port them.
    location: >-
      packages/contracts/src/database/ModelIdentifier.ts
    severity: low
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

### 2026-10-23 — Review pass
- verdicts: 30 findings — high 0, medium 13, low 12, false 4, maybe-false 1
- findings:
  - **Fidelity Review** (tree 3de98b3b…; 9 findings):
    - `[medium]` `patch` The `ModelIdentifier` morph-map success path is never exercised and `relations` is not asserted (reviewer 1, F-7). — The consequence is narrowed to what runs; the registered-Relation round trip is marked `blocked-by:database`, since registering a fake `Relation` would stub another Component. `relations` is now asserted.
    - `[medium]` `patch` `Console\Kernel.terminate`'s `callback` tag rests on terminating callbacks, which Story 10.2 says are sync (F-9). — The docblock is reworded: the tag rests on the `Terminating` event's dispatch (listeners) and, for HTTP, on terminable middleware.
    - `[medium]` `defer` `View\Factory` keeps `make`/`file` sync under the pending ESC-10.3-1 (F-9). — Waits on ESC-10.3-1 (Maintainer: a new DIV-1 clause).
    - `[medium]` `patch` The prompt lacks AD-11, which `Engine.get`'s tag relies on (F-9). — Each render docblock now cites AD-11's Compilation bullet by its lead, so the tool includes it.
    - `[medium]` `defer` XT-contracts-8 asserts that no `thenable` line exists, while the matrix row wants `Console\Kernel.queue`'s (F-7). — Waits on ESC-10.3-2 (`tools/` is a Protected Path).
    - `[medium]` `patch` The ModelIdentifier "ported in full" claim is untested on the morph path (reviewer 2, F-7). — Same fix as the reviewer 1 row.
    - `[low]` `patch` The consequence omits the `NOT_STRUCTURAL` exemption for Relation (F-7). — The consequence now states it.
    - `[medium]` `defer` `View\Factory` make/file sync with no ruling (reviewer 2, F-9). — ESC-10.3-1.
    - `[medium]` `patch` The prompt lacks AD-11 for Renderable, Paginator and ResponseFactory (reviewer 2, F-9). — Same fix as the AD-11 row above.
  - **Blind Hunter** (10 findings):
    - `[medium]` `defer` `Renderable.render` is async while `Htmlable.toHtml` and `__toString` stay sync, so a View or paginator implementing both cannot render in `toHtml`. — This is real for the View and Pagination Stories. AD-11 ("Views as strings") already makes `toString` throw, and `toHtml` needs the same ruling there. Deferred to those Stories.
    - `[low]` `reject` `Guard.setUser` being async ripples into `actingAs`, and `user()` also fires the event. — AD-6 exempts loaded-once reads only. `setUser` dispatches `Authenticated` on every SessionGuard call, so strict derivation makes it async. The `actingAs` impact belongs to the Auth Story.
    - `[medium]` `patch` `Http\Kernel.terminate` gives the same unsupported rationale. — Grouped with the Console kernel row and reworded.
    - `[low]` `patch` ESC-10.3-2 misses `getOneOfManySubQuery` and the lint `registeredFqcn` blind spot. — Added to its evidence.
    - `[false]` `reject` ESC-10.3-2 claims to stop only one row. — An Escalation stops its Test IDs. The Story ends `blocked` on XT-contracts-8, as Auto Run Result records.
    - `[false]` `reject` The spec is out of step with the build (status, `stories/10.3.md`). — Finalize writes the blocked status, the manifest line and the run result. A matrix edit would edit this build's spec, which is rejected.
    - `[medium]` `patch` The ModelIdentifier key order is sorted before the check and `relations` is unasserted. — The unsorted own-key order is now asserted.
    - `[low]` `patch` The README omits the pending items. — One sentence added.
    - `[low]` `reject` The Notifications overloads are redundant. — The first overload documents `Collection` for implementers, since lint rejects `Collection | unknown`. It is harmless.
    - `[low]` `reject` XT-7's bound is weak and XT-8 pins source text with a regex. — The detail-line filter is XT-7's real guard, since any unmatched row in the 19 namespaces prints a line. The regex goes away when ESC-10.3-2 is ruled.
  - **Edge Case Hunter** (7 findings):
    - `[maybe-false]` `defer` `ResponseFactory.json`'s options overload is ambiguous with an array payload. — The same AD-26 rule applies to 10.2's contracts. The discrimination rule belongs to AD-26's implementers. If real, medium (unverified).
    - `[low]` `defer` `ResponseFactory.make`: the same AD-26 ambiguity. — Grouped with the row above.
    - `[low]` `defer` `StatefulGuard.attempt`: the same. — Grouped.
    - `[low]` `defer` `Console\Kernel.call`: the same. — Grouped.
    - `[low]` `defer` `Mailer.send`: the same. — Grouped.
    - `[medium]` `patch` The narrowed catch-all leaves structural entries unchecked. — XT-8 now asserts that every non-PSR entry is in XT-5's or XT-8's scope.
    - `[false]` `reject` XT-7's bound. — As the Blind Hunter row: the detail-line filter guards the 19 namespaces.
  - **Verification Gap** (3 findings):
    - `[medium]` `patch` The catch-all gap. — Same entry as the Edge Case Hunter's.
    - `[low]` `defer` The ModelIdentifier positive path. — `blocked-by:database`, as above.
    - `[false]` `reject` The `queue` regex check (other finding). — The reviewer itself does not file it; ESC-10.3-2 covers it.
  - **Intent Alignment** (1 finding):
    - `[low]` `patch` No `hasBrand` call on a 10.3 marker, though the AC names `hasBrand`. — XT-8 adds `hasBrand` checks.

### 2026-10-24 — Review pass (Finalize re-check: Fidelity Review on the patched tree)
- verdicts: 4 findings — high 0, medium 4, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `defer` P-5 stands (reviewer 1, F-7): XT-contracts-8 asserts no `thenable` line. — Waits on ESC-10.3-2.
  - `[medium]` `defer` P-3/P-8 stand (reviewer 1, F-9): `View\Factory` make/file are sync without a ruling. — Waits on ESC-10.3-1.
  - `[medium]` `defer` P-5 stands (reviewer 2, F-7). — ESC-10.3-2.
  - `[medium]` `defer` P-3/P-8 stand (reviewer 2, F-9). — ESC-10.3-1.
  - Both reviewers marked P-1, P-2, P-4, P-6, P-7 and P-9 fixed. Every item other than these two passes or is n/a with both reviewers at tree b5577750c3ff3d61d8aa138ba9808d1c5c601f9b.

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

## Auto Run Result

Status: blocked

Blocking condition: two Escalations, both on XT-contracts-8.
- **`conformance/escalations/ESC-10.3-1.md`** (`divergence`). Are `View\Factory::make/file` sync when their `creating:` creators are events?
  - The port uses option 1, which needs a new DIV-1 clause. So it waits on the Maintainer.
- **`conformance/escalations/ESC-10.3-2.md`** (`protected-path`). The async-surface tool, and lint's `registeredFqcn`, cannot see a structural thenable (`Console\Kernel.queue` → `PendingDispatch`).
  - The fix is in `tools/`.

On the patched tree b5577750c3ff3d61d8aa138ba9808d1c5c601f9b, both Fidelity reviewers fail only these two Escalations' findings (F-7 P-5, F-9 P-3/P-8). Every other item passes or is n/a.

**What changed**
- **Contracts.** `packages/contracts/src/<sub>/` covers 20 new subpaths, each with an `index.ts`, and holds 64 contract interfaces with their tokens.
  - Each contract has its Upstream members, parents and AD-26 options overloads, plus the reserved-word renames.
  - `PasswordBroker` carries its statics, and `Castable` exports `CastableStatic`.
  - The async tags follow the Design Notes table.
- **Classes.** `src/database/ModelIdentifier.ts` holds its morph-map flag through `frameStatic` and finds `Relation` through `resolveClass`. `src/view/ViewCompilationException.ts` is new.
- **Structural types.** `src/structural/` gains 28 types, including `SessionHandlerInterface`, which carries the session-handler roots.
- **`src/support/Renderable.ts`.** `render()` now returns `Promise<string>` with `@asyncRoot callback` (AD-11, Compilation).
- **Package files.** `package.json` gains 20 `exports`. `async-surface.json` was regenerated. `README.md` is updated.
- **Tests.**
  - `tests/xaravel/support/contract-namespaces.ts` holds the helpers XT-5, -6 and -8 share, and both tests' scopes.
  - `namespaces.test.ts` (XT-5) is scoped to the 19 namespaces, plus the Renderable row.
  - `web.test.ts` is new (XT-contracts-8).
  - `api-surface.test.ts` updates XT-7 and adds XT-contracts-9.
- **Escalations.** `ESC-10.3-1.md` and `ESC-10.3-2.md` are new.

**Review**
- First pass: 30 findings (0 high, 13 medium, 12 low, 4 false, 1 maybe-false).
  - Patched: 15 rows (11 medium and 4 low).
  - Deferred: 4 rows to the two Escalations, and 7 rows (3 entries) to the frontmatter `deferred` list: Htmlable against an async Renderable, the AD-26 options ambiguity, and the ModelIdentifier round trip (`blocked-by:database`).
  - Rejected: 4 false and 3 low, each with its reason in the triage log.
- Finalize re-check: 4 findings, all deferred to the Escalations.
- Follow-up review recommended: no. No high finding was patched. The medium patches are tests, docblocks and an Escalation's evidence. The Fidelity Review re-checked them on tree b5577750, and they pass there.

**Verification**
- `bun run harness`: XARAVEL 354 tests, 349 passed, 0 failed, 5 skipped. 11 Variants: 4 run, 7 NOT-RUN. differ=0.
- `bun run harness --xaravel --id 'XT-contracts-*'`: 10 of 10 passed.
- `bun run api-surface contracts`: 765 Upstream, 765 matched, 0 unexplained.
- `bun run typecheck`, `lint`, `registration:check`, `escalations:check` and `async-surface --all --check`: each exits 0.
- `bun run fidelity:review status --story 10.3`: not current, because both rejects stand on the Escalations.
- `bun run story:check 10.3`: not run.

**Residual risks**
- When the two Escalations are ruled, the result may change `View\Factory` and XT-contracts-8's thenable assertion.
- `Htmlable.toHtml` is sync while `View.render` is async. That is for the View and Pagination Stories.
- The contract files were generated by a script outside the repository. A resumed run edits them in place.

## Fidelity Review

### Reviewer 1: reject at tree 3de98b3b9d5e88c5af6a0e115f97fbc8963feecc

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `ca1fec4b63b3a591869399bfb1d667aea755eae7`, on 2026-10-24T06:55:14.396Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest and diff add or change no Ported Tests, so there are no Upstream assertions to match. |
| F-2: No expected value is weakened | pass | The supplied test changes retain exact comparisons; no Upstream expected value or expected exception is weakened. XT-contracts-7 replaces an obsolete unported-namespace check with a coverage check. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so no Upstream assertion floor applies. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no assertion adapted markers or Expectations adapted fields to compare with DIV clauses. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The fixture evidence identifies no Oracle error fixture relied on by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared the touched Xaravel Tests with their consequence strings. XT-contracts-8 checks less than its claim that ModelIdentifier is ported in full. |
| F-8: No stub, fake or partial implementation of another Component | pass | The implementation stays within contracts. Structural interfaces describe external types under AD-1.2, and ModelIdentifier resolves Relation rather than implementing its behaviour. |
| F-9: Every `@asyncRoot` tag is true | fail | Compared the changed declarations and tags with AD-6 and DIV-1. The supplied evidence does not justify every callback tag or the untagged view-creation methods. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes, so there are no request inputs to compare. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/web.test.ts`: XT-contracts-8 never exercises successful morph-map serialization or resolution: enabling the flag only tests an unregistered Relation error. Add coverage using the real registered Relation when available, including constructor alias conversion, getClass resolution and fallback, and assert the relations property retains its supplied value; otherwise narrow the consequence and explicitly account for the blocked coverage.
- **F-9** `packages/contracts/src/console/Kernel.ts`: terminate is tagged callback on the claim that application terminating callbacks and terminable middleware may be async. The supplied Foundation Application contract explicitly requires synchronous terminating callbacks, and no evidence establishes console terminable middleware. Supply the actual permitted async callback path or keep this method synchronous and regenerate its surface.
- **F-9** `packages/contracts/src/view/Factory.ts`: make and file defer the creating-event dispatch under an explicitly pending recommendation, but decisions/ESC-10.3-1.md is unavailable. Supply an approved ruling permitting that timing and synchronous seam, or preserve awaited event dispatch with the appropriate async declarations and tags.
- **F-9** `packages/contracts/src/view/Engine.ts`: The callback tag depends on AD-11's compiled-template Promise contract, but AD-11's text is absent from the supplied evidence. Include that rule to substantiate this tag and the related rendering tags in Renderable, the paginator contracts and ResponseFactory.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"3de98b3b9d5e88c5af6a0e115f97fbc8963feecc","base":"ca1fec4b63b3a591869399bfb1d667aea755eae7","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T06:55:14.396Z","items":[{"id":"F-1","result":"n/a","note":"The manifest and diff add or change no Ported Tests, so there are no Upstream assertions to match.","findings":[]},{"id":"F-2","result":"pass","note":"The supplied test changes retain exact comparisons; no Upstream expected value or expected exception is weakened. XT-contracts-7 replaces an obsolete unported-namespace check with a coverage check.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so no Upstream assertion floor applies.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no assertion adapted markers or Expectations adapted fields to compare with DIV clauses.","findings":[]},{"id":"F-6","result":"n/a","note":"The fixture evidence identifies no Oracle error fixture relied on by this Story.","findings":[]},{"id":"F-7","result":"fail","note":"Compared the touched Xaravel Tests with their consequence strings. XT-contracts-8 checks less than its claim that ModelIdentifier is ported in full.","findings":[{"path":"packages/contracts/tests/xaravel/web.test.ts","detail":"XT-contracts-8 never exercises successful morph-map serialization or resolution: enabling the flag only tests an unregistered Relation error. Add coverage using the real registered Relation when available, including constructor alias conversion, getClass resolution and fallback, and assert the relations property retains its supplied value; otherwise narrow the consequence and explicitly account for the blocked coverage."}]},{"id":"F-8","result":"pass","note":"The implementation stays within contracts. Structural interfaces describe external types under AD-1.2, and ModelIdentifier resolves Relation rather than implementing its behaviour.","findings":[]},{"id":"F-9","result":"fail","note":"Compared the changed declarations and tags with AD-6 and DIV-1. The supplied evidence does not justify every callback tag or the untagged view-creation methods.","findings":[{"path":"packages/contracts/src/console/Kernel.ts","detail":"terminate is tagged callback on the claim that application terminating callbacks and terminable middleware may be async. The supplied Foundation Application contract explicitly requires synchronous terminating callbacks, and no evidence establishes console terminable middleware. Supply the actual permitted async callback path or keep this method synchronous and regenerate its surface."},{"path":"packages/contracts/src/view/Factory.ts","detail":"make and file defer the creating-event dispatch under an explicitly pending recommendation, but decisions/ESC-10.3-1.md is unavailable. Supply an approved ruling permitting that timing and synchronous seam, or preserve awaited event dispatch with the appropriate async declarations and tags."},{"path":"packages/contracts/src/view/Engine.ts","detail":"The callback tag depends on AD-11's compiled-template Promise contract, but AD-11's text is absent from the supplied evidence. Include that rule to substantiate this tag and the related rendering tags in Renderable, the paginator contracts and ResponseFactory."}]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes, so there are no request inputs to compare.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 3de98b3b9d5e88c5af6a0e115f97fbc8963feecc

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `ca1fec4b63b3a591869399bfb1d667aea755eae7`, on 2026-10-24T06:55:14.396Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Test IDs (test_ids is empty) and the diff adds or changes no Ported Test, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test is added or changed, so no expected value is compared against Upstream. Xaravel Test bodies are judged under F-7. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there is no assertion count to compare. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No '// adapted:DIV-<n>.<k>' marker or Expectations 'adapted' field is added. Attachment.ts mentions DIV-12.2 in a header comment, which is not an adaptation marker on an assertion. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no error fixture, base or changed, for any assigned request, and the Story relies on no Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared each touched xaravelTest body with its consequence string. XT-contracts-5, XT-contracts-6, XT-contracts-7 and XT-contracts-9 check what they declare: XT-7's assertGreaterThanOrEqual(memberRows, matched) matches its new string, and XT-9 asserts the counts equal the total rows and checks every zero-count field. XT-contracts-8 checks less than it claims and asserts a gap the spec does not accept. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every change is in packages/contracts: tokens, AD-1.2 structural interfaces, and the Upstream contract classes ModelIdentifier and ViewCompilationException. ModelIdentifier resolves Relation through the Class Registry at call time and adds no stub or fake of the database component. No hard-coded return of another component's behaviour was found. |
| F-9: Every `@asyncRoot` tag is true | fail | Checked every new @​asyncRoot tag and every untagged export in the changed source files against AD-6.2, AD-6.13, DIV-1 and ESC-6.4-1. The database/session/mail/queue/broadcasting roots and the callback tags on Gate, Authorizable, Guard.setUser, the notifications, the console and http kernels and Registrar.substituteBindings are consistent with the Upstream drivers and the derivation rule. Two problems remain: an untagged method that runs callbacks DIV-1 allows to be async, and view-render tags whose cited rule is missing from the prompt. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/web.test.ts`: XT-contracts-8 asserts that no file has a 'thenable' line ('Assert.assertSame(undefined, entry.thenable, ...)') and that Console\Kernel.queue is missing from the surface. The Story spec's async matrix row requires 'Console\Kernel.queue' to have a 'thenable' line. ESC-10.3-2 is open and no ruling exists (decisions/ESC-10.3-2.md is unavailable). The test therefore enforces the gap instead of the criterion. Wait for the ruling: either the tool fix plus a positive assertion of the line, or an approved spec amendment.
- **F-7** `packages/contracts/tests/xaravel/web.test.ts`: The consequence claims ModelIdentifier is 'ported in full', but the body only exercises the morph-map path with no Relation registered (it expects the 'Class not found' error). It never registers a Relation double to check that the constructor stores getMorphAlias(className) and that getClass() returns getMorphedModel(class) ?? class. Add those checks, or narrow the consequence.
- **F-7** `packages/contracts/tests/xaravel/web.test.ts`: The consequence says every concrete class an Upstream file names is 'a src/structural/ type (or a contract token)'. NOT_STRUCTURAL maps Illuminate\Database\Eloquent\Relations\Relation to null and skips it, so a third category exists that the string does not declare. Either state the exemption (resolved through the Class Registry at call time) in the consequence, or check it.
- **F-9** `packages/contracts/src/view/Factory.ts`: 'make()' and 'file()' are untagged and sync. Upstream's Factory::make/file call callCreator, which dispatches the 'creating:' event to view creator callbacks, and DIV-1 lets those be async. AD-6.2 then makes the methods async ('async on any path is async on all paths'). The file keeps them sync under 'ESC-10.3-1 recommended option 1', but decisions/ESC-10.3-1.md does not exist, so no approved ruling supports the departure. Wait for the ruling, or tag the methods '@​asyncRoot callback' and return a Promise.
- **F-9** `packages/contracts/src/support/Renderable.ts`: 'render()' changed from sync to 'Promise<string>' with '@​asyncRoot callback'; Engine.get, Paginator.render, CursorPaginator.render and ResponseFactory.view follow the same reasoning. The only justification given is AD-11 ('a render is a compiled template module's Promise<string>'), whose text is not in the prompt, while AD-6.1 and DIV-1 list view loading as sync. The evidence needed to confirm these callback tags is missing. Cite the AD-11 rule bullet by its lead so the review carries it, or a decision record that makes a view render async, so the tag can be checked.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"3de98b3b9d5e88c5af6a0e115f97fbc8963feecc","base":"ca1fec4b63b3a591869399bfb1d667aea755eae7","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T06:55:14.396Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Test IDs (test_ids is empty) and the diff adds or changes no Ported Test, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is added or changed, so no expected value is compared against Upstream. Xaravel Test bodies are judged under F-7.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there is no assertion count to compare.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No `// adapted:DIV-<n>.<k>` marker or Expectations `adapted` field is added. Attachment.ts mentions DIV-12.2 in a header comment, which is not an adaptation marker on an assertion.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no error fixture, base or changed, for any assigned request, and the Story relies on no Oracle fixture.","findings":[]},{"id":"F-7","result":"fail","note":"Compared each touched xaravelTest body with its consequence string. XT-contracts-5, XT-contracts-6, XT-contracts-7 and XT-contracts-9 check what they declare: XT-7's assertGreaterThanOrEqual(memberRows, matched) matches its new string, and XT-9 asserts the counts equal the total rows and checks every zero-count field. XT-contracts-8 checks less than it claims and asserts a gap the spec does not accept.","findings":[{"path":"packages/contracts/tests/xaravel/web.test.ts","detail":"XT-contracts-8 asserts that no file has a `thenable` line (`Assert.assertSame(undefined, entry.thenable, ...)`) and that Console\\Kernel.queue is missing from the surface. The Story spec's async matrix row requires `Console\\Kernel.queue` to have a `thenable` line. ESC-10.3-2 is open and no ruling exists (decisions/ESC-10.3-2.md is unavailable). The test therefore enforces the gap instead of the criterion. Wait for the ruling: either the tool fix plus a positive assertion of the line, or an approved spec amendment."},{"path":"packages/contracts/tests/xaravel/web.test.ts","detail":"The consequence claims ModelIdentifier is 'ported in full', but the body only exercises the morph-map path with no Relation registered (it expects the 'Class not found' error). It never registers a Relation double to check that the constructor stores getMorphAlias(className) and that getClass() returns getMorphedModel(class) ?? class. Add those checks, or narrow the consequence."},{"path":"packages/contracts/tests/xaravel/web.test.ts","detail":"The consequence says every concrete class an Upstream file names is 'a src/structural/ type (or a contract token)'. NOT_STRUCTURAL maps Illuminate\\Database\\Eloquent\\Relations\\Relation to null and skips it, so a third category exists that the string does not declare. Either state the exemption (resolved through the Class Registry at call time) in the consequence, or check it."}]},{"id":"F-8","result":"pass","note":"Every change is in packages/contracts: tokens, AD-1.2 structural interfaces, and the Upstream contract classes ModelIdentifier and ViewCompilationException. ModelIdentifier resolves Relation through the Class Registry at call time and adds no stub or fake of the database component. No hard-coded return of another component's behaviour was found.","findings":[]},{"id":"F-9","result":"fail","note":"Checked every new @asyncRoot tag and every untagged export in the changed source files against AD-6.2, AD-6.13, DIV-1 and ESC-6.4-1. The database/session/mail/queue/broadcasting roots and the callback tags on Gate, Authorizable, Guard.setUser, the notifications, the console and http kernels and Registrar.substituteBindings are consistent with the Upstream drivers and the derivation rule. Two problems remain: an untagged method that runs callbacks DIV-1 allows to be async, and view-render tags whose cited rule is missing from the prompt.","findings":[{"path":"packages/contracts/src/view/Factory.ts","detail":"`make()` and `file()` are untagged and sync. Upstream's Factory::make/file call callCreator, which dispatches the `creating:` event to view creator callbacks, and DIV-1 lets those be async. AD-6.2 then makes the methods async ('async on any path is async on all paths'). The file keeps them sync under 'ESC-10.3-1 recommended option 1', but decisions/ESC-10.3-1.md does not exist, so no approved ruling supports the departure. Wait for the ruling, or tag the methods `@asyncRoot callback` and return a Promise."},{"path":"packages/contracts/src/support/Renderable.ts","detail":"`render()` changed from sync to `Promise<string>` with `@asyncRoot callback`; Engine.get, Paginator.render, CursorPaginator.render and ResponseFactory.view follow the same reasoning. The only justification given is AD-11 ('a render is a compiled template module's Promise<string>'), whose text is not in the prompt, while AD-6.1 and DIV-1 list view loading as sync. The evidence needed to confirm these callback tags is missing. Cite the AD-11 rule bullet by its lead so the review carries it, or a decision record that makes a view render async, so the tag can be checked."}]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree b5577750c3ff3d61d8aa138ba9808d1c5c601f9b

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `ca1fec4b63b3a591869399bfb1d667aea755eae7`, on 2026-10-24T07:07:01.003Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and none are added or changed. |
| F-2: No expected value is weakened | pass | Compared the supplied expectations with Upstream and the prior diff. PasswordBroker constants retain exact values; no Upstream expected value or exception expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no assertion adapted markers or Expectations adapted fields to compare with DIV clauses. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory contains no Oracle error fixture relied upon by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared the touched Xaravel Test bodies with their consequences and the standing findings. Morph-map claims are narrowed appropriately, but XT-contracts-8 still enforces the unresolved thenable gap. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the implementation with the contracts component scope. Structural declarations introduce no other component's runtime behavior; ModelIdentifier resolves the real Relation through the Registry rather than implementing a fake morph map. |
| F-9: Every `@asyncRoot` tag is true | fail | Compared source declarations and tags with AD-6, DIV-1 and the supplied AD-11 rules. Rendering tags now have supporting evidence, and console termination identifies an event-listener path. View Factory still relies on an unapproved timing change. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes, so there are no setup or exprs inputs to compare. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/web.test.ts`: P-5 remains unresolved: XT-contracts-8 rejects every thenable line although the Story matrix requires Console\Kernel.queue's thenable line. Supply an approved ESC-10.3-2 ruling and implement its outcome: positively assert the generated line after the tool fix, or supply the approved spec amendment. An open escalation does not resolve the standing rejection.
- **F-9** `packages/contracts/src/view/Factory.ts`: P-3 and P-8 remain unresolved: make/file remain synchronous and defer creating-event dispatch under a pending recommendation, while decisions/ESC-10.3-1.md is unavailable. Supply an approved ruling permitting that timing and seam, or preserve awaited creator dispatch with Promise returns, @​asyncRoot callback tags and regenerated surface entries.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/contracts/tests/xaravel/web.test.ts`: XT-contracts-8 never exercises successful morph-map serialization or resolution: enabling the flag only tests an unregistered Relation error. Add coverage using the real registered Relation when available, including constructor alias conversion, getClass resolution and fallback, and assert the relations property retains its supplied value; otherwise narrow the consequence and explicitly account for the blocked coverage. **fixed**: The consequence explicitly blocks the registered-Relation round trip on database, limits its morph-map claim to the missing-class path, and now asserts that relations retains the supplied value.
- **P-2** (reviewer 1, F-9) `packages/contracts/src/console/Kernel.ts`: terminate is tagged callback on the claim that application terminating callbacks and terminable middleware may be async. The supplied Foundation Application contract explicitly requires synchronous terminating callbacks, and no evidence establishes console terminable middleware. Supply the actual permitted async callback path or keep this method synchronous and regenerate its surface. **fixed**: Console Kernel termination now identifies dispatch of the Terminating event to potentially async listeners under AD-6 derivation, independently of synchronous application terminating callbacks.
- **P-3** (reviewer 1, F-9) `packages/contracts/src/view/Factory.ts`: make and file defer the creating-event dispatch under an explicitly pending recommendation, but decisions/ESC-10.3-1.md is unavailable. Supply an approved ruling permitting that timing and synchronous seam, or preserve awaited event dispatch with the appropriate async declarations and tags. **not fixed**: View Factory still uses the pending synchronous recommendation; no approved ESC-10.3-1 ruling is supplied.
- **P-4** (reviewer 1, F-9) `packages/contracts/src/view/Engine.ts`: The callback tag depends on AD-11's compiled-template Promise contract, but AD-11's text is absent from the supplied evidence. Include that rule to substantiate this tag and the related rendering tags in Renderable, the paginator contracts and ResponseFactory. **fixed**: AD-11's Compilation and Views as strings rules are supplied and substantiate asynchronous compiled-template rendering.
- **P-5** (reviewer 2, F-7) `packages/contracts/tests/xaravel/web.test.ts`: XT-contracts-8 asserts that no file has a 'thenable' line ('Assert.assertSame(undefined, entry.thenable, ...)') and that Console\Kernel.queue is missing from the surface. The Story spec's async matrix row requires 'Console\Kernel.queue' to have a 'thenable' line. ESC-10.3-2 is open and no ruling exists (decisions/ESC-10.3-2.md is unavailable). The test therefore enforces the gap instead of the criterion. Wait for the ruling: either the tool fix plus a positive assertion of the line, or an approved spec amendment. **not fixed**: The test still prohibits thenable lines, and ESC-10.3-2 remains open without an approved tool fix or spec amendment.
- **P-6** (reviewer 2, F-7) `packages/contracts/tests/xaravel/web.test.ts`: The consequence claims ModelIdentifier is 'ported in full', but the body only exercises the morph-map path with no Relation registered (it expects the 'Class not found' error). It never registers a Relation double to check that the constructor stores getMorphAlias(className) and that getClass() returns getMorphedModel(class) ?? class. Add those checks, or narrow the consequence. **fixed**: The consequence no longer claims ModelIdentifier is ported in full; it explicitly accounts for blocked successful morph-map coverage.
- **P-7** (reviewer 2, F-7) `packages/contracts/tests/xaravel/web.test.ts`: The consequence says every concrete class an Upstream file names is 'a src/structural/ type (or a contract token)'. NOT_STRUCTURAL maps Illuminate\Database\Eloquent\Relations\Relation to null and skips it, so a third category exists that the string does not declare. Either state the exemption (resolved through the Class Registry at call time) in the consequence, or check it. **fixed**: The consequence now declares Relation as a third category resolved through the Class Registry at call time.
- **P-8** (reviewer 2, F-9) `packages/contracts/src/view/Factory.ts`: 'make()' and 'file()' are untagged and sync. Upstream's Factory::make/file call callCreator, which dispatches the 'creating:' event to view creator callbacks, and DIV-1 lets those be async. AD-6.2 then makes the methods async ('async on any path is async on all paths'). The file keeps them sync under 'ESC-10.3-1 recommended option 1', but decisions/ESC-10.3-1.md does not exist, so no approved ruling supports the departure. Wait for the ruling, or tag the methods '@​asyncRoot callback' and return a Promise. **not fixed**: make/file remain untagged and synchronous without the required approved ruling.
- **P-9** (reviewer 2, F-9) `packages/contracts/src/support/Renderable.ts`: 'render()' changed from sync to 'Promise<string>' with '@​asyncRoot callback'; Engine.get, Paginator.render, CursorPaginator.render and ResponseFactory.view follow the same reasoning. The only justification given is AD-11 ('a render is a compiled template module's Promise<string>'), whose text is not in the prompt, while AD-6.1 and DIV-1 list view loading as sync. The evidence needed to confirm these callback tags is missing. Cite the AD-11 rule bullet by its lead so the review carries it, or a decision record that makes a view render async, so the tag can be checked. **fixed**: Rendering docblocks cite AD-11's named rules, whose supplied text establishes Promise-returning template rendering and awaited view conversion.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"b5577750c3ff3d61d8aa138ba9808d1c5c601f9b","base":"ca1fec4b63b3a591869399bfb1d667aea755eae7","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T07:07:01.003Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and none are added or changed.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the supplied expectations with Upstream and the prior diff. PasswordBroker constants retain exact values; no Upstream expected value or exception expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no assertion adapted markers or Expectations adapted fields to compare with DIV clauses.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory contains no Oracle error fixture relied upon by this Story.","findings":[]},{"id":"F-7","result":"fail","note":"Compared the touched Xaravel Test bodies with their consequences and the standing findings. Morph-map claims are narrowed appropriately, but XT-contracts-8 still enforces the unresolved thenable gap.","findings":[{"path":"packages/contracts/tests/xaravel/web.test.ts","detail":"P-5 remains unresolved: XT-contracts-8 rejects every thenable line although the Story matrix requires Console\\Kernel.queue's thenable line. Supply an approved ESC-10.3-2 ruling and implement its outcome: positively assert the generated line after the tool fix, or supply the approved spec amendment. An open escalation does not resolve the standing rejection."}]},{"id":"F-8","result":"pass","note":"Compared the implementation with the contracts component scope. Structural declarations introduce no other component's runtime behavior; ModelIdentifier resolves the real Relation through the Registry rather than implementing a fake morph map.","findings":[]},{"id":"F-9","result":"fail","note":"Compared source declarations and tags with AD-6, DIV-1 and the supplied AD-11 rules. Rendering tags now have supporting evidence, and console termination identifies an event-listener path. View Factory still relies on an unapproved timing change.","findings":[{"path":"packages/contracts/src/view/Factory.ts","detail":"P-3 and P-8 remain unresolved: make/file remain synchronous and defer creating-event dispatch under a pending recommendation, while decisions/ESC-10.3-1.md is unavailable. Supply an approved ruling permitting that timing and seam, or preserve awaited creator dispatch with Promise returns, @asyncRoot callback tags and regenerated surface entries."}]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes, so there are no setup or exprs inputs to compare.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/web.test.ts","detail":"XT-contracts-8 never exercises successful morph-map serialization or resolution: enabling the flag only tests an unregistered Relation error. Add coverage using the real registered Relation when available, including constructor alias conversion, getClass resolution and fallback, and assert the relations property retains its supplied value; otherwise narrow the consequence and explicitly account for the blocked coverage.","fixed":true,"note":"The consequence explicitly blocks the registered-Relation round trip on database, limits its morph-map claim to the missing-class path, and now asserts that relations retains the supplied value."},{"id":"P-2","reviewer":1,"item":"F-9","path":"packages/contracts/src/console/Kernel.ts","detail":"terminate is tagged callback on the claim that application terminating callbacks and terminable middleware may be async. The supplied Foundation Application contract explicitly requires synchronous terminating callbacks, and no evidence establishes console terminable middleware. Supply the actual permitted async callback path or keep this method synchronous and regenerate its surface.","fixed":true,"note":"Console Kernel termination now identifies dispatch of the Terminating event to potentially async listeners under AD-6 derivation, independently of synchronous application terminating callbacks."},{"id":"P-3","reviewer":1,"item":"F-9","path":"packages/contracts/src/view/Factory.ts","detail":"make and file defer the creating-event dispatch under an explicitly pending recommendation, but decisions/ESC-10.3-1.md is unavailable. Supply an approved ruling permitting that timing and synchronous seam, or preserve awaited event dispatch with the appropriate async declarations and tags.","fixed":false,"note":"View Factory still uses the pending synchronous recommendation; no approved ESC-10.3-1 ruling is supplied."},{"id":"P-4","reviewer":1,"item":"F-9","path":"packages/contracts/src/view/Engine.ts","detail":"The callback tag depends on AD-11's compiled-template Promise contract, but AD-11's text is absent from the supplied evidence. Include that rule to substantiate this tag and the related rendering tags in Renderable, the paginator contracts and ResponseFactory.","fixed":true,"note":"AD-11's Compilation and Views as strings rules are supplied and substantiate asynchronous compiled-template rendering."},{"id":"P-5","reviewer":2,"item":"F-7","path":"packages/contracts/tests/xaravel/web.test.ts","detail":"XT-contracts-8 asserts that no file has a `thenable` line (`Assert.assertSame(undefined, entry.thenable, ...)`) and that Console\\Kernel.queue is missing from the surface. The Story spec's async matrix row requires `Console\\Kernel.queue` to have a `thenable` line. ESC-10.3-2 is open and no ruling exists (decisions/ESC-10.3-2.md is unavailable). The test therefore enforces the gap instead of the criterion. Wait for the ruling: either the tool fix plus a positive assertion of the line, or an approved spec amendment.","fixed":false,"note":"The test still prohibits thenable lines, and ESC-10.3-2 remains open without an approved tool fix or spec amendment."},{"id":"P-6","reviewer":2,"item":"F-7","path":"packages/contracts/tests/xaravel/web.test.ts","detail":"The consequence claims ModelIdentifier is 'ported in full', but the body only exercises the morph-map path with no Relation registered (it expects the 'Class not found' error). It never registers a Relation double to check that the constructor stores getMorphAlias(className) and that getClass() returns getMorphedModel(class) ?? class. Add those checks, or narrow the consequence.","fixed":true,"note":"The consequence no longer claims ModelIdentifier is ported in full; it explicitly accounts for blocked successful morph-map coverage."},{"id":"P-7","reviewer":2,"item":"F-7","path":"packages/contracts/tests/xaravel/web.test.ts","detail":"The consequence says every concrete class an Upstream file names is 'a src/structural/ type (or a contract token)'. NOT_STRUCTURAL maps Illuminate\\Database\\Eloquent\\Relations\\Relation to null and skips it, so a third category exists that the string does not declare. Either state the exemption (resolved through the Class Registry at call time) in the consequence, or check it.","fixed":true,"note":"The consequence now declares Relation as a third category resolved through the Class Registry at call time."},{"id":"P-8","reviewer":2,"item":"F-9","path":"packages/contracts/src/view/Factory.ts","detail":"`make()` and `file()` are untagged and sync. Upstream's Factory::make/file call callCreator, which dispatches the `creating:` event to view creator callbacks, and DIV-1 lets those be async. AD-6.2 then makes the methods async ('async on any path is async on all paths'). The file keeps them sync under 'ESC-10.3-1 recommended option 1', but decisions/ESC-10.3-1.md does not exist, so no approved ruling supports the departure. Wait for the ruling, or tag the methods `@asyncRoot callback` and return a Promise.","fixed":false,"note":"make/file remain untagged and synchronous without the required approved ruling."},{"id":"P-9","reviewer":2,"item":"F-9","path":"packages/contracts/src/support/Renderable.ts","detail":"`render()` changed from sync to `Promise<string>` with `@asyncRoot callback`; Engine.get, Paginator.render, CursorPaginator.render and ResponseFactory.view follow the same reasoning. The only justification given is AD-11 ('a render is a compiled template module's Promise<string>'), whose text is not in the prompt, while AD-6.1 and DIV-1 list view loading as sync. The evidence needed to confirm these callback tags is missing. Cite the AD-11 rule bullet by its lead so the review carries it, or a decision record that makes a view render async, so the tag can be checked.","fixed":true,"note":"Rendering docblocks cite AD-11's named rules, whose supplied text establishes Promise-returning template rendering and awaited view conversion."}]}
```

### Reviewer 2: reject at tree b5577750c3ff3d61d8aa138ba9808d1c5c601f9b

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `ca1fec4b63b3a591869399bfb1d667aea755eae7`, on 2026-10-24T07:07:01.003Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Test IDs and the change adds or changes no Ported Test. |
| F-2: No expected value is weakened | n/a | There is no Ported Test, so there is no Upstream expected value to compare against. |
| F-3: No assertion is removed without a DIV clause | n/a | There is no Ported Test, so there are no assertion counts to compare. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no '// adapted:DIV-' marker and no Expectations adapted field. Attachment.ts cites DIV-12.2 only in a header comment. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The change relies on no Oracle fixture, so there is no error fixture to check. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-contracts-7 and XT-contracts-9 check what their consequence strings declare. XT-contracts-8's ModelIdentifier and concrete-type parts now match its narrowed consequence (P-1, P-6 and P-7 are fixed). P-5 is still open: the test asserts there is no 'thenable' line and that Kernel.queue is absent from the surface, while the Story criterion requires a 'thenable' line. ESC-10.3-2 is unruled. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes are limited to packages/contracts plus one escalation file. ModelIdentifier looks up Relation in the Class Registry at call time and adds no stub of @​xaravel/database. The Relation round trip is recorded as blocked-by:database. |
| F-9: Every `@asyncRoot` tag is true | fail | I checked each tag against AD-6.2 and AD-6.13, DIV-1, ESC-6.4-1, and AD-11.1 and AD-11.6, which are now carried. The DB, session-handler, broadcaster, queue and transport roots fit DIV-1's root list. The callback tags fit DIV-1's callback clause (gates, listeners, notifications, middleware and binding resolvers). Kernel.terminate's callback tag now rests on the async Events dispatch. The render tags rest on AD-11.1's Promise<string> template modules. View\Factory make and file are still sync and untagged, although they dispatch the creating: event to creator callbacks, and no approved ESC-10.3-1 ruling exists. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/web.test.ts`: P-5 stands. XT-contracts-8 asserts 'entry.thenable === undefined' for every file and '!actualAsync.has('Console\Kernel.queue')'. That enforces the gap the Story spec forbids: its async matrix row says 'Console\Kernel.queue' has a 'thenable' line. decisions/ESC-10.3-2.md does not exist. Get the ruling first, then either assert the 'thenable' line after the tool fix or apply an approved amendment to the spec row.
- **F-9** `packages/contracts/src/view/Factory.ts`: P-3 and P-8 stand. 'make()' and 'file()' stay sync without '@​asyncRoot', under a 'pending ESC-10.3-1 option 1' note, but decisions/ESC-10.3-1.md does not exist. Upstream's make and file dispatch the creating: event to view creators, which DIV-1 lets be async, so AD-6.2 makes them async. Get an approved ruling, or return Promise<View> with '@​asyncRoot callback' and regenerate async-surface.json.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/contracts/tests/xaravel/web.test.ts`: XT-contracts-8 never exercises successful morph-map serialization or resolution: enabling the flag only tests an unregistered Relation error. Add coverage using the real registered Relation when available, including constructor alias conversion, getClass resolution and fallback, and assert the relations property retains its supplied value; otherwise narrow the consequence and explicitly account for the blocked coverage. **fixed**: The consequence is narrowed: the registered-Relation round trip is explicitly blocked-by:database, and only the unregistered failure is claimed. The test also asserts that 'relations' is the supplied array (assertSame).
- **P-2** (reviewer 1, F-9) `packages/contracts/src/console/Kernel.ts`: terminate is tagged callback on the claim that application terminating callbacks and terminable middleware may be async. The supplied Foundation Application contract explicitly requires synchronous terminating callbacks, and no evidence establishes console terminable middleware. Supply the actual permitted async callback path or keep this method synchronous and regenerate its surface. **fixed**: The Kernel.terminate docblock now grounds the callback tag in dispatching Upstream's Terminating event through Events\Dispatcher::dispatch. That method is listed as async 'callback' in async-surface.json, and DIV-1 lets listeners be async. The claim about terminating callbacks is dropped.
- **P-3** (reviewer 1, F-9) `packages/contracts/src/view/Factory.ts`: make and file defer the creating-event dispatch under an explicitly pending recommendation, but decisions/ESC-10.3-1.md is unavailable. Supply an approved ruling permitting that timing and synchronous seam, or preserve awaited event dispatch with the appropriate async declarations and tags. **not fixed**: decisions/ESC-10.3-1.md is still unavailable, and Factory make and file remain sync under a pending recommendation.
- **P-4** (reviewer 1, F-9) `packages/contracts/src/view/Engine.ts`: The callback tag depends on AD-11's compiled-template Promise contract, but AD-11's text is absent from the supplied evidence. Include that rule to substantiate this tag and the related rendering tags in Renderable, the paginator contracts and ResponseFactory. **fixed**: The evidence now carries AD-11.1 (Compilation: each compiled view module exports render(ctx): Promise<string>) and AD-11.6. Engine, Renderable, the paginators and ResponseFactory cite them by lead.
- **P-5** (reviewer 2, F-7) `packages/contracts/tests/xaravel/web.test.ts`: XT-contracts-8 asserts that no file has a 'thenable' line ('Assert.assertSame(undefined, entry.thenable, ...)') and that Console\Kernel.queue is missing from the surface. The Story spec's async matrix row requires 'Console\Kernel.queue' to have a 'thenable' line. ESC-10.3-2 is open and no ruling exists (decisions/ESC-10.3-2.md is unavailable). The test therefore enforces the gap instead of the criterion. Wait for the ruling: either the tool fix plus a positive assertion of the line, or an approved spec amendment. **not fixed**: The test still asserts no 'thenable' line and that Kernel.queue is absent, and ESC-10.3-2 is still unruled.
- **P-6** (reviewer 2, F-7) `packages/contracts/tests/xaravel/web.test.ts`: The consequence claims ModelIdentifier is 'ported in full', but the body only exercises the morph-map path with no Relation registered (it expects the 'Class not found' error). It never registers a Relation double to check that the constructor stores getMorphAlias(className) and that getClass() returns getMorphedModel(class) ?? class. Add those checks, or narrow the consequence. **fixed**: The consequence no longer claims ModelIdentifier is 'ported in full'. It lists exactly the checks the body makes and marks the Relation round trip blocked-by:database.
- **P-7** (reviewer 2, F-7) `packages/contracts/tests/xaravel/web.test.ts`: The consequence says every concrete class an Upstream file names is 'a src/structural/ type (or a contract token)'. NOT_STRUCTURAL maps Illuminate\Database\Eloquent\Relations\Relation to null and skips it, so a third category exists that the string does not declare. Either state the exemption (resolved through the Class Registry at call time) in the consequence, or check it. **fixed**: The consequence now names the third category: 'or Eloquent's Relation, which ModelIdentifier resolves through the Class Registry at call time'.
- **P-8** (reviewer 2, F-9) `packages/contracts/src/view/Factory.ts`: 'make()' and 'file()' are untagged and sync. Upstream's Factory::make/file call callCreator, which dispatches the 'creating:' event to view creator callbacks, and DIV-1 lets those be async. AD-6.2 then makes the methods async ('async on any path is async on all paths'). The file keeps them sync under 'ESC-10.3-1 recommended option 1', but decisions/ESC-10.3-1.md does not exist, so no approved ruling supports the departure. Wait for the ruling, or tag the methods '@​asyncRoot callback' and return a Promise. **not fixed**: Same as P-3: make and file are still sync and untagged, with no approved ruling.
- **P-9** (reviewer 2, F-9) `packages/contracts/src/support/Renderable.ts`: 'render()' changed from sync to 'Promise<string>' with '@​asyncRoot callback'; Engine.get, Paginator.render, CursorPaginator.render and ResponseFactory.view follow the same reasoning. The only justification given is AD-11 ('a render is a compiled template module's Promise<string>'), whose text is not in the prompt, while AD-6.1 and DIV-1 list view loading as sync. The evidence needed to confirm these callback tags is missing. Cite the AD-11 rule bullet by its lead so the review carries it, or a decision record that makes a view render async, so the tag can be checked. **fixed**: Renderable and the related render methods cite 'AD-11, the spine's Compilation', and the prompt carries AD-11.1, which makes a render a Promise<string>, so the evidence is now present.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"b5577750c3ff3d61d8aa138ba9808d1c5c601f9b","base":"ca1fec4b63b3a591869399bfb1d667aea755eae7","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T07:07:01.003Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Test IDs and the change adds or changes no Ported Test.","findings":[]},{"id":"F-2","result":"n/a","note":"There is no Ported Test, so there is no Upstream expected value to compare against.","findings":[]},{"id":"F-3","result":"n/a","note":"There is no Ported Test, so there are no assertion counts to compare.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no `// adapted:DIV-` marker and no Expectations adapted field. Attachment.ts cites DIV-12.2 only in a header comment.","findings":[]},{"id":"F-6","result":"n/a","note":"The change relies on no Oracle fixture, so there is no error fixture to check.","findings":[]},{"id":"F-7","result":"fail","note":"XT-contracts-7 and XT-contracts-9 check what their consequence strings declare. XT-contracts-8's ModelIdentifier and concrete-type parts now match its narrowed consequence (P-1, P-6 and P-7 are fixed). P-5 is still open: the test asserts there is no `thenable` line and that Kernel.queue is absent from the surface, while the Story criterion requires a `thenable` line. ESC-10.3-2 is unruled.","findings":[{"path":"packages/contracts/tests/xaravel/web.test.ts","detail":"P-5 stands. XT-contracts-8 asserts `entry.thenable === undefined` for every file and `!actualAsync.has('Console\\Kernel.queue')`. That enforces the gap the Story spec forbids: its async matrix row says `Console\\Kernel.queue` has a `thenable` line. decisions/ESC-10.3-2.md does not exist. Get the ruling first, then either assert the `thenable` line after the tool fix or apply an approved amendment to the spec row."}]},{"id":"F-8","result":"pass","note":"Changes are limited to packages/contracts plus one escalation file. ModelIdentifier looks up Relation in the Class Registry at call time and adds no stub of @xaravel/database. The Relation round trip is recorded as blocked-by:database.","findings":[]},{"id":"F-9","result":"fail","note":"I checked each tag against AD-6.2 and AD-6.13, DIV-1, ESC-6.4-1, and AD-11.1 and AD-11.6, which are now carried. The DB, session-handler, broadcaster, queue and transport roots fit DIV-1's root list. The callback tags fit DIV-1's callback clause (gates, listeners, notifications, middleware and binding resolvers). Kernel.terminate's callback tag now rests on the async Events dispatch. The render tags rest on AD-11.1's Promise<string> template modules. View\\Factory make and file are still sync and untagged, although they dispatch the creating: event to creator callbacks, and no approved ESC-10.3-1 ruling exists.","findings":[{"path":"packages/contracts/src/view/Factory.ts","detail":"P-3 and P-8 stand. `make()` and `file()` stay sync without `@asyncRoot`, under a 'pending ESC-10.3-1 option 1' note, but decisions/ESC-10.3-1.md does not exist. Upstream's make and file dispatch the creating: event to view creators, which DIV-1 lets be async, so AD-6.2 makes them async. Get an approved ruling, or return Promise<View> with `@asyncRoot callback` and regenerate async-surface.json."}]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/web.test.ts","detail":"XT-contracts-8 never exercises successful morph-map serialization or resolution: enabling the flag only tests an unregistered Relation error. Add coverage using the real registered Relation when available, including constructor alias conversion, getClass resolution and fallback, and assert the relations property retains its supplied value; otherwise narrow the consequence and explicitly account for the blocked coverage.","fixed":true,"note":"The consequence is narrowed: the registered-Relation round trip is explicitly blocked-by:database, and only the unregistered failure is claimed. The test also asserts that `relations` is the supplied array (assertSame)."},{"id":"P-2","reviewer":1,"item":"F-9","path":"packages/contracts/src/console/Kernel.ts","detail":"terminate is tagged callback on the claim that application terminating callbacks and terminable middleware may be async. The supplied Foundation Application contract explicitly requires synchronous terminating callbacks, and no evidence establishes console terminable middleware. Supply the actual permitted async callback path or keep this method synchronous and regenerate its surface.","fixed":true,"note":"The Kernel.terminate docblock now grounds the callback tag in dispatching Upstream's Terminating event through Events\\Dispatcher::dispatch. That method is listed as async `callback` in async-surface.json, and DIV-1 lets listeners be async. The claim about terminating callbacks is dropped."},{"id":"P-3","reviewer":1,"item":"F-9","path":"packages/contracts/src/view/Factory.ts","detail":"make and file defer the creating-event dispatch under an explicitly pending recommendation, but decisions/ESC-10.3-1.md is unavailable. Supply an approved ruling permitting that timing and synchronous seam, or preserve awaited event dispatch with the appropriate async declarations and tags.","fixed":false,"note":"decisions/ESC-10.3-1.md is still unavailable, and Factory make and file remain sync under a pending recommendation."},{"id":"P-4","reviewer":1,"item":"F-9","path":"packages/contracts/src/view/Engine.ts","detail":"The callback tag depends on AD-11's compiled-template Promise contract, but AD-11's text is absent from the supplied evidence. Include that rule to substantiate this tag and the related rendering tags in Renderable, the paginator contracts and ResponseFactory.","fixed":true,"note":"The evidence now carries AD-11.1 (Compilation: each compiled view module exports render(ctx): Promise<string>) and AD-11.6. Engine, Renderable, the paginators and ResponseFactory cite them by lead."},{"id":"P-5","reviewer":2,"item":"F-7","path":"packages/contracts/tests/xaravel/web.test.ts","detail":"XT-contracts-8 asserts that no file has a `thenable` line (`Assert.assertSame(undefined, entry.thenable, ...)`) and that Console\\Kernel.queue is missing from the surface. The Story spec's async matrix row requires `Console\\Kernel.queue` to have a `thenable` line. ESC-10.3-2 is open and no ruling exists (decisions/ESC-10.3-2.md is unavailable). The test therefore enforces the gap instead of the criterion. Wait for the ruling: either the tool fix plus a positive assertion of the line, or an approved spec amendment.","fixed":false,"note":"The test still asserts no `thenable` line and that Kernel.queue is absent, and ESC-10.3-2 is still unruled."},{"id":"P-6","reviewer":2,"item":"F-7","path":"packages/contracts/tests/xaravel/web.test.ts","detail":"The consequence claims ModelIdentifier is 'ported in full', but the body only exercises the morph-map path with no Relation registered (it expects the 'Class not found' error). It never registers a Relation double to check that the constructor stores getMorphAlias(className) and that getClass() returns getMorphedModel(class) ?? class. Add those checks, or narrow the consequence.","fixed":true,"note":"The consequence no longer claims ModelIdentifier is 'ported in full'. It lists exactly the checks the body makes and marks the Relation round trip blocked-by:database."},{"id":"P-7","reviewer":2,"item":"F-7","path":"packages/contracts/tests/xaravel/web.test.ts","detail":"The consequence says every concrete class an Upstream file names is 'a src/structural/ type (or a contract token)'. NOT_STRUCTURAL maps Illuminate\\Database\\Eloquent\\Relations\\Relation to null and skips it, so a third category exists that the string does not declare. Either state the exemption (resolved through the Class Registry at call time) in the consequence, or check it.","fixed":true,"note":"The consequence now names the third category: 'or Eloquent's Relation, which ModelIdentifier resolves through the Class Registry at call time'."},{"id":"P-8","reviewer":2,"item":"F-9","path":"packages/contracts/src/view/Factory.ts","detail":"`make()` and `file()` are untagged and sync. Upstream's Factory::make/file call callCreator, which dispatches the `creating:` event to view creator callbacks, and DIV-1 lets those be async. AD-6.2 then makes the methods async ('async on any path is async on all paths'). The file keeps them sync under 'ESC-10.3-1 recommended option 1', but decisions/ESC-10.3-1.md does not exist, so no approved ruling supports the departure. Wait for the ruling, or tag the methods `@asyncRoot callback` and return a Promise.","fixed":false,"note":"Same as P-3: make and file are still sync and untagged, with no approved ruling."},{"id":"P-9","reviewer":2,"item":"F-9","path":"packages/contracts/src/support/Renderable.ts","detail":"`render()` changed from sync to `Promise<string>` with `@asyncRoot callback`; Engine.get, Paginator.render, CursorPaginator.render and ResponseFactory.view follow the same reasoning. The only justification given is AD-11 ('a render is a compiled template module's Promise<string>'), whose text is not in the prompt, while AD-6.1 and DIV-1 list view loading as sync. The evidence needed to confirm these callback tags is missing. Cite the AD-11 rule bullet by its lead so the review carries it, or a decision record that makes a view render async, so the tag can be checked.","fixed":true,"note":"Renderable and the related render methods cite 'AD-11, the spine's Compilation', and the prompt carries AD-11.1, which makes a render a Promise<string>, so the evidence is now present."}]}
```
