# Reconcile review: Architecture Spine vs PRD (Xaravel)

Date: 2026-10-16. Spine: `../ARCHITECTURE-SPINE.md` (AD-1..AD-18, draft). Sources: `prds/prd-xaravel-2026-10-15/prd.md`, `addendum.md`, `review-triage.md`, PRD `.memlog.md`, spine `.memlog.md`.

**Verdict:** The spine settles most of the hard calls the triage handed to architecture: contracts, DIV-3 shape, Scope Frames, Eloquent attributes and relations, the Class Registry key, queue timeouts, closure capture and conformance sharding. But one structural contradiction would block every Story. That is R-01: the seed marks `conformance/` Protected, and that includes the Expectations File. There are also several App-Developer-facing gaps (container string keys, singleton lifetime, PHP arrays, Blade variable binding, closure access to classes), and five PRD contradictions that the "Source Amendments Required" section does not list.

Severity counts: critical 1 · high 14 · medium 17 · low 13.

---

## (a) Triage items deferred to architecture: coverage

| Triage item | Spine outcome | Finding |
|---|---|---|
| RUB-DN7 / ADV-M5 / BRF-G14: FR-88 capture detection and allowlist | **Decided** (AD-14: free-identifier analysis; allowlist = parameters + ECMAScript built-ins) | Gap: the closure has no way to reach Class Registry classes or facades (R-06) |
| RUB-DN8: FR-106 output contract | **Redirected** to the Boost Epic (Deferred table) | R-36 (low) |
| RUB-DN10 / ADV-L2: NFR-4 load and interleaving harness | **Partial** (one sentence at the end of AD-5) | R-23 |
| RUB-DU3 / RES-G10 / ADV-H5: DIV-1 async surface per interface; state loaded once (session, `old()`, `Auth.user()`) | **Partial.** The rule is in AD-6. The list is redirected to `async-surface.json`. `Auth.user()` is not decided | R-12, R-14, R-15 |
| ADV-M3: API-surface parity check for libraries outside the Test Inventory (phpdotenv, prompts, tinker, Carbon, Inflector) | **Silently dropped** | R-11 |
| ADV-M4: FR-110 read-only enforcement | **Redirected** (Deferred: Boost Epic) | R-36 |
| ADV-M11: `automaticallyEagerLoadRelationships()` | **Decided** (AD-8: Escalation in the first Eloquent relationships Epic) | OK. See R-17 for the FR-63 wording |
| ADV-M13: Class Registry boot loading and key format | **Decided** (AD-10) | Gaps: which package hosts the Registry; classes outside the convention directories (R-21) |
| ADV-M14: shared Expectations File | **Decided** (AD-15 shards) | The seed then marks those shards Protected (R-01) |
| RES-G7: PHP value model | **Partial** (AD-9: null, ints, int/float, markers) | Missing: PHP arrays and key order, copy versus reference (R-05) |
| RES-G8: DIV-3 parameter names | **Decided** (AD-4) | Polyfill and decorator location (R-31) |
| RES-G9: which state is per async context (query log, `DB.listen`, `afterCommit`, facade cache) | **Partial** (AD-5 lists frame contents) | Not addressed: singleton cache, query log, `DB.listen`/`Event.listen` (R-04); transaction child frame (R-20) |
| BRF-G16: `cursor()`/`lazy()` | **Decided** (AD-6 `AsyncLazyCollection`) | Not carried into DIV-1 amendments (R-14) |
| RES-G13: job timeouts | **Decided** (AD-13) | Test adaptation has no DIV (R-25) |
| RES-G14: `hashing.argon.threads` | **Redirected** (Hashing Epic) | OK |
| RES-G16: Bun patch pin in CI | **Decided** (`.bun-version` 1.4.3) | Engines/test mismatch (R-39) |
| RES-G17: minimum Redis version and Pub/Sub status | **Partial** (minimum 7.2 is in Stack; Pub/Sub is silent; 7.2 is never tested) | R-34 |
| RES-G19: `QUERY` CSRF classification | **Silently dropped** | R-33 |
| RES-G22: `network` backend tag | **Redirected** (Validation Epic, through an Escalation) | OK, but it touches the Protected harness. See the note in R-36 |
| RES-G23: `route:cache` with closure routes | **Redirected** (Routing Epic) | OK |
| RES-G24: typed fields shadow Proxy attributes | **Decided** (AD-7 `declare`) | The "detect at boot" part was dropped; `undefined` initializers are not handled (R-29) |
| RES-G26 / BRF-G9: how inventory data is produced (Oracle runner list + AST cross-check, `--list-tests-xml`, feature tags) | **Silently dropped** (AD-15 gives fields only) | R-27 |
| RES-G27: per-route streaming-body opt-out | **Redirected** (Http Epic) | OK, but the lifecycle it plugs into is not specified (R-18) |
| RES-G28: small idioms | **Partial** (the Deferred row lists real-time facades and dynamic finders, but not `Uri` normalisation, ParallelTesting or Faker names) | R-35. Trait/mixin mechanics also need an AD (R-28) |

## (b) PRD clauses that say "the architecture document" must do something

| PRD clause | Spine | Finding |
|---|---|---|
| DIV-1: "The architecture document lists every Promise-returning public method, and a type-level check enforces the list." | Redirected to per-package `async-surface.json` (Deferred table). Not listed in Source Amendments. The CI check is a diff against a generated file, which is circular. | R-14 |
| DIV-3: "The exact shape of the declaration is decided in the architecture document." | Satisfied (AD-4). The amendment is listed. The addendum's DIV-3 row is not. | R-37 |
| DIV-9: "fixed rules, which the architecture document sets out" | Partial (AD-9). Arrays are missing. | R-05 |
| NFR-2: "Every third-party dependency is recorded with a reason in the architecture document." | Redirected to each package's `README` (AD-2). Not amended. No dependency list exists. | R-16 |
| Addendum: "Sketch of the monorepo layout … starting point for the architecture document" | Seed drops `conformance/upstream/` (the pinned Upstream checkout) | R-10 |

---

## Findings

### Critical

#### R-01 — The seed makes the Expectations File a Protected Path, so no Story can record its results [critical]
- **PRD:** FR-4 ("A Story's change may modify Expectations File entries only for the Test IDs assigned to that Story"); FR-112 (the protected list does *not* include the Expectations File); UJ-4 step 3.
- **Spine:** Structural Seed `conformance/   # Protected except escalations/`, with `expectations/` inside it. AD-16 fails any PR that touches a listed path without the Maintainer's `infrastructure` label.
- **What's missing:** taken literally, every Story PR that updates `conformance/expectations/<c>.jsonl` fails CI. The spine also never says which parts of `conformance/` FR-112 covers.
- **Fix (spine text):** replace the seed comment and add to AD-16:
  > `conformance/` — Protected: `harness/`, `inventory/`, `fixtures/`, `oracle/`, `decisions/`, `component-map`, `skip-reasons`, `protected-paths`. **Not Protected:** `expectations/` (Story edits are limited by FR-4's own-Test-ID check, not by AD-16) and `escalations/`.

### High

#### R-02 — The Story file that authorises Expectations edits can be edited by the agent it constrains [high]
- **PRD:** FR-4, FR-112, NFR-10, FR-109 (framework mode reads "the Test IDs assigned to a Story").
- **Spine:** AD-16: "a Story's file frontmatter `test_ids:` is the only authority". The spine does not say where Story files live or whether they are Protected.
- **What's missing:** if the Story file sits in the PR branch, an agent can add Test IDs to its own Story and then edit any Expectations entry. That defeats FR-4.
- **Fix:** add to AD-16:
  > Story files live at `stories/<story-id>.md` and are Protected. CI reads `test_ids:` from the Story file **on the default branch**, never from the PR head. The PR head is matched by branch name `story/<story-id>`. Only the Maintainer (sprint planning) adds or changes `test_ids:`.

#### R-03 — "The container binds and resolves tokens, never strings" contradicts Laravel's container API [high, not in Source Amendments]
- **PRD:** FR-19 (`bind`, `make` with parameters, `needs()`), FR-21 (facade accessors), §5.1 parity rule. Upstream `ContainerTest` binds and resolves string abstracts throughout (`$c->bind('name', …)`, `app('cache')`, aliases). `needs('$name')` is itself a string.
- **Spine:** AD-1 Rule.
- **What's missing:** as written, Container Ported Tests and every `app('config')`-style call are impossible, and nothing records that as a divergence.
- **Fix:** replace the AD-1 sentence with:
  > Framework code injects contracts by token. The container also accepts string abstracts and aliases exactly as Upstream does. Each contract token is registered as an alias of its Upstream FQCN string (`'Illuminate\\Contracts\\Mail\\Mailer'`) and of the Upstream short alias (`'mailer'`), so `app('mailer')`, `app(Mailer)` and facade accessors resolve the same binding.

#### R-04 — Boot-once-per-process changes singleton lifetime from Laravel's, and no DIV covers it [high, not in Source Amendments]
- **PRD:** §5.1 ("any other difference is a bug"; a TS limitation no DIV covers goes through FR-114); NFR-4; FR-19; RES-G9 warning ("some of it is app-global in Laravel, so it shouldn't be added to NFR-4 blindly").
- **Spine:** Design Paradigm ("boots once per process and is shared"); AD-5. AD-5 lists "scoped container instances" but does not say where a `singleton` resolved for the first time *inside* a frame is cached. It also leaves unclassified the query log, `DB.listen`, runtime `Event.listen`, `Gate.define`, `Route` registration and `macro()`.
- **What's missing:** under PHP-FPM a singleton lives for one request. Here it lives for the process, which gives Octane semantics. App code whose singletons capture the request, and provider `boot()` code that reads the request, behave differently. That is an App-Developer-visible divergence with no DIV and no Escalation.
- **Fix:** add to AD-5, and add a Source Amendments line:
  > **Lifetime:** the application and its singletons live for the process (Octane semantics). A singleton resolved inside a frame is cached in the global base only if its binding was registered while no frame was active. Otherwise it is cached in the frame. Per-frame (overlay): query log, `DB.listen`/`Event.listen`/`Gate.define` calls made inside a frame, `afterCommit` queues. App-global (base): route registration, `macro()`, `Blade.directive()`, provider-registered listeners.
  >
  > *Source Amendments:* **new DIV-11 "Long-lived application"**: the app boots once per process; provider `boot()` must not read per-request state; test-adaptation rule for Upstream tests that assume a fresh app per request. The Maintainer approves it through FR-114.

#### R-05 — AD-9 has no rule for PHP arrays, so FR-23's integer-like key order cannot be met consistently [high]
- **PRD:** DIV-9 ("PHP values map to TypeScript by fixed rules, which the architecture document sets out"); FR-23 ("Key order is always preserved, including integer-like keys"; PHP key normalisation); RES-G7 (copy versus reference, `collection[0]`); §5.1 (value-copy semantics).
- **Spine:** AD-9 covers null, integers, int/float and markers only.
- **What's missing:** JS plain objects reorder integer-like keys (`{2:a,1:b}` iterates 1, 2). Every Component that accepts or returns a PHP array needs one shared representation: `Arr`, `config()`, `request.all()`, validation data, query bindings, `toArray()`, JSON. Without one, parallel agents will choose differently (plain object, `Map`, or a custom ordered map).
- **Fix:** add a bullet to AD-9:
  > **Arrays:** a PHP list maps to a JS `Array`. A PHP associative array maps to a plain object at public boundaries **only when no key is integer-like**. Inside `Collection`, `Arr` and every API whose Upstream tests depend on mixed or integer-like key order, the representation is `@xaravel/support`'s `PhpArray` (an ordered map that normalises keys as PHP does). It converts to a plain object or `Array` at JSON and public-return boundaries by PHP's list-versus-assoc rule. Arrays passed into a public API are copied (PHP value semantics) unless Upstream takes them by reference, in which case the TS signature takes a `Ref<T>` box (`PORTING.md` mapping).

#### R-06 — Queued closures have no way to reach models, facades or Registry classes [high]
- **PRD:** FR-88 ("a rebuilt closure can reach only its arguments and the classes in the app's Class Registry"); DIV-4; addendum mapping `dispatch(async ({ podcast }) => …, { podcast })`.
- **Spine:** AD-14 rejects every free identifier that is not a parameter or an ECMAScript built-in. At dispatch time, nothing can see what an imported identifier refers to.
- **What's missing:** almost every real queued closure calls a facade or a model (`Mail.to(...)`, `User.find(...)`). Under AD-14, that is a dispatch error, and the spine offers no Registry access path. Model arguments also need a serialization rule (Laravel's `SerializesModels` / `ModelIdentifier`).
- **Fix:** add to AD-14:
  > The closure's signature is `(args, ctx) => …`. `ctx.app` is the container. `ctx.use('<FQCN>')` returns a Class Registry class. `ctx.facade('Mail')` returns a facade root. The codec allows the identifiers `args` and `ctx`. Model instances in `args` are serialized as `ModelIdentifier` (class FQCN + key + connection + loaded relations) and re-fetched on the worker, as `SerializesModels` does. Other `args` must be JSON or PHP-serialize-codec (FR-77) values.

  If the Maintainer wants bare `Mail`/`User` identifiers instead, that is a DIV-4 amendment.

#### R-07 — AD-11 does not say how view data reaches a compiled ES module, or what Blade variables look like [high]
- **PRD:** FR-44, FR-45, FR-48; §5.1 ("Expressions inside Blade templates are TypeScript"); RES-G11 (the `$`-prefix question is App Developer API); PRD memlog (Maintainer: "Blade expressions are TS").
- **Spine:** AD-11 says expressions are TypeScript and may `await`, but does not settle the binding.
- **What's missing:** ES modules are strict mode, so `with(data)` is unavailable. Data keys passed to `view('x', {...})` are not known at compile time. `$loop`, `$attributes`, `$slot` and `$errors` need names. Every View, htmx and Blade-component agent depends on this choice, and it is the main template syntax App Developers see.
- **Fix:** add to AD-11:
  > **Variables:** templates keep Upstream's `$`-prefixed names (`{{ $user.name }}`, `$loop`, `$attributes`, `$slot`, `$errors`). The compiler collects every free `$identifier` in a template and emits `const { $user, … } = __data` at the top of each render function. Other free identifiers resolve to module scope (globals, helpers). Data keys are passed without the `$` (`view('x', { user })`).

  (Or state the opposite choice. Either way, add it to Source Amendments as the FR-48 / `PORTING.md` rule.)

#### R-08 — Boost framework mode is a Phase 0 deliverable, but the layer table makes Boost depend on Foundation [high]
- **PRD:** FR-109 ("delivered in Phase 0 … built on the MCP TypeScript SDK directly, so it doesn't wait for `@xaravel/mcp` (Phase 8)"); §7.3 Phase 0.
- **Spine:** layer table ("Xaravel Components (htmx, testbench, boost) — may depend on Upstream Components + Foundation"); diagram `xc --> foundation`; Capability Map "Boost … AD-2".
- **What's missing:** under AD-2, one `packages/boost` workspace cannot hold a Phase 0 tool with only the MCP SDK as a dependency alongside Phase 8 app tools that need Foundation and `@xaravel/mcp`.
- **Fix:** add to AD-2 or AD-15:
  > Boost framework mode is a separate private workspace, `tools/boost-framework` (not published). Its only dependency is `@modelcontextprotocol/server`, and it reads `conformance/`, `stories/` and `decisions/` read-only. `@xaravel/boost` (app tools, Phase 8) may later re-export it. It is not a dependency of it.

#### R-09 — The harness must open Scope Frames (AD-5), but it may import no graded package (AD-15) [high]
- **PRD:** NFR-7 (state resets after each test); FR-25 (test clock reset); FR-112 (grader isolation).
- **Spine:** AD-5 ("the test harness each open exactly one frame per unit of work"); AD-15 ("the harness, `@xaravel/assert` and `@xaravel/mockery` import no graded package"). `ScopeFrame` is implemented by `@xaravel/container`, which is graded.
- **What's missing:** a non-circular way to get one frame per test.
- **Fix:** add to AD-15:
  > Per-test framing is graded code: each package's `tests/setup.ts` (a `bun test` preload) imports `@xaravel/testing/frame` and wraps every test (including `beforeEach`) in `ScopeFrame.run`. The Protected harness checks only that the preload is configured, and fails a test file that runs outside a frame. It never imports the frame implementation.

#### R-10 — Agents have no specified local copy of Upstream source to port from or review against [high]
- **PRD:** UJ-4 step 2; FR-111 (reviewers "compare each Ported Test with its Upstream source"); OQ-9 (agents need neither Docker nor PHP); addendum layout (`conformance/upstream/ # pinned Laravel checkout (read-only)`).
- **Spine:** the seed drops `conformance/upstream/`. The Oracle image holds Laravel, but agents don't run the Oracle.
- **What's missing:** a pinned, read-only Upstream source tree for `laravel/framework`, `ai`, `mcp` and `boost` at the Baseline Pin, which the inventory `source` field can point into.
- **Fix:** add to the seed and to AD-15:
  > `conformance/upstream/{framework,ai,mcp,boost}/`: a read-only, Protected snapshot of each Upstream repo at the Baseline Pin, fetched by `bun run upstream:sync` from the tag in `conformance/baseline-pin` (a git submodule or a vendored tarball). The inventory field `source` is a path relative to it, plus a line range.

#### R-11 — ADV-M3 (no oracle for FRs backed by libraries outside the Test Inventory) was silently dropped [high]
- **PRD:** FR-20 (phpdotenv grammar), FR-24 (Doctrine Inflector), FR-25 (Carbon), FR-70 (laravel/prompts), FR-73 (tinker), FR-31/FR-35 (Symfony and Monolog surfaces, §5.1 / OQ-3); triage ADV-M3 "Deferred → Architecture".
- **Spine:** neither an AD nor the Deferred table mentions it.
- **What's missing:** these FRs carry testable consequences, but no Test IDs cover them and nothing grades them. Agents would build them ungraded.
- **Fix:** add to AD-15:
  > **Non-inventory parity:** for each library Laravel re-exposes (phpdotenv, Inflector, Carbon, prompts, Symfony HttpFoundation/Console surfaces, Monolog), the owning Epic adds a Xaravel Test suite whose expected values come from the Oracle (Differential, FR-6), tagged `XT-<c>-<n>` and not counted in the Conformance Rate. CI runs an **API-surface check**: the Oracle exports the public PHP signatures that Upstream source and tests use (`conformance/fixtures/<c>/surface.json`), and CI diffs them against each package's exported `.d.ts`. A missing member fails unless it has a DIV or a `deferred:` entry.

  (If this is meant to wait, add a Deferred row with an owner. Today it is simply absent.)

#### R-12 — `Auth.user()` and other "loaded once" state are not placed on the sync/async line [high]
- **PRD:** DIV-1 (sync list); triage RUB-DU3 names `old()` and `Auth.user()`; FR-92, FR-93 (`@auth`, `can()`), FR-44.
- **Spine:** AD-6's rule ("Promise iff it transitively calls an async Driver-contract method") makes `Auth.user()`, `request.user()` and `Gate.allows()` async, because in Laravel the guard loads the user lazily from the provider. The spine never says this or chooses otherwise.
- **What's missing:** this is the most visible async decision for App Developers after Eloquent. Auth, Http and Blade agents need the same answer.
- **Fix:** add to AD-6:
  > **Loaded-once state is sync after its middleware:** `StartSession` loads the session; the `auth`/`guest` middleware (and `Authenticate`'s guard check) loads the user into the frame. After that, `Auth.user()`, `Auth.check()`, `Auth.id()`, `request.user()` and `old()` are synchronous. Before the middleware has run, `Auth.user()` throws `AuthenticationException` naming the missing middleware. The async loader is `await Auth.authenticate()`. `Gate`/`can()` are async, because policies may do IO.

  Add this to DIV-1's amendment (R-14).

#### R-17 — The spine renames FR-63's `relation()` to `related()`, but Source Amendments lists only DIV-2 [high, not in Source Amendments]
- **PRD:** FR-63 consequence ("`await model.relation('posts')` loads the relationship if it's missing"); §5.1 Xaravel-only additions list ("`await model.relation()` (FR-63)"); DIV-2 and the addendum (`await user.load('posts')`, `await load()`).
- **Spine:** AD-8 (`model.related('posts')`).
- **What's missing:** an agent writing the FR-63 Xaravel Test will test `relation()`.
- **Fix:** extend the Source Amendments bullet:
  > **DIV-2, FR-63, §5.1 (Xaravel-only additions), addendum DIV-2 row:** the method is `related(name)` (AD-8); `relation()` does not exist; `model.posts` is a property read, never a call.

#### R-14 — The DIV-1 list is redirected to a generated file without a Source Amendment; the check is circular; the async root set is not named [high]
- **PRD:** DIV-1 ("The architecture document lists every Promise-returning public method, and a type-level check enforces the list"); RES-G10 (enumerate the consequences in DIV-1's Divergence Record).
- **Spine:** AD-6 (a CI diff of `.d.ts`-derived `async-surface.json`); Deferred row 1. Source Amendments does not mention DIV-1.
- **What's missing:**
  1. A PRD amendment saying where the list lives.
  2. A diff of generated output against its committed copy shows a change but cannot say whether the change follows the rule. A missing root set makes the "transitively calls a Driver" rule ambiguous for CPU or crypto contracts: `Hasher` (Bun's `password.hash` is async), `Encrypter` (WebCrypto is async), the translation file loader, the view finder and loader (compiled views load with `import()`), and config loading.
  3. Thenable builders, `AsyncLazyCollection` replacing `LazyCollection` from `cursor()`/`lazy()` (which breaks Upstream `assertInstanceOf(LazyCollection…)`) and `eachAsync`/`mapAsync` are not carried into DIV-1's record.
- **Fix:**
  1. Add to Source Amendments:
     > **DIV-1:** the Promise-returning list lives in each package's committed `async-surface.json` (AD-6), not in this document. DIV-1's record adds thenable builders, `AsyncLazyCollection` from `cursor()`/`lazy()` (test-adaptation: `instanceof LazyCollection` → `AsyncLazyCollection`), the async companions, and the loaded-once rule (R-12).
  2. Add to AD-6:
     > **Async roots** (the only Driver-contract methods that may be async): `Cache\Store`, `Session\SessionHandler`, `Queue\Queue`, `Mail\Transport`, `Filesystem\Filesystem`, `Database\Connection` (statement methods), `Redis\Connection`, `Http\Client` sending, `Broadcasting\Broadcaster`, `Process` runs. `Hasher`, `Encrypter`, `Translator`, the view loader and `Config` are **sync** (use `Bun.password.hashSync`, `node:crypto`, `readFileSync`/`require` for compiled views). A new root needs an Escalation.

     `async-surface.json` records, per method, the root it reaches. Fidelity Review rejects an entry with no root.

#### R-13 — Agents have no path to get Oracle fixtures for a new Differential Test [high]
- **PRD:** FR-6, FR-46 (Oracle-generated XSS suite), FR-48 (Blade Differential Tests), FR-112 (fixtures Protected), OQ-9.
- **Spine:** AD-15: the Oracle "run only by a GitHub Actions workflow that commits fixtures". AD-16: a PR touching a Protected path fails without the Maintainer label.
- **What's missing:** the Oracle workflow commits to a Protected path. The spine doesn't say who triggers it, when, or how its commit passes AD-16. So a Story that needs new fixtures (Xaravel Differential suites; a Ported Test whose dataset the Phase 0 batch missed) has no path except an Escalation.
- **Fix:** add to AD-15:
  > Fixtures for every Upstream Differential Test ID are generated in one batch at each Baseline Pin (Phase 0 and each pin bump). For new inputs, a Story commits `conformance/oracle-requests/<story-id>.jsonl` (not Protected). The Oracle workflow runs on that file, writes `conformance/fixtures/<c>/…` as the `xaravel-oracle` GitHub App, and AD-16 accepts fixture-only commits by that App without the `infrastructure` label.

### Medium

#### R-15 — The tool that generates `async-surface.json` is unspecified, and TS 7 has no stable programmatic API [medium]
- **PRD:** DIV-1 ("type-level check"); NFR-3.
- **Spine:** AD-6 ("generated from its `.d.ts` (every exported method whose return type is a Promise or thenable)"); spine memlog line 13 (TS 7.0 lacks the programmatic API until 7.1).
- **Fix:** add to AD-6 and to Stack:
  > `async-surface.json` is produced by `tools/async-surface`, which uses the TypeScript **6.0.3** compiler API (devDependency, tooling only) to resolve return types (including aliases and thenable shapes) from `tsc 7` emitted `.d.ts`.

#### R-16 — The NFR-2 dependency record is moved to READMEs without an amendment, and the known third-party dependencies are not listed [medium, not in Source Amendments]
- **PRD:** NFR-2 ("Every third-party dependency is recorded with a reason in the architecture document"). The brief's `deps-map.md` names Tier-N picks: nodemailer (SMTP, FR-89), juice (CSS inlining, FR-89), croner (scheduler, FR-72), markdown-it (fallback, FR-89/FR-24), `uuid`/`ulid`, decimal.js, file-type, youch / `@poppinss/dumper`, ajv (JsonSchema, FR-84), pusher (FR-91), p-limit and tough-cookie (FR-79), the Vercel `ai` SDK (FR-103), Playwright (FR-102), and acorn/meriyah (closure parsing, AD-14).
- **Spine:** AD-2 (README records). The Stack table lists versions without reasons and leaves out most of the above.
- **Fix:** either add to Source Amendments:
  > **NFR-2:** dependencies are recorded in each package's README, and the root `DEPENDENCIES.md` (generated, CI-checked) aggregates them.

  or add a "Third-party dependencies" table to the spine (name · package · reason · NFR-2 tier) seeded from `deps-map.md`, with "chosen in Epic" rows for the undecided ones.

#### R-18 — There is no request-lifecycle rule for FR-28 (size limit, then parse, then pipeline) or FR-43 (upgrade) [medium]
- **PRD:** FR-28 ("the body is parsed once before the middleware pipeline"; "`ValidatePostSize` … before the body is buffered"); FR-31 (`ValidatePostSize` is still a middleware "and behave[s] as Upstream does"); FR-43 (WebSocket 101 to the route handler); RES-G27.
- **Spine:** no AD covers the HTTP kernel's order. `ValidatePostSize` as Upstream middleware runs *after* parsing, which conflicts with FR-28 unless the kernel enforces the limit first.
- **Fix:** add **AD-19 HTTP kernel order**:
  > `Bun.serve` `fetch` → open Scope Frame → pre-pipeline size gate (rejects on `Content-Length` or a streamed byte count above `post_max_size`, the same limit `ValidatePostSize` reads) → parse the body once into `Request` → global middleware (including `ValidatePostSize`, which then only re-checks the parsed size) → router → route middleware → controller. WebSocket routes receive `server` through the frame and call `server.upgrade()`. The per-route streaming opt-out (Deferred) skips the parse step only.

#### R-19 — Scope Frame lifetime is undefined for streamed responses, WebSockets, terminable middleware and `defer()` [medium]
- **PRD:** FR-43, FR-31 (terminable middleware), NFR-4, DIV-1 (the session "is persisted when the response is sent").
- **Spine:** AD-5 ("A frame is discarded when its unit ends").
- **Fix:** add to AD-5:
  > An HTTP unit ends when the response body stream closes (SSE and multipart included) or, for a WebSocket, when the socket closes. The session is saved when the headers are sent. Terminable middleware and `defer()` callbacks run inside the same frame after the body closes.

#### R-20 — The transaction child frame would discard non-transaction writes made inside the callback [medium]
- **PRD:** FR-55; FR-81 (Context); §5.1 parity.
- **Spine:** AD-5 ("`DB.transaction()` opens a child frame"; "A frame is discarded when its unit ends").
- **What's missing:** in Laravel, `Context.add()`, `session().put()` or `App.setLocale()` called inside `DB.transaction()` persist after it. A child frame with its own overlay would drop them.
- **Fix:** add to AD-5:
  > A transaction child frame overrides only the per-connection transaction stack and `afterCommit` queue. Every other read and write delegates to its parent frame.

  Also state that manual `beginTransaction()`/`commit()` use the current frame's stack.

#### R-21 — The Class Registry has no named package, and classes outside the convention directories never register [medium]
- **PRD:** FR-22; glossary (the Class Registry is a Xaravel Component); §7.3 Phase 1 ("first Epic"); FR-10 (Collections standalone); the Errors convention (every exception registers).
- **Spine:** AD-10 (no package); the layer table has no row for it.
- **What's missing:** every package's entry module registers its classes, including Phase 1 Collections exceptions, so the Registry must be a dependency-light Phase 1 package. Separately, a job in `app/Domain/Billing/Jobs` is keyed by PSR-4 but never imported, so a worker throws where Laravel's autoloader would find it.
- **Fix:** add to AD-10 and the layer table:
  > The Registry is `@xaravel/class-registry` (Phase 1; depends only on `@xaravel/contracts`). **Misses** under `App\` first try the PSR-4 path (`App\X\Y` → `app/X/Y.ts`) with a dynamic `import()`. They throw (FR-22) only if that file doesn't exist or doesn't register the key.

#### R-22 — The spine classes Testing as a Xaravel Component; it is an Upstream Component [medium]
- **PRD:** §4.17 ("Upstream Components: Testing, Foundation (testing). Xaravel Components: Mockery, Testbench"); glossary list of Xaravel Components.
- **Spine:** the diagram node `xc` ("htmx, testing, testbench, boost"); the seed comment `htmx/ testing/ testbench/ boost/ # Xaravel Components`.
- **What's missing:** the classification decides acceptance (the Global rule versus FR-115) and AD-2 ("Upstream-mirroring packages never depend on Xaravel Components").
- **Fix:** move `testing` into the L3 app layer in the diagram and the seed. The Xaravel Components are htmx, testbench, boost, class-registry (and mockery in the Grader).

#### R-23 — The NFR-4 concurrency harness has no owner or mechanism, and the load level is unstated [medium]
- **PRD:** NFR-4, FR-19, FR-27, FR-55, FR-81; triage RUB-DN10 and ADV-L2 (deferred to architecture).
- **Spine:** the last sentence of AD-5.
- **Fix:** add to AD-5:
  > `@xaravel/testing` provides `interleave(units, { seed })`. It runs N ≥ 2 units in one process and, through a seeded scheduler, yields to another unit at every awaited framework call (it wraps Driver-contract methods). Each NFR-4 test runs 2, 8 and 64 units with 3 printed seeds (NFR-7). The isolation tests are Xaravel Tests owned by Container (FR-19), Http (FR-27), Database (FR-55), Log/Context (FR-81), Session and Auth.

#### R-24 — Parallel worktrees will collide on `ESC-<NNNN>` numbers [medium]
- **PRD:** FR-114, NFR-10 (parallel unattended Stories).
- **Spine:** AD-16 (`conformance/escalations/ESC-<NNNN>.md`). This is the same class of merge conflict that ADV-M14 fixed for Expectations.
- **Fix:**
  > Escalation files are named `ESC-<story-id>-<n>.md`. The dashboard assigns display numbers. The Maintainer's decision file mirrors the name.

#### R-25 — AD-13 adapts job-timeout tests without a DIV, which §5.1 and FR-111 forbid [medium, not in Source Amendments]
- **PRD:** §5.1 (adapted only "under a DIV's test-adaptation rule", marked `adapted:<DIV-N>`); FR-111 (no assertion removed unless a Divergence Record allows it); triage RES-G13 ("a pcntl test-adaptation rule").
- **Spine:** AD-13 ("Job-timeout tests adapt to the process-level timeout").
- **Fix:** add to Source Amendments:
  > **DIV-6 (or a new DIV):** pcntl-based behaviour (job timeouts, signals) is reproduced at process level (AD-13); test-adaptation rule: in-process pcntl alarms → supervisor-kill assertions, marked `adapted:DIV-N`.

#### R-26 — FR-20 env precedence relies only on `bunfig.toml`, which is per working directory [medium]
- **PRD:** FR-20 ("Bun's own `.env` auto-loading doesn't change the result").
- **Spine:** the Config and env convention (`env = false` in the Skeleton's and the repo's `bunfig.toml`).
- **What's missing:** `bunfig.toml` is read from the working directory. Running from another directory (process managers, Testbench in a library repo, the production entry) turns autoload back on. Bun then copies `.env`, `.env.local` and `.env.<NODE_ENV>` into `process.env`, and Xaravel can no longer tell real environment variables (which take precedence in Laravel) from file values.
- **Fix:** add to the convention:
  > The `artisan` entry, the production server entry and Testbench pass `--no-env-file` (the `artisan` shebang and Skeleton scripts). At startup, Foundation compares `process.env` with the keys in the env files. If a key from a file is already present with the file's exact value and isn't in the launch environment snapshot (`XARAVEL_ENV_SNAPSHOT`), it fails with an error telling the user to disable Bun autoload. A Xaravel Test runs the CLI from a different working directory.

#### R-27 — How the Test Inventory and Upstream results are produced is unspecified [medium]
- **PRD:** FR-1 (runner list checked against the inventory; datasets; hash; directory mapping); FR-3 (`upstream-skip` "confirmed by the Oracle"); FR-113 (the Upstream assertion count in the inventory); triage RES-G26 and BRF-G9 (deferred to architecture: Oracle PHPUnit run + AST cross-check, `--list-tests-xml`, feature tags).
- **Spine:** AD-15 gives the fields only.
- **Fix:** add to AD-15:
  > The inventory is generated by the Oracle workflow: `phpunit --list-tests-xml` and a JUnit run (Pest `--list-tests` / JUnit for ai/mcp/boost) give the Test IDs, the per-test Upstream status (feeding `upstream-skip`) and the assertion counts. A PHP AST pass (nikic/php-parser in the Oracle image) computes the normalised body+dataset `hash` and the `source` range. `component-map` assigns `component`. A `tags` field (feature tags for `deferred:<item>`) is added. CI fails if the runner list and the AST list differ.

#### R-28 — Trait/mixin mechanics are App Developer API but are deferred to a one-line `PORTING.md` entry [medium]
- **PRD:** FR-26 (traits as mixins running `boot<Trait>`/`initialize<Trait>`); FR-68 (`SoftDeletes`, `Prunable`); FR-90/FR-92 (`Notifiable`, `Authenticatable`); §5.1 priority.
- **Spine:** the Deferred row ("Macroable typing and trait-mixin mechanics … `PORTING.md` idiom table (Phase 0), one line each").
- **What's missing:** `class User extends Model uses SoftDeletes, Notifiable` appears in nearly every app. Its TS shape interacts with AD-7 (Proxy), AD-3 (export paths), AD-4/AD-8 (decorators) and AD-9 (marker brands). It is as load-bearing as AD-8.
- **Fix:** promote it to an AD, for example:
  > **AD-20 Traits:** a trait is a mixin function `SoftDeletes = trait(Base => class extends Base {…})`; a class uses traits via `class User extends uses(Model, SoftDeletes, Notifiable)`. `uses()` records trait names in `Symbol.metadata` so `boot<Trait>`/`initialize<Trait>` and `class_uses_recursive()` work. Macroable classes declare macros via TS module augmentation of the class's interface.

#### R-29 — AD-7 routes Model instance-state properties to attributes, and treats `undefined` field initializers as attribute defaults [medium]
- **PRD:** FR-61 (dirty tracking, `fresh`, `refresh`); RES-G24 ("detect at boot").
- **Spine:** AD-7. Only the configuration names and prototype members bypass the Proxy, so `exists`, `wasRecentlyCreated`, `relations` and `preventsLazyLoading` would hit `getAttribute`. Also, a plain typed field `name: string` (with no `declare`) is emitted under `useDefineForClassFields` as `name = undefined`. That would be captured as an attribute default and written as `NULL` on insert.
- **Fix:** add to AD-7:
  > Own properties the `Model` base constructor defines before returning the Proxy (`exists`, `wasRecentlyCreated`, `attributes`, `original`, `changes`, `relations`, …) are real properties. The `defineProperty` trap ignores `undefined` initializers and, in non-production, logs once per class "use `declare` for column `<name>`". The `Model` base and its traits use no `#private` fields (the Proxy makes `this.#x` throw).

#### R-30 — `Vary` as a no-op for non-htmx requests breaks FR-42's cache separation [medium]
- **PRD:** FR-42 ("so a full page and a Fragment never share a cache entry"); §5.1 (non-htmx behaviour stays exactly Upstream's).
- **Spine:** AD-12 ("every seam is a no-op unless the request is an htmx Request", including the `Vary` middleware).
- **What's missing:** if the full-page response lacks `Vary: HX-Request`, a shared cache stores it under the bare URL and serves it to htmx requests.
- **Fix:** amend AD-12:
  > The `Vary` middleware is the one seam that also acts on non-htmx responses. It applies only on routes that render a Fragment or call an htmx accessor. This is a Xaravel-only addition under FR-42, and an Upstream test asserting exact headers on such a route is adapted.

  Add it to Source Amendments as a §5.1 exception.

#### R-31 — The `Symbol.metadata` polyfill and `@inject` live in packages that force edges Upstream doesn't have [medium]
- **PRD:** FR-10 (dependencies mirror Upstream `require`); AD-2.
- **Spine:** AD-4 (the polyfill is in `@xaravel/support`; the location of `@inject` is not stated). `illuminate/container` doesn't require `illuminate/support`, and Collections (Phase 1) cannot depend on Support (Phase 2).
- **Fix:** add to AD-4:
  > The polyfill and the `@inject` / `primitive` exports live in `@xaravel/contracts` (side-effect module `@xaravel/contracts/metadata`, imported first by every package entry). Contracts stays dependency-free.

#### R-32 — Story review verdicts and FR-111 findings have no storage location [medium]
- **PRD:** FR-111 ("The review verdict and its findings are stored with the Story"); FR-109; the Story done definition.
- **Spine:** silent.
- **Fix:** add to AD-16:
  > Fidelity Review output is committed to `stories/<story-id>/review-<n>.md` with frontmatter `verdict: approved | rejected`, `reviewers: [...]`. CI requires an `approved` verdict newer than the last code commit before merge.

### Low

#### R-33 — RES-G19 (`QUERY` CSRF classification) was dropped silently [low]
- **PRD:** FR-30 (`Route.query`), FR-31/FR-32; triage RES-G19 (deferred to architecture).
- **Fix:** add a Deferred row: "`QUERY` method CSRF classification — Http/Routing Epic: follow Upstream's `VerifyCsrfToken`/`PreventRequestForgery` at the Pin; if Upstream has no rule, raise an Escalation (FR-114)."

#### R-34 — RES-G17: Redis Pub/Sub status is not addressed, and the stated minimum (7.2) is never tested [low]
- **PRD:** FR-59; triage RES-G17.
- **Fix:** add to Stack/CI:
  > CI's Redis service runs 8.10.2; a weekly job runs the redis variants against 7.2. `Redis.subscribe`/`psubscribe` go through `Bun.redis` subscriber connections; if the OQ-11 spike finds gaps, they become `deferred:redis-pubsub`.

#### R-35 — The RES-G28 idioms are only partly listed [low]
- **Fix:** extend the Deferred row: "… real-time facades, dynamic finders, `Uri` normalisation, ParallelTesting, Faker method-name mapping …".

#### R-36 — Redirects for FR-106 and FR-110 to Epics are acceptable but under-specified [low]
- **PRD:** triage RUB-DN8 and ADV-M4 assigned these to architecture.
- **Fix:** keep the Deferred row, and add the constraint the Epic must honour: "read-only queries run in a read-only transaction (`SET TRANSACTION READ ONLY` / SQLite `PRAGMA query_only`), never SQL parsing." Likewise, the `network` backend tag (RES-G22) changes the Protected harness and inventory schema, so the Deferred row should say "through an Escalation → Infrastructure Story", which it partly does.

#### R-37 — The addendum and FR-10 amendments are incomplete [low]
- **PRD:** the addendum API mapping row for DIV-3 (`static inject = [Mailer]`); the addendum layout (`conformance/upstream/`, top-level `docs/`).
- **Fix:** extend Source Amendments:
  > **Addendum:** the DIV-3 mapping row becomes `@inject({ mailer: Mailer }) class … { constructor(private mailer: Mailer) }`; the layout sketch is superseded by the Structural Seed.

#### R-38 — NFR-5 and NFR-6 CI jobs are missing from the CI diagram [low]
- **PRD:** NFR-5 ("CI audits dependencies"; `SECURITY.md`); NFR-6 (benchmark suite, report only).
- **Fix:** the CI node should read "lint, typecheck, Ratchet, protected-paths, async-surface, dep-graph, `bun audit`", plus a non-blocking "bench" job. Add `SECURITY.md` to the seed.

#### R-39 — Engines say `>=1.4`, but only 1.4.3 is tested, and AD-4 relies on behaviour checked on 1.4.3 [low]
- **PRD:** FR-12, FR-15, NFR-1.
- **Fix:** either set `engines.bun >=1.4.3` (with the Installer check matching), or add a CI matrix leg on 1.4.0.

#### R-40 — AD-12's seam list lacks the declaration point for FR-40 rule 1 [low]
- **PRD:** FR-40 ("declared with `.fragment(view, name)` on the route or the Form Request"); rule 2 ("the view the route last rendered").
- **Fix:** add these seams: "`Route` macro `fragment()` and a `FormRequest` mixin `errorFragment`; the last-rendered view name is recorded in the Scope Frame by a View `composing` listener."

#### R-41 — Contracts can't reference concrete types, and parallel edits will contend [low]
- **PRD:** FR-10 (amended).
- **Spine:** AD-1 ("no dependencies"). Upstream contracts reference concrete classes (Request, Response, Collection) in signatures.
- **Fix:** add to AD-1:
  > Contracts reference other framework types only through contracts or structural interfaces defined in `@xaravel/contracts`. A Story that changes a contract lists it in its frontmatter (`contracts:`), and CI fails if two open Story PRs change the same contract file.

#### R-42 — npm trusted publishing needs a bootstrap for new package names, and lockstep publishing of unbuilt packages is undefined [low]
- **PRD:** FR-13, NFR-11.
- **Spine:** AD-18 ("publishes every package"; "No other workflow or credential can publish").
- **Fix:** add to AD-18:
  > A release publishes only packages whose Component has at least one accepted Epic (plus `@xaravel/framework`, which re-exports them). The first publish of a new name is a Maintainer-run placeholder publish, after which trusted publishing is configured.

#### R-43 — Package auto-discovery (Composer `extra.laravel.providers`) is not mapped [low]
- **PRD:** FR-18 (providers), FR-101 (library authors); brief `deps-map.md` (`package.json` `"xaravel": { "providers": [...] }`).
- **Fix:** add to AD-10's boot step: "Foundation reads `xaravel.providers` / `xaravel.aliases` from each installed dependency's `package.json`; `optimize` caches it in `bootstrap/cache/packages.json`."

#### R-44 — "Typed sync-only" callbacks need a stated mechanism [low]
- **PRD:** DIV-1 ("passing an async callback is a type error").
- **Spine:** AD-6. TS accepts `() => Promise<void>` where `() => void` is expected, and `map(async …)` type-checks.
- **Fix:** "Sync-callback parameters use `@xaravel/contracts`' `SyncFn<A, R> = (...a: A) => R extends PromiseLike<unknown> ? never : R`; `no-misused-promises` (`checksVoidReturn`) covers `void` callbacks."

#### R-45 — Two directories are both called `decisions` [low]
- **Spine:** Seed `conformance/decisions/` (Escalation rulings) and root `decisions/` (Divergence Records).
- **Fix:** rename the root one to `divergences/`, or rename the Escalation rulings to `conformance/rulings/`.

---

## (c) Quiet requirements checked and found consistent

- **NFR-1 OS matrix:** the CI diagram has linux/macos × x64/arm64. Consider adding it to AD-18's rule text so it isn't only in a diagram.
- **FR-8 ordering:** `PORTING.md` and the Divergence Records come before Phase 1, and Source Amendments requires the PRD and DIV updates before the dependent Stories. Consistent.
- **FR-1 component mapping:** this is a Phase 0 deliverable, and `conformance/component-map` is Protected. Consistent.
- **FR-9 and NFR-10 per-worktree isolation:** AD-17. Consistent.
- **FR-13 and NFR-11 lockstep and CI-only release:** AD-18. Consistent, apart from R-42.
- **FR-12 engines:** Stack. Consistent, apart from R-39.
- **NFR-3 lint:** AD-6. Rule names match the PRD.
- **OQ-5 and OQ-11 (MCP SDK):** answered and listed in Source Amendments.
