---
review: adversarial
target: ../ARCHITECTURE-SPINE.md
lens: 'Pairs of units built in parallel that each obey every AD to the letter yet build incompatibly; plus conformance-machinery gaming and collisions'
date: '2026-10-16'
sources:
  - ../ARCHITECTURE-SPINE.md
  - ../../../prds/prd-xaravel-2026-10-15/prd.md (§3, §4, §5, §6, §7.3)
  - ../../../prds/prd-xaravel-2026-10-15/review-triage.md (deferred-to-architecture rows)
---

# Adversarial Review: Architecture Spine (Xaravel)

## Verdict

The spine fixes the right *kinds* of decisions, but several of them are only half-specified. AD-5 (Scope Frames) and AD-6 (async surface) are the weakest. AD-5 does not say where the frame primitive lives, what counts as a "write", how frames nest, or who owns shared physical connections. AD-6 works out the async surface from each agent's own implementation, so it is not a contract between parallel agents. Also, no AD fixes the representation of PHP arrays, the serialization codecs, service identity (tokens versus strings) or FQCN identity. As a result, parallel agents who follow every AD can still produce code that fails at the seams. Some of these failures are security holes, for example a Promise that is always truthy in an authorization check. The conformance machinery also has gaps: it lets a Story agent move work out of its own scope (`blocked-by`, self-declared variants, an editable Story manifest), and its file layout guarantees collisions between parallel Stories (Oracle fixtures, ESC numbering, unexpected passes).

**Totals:** 9 critical, 22 high, 13 medium, 4 low (48 findings).

## How to read each finding

- **Sev:** critical / high / medium / low.
- **Units:** the two (or more) units built in parallel, or in different Phases, that clash.
- **Outcome:** the concrete incompatible result when both obey the spine.
- **Gap:** what the AD leaves open or gets wrong.
- **Rule:** proposed text for a new AD or an amendment. New ADs are numbered AD-19 onward as proposals.

## Summary

| ID | Sev | Units | Hole |
| --- | --- | --- | --- |
| ADV-01 | critical | Config/Support (Ph1–2) × Container (Ph2) × Grader harness (Ph0) | ALS lives in `@xaravel/container`; packages that can't depend on it must read and write frames |
| ADV-02 | critical | Foundation HTTP kernel × Container | "No frame active" boot rule: lazy first-request bootstrap, singleton caches and deferred providers end up in request #1's overlay |
| ADV-03 | critical | Database (`DB.transaction` child frame) × Session / Auth / Config | Child frame discards every write made inside a transaction callback |
| ADV-04 | critical | Testing (HTTP tests) × Foundation kernel × Session/Auth | Request frame nested in a test frame: undefined, so either fakes vanish or post-request assertions fail |
| ADV-05 | critical | Database × Session/Cache/Queue database drivers × Testing (`RefreshDatabase`) | Per-frame transaction stack on one shared physical SQLite/Redis connection; deadlock in tests |
| ADV-06 | critical | Auth/Gate × View (Blade `@auth`/`@can`) × Validation | AD-6 makes `Gate.allows()`/`check()` sync while their callbacks are async, so a Promise is truthy and authorization is bypassed |
| ADV-07 | critical | View × Auth/Session/Routing/Cookie/Translation (singleton fields) | Per-request state in instance fields of base singletons is not covered by AD-5's lint |
| ADV-08 | critical | Collections/Support/Request/Config × `@xaravel/assert` matchers | No PHP-array representation is fixed; independent matchers give false passes or false failures |
| ADV-09 | critical | Support (Facades) × every Component × AD-1/AD-2 | Facades can't reach class tokens without forbidden imports; `app('cache')` is parity API, but AD-1 bans strings |
| ADV-10 | high | Cache × Queue (and every consumer) | No canonical token per service, so there are two `CacheManager` instances |
| ADV-11 | high | Session × Encryption × Cache × Queue | Several PHP `serialize()` / `json_encode` codecs (UTF-16 vs UTF-8 length), which breaks FR-77 |
| ADV-12 | high | Queue × Eloquent × Events × Mail/Notifications | Job payload format and async `SerializesModels` restore are unspecified |
| ADV-13 | high | Eloquent × Http (JsonResponse) | `toJson`/`toJSON` collision gives double-encoded JSON |
| ADV-14 | high | Events × Eloquent × Queue × Broadcasting | `::class` / `get_class` identity: `constructor.name` vs FQCN in event names and lock keys |
| ADV-15 | high | Class Registry × every package × Ported Tests | Registry has no home package; entry-module registration is missed by subpath imports; no duplicate policy; fixture FQCNs undefined |
| ADV-16 | high | Eloquent (Proxy) × Auth/Queue/Events (marker brands) | Instance-field brands become model attributes; class-level checks need instantiation |
| ADV-17 | high | Database (Connection) × Eloquent (casts) | Connection throws `IntegerOverflowException` before the `bigint` cast can run |
| ADV-18 | high | Validation (FormRequest) × Container × Routing | Async `validateResolved()` inside a sync `afterResolving` hook |
| ADV-19 | high | Foundation (Ph6) × Auth/Queue/Mail/Console/Broadcasting (Ph7–8) | Foundation must reference later-phase classes (DefaultProviders, aliases, middleware priority) |
| ADV-20 | high | Testing/Testbench (Ph7) × `portedTest` (Ph0) | No shared TestCase lifecycle ABI; nobody owns NFR-7 resets |
| ADV-21 | high | Queue (AD-13) × Testing fakes × Upstream `WorkerTest` | Supervisor+child breaks in-process Worker tests and fakes; concurrent jobs per child |
| ADV-22 | high | Http × Routing × Console × Support (Symfony/Carbon/PSR shims) | Two owners of one third-party symbol (`NotFoundHttpException`), so `instanceof` and Registry clash |
| ADV-23 | high | htmx × Routing × View × Validation | AD-12 seam list cannot implement FR-40/FR-42; ad-hoc hooks appear |
| ADV-24 | high | View (AD-11) × htmx | Fragment ABI unfixed; direct fragment call contradicts Upstream `fragment()` full-render semantics |
| ADV-25 | high | Foundation (`defer`, terminate) × Cache (`flexible`) × Routing (SSE/WebSocket) | Work after unit end runs frameless and writes to the global base |
| ADV-26 | high | All packages × AD-6 | Async surface is derived from the implementation: conditional-async methods, Log, Event dispatch, `retry`, fake assertions |
| ADV-27 | high | Bus × Queue (PendingDispatch) | Laravel dispatches in `__destruct`; an unawaited thenable silently drops jobs or dispatches twice |
| ADV-28 | high | Database × Queue/Events/Broadcasting/Mail (`afterCommit`) | `DatabaseTransactionsManager` singleton vs per-frame transaction stack |
| ADV-29 | high | Redis/Cache (AD-17) × Upstream tests | `flushdb()` is Upstream behaviour and test teardown; AD-17 forbids it; double prefixing |
| ADV-30 | high | Story agent × Ratchet/FR-4 | Gaming: editable Story manifest, self-declared variants, unchecked `blocked-by`, edits to other Stories' test blocks |
| ADV-31 | high | Parallel Stories × Oracle/ESC/merge | Collisions: fixtures commit to a Protected path, ESC numbers, semantic merge conflicts, unexpected-pass deadlock |
| ADV-32 | medium | Package authors × State lint | "Boot-only" allowlist is edited by the agent the lint polices |
| ADV-33 | medium | Foundation × htmx/Boost/Testbench | Package discovery key for providers is unspecified |
| ADV-34 | medium | Foundation × Testing × app providers | May `boot()` be async? Deferred-provider boot inside sync `make()` |
| ADV-35 | medium | Encryption × Routing (signed URLs) × Queue (AD-14) × Cookie | APP_KEY: raw bytes vs config string, differently per consumer |
| ADV-36 | medium | htmx × Foundation exception handler × app `withExceptions` | Renderable ordering: the htmx provider pre-empts app renderers |
| ADV-37 | medium | htmx (FR-40) × Session (flash) | Same-request re-render flashes errors/old input that leak into the next request |
| ADV-38 | medium | htmx (Ph6) × Testing (Ph7) | htmx TestResponse assertions and HTTP test client do not exist yet in Phase 6 |
| ADV-39 | medium | Foundation kernel × Http (`ValidatePostSize`) | Pre-parse size check: two owners |
| ADV-40 | medium | Eloquent × Database (eager loads) × Ported Tests | `Promise.all` vs Upstream sequential IO; query-log order flakes |
| ADV-41 | medium | Eloquent Epics × Mockery × App models | Proxy traps: base `#private`, post-construction `defineProperty`, non-`declare` fields |
| ADV-42 | medium | Any Story × another Component's package / `@xaravel/contracts` | No cross-package edit ownership rule; contracts keep changing |
| ADV-43 | medium | Queue/Cache/Session × harness | Backend Variant vocabulary is ambiguous (`redis`, `database`) |
| ADV-44 | medium | Eloquent/Queue/Routing × PORTING.md trait mixins | Trait identity (`class_uses_recursive`) is a cross-package runtime contract, deferred as a doc line |
| ADV-45 | low | htmx/facade augmentations × Upstream packages | Global TS module augmentation leaks types into packages that don't depend on htmx |
| ADV-46 | low | htmx mixins × Upstream Request/TestResponse | Mixin name collisions at a later Pin |
| ADV-47 | low | Harness (AD-17) × reused worktree paths / parallel processes | Stale per-key DBs; two runners in one worktree share state |
| ADV-48 | low | Testing (graded) × `@xaravel/assert`/`mockery` (grader) | Graded package re-exports grader code; bugs fixable only by Infrastructure Stories |

---

## A. Scope Frames (AD-5)

### ADV-01 — critical — The frame primitive sits too high in the dependency graph

- **Units:** Config (Phase 1) and Support (Phase 2, facades, `Str` factories, `Carbon` test-now, `Sleep`/`Once`/`Lottery`) × Container (Phase 2) × the conformance harness (Phase 0).
- **Outcome:** AD-5 lists `config([...])` and `Facade.swap()/fake()` as overlay writes, and NFR-7 requires test-clock and `Str` factory resets. But `illuminate/config` requires only collections and contracts, and `illuminate/support` does not require container. Under AD-2 neither may import `@xaravel/container`, which "owns the only AsyncLocalStorage". So the Config agent ships a plain Repository (Upstream tests pass). The Support agent keeps `testNow` and UUID factories as statics and lists them as "boot-only" to pass lint. The Container agent then has to retrofit overlays into packages that were already accepted. At the same time AD-5 says "the test harness opens exactly one frame", while AD-15 says the harness "imports no graded package". So the harness cannot open a frame at all.
- **Gap:** AD-5 puts the frame in an L1 package that L1/L2 peers and the grader cannot reach. The only escape routes are an AD-2 violation or Phase 1 rework.
- **Rule (amend AD-5, new AD-19 "Scope primitive"):** "The ALS instance and the `ScopeFrame` primitive live in `@xaravel/contracts/scope` (the one runtime module `@xaravel/contracts` may hold), built in Phase 1 before Config. They expose `currentFrame(): ScopeFrame | null`, `runInFrame(kind, fn, {parent})` and `frameSlot<T>(key: symbol, init)`. Every package may use it, whatever its `composer.json` says. `@xaravel/container` builds binding overlays on top of it, but does not own it. The grader opens test frames only through the protocol `globalThis[Symbol.for('xaravel.scope.run')]`. The primitive installs this on load, and the harness calls it when present, so the grader imports nothing."

### ADV-02 — critical — "Writes while no frame is active go to the base" puts boot inside request #1

- **Units:** Foundation HTTP kernel × Container × Database (connection pool singletons).
- **Outcome:** Laravel's `Kernel::handle()` runs `bootstrap()` lazily inside the first request. A Foundation agent that ports this exactly boots the app inside request #1's frame. All provider registrations go to that overlay and are thrown away, so request #2 has no bindings. Separately, a container agent may treat "cache the resolved singleton" as a write. Then `DatabaseManager` and its `Bun.sql` pool are rebuilt in every request overlay, which exhausts Postgres connections. A different agent may treat it as a base write, and singletons built during a request then capture request-scoped dependencies. Deferred providers registered on first use inside a frame re-register and re-boot on every request. Note: the memlog decision said "writes before *boot completes* go to the base". The AD text changed this to "while no frame is active", which is a different rule.
- **Gap:** The base/overlay switch is keyed on frame presence, not on boot state. What counts as a "write" is not enumerated, and bindings (`bind`/`singleton`) are not covered.
- **Rule (replace AD-5 paragraph 2):** "Each Application (and each `new Container()`) has a lifecycle flag: `registering → booting → sealed`. Every kernel and TestCase completes `bootstrap()` and `boot()` *before* opening any unit frame. A lazy first-request bootstrap is forbidden. Before `sealed`, all writes go to the base, whether or not a frame is active. After `sealed`:
  - (a) `bind`, `singleton`, `alias`, `extend`, `tag` and provider registration write to the base only. When called inside a frame they throw `ScopeFrameException`, except in a test frame, where they write to the test overlay.
  - (b) The cache of a resolved `singleton` instance always lives in the base.
  - (c) Only `instance()`, `scoped()` resolutions, `Facade.swap()/fake()`, the AD-5 config/locale/View.share/RateLimiter writes and declared `frameSlot`s write to the overlay.
  - (d) Deferred providers are loaded into the base under a mutex, even when first triggered inside a frame.

  Overlays are keyed by (container instance, frame), so two `new Container()` objects in one test never share an overlay."

### ADV-03 — critical — `DB.transaction()`'s child frame discards writes made inside it

- **Units:** Database × Session × Auth × Config × Context.
- **Outcome:** AD-5 says "writes made inside a frame go to that frame's overlay … a frame is discarded when its unit ends", and "`DB.transaction()` opens a child frame". Take `await DB.transaction(async () => { order.save(); session.put('last', order.id); Auth.login(u); Context.add('order', id) })`. The session value, the login, the Context and any `instance()` are written to the child overlay and lost on commit. A Database agent can implement the AD literally. The Session and Auth agents then see random data loss under Database's code.
- **Gap:** Child frames are not distinguished from unit frames. There is no rule for which slots a child frame owns.
- **Rule (amend AD-5):** "There are two frame kinds. A **unit frame** (request, job, command, scheduled task, test, WebSocket message) owns an overlay. A **narrow frame** (`DB.transaction`, `Concurrency` task, `Context.scope`) overrides only the slots it declares. `DB.transaction` declares just `{connectionLease, transactionLevel}`. Every other read and write passes through to the nearest unit frame. Narrow frames never discard writes."

### ADV-04 — critical — A request frame nested inside a test frame is undefined

- **Units:** Testing (`MakesHttpRequests`, `actingAs`, `assertAuthenticated`, `assertSessionHas`, `Event.fake()`) × Foundation HTTP kernel × Session/Auth.
- **Outcome:** The test harness opens a frame, and then `await this.get('/x')` makes the kernel open "exactly one frame per unit". There are two possible readings:
  - **Kernel opens a fresh root frame:** `Event.fake()`, `config([...])`, `actingAs()` and `freezeTime()` set in the test frame are invisible to the request. Every fake-based test fails.
  - **Kernel opens a child frame that is discarded:** `assertAuthenticated()` / `assertSessionHas()` after the request read the parent and fail. In Laravel the test and the request share the app state.

  The Testing and Foundation agents will pick different readings.
- **Gap:** There is no frame-nesting or join semantics for units opened inside units.
- **Rule (amend AD-5):** "A unit frame opened while another unit frame is active is a **child unit**. It reads through to its parent, and when it ends it **merges** its overlay into the parent for these slots: auth guard state, session store reference, cookies, `instance()` bindings set by the framework during the unit, and the last response context. It discards the rest (request, route, CSP nonce, View render state). In production the kernel always opens root frames. The merge applies only when the parent kind is `test`."

### ADV-05 — critical — Per-frame transaction stacks share one physical connection

- **Units:** Database (SQLite through `bun:sqlite`, Redis) × Session/Cache/Queue `database` drivers × Testing (`RefreshDatabase`, `DatabaseTransactions`).
- **Outcome:**
  - **Interleaved requests:** request A sends `BEGIN` on the single `bun:sqlite` connection and awaits a cache call. Request B's `INSERT` (for example a database session write) runs inside A's transaction, and A's rollback erases it. That breaks NFR-4.
  - **Redis:** `MULTI` on a shared `Bun.redis` client captures other frames' commands. `BLPOP` and `SUBSCRIBE` block the client for everyone.
  - **Tests:** under `RefreshDatabase` on `:memory:`, the test frame holds the transaction. If the Database agent adds a per-transaction mutex, the nested request frame waits on a lock its parent holds, and the test deadlocks. If the agent adds no mutex, request frames on Postgres take a different pooled connection and can't see the test's uncommitted factories.
- **Gap:** AD-5 says the frame owns the "per-connection transaction stack" but never says who owns the *physical* connection.
- **Rule (new AD-20 "Connection leases"):** "A transaction, `lockForUpdate`, Redis `transaction`/`pipeline`/`watch`/`select`/`subscribe` or any blocking command runs on a physical connection **leased** to the current unit frame for its duration. Rules per driver:
  - Postgres leases from the `Bun.sql` pool (`reserve`).
  - File SQLite opens one WAL connection per lease.
  - `:memory:` SQLite and pool size 1 use a FIFO mutex.
  - Redis duplicates the client for the lease.

  A lease is inherited by child units and narrow frames, so a nested request reuses its test's lease and never waits on it. Non-transactional statements outside a lease may use any idle connection. A concurrency test per driver interleaves two units around `BEGIN … await … COMMIT`."

## B. Async surface (AD-6)

### ADV-06 — critical — A Promise in a sync conditional bypasses authorization

- **Units:** Auth (`Gate.allows`, `Auth.check`, policies; Phase 8) × View (`@auth`, `@can`, `@error` compiled in Phase 6) × Validation (`fails()`).
- **Outcome:** DIV-1 says policies may be async. AD-6 says a method is async only if it *transitively calls a Driver contract*, and `Gate.allows()` itself calls none. So an AD-6-literal Auth agent makes `allows()` sync. It returns the user callback's Promise, and `if (Gate.allows('edit', post))` is always true. The View agent in Phase 6 compiles `@can`/`@auth` to `if (auth().check())`, before Auth exists. When `check()` later becomes async (because `SessionGuard.user()` queries the provider), every `@auth` block renders for guests. NFR-3's `no-misused-promises` does not run over compiled Blade modules or App code. AD-11 guards only *printing* a Promise, not testing one.
- **Gap:** AD-6 ignores async user callbacks and cannot see a call made "through the user". AD-11 has no guard for conditions.
- **Rule (amend AD-6, AD-11):**
  - "Any API that accepts a callback which DIV-1 lists as may-be-async is async by contract, whatever its implementation. This covers gates, policies, `Gate.before/after`, event listeners, observers, model events, validation closures and rule objects, `Cache.remember*`, transaction callbacks, route binding resolvers, middleware and `RateLimiter.for` limiters. That makes these async: `Gate.allows/denies/check/any/authorize/inspect`, `Auth.check/guest/user/id` (all guards), `Validator.passes/fails/validate/validated/errors`, `Event.dispatch/until`, `Model.save/delete/...`. The list is committed in `@xaravel/contracts/async-surface.json` (ADV-26).
  - The Blade compiler wraps every directive condition and iterable (`@if`, `@elseif`, `@unless`, `@auth`, `@guest`, `@can*`, `@env`, `@isset`, `@empty`, `@foreach`, `@forelse`, `@while`, `@switch`) in `__cond(x)` / `__iter(x)`. These throw `ViewException` on a thenable. `@auth`/`@can` compile to `await`ed calls.
  - Any `if`/`?:`/`&&` on a framework thenable in framework code is a lint error. The rule runs over compiled-view snapshots in CI."

### ADV-26 — high — AD-6 is worked out per implementation, so it is not a contract between parallel agents

- **Units:** every pair of a producer and a consumer package, for example Log (Phase 3) × everything; Events × Log; Session × Auth; Support (`retry`, `rescue`) × Http client; Testing fakes × Mail.
- **Outcome:**
  - **Log:** if Log's `single` channel writes through a Filesystem disk (async driver), `Log.info()` becomes a Promise. Every package then breaks `no-floating-promises`. If Log writes with `appendFileSync`, it stays sync. Both obey AD-6.
  - **Conditional async:** `Session.migrate(destroy)` is async only when `destroy` is true. One agent types it `Promise | void`, another always returns a Promise, a third defers the destroy until save.
  - **Callback helpers:** `retry(3, async () => Http.get(..))` is a type error, because `retry` calls no driver and so must take a sync-only callback. That kills `retry`'s main use.
  - **Fake assertions:** `Notification.assertSentTo(u, X, n => n.toMail(u).render().includes(..))` needs an async predicate, but the assert API is sync.

  The generated `async-surface.json` records these choices after the fact. It cannot coordinate two agents building in parallel.
- **Gap:** There is no surface committed in advance for contracts and shared helpers, and no rule for conditional async or for callback-taking helpers.
- **Rule (amend AD-6):**
  - "Phase 1 commits `@xaravel/contracts/async-surface.json` (Protected). It lists every contract method's async-ness and the AD-6/ADV-06 callback-async list. Package files may only add methods, never flip one listed there.
  - A method that is async on *any* path is async on *all* paths. A union return type `T | Promise<T>` is a lint error.
  - The logger is sync. Channel handlers buffer and flush through the Driver asynchronously, and the `MessageLogged` event must use only sync listeners.
  - `retry`, `rescue`, `once`, `tap`, `value`, `transform`, `Benchmark.measure`, `Sleep.*` and `when/unless` are **dual helpers**. They are overloaded to return `T` for a sync callback and `Promise<T>` for an async one, and they are exempt from the iff.
  - Every `assert*` on a fake and on `TestResponse` accepts `(..) => boolean | Promise<boolean>`. When any predicate is supplied, the method returns `Promise<void>` (DIV-8)."

### ADV-27 — high — `PendingDispatch` has no destructor

- **Units:** Bus × Queue (and Mail `PendingMail`, Http `PendingRequest`).
- **Outcome:** Laravel dispatches in `PendingDispatch::__destruct`, so `ProcessOrder::dispatch($o);` on its own line works. AD-6 says "awaiting one runs its terminal". If the Bus agent implements exactly that, an unawaited `ProcessOrder.dispatch(o)` in App code (which is not linted) never dispatches, and the job is silently lost. If a second agent adds auto-dispatch on a microtask to emulate the destructor, an `await`ed dispatch runs twice, or chained `.onQueue()` after the microtask is ignored.
- **Gap:** There is no "exactly once" or "auto-terminal" rule for thenables whose Upstream counterpart acts on destruction.
- **Rule (amend AD-6):** "`PendingDispatch` and `PendingChain.dispatch()` result objects register an **auto-terminal** in the current unit frame's `defer` list when they are created. `then()` (await) or an explicit terminal cancels the auto-terminal and runs once. Otherwise the frame runs it, in creation order, before the unit ends (before the response is sent or the job is marked complete). Query builders, Relations and `PendingRequest` have no auto-terminal. A `PendingDispatch` created outside any frame throws."

## C. Shared per-request state

### ADV-07 — critical — Instance fields on base singletons are the main leak path, and nothing polices them

- **Units:** View Factory (sections, stacks, `@once` set, component stack, `$loop` stack) × htmx fragment renders. Also AuthManager (`guards` cache with `user`), Router (`current`, `currentRequest`), UrlGenerator (`request`), Redirector (session), CookieJar (`queued`), Translator (`locale`), Vite (nonce, preloaded assets), Gate (`userResolver`), Log (`withContext`), the exception handler (dedupe map) and `Model::$dispatcher`, all ported verbatim.
- **Outcome:** AD-5's lint bans module-level `let` and *static* fields only. Every Laravel singleton holds per-request state in *instance* fields; that is why Octane needs reset listeners. Blade expressions may `await` (AD-11). So request A's `@section('content')` can land in request B's layout, `Cookie.queue()` from A is sent to B, and A's guard user is returned to B. Every package obeys AD-5 as written.
- **Gap:** The lint covers statics, but the state lives in instances.
- **Rule (amend AD-5, Consistency "State"):**
  - "A class bound with `singleton()` or `instance()` before `sealed` must not assign to `this.<field>` after construction, except through a `frameSlot` (ADV-01). Lint enforces this on every class registered as a singleton in a provider.
  - Laravel services that hold per-unit state are bound `scoped` or keep that state in frame slots. The minimum list, owned in `PORTING.md`, is the one given in the Units line above: View Factory render state, AuthManager guards, Router, UrlGenerator, Redirector, CookieJar, Translator, Vite, Gate, Log context, the exception handler and `Model::$dispatcher`.
  - View render state (sections, stacks, `@once`, component and loop stacks, fragment buffers) is a per-`render()` `RenderContext`, never Factory state (see ADV-24).
  - NFR-4 concurrency tests exist per listed service."

### ADV-32 — medium — The "boot-only" allowlist is written by the agent it polices

- **Units:** any package author × the State lint.
- **Outcome:** Consistency "State" says module `let` and static mutable fields "fail lint unless listed as boot-only". The list's location and owner are not stated. An agent can add `Carbon.testNow` or `Str.uuidFactory` to its own package's list and pass CI.
- **Rule:** "The boot-only list is `conformance/boot-only-state` (Protected). Each entry gives the FQCN and member. At runtime, a boot-only static throws `ScopeFrameException` if it is written after `sealed`."

## D. Identity: tokens, strings, FQCNs, Registry

### ADV-09 — critical — Facades as specified cannot be built

- **Units:** Support (`Illuminate\Support\Facades\*`, Phase 2) × every Component the facades front (Routing, Database, View/Blade, Http client, Process, Vite …) × AD-1/AD-2/AD-3.
- **Outcome:** AD-3 places all facades in `@xaravel/support/facades`. AD-1 says the container resolves *tokens, never strings*. But the token for `Route` (Router class), `DB` (DatabaseManager), `Blade` (BladeCompiler), `Schema`, `Http` (Factory class) or `Vite` is a class in a package Support may not import (AD-2, and it would be circular). Many have no `Illuminate\Contracts` interface. Meanwhile `app('cache')`, `app()->make('config')`, `$app['events']` and `getFacadeAccessor(): 'db'` are public Laravel API and appear throughout Upstream tests, so banning strings breaks §5.1 parity. The Support agent will invent stub tokens, while the Database agent binds its own class.
- **Gap:** AD-1 conflicts with parity and with AD-2.
- **Rule (amend AD-1, new AD-21 "Service identity"):** "Laravel's container alias strings (`'app'`, `'cache'`, `'cache.store'`, `'db'`, `'events'`, `'router'`, `'blade.compiler'` …, exactly Upstream's `registerCoreContainerAliases` plus each provider's string bindings) are first-class keys. `@xaravel/contracts/aliases` (Phase 1, Protected) defines every alias string with its canonical token and its alias tokens. A facade's accessor is its Laravel string. Facade method types come from interface augmentation (`interface FacadeRoots { db: DatabaseManager }`) declared by the owning package. Arbitrary strings that are not in the alias table and not a Registry FQCN are still rejected, with an error naming the key."

### ADV-10 — high — No canonical token per service

- **Units:** Cache × Queue (unique jobs, `queue:restart`), Session (`CacheBasedSessionHandler`), RateLimiter.
- **Outcome:** The Cache agent binds the `CacheManager` class as a singleton. The Queue agent injects `@inject({ cache: Factory })` (the contract token). The container has no binding for `Factory`, so it either throws or autowires a *second* `CacheManager` with its own `array` store. Unique-job locks and the restart signal then become invisible to each other.
- **Rule (part of AD-21):** "Each service has one canonical token, the most specific Laravel contract it is aliased to (for example `Cache\Factory` for `CacheManager`). Providers bind only the canonical token. The concrete class token, the other contract tokens and the alias string are registered as aliases of it in `@xaravel/contracts/aliases`. Autowiring a concrete class that appears in the alias table as an alias resolves the canonical binding and never constructs a second instance."

### ADV-14 — high — `::class` / `get_class()` identity is not fixed

- **Units:** Events (string events) × Eloquent (`"eloquent.saving: ".static::class`) × Queue (`laravel_unique_job:` + `get_class`, `displayName`) × Broadcasting (`broadcastAs()` defaults to `get_class($event)`) × Auth (policy guessing `App\Policies\{Model}Policy`) × Testing (`Queue.fake().assertPushed('App\\Jobs\\X')`).
- **Outcome:** The Eloquent agent writes `this.constructor.name`, giving `eloquent.saving: User`, while the docs and App code listen on `eloquent.saving: App\Models\User`. The Queue agent keys unique locks by short name, so `App\Jobs\Sync` and `Workbench\App\Jobs\Sync` collide. Broadcast names differ from Laravel Echo's expectation. Each agent obeys AD-10, because AD-10 defines Registry *keys*, not how code obtains a class's name.
- **Rule (amend AD-10):** "`X::class`, `static::class`, `get_class($o)` and `$o::class` translate to `fqcn(XOrInstance)` from the Registry. It throws when the class is unregistered. `Function.prototype.name` / `constructor.name` must not be used for identity, which lint enforces in `packages/*/src`. Event names, lock keys, payload `displayName`/`commandName`, `broadcastAs` defaults, morph classes, policy guessing and fake assertions all use `fqcn()`. Dispatchers normalize a class argument to its FQCN, so `listen(Login, ..)` and `listen('Illuminate\\Auth\\Events\\Login', ..)` are the same key."

### ADV-15 — high — The Class Registry has no home and an incomplete contract

- **Units:** Class Registry (Phase 1 Xaravel Component) × every package entry module × Ported Tests (bun runs all test files in *one process*) × Testbench workbench classes.
- **Outcome:**
  - **No home:** AD-10 says each framework class registers "in its package's entry module", but the Registry's own package is unstated. Phase 1 has no container, so where does `register()` live?
  - **Subpath imports:** a worker that imports `@xaravel/framework/queue/...` by subpath never evaluates `@xaravel/queue`'s root entry, so `Illuminate\Queue\CallQueuedHandler` is missing.
  - **Fixture classes:** AD-10's PSR-4 rule covers `app/` only. Ported Tests whose fixtures appear in payloads or morph columns (`Illuminate\Tests\Database\EloquentModelStub`) get whatever key each agent invents.
  - **Duplicates:** two test files register the same FQCN to different classes. Whether that throws, overwrites or is ignored differs per agent.
- **Rule (amend AD-10):**
  - "The Registry is `@xaravel/contracts/registry` (runtime module beside scope, ADV-01).
  - Each framework class file registers itself (`registerClass('Illuminate\\…', X)` at module end), not the package index. Packages must not declare `sideEffects: false`.
  - Ported Test fixture classes register their Upstream FQCN through `registerTestClass(fqcn, X)`, which writes to the test frame overlay.
  - Registering an existing key with a different class throws, except: same source path (hot reload) replaces; test overlay shadows the base.
  - Testbench workbench classes map `workbench/app` → `Workbench\App\`."

### ADV-22 — high — Two owners of one third-party symbol

- **Units:** Http (Symfony HttpFoundation/HttpKernel shapes) × Routing (needs `NotFoundHttpException`, `MethodNotAllowedHttpException`, Symfony Request methods) × Console (Symfony Console) × Support (Carbon, Doctrine Inflector) × Contracts (PSR interfaces).
- **Outcome:** AD-2 maps third-party `require` entries through NFR-2. When the answer is "own code", both Http and Routing write their own `NotFoundHttpException`. The Foundation handler's `instanceof` check on one class misses the other, and the Registry gets two classes for `Symfony\Component\HttpKernel\Exception\NotFoundHttpException`. `illuminate/contracts` extends `Psr\Container\ContainerInterface` and `Psr\SimpleCache\CacheInterface`, but AD-1 says contracts "has no dependencies" and doesn't say where the PSR interfaces live.
- **Rule (new AD-22 "Shim ownership"):** "Every non-`Illuminate` symbol that Laravel exposes or that more than one Component uses has exactly one owner package, listed in `PORTING.md`'s shim table (Protected): PSR interfaces → `@xaravel/contracts/psr/*`; Symfony HttpFoundation and HttpKernel exceptions → `@xaravel/http`; Symfony Console → `@xaravel/console`; Carbon → `@xaravel/support`; Inflector, portable-ascii → `@xaravel/support`; CommonMark → `@xaravel/support`. The owner registers the shim class under the original FQCN. A second definition anywhere fails CI (duplicate-FQCN scan)."

### ADV-16 — high — Marker brands as instance fields clash with the Model Proxy and with class-level checks

- **Units:** Eloquent (AD-7 Proxy) × Auth (`MustVerifyEmail` on `User`) × Queue/Events (listener `ShouldQueue` check) × Broadcasting (`ShouldBroadcast`).
- **Outcome:** AD-9's interface requires `readonly [Token]: true`. The natural implementation, `readonly [MustVerifyEmail] = true as const`, is a field initializer. On a Model, AD-7's `defineProperty` trap turns it into an attribute *default*, so it lands in `getAttributes()`, dirty tracking and `INSERT`. Separately, the Events dispatcher must decide whether a *listener class* is queued before constructing it: Laravel uses reflection on the class string and does not instantiate. A brand that exists only on instances forces construction, with injected side effects, at dispatch time.
- **Rule (amend AD-9):** "Brands are installed on the class prototype by the class decorator `@implements(ShouldQueue, …)`. The interface field is satisfied by `declare readonly [ShouldQueue]: true`. Checks use `hasBrand(classOrInstance, Token)`, which walks the prototype chain and works on constructors. The Model Proxy passes all symbol-keyed and `#private` access straight to the target and never routes it to attributes."

### ADV-44 — medium — Trait identity is a runtime contract, deferred as a doc line

- **Units:** Eloquent (`SoftDeletes`) × Routing (`withTrashed` binding checks `class_uses_recursive`) × Queue (`InteractsWithQueue`, `Queueable`, `SerializesModels`) × Database (`HasUniqueIds`).
- **Outcome:** "Trait-mixin mechanics" is deferred to a one-line `PORTING.md` entry. Several agents then test trait use by different means (`instanceof` a mixin class, a symbol on the prototype, a static list). `Route::bind` + `withTrashed` misses `SoftDeletes` models.
- **Rule:** "Phase 1 ships `mixin(Base, ...Traits)` and `classUsesRecursive(x): Set<Trait>` in `@xaravel/support`. Traits are registered under their Upstream FQCN. This is a code contract, not a doc line."

## E. Value model and serialization

### ADV-08 — critical — The PHP array representation is never fixed

- **Units:** Collections (`all()`, keyed maps) × Support (`Arr`, `data_get`) × Request (`all()`, `input('items.0')`) × Config (`config('x')` returns arrays) × Validation (`*` paths) × Session attributes × `@xaravel/assert` (`assertSame` "including array key order", built *independently of support*).
- **Outcome:** JS objects reorder integer-like keys first, so `['b'=>1, '2'=>x, 'a'=>2]` cannot be a plain object. The Collections agent picks an ordered `Map`-backed store. The Request agent returns plain objects. The matcher author, who may not import support, compares plain objects and arrays. So `assertSame(['b'=>1,'a'=>2], $c->all())` either fails on correct code or passes on a wrong order (`Map` vs object compared structurally). That gives false passes in the grader. AD-9 covers null, ints, floats and markers, but not arrays, which are PHP's main data structure, nor value-copy semantics.
- **Rule (new AD-23 "PHP arrays"):** "A PHP array crosses public APIs as: a JS array when `array_is_list` holds; a plain object when every key is a non-integer-like string; otherwise a `PhpArray` (ordered map class branded `Symbol.for('xaravel.php.array')`, with `toJSON`, iteration in insertion order and PHP key normalisation). Inputs accept all three forms. Value-copy happens at the boundaries `PORTING.md` lists (Collection construction and `all()`, `Arr::*` returns). Matchers detect the brand by `Symbol.for`, without importing support. Objects that take part in PHP `==` comparison expose `[Symbol.for('xaravel.php.props')]()` (Models return attributes and relations; Carbon returns its timestamp and timezone), so the grader compares them the way PHP does."

### ADV-11 — high — Several PHP `serialize()` / `json_encode` codecs

- **Units:** Session (payload `serialize($attributes)`, `session.serialization`) × Encryption (FR-77 codec, `Crypt::encrypt`) × Cache (file, database and redis stores serialize values; numerics raw) × Queue (payload) × Collections/Http (`toJson`, `JsonResponse`).
- **Outcome:** `illuminate/session` does not require `illuminate/encryption`, so under AD-2 Session cannot import the FR-77 codec and writes its own. One codec writes `s:5:"héllo"` using UTF-16 length, the other uses UTF-8 bytes (`s:6:`). PHP-encrypted sessions then fail to decode, which defeats FR-77's "migrate without logging users out". On JSON: PHP `json_encode` escapes `/` and non-ASCII by default, encodes `[]` versus `{}` by list-ness and uses `serialize_precision` floats, while `JSON.stringify` does none of this. `Collection.toJson()` differential tests pass in one package while `JsonResponse` bodies differ in another.
- **Rule (new AD-24 "Codecs"):** "`@xaravel/support/php` owns the only `phpSerialize`/`phpUnserialize` (UTF-8 byte lengths, `d:` floats with PHP's `serialize_precision = -1`, objects through Registry FQCN, `allowed_classes` honoured) and the only `jsonEncode(value, flags)`/`jsonDecode` (PHP flag semantics, `JsonSerializable`/`Arrayable`/`Jsonable` hooks, list vs map per AD-23). Each is verified by Oracle Differential Tests, including non-ASCII and float edge cases. Fixed uses:
  - Session stores attributes with `session.serialization` at Laravel's default for the Pin, `php` interop-tested both ways.
  - Cache stores `phpSerialize(value)`, except numeric values, which are stored raw (Laravel).
  - Encrypter payloads use `jsonEncode(.., JSON_UNESCAPED_SLASHES)`.

  `JSON.stringify` on framework values in `packages/*/src` is a lint error."

### ADV-12 — high — Job payload format and async model restore are unspecified

- **Units:** Queue × Eloquent (`SerializesModels`, `ModelIdentifier`) × Events (`CallQueuedListener`) × Mail/Notifications (queued mailables and notifications) × Context (FR-81 dehydration).
- **Outcome:** One agent writes `data.command` as JSON with a `__class` key. Another uses PHP `serialize()` per Laravel. A third uses `structuredClone`-like tagging. Queued listeners from Events can't be run by Queue's handler. Restoring a `ModelIdentifier` needs a DB query, which is sync `__wakeup` in PHP. One agent makes `unserialize` async, while a sync-codec agent leaves unhydrated identifiers in `handle()`. Context's `illuminate:log:context` hook key differs from the one Queue reads.
- **Rule (new AD-25 "Job payload"):** "The payload is Laravel's JSON envelope verbatim: `uuid`, `displayName`, `job`, `maxTries`, `maxExceptions`, `failOnTimeout`, `backoff`, `timeout`, `retryUntil`, `data.commandName`, `data.command`, plus `createPayloadUsing` extras such as Context's `illuminate:log:context`. `data.command` is `phpSerialize(job)`. Models become `ModelIdentifier` (FQCN, id, relations, connection, collectionClass). Restore has two phases: sync `phpUnserialize`, then `await restoreModels(job)` before `handle()`. Every queued type (job, listener, mailable, notification, broadcast event) goes through `@xaravel/queue`'s `JobPayload` codec. Closures use AD-14's codec inside the same envelope."

### ADV-13 — high — `toJson` and `toJSON` collide

- **Units:** Eloquent (FR-66 says "`toArray` / `toJSON`") × Http (`JsonResponse`, `Router::toResponse` for models and arrays) × Collections.
- **Outcome:** The Eloquent agent follows FR-66 literally and gives `Model.toJSON()` Laravel's `toJson()` semantics, returning a *string*. JS's `JSON.stringify(model)` calls `toJSON` and embeds that string, so responses carry `"{\"id\":1}"`. Both agents obey every AD.
- **Rule (Consistency "Names"):** "Laravel's `toJson()` stays `toJson(): string`. Laravel's `jsonSerialize()` is ported as `jsonSerialize()`, and every `JsonSerializable` class defines `toJSON() { return this.jsonSerialize() }`. FR-66's `toJSON` wording is amended accordingly."

### ADV-17 — high — The BIGINT rule contradicts itself across Connection and Eloquent

- **Units:** Database (Connection normalisation) × Eloquent (`'bigint'` cast).
- **Outcome:** AD-9 says the Connection throws `IntegerOverflowException` above `MAX_SAFE_INTEGER`, and that a `'bigint'` cast "always yields bigint". The cast runs in Eloquent *after* the Connection has already thrown, so the cast can never see an overflowing value. There is a second problem: if one Database Story implements `cursor()` through `stmt.iterate()` and skips the normaliser, `1n` leaks and `1n === 1` is false. With `safeIntegers` on, SQLite returns bigint for every integer, booleans included.
- **Rule (amend AD-9):** "The Connection returns raw rows (`bigint` for every int8). One function, `normalizeRow(row, castHints)`, is applied by every fetch path (`select`, `cursor`, `lazy`, `pluck`, `value`, `scalar`, aggregates, `insertGetId`). Columns hinted `bigint` (Eloquent passes the model's `bigint` casts; the query builder accepts `.castsBigint(cols)`) keep `bigint`. All others become `number`, or throw `IntegerOverflowException` naming the column. A Ported Test per fetch path asserts no `bigint` escapes."

### ADV-35 — medium — APP_KEY: raw bytes or config string, depending on the consumer

- **Units:** Encryption × Routing (`UrlGenerator` signing) × Queue (AD-14 closure signing) × Cookie (`CookieValuePrefix`).
- **Outcome:** Laravel signs URLs and `SerializableClosure` with the *config string* (including `base64:`), but builds `CookieValuePrefix` from the encrypter's *raw key bytes*. Each agent parses APP_KEY its own way. PHP-signed URLs and cookie prefixes then fail to verify in Xaravel (NFR-5, FR-77), and `APP_PREVIOUS_KEYS` rotation is applied inconsistently.
- **Rule:** "`@xaravel/encryption` exposes `AppKey` (`raw()`, `configString()`, `previous()`). `PORTING.md` holds a Protected table mapping each consumer to Laravel's exact choice (Encrypter → raw, UrlGenerator → configString and previous, closures → configString, cookie prefix → raw). Interop Differential Tests cover each consumer."

## F. Lifecycle and boot order

### ADV-19 — high — Foundation (Phase 6) must name classes from Phases 7–8

- **Units:** Foundation core (Phase 6: `DefaultProviders`, `registerCoreContainerAliases`, Kernel `$middlewarePriority` with `Authenticate`/`Authorize`) × Auth, Queue, Broadcasting, Notifications (Phase 8) and Mail, Console (Phase 7).
- **Outcome:** Foundation is not a split package, so AD-2 gives it no `composer.json` to mirror ("any Upstream Component"). A Foundation agent writes `import { AuthServiceProvider } from '@xaravel/auth'`, which doesn't exist yet. Or it stubs the provider, which FR-111 rejects. Or it leaves the class out. Then the Phase 8 Auth, Queue and Broadcasting agents all edit Foundation's provider list and alias table at the same time, and their merges conflict.
- **Rule (amend AD-2):** "Foundation may statically import only Components of its own or earlier Phases. Default providers, core aliases and middleware priority are lists of FQCN strings. Foundation resolves them lazily through the Class Registry and skips a provider whose package is not installed. Each later package adds itself by FQCN in its own package (provider registration, aliases in `@xaravel/contracts/aliases`). It never edits Foundation."

### ADV-33 — medium — The package-discovery key is unspecified

- **Units:** Foundation (`package:discover`) × htmx, Boost, Testbench providers.
- **Outcome:** Foundation (an Upstream-mirroring package) can't import htmx. So the htmx provider is loaded either by discovery or by the Skeleton listing it. Foundation reads `package.json#xaravel.providers`, while the htmx agent writes `#extra.xaravel.providers`, mirroring Composer. htmx never boots, and FR-17 fails only in the Skeleton.
- **Rule:** "Package discovery reads `package.json` → `"xaravel": { "providers": string[], "aliases": Record<string,string>, "dontDiscover"?: string[] }` from installed dependencies, in `package.json` dependency order. `package:discover` caches it to `bootstrap/cache/packages.json`. Provider order: framework defaults, then discovered, then `bootstrap/providers.ts`, as in Laravel."

### ADV-34 — medium — Async provider `boot()` is undecided

- **Units:** Foundation × Testing/Testbench (`createApplication()`) × App providers (a `boot()` that reads the cache or DB).
- **Outcome:** Under AD-6, an app's `boot()` that awaits `Cache.get` returns a Promise. One Foundation agent awaits each boot, which makes `Application.boot()` async. A Testing agent writes a sync `createApplication()`. A deferred provider booted inside a sync `make()` cannot be awaited.
- **Rule:** "`register()` is sync (typed). `boot()` may return a Promise. `Application.boot()` is async and awaits providers sequentially in Laravel order. Every kernel and TestCase awaits it before `sealed` (ADV-02). Deferred providers must have a sync `boot()`, a type-level requirement."

### ADV-25 — high — Work after the unit ends runs without a frame

- **Units:** Foundation (`defer()`, `terminate`, `app.terminating`) × Cache (`flexible` refresh through `defer`) × Routing/Http (SSE and multipart streaming, FR-43 WebSocket handlers) × Container.
- **Outcome:**
  - **Deferred callbacks:** they run after the response, so after the frame is "discarded". Their `config()`, `Context` or `instance()` writes land in the *global base*, because "no frame is active" means boot writes under AD-5's text.
  - **WebSockets:** `Bun.serve`'s `websocket.message` handlers run outside any request ALS, so every write leaks into the base.
  - **Streaming:** a response body still streaming after the handler returns may find its frame's connection lease already released.
- **Rule (amend AD-5):** "A unit ends only after (1) the response body is fully flushed or the socket is closed, (2) terminable middleware and `terminating` callbacks have run, and (3) the frame's `defer` list, auto-terminals (ADV-27) included, has drained. Each WebSocket message opens a child unit of a connection frame created at upgrade. After `sealed`, any write with no active frame throws `ScopeFrameException`."

### ADV-18 — high — FormRequest validation runs inside a sync container hook

- **Units:** Validation (FormRequest, async `exists`/`unique`) × Container (`afterResolving`, sync per AD-6) × Routing (controller method injection).
- **Outcome:** Laravel validates FormRequests from `afterResolving(ValidatesWhenResolved::class, fn => validateResolved())` during container resolution. Resolution is sync, but validation is async. If the Validation agent ports this as is, it leaves the Promise floating, so the controller runs before validation finishes (or rejects). If the Routing agent adds its own await, validation runs twice.
- **Rule (amend AD-6):** "Container `resolving` and `afterResolving` callbacks are sync-only (typed). Async post-resolution hooks are declared with `container.afterResolvingAsync(Brand, fn)`. Only `Container.callAsync()` and the route/controller dispatcher honour them, by awaiting each in registration order after resolving parameters and before invoking the action. FormRequest registers `validateResolved` there and nowhere else."

### ADV-39 — medium — The pre-parse body check has two owners

- **Units:** Foundation HTTP kernel (FR-28: body parsed once *before* the pipeline, and size enforced *before* buffering) × Http/Foundation `ValidatePostSize` middleware (Upstream tests check it against `CONTENT_LENGTH`).
- **Outcome:** The kernel agent adds its own size check before parsing. The middleware agent ports `ValidatePostSize` as normal middleware, which runs after the body has already been buffered. You get two limits and two exceptions, or one of them never fires.
- **Rule:** "The kernel pipeline has two stages. Global middleware that implement the `BeforeBody` brand (`ValidatePostSize`, `TrustProxies`, `HandleCors` preflight, `PreventRequestsDuringMaintenance`) run first, on headers only. Then `await request.loadBody(limits)` runs. Then the rest of the pipeline runs. `ValidatePostSize` stays the one enforcer, and the kernel never checks size itself."

## G. Database and transactions

### ADV-28 — high — `DatabaseTransactionsManager` vs the per-frame stack

- **Units:** Database × Queue (`afterCommit` jobs) × Events (`ShouldDispatchAfterCommit`, `ShouldQueueAfterCommit`) × Broadcasting × Mail.
- **Outcome:** Laravel uses the `db.transactions` singleton. Queue and Events agents resolve it from the base, while AD-5 keeps transaction state in the frame. Callbacks registered in request A then fire when request B commits, or never fire at all.
- **Rule (amend AD-5):** "`DatabaseTransactionsManager` is a frame slot of the unit frame, shared by its narrow frames. It is the only registry of transaction levels and `afterCommit` callbacks. A callback runs when the *outermost* transaction of *its own unit* commits, and is discarded on rollback."

### ADV-40 — medium — `Promise.all` vs Upstream's sequential IO

- **Units:** Eloquent (eager loading `with(['a','b'])`, `Collection.load`) × Database (query log) × Ported Tests asserting `DB::getQueryLog()` order.
- **Outcome:** One agent parallelises eager loads "for performance", which makes query order nondeterministic. Upstream query-log assertions then fail intermittently and get Quarantined. On a leased connection the queries are serialised anyway.
- **Rule (Consistency "Async"):** "Framework code awaits IO sequentially, in Upstream's order. `Promise.all` or `allSettled` is allowed only where Upstream is itself concurrent (`Http.pool`, `Concurrency.run`, `Process.pool`, batch dispatch), and is listed in `PORTING.md`."

### ADV-41 — medium — Proxy traps vs internal state, mocks and App fields

- **Units:** several Eloquent Epics (attributes, relations, events, serialization) × Mockery (Phase 0 partial mocks) × App models.
- **Outcome:**
  - **Base `#private`:** if one Eloquent Story uses `#private` in the Model base, calling methods with `this` set to the Proxy throws `TypeError`, because the private slots live on the target.
  - **Mocks:** Mockery's partial mocks define own properties after construction, and the `defineProperty` trap captures them as attributes.
  - **App fields:** a non-`declare` field such as `name: string;` emits `name = undefined` (`useDefineForClassFields`). The model then INSERTs `NULL` over DB defaults.
- **Rule (amend AD-7):** "Model base internals live in one symbol-keyed slot (`this[MODEL_STATE]`). `#private` in Model and its concerns is a lint error. The `defineProperty` trap routes to attributes only during the construction window (a flag set in the base constructor and cleared by a post-construction hook), and goes to the target afterwards. A subclass field that is neither `declare` nor a model-configuration property nor listed in `attributes` throws at first construction (RES-G24's boot detection), naming the field."

## H. View and htmx

### ADV-23 — high — AD-12's seam list cannot deliver FR-40 and FR-42

- **Units:** htmx × Routing (`Route` macros) × Validation (FormRequest) × View/Router (`prepareResponse`).
- **Outcome:**
  - **Declared fragment:** FR-40 step 1 declares the fragment "with `.fragment(view, name)` on the route or the Form Request". Neither is an AD-12 seam.
  - **Last rendered view:** step 2 needs "the view the route last rendered", which is state across requests and has no owner.
  - **Partial requests:** FR-42 must turn *any* `view()` returned from a controller into its `content` section for partial requests. That has to happen before the View is rendered by the Router's response preparation, which is not a seam either.
  - **Vary header:** FR-42 needs `Vary` on non-htmx responses too (so a cache does not serve a full page to htmx), but AD-12 says every seam is a no-op for non-htmx requests.

  The htmx agent will either add hooks inside Routing, View and Validation (breaking "no htmx in Upstream packages"), or the Routing and View agents will each add a different generic hook.
- **Rule (amend AD-12):** "Add these seams, each a generic, Upstream-neutral extension point owned by the host package:
  - (g) `Route` and `FormRequest` macros (Macroable) for `fragment()`;
  - (h) `Router.prepareResponseUsing(fn)`, called with the raw controller return value before it becomes a Response;
  - (i) `ViewFactory.renderTargetResolver(fn)`, which chooses full / section / fragment;
  - (j) a per-unit `lastRenderedView` frame slot, written by View.

  The `Vary: HX-Request, HX-Request-Type` middleware applies to every response produced through seam (h) or (i), including non-htmx requests. That is the one allowed non-htmx effect, and it is recorded in FR-42. Upstream Ported Tests run without the htmx provider."

### ADV-24 — high — The compiled-view ABI is unfixed, and direct fragment calls diverge from Upstream

- **Units:** View (AD-11) × htmx (calls the fragment functions directly).
- **Outcome:** The View agent exports `render(data, factory)`, and the htmx agent calls `fragment_row(data)`. Upstream `View::fragment()` *renders the whole view* and extracts the fragment. So variables set by earlier `@php` blocks, `@push`/`@once` side effects and `$loop` state exist in Upstream but not in a direct call. View Ported Tests of `fragment()` then fail, or pass with different semantics and no DIV.
- **Rule (amend AD-11):** "A compiled module exports `render(ctx: RenderContext): Promise<string>` and `fragments: Record<string, (ctx) => Promise<string>>`. `RenderContext` (in `@xaravel/contracts/view`) carries data, the factory, render state (ADV-07) and a fragment capture set. `view().fragment(..)`/`fragmentIf`/`fragments` follow Upstream: a full render with capture. A direct fragment call is allowed only when the compiler marks the fragment *closed* (no reads of template-local bindings defined outside it, no stack or `@once` effects). Otherwise the fragment function falls back to a full render with capture."

### ADV-36 — medium — Renderable ordering between htmx and the app

- **Units:** htmx (exception-handler renderable, FR-35) × Foundation `Handler` × App `withExceptions`.
- **Outcome:** Renderables run first-registered-first. The htmx provider boots before the app's `withExceptions` callback is applied, so htmx Requests never reach the App Developer's custom renderers.
- **Rule:** "The htmx Integration registers through `Handler.fallbackRenderable(fn)`, which runs after every app and framework renderable and before the default render. The validation-exception seam does the same."

### ADV-37 — medium — Same-request re-render flashes into the next request

- **Units:** htmx (FR-40 re-render with errors and old input, status 422) × Session (flash aging).
- **Outcome:** To make `old()` and `$errors` work in the same request, the htmx agent calls `session.flashInput()` and puts `errors` in the flash. Those values then age into the *next* request, so the next full page shows stale errors.
- **Rule:** "The FR-40 path writes old input and errors with `session.now()` semantics (current request only) and shares `$errors` straight into the render context. It never calls `flash()`."

### ADV-38 — medium — The htmx Epic needs Testing, which comes a Phase later

- **Units:** htmx (Phase 6; FR-96 `assertHxTrigger`, `assertFragment` are TestResponse mixins) × Testing (Phase 7, owns `TestResponse` and `this.get()`).
- **Outcome:** The htmx Xaravel Tests in Phase 6 have no HTTP test client. Each htmx agent builds an ad-hoc harness, which conflicts with Testing's later. The htmx assertions can't be delivered inside their own Epic.
- **Rule:** "Phase 6 delivers a minimal `@xaravel/testing` core (`TestResponse`, `MakesHttpRequests` over `kernel.handle`) as part of the Foundation-core Epic, or the htmx TestResponse mixins move to a Phase 7 Story. Either way, htmx Xaravel Tests drive requests only through that core."

## I. Testing, Testbench and Queue workers

### ADV-20 — high — No TestCase lifecycle ABI, and nobody owns the NFR-7 resets

- **Units:** Testing (Foundation `TestCase`, traits `setUp<Trait>`, `beforeApplicationDestroyed`) × Testbench (`defineEnvironment`, `getPackageProviders`) × `portedTest()` (Phase 0 grader, callback-shaped).
- **Outcome:** `portedTest(id, {variants}, fn)` gives `fn` no `this`. Upstream integration tests need `$this->app`, `$this->get()` and overridable `defineEnvironment()`. The Testing and Testbench agents design two class-based lifecycles with different hook order. NFR-7 resets (clock, fakes, `Str` factories, `Sleep`/`Once`/`Lottery`) cannot be done by the grader, which may not import support. Testing's tearDown may or may not do them.
- **Rule (new AD-26 "Test lifecycle"):** "`@xaravel/contracts/testing` defines the ordered hooks: `createApplication` → `afterApplicationCreated` → `setUpTraits` (each `setUp<Trait>`) → test → `tearDownTraits` → `beforeApplicationDestroyed` → frame end. `portedTest(id, { case?: TestCaseClass }, fn)` instantiates `case`, runs the hooks inside a test frame (through the ADV-01 protocol) and calls `fn.call(instance)`. Testbench's `TestCase` extends Foundation's and only adds hooks. NFR-7 state is frame-slotted, so it resets when the test frame is discarded. A Xaravel Test per item proves the reset."

### ADV-21 — high — Supervisor plus child breaks in-process Worker tests and fakes

- **Units:** Queue (AD-13) × Testing (`Event.fake()`, `artisan('queue:work --once')`, `travel()`) × Upstream `WorkerTest` (constructs `Worker` and calls `runNextJob` in-process with `Sleep::fake`).
- **Outcome:** If the Queue agent applies AD-13 to the `Worker` class itself, every Upstream `WorkerTest` and every fake-based console test breaks, because the job runs in a child process that can't see the test's fakes or clock. A child that runs several jobs at once (an "optimisation" that frames allow) loses every in-flight job when the timeout kill fires.
- **Rule (amend AD-13):** "The supervisor/child split lives only in the `queue:work` command entry, when `--timeout > 0` and not `--once`/`--stop-when-empty` under `APP_ENV=testing`. `Worker` keeps Upstream's in-process API. A child processes exactly one job at a time. Timeout tests use a spawned fixture app, adapted under AD-13's rule."

### ADV-48 — low — A graded package re-exports grader code

- **Units:** `@xaravel/testing` (graded) × `@xaravel/assert` / `@xaravel/mockery` (Protected grader).
- **Outcome:** If Testing re-exports `assertSame` from `@xaravel/assert`, Upstream `tests/Testing/*` Ported Tests grade the grader's own code, and App-reported bugs can only be fixed through Infrastructure Stories.
- **Rule:** "Graded packages may take the grader only as a dev dependency, with one exception: `@xaravel/testing` may depend on `@xaravel/mockery` at runtime (FR-100). `Illuminate\Testing\Assert` and its constraints are ported independently inside `@xaravel/testing`."

## J. Redis, Cache and backend isolation

### ADV-29 — high — AD-17 forbids `flushdb()`, which Upstream uses as behaviour and as teardown

- **Units:** Redis/Cache (`RedisStore::flush()` calls `flushdb()`; `InteractsWithRedis::tearDownRedis()` calls `flushdb()`) × the AD-17 harness (prefix `xaravel:<key>:`, "never flush a whole Redis database") × Cache's own prefix.
- **Outcome:** The Cache agent must either break AD-17 to pass `Cache::flush()` Ported Tests, or rewrite `flush` as `SCAN`+`DEL` on the prefix. That is a behaviour divergence with no DIV, which §5.1 calls a bug. Prefixes also stack (`xaravel:<key>:` + `options.prefix` + `cache.prefix`), which breaks Upstream tests that assert exact keys and `getOptions()`.
- **Rule (amend AD-17):** "Redis isolation is per worktree *server*, not per prefix. The harness starts (or reuses) `redis-server --port <49152 + (key mod 8192)>` with `--save '' --appendonly no` for each worktree. Tests may `flushdb`, and no harness prefix is injected. In CI, each job's own service container is its server. Postgres keeps per-key databases. Tests that drop databases may only drop names matching `xaravel_test_<key>_*`."

### ADV-43 — medium — Ambiguous Backend Variant vocabulary

- **Units:** Queue (`database` and `redis` driver variants) × Cache/Session (`redis` backend) × harness.
- **Outcome:** `variant: database` for Queue: is that SQLite or Postgres? `redis` means both a backend and a queue driver. Two agents write the same pair differently in the expectations shards.
- **Rule:** "Variants come from a Protected closed vocabulary, `conformance/variants`: `none`, `sqlite`, `pgsql`, `redis`, and driver variants written `<driver>@<backend>` (`queue-database@sqlite`, `queue-database@pgsql`, `queue-redis@redis`, `session-database@pgsql` …). The Test Inventory's `backends` field uses the same values."

### ADV-47 — low — Worktree keys get reused and shared

- **Units:** harness (AD-17) × worktree lifecycle and parallel runners.
- **Outcome:** A new Story worktree at a path used by an earlier Story inherits a stale `xaravel_test_<key>` with old migrations. Two `bun test` processes in one worktree (an agent running fast mode next to a full run) share one DB.
- **Rule:** "The key is SHA-256(worktree path + git worktree creation id). The harness drops and recreates the per-key databases at the start of a full run, and takes a lock file `.cache/harness.lock`, so a second runner in the same worktree waits or fails fast."

## K. Conformance machinery: gaming and collisions

### ADV-30 — high — A Story agent can move or hide work while obeying AD-15 and AD-16

- **Units:** Story agent × Ratchet / FR-4 / FR-113 / Fidelity Review.
- **Outcome:**
  1. **Editable manifest:** the Story file's `test_ids:` is "the only authority", but nothing protects the Story file. An agent can add Test IDs to take over neighbours' Expectation lines, or drop hard ones.
  2. **Self-declared variants:** `portedTest(id, { variants }, fn)` takes its variants *from the test code*. Declaring `['sqlite']` hides the failing `pgsql` variant.
  3. **Unchecked `blocked-by`:** FR-3 checks only that `blocked-by:<c>` names a later Phase. Any hard test can be marked `blocked-by:queue`, and the Story is "done".
  4. **Unpoliced test blocks:** FR-4 polices Expectations lines, not Ported Test bodies. A Story can weaken a `portedTest` block owned by another Story, and the block still passes, so the Ratchet is silent.
  5. **Assertion padding:** the assertion floor counts totals. Padding with trivial matcher calls, or using `bun:test` `expect`, meets the count.
  6. **Self-declared adaptation:** `adapted:DIV-1` is self-declared, with no link to which assertions changed.
- **Rule (amend AD-15, AD-16):**
  - **Manifest:** Story files live under `stories/` (Protected, written by the planner). CI reads `test_ids` from the *base* branch. A Test ID may be listed by at most one open Story.
  - **Variants:** they come from the Inventory's `backends`. The wrapper takes no variant list, and the harness fails a Test ID whose variants differ.
  - **`blocked-by`:** it is valid only if the test, run under the harness, fails with `BlockedByComponentError(<c>)`. That error is raised when resolving a token, alias or FQCN that belongs to `<c>` (from the component map) and is not installed.
  - **Test blocks:** CI parses `portedTest` blocks by Test ID and fails a PR that changes any block whose ID is not in its `test_ids`.
  - **Assertions:** Ported Tests may assert only through `@xaravel/assert`, and importing `expect` from `bun:test` under `tests/ported` is a lint error. The floor compares the *multiset of assertion kinds* recorded in the Inventory, not just the total.
  - **Adaptation:** every `adapted:DIV-N` entry needs `// adapted:DIV-N.<clause>` on each changed assertion line. Divergence Records number their adaptation clauses.

### ADV-31 — high — The conformance layout guarantees collisions between parallel Stories

- **Units:** parallel Stories × Oracle workflow × Escalations × generated files × Ratchet.
- **Outcome:**
  1. **Oracle fixtures:** the Oracle workflow "commits fixtures to `conformance/fixtures/<component>/`", which is a Protected Path. If a Story PR triggers it, the PR touches a Protected Path, so every Differential-Test Story needs the Maintainer's `infrastructure` label. Fixture inputs taken from agent-written test code also let an agent choose trivially matching inputs.
  2. **ESC numbers:** two agents both create `ESC-0042.md`, an add/add conflict.
  3. **Semantic merge conflicts:** two PRs that are green on their own, both touching `async-surface.json` or sorted, adjacent Expectations lines, leave main red after both merge.
  4. **Unexpected-pass deadlock:** Story B's code makes a test owned by another Story (or by no Story) pass where it was `fail-known` or `blocked-by`. The Ratchet fails B, and FR-4 forbids B to update that line. B is stuck.
  5. **Shared test files:** one Upstream test file split across two Stories means both edit one `.test.ts`.
- **Rule (amend AD-15, AD-16):**
  - **Oracle:** inputs are extracted mechanically from Upstream into `conformance/oracle/requests/<component>.jsonl` (Protected), and fixtures are generated for the whole Inventory per Baseline Pin by an Infrastructure run. Story PRs never trigger the Oracle. Xaravel-only Differential inputs (FR-46) are Protected too.
  - **ESC IDs:** `ESC-<story-id>-<n>`.
  - **Merging:** merges go only through a GitHub merge queue, whose merge-group CI regenerates and checks `async-surface.json` and runs the Ratchet on the combined tree.
  - **Unexpected passes:** an unexpected pass of a Test ID owned by no open Story is a warning, and a post-merge bot opens a promotion PR. An unexpected pass of a Test ID owned by another open Story fails only that Story's next CI run.
  - **Slicing:** no two open Stories may split one Upstream test file, and CI checks this across open Story manifests.

### ADV-42 — medium — No ownership rule for editing another Component's package or `@xaravel/contracts`

- **Units:** Routing Story × `@xaravel/http` source; any Story × `@xaravel/contracts`; re-verification Stories (Phase 3 Events re-verifying Support's `EventFake`) × an in-flight Support Story.
- **Outcome:** Routing needs Symfony request methods the Http agent didn't port, and edits `packages/http/src` in parallel with an open Http Story, which causes conflicts. Xaravel-only contracts get added by several Stories at once. That is the duplicate-contract risk AD-1 claims to prevent.
- **Rule (new AD-27 "Edit ownership"):** "A Story may change only `packages/<its component>/**`, its own Expectations lines and its own escalations. CI checks paths against the Story's `component:`. A need in another package becomes a dependent Story on that package's Epic, which unblocks the requester through `blocked-by`. `@xaravel/contracts` is Protected after Phase 1. A missing or changed contract goes through an Escalation. Xaravel-only contracts (scope, registry, aliases, view ABI, test lifecycle, htmx) are listed now and built in Phase 1."

## L. Type-level leaks

### ADV-45 — low — Module augmentation leaks types into the whole program

- **Units:** htmx (`Request`/`TestResponse` augmentation) and facade-root augmentations × Upstream-mirroring packages type-checked in the same `tsc` program.
- **Outcome:** `request.htmx()` type-checks inside `@xaravel/routing` without any import, then fails at runtime when htmx is not installed. The AD-12 import ban doesn't catch it.
- **Rule:** "Each package is a `tsc` project reference with `types` limited to its own `dependencies`. CI type-checks each package in isolation."

### ADV-46 — low — Mixin names can collide with Upstream methods

- **Units:** htmx mixins (`source()`, `target()`, `assertFragment`) × Upstream `Request`/`TestResponse` at a later Pin.
- **Outcome:** A Pin bump adds an Upstream method with the same name. Either the htmx mixin silently overrides it, which breaks parity, or the reverse happens.
- **Rule:** "Seam mixins install through a `mixinStrict()` that throws at boot when the target already has the member. Upstream wins, and the htmx name is renamed by Escalation."

---

## Cross-check: ADs that need amendment

| AD | Findings |
| --- | --- |
| AD-1 | ADV-09, ADV-10, ADV-22, ADV-42 |
| AD-2 | ADV-01, ADV-19, ADV-22 |
| AD-5 | ADV-01, ADV-02, ADV-03, ADV-04, ADV-05, ADV-07, ADV-25, ADV-28, ADV-32 |
| AD-6 | ADV-06, ADV-18, ADV-26, ADV-27, ADV-40 |
| AD-7 | ADV-16, ADV-41 |
| AD-9 | ADV-08, ADV-16, ADV-17 |
| AD-10 | ADV-14, ADV-15, ADV-19 |
| AD-11 | ADV-06, ADV-24 |
| AD-12 | ADV-23, ADV-36, ADV-37, ADV-45, ADV-46 |
| AD-13 | ADV-21 |
| AD-15 / AD-16 | ADV-20, ADV-30, ADV-31, ADV-43, ADV-48 |
| AD-17 | ADV-29, ADV-47 |
| New | AD-19 Scope primitive, AD-20 Connection leases, AD-21 Service identity, AD-22 Shim ownership, AD-23 PHP arrays, AD-24 Codecs, AD-25 Job payload, AD-26 Test lifecycle, AD-27 Edit ownership |

Source amendments that follow: FR-66 (`toJSON` wording, ADV-13), FR-42 (`Vary` on non-htmx responses, ADV-23), FR-10/Glossary (contracts also hold the scope, registry and alias runtime modules, ADV-01/ADV-15), DIV-8 (fake and TestResponse assertions become async when given a predicate, ADV-26).
