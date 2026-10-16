---
title: "Review: PRD sync with Architecture Spine"
created: 2026-10-16
reviewed:
  - prd.md (working tree, 2026-10-16)
  - addendum.md (working tree, 2026-10-16)
against: ../../architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md ("Source Amendments Required" and the ADs it cites)
---

# Review: PRD sync with the Architecture Spine

**Verdict:** most amendments landed, and they read well. Five are only partial. One FR (FR-88) still states the old closure rule, and about a dozen older passages still assume the shape the spine replaced. None of these needs a design decision. They are text fixes.

**Counts:**
- Amendment items: 16 (the OQ bullet is split into OQ-5, OQ-7 and OQ-11). 11 LANDED, 5 PARTIAL, 0 MISSING as a whole bullet. One sub-part, FR-88, is MISSING.
- Remaining contradictions: 17 (C-1 to C-17). 6 are high, 6 medium and 5 low.
- Prose fixes: 18 (P-1 to P-18).
- Spine-side issues found while checking: 4 (S-1 to S-4). These are for the architect, not the PRD.

---

## 1. Source Amendment verdicts

| # | Amendment | Verdict | PRD location | Gap |
|---|---|---|---|---|
| A-1 | FR-10, Glossary "Package", addendum: `@xaravel/contracts`, `@xaravel/runtime`, `@xaravel/serializable-closure`, `tools/boost-framework` | LANDED | §3 Package (l.133); FR-10 (l.385); addendum mapping (l.39) and layout (l.24) | Contradictions C-6 and C-8 come out of this text |
| A-2 | §7.3: runtime, then contracts (with Xaravel-only contracts) at the start of Phase 1; http-foundation, mime, finder, serializable-closure in Phase 3; Phase 0 scans and scaffolding | **PARTIAL** | §7.3 Phase 0 (l.1343), Phase 1 (l.1344), Phase 3 (l.1346) | Phase 1 does not say that contracts include the Xaravel-only contracts. Fix: P-15 |
| A-3 | DIV-1: `async-surface.json`, async roots, callback rule, loaded-once auth, dual helpers, destructor terminals, `AsyncLazyCollection` + adaptation, async companions | LANDED | §5.2 DIV-1 (l.1205–1216) | Destructor-terminal wording is inaccurate. Fix: P-1 |
| A-4 | DIV-2, FR-63, §5.1, addendum: `related(name)`; no `relation()` or `model.posts()` | **PARTIAL** | DIV-2 (l.1217–1221); FR-63 (l.859); §5.1 additions (l.1189); addendum (l.47–48) | §5.1 "Adapting versus skipping" (l.1197) still gives `await load()` as the DIV-2 adaptation. Fix: C-4 |
| A-5 | DIV-3: AD-4 named map, function form, contextual descriptors, no static `inject` | LANDED | DIV-3 (l.1222); addendum (l.49) | It is one dense paragraph, and the Spec values `String`/`Number`/`Boolean`, `primitive` and `oneOf` are missing. Fix: P-4 |
| A-6 | DIV-4, FR-88: facades and helpers allowed as free identifiers | **PARTIAL** | DIV-4 (l.1223–1226) LANDED; **FR-88 (l.1010) MISSING** | FR-88 still says "only its arguments and the classes in the app's Class Registry … no access to ambient globals". Fix: C-1 |
| A-7 | DIV-8: predicate assertions return Promises | LANDED | DIV-8 (l.1230) | Wording polish: P-6 |
| A-8 | DIV-9: BIGINT → `number`, never lossy, lossless hints; array, brand, PHP-props rules | **PARTIAL** | DIV-9 (l.1231–1240) | The PHP-props rule (`Symbol.for('xaravel.php.props')`) is missing. The `castsBigint(cols)` hint is missing. `±2^53` is off by one. Fix: P-7, P-8, P-9 |
| A-9 | New DIV-11 and DIV-12 | LANDED | DIV-11 (l.1242–1246); DIV-12 (l.1247–1255) | Supervisor timeout clause ✓. `collection.get(0)` ✓, renamed Model methods ✓, no dynamic wheres ✓. Prose fixes: P-10, P-11 |
| A-10 | FR-42: `Vary` also on non-htmx responses through the view or response seams | **PARTIAL** | FR-42 (l.692) | The PRD narrows the rule to "routes that can return Fragments". AD-12 says *every* response through the view or response seams. Agents can't tell which routes "can return Fragments". Fix: P-12 |
| A-11 | FR-66: `toJson()` and `jsonSerialize()`, `toJSON()` delegating | LANDED | FR-66 (l.875) | "`JSON.stringify(model)` gives Laravel's shape" overclaims. Fix: P-14 |
| A-12 | FR-96: Pest-style test shape, thenable test responses | LANDED | FR-96 (l.1065) | Prose fix: P-13 |
| A-13 | NFR-2: dependency reasons in package READMEs; shim ownership in AD-22 | LANDED | NFR-2 (l.1266) | Minor wording: P-17 |
| A-14 | OQ-5: pin `htmx.org@4.0.0` | LANDED | OQ-5 (l.1410) | — |
| A-15 | OQ-7 resolved (`fetch` accepts `QUERY`, Router dispatches from `fetch`) | LANDED | OQ-7 (l.1412) | §7.4 still calls it an open spike. Fix: C-2 |
| A-16 | OQ-11 (part): MCP SDK v2 | LANDED | OQ-11 (l.1416) | Prose fix: P-16 |

---

## 2. Remaining contradictions

Severity: **H** means an agent following the PRD would build or test the wrong thing. **M** means it could be misread. **L** means wording drift.

### C-1 (H) FR-88 still states the old closure rule
- **Where:** FR-88, last consequence (l.1010).
- **Conflict:** DIV-4 (l.1224) and AD-14 allow facades, helpers and ECMAScript built-ins. FR-88 says only arguments and Registry classes.
- **Fix:** replace that consequence with:
  > - On the worker, a rebuilt closure can use only its arguments, standard JavaScript built-ins, and Laravel's facades and global helpers by their Laravel names. Classes and models in its arguments are restored through the app's Class Registry. It has no access to any other global, or to the dispatching module's imports.

### C-2 (H) §7.4 still lists `QUERY` and OQ-7 as open Phase 0 spikes
- **Where:** §7.4 "Bun gaps" (l.1373).
- **Conflict:** OQ-7 is resolved (l.1412), and the Phase 0 spike list (l.1342) no longer includes it.
- **Fix:**
  > - **Bun gaps** (Temporal, bcrypt, Redis Cluster, test primitives). Mitigation: Phase 0 spikes (OQ-4, OQ-8, OQ-11). Failing primitives become `deferred` entries or Escalations. `QUERY` support is already confirmed (OQ-7).

### C-3 (H) §5.1 says non-htmx behaviour is exactly Upstream's, but FR-42 adds `Vary`
- **Where:** §5.1, second exception (l.1190).
- **Conflict:** FR-42 (l.692) and AD-12 add `Vary` to non-htmx responses.
- **Fix:**
  > - **htmx Requests** are handled by the htmx Integration (FR-35, FR-40 to FR-42). For any request that isn't an htmx Request, behaviour stays exactly Upstream's, except for the `Vary` header in FR-42.

### C-4 (M) §5.1 still gives `await load()` as the DIV-2 adaptation
- **Where:** §5.1 "Adapting versus skipping" (l.1197).
- **Fix:**
  > - A test is **adapted** when its Upstream intent can still be verified under a DIV's test-adaptation rule. Examples: awaiting an IO call (DIV-1, DIV-8), or `await m.related('rel')` in place of lazy access (DIV-2).

### C-5 (H) §5.1 allows Xaravel-only additions "only where an FR specifies them"
- **Where:** §5.1, first exception (l.1189).
- **Conflict:** the amended DIVs add public API that no FR names:
  - DIV-1: `eachAsync` … `partitionAsync`, `AsyncLazyCollection`;
  - DIV-3: `inject`, `Config()`, `CurrentUser()` and the other descriptors;
  - DIV-9: `castsBigint()`, `PhpArray`, `Ref`;
  - DIV-12: `setFillable`, `isTouching`;
  - FR-66: `toJSON()`.

  As written, each of these is a bug under the parity rule.
- **Fix:**
  > - **Xaravel-only additions** to an Upstream surface are allowed only where an FR or a DIV specifies them, for example the htmx accessors (FR-37), `.hxRedirect()` (FR-41), `validateSync()` (FR-52), `model.related()` (FR-63), the htmx test assertions (FR-96), the async companions (DIV-1) and `inject` (DIV-3).

  See also S-3: the spine's `additions.jsonl` rule cites only FRs.

### C-6 (H) The Glossary and Global rules list "Class Registry" as its own Xaravel Component, and the new packages have no category
- **Where:** §3 Component (l.132); §4 Global rules (l.193).
- **Conflicts:**
  - The Class Registry now lives in `@xaravel/runtime` (AD-10, AD-19). Under the Package definition, a separate "Class Registry" Component implies a separate Package.
  - `@xaravel/runtime` has no Upstream equivalent, but neither list names it.
  - `@xaravel/http-foundation`, `mime`, `finder` and `serializable-closure` are not Upstream Components: §3 "Upstream" is only `laravel/framework`, `ai`, `mcp` and `boost`. They are not listed as Xaravel Components either. So no acceptance rule covers them. AD-22 and AD-15 say they get Oracle Differential Xaravel Tests, which is the Xaravel Component rule.
- **Fix (§3):**
  > - A *Xaravel Component* is one with no Upstream equivalent: Testbench, Mockery, the htmx Integration, Boost, the Installer, the Skeleton, the Conformance System, `@xaravel/runtime` (which holds the Class Registry, FR-22), and the ports of libraries outside the Test Inventory: `@xaravel/http-foundation`, `@xaravel/mime`, `@xaravel/finder` and `@xaravel/serializable-closure` (architecture AD-22).
- **Fix (§4 Global rules):**
  > - **Xaravel Components** (htmx Integration, Mockery, Testbench, Boost, Installer, Skeleton, Conformance System, `@xaravel/runtime`, and the library ports listed in §3): every testable consequence …

### C-7 (H) FR-28 says the body is parsed before the middleware pipeline
- **Where:** FR-28, first consequence (l.548).
- **Conflict:** AD-12 has a two-stage pipeline. Global middleware branded `BeforeBody` run on headers only, before `loadBody`. "Before the middleware pipeline" tells an agent that input is readable in every middleware.
- **Fix:**
  > - Input accessors are synchronous in controllers and in every middleware except the header-only `BeforeBody` global middleware (`ValidatePostSize`, `TrustProxies`, the `HandleCors` preflight, `PreventRequestsDuringMaintenance`). The body is loaded once, after those middleware and before the rest of the pipeline.

### C-8 (H) The addendum calls `@xaravel/contracts` "zero-dependency"
- **Where:** addendum, mapping paragraph (l.39).
- **Conflict:** in the spine's layer table and dependency graph, `contracts` depends on `runtime`.
- **Fix:** see P-18 (full replacement paragraph). At minimum, replace "one zero-dependency `@xaravel/contracts`" with "one `@xaravel/contracts`, which depends only on `@xaravel/runtime`".

### C-9 (M) The addendum layout is still called "a starting point for the architecture document"
- **Where:** addendum, "Sketch of the monorepo layout" (l.19).
- **Conflict:** the architecture now exists and its Structural Seed is authoritative. The sketch has no `tools/`, `stories/`, `serializable-closure/` or the ports, and it puts `docs/` at the root while the spine has one `docs/` per package.
- **Fix:** replace l.19 with:
  > This sketch is superseded by the Structural Seed in the architecture spine (`../../architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md`). Where they differ, the spine wins.

### C-10 (M) New capitalized terms are used without a Glossary entry
- **Where:** §3.
- **Conflict:** §0 says every domain noun is defined once in §3. "Scope Frame" (DIV-11, §7.3) and "Contract" (§3 Package, DIV-3) are used as terms but not defined.
- **Fix (add to §3):**
  > - **Contract:** a ported `Illuminate\Contracts\*` interface. Each one ships in `@xaravel/contracts` as a TypeScript interface plus a runtime token with the same name, used for injection and `instanceof` (DIV-3; architecture AD-1).
  > - **Scope Frame:** the per-unit sandbox in which each request, job, command, scheduled task, test or WebSocket message runs. Writes made during the unit go into its frame and are discarded when it ends (DIV-11; architecture AD-5).

### C-11 (M) FR-112 and FR-114 do not cover `@xaravel/contracts` after Phase 1
- **Where:** FR-112 path list (l.320–326); FR-114 triggers (l.342–348).
- **Conflict:**
  - AD-1 and AD-16 make `packages/contracts` a Protected Path after Phase 1.
  - AD-21 sends any missing or changed contract to an Escalation.
  - The old shape, with contracts inside each package, didn't need this.
- **Fix:**
  - Add to the FR-112 list:
    > - `@xaravel/contracts`, once Phase 1 is accepted
  - Add to the FR-114 triggers:
    > - it needs a Contract that is missing or different after Phase 1;

### C-12 (M) The adaptation marker format differs from the spine
- **Where:** §3 Expectations File (l.141); §5.1 (l.1199); FR-8 (l.288).
- **Conflict:** AD-15 and AD-13 use `adapted:DIV-<n>.<clause>`, and every Divergence Record numbers its adaptation clauses. The PRD says `adapted:<DIV-N>`.
- **Fix:**
  - §3: "A `pass` entry may carry an `adapted:DIV-<n>.<clause>` marker when the test was adapted under that clause of the DIV's rule (§5.1)."
  - FR-8: "Every Divergence Record states its test-adaptation rule as numbered clauses."
  - §5.1: "Adapted tests are marked `adapted:DIV-<n>.<clause>` …"

### C-13 (M) FR-63 says `automaticallyEagerLoadRelationships()` "is available"
- **Where:** FR-63 (l.860).
- **Conflict:** AD-8 and the spine's Deferred table leave its semantics to an Escalation, and its Test IDs stay `not-ported-yet` until then.
- **Fix:**
  > - `Model.automaticallyEagerLoadRelationships()` is available. How it works with `related()` is decided by an Escalation in the first Eloquent relationships Epic (architecture AD-8).

### C-14 (L) §5.1 says `PORTING.md` "defines" the PHP-semantics helpers
- **Where:** §5.1 (l.1192).
- **Conflict:** `@xaravel/runtime` now owns them (AD-19).
- **Fix:** "`@xaravel/runtime` provides those helpers (architecture AD-19), and `PORTING.md` (FR-8) documents them and the TS mapping for by-reference parameters and PHP exception classes."

### C-15 (L) The "IO Terminal" glossary entry and the DIV-1 title are now narrower than DIV-1
- **Where:** §3 IO Terminal (l.182); DIV-1 title (l.1205).
- **Conflict:** DIV-1 now makes non-IO methods async by derivation (`Gate.allows()`, `Validator.passes()`). These are not IO Terminals as defined.
- **Fix (append to the §3 IO Terminal entry):**
  > Methods that are async only because they take an async callback (DIV-1), such as `Gate.allows()`, also return Promises but are not IO Terminals.

### C-16 (L) Named arguments are a mapping that §5.1 does not list
- **Where:** §5.1 syntax bullets (l.1183–1185); addendum row (l.52).
- **Conflict:** the addendum's `new Envelope({ subject: 'Hi' })` row has neither "syntax only" nor a DIV. §5.1 allows only syntax and DIVs.
- **Fix:**
  - Add a §5.1 bullet:
    > - Named arguments become one options object keyed by the camelCase parameter names (architecture AD-26).
  - Set the addendum Note to "syntax only (named arguments, §5.1)".

### C-17 (L) Smaller drift
- **FR-21 (l.488):** "for the current request". Replace with "for the current unit of work (request, job, command or test)".
- **FR-97 (l.1072):** use `this.artisan('cmd')` to match FR-96. Its result is awaitable like the HTTP test calls.
- **§10:** has no entry for the 2026-10-16 architecture-driven changes. Add this block:
  > **Changed 2026-10-16 by the architecture spine (Source Amendments, Maintainer-approved):** §3 Package and Component, FR-10, FR-42, FR-63, FR-66, FR-88, FR-96, NFR-2, DIV-1 to DIV-4, DIV-8, DIV-9, new DIV-11 and DIV-12, §7.3 Phases 0, 1 and 3, OQ-5, OQ-7, OQ-11.

---

## 3. Prose check of the amended passages

Each item gives the problem, then exact replacement text in the PRD's style: short sentences, bold lead-ins, one fact per bullet.

### P-1 DIV-1 "Thenables": "right after the statement" is wrong
- **Problem:** AD-6 starts the terminal in a microtask, which runs after *all* the current synchronous code, not after one statement. An agent could read the current text as "a call on the next line is too late". It also leaves out `Bus.chain` / `Bus.batch` and the frame requirement.
- **Replacement:**
  > - **Thenables:** query builders, Relations and pending HTTP requests run when they are awaited.
  > - **Self-starting calls:** `dispatch()`, `Bus.chain(…).dispatch()`, `Bus.batch(…).dispatch()`, `broadcast()` and the test `artisan()` call start on their own once the current synchronous code has finished, as Laravel's destructors do. So chained calls such as `.onQueue('emails')` still apply. Awaiting one is optional and never runs it twice. The Scope Frame waits for it before the unit ends, and creating one outside a Scope Frame throws.

### P-2 DIV-1 "Async roots": one overloaded sentence
- **Replacement:**
  > - **Async roots:** IO starts only in these Driver contracts: database statements, cache stores (including `array`, so every store has the same interface), session handlers, queue connections, mail transports, filesystem IO, Redis commands, HTTP-client sending, broadcasting and process runs. Inside those contracts, a method is async only if at least one Upstream driver does IO in it, so `Storage.url()` stays sync. Hashing, encryption, translation, view loading and Config are not roots, and stay sync. Adding a root needs an Escalation.

### P-3 DIV-1 auth: `StartSession` does not resolve the user
- **Replacement:**
  > - The authenticated user, once it has been resolved into the current Scope Frame. A framework step that runs after `StartSession` resolves it, and so does each `auth:<guard>` middleware. After that, `request.user()`, `Auth.user()` / `check()` / `guest()` / `id()`, `@auth` and `@guest` are sync. Reading a guard that was not resolved throws `AuthGuardNotResolvedException`, which names the fix: `await Auth.guard(name).authenticate()`.

### P-4 DIV-3: dense paragraph, and Spec values missing
- **Replacement (whole DIV-3 entry):**
  > - **DIV-3 Explicit injection tokens.** TypeScript erases parameter types, so autowired dependencies are declared. There is one form, `inject({ <paramName>: <Spec>, … })` (architecture AD-4), and no static `inject` list.
  >   - **Where it goes:** a decorator on a class (for its constructor) or on a method. For a function, `inject` wraps it: `inject({ post: Post }, (post) => …)`. Use the wrapper for closure routes, closure commands, scheduled closures and `app.call`.
  >   - **Keys:** each key is a parameter name, and key order is parameter order. Lint checks both against the parameter list.
  >   - **Values:** a token or class; `String`, `Number` or `Boolean`, coerced as PHP does; `primitive`, not coerced; `oneOf(A, B)` for a union type; or a descriptor named after Laravel's contextual attribute, for example `{ tz: Config('app.timezone'), user: CurrentUser() }`.
  >   - **What uses it:** constructor and controller method injection, implicit route model binding (FR-30, matched by name), Form Request resolution, `make(X, { name })` and `needs('$name')`.
  >   - **No declaration:** an action without `inject` gets its route parameters by position, as Laravel does for parameters without a type hint.
  >   - **Tokens:** every Contract exports a runtime token with the interface's name. The container also accepts Laravel's string abstracts and aliases, for example `app('cache')`.

### P-5 DIV-4: "What the closure can reach" leaves built-ins unclear
- **Problem:** an agent can't tell whether `Math` or `JSON` is allowed.
- **Replacement:**
  > - **Names a closure may use without passing them:** its own parameters, standard JavaScript built-ins (`Math`, `JSON`, `Date`, …), and Laravel's facades and global helpers by their Laravel names (`Mail`, `Log`, `now`, …). Any other outside name fails at dispatch, with an error that names it and shows the rewrite.
  > - **Arguments:** pass everything else as an argument, including app classes and models. Models travel as `ModelIdentifier`, as in `SerializesModels`.

### P-6 DIV-8: "because the predicate may be async" leaves the sync case open
- **Replacement:**
  > - **DIV-8 Async test bodies.** Ported Tests that touch IO become `async`, and Laravel's test helpers return awaitable results. A fake or TestResponse assertion called with a predicate always returns a Promise, even when the predicate is sync, so it must be awaited (NFR-3).

### P-7 DIV-9 "Integers": off-by-one, missing hint, ambiguous small-value case
- **Problem:**
  - `±2^53` is not the safe range. The safe range is ±(2^53 − 1).
  - The `castsBigint(cols)` hint is missing.
  - The text doesn't say what a hinted column returns for a small value. See S-4. The text below assumes hinted columns always return `bigint`, which keeps the TS type stable; the architect should confirm.
- **Replacement:**
  > - **Integers:** database drivers read integers without loss.
  >   - A column is *hinted lossless* by an Eloquent `'bigint'` cast, by the query builder's `castsBigint(cols)`, or by the connection setting `integers: 'bigint'`. A hinted column always returns `bigint`.
  >   - Any other integer column returns a `number` when the value is within ±`Number.MAX_SAFE_INTEGER` (2^53 − 1). A larger value throws `IntegerOverflowException`, naming the column.
  >   - The framework's JSON encoder writes a `bigint` as its exact digits.

### P-8 DIV-9 "int/float": "preserved" suggests two JS types
- **Replacement:**
  > - **int/float:** both are JS `number`. Where Laravel's behaviour depends on the difference, a runtime float marker keeps it, and the affected tests are adapted under DIV-9.

### P-9 DIV-9 arrays and the missing PHP-props rule
- **Problem:** "Public APIs copy values" is vague, and the PHP-comparison rule from AD-9 is missing.
- **Replacement (last Arrays bullet, plus two new bullets):**
  >     - Public APIs accept all three forms. They never change an array the caller passed in, and never return an internal array the caller could change (PHP's value-copy rule).
  >   - **By-reference parameters** take a `Ref<T>` box.
  >   - **PHP comparison:** an object that PHP compares with `==` exposes its compared properties through `[Symbol.for('xaravel.php.props')]()`, so the test matchers compare it as PHP does.

### P-10 DIV-11: PHP syntax in TS, and a missing rule
- **Problem:** `app()->instance()` is PHP syntax. The list of units omits WebSocket messages. The text doesn't say that base registrations throw after boot, which is the rule most likely to surprise an App Developer.
- **Replacement (Scope Frames and "What a frame holds" bullets):**
  > - **Scope Frames:** each request, job, command, scheduled task, test or WebSocket message runs in its own Scope Frame, located through `AsyncLocalStorage`.
  > - **What a frame holds:** writes made while the unit runs go into its frame and are discarded when it ends: `config([...])`, `app().instance()`, facade fakes and swaps, the locale, auth, the session, Context, and static setters such as `Model.unguard()`. So concurrent units never see each other's state.
  > - **What a frame can't change:** after boot, `bind`, `singleton`, routes, macros and `Blade.directive` throw `ScopeFrameException` inside a request, job or command. Inside a test they apply to that test only.

### P-11 DIV-12: "Other framework state moves behind Upstream's getters" is unclear
- **Problem:** the bullet doesn't say which name the method keeps. "Accept either form" doesn't say who defines the option. The intro covers only name clashes, but half the bullets are about PHP magic.
- **Replacement (intro and first two bullets):**
  > - **DIV-12 PHP member namespaces.** PHP lets a property and a method share a name, and JavaScript doesn't. PHP also has magic members (`__get`, dynamic `where<Column>()`, `ArrayAccess` index syntax) that JavaScript classes don't have outside `Model`. DIV-12 fixes one form for each:
  >   - **Option pairs** (`casts`, `middleware`, `backoff`, `tries`, `timeout`, `attachments`, `via`, …): an app class may define the option as a property or as a method, and the framework accepts either. Base classes define neither.
  >   - **Framework methods that share a name with state** (`delay()`, `afterCommit()`, `subject()`, …) keep the method name. The state is read through Upstream's getters.

### P-12 FR-42: an agent can't tell which routes "can return Fragments"
- **Replacement (third consequence):**
  > - Every response that passes through the view or response seams sends `Vary: HX-Request, HX-Request-Type`, whether or not the request is an htmx Request, so a full page and a Fragment never share a cache entry. This header is the only effect the htmx Integration has on a non-htmx request.

### P-13 FR-96: one long paragraph, and the arrow-function rule is missing
- **Replacement (FR-96 body):**
  > App tests use a Pest-style form: `uses(TestCase, RefreshDatabase)`, then `test(name, async function () { … })`. `this` is bound to the TestCase, so the test body must be a `function`, not an arrow function. Lint rejects arrow bodies in files that call `uses()`.
  >
  > A test calls `this.get('/invoices')`, `this.post(…)` and the other HTTP methods, and uses the TestResponse assertions (`assertOk`, `assertRedirect`, `assertSee`, `assertJson`, `assertSessionHasErrors`, …). An HTTP test call returns a pending response that can be awaited. Assertions chained on it run when the response arrives: `await this.post(url, data).assertRedirect(route('x')).assertSessionHas('ok')`. `make:test` generates this form.

### P-14 FR-66: dense, and `JSON.stringify` overclaimed
- **Problem:** `JSON.stringify` throws on `bigint` and ignores PHP's JSON flags (AD-23), so it is not the exact Laravel output.
- **Replacement:**
  > Models serialize with Laravel's methods, honouring `hidden`, `visible` and `appends`: `toArray()`, `toJson()` (which returns a string, as in Laravel) and `jsonSerialize()`. Every model also has JavaScript's `toJSON()`, which calls `jsonSerialize()`, so `JSON.stringify(model)` gives the same structure. For Laravel's exact output, use `toJson()`: `JSON.stringify` throws on `bigint` values and ignores PHP's JSON flags. `JsonResource` and `ResourceCollection` produce Laravel's response shape.

### P-15 §7.3 Phases 0, 1 and 3: nested parentheses and a missing clause
- **Replacement (Phase 0, last two bullets):**
  >    - scans of Upstream at the Pin: DIV-12 name pairs, facade method lists, `singleton()` bindings, the names queued closures may use (DIV-4), and the public API surface
  >    - scaffolding for every Package (architecture AD-27)
- **Replacement (Phase 1):**
  > 1. **Foundations,** in this order:
  >    - `@xaravel/runtime`: Scope Frames, the Class Registry (FR-22), PHP value helpers and the codecs
  >    - `@xaravel/contracts`, including the Xaravel-only contracts: the alias table, the async thenable list, the view ABI and the test lifecycle
  >    - Macroable, Conditionable, Collections, Reflection, Config and JsonSchema
- **Replacement (Phase 3):**
  > 3. Pipeline, Encryption, Hashing, Filesystem, Process, Log, Translation; the ports of Symfony HttpFoundation, Mime and Finder (`@xaravel/http-foundation`, `@xaravel/mime`, `@xaravel/finder`); `@xaravel/serializable-closure`, which must land before Bus; Bus; Events

### P-16 OQ-5, OQ-7 and OQ-11: the resolution is buried mid-question
- **Problem:** OQ-11 puts "resolved, v2" in the middle of the question. OQ-5 and OQ-7 drop the *Resolve by* line, which the resolved OQ-9 keeps.
- **Replacement (OQ-11):**
  > 11. **OQ-11 Bun primitives and MCP SDK version.** Does `bun test` offer everything the harness needs? That covers `test.failing` / `skipIf`, per-test assertion counts, `setSystemTime`, and preload `afterEach`. Are the Bun built-ins this PRD names complete enough: `Bun.sql` raw bindings, `Bun.redis`, `Bun.S3Client`, `Bun.Image`, and `AsyncLocalStorage` propagation across `await`, timers, streams and `Bun.serve` callbacks? A Phase 0 spike answers these. The MCP SDK part is resolved (2026-10-16): Xaravel uses v2, `@modelcontextprotocol/server` 2.3.1. *Resolve by: the end of Phase 0.*
- **OQ-5 and OQ-7:** append "*Resolved before: the end of Phase 0.*". Or drop the *Resolve by* line from OQ-9 too, so all three resolved OQs match.

### P-17 NFR-2: "ported PHP library" excludes replaced libraries
- **Problem:** AD-22 also covers Guzzle, which is replaced by `fetch`.
- **Replacement (second sentence):**
  > Every third-party dependency is recorded with a reason in its owning Package's README. Every non-Laravel PHP library that Laravel uses (the Symfony components, Carbon, Monolog, Guzzle, …) has exactly one owning Package, whether it is ported or replaced, as listed in the architecture document (AD-22).

### P-18 Glossary Package, FR-10 and the addendum mapping
- **Glossary Package (l.133).** Problem: `@xaravel/contracts` is listed under "Exceptions", but it follows the normal rule: `src/Illuminate/Contracts` becomes one Package.
  > - **Package:** the npm package that publishes one Component, named `@xaravel/<component>`. The Contracts Component publishes as `@xaravel/contracts`, which holds every Contract (architecture AD-1). Shared runtime primitives publish as `@xaravel/runtime` (AD-19). Exceptions: the Installer publishes as `create-xaravel`, and Boost framework mode is the private, unpublished workspace `tools/boost-framework`.
- **FR-10, first consequence.** Make the dependency floor explicit:
  > - A Package depends only on the Packages its Component actually needs, mirroring Upstream's `composer.json` `require` lists. Every Package may also depend on `@xaravel/contracts` and `@xaravel/runtime`. `@xaravel/contracts` depends only on `@xaravel/runtime`, and `@xaravel/runtime` depends on nothing (addendum; architecture AD-2).
- **Addendum mapping paragraph (l.39).** This also fixes C-8.
  > Mostly 1:1, from `src/Illuminate/<Name>` to `@xaravel/<name-kebab>`. Contracts follow the same rule: `src/Illuminate/Contracts` becomes one `@xaravel/contracts`, which holds every Contract and depends only on `@xaravel/runtime` (changed 2026-10-16 by architecture AD-1). `@xaravel/runtime` holds the shared runtime primitives and depends on nothing (AD-19). Every Package may depend on both.
  >
  > Four Packages port code from outside `laravel/framework`: `@xaravel/serializable-closure` (from `laravel/serializable-closure`), and `@xaravel/http-foundation`, `@xaravel/mime` and `@xaravel/finder` (from the Symfony components of the same names; AD-22). Boost framework mode is the private workspace `tools/boost-framework`, which is not published. `laravel/ai`, `laravel/mcp` and `laravel/boost` map to `@xaravel/ai`, `@xaravel/mcp` and `@xaravel/boost`.

### Other amended passages
- **DIV-2:** reads well. Two small changes:
  - "returns the loaded relation" → "returns the loaded value (a model, a Collection or `null`)";
  - "awaiting it unchained" → "awaiting it with no chained calls".
- **FR-63:** put the builder first:
  > - `model.related('posts')` returns the relationship's query builder. Awaiting it with no chained calls loads the relationship if it's missing and stores it on the model. A chained query, such as `await model.related('posts').where(…).get()`, never stores its result.
  > - There is no `relation()` method and no callable `model.posts()` (DIV-2).
- **OQ-5, OQ-7:** reads well.

---

## 4. Spine-side issues found while checking (for the architect)

- **S-1:** AD-27 has two "Phase 0" bullets that overlap. Both name the DIV-12 pair scan and the API-surface extraction. Merge them.
- **S-2:** AD-26's "Framework method plus state" row lists `fillable()` as keeping its name. AD-7 renames `fillable(arr)` → `setFillable(arr)`. The PRD follows AD-7. Remove `fillable()` from the AD-26 row.
- **S-3:** AD-15 says an extra API member needs an `additions.jsonl` entry "citing an FR". Additions that come from DIVs need to cite a DIV. Change it to "citing an FR or a DIV" (see C-5).
- **S-4:** AD-9 says `normalizeRow` "returns `number` within ±`MAX_SAFE_INTEGER`, keeps `bigint` for columns hinted lossless". It doesn't say whether a hinted column returns `bigint` for small values too. State that hinted columns always return `bigint` (see P-7).
