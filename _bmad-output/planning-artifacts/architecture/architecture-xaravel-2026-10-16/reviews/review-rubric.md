---
review: rubric-walk
target: ../ARCHITECTURE-SPINE.md
context: ../../../prds/prd-xaravel-2026-10-15/prd.md (+ addendum.md, review-triage.md, brief research/deps-map.md)
date: 2026-10-16
priorities: (1) Laravel App Developer experience, (2) unattended parallel Framework Agent throughput
---

# Rubric Review — Xaravel Architecture Spine

## Verdict

Not ready to bind parallel Epics yet. The spine is strong on what it covers: the contracts package, DIV-3 injection, Scope Frames, the Eloquent Proxy and relationship surface, and the conformance data model. But four critical gaps remain:

- **No L0 runtime home.** It has nowhere to put the runtime primitives that Phase-1 packages need, and AD-2 forbids those packages from reaching where the spine currently puts them.
- **No PHP-array rule.** It leaves out the most common PHP value of all, the ordered array.
- **No home for ported third-party code.** Nobody owns the Symfony, Carbon and Monolog replacement code.
- **Bypassable grader protection.** Agents with repo write access can get around the Protected Paths enforcement.

Several high findings are cross-Epic API-shape decisions. Today they are either missing or pushed into an unbounded `PORTING.md`.

## Scorecard

| # | Checklist item | Result | Main findings |
| --- | --- | --- | --- |
| 1 | Fixes the real divergence points, misses none | **Fail** | C1, C2, C3, H1, H2, H3, H5, H6, H7, H8, H13, H14 |
| 2 | Every Rule enforceable and actually prevents its divergence | **Partial** | C4, H4, H9, H10, H11, H15, H16 |
| 3 | Nothing Deferred lets units diverge before decided | **Partial** | M9, M15, H2 (PORTING.md scope) |
| 4 | Named tech plausibly current | **Pass** (minor notes) | L3 |
| 5 | Covers the PRD capabilities | **Partial** | M13 |
| 6 | Every owned dimension decided / deferred / open | **Fail**: security, observability, performance and docs/licensing are mostly silent; CI scope is thin | C4, H12, M7, M8, M10, M11, M12, L4 |
| 7 | Decisions not rationale; terse; valid mermaid | **Pass** (minor) | L1, L2 |

Severity counts: **critical 4 · high 17 · medium 15 · low 8**.

---

## Critical

### C1 — No L0 runtime home for the cross-cutting primitives (AD-2 × AD-4 × AD-5 × AD-9 × AD-10)

- **Problem:** The spine puts each cross-cutting runtime primitive in a package that Phase-1 packages may not depend on:
  - the only `AsyncLocalStorage` / ScopeFrame is in `@xaravel/container` (Phase 2) (AD-5);
  - the `Symbol.metadata` polyfill is in `@xaravel/support` (Phase 2) (AD-4);
  - the PHP-semantics porting helpers (float marker, loose comparison) are in `@xaravel/support` (AD-9);
  - the Class Registry has no named package at all (AD-10; the PRD calls it a *Xaravel Component*).

  AD-2 says package edges mirror Upstream `require`, and Upstream-mirroring packages never depend on Xaravel Components. So the Phase-1 packages cannot reach any of these primitives:
  - `illuminate/config` requires only collections and contracts, yet AD-5 explicitly overlays `config([...])` writes into the frame.
  - `illuminate/collections` requires only conditionable, macroable and contracts, yet it needs loose comparison (`contains('1')`) and integer-like key normalisation.
  - `illuminate/macroable` requires nothing, yet its static `$macros` registry varies per test.
  - `illuminate/container` requires only contracts and psr/container.
  - Every package's entry module must register its exceptions in the Registry under their FQCN.

  Phase-1 agents will each work around this differently: copying helpers, adding illegal edges, or using module-level state.
- **Fix:** Add an AD that creates one Xaravel-internal L0 package, e.g. `@xaravel/runtime`. It has zero dependencies, sits beside `@xaravel/contracts`, and is ported in Phase 1's first Epic. It owns:
  - the ScopeFrame `AsyncLocalStorage` and overlay primitives (C1 + M8);
  - the Class Registry;
  - the `Symbol.metadata` polyfill, installed by every runtime subpath module;
  - PHP-semantics helpers (`looseEquals`, numeric-string checks, key normalisation, float marker);
  - the base `Exception`/SPL exception classes (see H3/C3).

  Amend AD-2: "every package may depend on `@xaravel/runtime` and `@xaravel/contracts` regardless of Upstream `require`." Re-point AD-4, AD-5, AD-9 and AD-10 to it. Add a Phase-1 placement note to Source Amendments (§7.3 Phase 1 list).

### C2 — The PHP array representation is undecided (AD-9, DIV-9)

- **Problem:** AD-9 decides null, integers, int/float and markers. It does not decide what a PHP `array` is in TypeScript, or the PHP value-copy semantics that RES-G7 raised. JS plain objects reorder integer-like keys (`{ "2": a, "1": b }` iterates `1, 2`), but FR-23 requires PHP key order, "including integer-like keys". Every Component passes PHP arrays across package boundaries: config, request `all()`/`only()`, validation data and rules, `toArray()`, query bindings, `Arr`/`data_get`, job payloads, view data. Each Epic will pick its own form (array, object, `Map`, a custom class), and the Collections choice will not match what Http or Validation hands it.
- **Fix:** Add an AD-9 bullet **"Arrays"**:
  - PHP lists are JS `Array`.
  - PHP string-keyed maps are plain objects only when no key is integer-like. Otherwise they are a single runtime `PhpArray` ordered-map type (from `@xaravel/runtime`) that every `Arr`/`Collection`/`data_get` entry point accepts.
  - Public APIs never mutate a caller-supplied array or object, and never hand out internal arrays by reference (copy on return, or `Object.freeze`), which reproduces PHP value-copy.
  - JSON shape follows PHP `json_encode` rules: a list becomes `[]`, anything else becomes `{}`.
  - CI checks this with a Xaravel Test per rule in `@xaravel/runtime`.

  Add DIV-9 to Source Amendments.

### C3 — No home for ported third-party PHP code: Symfony, Carbon, Monolog and others (AD-2, Stack, NFR-2)

- **Problem:** AD-2 maps third-party `require` entries "through the NFR-2 order" and records them in each package `README`. It never says *where* code goes when the answer is "write it". The brief's deps-map shows these are shared and large:
  - Symfony Console has 253 imports;
  - HttpFoundation is used by Http, Routing, Session, Cookie, Foundation and Validation;
  - the HttpKernel exception hierarchy is used everywhere;
  - Mime is used by Mail, Filesystem and Validation;
  - Process is used by Process, Console, Queue and Schema;
  - Carbon is used by Support, Database, Queue, Cache and Validation;
  - also Monolog, phpdotenv, Doctrine Inflector, cron-expression, uuid, league/commonmark, css-to-inline-styles.

  Parallel Phase-6/7 Epics (Http, Cookie, Session, Routing) will each port their own slice of `Symfony\Component\HttpFoundation`. That gives duplicate classes, broken `instanceof` across packages, and conflicting Registry FQCNs. `Illuminate\Http\Request extends Symfony Request` makes this load-bearing. Also, NFR-2 says dependencies are recorded "in the architecture document", but the spine moved that to package READMEs without listing the change as an amendment.
- **Fix:** Add an AD with a **dependency replacement table**: PHP library → Xaravel home → phase → owner Epic. For example:
  - `symfony/http-foundation` and `symfony/http-kernel` exceptions → `@xaravel/symfony-http-foundation`, Phase 6, first Http Epic;
  - `symfony/console` → `@xaravel/symfony-console`;
  - `nesbot/carbon` → `@xaravel/carbon`, Phase 2, before Support;
  - `monolog` → inside `@xaravel/log`;
  - `vlucas/phpdotenv` → inside `@xaravel/config` or foundation;
  - `doctrine/inflector` → inside `@xaravel/support`.

  Ported Symfony classes register in the Class Registry under their `Symfony\…` FQCN. Only the owning package may define a class from that namespace (CI: a duplicate-FQCN check over Registry registrations). Either list each npm dependency in the spine, or add "NFR-2: recorded in package README" to Source Amendments.

### C4 — Protected Path enforcement can be bypassed by the agents it is meant to constrain (AD-16, AD-18, FR-112)

- **Problem:** There are three ways around the AD-16 rule:
  1. For branches pushed to the same repository, GitHub runs the `pull_request` workflow *from the PR's own merge ref*. A PR that edits `.github/workflows/*` can therefore delete the protected-paths job that would have failed it. Same-repo PRs also get repo secrets.
  2. GitHub labels are not permission-scoped. Anyone with triage or write access, and any job whose `GITHUB_TOKEN` has `issues`/`pull-requests: write`, can apply the `infrastructure` label. "Only the Maintainer can apply" is not a GitHub capability.
  3. AD-16 makes the Story file's `test_ids:` the sole authority for FR-4. The spine does not say where Story files live or that they are protected, so an agent can add Test IDs to its own Story in the same PR.

  The grader-gaming risk is the PRD's own top-listed mitigation target (§7.4).
- **Fix:** Rewrite AD-16's enforcement clause:
  - **Ruleset:** a GitHub ruleset on the default branch requires the `protected-paths` and `ratchet` checks. They come from a workflow the ruleset pins to the default branch (an org "required workflow", or `pull_request_target` checking out the PR's diff *as data only*).
  - **CODEOWNERS:** `conformance/protected-paths` is mirrored into `CODEOWNERS` (owner: Maintainer), with "require Code Owner review" on. That approval replaces the label, or the check verifies through the issue-events API that the label actor is the Maintainer.
  - **Story ownership:** CI reads `test_ids:` from the **base-branch** version of the Story file. Story files live under a stated path (e.g. `_bmad-output/implementation-artifacts/stories/`) that is itself listed in `protected-paths`.
  - **Agent identity:** agents push with a fine-grained identity that has `contents: write` on `story/*` only, no `issues`/`pull-requests: write`, and no ruleset bypass.
  - **Workflow permissions:** every workflow defaults to `permissions: contents: read`. Write scopes are granted per job only to the Oracle, dashboard and release jobs.

---

## High

### H1 — Runtime type checks for non-marker contracts are undecided (AD-1, AD-9)

- **Problem:** Laravel branches on `instanceof <Contract>` throughout: `Arrayable`, `Jsonable`, `Htmlable`, `Responsable`, `Renderable`, `UrlRoutable`, `CastsAttributes`, `HasBroadcastChannel`, `DeferrableProvider`, and others. TS interfaces have no runtime identity. AD-9 brands only *marker* interfaces, and AD-1's tokens exist for container binding. One Epic will duck-type (`typeof x.toArray === 'function'`), another will brand, another will check a class list. Responses (Http) and view rendering (View) will then disagree about the same object.
- **Fix:** Extend AD-9's brand rule to **every** contract. Every contract interface requires `readonly [Token]: true`, and every token defines `static [Symbol.hasInstance](v)` that reads the brand. `x instanceof Arrayable` then works exactly like PHP, and `implements` forces the brand at compile time. Lint bans duck-typing checks for contract method names in packages.

### H2 — No PHP language-construct mapping; `PORTING.md` scope is unbounded (Deferred row "Macroable typing…", FR-8)

- **Problem:** Several constructs shape every public signature, and the spine decides none of them:
  - **Named arguments.** `Attribute::make(get:, set:)` (FR-64), `Http::retry(times:, sleepMilliseconds:)`, many constructors.
  - **Backed enums.** `cases/from/tryFrom`, methods on enums. Used by enum casts, `Rule::enum`, implicit enum route binding and `make:enum`.
  - **PHP attributes.** Laravel 13 container contextual attributes `#[Config]`, `#[Auth]`, `#[CurrentUser]`, `#[Give]`, `#[Tag]`; model attributes `#[ObservedBy]`, `#[ScopedBy]`, `#[CollectedBy]`, `#[UsePolicy]`, `#[Scope]`. How do these coexist with AD-4's "only declaration form"?
  - **Magic methods.** `__call`/`__callStatic` forwarding: Manager → Driver (`Cache.get` → store), `ForwardsCalls`, Eloquent statics `User.where()`, Macroable. Also `__get`/`__set` outside Model, `__toString`, `__invoke` (invokable controllers, rules, listeners), `ArrayAccess` (`$request['x']`, `$model['col']`, `$collection[0]`), `IteratorAggregate`, `Countable`, `JsonSerializable`.
  - **Late static binding.** `static::` and `new static`.
  - **Traits.** `class_uses_recursive` (SoftDeletes detection in Database, Routing, Queue), `boot<Trait>`/`initialize<Trait>` (FR-26).
  - **Facades.** The class shape and typing of the static surface, `shouldReceive`/`spy`/`partialMock` and `swap`. AD-3 only gives the import path, and AD-5 only the scoping.

  The Deferred table sends only "Macroable typing and trait-mixin mechanics, real-time facades, dynamic finders" to `PORTING.md`, at "one line each". These are cross-Epic API-shape decisions that touch every Component.
- **Fix:** Either add an AD "PHP construct mapping" with a one-row-per-construct table, or (minimum) add a Rule: "`PORTING.md` must contain a decided entry for each construct in this list before Phase 1 starts (FR-8 gate). CI checks for the headings." Suggested defaults:
  - **Named arguments:** a trailing options object whose keys are the PHP parameter names.
  - **Enums:** class-based `BackedEnum` with static instances and `cases()`/`from()`/`tryFrom()`. No TS `enum`.
  - **PHP attributes:** TC39 decorators of the same name. Contextual attributes become token factories inside `@inject({ tz: Config('app.timezone') })`.
  - **`__call` forwarding:** explicit generated delegating methods, typed by `implements <Contract>`. No Proxy except on Model (AD-7).
  - **`__toString`:** `toString()` plus `[Symbol.toPrimitive]`.
  - **`__invoke`:** an `__invoke()` method that the container, router and dispatcher call.
  - **`ArrayAccess`:** `offsetGet` and friends plus `get()`. Index syntax works only on Collection and Model via their Proxy.
  - **`IteratorAggregate`:** `[Symbol.iterator]`.
  - **Traits:** mixin functions that record identity in a `traits` metadata set read by `classUsesRecursive()`.
  - **Facades:** a `Facade` base class whose static surface is typed by `declare static` members, generated from the root's contract.

### H3 — AD-3 import-path rule contradicts Upstream's namespace and directory split; free functions have no home

- **Problem:** AD-3 maps `Illuminate\<Component>\<Sub>\<Name>` → `@xaravel/<component>/<sub>`. Several namespaces don't follow the directory:
  - `Illuminate\Support\Collection`, `Arr`, `LazyCollection`, `Enumerable` and `ItemNotFoundException` live in `src/Illuminate/Collections/`;
  - `Illuminate\Support\Traits\Macroable` lives in `Macroable/`;
  - `Illuminate\Support\Traits\Conditionable` lives in `Conditionable/`.

  Read by namespace, `Collection` is exported from `@xaravel/support`. But it must ship in `@xaravel/collections`, which FR-10 requires to be standalone. Two agents will export it from two paths. AD-3 also covers only classes. Global helpers (`collect`, `config`, `route`, `__`), decorators (`inject`, `hasMany`), `portedTest` and contract tokens have no stated path. FR-21 needs a decision on whether helpers are globals or imports, and that is App-Developer-visible.
- **Fix:** Split AD-3 into two rules:
  - **Package subpath:** follows the Upstream *directory* under the component (`@xaravel/collections` exports `Collection`).
  - **`@xaravel/framework/<ns-path>`:** follows the PHP *namespace* (`@xaravel/framework/support` re-exports `Collection`, mirroring `use Illuminate\Support\Collection`).

  Add rows for functions:
  - each component's `helpers.php` → `@xaravel/<component>/helpers`, re-exported flat from `@xaravel/framework/helpers`;
  - Foundation optionally installs them as globals in app processes, with a `declare global`;
  - decorators live beside the class they configure (`hasMany` → `@xaravel/framework/database/eloquent/relations`).

### H4 — Nothing mechanically checks API-surface parity (AD-3, §5.1; triage ADV-M3 dropped)

- **Problem:** Priority 1 is that names, arguments and defaults match Laravel. The spine enforces AD-3 and §5.1 only through Fidelity Review, and Fidelity Review checks *tests*, not exported surface. ADV-M3 deferred "an API-surface parity check (PHP signatures at the Pin vs exported `.d.ts`)" to architecture, and the spine neither decides nor defers it. Untested public methods and parameter-name drift will pass the Ratchet.
- **Fix:** Add a Phase-0 deliverable and AD:
  - The Oracle image extracts the public surface of every Upstream class through PHP Reflection (FQCN, method, static, parameter names, defaults, nullable) into `conformance/api-surface/<component>.jsonl` (Protected).
  - A CI job parses each package's exported `.d.ts` with `oxc-parser` and reports missing, renamed and extra symbols per Component on the dashboard.
  - An extra symbol needs an `xaravel-addition: FR-N` allowlist entry (§5.1 additions).
  - The same job can also check AD-9's rule that no exported return type includes `undefined` (L6).

### H5 — Terminals that Upstream runs from `__destruct` are undecided; unawaited `dispatch()` silently does nothing (AD-6)

- **Problem:** AD-6 makes `PendingDispatch` a thenable "whose await runs its terminal". In Laravel, `dispatch($job)`, `Job::dispatch()`, `broadcast($e)` (`PendingBroadcast`) and `$this->artisan(...)` (`PendingCommand`, FR-97) execute in `__destruct`, and so does `Route::resource()` (`PendingResourceRegistration`, sync). Laravel developers do not await them. In Xaravel an unawaited `dispatch(job)` would never queue. NFR-3's `no-floating-promises` does not flag user thenables unless `checkThenables` is on (typescript-eslint v8 default: off), and app code is not guaranteed to run the lint. Bus, Queue, Broadcasting, Testing and Routing are separate Epics and will each pick a different substitute.
- **Fix:** Add an AD-6 bullet **"Destructor terminals"**:
  - A `Pending*` object whose Upstream terminal runs in `__destruct` schedules that terminal with `queueMicrotask` at construction. Chained configuration calls made synchronously before the microtask still apply.
  - Awaiting the object returns the same terminal's Promise, so the terminal never runs twice.
  - Sync ones (`PendingResourceRegistration`) register at construction and mutate on chained calls.
  - A Xaravel Test per class covers both the awaited and the unawaited path.
  - NFR-3 lint sets `checkThenables: true` (verify the oxlint option exists; otherwise add a custom rule, H11).

### H6 — Sync/async status of "state loaded once" beyond the session is undecided (AD-6; triage RUB-DU3)

- **Problem:** AD-6 rules that session reads are sync after `StartSession`. It is silent on `Auth.user()`, `Auth.check()`, `Auth.id()`, `request.user()` and `@auth`, which Upstream `SessionGuard::user()` loads lazily from the UserProvider. RUB-DU3 named them explicitly. Applied literally, the derivation rule makes them all async, which hits priority 1 hard: `auth()->user()->name` is everywhere. The Auth (Phase 8), Http (6) and View (6) Epics will disagree.
- **Fix:** Decide in AD-6:
  - The `auth`/`guest` middleware and `StartSession`'s guard step resolve the user once per frame, into frame state.
  - After that, `user()`, `check()`, `id()` and `guest()` are sync.
  - Outside an HTTP frame (jobs, commands), `await Auth.resolveUser()` is the explicit async companion. A sync read before resolution throws `AuthUserNotResolvedException`.
  - Record this as a DIV-1 Divergence Record amendment, and say the same for `old()` and `$errors` (session-backed, therefore sync).

### H7 — Blade expression language and variable scoping are undecided (AD-11; triage RES-G11)

- **Problem:** AD-11 says expressions "are TypeScript and may use `await`". It does not decide how view data reaches them:
  - `{{ $user->name }}` → `{{ user.name }}` or `{{ $user.name }}`?
  - What about `$loop`, `$errors`, `$slot`, `$attributes` and helpers?

  ES modules are strict, so the compiled module cannot use `with (data)`. The compiler must either rewrite free identifiers or require a data prefix. That choice is App-Developer DX and the FR-48 mechanical rule. Blade templates are authored by Pagination (Phase 5, before View exists), htmx, Mail Markdown, Notifications, Foundation error pages and the Skeleton, all in parallel. RES-G11 deferred this to the Maintainer, and the spine neither records it nor lists it as open.
- **Fix:**
  - Add to AD-11 the scoping rule, for example: "Template identifiers keep PHP's `$` prefix (`$user.name`). The compiler destructures every `$`-prefixed free identifier from the view data, and binds the Blade built-ins (`$loop`, `$errors`, `$slot`, `$attributes`, `$__env`) and the helpers from `@xaravel/framework/helpers` by name."
  - Or list it in an Open Questions section as a Maintainer decision gating the first View Epic *and* the first Pagination Story that writes a `.blade` file.

### H8 — How a test case looks is undecided, for Ported Tests and App tests (AD-15, AD-5, FR-96, FR-8)

- **Problem:** Several pieces are open:
  - `portedTest(id, {variants}, fn)` fixes registration only. Nothing says how a PHPUnit class maps to `bun test`: `$this` context, `setUp`/`tearDown`, inherited base test cases (`DatabaseTestCase`), traits (`RefreshDatabase`, `InteractsWithRedis`), data providers.
  - FR-96 shows `await this.get('/invoices')`, but `bun test` callbacks have no `this`.
  - AD-5 says "the test harness opens exactly one frame per unit", but AD-15 forbids the harness from importing any graded package, and the frame lives in a graded package.
  - The NFR-7 resets (clock, fakes, `Str` factories, `Sleep`/`Once`/`Lottery`) have no owner.

  Testing, Testbench, Foundation testing, the Skeleton's tests, `make:test` and Boost's test-run parser (FR-107) are separate Epics.
- **Fix:** Add an AD "Test case shape":
  - Test bodies receive a context object `t`, for example `portedTest(id, opts, async (t) => { await t.get('/') })`. App tests use the same shape: `test('…', async (t) => …)` through `@xaravel/testing`.
  - Upstream `setUp`/`tearDown` and traits become `t.uses(RefreshDatabase)` hooks provided by graded test-support packages.
  - The frame open and close and the NFR-7 resets run in the graded `@xaravel/foundation/testing` lifecycle, as in Upstream, which keeps the grader import-free. `@xaravel/assert` only counts assertions and enforces FR-113.
  - Each data-provider dataset is passed as `opts.dataset`.

### H9 — Protected Paths list is contradictory and incomplete (AD-16, Structural Seed)

- **Problem:** The list has a contradiction and several gaps:
  - **Contradiction:** the seed marks `conformance/` as "Protected except `escalations/`". That includes `conformance/expectations/`, which every Story must edit (FR-4, UJ-4 step 3), so every Story PR would fail AD-16.
  - **Gaps:** these let an agent weaken the grader without touching a listed path:
    - the lint config (`.oxlintrc.json`);
    - `tsconfig*.json`, where `strict` can be turned off;
    - root and package `bunfig.toml`, where `[test] preload` can monkeypatch `@xaravel/assert`;
    - root `package.json` scripts and the workspace list;
    - `bun.lock`;
    - Story files (C4);
    - inline `oxlint-disable` directives.
  - **In-process tampering:** graded code runs in the same process as the matchers and can mutate their prototypes.
- **Fix:** Rewrite the seed annotation as "Protected except `escalations/` and `expectations/` (expectations are governed by the FR-4 own-Test-IDs check)". Add the files above to the initial `protected-paths`. The harness runs `bun test --config <protected root bunfig>` and fails if any package-level `bunfig.toml` exists. CI fails on any `oxlint-disable` of a rule named in the spine. `@xaravel/assert` freezes its exported objects and prototypes at load.

### H10 — Agents author grader inputs that should come from protected sources (AD-15, FR-71, FR-111)

- **Problem:** Several grader inputs are written by the agent being graded:
  - `portedTest('<id>', { variants }, fn)` lets the test file declare its Backend Variants, which duplicates the Protected inventory's `backends`. Dropping `pgsql` hides a failure.
  - FR-71 generator Ported Tests assert against "a reviewed TypeScript reference file", but the spine gives no path or protection. The implementer writes both the generator and its oracle, and generated files are the first thing UJ-1 shows a Laravel developer.
  - FR-111 Fidelity Review verdicts are "stored with the Story" at no stated path, with no identity check, so the implementer can forge them.
- **Fix:**
  - `portedTest` reads variants from `conformance/inventory`. The `variants` option is removed, or must equal the inventory and fails otherwise.
  - Generator reference files live in `conformance/fixtures/generators/<stub>.ts` (Protected), authored in a Phase-7 Infrastructure Story the Maintainer approves.
  - Fidelity verdicts are GitHub PR reviews from ≥2 distinct reviewer-bot identities. The done check counts approvals by identity, not files.

### H11 — Lint and type enforcement is named but not implementable as written (AD-1, AD-6, Conventions "State")

- **Problem:** Several Rules depend on mechanisms the spine does not name:
  - **Custom lint rules with no stated implementation:** "`import type` of a contract for injection", "module-level `let`/static mutable fields … unless listed as boot-only" (listed where?), and "framework code never returns a thenable from an async function". Stock oxlint has none of these.
  - **`async-surface.json` generator:** it must "be generated from `.d.ts`" and must recognise *thenables*, which takes semantic type info. TS 7.0 has no stable programmatic API (spine's own memlog).
  - **Sync-only callbacks:** AD-6 claims an async callback to a sync API "is a type error". That is false for `void`-returning callbacks such as `each`, because a Promise-returning function is assignable to `() => void`.
  - **The core iff rule:** "returns a Promise iff it transitively calls a Driver method" is enforced only by Fidelity Review.
- **Fix:** Add a "Checks" row to Consistency Conventions naming:
  - **Tooling:** `tools/lint-rules/` (Protected), run as oxlint JS plugins, or as an `oxc-parser` script if plugins are unavailable.
  - **Boot-only list:** a per-package `boot-state.json`.
  - **`async-surface.json`:** generated by an `oxc-parser` walk of emitted `.d.ts`, using a fixed list of thenable type names (`Builder`, `Relation`, `PendingDispatch`, `PendingRequest`, …) kept in `@xaravel/contracts`.
  - **Sync callbacks:** typed as `(…) => NotPromise<U>` (a conditional type), and `no-misused-promises` set to `checksVoidReturn: true`. Each sync-callback API gets a `// @ts-expect-error` type test.
  - **iff rule:** strengthened mechanically with `require-await` (catches an "async without need") plus a CI diff that flags any `async-surface.json` line added in a package that has no Driver contract in its `dependencies` closure.

### H12 — CI operating model for many parallel PRs is undecided (Structural Seed CI box, FR-4, NFR-10)

- **Problem:** The spine lists CI jobs but not:
  - what runs per PR (whole suite × 4 matrix legs, or affected packages);
  - whether a merge queue exists. Two individually green Story PRs can produce a red `main`, for example two Stories in the same Component, or one changing a shared method's async status;
  - what happens when a flaky test on `main` blocks every agent (FR-114 quarantine needs 3 runs and an Escalation);
  - a time budget.

  Priority 2 depends directly on this.
- **Fix:** Add an AD "CI pipeline":
  - **Per PR:** lint, typecheck and protected checks, plus the Ratchet over the AD-2 reverse-dependency closure of the changed packages, plus a full run of the Story's `test_ids`, all on linux-x64.
  - **Merge queue:** required on `main`. It runs the full Ratchet on linux-x64 with all alpha variants.
  - **Nightly:** the full matrix (all OS/arch legs).
  - **Flaky tests:** a test that fails on `main` but passes on rerun is auto-quarantined by a bot PR to `expectations/` with an auto-opened Escalation (FR-3 still holds).
  - **Branch protection:** linear history and required up-to-date branches.

### H13 — Parallel Stories collide on shared files (AD-15, AD-3)

- **Problem:** AD-15 shards *expectations* per Component, which solves ADV-M14 only partly:
  - Sorted JSONL edits on adjacent lines still conflict in git when two Stories own interleaved Test IDs.
  - Ported Test files are one per Upstream test file. `tests/Support/SupportCollectionTest.php` holds hundreds of Test IDs that several Stories share.
  - AD-3's one-class-per-file makes `Collection.ts`, `Builder.ts`, `Model.ts` and `Str.ts` single-file hotspots for every Story in that Component.
- **Fix:** Add slicing rules for the Epic level:
  - **Test files:** a Story owns whole Upstream test files, or Ported Tests split into `tests/ported/<Upstream path>/<story-id>.test.ts` (FR-2 uniqueness still enforced).
  - **Expectations:** a committed `.gitattributes` merge driver for `conformance/expectations/*.jsonl` that merges by `(id, variant)` key, with the driver script Protected.
  - **Large classes:** they may split method groups into `src/<Class>/<group>.ts` modules merged onto the class through interface declaration merging, with the class file still the single public export.

### H14 — The AD-14 codec lives in the wrong package and phase, and the closure API is undefined

- **Problem:** The single `SerializableClosure` codec is placed in `@xaravel/queue` (Phase 8). But `Bus.chain`/`Bus.batch` callbacks (FR-87, Bus is Phase 3) and Database (Upstream requires `laravel/serializable-closure`) need it. AD-2 forbids those edges and the phase order makes them impossible. Separately, the dispatch-time check rejects every free identifier except parameters and ES built-ins, yet FR-88 says the closure can reach "the classes in the app's Class Registry". The spine never says *how* a closure names `Podcast` or `Log`. Queue, Bus and Concurrency will each improvise.
- **Fix:** Move the codec to `@xaravel/serializable-closure`, which mirrors the Upstream `laravel/serializable-closure` package, at Phase 3 before Bus. Then decide the access shape, for example: "the rebuilt closure receives `(args, ctx)`, where `ctx.class('App\\Models\\Podcast')` resolves through the Registry", or "free identifiers that match an imported class registered in the Registry are recorded by FQCN at dispatch and rebound on the worker". Generators and docs show exactly one form.

### H15 — AD-17's Redis isolation by key prefix breaks faithful ports

- **Problem:** Upstream Redis-backed behaviour and tests call `FLUSHDB`: `RedisStore::flush()`, tag flushes, test `tearDown`. Tests also assert on raw key names, which a worktree prefix changes. Under AD-17, a faithful `Cache::flush()` test wipes every other worktree's Redis data. The alternative is an un-DIV'd adaptation that Fidelity Review should reject. The Cache, Redis, Session and Queue Epics run in parallel (Phases 5/8).
- **Fix:** Isolate by *server*, not prefix. The harness starts one `redis-server` per worktree on a unix socket under `.cache/redis.sock` (port 0, no persistence), and CI uses one per job. Tests use Laravel's own `prefix` config unchanged. Drop the "never flush" sentence for Redis. Keep the per-worktree Postgres database rule.

### H16 — Transaction isolation across interleaved frames is not guaranteed (AD-5, FR-55, NFR-4)

- **Problem:** AD-5 gives each frame a per-connection transaction stack. But on one physical connection, two interleaved frames run their statements inside whichever transaction is open:
  - `bun:sqlite` is one handle per database;
  - a `Bun.sql` pool connection is shared unless reserved.

  Frame B's writes join frame A's transaction, and a second `BEGIN` fails on SQLite. Manual `DB.beginTransaction()`/`commit()`, which needs no callback, is also unaddressed. FR-55's consequence ("even while other requests run concurrently") is the exact case.
- **Fix:** Add to AD-5:
  - A transaction (callback or manual) acquires an exclusive physical connection for its frame: `Bun.sql` `reserve()`, or for SQLite an async mutex per database file held until commit or rollback.
  - Statements from other frames wait on the mutex (SQLite) or use another pooled connection (PG).
  - Manual `beginTransaction` writes to the *current* frame's stack.
  - A Xaravel Test interleaves two frames that each run a transaction at every await.

### H17 — No defined way for an agent to get new Oracle fixtures mid-Story (AD-15, FR-6)

- **Problem:** Only a GitHub Actions workflow runs the Oracle, and its fixtures land in a Protected path. Differential Tests (Str, grammars, Blade-rendered HTML under DIV-5, validation messages, dates) need Oracle outputs for inputs that agents discover while porting. The spine has no request format, trigger or turnaround, so agents will stall, or hand-write expected values.
- **Fix:** Add to AD-15:
  - Agents commit requests to `conformance/oracle-requests/<component>/<test-id>.php` (not Protected; a PHP snippet whose output is captured).
  - A label-free workflow on the PR runs the Oracle and pushes the generated fixture to the PR branch under `conformance/fixtures/` as the Oracle bot.
  - The protected-paths check allows fixture changes only when they are authored by that bot and match the request hash.
  - Determinism is re-checked on `main` (FR-6).

---

## Medium

### M1 — AD-7 Proxy edge rules are missing

- **Problem:** Several edge cases are unruled:
  - **Private fields:** `#private` fields declared on `Model` live on the target, and methods called through the Proxy (`this` = proxy) throw a TypeError when they touch them.
  - **Internal state names:** internal state (`exists`, `wasRecentlyCreated`, original, relations) is not in the config-property list, so writes to it route to `setAttribute`.
  - **Symbol-keyed fields:** AD-9 brand fields (`readonly [MustVerifyEmail] = true` on `User`, FR-95) would be captured as attribute defaults.
  - **Name collisions:** columns named `hidden`, `visible`, `table`, `connection` or `with` are shadowed. In PHP they resolve through `__get`, because the protected properties are inaccessible.
  - **Plain fields:** a non-`declare` field without an initializer becomes an `undefined` attribute default.
- **Fix:** Add to AD-7:
  - No `#private` on `Model` or its traits. Internal state lives in a module `WeakMap` keyed by the proxy, or under symbol keys.
  - The `defineProperty` trap ignores symbol keys.
  - Public internal flags (`exists`, `wasRecentlyCreated`) join the property list.
  - Colliding column names are read with `getAttribute('hidden')`, documented under DIV-2.
  - Lint requires Model subclass fields to be `declare`, a config property, or initialised.

### M2 — AD-12 seam list cannot implement all of FR-37..43

- **Problem:** Several FRs need seams that are not on the list:
  - FR-38 fluent `hx*` response methods need `Response` mixins.
  - FR-41 `.hxRedirect()` needs `RedirectResponse` mixins.
  - FR-40 step 1 needs `.fragment(view, name)` on `Route` and `FormRequest`.
  - FR-40 step 2 needs "the view the route last rendered", which View must record in the frame.
  - FR-106 needs the "Fragment-returning route" marker.

  The htmx agent will edit Http, Routing or View to get these, which is exactly what AD-12 prevents.
- **Fix:** Add these seams: `Response`/`RedirectResponse`/`Route`/`FormRequest` macros (Macroable) with TS augmentation; a `lastRenderedView` frame field written by View; a route `fragment` metadata key set by `.fragment()` and read by `route:list`/Boost.

### M3 — Source Amendments are incomplete

- **Problem:** Some PRD text still contradicts the spine, and Stories written from the PRD will diverge:
  - FR-63 and §5.1 say `await model.relation('posts')`, while AD-8 says `related('posts')`;
  - DIV-2 says adapt to `await load()`;
  - DIV-1 says "the architecture document lists every Promise-returning method", but AD-6 generates per-package files;
  - NFR-2 says dependencies are recorded "in the architecture document", but AD-2 uses READMEs;
  - the addendum mapping table still shows `static inject`;
  - AD-13 ("job-timeout tests adapt") and AD-17 adaptations cite no DIV, but §5.1 says an adapted test must cite one.
- **Fix:** Add each of these to Source Amendments. Name the DIV for AD-13: DIV-6 (pcntl is a PHP extension) or a new DIV raised by Escalation.

### M4 — Escalation IDs race across parallel agents (AD-16)

- **Problem:** `ESC-<NNNN>` is allocated by agents at runtime. Two agents pick the same number, both PRs are green, and they collide on merge. The decision-file match (`decisions/ESC-<NNNN>.md`) then binds to the wrong Escalation.
- **Fix:** Use `ESC-<story-id>-<n>`, or a ULID. CI rejects duplicate IDs in the merge queue.

### M5 — Class Registry registration outside PSR-4 roots is undefined (AD-10)

- **Problem:** Ported Tests define classes inline whose persisted morph and queue strings are `Illuminate\Tests\Database\EloquentTestUser`. Packages register under Upstream FQCNs "in the entry module", but the API isn't named. Each Database or Queue Epic will invent a registration call.
- **Fix:** One API in `@xaravel/runtime`: a `@registered('<FQCN>')` class decorator, plus `Registry.register(fqcn, cls)` and `classNameOf(cls)` (the `X::class` analogue). Lint requires `@registered` on every exported class in packages.

### M6 — AD-5 overlay primitive, frame lifetime and concurrency test method are under-specified

- **Problem:** Three things are unspecified:
  - **Overlay storage:** "Components that need such state put it in the frame" names no API, so each package will write its own overlay map with different copy-on-write behaviour.
  - **Frame lifetime:** unit end is undefined relative to terminable middleware, `defer()` callbacks, streamed and SSE responses, and timers that outlive the unit.
  - **Concurrency tests:** NFR-4's "interleave at each await" has no shared helper or load (ADV-L2).
- **Fix:**
  - The ScopeFrame contract exports `frameState(key, init)`, `OverlayMap` and `OverlayList`, each with stated copy-on-write.
  - A unit ends after terminable middleware, deferred callbacks and stream close. Reading an ended frame throws `ScopeFrameEndedException`.
  - Provide `interleave(...units)` in `@xaravel/testing`, a deterministic scheduler that forces a switch at every await, plus a fixed load (e.g. 50 concurrent units) for NFR-4 Xaravel Tests.

### M7 — Security posture: NFR-5 dependency audit and supply chain are silent

- **Problem:** The spine says nothing about:
  - `bun audit` or any CI dependency audit (NFR-5);
  - `SECURITY.md`;
  - who may add a third-party npm dependency (agents can add any package);
  - lockfile discipline;
  - the test `APP_KEY`;
  - CI secret scope (see C4).
- **Fix:** Add a Security row or AD covering:
  - CI runs `bun install --frozen-lockfile` and `bun audit --audit-level=high` (failing);
  - Renovate or Dependabot for third-party deps;
  - a new third-party dependency must appear in the C3 table, so adding one is a Protected-path change;
  - dependencies pin exact versions;
  - Ported Tests use a fixed, committed test `APP_KEY` (`base64:` format, matching the Oracle's) and never read `.env`;
  - `SECURITY.md` at the repo root is a Phase-0 deliverable.

### M8 — Observability and logging are silent

- **Problem:** The spine does not define:
  - the harness output grammar (FR-9 "one line per failing Test ID"), which agents, Boost framework mode and CI annotations all parse;
  - a machine-readable report;
  - a rule on how framework packages emit diagnostics. Some will use `console.*`, some the Log contract.
- **Fix:**
  - Fix the line grammar, e.g. `FAIL <variant> <TestID> <file>:<line> <message>`.
  - Write `.cache/harness-report.json` (schema in `@xaravel/assert`).
  - Emit GitHub annotations in CI.
  - Lint bans `console.*` in `packages/*/src`. Framework diagnostics go through the `Log` contract or `report()`.

### M9 — Deferred FR-106 producer seams invite rework (Deferred row "Boost FR-106 output schema")

- **Problem:** The Boost app-tools Epic (Phase 8) consumes data that Phase-3..7 Epics must *produce*: Fragment-returning route metadata, a persisted "last error", browser logs from the Skeleton or htmx, container bindings and the config-key list. Deferring the whole schema lets the producers ship without the hooks.
- **Fix:** Keep the output schema deferred, but decide the producer seams now:
  - the route `fragment` metadata key (M2);
  - Log writes the last reported exception to `storage/logs/last-error.json`;
  - the Skeleton's layout ships a `@boostBrowserLogs` directive stub;
  - `Container.getBindings()` matches Upstream.

### M10 — Docs and licensing (NFR-8, NFR-9) mostly silent

- **Problem:**
  - "Each package's `docs/` mirrors the Laravel 13 doc page for that Component" assumes a 1:1 mapping that doesn't exist. Laravel pages like `requests`, `csrf` and `http-client` span packages, so pages get written twice or not at all.
  - NFR-9 docblocks-before-done has no check.
  - NFR-8 (Laravel copyright in each published package's LICENSE; the non-affiliation notice in each npm `description`/README) has no check, and agents create packages.
- **Fix:**
  - Add a Protected `docs/page-map` (Laravel doc page → owning package, Phase 0).
  - Add a lint rule requiring a JSDoc block on exported symbols.
  - A CI package-manifest check requires `license: MIT`, a LICENSE file with both copyright lines, the notice text in the README, `engines.bun >=1.4`, and the `@xaravel/` scope.

### M11 — The CI matrix as drawn can't provide backends on macOS (Structural Seed, FR-9, NFR-1)

- **Problem:** GitHub Actions service containers run only on Linux runners. Yet the diagram shows "linux/macos × x64/arm64, PG 18, Redis 8", and FR-9 requires every alpha Backend Variant to actually run in CI.
- **Fix:** Specify:
  - Linux legs (x64 and arm64) run all variants with service containers.
  - macOS legs run `none` and `sqlite` per PR or merge queue, and run PG and Redis nightly through Homebrew services, under the same AD-17/H15 isolation.
  - State which legs gate the Ratchet.

### M12 — AD-3 "No default exports" conflicts with app convention files

- **Problem:** `config/*.ts` export "a plain object". Laravel migrations are `return new class extends Migration`. `routes/*.ts` and `bootstrap/app.ts` return or define the app. AD-3's blanket "No default exports" leaves the generators (FR-71), the migrator (FR-56) and the config loader to guess.
- **Fix:** Scope AD-3 to `packages/*`. Add a Conventions row:
  - app convention files under `config/`, `database/migrations/`, `database/seeders/` and `bootstrap/` use `export default`;
  - a migration is `export default class extends Migration {}`;
  - loaders `import()` the default export, in filename order.

### M13 — Capability map gaps and misclassification

- **Problem:** Several capabilities have no stated home, and some packages are misclassified:
  - **No home:** the Class Registry (FR-22), Log and the exception handler (FR-35), Vite (FR-49, in Foundation), Dates/Carbon (FR-25), Prompts (FR-70: `laravel/prompts` is outside the Test Inventory, so what is its oracle?), Tinker (FR-73), and Boost framework mode's Phase-0 relationship to the later `@xaravel/mcp`.
  - **Misclassified:** `testing` appears as a Xaravel Component in the dependency diagram and the seed, but `Illuminate\Testing` is Upstream. AD-2's "never depend on Xaravel Components" then gives the wrong answer for it.
  - **Mockery:** a PRD Xaravel Component, but it sits in the Grader tier, which leaves its dependency rules unclear.
- **Fix:** Add the missing rows. Move `testing` to the Upstream tier. Classify `@xaravel/mockery` as a Grader package that graded packages may depend on (for `Facade::shouldReceive`), but not the reverse. Name an oracle for Prompts and Tinker: Xaravel Tests plus Oracle-recorded terminal transcripts.

### M14 — Ported Tests' dependency rules unstated (AD-2)

- **Problem:** Upstream tests for a Phase-1 package import later-phase packages: `SupportCollectionTest` uses `Str`, `Carbon` and `HtmlString`. AD-2's "CI fails on any static import of a package not listed in `dependencies`" and its cycle check don't say whether `devDependencies` count. If they do, support → collections plus the collections tests → support forms a cycle.
- **Fix:** Test files may import `devDependencies`. The cycle check and "no unlisted import" apply to `dependencies` and `peerDependencies` from `src/`. Importing a later-phase package in a test means `blocked-by:<component>`, until that package exists.

### M15 — `PORTING.md` deferrals are structural, not "one line each" (Deferred row)

- **Problem:** Trait-mixin mechanics interact with AD-7 (traits on a Proxied Model), AD-9 (brands through traits) and AD-10 (registry), and `class_uses_recursive` is load-bearing in three Components. Macroable typing (declaration merging for typed macros) shapes every Macroable class's `.d.ts` and therefore `async-surface.json`. Calling these "one line each" invites a thin entry.
- **Fix:** Fold these into H2's mandatory `PORTING.md` checklist, with the specific constraints stated (runtime trait identity, `boot<Trait>` order, a typed-macro augmentation pattern), or promote traits to an AD.

---

## Low

### L1 — AD status markers inconsistent

- **Problem:** `[ADOPTED]` marks AD-1, 4, 5, 7, 8 and 15 only. The memlog says all of them were accepted, and the frontmatter says `status: draft`. Agents may treat unmarked ADs as provisional.
- **Fix:** Mark every AD `[ADOPTED]`, or drop the marker, and set `status` to match intent.

### L2 — Mermaid diagrams render ambiguously

- **Problem:** Both diagrams are valid, but:
  - `subgraph Dev["Agent worktree (story/<id>)"]`: the `<id>` may be stripped as HTML.
  - The dashed `grader -.-> contracts` edge reads as a permitted dependency, while the label says the opposite.
  - The `xc` tier lists `testing` (M13).
- **Fix:** Write `story/&lt;id&gt;` or `story/ID`. Replace the dashed edge with a note node "Grader: no edges to graded packages". Fix the tier.

### L3 — Release and Stack mechanics (AD-18, Stack)

- **Problem:** Things to verify and pin:
  - Whether npm trusted publishing can be configured for a package that doesn't exist yet. New Components appear every Phase, so the first publish of each new package may need a token, which contradicts "no other credential".
  - `bun publish` provenance support. If it is missing, use `bun pm pack` and then `npm publish --provenance` (npm ≥ 11.5).
  - "Maintainer-approved tag" needs a mechanism: tag ruleset plus a `release` environment with a required reviewer.
  - The Installer's way of obtaining the Skeleton (bundled in the `create-xaravel` tarball at the lockstep version, or fetched) is undecided.
  - The Oracle base image tag is unpinned.
  - Versions otherwise look plausible for 2026-10.
- **Fix:** Add one line each to AD-18 or the Stack: the bootstrap-publish procedure, the publish tool, the tag ruleset plus environment, "Skeleton bundled into `create-xaravel` at release", and `php:8.5.11-cli-<distro>` pinned by digest.

### L4 — Performance stance silent (NFR-6)

- **Problem:** No statement on the benchmark workflow, or on whether agents may deviate from Upstream structure for speed.
- **Fix:** One Conventions row: "No performance-motivated deviation from Upstream structure before alpha. `bench/` runs nightly, report-only, never gating (NFR-6, NG-7)."

### L5 — Production server entry deferred to Phase 7, but the HTTP kernel ships in Phase 6

- **Problem:** The HTTP kernel (Phase 6) is built without knowing the production entry shape: `Bun.serve` `reusePort` multi-process, SIGTERM drain, `bun artisan serve` vs `public/index.ts`. That risks rework.
- **Fix:** Decide the kernel-facing contract now: `HttpKernel.serve(options)` with graceful drain on SIGTERM. Leave the process-manager guidance to the Skeleton Epic.

### L6 — AD-9 "undefined never returned" has no check

- **Problem:** The rule is stated but enforced by nothing.
- **Fix:** Add it to the H4 surface check: an exported return type or a returned object property type that includes `undefined` or `?:` fails.

### L7 — Small triage items neither decided nor deferred

- **Problem:** Two triage items are dropped: RES-G17 Redis Pub/Sub status (Broadcasting, `Bun.redis`) and RES-G19 `QUERY` CSRF classification.
- **Fix:** Add both to Deferred, with owners: Redis Epic, Phase 0 spike; Routing Epic, follow the Pin.

### L8 — The Contracts Epic has no Upstream Test IDs, so its Stories can never be "done"

- **Problem:** `illuminate/contracts` ships no tests. The PRD Story definition says a Story with no assigned tests can't be done.
- **Fix:** State that the Contracts Stories are verified by Xaravel Tests (each token exists, its brand works under `Symbol.hasInstance`, and every interface matches the H4 API surface), listed as `XT-contracts-<n>`.

---

## Notes on what is solid

- AD-1 (single contracts package with same-name tokens), AD-4 (named-map `@inject`), AD-8 (property reads plus `related()`), AD-9's integer rule and AD-15's sharded data model are decisive, enforceable and well matched to the PRD.
- AD-5's "writes after boot go to the frame overlay" gives FPM-equivalent semantics for free (listeners, macros and config set during a request die with it). That is the right default; it only needs the L0 home (C1) and the primitive (M6).
- The Deferred table is mostly well-owned. The exceptions are the `PORTING.md` row (H2, M15) and the FR-106 schema (M9).
