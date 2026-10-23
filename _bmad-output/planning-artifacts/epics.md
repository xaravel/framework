---
status: final
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-xaravel-2026-10-15/prd.md
  - _bmad-output/planning-artifacts/prds/prd-xaravel-2026-10-15/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md
  - _bmad-output/specs/spec-xaravel/SPEC.md
  - _bmad-output/specs/spec-xaravel/capability-map.md
  - _bmad-output/planning-artifacts/briefs/brief-xaravel-2026-10-15/addendum.md
---

# xaravel - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for xaravel, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

Requirement IDs (FR-N, NFR-N, DIV-N, AD-N, OQ-N, NG-N, SM-N) are the PRD's and the architecture spine's own IDs, kept unchanged for traceability. Terms (Test ID, Ported Test, Xaravel Test, Skip Reason, Escalation, Protected Path, Scope Frame, …) are used exactly as defined in PRD §3. Entries marked **[post-alpha]** are Phase 9 work (PRD §7.2).

## Requirements Inventory

### Functional Requirements

**Global rules (PRD §4), applying to every FR:**

- **Upstream Components:** before a Component's last Epic is accepted, every Test ID × Backend Variant passes or carries a valid Skip Reason other than `not-ported-yet`. A slice Epic is accepted against its Stories' assigned Test IDs.
- **`blocked-by:<component>` entries:** each is cleared by a re-verification Story in the Phase that delivers that Component. A Phase isn't complete while any `blocked-by` points at it.
- **Xaravel Components:** every testable FR consequence maps to at least one passing Xaravel Test before the Epic is accepted (FR-115).
- **Story done definition (PRD §3):**
  - every assigned Test ID × Variant passes or has a valid non-`not-ported-yet` Skip Reason;
  - every assigned Xaravel Test passes;
  - the Fidelity Review has approved it;
  - it has no open Escalations;
  - CI is green, including a full (not fast-mode) run of its assigned tests and the NFR-3 lint.

  A Story with no assigned tests can't be done.

#### Conformance System and agent guardrails (Phase 0)

- **FR-1 Test Inventory generation:** the Maintainer generates the Test Inventory for any Baseline Pin, covering `laravel/framework`, `laravel/ai`, `laravel/mcp` and `laravel/boost`.
  - One Test ID per Upstream test case, with each data-provider or `#[TestWith]` dataset counted separately.
  - Regeneration is byte-identical.
  - Each entry is tagged with its Component, unit or integration, and its backend (SQLite, Postgres, MySQL, MariaDB, SQL Server, Redis, none).
  - Each entry records a normalised hash of its body and datasets, and its Upstream assertion count.
  - CI checks that the ID list matches the Oracle runner's listing (`phpunit --list-tests` / JUnit, and Pest's equivalent).
  - Component tags come from a directory→Component mapping that the Maintainer signs off, on a Protected Path.
- **FR-2 Ported Test traceability:** every Ported Test declares exactly one Test ID. CI fails a Ported Test whose Test ID is missing, unknown or shared with another. Xaravel Tests are labelled as such and never counted in the Conformance Rate.
- **FR-3 Expectations File and Skip Reasons:** exactly one status (`pass` / `fail-known` / `skip` / `quarantined`) per Test ID × Backend Variant.
  - A `skip` needs a Skip Reason from the vocabulary.
  - CI checks each reason's rule:
    - `blocked-by` names a later-Phase Component;
    - `intentional-divergence` names an existing Divergence Record;
    - `php-only` references an approved Escalation;
    - `upstream-skip` is confirmed by the Oracle;
    - `deferred` names a §7.2 post-alpha item;
    - `out-of-scope` names an NG-ID.
  - `quarantined` requires an open Escalation.
  - Reason precedence: `upstream-skip` → `intentional-divergence` → `blocked-by` → `not-ported-yet` → `php-only` / `deferred` / `out-of-scope`.
  - `fail-known` blocks Epic acceptance and is counted separately.
- **FR-4 Ratchet:** CI fails on any unexpected failure or unexpected pass.
  - A Story may change Expectations entries only for its own Test IDs.
  - Moving an entry from `pass` to anything else requires an approved Escalation.
- **FR-5 Conformance dashboard:** a public page, updated on every push to the default branch. It shows:
  - the Conformance Rate per Component and overall, always over the full Test ID × Variant denominator;
  - the SM-1 alpha-gate figure beside it;
  - counts per Skip Reason;
  - DIV links to their Divergence Records;
  - open Escalations and Quarantined tests;
  - history across commits, with Baseline Pin change markers.
- **FR-6 Differential Tests against the Oracle:** the containerised Oracle (no local PHP needed) generates expected values for input→output tests: Str, the SQL grammars, Blade rendered HTML, validation messages and date formatting. Generating twice for the same Pin gives identical output. Generator output is not Oracle-generated (FR-71).
- **FR-7 Baseline Pin bump:** at a Phase freeze point, a tool diffs two Pins into added, changed and removed Test IDs, using the body and dataset hash.
  - Added and changed IDs become backlog Stories, and removed IDs are retired.
  - A changed ID resets to `not-ported-yet`, linked to its previous Ported Test.
  - A renamed ID (same hash) keeps its status and history.
  - Freeze points: no new Epics start; in-flight Epics finish or pause. The Pin changes only at a freeze point.
- **FR-8 Porting rules before implementation:** `PORTING.md` holds the idiom table, the test-adaptation rules and the mechanical PHP→TS expression rule, including for Blade inputs. The Divergence Records DIV-1..DIV-12 state their adaptation rules as numbered clauses. Both are merged before any Phase 1 Story starts. `PORTING.md` is piloted in Phase 0 on a Support and Collections sample and revised from the pilot.
- **FR-9 Agent-operable harness:**
  - Fast mode runs a sample chosen from a printed seed, so the same seed gives the same sample.
  - A filter selects by Component or Test ID.
  - Output is short and greppable, one line per failing Test ID.
  - Locally, tests whose backend isn't running are reported as "not run", are never failures and are never recorded.
  - CI runs SQLite, Postgres and Redis services, and every alpha Variant must actually run.
- **FR-111 Fidelity Review:** at least two reviewer agents, separate from the implementer, compare each Ported Test with its Upstream source.
  - They check that assertions match, no expected value is weakened, no assertion is removed without a DIV, and every new Skip Reason is justified.
  - The verdict and findings are stored with the Story, and a rejection returns to the implementer.
  - Reviewers reject any change that stubs, fakes or partly implements another Component.
- **FR-112 Protected Paths:** a Story's change can't alter the grader. Protected:
  - the harness and the Ratchet;
  - the Test Inventory and the Skip Reason vocabulary;
  - the matchers and `@xaravel/mockery`;
  - Oracle fixtures;
  - `PORTING.md` and the Divergence Records;
  - CI configuration;
  - `@xaravel/contracts`, after Phase 1.

  CI fails any Story change that touches them. They change only through Maintainer-approved Infrastructure Stories, in Phase 0 or after an approved Escalation.
- **FR-113 Assertion floor:** a Ported Test with zero assertions fails. Its assertion count must be at least the Upstream count recorded in the Inventory, unless a DIV allows fewer. The harness reports both counts.
- **FR-114 Escalation and stop rules:** an agent stops on a Test ID and raises an Escalation when:
  - a new or changed DIV is needed;
  - a Protected Path would need to change;
  - an Upstream test looks wrong but the Oracle passes it;
  - a test is inconsistent across 3 runs (it is Quarantined);
  - `php-only` is proposed;
  - a §9 open question blocks the work;
  - a Contract is missing or different after Phase 1.

  An Escalation records the Test IDs, the evidence and the proposed decision, and shows on the dashboard. The agent continues with its other IDs. Open Escalations block Epic acceptance. The Maintainer's decision is recorded, and becomes a DIV or a Protected Path change where applicable.
- **FR-115 Acceptance for Xaravel Components:** Stories list Xaravel Test IDs (`XT-<component>-<n>`), and each Xaravel Test declares the FR consequence it verifies. The Epic is accepted only when every testable consequence is covered by a passing Xaravel Test. Fidelity Review checks each test verifies what it claims.
- **FR-116 PHPUnit-style matchers:** delivered in Phase 0 with `@xaravel/mockery`.
  - They cover every PHPUnit assertion used Upstream at the Pin. A scan lists them, and CI reports any that aren't covered.
  - `assertSame` follows PHP `===`, including key order and types. `assertEquals` follows PHP `==`.
  - `expectException` ends the test at the throw.
  - `createMock` returns a PHPUnit test double (`MockObject`), as PHPUnit does (Story 4.7); Mockery is reached through `Mockery.mock()`.
  - Each rule has its own Xaravel Tests.

#### Packages, runtime and distribution

- **FR-10 Split packages:** each Component publishes as `@xaravel/<component>`. Dependencies mirror Upstream's `composer.json` `require` lists, plus `@xaravel/contracts` and `@xaravel/runtime`. `@xaravel/collections` and `@xaravel/support` each install and work standalone.
- **FR-11 Framework meta-package:** `@xaravel/framework` installs every Component, and the Skeleton depends on it.
- **FR-12 Bun-only runtime:** every Package declares `engines.bun >= 1.4`. CI runs on Bun only. No Node.js compatibility is promised or tested.
- **FR-13 0.x versioning:** all Packages release together under one 0.x version. Release notes state the Baseline Pin. A 0.x release ships when each Phase completes (all its Epics accepted, and no `blocked-by` pointing at it).
- **FR-14 Monorepo:** `github.com/xaravel/framework`, as Bun workspaces with one per Package. Everything publishes under the `@xaravel` scope, except the Installer, which publishes as `create-xaravel`.

#### Skeleton and Installer

- **FR-15 Installer:** `bun create xaravel <name>` offers SQLite (the default) or Postgres. It installs dependencies, generates `APP_KEY`, initialises git and prints the next steps. On Bun older than 1.4 it exits non-zero and prints the upgrade command.
- **FR-16 Laravel-shaped Skeleton:**
  - Directories: `app/Http/Controllers`, `app/Models`, `app/Providers`, `bootstrap/app.ts`, `config/*.ts`, `database/{migrations,factories,seeders}`, `resources/views`, `routes/{web,console}.ts`, `storage/`, `tests/`.
  - `.env.example` uses Laravel's key names: `APP_*`, `DB_*`, `CACHE_STORE`, `QUEUE_CONNECTION`, `SESSION_DRIVER`, `MAIL_*`, `REDIS_*`, `LOG_CHANNEL`.
- **FR-17 htmx-ready Skeleton:**
  - The base layout loads htmx 4 and sends the CSRF token on every htmx Request.
  - The welcome page has one working Fragment example.
  - htmx auth pages (login, register, password reset) and an authenticated dashboard are delivered with Auth in Phase 8 (OQ-10).

#### Application Foundation and Container

- **FR-18 Application lifecycle:** `bootstrap/app.ts` uses the fluent `withRouting`, `withMiddleware`, `withExceptions` and `withProviders`. Providers `register`, then `boot`, in Laravel's order. (Foundation)
- **FR-19 Service container:** `bind`, `singleton`, `scoped`, `instance`, contextual binding (`when().needs().give()`), tagging, `extend`, and `make` with parameters. Dependencies are autowired through `inject` tokens (DIV-3). `scoped` bindings are isolated per request, even when requests run concurrently. (Container)
- **FR-20 Configuration and environment:** `config()` reads `config/*.ts`, and `env()` reads the environment.
  - `.env` parsing follows phpdotenv's grammar: quoting, interpolation, multiline values and `export`.
  - Which file loads (including `.env.<APP_ENV>`) and real-env precedence match Laravel. Bun's own `.env` auto-loading doesn't change the result.
  - `config:cache` round-trips the same values.
- **FR-21 Facades and global helpers:** Laravel's names, for example `Route`, `DB`, `Cache`, `Log`, `Storage`, and `app`, `config`, `collect`, `now`, `str`, `data_get`, `tap`, `value`, `retry`, `abort`, `redirect`, `view`, `route`, `url`.
  - A facade resolves its instance for the current unit of work.
  - `Facade.fake()` / `swap()` work wherever Laravel supports them.
- **FR-22 Class Registry:** class-name strings resolve through the Registry, for morph maps, queue payloads and config.
  - An unregistered name throws an error that names the class.
  - Models, jobs, events, listeners, notifications, mailables and policies register automatically when their module loads.

#### Support and Collections

- **FR-23 Collections:** `Collection` and `LazyCollection` have every Laravel 13 method.
  - Key order is preserved, including integer-like keys.
  - Integer-like string keys are normalised as PHP does.
  - List versus associative behaviour (`values()`, `filter()` keeping keys, `json_encode` shape) matches the Oracle.
- **FR-24 Strings, arrays and helpers:** `Str`, `Stringable`, `Arr`, `Fluent`, `Number`, `Uri`, `Benchmark`, `Sleep`, `Lottery`, `Once` and `Pipeline`, with Laravel 13 behaviour.
  - Pluralization follows Doctrine Inflector's English rules.
  - `Str.ascii` / `slug` transliteration matches the Oracle.
  - `Str.markdown` / `inlineMarkdown` honour `html_input` and `allow_unsafe_links`, verified with XSS payloads.
- **FR-25 Dates:** a Carbon-equivalent API: `now()`, `Date`, PHP `date()` format strings, `diffForHumans`, `startOf*` / `endOf*`, and `setTestNow` / `travelTo`. Formatting and parsing Differential Tests match the Oracle. The test clock resets after every test.
- **FR-26 Macros, conditionables, traits:** `macro()` works on every Macroable class, and `when()` / `unless()` on every Conditionable one. Traits compose as mixins and run `boot<Trait>` / `initialize<Trait>` as Laravel does. (Macroable, Conditionable, Reflection)

#### HTTP layer

- **FR-27 HTTP kernel on Bun:** `bun artisan serve` in development and a production entry point, both on `Bun.serve`. No third-party HTTP framework appears in any dependencies. Concurrent requests never see each other's request, session, auth or scoped state.
- **FR-28 Requests:** `input`, `query`, `all`, `only`, `except`, `has`, `filled`, `boolean`, `date`, `file`, `json`, `ip`, `header`, `bearerToken`, `isMethod`, `routeIs`, `expectsJson`, and trusted proxies.
  - Input is sync in controllers and in every middleware except the header-only `BeforeBody` middleware.
  - The body loads once.
  - `ValidatePostSize` rejects an oversized body before it is buffered.
  - Uploads are `UploadedFile`, with `store()` / `storeAs()`.
- **FR-29 Responses:** views, strings, arrays, models as JSON, `response()` builders, redirects (`to`, `route`, `back`, `with`), downloads, file responses and streamed responses, plus cookies and headers.
- **FR-30 Routing:**
  - Verbs `get` / `post` / `put` / `patch` / `delete` / `options` / `any` / `match`, plus `Route.query`.
  - Required and optional parameters, and regex constraints.
  - Named routes, groups, prefixes, subdomains and resource controllers.
  - Implicit and explicit model binding, scoped bindings, `fallback`, and `route:cache`.
  - An htmx `hx-query` request reaches a `Route.query` handler.
- **FR-31 Middleware:** global, group and route middleware, with aliases, priority, parameters and terminable middleware. These built-ins behave as Upstream does:
  - `TrimStrings`, `ConvertEmptyStringsToNull`;
  - `HandleCors`, `TrustProxies`, `ValidatePostSize`;
  - `ThrottleRequests`;
  - `EncryptCookies`, `AddQueuedCookiesToResponse`, `StartSession`, `ShareErrorsFromSession`;
  - `SubstituteBindings`, `ValidateSignature`;
  - `PreventRequestsDuringMaintenance`, `PreventRequestForgery`.
- **FR-32 CSRF protection:**
  - A request without a valid token gets 419.
  - The token is accepted from `_token`, `X-CSRF-TOKEN` or `X-XSRF-TOKEN`.
  - `@csrf` and `csrf_token()` are available.
  - An htmx Request carrying the token through inherited `hx-headers` passes.
- **FR-33 Sessions and cookies:** the `file`, `cookie`, `database`, `redis` and `array` drivers, flash data, `regenerate` / `invalidate`, and encrypted cookies.
- **FR-34 URL generation:** `route()`, `url()`, `asset()`, `action()`, signed and temporary signed URLs. A tampered signed URL gets 403 from `ValidateSignature`.
- **FR-35 Errors and logging:** reporting and rendering are customised in `withExceptions`. Log channels: `single`, `daily`, `stack`, `stderr`, `syslog`, `null` and custom.
  - In `local`, an unhandled exception renders a debug page; in `production`, a generic page.
  - JSON requests get JSON errors.
  - htmx Requests get an HTML error Fragment with the correct status.
- **FR-36 Rate limiting:** `RateLimiter.for()` and the `throttle` middleware. A throttled request gets 429 with `Retry-After`.

#### htmx 4 Integration (Xaravel Component; Xaravel Tests only)

- **FR-37 htmx Request detection:** `request.htmx()`, `isBoosted()`, `requestType()`, `currentUrl()`, `isHistoryRestore()`, `source()` and `target()`, read from the `HX-*` headers.
  - The booleans are `false` when the header is missing.
  - `requestType()` returns `full` or `partial`.
  - `target()` parses htmx 4's `tag#id` format.
  - `expectsJson()` is false for an htmx Request.
- **FR-38 htmx response helpers:** fluent setters for `HX-Trigger`, `HX-Location`, `HX-Redirect`, `HX-Refresh`, `HX-Retarget`, `HX-Reswap`, `HX-Reselect`, `HX-Push-Url` and `HX-Replace-Url`. An `HX-Trigger` payload serialises as JSON that htmx 4 accepts. There are no helpers for headers htmx 4 removed.
- **FR-39 Fragment responses:** `view(...).fragment('row')` sends only that Fragment's HTML. Several Fragments, wrapped in `<hx-partial>` or marked out-of-band, can go in one response.
- **FR-40 Validation failure on htmx Requests:** the form Fragment is re-rendered with errors, old input and 422.
  - The Fragment is chosen in this order: the one declared with `.fragment(view, name)` on the route or Form Request; then a Fragment matching the `HX-Target` id in the last-rendered view; then a 422 `validation-errors` Fragment.
  - A non-htmx request keeps Laravel's redirect-back with errors and old input.
- **FR-41 Redirects on htmx Requests:** the same controller code returns a 302 to a non-htmx request, and a 200 with `HX-Location` to an htmx Request. `.hxRedirect()` opts in to `HX-Redirect`. Flash data and `with()` survive both paths.
- **FR-42 Full versus partial rendering:**
  - Boosted and history-restore requests get the full layout.
  - A partial request gets the named Fragment, or the layout's `content` region if it names none.
  - `Vary: HX-Request, HX-Request-Type` is sent on every response through the view or response seams. This is the only effect on non-htmx requests.
- **FR-43 Streaming:** SSE, `multipart/mixed` and WebSocket upgrades through `Bun.serve`.
  - Each server-sent event reaches the client when it is written.
  - Each multipart part is flushed when it is written.
  - A WebSocket upgrade returns 101 and hands the socket to the route's handler.

#### Blade (View)

- **FR-44 Directives:** every Blade directive in Upstream at the Pin:
  - control flow and `$loop`;
  - includes, `@each`, layouts, sections, stacks, `@once`;
  - `@env`, `@auth`, `@can`;
  - `@error`, `@csrf`, `@method`, `@checked` and the like, `@class`, `@style`;
  - `@json`, `@js`, `@verbatim`, and TypeScript `@php`-equivalent blocks;
  - `@vite`, `@fragment`;
  - `Blade.directive()`.
- **FR-45 Blade components:** anonymous and class-based. `<x-name>` with `$attributes` merging, `@props`, `@aware`, default and named slots, and dynamic components.
- **FR-46 Escaping:** `{{ }}` is HTML-escaped and `{!! !!}` is raw, exactly as Laravel. An XSS-payload Xaravel suite matches the Oracle's output; it is not counted in the Conformance Rate.
- **FR-47 Async rendering and caching:** rendering returns a Promise, and components may await data. Reading an unloaded relation during rendering throws (Strict Loading). `view:cache` precompiles all templates.
- **FR-48 Blade test adaptation:** every Upstream template input is kept, with PHP expressions translated by `PORTING.md`'s mechanical rule.
  - Assertions on generated PHP become Oracle Differential Tests on rendered HTML, and only those count toward conformance.
  - JS snapshot tests are Xaravel Tests only.
- **FR-49 Vite integration:** `@vite` emits manifest tags in production and points at the dev server in development. A per-request CSP nonce (`Vite.useCspNonce()`, `csp_nonce()`, `@nonce`) is applied to Vite's tags, the htmx script tag and htmx 4's inline config, so a page under a strict CSP still runs htmx.

#### Validation

- **FR-50 Validator:** every Laravel 13 rule, rule objects, closure rules, conditional rules, nested and `*` rules, custom messages and attributes, and translated messages.
  - Default messages match the Oracle.
  - `regex` / `not_regex` take a JS `RegExp` (DIV-10).
  - `email:spoof` is `deferred:email-spoof`.
- **FR-51 Form Requests:** `authorize`, `rules`, `messages`, `prepareForValidation`, and `request.validate()`.
- **FR-52 Async rules:** IO rules (`exists`, `unique`, closures that query) are awaited. `validateSync()` throws when the rule set contains an IO rule.

#### Database

- **FR-53 Connections:** configured with Laravel's `.env` keys. SQLite (`bun:sqlite`) and Postgres (`Bun.sql`) at the alpha; MySQL, MariaDB and SQL Server later. Read/write splitting and multiple named connections work.
- **FR-54 Query builder and grammars:** the full query builder API.
  - Building and `toSql()` are sync.
  - IO Terminals return Promises, and builders are awaitable.
  - SQL matches the Oracle for all five grammars: sqlite, pgsql, mysql, mariadb, sqlsrv.
- **FR-55 Transactions:** `DB.transaction(async () => …)`, nested savepoints, `afterCommit` and pessimistic locks. Queries inside a callback use that transaction's connection, even under concurrency.
- **FR-56 Migrations and schema:** the Schema builder, and `migrate`, `migrate:rollback`, `migrate:fresh`, `migrate:refresh`, `migrate:status` and `schema:dump`.
- **FR-57 Seeding:** `db:seed` and `migrate --seed`.
- **FR-58 Pagination:** `paginate`, `simplePaginate` and `cursorPaginate`, with Blade pagination views and JSON serialization.
- **FR-59 Redis:** through `Bun.redis`. No Cluster or Sentinel at the alpha.
- **FR-60 Same code on SQLite and Postgres:** switching needs only `.env` changes. The Skeleton's test suite passes on both in CI.

#### Eloquent

- **FR-61 Models:** conventions for table name, primary key and timestamps; `fillable` / `guarded`; dirty tracking; `replicate`, `fresh`, `refresh`; attributes read as properties.
- **FR-62 Relationships:** `hasOne`, `hasMany`, `belongsTo`, `belongsToMany` with pivots, `hasOneThrough`, `hasManyThrough`, the polymorphic types, `morphToMany` and `ofMany`.
  - Eager loading: `with()`, `load()`, `loadMissing()`, `withCount()` and the other `with*` aggregates.
  - Eloquent Collection methods; the IO ones return Promises.
- **FR-63 Strict Loading by default:**
  - Reading an unloaded relation throws `LazyLoadingViolationException`.
  - `await model.related('posts')` loads it if missing, and `related()` is the relation builder. There is no `relation()` and no callable `model.posts()`.
  - With `automaticallyEagerLoadRelationships()` on, an unchained await on a model from a collection eager-loads the relation for the whole collection in one query. A sync read of an unloaded relation still throws.
- **FR-64 Casts, accessors and mutators:** `Attribute` accessors and mutators; built-in casts (date, datetime, json, array, collection, encrypted, enum, hashed, AsStringable, …); custom casts.
- **FR-65 Model events and observers:** run sequentially in registration order and are awaited. `saving` returning `false` cancels the save.
- **FR-66 Serialization and API resources:** `toArray`, `toJson` (a string) and `jsonSerialize`, honouring `hidden`, `visible` and `appends`. `toJSON()` delegates to `jsonSerialize()`. `JsonResource` and `ResourceCollection` produce Laravel's shape.
- **FR-67 Factories:** states, sequences, `has` / `for`, `recycle`, and `@faker-js/faker`.
- **FR-68 Scopes, soft deletes and pruning:** local and global scopes, `SoftDeletes`, `Prunable` / `MassPrunable`, and a morph map backed by the Class Registry.

#### Console

- **FR-69 Commands:** Laravel's signature syntax, arguments, options, output styles, tables and progress bars, run with `bun artisan <command>`.
- **FR-70 Prompts:** `text`, `password`, `confirm`, `select`, `multiselect`, `suggest`, `search`, `pause`, `spin`, `table` and `form`, with laravel/prompts behaviour. Testable with `expectsQuestion` / `expectsChoice`.
- **FR-71 Generators:** every `make:*` and stub-backed command at the Pin, plus the `cache:table`, `session:table`, `queue:table`, `queue:failed-table`, `queue:batches-table` and `notifications:table` migration generators.
  - `stub:publish` lets App Developers customise every stub.
  - Each generator's Ported Test asserts against a reviewed TypeScript reference file, one per Upstream stub.
  - Generated files compile under `tsc --strict`.
- **FR-72 Task scheduling:** schedules in `routes/console.ts`, using the frequency API, `withoutOverlapping`, `onOneServer` and `runInBackground`. Run with `schedule:run` / `schedule:work`.
- **FR-73 REPL:** `bun artisan tinker` boots the app, so facades, helpers, models and `config()` are available. Promise results are awaited before printing. It has no Upstream Test IDs and is verified by Xaravel Tests.

#### Infrastructure services

- **FR-74 Cache:** the `array`, `file`, `database` and `redis` stores, with `remember`, `flexible`, tags, atomic locks, `increment` / `decrement` and the `memo` driver.
- **FR-75 Events:** listeners, subscribers, queued listeners and `Event.fake()`. Listeners are discovered from `app/Listeners` without runtime reflection (DIV-7).
- **FR-76 File storage:** the `local`, `public` and `s3` (`Bun.S3Client`) disks, with streaming, upload, temporary URLs, visibility and `Storage.fake()`.
- **FR-77 Encryption:** `Crypt` with `APP_KEY`, AES-256-CBC and GCM, and `APP_PREVIOUS_KEYS` rotation, plus a PHP `serialize()` codec. Payloads interoperate with PHP Laravel in both directions, including encrypted cookies and sessions.
- **FR-78 Hashing:** bcrypt and argon2id, and `needsRehash`. PHP `$2y$` hashes verify. Passwords longer than 72 bytes behave exactly as in PHP, proven by Differential Tests (OQ-8).
- **FR-79 HTTP client:** `Http` with retries, timeouts, `pool`, macros, middleware, `Http.fake()` and stray-request prevention.
- **FR-80 Processes:** `Process` run sync or async, with pools, pipes and timeouts, through `Bun.spawn`, plus `Process.fake()`.
- **FR-81 Context:** request-scoped data is added to log entries and carried into queued jobs. It is isolated per request.
- **FR-82 Concurrency:** `Concurrency.run()`, under DIV-4's closure rules.
- **FR-83 Localization:** language files, `__()`, `trans()`, `trans_choice()`, pluralization and JSON translation files.
- **FR-84 Image and JSON Schema:** Laravel 13's Image API through `Bun.Image`, and the JsonSchema builder.

#### Queues and Bus

- **FR-85 Jobs:** delays, retries, backoff, timeouts, `failed()` handlers and a failed-jobs table. The `sync`, `database` and `redis` drivers ship at the alpha; SQS and Beanstalkd later.
- **FR-86 Workers:** `queue:work` / `queue:listen` with `--queue`, `--tries`, `--max-jobs` and `--max-time`, graceful SIGTERM, `queue:restart` and `queue:retry`.
- **FR-87 Chains, batches and job middleware:** `Bus.chain`, `Bus.batch` (progress and callbacks), job middleware, unique jobs, rate-limited jobs, and `Queue.fake()` / `Bus.fake()`.
- **FR-88 Dispatching closures:** closures take explicit, serializable arguments.
  - The payload carries the source and arguments, signed with `APP_KEY`, and a worker rejects an invalid signature.
  - A closure that captures outer variables fails at dispatch with an explanatory error.
  - On the worker, the closure sees only its arguments, JS built-ins and Laravel's facades and helpers. Classes and models are restored through the Class Registry.

#### Mail, Notifications, Broadcasting

- **FR-89 Mail:** Mailables from Blade or Markdown, CSS inlining, attachments, queued sending and `Mail.fake()`.
  - The `smtp`, `log`, `array` and `failover` transports ship at the alpha.
  - Markdown mail HTML matches the Oracle, using `Bun.markdown` or a CommonMark library.
- **FR-90 Notifications:** the `mail`, `database` and `broadcast` channels, on-demand and queued, and `Notification.fake()`.
- **FR-91 Broadcasting:** channels with authorization callbacks; the `log`, `null` and Pusher-protocol drivers. No WebSocket server.

#### Auth

- **FR-92 Authentication:** session guards; the `eloquent` and `database` providers; `attempt`, `login`, `logout` and remember-me; the `auth` / `guest` middleware; password confirmation.
- **FR-93 Authorization:** gates and policies; `Gate`, `can()`, `@can` and the `can` middleware; `Response.deny()` with messages. Policies resolve by naming convention or explicit registration.
- **FR-94 Password reset:** the password broker, with tokens, throttling, reset notifications and expiry.
- **FR-95 Email verification:** `MustVerifyEmail`, signed verification URLs and the `verified` middleware.

#### Testing toolkit

- **FR-96 HTTP tests:** Pest-style `uses(TestCase, RefreshDatabase)` and `test(name, async function () {…})`, with `this` bound to the TestCase.
  - Test calls return thenable responses with chainable TestResponse assertions.
  - `make:test` emits this form.
  - The htmx assertions `assertHxTrigger`, `assertFragment` and `assertHxLocation` are included.
- **FR-97 Console tests:** `this.artisan()` with `expectsQuestion`, `expectsOutput` and `assertExitCode`.
- **FR-98 Database testing:** `RefreshDatabase`, `DatabaseTransactions`, factories, `assertDatabaseHas` / `Missing` / `Count` and `assertModelExists`.
- **FR-99 Fakes and time:** fakes for Bus, Event, Mail, Notification, Queue, Storage, Http, Process and Exceptions, plus `travel`, `travelTo` and `freezeTime`.
- **FR-100 Mocking library:** `@xaravel/mockery`, Mockery-compatible, delivered in Phase 0. Unmet expectations fail the test when it finishes. It covers every Mockery API used Upstream, per the FR-116 scan.
- **FR-101 Testbench:** a bootable app for library authors and the framework's integration tests. It has equivalents of `WithConfig`, `WithMigration`, `RequiresDatabase` and `WithEnv`, plus a default `users` migration and `UserFactory`.
- **FR-102 [post-alpha] Browser tests:** a Pest 4-style API on Playwright. Runs headless in CI, and can assert after an htmx swap settles.

#### AI, MCP and Boost

- **FR-103 [post-alpha] AI SDK:** Agents with tools, structured output, streaming, embeddings, reranking, images and audio, failover, and `AI.fake()`, on the Vercel `ai` SDK. Conversation memory can live in database tables.
- **FR-104 MCP servers:** Tools, Resources and Prompts, served over HTTP on a route (`Mcp.web()`) or over stdio (`Mcp.local()`). HTTP servers can be protected by a Xaravel auth guard.
- **FR-105 Boost installation:** `bun artisan boost:install` registers Boost with coding agents and writes versioned guidelines (`CLAUDE.md` / `AGENTS.md`) and skills. The Skeleton offers to run it during install.
- **FR-106 App introspection tools:**
  - app info, routes (with Fragment-returning routes marked), container bindings and config keys;
  - database connections and schema, plus read-only queries once enabled;
  - log entries, the last error and browser logs;
  - absolute URL generation;
  - the CLI commands, with their signatures.
- **FR-107 Test-run tool:** runs all or filtered tests and returns structured failures: name, assertion, expected, actual and location.
- **FR-108 [post-alpha] Documentation search:** an offline index for the installed version.
- **FR-109 Framework mode:** delivered in Phase 0, on the MCP TypeScript SDK directly. It serves the Test Inventory and statuses, the Conformance Rate per Component, Story Test IDs, Divergence Records and open Escalations. It is read-only, and can't change Expectations or any Protected Path.
- **FR-110 Safe by default:** Boost tools are read-only by default. Query, eval and write tools need explicit enabling, and are refused when `APP_ENV=production`.

### NonFunctional Requirements

- **NFR-1 Runtime and language:** Bun ≥ 1.4 (CI pins 1.4.3), TypeScript `strict`, ESM only. macOS and Linux on x64 and arm64 at the alpha, with CI on both. Windows is best-effort after the alpha.
- **NFR-2 Dependency policy:** prefer a Bun built-in, then a maintained npm package that works on Bun, then our own code. Each third-party dependency is recorded with its reason in the owning Package's README. Each ported PHP library has exactly one owning Package (AD-22).
- **NFR-3 Async safety:** type-aware lint (`no-floating-promises` with `checkThenables`, `await-thenable`, `no-misused-promises` with `checksVoidReturn`) runs in CI over the framework, the Ported Tests, the Skeleton and the compiled-view snapshots.
- **NFR-4 Request isolation:** under concurrent load, no request, session, auth, transaction, Context or scoped-container state crosses units. A dedicated concurrency test per listed service interleaves two units at every `await`.
- **NFR-5 Security:**
  - CSRF, escaping, encryption, signed URLs and signed queue payloads behave as in Laravel, with interop Differential Tests.
  - `SECURITY.md` sets out a disclosure process.
  - `bun audit` runs on every PR.
  - No secrets are committed.
- **NFR-6 Performance:** correctness first. The benchmark suite runs nightly for information only, and never gates before the alpha.
- **NFR-7 Determinism:** Ported Tests and Xaravel Tests are deterministic and need no network unless backend-tagged. The clock, fakes, mocks, `Str` factories and the `Sleep`, `Once` and `Lottery` state reset after each test, each reset proven by a Xaravel Test.
- **NFR-8 Licence and trademark:**
  - MIT, keeping Laravel's copyright notice beside Xaravel's in the root and every package `LICENSE`.
  - Described as "a TypeScript port of Laravel", with a non-affiliation notice in the README, docs and npm descriptions.
  - No Laravel logo, no domain containing "Laravel", and non-commercial.
- **NFR-9 Documentation:** each Component's docs mirror its Laravel 13 doc page, with a "Divergences" section citing DIV IDs. Text adapted from `laravel/docs` keeps its notice. Every public API a Story adds has docblocks before the Story is done. User docs for every Phase 1–8 Component are an alpha requirement.
- **NFR-10 Agent operability:** every Story runs unattended in its own git worktree, with machine-readable Test IDs, commands and acceptance check. A human is needed only for Epic review, Escalations and Infrastructure Stories that touch Protected Paths.
- **NFR-11 Release authority:** only the Maintainer holds publish rights. Releases go out from CI with npm provenance, from a Maintainer-approved tag. Framework Agents never hold publish credentials.

### Additional Requirements

**Starter template: none.** The monorepo is greenfield. The first Story of the first Epic is the Phase 0 Infrastructure Story that scaffolds the monorepo and every package (AD-2, AD-27). It sets up:
- the Bun workspaces and the root `package.json`, with the lockstep version;
- the Protected `tsconfig.base.json`, with no `experimentalDecorators`;
- per-package `package.json` and generated `tsconfig.json` files, plus `src/` and `tests/`;
- root project references;
- the root `bunfig.toml` with `env = false`;
- `.bun-version` set to 1.4.3, and `.oxlintrc.json`;
- `LICENSE`, `SECURITY.md` and `CODEOWNERS`.

**Stack pins (spine "Stack"):**

| Component | Version |
| --- | --- |
| Bun | 1.4.3 |
| TypeScript | 7.0.2 |
| oxlint | 1.88.0 |
| oxlint-tsgolint | 7.0.2004 |
| npm (release job) | ≥ 11.5.1 |
| `@modelcontextprotocol/server` | 2.3.1 |
| `htmx.org` | 4.0.0 |
| `@faker-js/faker` | 10.6.0 |
| Postgres | 18 |
| Redis | 8.10.2 (minimum 7.2) |
| Oracle PHP | 8.5.11 |
| Baseline Pin | `laravel/framework` v13.37.0 |

**Phase plan (PRD §7.3, as amended by AD-27). It is binding for Epic order.**

| Phase | Contents |
| --- | --- |
| **0 Infrastructure** | Conformance System and guardrails, `PORTING.md` and the DIV records (with the Support/Collections pilot), `@xaravel/assert` and `@xaravel/mockery`, the Oracle, `tools/lint-rules`, `tools/boost-framework`, the spikes for OQ-4, OQ-8, OQ-11 and OQ-12, the Upstream scans and package scaffolding |
| **1** | `runtime` first, then `contracts` (with the Xaravel-only contracts), then Macroable, Conditionable, Collections, Reflection, Config and JsonSchema |
| **2** | Container, Support (core) |
| **3** | Pipeline, Encryption, Hashing, Filesystem, Process, Log, Translation, `http-foundation`, `mime`, `finder`, `serializable-closure` (before Bus), Bus, Events |
| **4 Database** | grammars, then Eloquent, then Migrations; the Maintainer's progress review at the end of the Phase |
| **5** | Pagination, Cache, Redis, Validation |
| **6 Web** | Http, Cookie, Session, Routing, View (Blade), Foundation core (lifecycle, `bootstrap/app.ts`, providers, HTTP kernel, middleware, exceptions, Vite), the htmx Integration |
| **7 Tooling** | Console with the Foundation `make:*` generators, Mail, Testing with Foundation testing, the Testbench, then the re-verification Stories that unlock the Phase 1–7 integration tests, the Skeleton and Installer, and the htmx TestResponse assertions |
| **8 App services** | Queue, Concurrency, Broadcasting, Auth, Notifications, Image, MCP, Boost app tools, the Skeleton auth pages and dashboard |
| **9 Post-alpha** | everything listed in PRD §7.2 |

**Sizing input (brief addendum; test methods, which datasets expand to about 16–18k Test IDs):**

- **Largest Components:** Database 3,703 · Foundation 1,152 · Support ~1,052 · Http 751 · Validation 670 · Collections 657 · Queue 648 · Routing 556 · Cache 505 · View 454 · Testing 431 · Console 396 · Auth 313 · Image 291.
- **The rest:** Container 211, Mail 211, Filesystem 202, Broadcasting 165, Redis 159, Events 114, Log 113, JsonSchema 110, Session 109, Notifications 103, Process 76, Bus 75, Translation 70, Pagination 50, Config 33, Cookie 32, Encryption 29, Pipeline 25, Reflection 24, Concurrency 17, Macroable 16, Hashing 13, Conditionable 8.
- **Other Upstream packages (test files):** `laravel/ai` 338, `laravel/mcp` 122, `laravel/boost` 95.
- **Integration share:** 2,809 integration methods, about 21%. They are gated on the Testbench, Phase 7.

**Conformance data model and CI (AD-15, AD-16, AD-17, AD-28):**

- **Ported Tests:**
  - Location: `packages/<c>/tests/ported/<Upstream test path>.test.ts`, or `<path>/<slice>.test.ts` when one file is split across Stories. One open Story owns each file.
  - Declared only through `portedTest('<Test ID>', {case?, dataset?}, async function () {…})`.
  - Assertions only through `@xaravel/assert`. Importing `expect` from `bun:test` under `tests/ported` is a lint error.
  - Adapted assertion lines carry `// adapted:DIV-<n>.<clause>`.
  - Xaravel Tests use `xaravelTest('XT-<c>-<n>', '<FR consequence>', fn)`.
- **Data files:** JSONL, sorted.
  - Expectations are sharded to mirror the Ported Test files, at `conformance/expectations/<component>/<file>.jsonl`; CI checks each `(id, variant)` appears once.
  - The Inventory lives at `conformance/inventory/<component>.jsonl`.
  - Variants are a closed vocabulary in `conformance/variants`.
  - The Upstream snapshot is `conformance/upstream/{framework,ai,mcp,boost}/` at the tag in `conformance/baseline-pin`, synced by `bun run upstream:sync`.
- **Oracle:**
  - A Docker image: PHP 8.5.11, Laravel at the Pin, committed `composer.lock`.
  - One Infrastructure batch run per Pin, from mechanically extracted `conformance/oracle/requests/`.
  - A Story adds inputs through `conformance/oracle-requests/<story-id>.jsonl`. The Oracle workflow runs as the `xaravel-oracle` GitHub App and commits Ed25519-signed fixtures to `conformance/fixtures/<c>/`.
  - CI fails any fixture whose signature doesn't verify against the Protected `oracle.pub`.
- **API-surface parity:** the Oracle exports the public Upstream members via Reflection to `conformance/api-surface/<c>.jsonl`. CI diffs them against each package's `.d.ts`. The Protected `additions.jsonl` / `exceptions.jsonl` files explain extras and gaps. The diff is reported on every PR, and a Component's last Epic is accepted only with zero unexplained members.
- **`blocked-by:<c>`:** valid only when the harness fails with `BlockedByComponentError(<c>)`, raised when a token, alias or FQCN owned by `<c>` is resolved and `<c>` isn't installed.
- **Generator references:** in the Protected `conformance/fixtures/generators/`.
- **Fidelity Review:** GitHub PR reviews from at least two distinct reviewer identities; the done check counts approvals by identity.
- **Grader isolation:**
  - The harness, `@xaravel/assert` and `@xaravel/mockery` import no graded package. They detect `PhpArray` and PHP props by `Symbol.for` brand, freeze their exports, and open frames only through the runtime's global protocol.
  - The root `bunfig.toml` is Protected, and CI fails if any package-level `bunfig.toml` exists.
- **Protected Paths (AD-16):**
  - The list lives in `conformance/protected-paths` and is mirrored to `CODEOWNERS`, with the Maintainer as owner.
  - The `protected-paths` and `ratchet` checks are required by a ruleset on `main`, and run as `pull_request_target` workflows pinned to the default branch.
  - Workflows default to `contents: read`.
  - Agents push only to `story/*`, with no bypass.
  - An `oxlint-disable` of any spine-named rule fails CI.
- **Story manifest:**
  - Each Story is `stories/<story-id>.md` (Protected), with `test_ids:` and `component:` read from the base branch, and a branch named `story/<story-id>`.
  - A Test ID belongs to at most one open Story.
  - CI fails a PR that changes Expectations lines or `portedTest` blocks outside its `test_ids`, or paths outside `packages/<component>/**` and its own conformance files (AD-21).
- **Bots:**
  - An unexpected pass of an unowned Test ID gives a warning and a promotion bot PR.
  - A test that fails then passes on rerun is auto-quarantined by a bot PR plus an `ESC-bot-<n>` Escalation.
- **Escalations:** `conformance/escalations/ESC-<story-id>-<n>.md` holds `test_ids`, `proposed` and `evidence`. The ruling is `decisions/ESC-<story-id>-<n>.md`, and an Escalation counts as approved only when that decision file exists.
- **Backend isolation per worktree (AD-17):**
  - The key is 8 hex characters of SHA-256 over the worktree path and its creation id.
  - Postgres databases are named `xaravel_test_<key>[_<name>]`.
  - SQLite files go under `.cache/`.
  - Each worktree gets its own `redis-server` on a unix socket.
  - `.cache/harness.lock` keeps out a second runner.
- **CI (AD-28):**
  - Per PR (linux-x64): lint, typecheck, protected-paths, ownership, dependency graph, `bun audit`, the Ratchet over the reverse-dependency closure, and a full run of the Story's `test_ids` on every Variant.
  - The required merge queue runs the full Ratchet on all alpha Variants, regenerates `async-surface.json` and runs the API-surface diff.
  - Nightly: the full matrix on linux and macOS, x64 and arm64, plus the Oracle determinism re-check and the benchmarks.
  - The dashboard publishes to GitHub Pages, and history stays linear.

**Phase 0 Upstream scans (AD-27); outputs are Protected data:**
- the DIV-12 name-pair list, committed in `PORTING.md`;
- facade `@method` lists, used to generate the facade delegators;
- `singleton()` bindings, which become `tools/lint-rules/singletons.json`;
- the closure allowed-identifier list, `allowed-identifiers.json`;
- the public API surface;
- the PHPUnit-assertion and Mockery-API usage scans (FR-100, FR-116);
- `conformance/boot-only-state`.

**Phase 0 spikes, whose outcomes become `deferred:` entries or Escalations:**
- OQ-4: Temporal completeness for the Carbon port.
- OQ-8: bcrypt truncation to 72 bytes, proven by an Oracle Differential Test.
- OQ-11: `bun test` primitives (`test.failing`, `skipIf`, per-test assertion counts, `setSystemTime`, preload `afterEach`), `Bun.sql` raw bindings, `Bun.redis`, `Bun.S3Client`, `Bun.Image`, and `AsyncLocalStorage` across `await`, timers, streams and `Bun.serve`.
- OQ-12: whether security releases can trigger an out-of-cycle pin bump (a Maintainer decision).

**Package graph and public surface (AD-1, AD-2, AD-3, AD-22):**

- **Layers:** `runtime` (no dependencies) → `contracts` → L1 core → L2 services → L3 app layer → `foundation` → Xaravel Components → distribution. The grader has no edges to graded packages.
- **Dependency edges:**
  - Upstream `require` becomes `dependencies` (`workspace:*`), and `suggest` becomes optional peers.
  - CI fails on a cycle or an undeclared import. Each package is its own `tsc` project reference.
  - Foundation imports only Components of its own or earlier Phases. Later providers come in through package discovery (`package.json` `"xaravel"` key, `package:discover` → `bootstrap/cache/packages.json`).
- **Contracts:**
  - `@xaravel/contracts` holds every `Illuminate\Contracts\*` interface, plus a same-named runtime token branded `Symbol.for('<FQCN>')` (the `instanceof` brand sits on the prototype).
  - The alias table is ported verbatim. Each service has one canonical token.
  - The package is complete and API-checked at the end of Phase 1, and Protected afterwards.
- **Import paths:** `@xaravel/<c>` for each package, with `src/<Upstream sub-path>/<Class>.ts` and one public class per file. Generated app code and docs import from `@xaravel/framework/<namespace-kebab>` and `@xaravel/framework/helpers`. Packages export no defaults.
- **Third-party symbols:** each has one owning package, registered under its original FQCN and enforced by a duplicate-FQCN scan:

  | Owner (Phase) | Ports |
  | --- | --- |
  | `contracts/psr` (1) | PSR interfaces |
  | `config` (1) | phpdotenv |
  | `support` (2) | Carbon, Inflector, portable-ascii, uuid / uid, league/uri, brick/math, var-dumper, commonmark |
  | `http-foundation` (3) | the Symfony HTTP surface |
  | `mime` (3) | symfony/mime |
  | `finder` (3) | symfony/finder over `Bun.Glob` |
  | `process` (3) | symfony/process |
  | `log` (3) | Monolog |
  | `filesystem` (3) | flysystem |
  | `serializable-closure` (3) | laravel/serializable-closure |
  | `database` (4) | faker |
  | `validation` (5) | email-validator |
  | `routing` (6) | the route compiler |
  | `foundation` (6) | error-handler |
  | `http` (6) | the HTTP client, replacing Guzzle with `fetch` |
  | `console` (7) | symfony/console, prompts, termwind, cron-expression |
  | `mail` (7) | symfony/mailer, CSS inliner |

  Libraries outside the Inventory get Oracle Differential Xaravel Tests in their owning Epic.
- **Edit ownership (AD-21):** a Story edits only its own package. A need in another package becomes a dependent Story on that package's Epic, which unblocks the requester through `blocked-by`. Large classes may be split into `src/<Class>/<group>.ts` modules, merged through declaration merging.

**Shared runtime primitives, `@xaravel/runtime` (AD-19), the first Epic of Phase 1:**
- Scope Frames (AD-5): `currentFrame` / `runInFrame` / `frameSlot`, the global `Symbol.for('xaravel.scope.run')`, and ALS binding for streams, generators and timers.
- The Class Registry and `fqcn()` (AD-10).
- `PhpArray`, `Ref<T>`, the float marker and the PHP semantics helpers (AD-9).
- The `phpSerialize` / `jsonEncode` codecs (AD-23).
- `mixin()` and `classUsesRecursive()` (AD-26).
- `frameStatic()`.
- The `inject` metadata writer and the `Symbol.metadata` polyfill (AD-4).
- The SPL exception hierarchy.
- `interleave(units)` for the NFR-4 tests.

Nothing else re-implements these.

**Cross-cutting implementation rules that bind every Story:**
- **AD-4, DIV-3 injection:** one form, `inject({param: Spec})`, as a TC39 decorator or a function wrapper.
  - Keys are parameter names, in parameter order.
  - Spec values: a token or class, `String`, `Number` or `Boolean` (PHP coercion), `primitive`, the contextual descriptors (`Config()`, `CurrentUser()`, …), or `oneOf()`.
  - Lint checks the keys match the parameter list.
- **AD-5, DIV-11 Scope Frames:**
  - Lifecycle: `registering → booting → sealed`. Every kernel finishes boot before it opens a unit frame.
  - After `sealed`, base-only writes throw in non-test frames.
  - Overlay writes (`instance`, `scoped`, fakes, `config([...])`, locale, the `frameStatic` setters, …) go to the innermost unit frame.
  - Per-unit service state lives in frame slots, and lint bans `this.<field>` writes after construction in the singletons list.
  - Narrow frames and child units follow AD-5's rules.
  - A unit ends only after its body is flushed, terminating callbacks have run and its defer list (including destructor terminals) has drained.
- **AD-6, DIV-1 async surface:**
  - The async roots are fixed, and adding one needs an Escalation.
  - Async by derivation: a method is async if it reaches a root or takes an allowed async callback. Async on any path means async on all paths, and a `T | Promise<T>` return is banned.
  - Sync after loading: session, request input and the authenticated user (`AuthGuardNotResolvedException` otherwise).
  - Dual helpers; thenable builders and Relations; destructor terminals that start in a microtask and are awaited by the frame; `AsyncLazyCollection`; the async companions (`mapAsync`, …).
  - IO runs sequentially in Upstream's order, and `Promise.all` only where Upstream is concurrent.
  - Every async method carries `@asyncRoot`, and each package commits a generated `async-surface.json` that CI checks for drift.
- **AD-7 Eloquent attributes:** the constructor Proxy, the `MODEL_STATE` symbol slot (`#private` banned), the blueprint harvest, Laravel's construction order, `defineProperty` trap rules, `declare` columns, `@attribute` accessors, `@scope` statics, `mixin` traits and the renamed colliding methods.
- **AD-8, DIV-2 relationships:**
  - Relationships are decorated auto-accessors, with `related(name)` as the typed builder. An unchained await is load-if-missing and caches.
  - `resolveRelationUsing` and `automaticallyEagerLoadRelationships()` batching.
  - An Escalation on `handleLazyLoadingViolationUsing()` in the first relationships Epic; those Test IDs stay `not-ported-yet` until it is decided.
- **AD-9, DIV-9 values:**
  - `null` only, never `undefined`.
  - List as `Array`, a string-keyed map as a plain object, anything else as `PhpArray`. No mutation and no by-reference returns.
  - Lossless integer reads through `normalizeRow`, with `IntegerOverflowException` and the `bigint` hints.
  - Prototype brands and `hasBrand()`; `Symbol.for('xaravel.php.props')` for PHP `==`.
- **AD-10 identity:** `fqcn()` only; using `constructor.name` for identity is a lint error. Every framework file ends with `registerClass('<FQCN>', X)`, and there is no `sideEffects: false`.
  - App classes come from the PSR-4 map, and misses are lazily `import()`ed.
  - Duplicate keys throw. Test fixtures use `registerTestClass`.
  - Classes in config go through `config:cache` as `{"$class": …}`.
- **AD-11, DIV-5 Blade compile target:**
  - Compiles to TS, then an ES module cached in `storage/framework/views`, exporting `render(ctx)` and `fragments`. `RenderContext` is in `contracts/view`.
  - `$`-prefixed variables are destructured from the data.
  - Printing a thenable, or a thenable in a directive condition, throws.
  - Fragment capture follows Upstream; a direct call is allowed only for closed fragments.
  - `Blade.directive` handlers have a fixed ABI.
  - `View#toString()` throws.
- **AD-12 htmx seams:**
  - No Upstream-mirroring package imports `@xaravel/htmx`.
  - The seams: `mixinStrict` mixins on Request/Response/RedirectResponse/TestResponse, `Route` / `FormRequest` `fragment()` macros, `Redirector` / `ResponseFactory` decoration, `Router.prepareResponseUsing`, `ViewFactory.renderTargetResolver`, the `lastRenderedView` frame slot, `Handler.fallbackRenderable` and the `Vary` middleware.
  - FR-40 uses `session.now`, never a flash.
  - The kernel runs the `BeforeBody` stage, then `loadBody`, then the rest of the pipeline. Foundation owns `serve()` and graceful drain.
- **AD-13:** `queue:work --timeout` uses a supervisor and child process. Timeout tests use a spawned fixture app (`adapted:DIV-11`).
- **AD-14, DIV-4:** one `SerializableClosure` codec. Free identifiers are allowed only from the list (parameters, ES built-ins, facades and helpers). Payloads are signed with the config-string `APP_KEY`, and facades are supplied through a resolver from the Application.
- **AD-20 connection leases:** transactions, locks, Redis `MULTI` / pipeline / `watch` / `select` / `subscribe` and blocking commands run on a connection leased to the frame.
  - Postgres uses `reserve()`; file SQLite one WAL connection per lease; `:memory:` and pools of size 1 a FIFO mutex; Redis a duplicated client.
  - Child units inherit the lease, and `afterCommit` runs per unit.
  - Each driver has a concurrency test.
- **AD-23 codecs:**
  - The only `phpSerialize` and `jsonEncode`, verified by Oracle Differential Tests.
  - The session and cache formats are fixed, and the Encrypter uses `JSON_UNESCAPED_SLASHES`.
  - `JSON.stringify` on framework values is a lint error, and `toJSON` delegates to `jsonSerialize`.
  - `AppKey` exposes `raw`, `configString` and `previous`.
- **AD-24 queued payload envelope:** Laravel's JSON envelope verbatim, with `data.command = phpSerialize(job)` and `ModelIdentifier` for models. On restore, unserialize sync, then `await restoreModels`. One `JobPayload` codec serves every queued type.
- **AD-25 test lifecycle:**
  - Hook order: `createApplication` → `afterApplicationCreated` → `setUp<Trait>` → test → `tearDown<Trait>` → `beforeApplicationDestroyed` → frame end.
  - The test frame opens first, and the app is sealed before the body runs. The shared-app opt-in is allowed.
  - Pest-style app tests: arrow bodies are a lint error, and `PendingTestResponse` / `PendingCommand` are thenables.
  - The Testbench `TestCase` extends Foundation's and only adds hooks.
- **AD-26 PHP construct mapping:** `PORTING.md` decides every row before Phase 1, and CI checks it.
  - Named args become an options object.
  - Enums become classes with static instances.
  - Attributes become decorators.
  - `__call` becomes generated delegators.
  - `__toString` becomes `toString` plus `toPrimitive`.
  - `ArrayAccess` becomes `offsetGet` / `get()`.
  - Traits become `mixin`.
  - Option pairs are read with `option(this, name)`.
  - Facades are generated from `@method`.
  - Real-time facades live at `@xaravel/framework/facades/<FQCN path>`.
  - No dynamic `where<Column>`.
  - By-reference parameters become `Ref<T>`.
- **AD-27:** no Epic may define a cross-package seam the spine doesn't name; a new one needs an Escalation.
- **Consistency conventions:**
  - Upstream names are unchanged.
  - Errors are `Error` subclasses with Upstream names and messages, registered under their FQCN.
  - Bun's `.env` autoload is off: `env = false`, plus `--no-env-file` in entry scripts.
  - The framework logs only through Log.
  - Each package has `docs/` mirroring its Laravel page, with a Divergences section, ownership per `docs/ownership.md`, and a `LICENSE`.

**Divergence Records, which must exist before the first Story that depends on them (FR-8), each with numbered adaptation clauses:**
- **DIV-1:** async IO Terminals (AD-6).
- **DIV-2:** Strict Loading and `related()` (AD-8).
- **DIV-3:** `inject` tokens (AD-4).
- **DIV-4:** closure serialization (AD-14).
- **DIV-5:** generated code is TypeScript; Differential Tests on rendered output.
- **DIV-6:** the enumerated `php-only` catalogue.
- **DIV-7:** discovery without reflection.
- **DIV-8:** async test bodies; predicate assertions return Promises.
- **DIV-9:** the PHP value model (AD-9).
- **DIV-10:** JS `RegExp`, with the unsupported PCRE features documented.
- **DIV-11:** the long-lived application and Scope Frames, including the supervisor job-timeout clause.
- **DIV-12:** PHP member namespaces and magic members, including `collection.get(0)`, the renamed Model methods and no dynamic wheres.

**Release (AD-18, FR-13, NFR-11):**
- One version, kept in the root `package.json` and stamped into every package.
- The release workflow runs only on a Maintainer-approved `v0.<n>.<p>` tag: `bun pm pack`, then `npm publish --provenance` through trusted publishing.
- A new name gets a one-time bootstrap publish by the Maintainer.
- Release notes state the Baseline Pin.
- Before the first public publish, the Maintainer emails Taylor Otwell (OQ-1). This is a Maintainer action, not a Story.

**Deferred items owned by specific Epics (spine "Deferred"):**
- the closure parser library (serializable-closure);
- `route:cache` with closures, and `QUERY` CSRF classification (Routing);
- Redis Pub/Sub, and a 7.2 CI leg (Redis);
- `handleLazyLoadingViolationUsing()` (the first Eloquent relationships Epic);
- the Boost FR-106 output schema and read-only query enforcement (Boost app tools);
- `hashing.argon.threads` (Hashing);
- a `network` backend tag for `email:dns` (Validation, through an Escalation);
- a per-route streaming-body opt-out (Http);
- a schema-driven model typings generator (Eloquent);
- app production deployment (Skeleton).

### UX Design Requirements

None. There is no UX design contract: Xaravel is a server-side framework. The few UI surfaces are already specified as functional requirements:
- the Skeleton welcome page, with its Fragment example (FR-17);
- the Skeleton htmx auth pages and dashboard (FR-17, OQ-10);
- the Foundation debug and generic error pages (FR-35);
- the public conformance dashboard (FR-5).

### FR Coverage Map

Each FR has one **primary** Epic, which owns its acceptance. Where other Epics deliver part of an FR, they are named after "also".

| FR | Epic | Covers |
| --- | --- | --- |
| FR-1 | 2 | Test Inventory generation |
| FR-2 | 5 | Ported Test traceability |
| FR-3 | 5 | Expectations File and Skip Reason rules |
| FR-4 | 5 | Ratchet |
| FR-5 | 7 | Conformance dashboard |
| FR-6 | 3 | Differential Tests against the Oracle; also 2 (Oracle image) |
| FR-7 | 2 | Baseline Pin bump |
| FR-8 | 8 | `PORTING.md`, Divergence Records, pilot |
| FR-9 | 5 | Agent-operable harness |
| FR-10 | 1 | Split packages; also every Component Epic (its own `package.json`) |
| FR-11 | 61 | `@xaravel/framework` meta-package |
| FR-12 | 1 | Bun-only runtime |
| FR-13 | 1 | Lockstep 0.x releases (workflow); a release follows each completed Phase |
| FR-14 | 1 | Monorepo and npm scope |
| FR-15 | 61 | Installer |
| FR-16 | 61 | Laravel-shaped Skeleton |
| FR-17 | 61 | htmx-ready Skeleton; also 70 (auth pages and dashboard) |
| FR-18 | 51 | Application lifecycle |
| FR-19 | 17 | Service container |
| FR-20 | 15 | Config Repository and the phpdotenv grammar; also 20 (`env()` helper), 51 (env-file selection and precedence), 55 (`config:cache`) |
| FR-21 | 20 | Facades and global helpers; also each owning Component's facade |
| FR-22 | 9 | Class Registry |
| FR-23 | 14 | Collections |
| FR-24 | 18 | Str, Stringable, inflection; also 20 (Arr, Fluent, Number, Uri, Benchmark, Sleep, Lottery, Once), 24 (Pipeline) |
| FR-25 | 19 | Dates |
| FR-26 | 11 | Macroable; also 12 (Conditionable), 13 (Reflection), 9 (`mixin` traits) |
| FR-27 | 51 | HTTP kernel on Bun |
| FR-28 | 46 | Requests; also 21 (http-foundation), 51 (`BeforeBody` stage) |
| FR-29 | 46 | Responses; also 21 (http-foundation) |
| FR-30 | 48 | Routing |
| FR-31 | 51 | Middleware; also 48 (routing middleware), 44, 45, 46 |
| FR-32 | 51 | CSRF protection |
| FR-33 | 45 | Sessions; also 44 (cookies) |
| FR-34 | 48 | URL generation and signed URLs |
| FR-35 | 52 | Error handling; also 29 (logging channels) |
| FR-36 | 48 | `throttle` middleware; also 42 (`RateLimiter`) |
| FR-37 | 53 | htmx Request detection |
| FR-38 | 53 | htmx response helpers |
| FR-39 | 53 | Fragment responses; also 50 (`@fragment` capture) |
| FR-40 | 53 | Validation failure on htmx Requests |
| FR-41 | 53 | Redirects on htmx Requests |
| FR-42 | 53 | Full versus partial rendering |
| FR-43 | 53 | Streaming (SSE, multipart, WebSocket); also 51 (WebSocket upgrade in `serve()`) |
| FR-44 | 49 | Blade directives |
| FR-45 | 50 | Blade components |
| FR-46 | 49 | Escaping and XSS suite |
| FR-47 | 49 | Async rendering and `view:cache` |
| FR-48 | 49 | Blade test adaptation |
| FR-49 | 52 | Vite and CSP nonce |
| FR-50 | 43 | Validator |
| FR-51 | 51 | Form Requests |
| FR-52 | 43 | Async rules and `validateSync()` |
| FR-53 | 34 | Connections |
| FR-54 | 34 | Query builder and grammars |
| FR-55 | 34 | Transactions and connection leases |
| FR-56 | 39 | Migrations; also 35 (Schema builder and grammars) |
| FR-57 | 39 | Seeding |
| FR-58 | 40 | Pagination |
| FR-59 | 41 | Redis |
| FR-60 | 61 | Same code on SQLite and Postgres (Skeleton suite on both) |
| FR-61 | 36 | Models |
| FR-62 | 37 | Relationships |
| FR-63 | 37 | Strict Loading by default |
| FR-64 | 36 | Casts, accessors and mutators |
| FR-65 | 36 | Model events and observers |
| FR-66 | 36 | Serialization and API resources |
| FR-67 | 38 | Factories |
| FR-68 | 38 | Scopes, soft deletes and pruning |
| FR-69 | 54 | Commands |
| FR-70 | 54 | Prompts |
| FR-71 | 55 | Generators |
| FR-72 | 54 | Task scheduling |
| FR-73 | 55 | REPL (`tinker`) |
| FR-74 | 42 | Cache |
| FR-75 | 33 | Events |
| FR-76 | 27 | File storage |
| FR-77 | 25 | Encryption; also 9 (`phpSerialize` codec) |
| FR-78 | 26 | Hashing |
| FR-79 | 47 | HTTP client |
| FR-80 | 28 | Processes |
| FR-81 | 29 | Context |
| FR-82 | 63 | Concurrency |
| FR-83 | 30 | Localization |
| FR-84 | 16 | JsonSchema; also 67 (Image) |
| FR-85 | 62 | Jobs |
| FR-86 | 62 | Workers |
| FR-87 | 62 | Queue side of chains, batches and middleware; also 32 (Bus) |
| FR-88 | 62 | Dispatching closures; also 31 (codec) |
| FR-89 | 56 | Mail |
| FR-90 | 65 | Notifications |
| FR-91 | 64 | Broadcasting |
| FR-92 | 66 | Authentication |
| FR-93 | 66 | Authorization |
| FR-94 | 66 | Password reset |
| FR-95 | 66 | Email verification |
| FR-96 | 57 | HTTP tests; also 58 (htmx assertions) |
| FR-97 | 57 | Console tests |
| FR-98 | 57 | Database testing |
| FR-99 | 57 | Fakes and time |
| FR-100 | 4 | Mocking library |
| FR-101 | 59 | Testbench |
| FR-102 | 71 | [post-alpha] Browser tests |
| FR-103 | 72 | [post-alpha] AI SDK |
| FR-104 | 68 | MCP servers |
| FR-105 | 69 | Boost installation |
| FR-106 | 69 | App introspection tools |
| FR-107 | 69 | Test-run tool |
| FR-108 | 73 | [post-alpha] Documentation search |
| FR-109 | 7 | Boost framework mode |
| FR-110 | 69 | Safe by default |
| FR-111 | 8 | Fidelity Review |
| FR-112 | 1 | Protected Paths |
| FR-113 | 5 | Assertion floor; also 4 (assertion counting) |
| FR-114 | 8 | Escalation and stop rules; also 1 (file checks), 7 (dashboard listing) |
| FR-115 | 5 | Xaravel Test declaration and the acceptance check |
| FR-116 | 4 | PHPUnit-style matchers |

**Cross-cutting, not owned by one Epic:**

| Rule | How it is covered |
| --- | --- |
| NFR-1 | Bun, `strict`, ESM: Epic 1 sets it up, and CI enforces it for everyone. |
| NFR-2 | The owner Epic per AD-22 records each dependency in its package README. |
| NFR-3 | Epic 6 builds the lint, and every Story runs it. |
| NFR-4 | Epic 9 builds `interleave()`, and every Epic that owns a listed service writes its concurrency test. |
| NFR-5 | Epic 1 sets up `SECURITY.md` and `bun audit`, and each security Component writes its interop tests. |
| NFR-6 | Epic 5 runs the nightly benchmark job, which never gates. |
| NFR-7 | Each resettable item's owning Epic proves its reset. |
| NFR-8 | Epic 1 provides the LICENSE and notices, and every package keeps them. |
| NFR-9 | Every Component Epic closes with that Component's docs. |
| NFR-10 | Epics 1, 5 and 8 make Stories runnable unattended. |
| NFR-11 | Epic 1 sets up release authority. |

**Global rule for `blocked-by`:** each entry is cleared by a re-verification Story in the Epic that delivers the blocking Component. The integration tests that need the Testbench are cleared in Epic 60.

## Epic List

**Structure decisions (Maintainer, 2026-10-16):**

- **One Epic per Component.** Each Epic covers one Component, or one slice of a large one (Database, Support, Foundation, Http, View, htmx), within one Phase. This follows the PRD glossary and AD-21. Tiny Components keep their own Epic.
- **Phases run in order.** Epics are numbered in Phase order, and Phases 0–8 run in dependency order (PRD §7.3). Epics within one Phase may run in parallel unless an Epic's notes say otherwise. Each Epic is standalone: a test that needs a later-Phase Component is `blocked-by:<component>`, never stubbed (FR-111).
- **Story test scope.** Each Story in Phases 1–8 names its Upstream test scope as **selectors** against the v13.37.0 snapshot, for example `tests/Support/SupportCollectionTest.php::testChunk*`. Once Epic 2 delivers the Test Inventory, sprint planning resolves the selectors to exact Test IDs in `stories/<story-id>.md`. Stories for Xaravel Components list their `XT-<component>-<n>` IDs instead.
- **Xaravel Tests in Upstream Components.** An acceptance criterion in an Upstream-Component Story that no Upstream selector covers (an `interleave` isolation check, an Oracle Differential check of a ported library, a lint or compile check) is verified by a Xaravel Test `XT-<component>-<n>`, which sprint planning assigns in the Story manifest (FR-115).
- **Phase 9 is outline only.** Its Epics get a goal, FR coverage and Story titles. Full Stories are written at Phase 9 planning.

**Every Component Epic also includes:**
- its package's NFR-9 docs;
- its `async-surface.json` (AD-6);
- an API-surface diff with zero unexplained members at the Epic's close (AD-15);
- re-verification of any `blocked-by:<this component>` entries.

### Phase 0: Infrastructure

#### Epic 1: Monorepo, guardrails & release pipeline

The Maintainer can hand the repository to unattended Framework Agents, knowing that they can push only Story branches and cannot touch the grader. Only the Maintainer can release.

- **Covers:** FR-10, FR-12, FR-13, FR-14, FR-112; NFR-1, NFR-5, NFR-8, NFR-11.
- **Contents:**
  - Story 1 is the scaffolding Infrastructure Story (no starter template): Bun workspaces, the Protected root config and tsconfig base, and every package scaffolded (AD-2, AD-27).
  - The dependency-graph check.
  - `conformance/protected-paths`, `CODEOWNERS` and the `main` ruleset (AD-16).
  - Story manifest parsing, and the ownership and path-scope checks (AD-16, AD-21).
  - Escalation and decision file formats.
  - LICENSE, notices and `SECURITY.md`.
  - The lockstep release workflow with npm provenance (AD-18).

#### Epic 2: Upstream snapshot, Oracle image, Test Inventory & pin bump

The Maintainer knows the complete denominator: every Upstream test case at the Pin, with a stable ID. The Maintainer can also move the Pin at a freeze point and get the diff as backlog.

- **Covers:** FR-1, FR-7; also FR-6 (the Oracle runs in a container).
- **Contents:**
  - `upstream:sync` and `baseline-pin`.
  - The Inventory generator for PHPUnit and Pest, with datasets, hashes, assertion multisets and backend tags.
  - The directory→Component map, which the Maintainer signs off.
  - The Oracle container image (PHP 8.5.11), used for the runner listing and the baseline run that records assertion kinds and Oracle outcomes.
  - The Oracle listing cross-check.
  - The pin-bump diff tool.

#### Epic 3: Oracle fixtures, signing & Upstream scans

Framework Agents get trustworthy expected values from real PHP Laravel without installing PHP. The Upstream facts the spine depends on are extracted mechanically.

- **Covers:** FR-6.
- **Contents:**
  - The batch fixture run, the `oracle-requests` workflow, and Ed25519-signed fixtures with CI verification (AD-15).
  - API-surface export through Reflection.
  - The Upstream scans: facade `@method` lists, `singleton()` bindings, allowed closure identifiers, DIV-12 name pairs and boot-only state.
  - The PHPUnit and Mockery usage scans.

#### Epic 4: Grader packages, `@xaravel/assert` & `@xaravel/mockery`

Ported Tests assert with PHPUnit's exact semantics and mock with Mockery's API, so a passing test means what it meant in PHP.

- **Covers:** FR-100, FR-116; also FR-113 (assertion counting).
- **Contents:**
  - PHP `==` / `===` implemented inside the grader.
  - Brand detection without importing graded packages, and frozen exports (AD-15 grader isolation).
  - `portedTest` / `xaravelTest` declarations.
  - Coverage of every scanned assertion and Mockery API.
- **Needs:** Epic 3's scans.

#### Epic 5: Harness, Expectations File, Ratchet & CI pipeline

Every Story's result is measured the same way locally and in CI, and any drift from the Expectations File fails the build.

- **Covers:** FR-2, FR-3, FR-4, FR-9, FR-113, FR-115; NFR-6, NFR-10.
- **Contents:**
  - The harness: fast mode with a seed, filters, greppable output, the not-run handling, and `BlockedByComponentError`.
  - The variant vocabulary and per-worktree backend isolation (AD-17).
  - Sharded expectations and the Skip Reason rule checks.
  - The Ratchet.
  - PR checks, the merge queue, the nightly matrix, the promotion and quarantine bots, and benchmarks (AD-28).

#### Epic 6: Static guardrails: lint rules, async surface & API-surface diff

The mistakes agents make most often are caught mechanically before review: floating Promises, identity by `constructor.name`, stray state writes and silent API drift.

- **Covers:** NFR-3; enforces AD-4, AD-5, AD-6, AD-9, AD-10, AD-23, AD-25 and AD-26.
- **Contents:**
  - `tools/lint-rules`, including the `inject` keys, `singletons.json` writes, `JSON.stringify`, thenable returns and `T | Promise<T>`.
  - oxlint type-aware configuration.
  - The `async-surface.json` generator and drift check.
  - The API-surface `.d.ts` diff, with the additions and exceptions files.
  - The duplicate-FQCN scan.

#### Epic 7: Conformance dashboard & Boost framework mode

The Maintainer reviews any Epic from evidence on one page (UJ-5). Framework Agents query their Test IDs, statuses, DIVs and Escalations through MCP (UJ-4).

- **Covers:** FR-5, FR-109; also FR-114 (dashboard listing).
- **Contents:**
  - The GitHub Pages dashboard: full denominator, SM-1 gate figure, Skip Reason counts, `adapted` counts, the API-surface diff, history and Pin markers.
  - `tools/boost-framework`, read-only, on `@modelcontextprotocol/server` 2.3.1.

#### Epic 8: `PORTING.md`, Divergence Records, Fidelity Review & pilot (Phase 0 exit)

Framework Agents have one written rulebook, two independent reviewers check every Story, and the whole loop has been proven on real Support and Collections tests before Phase 1 opens.

- **Covers:** FR-8, FR-111, FR-114.
- **Contents:**
  - `PORTING.md`, with the idiom table, the AD-26 rows, the mechanical PHP→TS rule, the frame-slot list and the `APP_KEY` forms.
  - DIV-1..DIV-12 records with numbered clauses.
  - Fidelity Review workflow with 2 identities, and the agent stop rules.
  - The OQ-4, OQ-8, OQ-11 and OQ-12 spikes.
  - The pilot and the revision it drives.
- **Gate:** Phase 1 starts only after this Epic is accepted.

### Phase 1: Foundations

#### Epic 9: `@xaravel/runtime`: Scope Frames, Class Registry, PHP values & codecs

Every later package shares one sandbox, one class identity, one PHP value model and one serializer, so concurrent units never leak state and payloads interoperate with PHP.

- **Covers:** FR-22; also FR-26 (`mixin`), FR-77 (`phpSerialize`); NFR-4 (`interleave`).
- **Contents:** AD-19 in full, implementing AD-4 (metadata), AD-5, AD-9, AD-10 and AD-23.
- **Kind:** Xaravel Component, accepted on Xaravel Tests plus Oracle Differential Tests for the codecs.
- **Order:** first in Phase 1.

#### Epic 10: `@xaravel/contracts`: tokens, aliases & Xaravel-only contracts

Packages built in parallel agree on every interface and container key without importing each other's half-built code.

- **Covers:** AD-1, AD-27. Supports FR-10, FR-19 and FR-21.
- **Contents:**
  - Every `Illuminate\Contracts\*` interface, with its branded token.
  - The PSR interfaces and the alias table.
  - The Xaravel-only contracts: the async thenable list, the view ABI and the test lifecycle.
- **Protection:** Protected after Phase 1.
- **Order:** after Epic 9.

#### Epic 11: Macroable

App Developers can `macro()` any Macroable class.

- **Covers:** FR-26.

#### Epic 12: Conditionable

App Developers can use `when()` / `unless()` wherever Laravel provides them.

- **Covers:** FR-26.

#### Epic 13: Reflection

Framework code can inspect closures and callables as Laravel's Reflector does, within the limits of erased types (DIV-3).

- **Covers:** FR-26.

#### Epic 14: Collections

App Developers can use `Collection` and `LazyCollection` with every Laravel 13 method and PHP array semantics.

- **Covers:** FR-23.
- **Sizing:** 657 methods, about 408 of them in `SupportCollectionTest` (most run for both Collection and LazyCollection), so this is the largest Phase 1 Epic.

#### Epic 15: Config & environment

App Developers read `config()` and `env()` with phpdotenv's grammar and Laravel's file precedence, and `config:cache` round-trips.

- **Covers:** FR-20.
- **Contents:** owns the phpdotenv port (AD-22).

#### Epic 16: JsonSchema

App Developers can build JSON Schemas with Laravel 13's builder.

- **Covers:** FR-84 (JsonSchema).

### Phase 2

#### Epic 17: Container

App Developers bind, resolve, scope, tag and contextually inject services, with `inject` autowiring and per-unit `scoped` isolation.

- **Covers:** FR-19.

#### Epic 18: Support: strings & inflection

App Developers use `Str` and `Stringable` with Laravel's behaviour: pluralization, ascii/slug transliteration and safe markdown.

- **Covers:** FR-24 (Str and Stringable).
- **Contents:** owns the Inflector, portable-ascii, uuid/uid and commonmark ports.

#### Epic 19: Support: dates

App Developers use a Carbon-equivalent date API, built on Temporal, that matches the Oracle's formatting and parsing and has a test clock.

- **Covers:** FR-25.
- **Contents:** owns the Carbon port. Depends on the OQ-4 spike outcome.

#### Epic 20: Support: helpers, arrays, numbers, URIs & facade base

App Developers use Laravel's global helpers, `Arr`, `Fluent`, `Number`, `Uri`, `Benchmark`, `Sleep`, `Lottery`, `Once`, `MessageBag` and the `Facade` base with `fake` / `swap`.

- **Covers:** FR-21, FR-24 (the rest).
- **Notes:**
  - The facade-specific and `SupportTesting*Fake` tests start `blocked-by` their Components.
  - Owns the league/uri, brick/math and var-dumper ports.

### Phase 3

Epics 21–23 (the shared library ports) come first. Epic 27 (Filesystem) needs Epic 23 (finder), and its download tests need Epic 21. Epic 30 (Translation) needs Epic 27. Epic 32 (Bus) needs Epics 24 and 31. Epic 33 (Events) needs Epic 32.

#### Epic 21: http-foundation

Http, Routing, Session and Cookie get the Symfony HTTP surface that Laravel exercises, ported once over Web `Request` / `Response`.

- **Covers:** supports FR-28 and FR-29.
- **Kind:** Xaravel Component, accepted on Oracle Differential Xaravel Tests.

#### Epic 22: mime

Mail and Http get the symfony/mime surface that Laravel uses, ported once.

- **Kind:** Xaravel Component.

#### Epic 23: finder

Filesystem, Session and others get symfony/finder over `Bun.Glob`, ported once.

- **Kind:** Xaravel Component.

#### Epic 24: Pipeline

App Developers send objects through pipes, as Laravel does.

- **Covers:** FR-24 (Pipeline).

#### Epic 25: Encryption

App Developers encrypt with `Crypt`, and payloads interoperate with PHP Laravel in both directions, including key rotation.

- **Covers:** FR-77.

#### Epic 26: Hashing

App Developers hash and verify bcrypt and argon2id passwords. PHP `$2y$` hashes and passwords over 72 bytes behave exactly as in PHP.

- **Covers:** FR-78.

#### Epic 27: Filesystem

App Developers use `Storage` disks (local, public, and s3 through `Bun.S3Client`) with streaming, temporary URLs, visibility and fakes.

- **Covers:** FR-76.
- **Contents:** owns the flysystem port.

#### Epic 28: Process

App Developers run processes, pools and pipes through `Bun.spawn`, with timeouts and fakes.

- **Covers:** FR-80.
- **Contents:** owns the symfony/process port.

#### Epic 29: Log & Context

App Developers log through Laravel's channels. Request-scoped Context is added to log entries and isolated per unit.

- **Covers:** FR-81; also FR-35 (logging).
- **Contents:** owns the Monolog port.
- **Note:** Context lives in Upstream `Illuminate/Log/Context`, so it belongs here rather than in Support.

#### Epic 30: Translation

App Developers use language files, `__()`, `trans_choice()` and JSON translations.

- **Covers:** FR-83.

#### Epic 31: serializable-closure

Closures can be serialized safely with explicit arguments and signed payloads, before Bus needs them.

- **Covers:** FR-88 (the codec).
- **Contents:** implements AD-14 and DIV-4.
- **Kind:** Xaravel Component.

#### Epic 32: Bus

App Developers dispatch commands and use Bus chains and batches (Bus side).

- **Covers:** FR-87 (Bus).
- **Order:** after Epic 31.

#### Epic 33: Events

App Developers dispatch events to listeners and subscribers, with discovery from files (DIV-7) and `Event.fake()`.

- **Covers:** FR-75.
- **Note:** Eloquent model events need this, so it lands before Phase 4.

### Phase 4: Database

These Epics are slices of one Component. The Maintainer's progress review comes at the end of the Phase (PRD §7.2).

#### Epic 34: Database: connections, query builder, grammars & transactions

App Developers query SQLite and Postgres with Laravel's builder. SQL matches the Oracle for all five grammars, and transactions hold their connection under concurrency.

- **Covers:** FR-53, FR-54, FR-55.
- **Contents:**
  - Prototypes AD-20 connection leases and AD-9 lossless integers.
  - Builds the MySQL, MariaDB and SQL Server grammars. Their drivers are `deferred`.

#### Epic 35: Database: schema builder & grammars

App Developers describe tables with the Schema builder, and the generated DDL matches the Oracle on every grammar.

- **Covers:** FR-56 (schema).

#### Epic 36: Eloquent: models, attributes, casts, events & serialization

App Developers define models with Laravel's conventions, casts, accessors, observers, serialization and API resources.

- **Covers:** FR-61, FR-64, FR-65, FR-66.
- **Contents:** implements AD-7.

#### Epic 37: Eloquent: relationships & Strict Loading

App Developers define every relationship type, eager-load them, and get Strict Loading by default with `related()` and automatic eager loading.

- **Covers:** FR-62, FR-63.
- **Contents:**
  - Implements AD-8.
  - Raises the `handleLazyLoadingViolationUsing()` Escalation.

#### Epic 38: Eloquent: factories, scopes, soft deletes & pruning

App Developers build test data with factories, and use scopes, `SoftDeletes`, pruning and morph maps.

- **Covers:** FR-67, FR-68.

#### Epic 39: Database: migrations, seeding & database commands

App Developers run migrations and seeders.

- **Covers:** FR-56 (migrate), FR-57.
- **Note:** the command-level tests start `blocked-by:console` and are cleared in Phase 7.

### Phase 5

#### Epic 40: Pagination

App Developers paginate results with length-aware, simple and cursor paginators, and render or serialize them.

- **Covers:** FR-58.

#### Epic 41: Redis

App Developers use Redis connections through `Bun.redis`, with leased transactions and pipelines.

- **Covers:** FR-59.
- **Contents:** Pub/Sub per the spine's Deferred table.

#### Epic 42: Cache

App Developers use the array, file, database and redis stores, with `remember`, `flexible`, tags, locks, `memo` and `RateLimiter`.

- **Covers:** FR-74; also FR-36 (`RateLimiter`).
- **Needs:** Epic 41, for the Redis store, Redis locks and Redis tags.

#### Epic 43: Validation

App Developers validate with every Laravel 13 rule. Messages match the Oracle, and IO rules are awaited.

- **Covers:** FR-50, FR-52.
- **Contents:** owns the email-validator port. `email:spoof` is `deferred`.

### Phase 6: Web

Epics run in this order: Cookie (44) and Session (45) come first, because Http requires Session. Then Http (46, 47), Routing (48), View (49, 50), Foundation (51, 52) and htmx (53).

#### Epic 44: Cookie

App Developers queue and encrypt cookies as Laravel does.

- **Covers:** FR-33 (cookies).

#### Epic 45: Session

App Developers use sessions on every alpha driver, with flash data and regeneration, and with payloads that interoperate with PHP.

- **Covers:** FR-33.

#### Epic 46: Http: requests & responses

Controllers read input synchronously and return every Laravel response type over `Bun.serve`.

- **Covers:** FR-28, FR-29.

#### Epic 47: Http client

App Developers make outbound requests with `Http`, using retries, pools, fakes and stray-request prevention over `fetch`.

- **Covers:** FR-79.
- **Note:** this is Upstream `Illuminate/Http/Client`.

#### Epic 48: Routing

App Developers register routes, including `Route.query`, with model binding, resource controllers, signed URLs, throttling and `route:cache`.

- **Covers:** FR-30, FR-34, FR-36.
- **Contents:** owns the route-compiler port.

#### Epic 49: View: Blade compiler, directives & escaping

App Developers write Blade templates that compile to cached async modules. Rendered HTML and escaping match the Oracle.

- **Covers:** FR-44, FR-46, FR-47, FR-48.
- **Contents:** implements AD-11.

#### Epic 50: View: Blade components & fragments

App Developers compose anonymous and class-based components with slots and attributes, and declare `@fragment`s.

- **Covers:** FR-45; also FR-39 (fragment capture).

#### Epic 51: Foundation: application, providers, HTTP kernel, middleware & CSRF

App Developers configure the app in `bootstrap/app.ts`, serve it with `bun artisan serve` or the production entry, and get Laravel's middleware, CSRF and Form Requests.

- **Covers:** FR-18, FR-27, FR-31, FR-32, FR-51.
- **Contents:** implements AD-12's two-stage pipeline, and owns `serve()`.

#### Epic 52: Foundation: exceptions, error pages & Vite

App Developers customise error handling, get debug and generic error pages and JSON errors, and load assets with `@vite` under a strict CSP.

- **Covers:** FR-35, FR-49.
- **Contents:** owns the error-handler port.

#### Epic 53: htmx 4 Integration

Controllers answer htmx Requests with Fragments, htmx headers, htmx-aware redirects, 422 validation re-renders and streaming. Non-htmx requests stay exactly Upstream (UJ-2).

- **Covers:** FR-37 to FR-43.
- **Contents:** attaches only through the AD-12 seams.
- **Kind:** Xaravel Component.

### Phase 7: Developer tooling

#### Epic 54: Console: commands, prompts & scheduling

App Developers define and run `bun artisan` commands with Laravel's signatures, prompts, output and the scheduler.

- **Covers:** FR-69, FR-70, FR-72.
- **Contents:** owns the symfony/console, prompts, termwind and cron-expression ports.

#### Epic 55: Foundation: console kernel, generators & tinker

App Developers scaffold every file type with `make:*`, producing TypeScript that compiles under `--strict`, and open a booted REPL.

- **Covers:** FR-71, FR-73.

#### Epic 56: Mail

App Developers send Mailables from Blade or Markdown over the smtp, log, array and failover transports. Markdown HTML matches the Oracle.

- **Covers:** FR-89.
- **Contents:** owns the symfony/mailer and CSS-inliner ports.

#### Epic 57: Testing & Foundation testing

App Developers write Pest-style HTTP, console and database tests with fakes and time control.

- **Covers:** FR-96, FR-97, FR-98, FR-99.
- **Contents:** implements AD-25.

#### Epic 58: htmx test assertions

App Developers assert `HX-Trigger`, Fragments and `HX-Location` in their feature tests.

- **Covers:** FR-96 (htmx consequence).
- **Kind:** Xaravel Component, a slice of htmx.

#### Epic 59: Testbench

Library authors and the framework's own integration tests boot a Testbench app with config, migration, env and database hooks.

- **Covers:** FR-101.
- **Kind:** Xaravel Component.

#### Epic 60: Integration-test unlock for Phases 1–7

The roughly 2,809 Upstream integration tests that waited for the Testbench are ported or re-verified, Component by Component.

- **Covers:** the Global `blocked-by` rule.
- **Notes:**
  - There is one Story per blocked Component. Each Story's `component:` is that Component.
  - Phase 7 is complete only when nothing is `blocked-by:testbench`.

#### Epic 61: Skeleton, Installer & `@xaravel/framework`

An App Developer runs `bun create xaravel invoices` and gets a Laravel-shaped htmx app that passes its own suite on SQLite and Postgres (UJ-1, UJ-3).

- **Covers:** FR-11, FR-15, FR-16, FR-17 (welcome and layout), FR-60.

### Phase 8: App services

#### Epic 62: Queue

App Developers dispatch jobs, chains, batches and closures on the sync, database and redis drivers, and run supervised workers.

- **Covers:** FR-85, FR-86, FR-87, FR-88.
- **Contents:** implements AD-13 and AD-24.

#### Epic 63: Concurrency

App Developers run tasks concurrently with `Concurrency.run()`, under DIV-4.

- **Covers:** FR-82.

#### Epic 64: Broadcasting

App Developers broadcast to authorized channels through the log, null and Pusher-protocol drivers.

- **Covers:** FR-91.

#### Epic 65: Notifications

App Developers send notifications over mail, database and broadcast, on demand or queued.

- **Covers:** FR-90.

#### Epic 66: Auth

App Developers authenticate, authorize with gates and policies, reset passwords and verify email.

- **Covers:** FR-92, FR-93, FR-94, FR-95.
- **Needs:** Epic 65, because password reset and email verification send Notifications.

#### Epic 67: Image

App Developers use Laravel 13's Image API through `Bun.Image`.

- **Covers:** FR-84 (Image).

#### Epic 68: MCP

App Developers define MCP servers with Tools, Resources and Prompts, over HTTP (guarded) or stdio.

- **Covers:** FR-104.

#### Epic 69: Boost app tools

App Agents introspect a Xaravel app (routes with Fragments, schema, last error, commands) and run its tests with structured failures, safely by default (UJ-6).

- **Covers:** FR-105, FR-106, FR-107, FR-110.
- **Contents:** ports the applicable `laravel/boost` tests.

#### Epic 70: Skeleton htmx auth pages & dashboard

A new app ships working htmx login, registration and password-reset pages and an authenticated dashboard. This meets the OQ-2 trigger for 13.x versioning.

- **Covers:** FR-17 (auth, OQ-10).

### Phase 9: Post-alpha (outline only)

#### Epic 71: Browser tests

App Developers drive a real browser against htmx pages with a Pest 4-style API on Playwright.

- **Covers:** FR-102.

#### Epic 72: AI SDK

App Developers define AI Agents with tools, streaming, embeddings and fakes, on the Vercel `ai` SDK.

- **Covers:** FR-103.
- **Note:** the `laravel/ai` Test IDs stay `deferred` until then.

#### Epic 73: Boost documentation search

App Agents search the installed version's docs offline.

- **Covers:** FR-108.

#### Epic 74: Laravel 14 re-sync

Xaravel moves its Baseline Pin to Laravel 14, and the Inventory diff becomes backlog.

- **Covers:** FR-7 applied to a major version (PRD §5.3).
- **Note:** the other post-alpha items (MySQL, MariaDB and SQL Server drivers, Redis Cluster, SQS and Beanstalkd, extra mail transports, `email:spoof`, Windows) become Phase 9 Stories in their owning Epics' packages.

## Epic 1: Monorepo, guardrails & release pipeline

The Maintainer can hand the repository to unattended Framework Agents, knowing that they can push only Story branches and cannot touch the grader. Only the Maintainer can release.

**Covers:** FR-10, FR-12, FR-13, FR-14, FR-112; NFR-1, NFR-5, NFR-8, NFR-11. **Implements:** AD-2, AD-16, AD-18, AD-21.

**Kind:** Conformance System, a Xaravel Component.
- Every acceptance criterion below is verified by at least one Xaravel Test `XT-conformance-<n>` that declares the FR consequence or AD rule it checks (FR-115). Sprint planning allocates the IDs.
- Every Story is a Maintainer-approved Infrastructure Story (FR-112).
- Until Epic 5 delivers the harness, these Xaravel Tests run under plain `bun test`. Epic 5 moves them onto `xaravelTest`.

### Story 1.1: Root workspace and repository baseline

As the Maintainer,
I want the `xaravel/framework` repository initialised as a Bun workspace with its Protected root configuration, licence and notices,
So that every later Story starts from one pinned toolchain and one legal baseline.

**Acceptance Criteria:**

**Given** a fresh clone
**When** `bun install` runs
**Then** it succeeds on Bun 1.4.3, as pinned in `.bun-version`
**And** the root `package.json` declares the Bun workspaces (`packages/*`, `skeleton`, `installer`, `tools/*`), the single lockstep `version` (`0.0.0`) and `engines.bun >= 1.4`.

**Given** `tsconfig.base.json`
**When** it is inspected
**Then** it sets `strict: true` and ESM module resolution, and has no `experimentalDecorators` (AD-4)
**And** a test fails if any `tsconfig*.json` in the repo sets `experimentalDecorators`.

**Given** the root `bunfig.toml`
**When** a script loads a `.env` file placed at the repo root
**Then** none of its values reach `process.env`, because `env = false` is set at the top level (Consistency Conventions).

**Given** the root files
**When** they are inspected
**Then** these exist:
- `.oxlintrc.json`, a baseline config;
- `.gitattributes`, with LF endings for `*.jsonl` and `*.ts`;
- `conformance/baseline-pin`, containing `v13.37.0`.

**Given** the root files
**When** `LICENSE`, `README.md` and `SECURITY.md` are inspected
**Then** `LICENSE` is MIT and carries both Laravel's copyright notice and Xaravel's (NFR-8)
**And** `README.md` describes the project as "a TypeScript port of Laravel" and states that it is not affiliated with or endorsed by Laravel Holdings Inc.
**And** `SECURITY.md` sets out a disclosure process (NFR-5).

### Story 1.2: Package scaffolder and every package scaffolded

As a Framework Agent,
I want every package to exist from day one with a generated manifest and tsconfig,
So that I can work inside `packages/<component>/` without creating packages or wiring references myself.

**Acceptance Criteria:**

**Given** the committed package table `tools/scaffold/packages.jsonl`
**When** it is inspected
**Then** it has one row per package named in AD-2, AD-19, AD-22 and the capability map, with its Phase and its `illuminate/*` `require` and `suggest` lists taken from Upstream `composer.json` at the Pin
**And** Foundation's row is derived from code imports, because Upstream Foundation has no `composer.json`.

**Given** the table
**When** `bun run scaffold` runs
**Then** each package gets:
- a `package.json` named `@xaravel/<name>`, with `engines.bun >= 1.4`, no `sideEffects: false` and no default exports;
- a generated `tsconfig.json` that extends `tsconfig.base.json`;
- `src/`, `tests/ported/`, `tests/xaravel/` and `docs/`;
- a `README.md` and a `LICENSE` carrying Laravel's notice.

**And** the Installer is named `create-xaravel`, and `tools/boost-framework` is a private workspace.

**Given** the scaffolded packages
**When** dependencies are inspected
**Then** each `require` entry is a `workspace:*` dependency, and each `suggest` entry is an optional `peerDependency`
**And** every package may depend on `@xaravel/runtime` and `@xaravel/contracts` (FR-10).

**Given** the scaffolded repo
**When** the root `tsc -b` runs
**Then** it builds every package as its own project reference, with `types` limited to its dependencies, and succeeds on the empty packages.

**Given** a package whose `tsconfig.json` differs from its generated form
**When** the tsconfig check runs
**Then** it fails and names the package (AD-2).

### Story 1.3: Dependency-graph check

As the Maintainer,
I want CI to reject cycles, undeclared imports and illegal edges,
So that parallel Epics can't couple packages behind each other's backs.

**Acceptance Criteria:**

**Given** a fixture in which package A depends on B and B depends on A
**When** the graph check runs
**Then** it fails and prints the cycle.

**Given** a static `import` of a package not listed in the importer's `dependencies`
**When** the check runs
**Then** it fails and names the file, the import and the missing dependency.

**Given** a dependency on a package of a later Phase than `@xaravel/foundation` (fixture)
**When** the check runs against Foundation
**Then** it fails, because Foundation may import only Components of its own or earlier Phases (AD-2).

**Given** a graded package with a runtime dependency on `@xaravel/assert`
**When** the check runs
**Then** it fails
**And** the only allowed exceptions are `@xaravel/testing` → `@xaravel/mockery` and `@xaravel/support`'s optional peer on mockery.

**Given** a dev-only edge from test files to an earlier-Phase package
**When** the check runs
**Then** that edge is excluded from the cycle check and passes.

**Given** a package that lists `@xaravel/collections` in `dependencies` without importing it
**When** the check runs
**Then** it passes. The check is about undeclared imports, not unused dependencies.

### Story 1.4: Protected Paths and the protected-paths check

As the Maintainer,
I want a single Protected list, mirrored into CODEOWNERS and enforced by a check that a PR can't modify,
So that no Story can alter the grader or its own checks (FR-112).

**Acceptance Criteria:**

**Given** `conformance/protected-paths`
**When** it is read
**Then** it contains exactly the globs listed in AD-16, including itself
**And** in `conformance/`, `expectations/`, `escalations/`, `oracle-requests/` and `fixtures/` are left out
**And** `packages/contracts` is marked `after-phase:1`.

**Given** `CODEOWNERS`
**When** the mirror check runs
**Then** every protected glob maps to the Maintainer, and the check fails if `CODEOWNERS` and the list diverge
**And** `conformance/fixtures/` is excluded from CODEOWNERS.

**Given** a PR from a `story/*` branch that modifies a file matching a protected glob
**When** the `protected-paths` workflow runs
**Then** it fails and lists each protected file touched.

**Given** a PR that changes the `protected-paths` workflow file itself
**When** checks run
**Then** the workflow that runs is the default branch's version (`pull_request_target`), which reads the PR diff as data and checks out no PR code.

**Given** an Infrastructure PR touching Protected Paths with an approving Code Owner review from the Maintainer
**When** the check runs
**Then** it passes. That review is the Infrastructure Story approval, and no label is needed.

### Story 1.5: Story manifests and edit-ownership check

As a Framework Agent,
I want my Story's scope to be machine-readable from the base branch,
So that CI tells me immediately when I edit outside my Story (AD-16, AD-21, NFR-10).

**Acceptance Criteria:**

**Given** `stories/<story-id>.md`
**When** its frontmatter is validated
**Then** it requires `story_id`, `epic`, `component`, `status`, and at least one of `test_ids` or `xaravel_test_ids`
**And** a manifest with neither fails validation, because a Story with no assigned tests can't be done.

**Given** a PR from branch `story/<story-id>`
**When** the ownership check runs
**Then** it reads the manifest from the base branch, never from the PR
**And** a branch name with no manifest on base fails.

**Given** a PR that changes files outside these paths
- `packages/<component>/**`
- `conformance/expectations/<component>/**`
- `conformance/oracle-requests/<story-id>.jsonl`
- `conformance/escalations/ESC-<story-id>-*.md`

**When** the check runs
**Then** it fails and lists the out-of-scope paths.

**Given** two open Stories whose manifests list the same Test ID
**When** the manifest check runs on `main`
**Then** it fails and names both Stories.

### Story 1.6: Escalation and decision records

As a Framework Agent,
I want a defined file format for raising an Escalation and a defined place for the ruling,
So that a stop is recorded with evidence, and approvals exist only in the repository (FR-114, AD-16).

**Acceptance Criteria:**

**Given** `conformance/escalations/ESC-<story-id>-<n>.md`
**When** it is validated
**Then** it requires frontmatter `test_ids`, `trigger` (one of the FR-114 triggers), `proposed` and `evidence`
**And** the file name must match the Story ID of the PR that adds it.

**Given** `decisions/ESC-<story-id>-<n>.md`
**When** it is validated
**Then** it requires `decision: approved | rejected` and the Maintainer's rationale.

**Given** an Escalation with no matching decision file
**When** a check calls the `escalationStatus(id)` library function
**Then** it returns `open`. It returns `approved` or `rejected` only when the decision file exists.

**Given** bot-raised Escalations
**When** they are validated
**Then** IDs of the form `ESC-bot-<n>` are accepted, with no Story ID.

### Story 1.7: Repository ruleset, workflow permissions and dependency audit

As the Maintainer,
I want `main` protected by rules that agents can't bypass, and least-privilege workflows,
So that the guardrails hold even if an agent identity is compromised (AD-16, NFR-5).

**Acceptance Criteria:**

**Given** the committed ruleset definition `.github/rulesets/main.json`
**When** `bun run ruleset:verify` compares it with the live ruleset through the GitHub API
**Then** they match:
- `protected-paths` and `ownership` are required checks;
- history must be linear;
- there are no bypass actors except the Maintainer;
- the merge queue is required.

**Given** every workflow under `.github/workflows/`
**When** the permissions check runs
**Then** each workflow's top-level permissions are `contents: read`
**And** write scopes appear only in jobs named in the allow-list (oracle, dashboard, release).

**Given** the agent push identity
**When** it pushes to any ref outside `story/*`
**Then** the push is rejected. A script checks this setting, and the Maintainer sets it up once and documents it in `docs/ops/identities.md`.

**Given** any PR
**When** checks run
**Then** `bun audit` runs, and a high or critical advisory fails the build (NFR-5).

### Story 1.8: Lockstep release workflow with provenance

As the Maintainer,
I want a release workflow that publishes every package at one version from an approved tag,
So that releases are reproducible and no agent can ever publish (FR-13, AD-18, NFR-11).

**Acceptance Criteria:**

**Given** the root `package.json` version
**When** `bun run release:stamp` runs
**Then** every package's `version` equals the root version
**And** a version check fails CI if any package differs.

**Given** a pushed tag that matches `v0.<n>.<p>` and equals the root version
**When** the release workflow runs in its protected `release` environment, which requires the Maintainer's approval
**Then** for each public package it runs `bun pm pack` and then `npm publish <tgz> --provenance` through trusted publishing
**And** no packed manifest contains `workspace:`.

**Given** a tag that doesn't match `v0.<n>.<p>`, or doesn't equal the root version
**When** the workflow triggers
**Then** it exits without publishing and explains why.

**Given** the generated release notes
**When** they are inspected
**Then** they state the Baseline Pin, read from `conformance/baseline-pin`.

**Given** every other workflow
**When** the release-authority check runs
**Then** none has `id-token: write` or runs `npm publish`, and the check fails if one does
**And** `docs/ops/release.md` documents the one-time bootstrap publish of a new `@xaravel/*` name by the Maintainer.

## Epic 2: Upstream snapshot, Oracle image, Test Inventory & pin bump

The Maintainer knows the complete denominator: every Upstream test case at the Pin, with a stable ID, its Component, its backends, its Upstream assertions and its Oracle outcome. The Maintainer can also move the Pin at a freeze point and get the diff as backlog.

**Covers:** FR-1, FR-7; also FR-6 (the Oracle runs in a container). **Implements:** AD-15 (Inventory, Upstream snapshot, Oracle image).

**Kind:** Conformance System, a Xaravel Component. Every acceptance criterion is verified by an `XT-conformance-<n>` test.

### Story 2.1: Upstream snapshot and Pin record

As the Maintainer,
I want a read-only, verifiable snapshot of every Upstream repository at the Pin,
So that every tool and agent reads exactly the same Upstream source (FR-1, AD-15).

**Acceptance Criteria:**

**Given** `conformance/baseline-pin`
**When** `bun run upstream:sync` runs
**Then** it checks out `laravel/framework` at the pinned tag into `conformance/upstream/framework/`
**And** it checks out `laravel/ai`, `laravel/mcp` and `laravel/boost` at their Maintainer-recorded tags into `conformance/upstream/{ai,mcp,boost}/`.

**Given** a synced snapshot
**When** the snapshot check runs in CI
**Then** each directory's tree hash matches the hash recorded in `conformance/baseline-pin`, and any local modification fails the check.

**Given** a developer machine with no network
**When** a tool reads Upstream source
**Then** it reads only from `conformance/upstream/` and never fetches.

### Story 2.2: Oracle container image

As a Framework Agent,
I want PHP Laravel at the Pin packaged as a container,
So that expected values come from real PHP without anyone installing PHP (FR-6, OQ-9).

**Acceptance Criteria:**

**Given** `conformance/oracle/Dockerfile` and a committed `composer.lock`
**When** the image builds
**Then** it contains PHP 8.5.11 and the Upstream snapshot with its dev dependencies, including PHPUnit, Pest, Mockery and Orchestra Testbench
**And** two builds from the same commit produce the same installed package set.

**Given** the image
**When** CI publishes it
**Then** it is pushed to the GitHub container registry, tagged with the Pin and the lockfile hash
**And** only the Oracle job can push it.

**Given** a contributor without Docker
**When** they run any harness command
**Then** nothing requires the image. The Oracle is needed only by the Oracle and Inventory jobs.

### Story 2.3: Test-directory → Component map

As the Maintainer,
I want a written, signed-off mapping from Upstream test paths to Components,
So that every Test ID is attributed to exactly one Component (FR-1).

**Acceptance Criteria:**

**Given** `conformance/component-map`
**When** it is validated against the Upstream snapshot
**Then** every Upstream test file maps to exactly one Component, and an unmapped or doubly mapped file fails the check.

**Given** the map
**When** it is inspected
**Then** it includes the hand remaps from the anatomy research:
- Collections ← `SupportArrTest`, `SupportCollectionTest`, `SupportLazyCollectionTest`, `SupportLazyCollectionIsLazyTest`
- Macroable ← `SupportMacroableTest`
- Conditionable ← `tests/Conditionable` and `SupportConditionableTest`
- Reflection ← `SupportReflectorTest`, `SupportReflectsClosuresTest`
- Foundation ← `tests/Integration/Generators`
- Database ← `tests/Integration/Migration`
- Log ← `tests/Integration/Log/Context*`
- Foundation ← `tests/Http/Middleware/{TrimStringsTest,PreventRequestForgeryTest,VitePreloadingTest}`, because their classes live in `Foundation/Http/Middleware` or need Foundation's Vite
- Foundation (deferred) ← `tests/Foundation/Cloud/**` and `tests/Foundation/LaravelCloudJsonFormatterTest.php`, tagged `deferred:foundation-cloud`

**Given** the map
**When** it is inspected
**Then** it also records, for each Component, the FQCN namespaces and container aliases it owns, for use by `BlockedByComponentError`.

**Given** a change to the map
**When** it is proposed
**Then** it lands only through Maintainer Code Owner review, because the map is a Protected Path.

### Story 2.4: PHPUnit Test Inventory for `laravel/framework`

As the Maintainer,
I want every `laravel/framework` test case listed with a stable Test ID and its metadata,
So that the conformance denominator covers the whole suite (FR-1).

**Acceptance Criteria:**

**Given** the Oracle image and the snapshot
**When** `bun run inventory` runs
**Then** it writes `conformance/inventory/<component>.jsonl`, with one line per test case: `id` (`<FQCN>::<method>#<dataset>`), `component`, `kind` (unit or integration), `backends`, `source` (path and line range) and `hash`.

**Given** a test with a `#[DataProvider]` or `#[TestWith]`
**When** it is inventoried
**Then** each dataset is a separate entry, including datasets computed at runtime
**And** an unnamed dataset uses its numeric index.

**Given** the backend tags
**When** they are derived
**Then** `#[RequiresDatabase]`, the `tests/Integration/Database/<Engine>` directories, `InteractsWithRedis` and the queue-driver suites determine `backends`
**And** everything else is `none`.

**Given** an entry's `hash`
**When** it is computed
**Then** it covers the test method body, normalised for whitespace and comments, and the dataset values.

### Story 2.5: Pest Test Inventory for `laravel/ai`, `laravel/mcp` and `laravel/boost`

As the Maintainer,
I want the three Pest suites inventoried in the same format,
So that AI, MCP and Boost conformance shares the same denominator rules (FR-1).

**Acceptance Criteria:**

**Given** the Oracle image
**When** `bun run inventory` runs
**Then** every Pest test in the three snapshots gets an entry with an ID of the form `<test-file-path>::<describe> > … > <test name>#<dataset>` and the same fields as Story 2.4.

**Given** a Pest `with()` dataset
**When** it is inventoried
**Then** each dataset is a separate entry.

**Given** the `laravel/ai` entries
**When** they are written
**Then** they are tagged with Component `ai`. Their Expectations later default to `deferred:ai-sdk`, set by Epic 5.

### Story 2.6: Upstream baseline run: assertion kinds and Oracle outcomes

As the Maintainer,
I want the Upstream suite run once inside the Oracle on every alpha backend, recording each test's outcome and assertion kinds,
So that the assertion floor and `upstream-skip` are checked against facts rather than estimates (FR-1, FR-3, FR-113).

**Acceptance Criteria:**

**Given** the Oracle job with SQLite, Postgres 18 and Redis 8.10.2 services
**When** the baseline run executes with a recording PHPUnit extension (and its Pest equivalent)
**Then** each inventory entry gains `assertions`, a multiset of the PHPUnit assertion kinds the test executed
**And** it gains `oracle`, the pass, skip or fail outcome per Backend Variant.

**Given** a test that Upstream skips or fails at the Pin on a variant
**When** the results are written
**Then** that variant's `oracle` value is `skip` or `fail`, which the `upstream-skip` check later relies on.

**Given** the run
**When** it repeats on the same Pin
**Then** the `assertions` values are identical, and any difference is reported as an Oracle non-determinism finding.

### Story 2.7: Inventory determinism and runner-listing cross-check

As the Maintainer,
I want CI to prove that the Inventory is reproducible and matches what the test runners actually run,
So that nobody can silently grow or shrink the denominator (FR-1).

**Acceptance Criteria:**

**Given** the committed Inventory
**When** the nightly job regenerates it from the same Pin
**Then** the output is byte-identical, and any difference fails the job.

**Given** `phpunit --list-tests` (or the JUnit output) and Pest's equivalent inside the Oracle
**When** the cross-check runs
**Then** the set of Test IDs equals the Inventory's set, and missing or extra IDs are listed.

**Given** a PR that edits `conformance/inventory/`
**When** checks run
**Then** it fails unless the PR is a Maintainer-approved Infrastructure Story, because the Inventory is Protected.

### Story 2.8: Baseline Pin bump tool

As the Maintainer,
I want to move the Pin at a freeze point and get the Inventory diff turned into backlog,
So that following Laravel releases is mechanical (FR-7, UJ-7).

**Acceptance Criteria:**

**Given** two Pins
**When** `bun run pin:bump <tag>` runs
**Then** it produces a report of added, changed and removed Test IDs
**And** "changed" means a different `hash` under the same ID.

**Given** a changed Test ID
**When** the bump is applied
**Then** its Expectations entries reset to `skip`, with reason `not-ported-yet`, and keep a link to the previous Ported Test file.

**Given** a test whose ID changed but whose hash didn't (a rename)
**When** the bump is applied
**Then** the new ID inherits the old status and history, and the old ID is retired.

**Given** removed Test IDs
**When** the bump is applied
**Then** their Expectations entries are retired.

**Given** added and changed Test IDs
**When** the bump is applied
**Then** they are written as backlog Story stubs, grouped by Component.

**Given** a requested bump while any Epic is in progress
**When** the tool runs
**Then** it refuses and lists the in-flight Epics, because the Pin can move only at a freeze point.

## Epic 3: Oracle fixtures, signing & Upstream scans

Framework Agents get trustworthy expected values from real PHP Laravel, signed so they can't be forged. The Upstream facts the spine depends on are extracted mechanically.

**Covers:** FR-6; also FR-100 and FR-116 (the usage scans). **Implements:** AD-14 (allowed identifiers), AD-15 (Oracle, fixtures, API surface), AD-26 (DIV-12 pairs, facades), AD-5 (singleton list, boot-only state).

**Kind:** Conformance System. Every acceptance criterion is verified by an `XT-conformance-<n>` test.

### Story 3.1: Oracle request format and mechanical extraction

As a Framework Agent,
I want the inputs of every Differential Test extracted mechanically from Upstream,
So that expected values trace back to Upstream inputs, not to hand-written guesses (FR-6).

**Acceptance Criteria:**

**Given** the request schema in `conformance/oracle/schema.json`
**When** a request is validated
**Then** it requires `id` (a Test ID or `XT` ID), `kind` (`php-expr`, `blade-render`, `sql-grammar`, `validation-message`, `date-format`, …), `input` and a `sha256` of the canonical request.

**Given** the extractor modules for each Differential family (Str, the SQL grammars, Blade render, validation messages, date formatting)
**When** `bun run oracle:extract` runs
**Then** it writes `conformance/oracle/requests/<component>.jsonl`, sorted, with one request per Differential Test ID × dataset.

**Given** the same snapshot
**When** extraction runs twice
**Then** the output is identical.

### Story 3.2: Batch fixture generation and Ed25519 signing

As the Maintainer,
I want one Oracle run per Pin that produces signed expected values for every extracted request,
So that fixtures are reproducible and can't be forged (FR-6, AD-15).

**Acceptance Criteria:**

**Given** the extracted requests
**When** the Oracle batch job runs
**Then** it writes `conformance/fixtures/<component>/<request-id>.json`, containing the request hash, the output, and an Ed25519 signature over both
**And** the private key exists only as a secret of that job.

**Given** the same Pin and the same requests
**When** the batch runs twice, as the nightly determinism re-check does
**Then** the outputs are identical, and any difference fails the job and opens an Escalation.

**Given** the verification key `conformance/oracle/oracle.pub`
**When** it is inspected
**Then** it is a Protected Path, and its fingerprint is recorded in `docs/ops/oracle.md`.

### Story 3.3: Fixture signature verification in CI

As the Maintainer,
I want every fixture's signature verified on every PR,
So that fixtures can live outside CODEOWNERS without anyone being able to forge one (AD-15).

**Acceptance Criteria:**

**Given** any fixture under `conformance/fixtures/`
**When** CI runs
**Then** a signature that doesn't verify against `oracle.pub`, or a request hash that doesn't match its request, fails the build and names the file.

**Given** a hand-edited fixture output (fixture test)
**When** CI runs
**Then** it fails.

**Given** `CODEOWNERS`
**When** it is inspected
**Then** `conformance/fixtures/` has no owner. The check from Story 1.4 still passes.

### Story 3.4: Per-Story Oracle requests

As a Framework Agent,
I want to request Oracle values for inputs the batch missed, from inside my Story,
So that new Differential Tests don't wait for the Maintainer (FR-6, AD-15).

**Acceptance Criteria:**

**Given** a Story PR that adds `conformance/oracle-requests/<story-id>.jsonl`
**When** the Oracle workflow runs on the PR
**Then** it validates every request against the schema and the Story's `test_ids` / `xaravel_test_ids`
**And** it runs them in the Oracle image, then commits signed fixtures to the Story branch as the `xaravel-oracle` GitHub App.

**Given** a request whose ID is not owned by the Story
**When** the workflow runs
**Then** it rejects that request and comments with the reason.

**Given** the committed fixtures
**When** Story 3.3's check runs
**Then** they verify.

### Story 3.5: API-surface export

As the Maintainer,
I want every public Upstream class member exported as data,
So that each package's TypeScript surface can be diffed against Laravel's (AD-15, PRD §5.1).

**Acceptance Criteria:**

**Given** the Oracle image
**When** `bun run oracle:api-surface` runs
**Then** it writes `conformance/api-surface/<component>.jsonl`, with one line per public class, interface, trait or function member: FQCN, member name, static flag, parameter names, defaults and nullability.

**Given** the export
**When** it runs twice on one Pin
**Then** the output is identical.

**Given** the Protected `conformance/api-surface/additions.jsonl` and `exceptions.jsonl`
**When** they are first created
**Then** they are empty, and their schema requires a citation (an FR, a DIV or a `deferred:` item) on every line.

### Story 3.6: Upstream scans: facades, singletons and boot-only state

As a Framework Agent,
I want the facade method lists and the singleton bindings extracted from Upstream,
So that facade delegators are generated and singleton state is linted against facts (AD-5, AD-26).

**Acceptance Criteria:**

**Given** the snapshot
**When** `bun run scan:facades` runs
**Then** it writes `conformance/scans/facades.jsonl`, listing for each `Illuminate\Support\Facades\*` class its accessor, its root class and every `@method` signature.

**Given** the snapshot
**When** `bun run scan:singletons` runs
**Then** it writes `tools/lint-rules/singletons.json`, listing every class bound with `singleton()` by an Upstream provider at the Pin
**And** it seeds `conformance/boot-only-state` from the Upstream properties written only during `register` / `boot`.

**Given** the scan outputs
**When** they are proposed
**Then** they land only through Maintainer review, because they are Protected.

### Story 3.7: Upstream scans: closure identifiers, DIV-12 pairs and test-API usage

As a Framework Agent,
I want the closure allow-list, the property/method name pairs and the PHPUnit and Mockery usage lists extracted from Upstream,
So that the serializable-closure codec, `PORTING.md` and the grader each start from complete lists (AD-14, AD-26, FR-100, FR-116).

**Acceptance Criteria:**

**Given** the snapshot
**When** `bun run scan:closures` runs
**Then** it writes `allowed-identifiers.json`, listing every facade short name and global helper function name at the Pin.

**Given** the snapshot
**When** `bun run scan:div12` runs
**Then** it writes `conformance/scans/div12-pairs.jsonl`, listing every class where a property and a method share a name, classified as model-config, option-pair or method-plus-state.

**Given** the snapshot
**When** `bun run scan:test-api` runs
**Then** it writes `conformance/scans/phpunit-assertions.jsonl` and `conformance/scans/mockery-api.jsonl`, listing every assertion and every Mockery method used by the Upstream suites, each with a usage count.

## Epic 4: Grader packages, `@xaravel/assert` & `@xaravel/mockery`

Ported Tests assert with PHPUnit's exact semantics and mock with Mockery's API, so a passing test means what it meant in PHP.

**Covers:** FR-100, FR-116; also FR-113 (assertion counting). **Implements:** AD-15 (grader isolation, declarations).

**Kind:** Xaravel Components (assert and Mockery).
- Every acceptance criterion is verified by an `XT-assert-<n>` or `XT-mockery-<n>` test.
- Differential checks of PHP comparison semantics use Story 3.4 Oracle requests.

### Story 4.1: PHP comparison core

As a Framework Agent,
I want `@xaravel/assert` to implement PHP `==` and `===` itself,
So that equality assertions grade TypeScript code exactly as PHPUnit graded PHP (FR-116).

**Acceptance Criteria:**

**Given** the Oracle truth table of PHP 8.5 `==` and `===` over scalars, null, numeric strings, arrays (lists and maps, in different key orders) and objects (Story 3.4 requests)
**When** `phpLooseEquals` and `phpStrictEquals` run over the same values
**Then** every result matches the Oracle.

**Given** a value branded `Symbol.for('xaravel.php.array')`, or an object exposing `Symbol.for('xaravel.php.props')`
**When** it is compared
**Then** it is compared as a PHP array or object, detected by brand, without importing `@xaravel/runtime`.

**Given** `@xaravel/assert`'s package graph
**When** the graph check runs
**Then** it has no dependency on any graded package
**And** its exports and prototypes are frozen when it loads, so assigning to one throws.

### Story 4.2: `portedTest` and `xaravelTest` declarations with assertion counting

As a Framework Agent,
I want one way to declare a Ported Test or a Xaravel Test, with assertions counted by kind,
So that traceability and the assertion floor are automatic (FR-2, FR-113, FR-115).

**Acceptance Criteria:**

**Given** `portedTest('<Test ID>', { case, dataset }, async function () { … })`
**When** it runs under `bun test`
**Then** `this` is an instance of `case`
**And** each dataset becomes one test labelled with its full Test ID
**And** if the runtime protocol `globalThis[Symbol.for('xaravel.scope.run')]` exists, the body runs inside a `test` frame opened through it.

**Given** a Ported Test that executes zero assertions
**When** it finishes
**Then** it fails with "zero assertions" (FR-113).

**Given** any test
**When** it finishes
**Then** the multiset of assertion kinds it executed is reported to the harness reporter API.

**Given** `xaravelTest('XT-<c>-<n>', '<FR consequence>', fn)`
**When** it is declared
**Then** an empty consequence string throws when the test is declared.

### Story 4.3: Core PHPUnit assertions

As a Framework Agent,
I want the equality, type, count, containment, array and string assertions,
So that most Upstream tests translate one assertion to one assertion (FR-116).

**Acceptance Criteria:**

**Given** the assertions in `phpunit-assertions.jsonl` from these families: equality and identity, booleans and null, types and `instanceOf`, counts and emptiness, containment, array keys and subsets, string prefixes, suffixes and formats, and numeric comparisons
**When** each is called with passing and failing inputs
**Then** it passes or fails exactly as PHPUnit does, with failure messages naming expected and actual values.

**Given** `assertSame` on arrays with equal values in a different key order
**When** it runs
**Then** it fails. `assertEquals` on the same input passes, per PHP `==` (FR-116).

**Given** `assertMatchesRegularExpression` with a pattern from an Upstream test
**When** it runs
**Then** it accepts a JS `RegExp`. Converting a PCRE literal follows the mechanical rule in `PORTING.md` (DIV-10).

### Story 4.4: Exception, output, file and JSON assertions, and the coverage report

As a Framework Agent,
I want the rest of PHPUnit's used assertions, `expectException` semantics and a report of anything not covered,
So that no Upstream test is blocked by a missing matcher (FR-116).

**Acceptance Criteria:**

**Given** `this.expectException(X)` followed by code that throws `X`
**When** the test runs
**Then** it passes, and statements after the throw don't execute
**And** if nothing throws, the test fails.

**Given** `expectExceptionMessage`, `expectExceptionCode` and the JSON, file and output assertions listed in the scan
**When** they are called
**Then** they behave as in PHPUnit.

**Given** `this.createMock(X)`
**When** it is called
**Then** it returns a PHPUnit test double (`MockObject`), as PHPUnit does (Story 4.7; ESC-4.4-2 item 6, ESC-4.7-1 item 4).

**Given** `phpunit-assertions.jsonl`
**When** the coverage report runs in CI
**Then** it lists every scanned assertion that has no implementation, and fails if any are missing.

### Story 4.5: Mockery core

As a Framework Agent,
I want `mock(X).shouldReceive('m').once().with(1).andReturn(2)` with Mockery's semantics,
So that the 226 Upstream files that use Mockery translate directly (FR-100).

**Acceptance Criteria:**

**Given** `mock(X)` with expectations that use `shouldReceive`, `once`, `twice`, `times`, `never`, `atLeast`, `atMost`, `with`, `withArgs`, `withAnyArgs`, `andReturn`, `andReturnValues`, `andThrow` and `ordered`
**When** the mock is used as Mockery's documentation describes
**Then** each expectation is matched and returns as Mockery does.

**Given** an unmet expectation
**When** the test finishes
**Then** the test fails with Mockery's message, and the expectation counts as an assertion (FR-100).

**Given** a call that matches no expectation
**When** it happens
**Then** it throws `BadMethodCallException`, as Mockery does.

### Story 4.6: Mockery advanced and API coverage

As a Framework Agent,
I want spies, partial mocks, argument matchers and the rest of Mockery's used API,
So that every Upstream use is covered (FR-100).

**Acceptance Criteria:**

**Given** `spy()`, `partialMock()` / `makePartial()`, `shouldIgnoreMissing`, `byDefault`, `andReturnUsing`, `andReturnSelf`, `Mockery.on()`, `Mockery.type()`, `Mockery.any()` and `shouldHaveReceived`
**When** they are used
**Then** they behave as Mockery does.

**Given** a mocked Eloquent model (a class whose instances carry the `MODEL_STATE` symbol)
**When** members are defined on the mock
**Then** they go through the `MODEL_STATE` escape and never through the model Proxy's `defineProperty` trap (AD-7).

**Given** `mockery-api.jsonl`
**When** the coverage report runs
**Then** it lists every scanned Mockery API that has no implementation, and fails if any are missing
**And** a PHP-only API, such as `overload:` class aliasing, needs an approved Escalation to be excluded.

### Story 4.7: PHPUnit test doubles

As a Framework Agent,
I want PHPUnit's own MockObject API in the grader,
So that Laravel's tests that call `createMock`, `getMockBuilder` and `createStub` port as written (ESC-4.4-2 item 6; Epic 4 retro R1).

**Acceptance Criteria:**

**Given** `this.createMock(X)`, `this.createStub(X)` and `this.getMockBuilder(X)->…->getMock()`
**When** a Ported Test drives the double with `expects(this.once())`, `->method('m')`, `->with(…)`, `->willReturn(…)`, `->willReturnCallback(…)`, `->willReturnMap(…)`, `->willReturnSelf()` and `->willThrowException(…)`
**Then** each behaves, counts and fails as PHPUnit 13's does, with PHPUnit's failure messages
**And** `createMock` no longer goes through `@xaravel/mockery`.

**Given** `addToAssertionCount(n)`, `stringContains`, `assertArraySubset` and the invocation matchers `once()`, `never()`, `any()`, `exactly(n)`, `atLeastOnce()`
**When** they are used
**Then** each matches PHPUnit's behaviour, and `assertArraySubset` records the kind `assertThat`, as the Inventory does (ESC-4.3-1 item 8).

### Story 4.8: `jasonmccreary/double` port

As a Framework Agent,
I want `JMac\Testing\Double`'s `returns`, `throws` and `resolves` in the grader,
So that the ai, mcp and boost suites' tests that use them port as written (ESC-4.6-1 item 6).

**Acceptance Criteria:**

**Given** the Upstream suites' uses of `returns`, `throws` and `resolves`
**When** they run against the port
**Then** each behaves as the PHP library does
**And** `bun run mockery:coverage` lists none of the three as pending.

## Epic 5: Harness, Expectations File, Ratchet & CI pipeline

Every Story's result is measured the same way locally and in CI, any drift from the Expectations File fails the build, and agents in parallel worktrees never share backends.

**Covers:** FR-2, FR-3, FR-4, FR-9, FR-113, FR-115; NFR-6, NFR-7 (the harness side), NFR-10. **Implements:** AD-15 (expectations, variants, `blocked-by`), AD-16 (bots, line ownership), AD-17, AD-28.

**Kind:** Conformance System. Every acceptance criterion is verified by an `XT-conformance-<n>` test.

### Story 5.1: Variant vocabulary and Expectations File

As the Maintainer,
I want every Test ID × Backend Variant to have exactly one expected status, in shards that parallel Stories never share,
So that the denominator is explicit and Stories don't conflict on merge (FR-3, AD-15).

**Acceptance Criteria:**

**Given** `conformance/variants`
**When** it is read
**Then** it is a closed vocabulary: `none`, `sqlite`, `pgsql`, `redis`, and `<driver>@<backend>` entries such as `queue-database@pgsql` and `session-redis@redis`.

**Given** the Inventory
**When** `bun run expectations:init` runs
**Then** every Test ID × Variant gets one line in `conformance/expectations/<component>/<Upstream test path>.jsonl`, with fields `id`, `variant`, `status: skip`, `reason: not-ported-yet`, `adapted: null` and `escalation: null`
**And** `laravel/ai` entries get `reason: deferred:ai-sdk`.

**Given** all the shards
**When** the uniqueness check runs
**Then** an `(id, variant)` pair that appears zero times, or more than once, fails the check
**And** shards must be sorted, UTF-8 and LF.

### Story 5.2: Skip Reason rule checks

As the Maintainer,
I want CI to validate every Skip Reason against its rule,
So that no agent can raise conformance by mislabelling a test (FR-3, SM-C1).

**Acceptance Criteria:**

**Given** a `blocked-by:<c>` entry
**When** checked
**Then** it fails unless `<c>` belongs to a later Phase than the test's Component, according to the package table.

**Given** an `intentional-divergence:DIV-<n>` entry
**When** checked
**Then** it fails unless `decisions/DIV-<n>.md` exists.

**Given** a `php-only` entry
**When** checked
**Then** it fails unless its `escalation` is approved (Story 1.6).

**Given** an `upstream-skip` entry
**When** checked
**Then** it fails unless the Inventory's `oracle` value for that variant is `skip` or `fail` (Story 2.6).

**Given** a `deferred:<item>` entry
**When** checked
**Then** it fails unless `<item>` is in the Protected `conformance/deferred-items` list, transcribed from PRD §7.2.

**Given** an `out-of-scope:<NG-N>` entry
**When** checked
**Then** it fails unless `<NG-N>` is in `conformance/non-goals`.

**Given** a `skip` with no reason, or an unknown reason
**When** checked
**Then** it fails.

**Given** a `quarantined` entry
**When** checked
**Then** it fails unless its `escalation` is open.

**Given** the precedence rule in FR-3
**When** it is documented in `conformance/README.md`
**Then** the documentation lists the order, and the reviewers' checklist (Epic 8) references it.

### Story 5.3: Harness runner and greppable report

As a Framework Agent,
I want one command that runs Ported Tests per variant and compares the results with the Expectations File,
So that I see exactly which Test IDs differ (FR-9, FR-113).

**Acceptance Criteria:**

**Given** `bun run harness`
**When** it runs
**Then** it executes `bun test` with the Protected root `bunfig.toml` once per variant, setting `XARAVEL_VARIANT`
**And** it fails immediately if any package-level `bunfig.toml` exists.

**Given** results that differ from expectations
**When** the report prints
**Then** there is one line per differing Test ID × variant, in the form `<STATUS> <id> [<variant>] expected=<x> actual=<y> asserts=<n>/<upstream n>`
**And** a summary line closes the report.

**Given** a Ported Test whose assertion-kind multiset is smaller than the Inventory's `assertions`
**When** the run finishes
**Then** it is reported as an assertion-floor failure, unless its expectation carries an `adapted` marker whose DIV clause allows fewer assertions (FR-113).

**Given** a test that fails with `BlockedByComponentError(<c>)`
**When** its expectation is `blocked-by:<c>`
**Then** it counts as matching. Any other failure under a `blocked-by` expectation is a mismatch (AD-15).

**Given** a local machine without Postgres or Redis running
**When** the harness runs
**Then** those variants are printed as `NOT-RUN`, are not counted as failures and are never written to the Expectations File.

**Given** declared tests that run concurrently, an assertion recorded after its test has ended, and code under test that patches a JavaScript intrinsic (`Object.prototype`, `AsyncLocalStorage.prototype`, bun's `test`)
**When** the harness runs
**Then** counts never mix between tests, a late assertion fails its test instead of going uncounted, and the intrinsics are frozen before any Ported Test loads (Epic 4 retro S4; spec-4-1 and spec-4-2 deferrals).

### Story 5.4: Fast mode, seeds and filters

As a Framework Agent,
I want a sampled fast mode and filters,
So that I can iterate in seconds and reproduce any sample (FR-9, NFR-7).

**Acceptance Criteria:**

**Given** `bun run harness --fast`
**When** it runs
**Then** it prints the seed it used, and samples Test IDs deterministically from that seed.

**Given** `--seed <s>`
**When** it is used twice on the same commit
**Then** it runs the same sample.

**Given** `--component <c>`, `--id <glob>` or `--story <story-id>`
**When** one is used
**Then** only the matching Test IDs run, and `--story` reads the Story's `test_ids` from its manifest.

**Given** a run in fast mode
**When** its results are compared with expectations
**Then** the report notes that it is a sample, and fast mode never satisfies the Story done check.

**Given** the committed `conformance/api-surface/*.jsonl`
**When** a Ported Test loads
**Then** `globalThis[Symbol.for('xaravel.api.signature')]` is installed: `(fqcn, member)` returns that member's surface row (`returns`, `nullable` and `parameters`), or null when there is none (ESC-4.8-1 item 1; moved from Story 5.3, whose spec predates the ruling).

### Story 5.5: Backend isolation per worktree

As a Framework Agent,
I want my worktree's databases and Redis kept apart from every other agent's,
So that parallel agents on one machine can't corrupt each other's runs (AD-17).

**Acceptance Criteria:**

**Given** a worktree
**When** the harness starts
**Then** it derives the key from the first 8 hex characters of SHA-256 over the worktree path and its git worktree creation id
**And** Postgres databases are named `xaravel_test_<key>[_<name>]` and recreated at the start of every full run.

**Given** the SQLite variant
**When** tests run
**Then** all database files live under the worktree's `.cache/`.

**Given** the Redis variant locally
**When** the harness starts
**Then** it launches one `redis-server` per worktree on a unix socket in `.cache/`, with no persistence, and tests may `flushdb` it.

**Given** a second harness started in the same worktree
**When** `.cache/harness.lock` is held
**Then** the second harness exits with a message naming the lock holder.

**Given** two worktrees running in parallel (fixture)
**When** both drop and recreate their databases
**Then** neither touches the other's.

### Story 5.6: Ratchet and Expectations line ownership

As the Maintainer,
I want CI to fail on any result that differs from the Expectations File, and on any Expectations change outside the Story's own Test IDs,
So that conformance only moves honestly (FR-4, AD-16).

**Acceptance Criteria:**

**Given** a PR run
**When** a test fails or passes against its expectation
**Then** the `ratchet` check fails and lists every unexpected failure and every unexpected pass.

**Given** a Story PR
**When** it changes Expectations lines or `portedTest` blocks whose IDs are not in its `test_ids`
**Then** the ownership check fails and lists them.

**Given** a change of an entry from `pass` to any other status
**When** the PR has no approved Escalation covering that Test ID
**Then** the check fails.

**Given** an unexpected pass of a Test ID owned by no open Story
**When** it happens on `main`
**Then** it is a warning. If the Test ID is owned by another open Story, it fails only that Story's next run.

**Given** an accepted per-Story Oracle request (`conformance/oracle-requests/<story-id>.jsonl`) that a later batch extraction or another Story's file also produces
**When** `oracle:verify-fixtures` and `oracle:story` run
**Then** the already-merged file stays valid: the batch skips a request a merged per-Story file holds, and between two per-Story files the earlier-merged Story owns it, not the first by file name (Epic 3 retro R5).

### Story 5.7: CI pipeline: PR checks, merge queue and nightly matrix

As the Maintainer,
I want the per-PR, merge-queue and nightly jobs defined as AD-28 specifies,
So that two green PRs can't leave `main` red, and the full matrix still runs regularly (AD-28, NFR-1, NFR-6).

**Acceptance Criteria:**

**Given** a Story PR on linux-x64
**When** CI runs
**Then** it runs:
- lint and typecheck;
- the protected-paths, ownership and dependency-graph checks;
- `bun audit`;
- the Ratchet over the AD-2 reverse-dependency closure of the changed packages;
- a full (not fast) run of the Story's `test_ids` on every variant, with SQLite, Postgres 18 and Redis 8.10.2 services.

**Given** the merge queue
**When** a PR enters it
**Then** the full Ratchet runs on all alpha variants, and the queue is required on `main`.

**Given** the nightly schedule
**When** it runs
**Then** the full matrix runs on linux and macOS, x64 and arm64, with Postgres and Redis installed natively on macOS
**And** the benchmark suite runs, reports, and never fails the job (NFR-6).

**Given** the `ratchet` check
**When** the ruleset is verified (Story 1.7)
**Then** `ratchet` is now among the required checks.

**Given** the committed Oracle fixtures and the Oracle image at the current Baseline Pin
**When** the nightly schedule runs
**Then** it re-evaluates every committed request, batch and per-Story, in that image, and fails naming each fixture whose output differs, so fixtures signed before a Pin bump cannot stay stale unnoticed (Epic 3 retro S5: the signature binds neither the Pin nor the image).

### Story 5.8: Promotion and quarantine bots

As the Maintainer,
I want flaky tests quarantined and unowned unexpected passes promoted automatically, each with an Escalation,
So that one flaky test can't stall every agent (FR-114, AD-16, AD-28).

**Acceptance Criteria:**

**Given** a test that fails on `main` and then passes on rerun, or gives inconsistent results across 3 runs
**When** the quarantine bot runs
**Then** it pushes a `bot/*` branch that sets the entry to `quarantined`, and opens `ESC-bot-<n>` with the run evidence.

**Given** an unowned unexpected pass on `main`
**When** the promotion bot runs
**Then** it opens a PR setting that entry to `pass`.

**Given** a bot PR that changes only Expectations `status` values
**When** the ownership check runs
**Then** it is exempt. A bot PR that changes anything else fails the check.

**Given** an `ESC-bot-<n>.md` that `oracle.yml`'s batch or nightly `determinism` job writes
**When** the job finishes
**Then** the bot commits it to `conformance/escalations/` through a `bot/*` PR, as for quarantine, instead of only uploading it as a workflow artifact (Epic 3 retro S6).

### Story 5.9: Xaravel Test coverage check and the Story done check

As the Maintainer,
I want a command that says whether a Story, or a Xaravel Component Epic, meets the done definition,
So that "done" is computed, not claimed (FR-115, PRD §3, NFR-10).

**Acceptance Criteria:**

**Given** `conformance/xaravel-consequences/<component>.jsonl`, transcribed from the PRD's FR consequences and the spine's AD rules (Protected)
**When** `bun run xt:coverage <component>` runs
**Then** it lists every consequence with no passing `xaravelTest` that declares it, and fails if any remain.

**Given** `bun run story:check <story-id>`
**When** it runs
**Then** it reports pass or fail for each done-definition clause:
- each assigned Test ID × Variant passes, or has a valid reason that isn't `not-ported-yet`;
- each assigned Xaravel Test passes;
- the PR has at least two approving reviews from distinct reviewer identities;
- the Story has no open Escalations;
- the last CI run was a full run.

**And** a manifest with no assigned tests fails.

**Given** the Epic 1 to Epic 4 Xaravel Tests
**When** this Story merges
**Then** they all run through `xaravelTest` under the harness.

**Given** a Story whose assigned Test IDs include Differential Tests
**When** `bun run story:check <story-id>` runs
**Then** it fails for each such Test ID with no verified fixture in its Component's `conformance/fixtures/` directory, and for each fixture whose output is an evaluation error (`stage: fatal`, or a `setup` error) where Upstream's expected outcome is not that error (Epic 3 retro S5 fixture-set completeness, R6)
**And** the Oracle evaluator applies `input.now` to Xaravel Test IDs, gives `validation-message` requests for Xaravel Test IDs a translator, and rejects, with a reason, Pest Test IDs the image cannot run, so none of these is signed as an error fixture (Epic 3 retro R6).

### Story 5.10: Portable development environment (devcontainer)

As a Framework Agent or a contributor on any machine,
I want one container definition that brings up the decided toolchain and the alpha backends,
So that the harness can run every alpha Variant the same way everywhere, with nothing installed on the host but Docker, while running natively stays fully supported (AD-17, AD-28, NFR-1, NFR-7).

**Acceptance Criteria:**

**Given** `.devcontainer/` (`devcontainer.json`, a Compose file and the workspace image's Dockerfile)
**When** it is started with the devcontainer CLI, or with plain `docker compose` and no Node on the host
**Then** the workspace container runs as a non-root user on linux/arm64 and linux/amd64, with Bun at `.bun-version`, the repo's locked dependencies installed by `bun install --frozen-lockfile`, and `redis-server` at the Redis version CI uses on `PATH`
**And** Postgres runs as a sidecar from the same image CI uses, reachable from the workspace through the `PG*` variables the harness reads
**And** the workspace, or at least its `.cache/`, is on a container volume rather than a host bind mount, and the container has no Docker socket (AD-17).

**Given** `bun run harness` inside the container
**When** it runs
**Then** no alpha Variant is `NOT-RUN`: Redis is the worktree's own `redis-server` on a unix socket in `.cache/`, and Postgres databases are the worktree's `xaravel_test_<key>` names (AD-17).

**Given** the container's pins
**When** the pin check runs
**Then** it fails if the Bun, Postgres or Redis version differs from `.bun-version`, the service images in `.github/workflows/baseline.yml` and the spine's Stack table.

**Given** a PR that changes `.devcontainer/**`, and the nightly run
**When** CI runs
**Then** one linux-x64 job builds the image and runs `bun run harness` inside it; the nightly matrix of Story 5.7 is not duplicated.

**Given** `docs/ops/devcontainer.md`
**When** a contributor or an agent reads it
**Then** it explains starting the container, running the harness and an agent session inside it headless, that a worktree used both inside and outside the container has two AD-17 keys, that the Oracle and Inventory tools run on the host or in CI, and that no secret or `APP_KEY` is baked into the image; Bun's `.env` autoload stays off.

**Given** a machine without Docker
**When** any harness command, tool or `story:check` runs natively on macOS or Linux
**Then** nothing requires the container: a backend that isn't running is `NOT-RUN`, as before (PRD OQ-9, Story 2.2, NFR-1).

## Epic 6: Static guardrails: lint rules, async surface & API-surface diff

The mistakes agents make most often are caught mechanically before review: floating Promises, identity by `constructor.name`, stray state writes and silent API drift.

**Covers:** NFR-3. **Implements:** the enforcement parts of AD-2, AD-4, AD-5, AD-6, AD-7, AD-9, AD-10, AD-15, AD-22, AD-23, AD-25 and AD-26.

**Kind:** Conformance System, with tooling under the Protected `tools/`.
- Every acceptance criterion is verified by an `XT-conformance-<n>` test that runs the rule over a failing fixture and a passing fixture.
- Rules over code that doesn't exist yet are proven on fixtures, and apply to packages as they are written.

### Story 6.1: Type-aware async-safety lint

As the Maintainer,
I want floating Promises, awaited non-thenables and misused Promises rejected by CI,
So that the commonest async bugs never reach review (NFR-3, AD-6).

**Acceptance Criteria:**

**Given** `.oxlintrc.json`, running oxlint 1.88.0 with oxlint-tsgolint 7.0.2004
**When** lint runs over `packages/*/src`, `packages/*/tests`, `skeleton/` and compiled-view snapshots
**Then** `no-floating-promises` (with `checkThenables: true`), `await-thenable` and `no-misused-promises` (with `checksVoidReturn: true`) are errors.

**Given** fixtures with an unawaited thenable builder, `await` on a plain value, and an async callback passed where a `void` return is expected
**When** lint runs
**Then** each one fails with the rule's name.

**Given** an `oxlint-disable` comment for any rule this spine names
**When** CI runs
**Then** it fails and names the comment's location (AD-16).

### Story 6.2: Lint rules for identity, values and test hygiene

As the Maintainer,
I want the spine's identity, value and test-hygiene rules enforced by custom lint,
So that Components built in parallel can't diverge on these conventions (AD-3, AD-7, AD-10, AD-15, AD-23).

**Acceptance Criteria:**

**Given** fixtures for each rule
**When** `tools/lint-rules` runs
**Then** each of these fails with the rule's name:
- `constructor.name` used for identity;
- `JSON.stringify` on a framework value in `packages/*/src`;
- `expect` imported from `bun:test` under `tests/ported`;
- a contract imported with `import type` for injection;
- `#private` in `Model` or its concerns;
- a default export from a package.

**And** each passing fixture passes.

### Story 6.3: Lint rules for async signatures, frame state and declarations

As the Maintainer,
I want the async-signature, state and declaration rules enforced,
So that per-unit state and injection metadata stay correct by construction (AD-4, AD-5, AD-6, AD-7, AD-25).

**Acceptance Criteria:**

**Given** fixtures for each rule
**When** `tools/lint-rules` runs
**Then** each of these fails:
- a public method returning `T | Promise<T>`;
- a thenable returned from an `async` function;
- a `this.<field>` assignment after construction in a class listed in `singletons.json`;
- an arrow-function test body in a file that calls `uses()`;
- `inject({...})` keys that differ from the parameter names or their order;
- a model column default that isn't a constant expression.

**And** each passing fixture passes.

**Given** `conformance/boot-only-state`
**When** `tools/lint-rules` runs
**Then** it flags a write to a listed property outside the class's `register` / `boot` path, so the file has a consumer before Phase 1 code uses it (Epic 3 retro S5)
**And** the known false entries (`QueueManager::$connectors`, `Gate::$afterCallbacks` and the others in spec-3-6's deferrals) are gone, removed by correcting the scan rule and regenerating, never by hand edit.

### Story 6.4: `async-surface.json` generator and drift check

As the Maintainer,
I want each package's async surface generated from its emitted types and checked in CI,
So that async-ness is decided by AD-6's rule, not by each agent (DIV-1, AD-6).

**Acceptance Criteria:**

**Given** a package's emitted `.d.ts` and its `@asyncRoot` JSDoc tags
**When** `bun run async-surface <pkg>` runs
**Then** it walks the declarations with `oxc-parser` and writes `async-surface.json`, with one line per Promise-returning public method and the root named in its tag, and one `thenable` line per public method that returns a thenable type, which needs no tag (Epic 6 retro S1, Maintainer ruling on item 7)
**And** the thenable type list comes from `@xaravel/contracts/async` when installed, and otherwise from the tool's fixture list
**And** a return type matches a thenable by its qualified name, resolved through its import, never by its short name alone, so `Schema\Builder` is not taken for `Query\Builder`.

**Given** a Promise-returning public method with no `@asyncRoot` tag
**When** the check runs
**Then** it fails and names the method.

**Given** a committed `async-surface.json` that differs from the regenerated one
**When** the merge queue runs
**Then** it fails with the diff.

### Story 6.5: API-surface diff

As the Maintainer,
I want each package's public TypeScript surface diffed against Upstream's, on every PR,
So that parity gaps are visible as they arise, and gate a Component's last Epic (AD-15, PRD §5.1).

**Acceptance Criteria:**

**Given** a package's `.d.ts` and `conformance/api-surface/<component>.jsonl`
**When** the diff runs
**Then** it reports missing, renamed and extra members, and parameter name, default or nullability mismatches.
**And** members are compared after applying the parity mappings: camelCase, named arguments as an options object (AD-26) and the DIV-12 renames.

**Given** an extra member listed in `additions.jsonl` with a citation, or a missing member listed in `exceptions.jsonl` with a citation
**When** the diff runs
**Then** that member counts as explained.

**Given** any PR
**When** the diff runs
**Then** it posts a per-Component summary and never fails the PR
**And** `bun run api-surface:gate <component>` fails while any unexplained member remains. That command is what a Component's last Epic is accepted against
**And** a Story manifest whose acceptance criteria say "`api-surface:gate <c>` passes" carries `api_surface_gate: <c>`; `story:check` then runs the gate for `<c>` and fails on any unexplained member, and a check fails when such an acceptance criterion in `epics.md` has no manifest carrying the field (Epic 6 retro S4, Maintainer ruling on item 8).

**Given** the API-surface export (`conformance/api-surface/*.jsonl`)
**When** it is generated
**Then** a post-load cross-check of `get_declared_classes()` against every class file under the Upstream `src/` fails, naming any class the static scan missed, so no class drops out of the surface silently (Epic 3 retro S5).

### Story 6.6: Duplicate-FQCN and registration scan

As the Maintainer,
I want every class registered once, under its Upstream FQCN,
So that two packages never own the same foreign or framework symbol (AD-10, AD-22).

**Acceptance Criteria:**

**Given** all `packages/*/src`
**When** the scan runs
**Then** an FQCN passed to `registerClass` in two packages fails and names both.

**Given** a framework file that exports a public class but doesn't end with `registerClass('<FQCN>', X)`
**When** the scan runs
**Then** it fails and names the file.

**Given** a package `package.json` with `"sideEffects": false`
**When** the scan runs
**Then** it fails.

**Given** the type-aware lint config
**When** `lint:disables` runs and a fixture uses a Promise as a condition
**Then** `no-misused-promises` is pinned with `checksConditionals: true` beside `checksVoidReturn: true`, a config that turns it off fails `lint:disables`, and the fixture fails lint (ESC-6.1-1).

## Epic 7: Conformance dashboard & Boost framework mode

The Maintainer reviews any Epic from evidence on one page (UJ-5). Framework Agents query their Test IDs, statuses, DIVs and Escalations through MCP (UJ-4).

**Covers:** FR-5, FR-109; also FR-114 (dashboard listing). **Implements:** AD-2 (Boost framework workspace), AD-15, AD-28 (dashboard publishing).

**Kind:** Conformance System and Boost (framework mode). Every acceptance criterion is verified by an `XT-conformance-<n>` or `XT-boost-<n>` test.

### Story 7.1: Conformance aggregator

As the Maintainer,
I want the Conformance Rate and the alpha-gate figure computed from the Inventory and the Expectations File,
So that every number on the dashboard has one definition (FR-5, SM-1).

**Acceptance Criteria:**

**Given** the Inventory and the Expectations File
**When** `bun run conformance:report` runs
**Then** it writes `report.json` with, for each Component and overall:
- passing pairs over all pairs, where the denominator includes `not-ported-yet`;
- counts per status and Skip Reason;
- the `adapted` count;
- the `fail-known` count, kept separate from skips.

**Given** the SM-1 rule
**When** the report is computed
**Then** it includes the alpha-gate figure: passing over Applicable Test IDs (excluding `php-only`, `upstream-skip`, `deferred` and `out-of-scope`), for the Phase 1–8 Components, on every alpha variant
**And** `quarantined`, `fail-known` and `intentional-divergence` count as not passing.

**Given** each push to `main`
**When** the report runs
**Then** it appends a history record, keyed by commit and Baseline Pin, to the dashboard's data branch.

### Story 7.2: Public dashboard and Epic review view

As the Maintainer,
I want a public page with the rates, history and every item that needs a decision,
So that I can accept or return an Epic from evidence (FR-5, UJ-5).

**Acceptance Criteria:**

**Given** a push to `main`
**When** the dashboard workflow runs
**Then** it publishes to GitHub Pages:
- overall and per-Component rates, always over the full denominator, with the alpha-gate figure beside them;
- counts per Skip Reason;
- each DIV ID linked to its Divergence Record;
- open Escalations with their Test IDs;
- Quarantined tests;
- the API-surface diff per Component.

**Given** the history records
**When** the history chart renders
**Then** it marks every Baseline Pin change and starts a new series after each one.

**Given** an Epic ID
**When** its review view opens
**Then** it shows:
- the Component's rate and Skip Reason counts;
- every Divergence Record and Escalation added since the Epic began;
- the Epic's diff summary (files and lines per Story).

### Story 7.3: Boost framework-mode MCP server

As a Framework Agent,
I want an MCP server inside the monorepo that answers conformance questions,
So that I don't have to parse JSONL files to find my work (FR-109, UJ-4).

**Acceptance Criteria:**

**Given** `tools/boost-framework`, whose only dependency is `@modelcontextprotocol/server` 2.3.1
**When** an agent connects over stdio
**Then** it offers these tools:
- `inventory.get` (by Test ID or glob);
- `expectations.status` (Test ID × variant);
- `conformance.rate` (by Component or overall);
- `story.tests` (a Story's `test_ids`);
- `divergence.get` (DIV ID → record and clauses);
- `escalations.open`.

**Given** a Test ID
**When** `inventory.get` is called
**Then** it returns the source path and line range in `conformance/upstream/` and the Upstream assertion multiset.

**Given** the repo's `.mcp.json`
**When** an agent session starts in a worktree
**Then** the server is registered for it.

### Story 7.4: Framework mode is read-only

As the Maintainer,
I want framework mode to be unable to change any file,
So that it can never become a path around the guardrails (FR-109).

**Acceptance Criteria:**

**Given** the server's tool list
**When** it is inspected
**Then** no tool writes files, runs commands or changes git state.

**Given** the server process
**When** it opens files
**Then** it opens only paths under `conformance/`, `stories/` and `decisions/`, read-only, and attempts outside those paths are refused.

**Given** a test that calls every tool
**When** it compares the worktree before and after
**Then** nothing has changed.

## Epic 8: `PORTING.md`, Divergence Records, Fidelity Review & pilot (Phase 0 exit)

Framework Agents have one written rulebook, two independent reviewers check every Story, and the whole loop has been proven on real Support and Collections tests before Phase 1 opens.

**Covers:** FR-8, FR-111, FR-114. **Implements:** AD-26 (`PORTING.md` rows), AD-16 (Escalations in practice), the OQ-4, OQ-8, OQ-11 and OQ-12 spikes.

**Kind:** Conformance System. Every acceptance criterion is verified by an `XT-conformance-<n>` test, or by a decision file the Maintainer signs.

**Gate:** Phase 1 Stories can't start until this Epic is accepted (Story 8.8).

### Story 8.1: Divergence Records DIV-1 to DIV-12

As a Framework Agent,
I want every Intentional Divergence written down, with numbered adaptation clauses,
So that each adapted assertion cites a rule, not a judgement (FR-8, PRD §5.2).

**Acceptance Criteria:**

**Given** `decisions/DIV-1.md` to `decisions/DIV-12.md`
**When** they are validated
**Then** each has a rationale, a behaviour section and at least one adaptation clause, numbered `DIV-<n>.<k>`
**And** their content matches PRD §5.2 and the spine ADs that each one cites.

**Given** DIV-11
**When** it is read
**Then** it includes the clause "no pcntl; job timeouts are enforced by the supervisor process" (AD-13).

**Given** DIV-12
**When** it is read
**Then** it includes `collection.get(0)`, the Model method renames and the absence of dynamic wheres.

**Given** an `adapted:DIV-<n>.<k>` marker in an Expectations entry or on an assertion line
**When** the marker check runs
**Then** it fails if clause `<n>.<k>` doesn't exist.

**Given** a clause whose adaptations may record fewer assertions than the Inventory
**When** its record is read
**Then** `decisions/DIV-<n>.md` lists `<k>` in a `fewer_assertions: [<k>, ...]` frontmatter list, and no other clause waives the harness's assertion floor (ESC-5.3-2).

### Story 8.2: `PORTING.md`

As a Framework Agent,
I want one rulebook for translating PHP to TypeScript,
So that every agent translates the same construct the same way (FR-8, AD-26).

**Acceptance Criteria:**

**Given** `PORTING.md`
**When** the `PORTING.md` gate check runs
**Then** every AD-26 construct row exists and is marked `decided`
**And** the file contains:
- the idiom table;
- the test-adaptation rules;
- the mechanical PHP→TS rule for expressions in test inputs and Blade templates;
- the by-reference and exception mappings;
- the frame-slot list (AD-5);
- the `APP_KEY` form for each consumer (AD-23);
- the `Promise.all` allow-list (AD-6);
- the DIV-12 pair list generated from `div12-pairs.jsonl`.

**Given** the mechanical expression rule
**When** it is applied to a sample of 20 PHP expressions taken from Upstream test inputs (fixture)
**Then** the translations match the committed expected TypeScript.

### Story 8.3: Bun primitive probes (OQ-11)

As the Maintainer,
I want each Bun primitive the PRD relies on probed by a test,
So that every gap is known before an Epic depends on it (OQ-11).

**Acceptance Criteria:**

**Given** Xaravel Tests under `conformance/probes/`
**When** they run on Bun 1.4.3
**Then** each one reports supported or unsupported for:
- `test.failing`, `skipIf`, per-test assertion counts, `setSystemTime`, preload `afterEach`;
- `Bun.sql` raw bindings and `reserve()`;
- `Bun.redis` commands, transactions and Pub/Sub;
- `Bun.S3Client` against a local S3-compatible service;
- `Bun.Image`;
- `AsyncLocalStorage` propagation across `await`, timers, stream bodies, async generators, `type: "direct"` streams and `Bun.serve` callbacks.

**Given** an unsupported primitive
**When** the probe report is reviewed
**Then** an Escalation is raised that proposes a `deferred:` item or a workaround, and the report links to its decision.

### Story 8.4: Temporal and bcrypt spikes, and the OQ-12 decision

As the Maintainer,
I want OQ-4 and OQ-8 resolved with evidence, and OQ-12 decided,
So that the Support (dates) and Hashing Epics start from settled ground.

**Acceptance Criteria:**

**Given** a probe suite covering Carbon's needs (timezone and DST arithmetic, month overflow and clamping, `startOf*` / `endOf*`, nanosecond instants, and PHP `date()` format tokens)
**When** it runs against Bun 1.4.3's `Temporal`
**Then** the report lists each need as covered or gap, and `decisions/OQ-4.md` records the Maintainer's ruling.

**Given** Story 3.4 Oracle requests for bcrypt hashes of passwords of 71, 72, 73 and 200 bytes, including multibyte
**When** Bun's `Bun.password.verify` runs with the input truncated to 72 UTF-8 bytes
**Then** each PHP-produced `$2y$` hash verifies, and `decisions/OQ-8.md` records the result.

**Given** OQ-12
**When** the Maintainer rules
**Then** `decisions/OQ-12.md` states whether security-relevant Upstream releases may trigger an out-of-cycle pin bump.

### Story 8.5: Fidelity Review workflow

As the Maintainer,
I want every Story reviewed against Upstream by two reviewer agents independent of the implementer,
So that weakened, removed or mislabelled assertions are caught before merge (FR-111).

**Acceptance Criteria:**

**Given** the Protected reviewer instructions `conformance/review/fidelity.md`
**When** they are read
**Then** the checklist covers:
- assertions match Upstream;
- no expected value is weakened;
- no assertion is removed without a DIV clause;
- every new Skip Reason is justified, and its precedence is right, citing the "Precedence" section of `conformance/README.md` (ESC-5.2-1);
- every `adapted` marker matches its clause;
- every Oracle fixture whose output is an error is the error Upstream's test expects (Epic 5 retro item 9; the Inventory does not record it yet);
- every Xaravel Test verifies the consequence it declares;
- no stub, fake or partial implementation of another Component;
- every `@asyncRoot` tag is true.

**Given** a Story whose implementation passes verification
**When** its review step runs
**Then** two reviewer agents, each in a fresh context and neither the implementer, apply the checklist to the diff
**And** at least one runs on the other agent CLI from the loop's (Codex when the loop runs `claude -p`, Claude when it runs Codex) when that CLI is available, falling back to the loop's own CLI otherwise, and its verdict records which CLI reviewed and why it fell back (ESC-8.5-1).

**Given** a reviewer's verdict
**When** it is recorded in the Story's spec, bound to the reviewed tree
**Then** a `reject` returns the Story to its implementer with the findings, and `story:check`'s `approvals` clause passes only with two `pass` verdicts for the head tree.

**Given** a Story PR that adds or changes `conformance/oracle-requests/<story-id>.jsonl`
**When** the Fidelity Review runs
**Then** the checklist requires each request's `setup` and `exprs` to match the Upstream test's inputs, or to carry a recorded reason, so a request cannot get arbitrary PHP signed as an expected value (Epic 3 retro R4).

### Story 8.6: Framework Agent operating instructions and stop rules

As a Framework Agent,
I want written instructions for the Story loop and the stop rules,
So that I escalate instead of guessing (FR-114, UJ-4, NFR-10).

**Acceptance Criteria:**

**Given** the repository's agent instructions (`AGENTS.md`; no `CLAUDE.md`, which would stop Claude Code reading `AGENTS.md`), written outside its `bmad:context` managed block
**When** they are read
**Then** they describe the loop: read the Story manifest, `PORTING.md` and the relevant DIVs; translate the tests; run `harness --fast --story`; implement; update your own Expectations lines; run the full Story tests; open the PR.

**Given** the instructions
**When** they are read
**Then** they list every FR-114 trigger
**And** they say that an Escalation stops work on its Test IDs only, and the agent continues with its other IDs.

**Given** the instructions
**When** they are read
**Then** they forbid stubbing another Component, and say that a test which needs a later-Phase Component is marked `blocked-by:<component>`.

### Story 8.7: `PORTING.md` pilot on Support and Collections

As the Maintainer,
I want the porting rules exercised on real Upstream tests before Phase 1,
So that `PORTING.md` is revised from evidence, not theory (FR-8).

**Acceptance Criteria:**

**Given** a pilot sample of at least 60 Test IDs, chosen by seed from `tests/Support/SupportCollectionTest.php`, `SupportArrTest.php`, `SupportStrTest.php` and `SupportStringableTest.php`, and spanning data providers, Mockery and PHP-array semantics
**When** a Framework Agent translates them by following `PORTING.md` alone
**Then** the translations type-check, meet the assertion floor against the Inventory, and pass a Fidelity Review.

**Given** the pilot
**When** it finishes
**Then** `docs/porting/pilot-report.md` lists every rule the translations hit, every ambiguity found, and the `PORTING.md` revision made for each one
**And** the pilot translations are kept on the `pilot/porting` branch as reference input for Epics 14 and 18, and are not merged.

### Story 8.8: Phase 1 gate

As the Maintainer,
I want CI to refuse Phase 1 work until the porting rules are merged and piloted,
So that FR-8's precondition is enforced, not just remembered.

**Acceptance Criteria:**

**Given** a Story manifest with an `epic` in Phase 1 or later
**When** its PR is checked
**Then** the gate fails unless all of these exist on `main`:
- `PORTING.md`, passing its gate check;
- DIV-1 to DIV-12;
- the pilot report;
- `decisions/PHASE-0-EXIT.md`, signed by the Maintainer.

**Given** the gate passes
**When** a Phase 1 Story PR is checked
**Then** the gate passes from then on.

## Epic 9: `@xaravel/runtime`: Scope Frames, Class Registry, PHP values & codecs

Every later package shares one sandbox, one class identity, one PHP value model and one serializer, so concurrent units never leak state and payloads interoperate with PHP.

**Covers:** FR-22; also FR-26 (`mixin`), FR-77 (`phpSerialize`), NFR-4 (`interleave`). **Implements:** AD-19 in full, and with it AD-4 (metadata), AD-5, AD-9, AD-10 and AD-23.

**Kind:** Xaravel Component.
- Every acceptance criterion is verified by an `XT-runtime-<n>` test.
- Behaviour that mirrors PHP is verified by Oracle Differential Xaravel Tests, using Story 3.4 requests.
- The package has zero dependencies.

**Order:** this is the first Epic of Phase 1.

### Story 9.1: Scope Frame primitive and `interleave`

As a Framework Agent,
I want one `AsyncLocalStorage`-backed frame primitive, and a helper that interleaves two units at every `await`,
So that every per-unit state in the framework has one home and one way to prove isolation (AD-5, NFR-4).

**Acceptance Criteria:**

**Given** `@xaravel/runtime/scope`
**When** it loads
**Then** it exports `currentFrame()`, `runInFrame(kind, fn)` and `frameSlot(key, init)`
**And** it installs `globalThis[Symbol.for('xaravel.scope.run')]`, which the grader calls without importing the runtime.

**Given** two units started with `interleave([a, b])`
**When** each writes and then reads a `frameSlot` across several `await`s
**Then** each unit reads only its own value at every step
**And** `interleave` switches units at every `await`, deterministically.

**Given** code with no active frame
**When** it writes to a frame slot
**Then** it throws `ScopeFrameException`.

**Given** the `@xaravel/runtime` package
**When** the graph check runs
**Then** it has no dependencies.

### Story 9.2: Frame kinds, defer list and context propagation

As a Framework Agent,
I want unit, narrow and child frames, an end-of-unit defer list, and frame propagation into streams and timers,
So that transactions, embedded test requests and deferred terminals behave as AD-5 specifies.

**Acceptance Criteria:**

**Given** a narrow frame that declares slots `x` and `y`
**When** code inside it reads or writes another slot
**Then** the read or write passes through to the enclosing unit frame.

**Given** a child unit opened inside a `test` frame
**When** it writes slots other than request, route and CSP nonce
**Then** those writes land in the test frame
**And** given a child unit inside a non-test frame, its own writes stay in the child.

**Given** a unit whose `defer` list holds pending Promises
**When** the unit's body returns
**Then** the unit ends only after every deferred Promise settles.

**Given** a frame active when a stream body, an async-generator body, a `type: "direct"` stream or a timer is created
**When** that body or callback later runs
**Then** `currentFrame()` returns the creating frame, because it is wrapped with `AsyncLocalStorage.bind` / `snapshot` (the Bun 1.4.3 gap).

### Story 9.3: Per-Application overlays and `frameStatic`

As a Framework Agent,
I want overlay storage keyed by Application and frame, and frame-scoped static setters,
So that Upstream static setters such as `Model.unguard()` never leak between units (AD-5).

**Acceptance Criteria:**

**Given** two Application objects (fixtures) and one frame
**When** each writes an overlay value under the same key
**Then** each Application reads only its own value.

**Given** `frameStatic(Class, key)`
**When** one unit sets the value and another unit reads it concurrently through `interleave`
**Then** the second unit sees the default
**And** after the first unit ends, its value is discarded.

**Given** `currentFrame()?.app`
**When** no frame is active
**Then** lookups fall back to the process's default Application, once one has been registered.

### Story 9.4: Class Registry and `fqcn()`

As an App Developer,
I want class-name strings to resolve to classes through one registry,
So that morph maps, queue payloads and configuration can name classes as Laravel does (FR-22, AD-10).

**Acceptance Criteria:**

**Given** `registerClass('App\\Models\\Post', Post)`
**When** `resolveClass('App\\Models\\Post')` and `fqcn(Post)` are called, and `fqcn(new Post())`
**Then** they return `Post`, the FQCN string, and the FQCN string again.

**Given** an unregistered name
**When** it is resolved
**Then** it throws an error naming the missing class (FR-22)
**And** `fqcn()` of an unregistered class also throws.

**Given** a different class registered under an existing key
**When** `registerClass` runs
**Then** it throws
**And** `registerTestClass(fqcn, X)` inside a test frame registers into that frame's overlay only.

**Given** a class already registered under one FQCN
**When** `registerClass` registers the same class under a different FQCN
**Then** it throws, naming both FQCNs, so `fqcn(X)` always has one answer
**And** `registration:check` fails on a `registerClass` call whose class is not declared in the same file, so each class has one owner (AD-22; Epic 6 retro R3, Maintainer ruling on item 9).

**Given** the first real `registerClass` calls in `packages/runtime`
**When** `registration:check` runs
**Then** it counts them, and the FQCN shape rule, the duplicate key and the registration recogniser are re-checked against these real files; any mismatch with the fixtures' behaviour raises an Escalation (Epic 6 retro V1, Maintainer ruling on item 9).

**Given** a PSR-4 map from `package.json` (`"xaravel": { "autoload": { "psr-4": {...} } }`)
**When** an async resolve misses
**Then** the registry maps the FQCN to a file, `await import()`s it, and returns the class that file registered
**And** `writeClassmap(path)` and `loadClassmap(path)` round-trip `bootstrap/cache/classes.json`.

### Story 9.5: `PhpArray`, `Ref`, float marker and null normalisation

As a Framework Agent,
I want the PHP value model as runtime types,
So that every Component represents arrays, references, floats and null the same way (DIV-9, AD-9).

**Acceptance Criteria:**

**Given** a `PhpArray` built with keys `"1"`, `"01"`, `1.7`, `true` and `null`
**When** its keys are read
**Then** they are normalised as PHP normalises array keys (to `1`, `"01"`, `1`, `1` and `""`), in insertion order, matching Oracle fixtures.

**Given** a `PhpArray` whose keys are `0..n-1` in order
**When** it is JSON-encoded
**Then** it encodes as a list
**And** any other key set encodes as an object.

**Given** `Ref<T>`
**When** a function writes through it
**Then** the caller sees the new value.

**Given** a value from PHP that is a float with an integral value
**When** it is marked with the runtime float marker
**Then** `isFloat(v)` is `true`, while the plain `number` stays usable.

**Given** `normalizeNull(v)`
**When** `v` is `undefined`
**Then** it returns `null`.

**Given** `hasBrand(ClassOrInstance, Token)`
**When** it is called
**Then** it reads a prototype brand without instantiating the class.

### Story 9.6: PHP semantics helpers

As a Framework Agent,
I want loose comparison, numeric-string and type-juggling helpers that match PHP 8.5,
So that ported code reproduces PHP behaviour instead of approximating it (PRD §5.1; AD-9, AD-19).

**Acceptance Criteria:**

**Given** the Oracle truth tables for `==`, `<=>`, `is_numeric`, `(int)`, `(float)`, `(string)` and `(bool)` over scalars, numeric strings, leading-whitespace strings, `"1e3"`, `INF` and `NaN`
**When** `looseEquals`, `spaceship`, `isNumeric`, `toInt`, `toFloat`, `toPhpString` and `toBool` run over the same inputs
**Then** every result matches the Oracle.

**Given** `valueCopy(x)` on a nested array or `PhpArray`
**When** the copy is mutated
**Then** the original is unchanged (PHP value-copy semantics).

### Story 9.7: `phpSerialize` / `phpUnserialize` codec

As an App Developer migrating from Laravel,
I want PHP's `serialize()` format reproduced exactly,
So that cache entries, sessions and encrypted payloads interoperate with PHP Laravel (FR-77, AD-23).

**Acceptance Criteria:**

**Given** Oracle fixtures of `serialize()` over the following values
- integers, floats (including `0.1`, `1e100` and `-0.0`)
- booleans, null
- UTF-8 strings with multibyte characters
- nested lists and maps
- objects of registered classes

**When** `phpSerialize` runs on the same values
**Then** the output is byte-identical, with byte-length string prefixes and `d:` floats using `serialize_precision = -1`.

**Given** those fixtures
**When** `phpUnserialize` runs on them
**Then** it reproduces the values, with objects rebuilt through the Class Registry by FQCN.

**Given** `phpUnserialize(s, { allowedClasses: [...] })`
**When** `s` names a class outside the allowed list
**Then** that class is rebuilt as `__PHP_Incomplete_Class`, as PHP does.

### Story 9.8: `jsonEncode` / `jsonDecode` with PHP flag semantics

As a Framework Agent,
I want one JSON encoder that behaves like PHP's `json_encode`,
So that responses, payloads and Differential Tests produce Laravel's exact bytes (AD-23).

**Acceptance Criteria:**

**Given** Oracle fixtures for `json_encode` with the flags `JSON_PRETTY_PRINT`, `JSON_UNESCAPED_SLASHES`, `JSON_UNESCAPED_UNICODE`, `JSON_PRESERVE_ZERO_FRACTION`, `JSON_FORCE_OBJECT`, `JSON_THROW_ON_ERROR`, `JSON_PARTIAL_OUTPUT_ON_ERROR` and their combinations
**When** `jsonEncode(v, flags)` runs on the same inputs
**Then** the output is byte-identical.

**Given** an object branded with the `JsonSerializable`, `Arrayable` or `Jsonable` `Symbol.for(<FQCN>)` brand
**When** it is encoded
**Then** it uses `jsonSerialize()`, `toArray()` or `toJson()`, as PHP and Laravel do, detected by brand without importing contracts.

**Given** a `bigint`
**When** it is encoded
**Then** it is written as exact JSON number digits.

**Given** `jsonDecode(s, assoc)`
**When** `assoc` is `true`
**Then** objects decode to plain objects, or to `PhpArray` when a key is integer-like, following AD-9.

### Story 9.9: `mixin`, traits and `inject` metadata

As a Framework Agent,
I want trait composition and injection metadata in the runtime,
So that Components can use traits and `inject` before Container exists (AD-4, AD-26, FR-26).

**Acceptance Criteria:**

**Given** `class X extends mixin(Base, TraitA, TraitB)`, with traits registered under their Upstream FQCNs
**When** `classUsesRecursive(X)` is called
**Then** it returns the trait FQCNs, including traits used by traits, in Upstream order.

**Given** trait methods `boot<Trait>` and `initialize<Trait>`
**When** the host class calls the runtime helpers `bootTraits(X)` and `initializeTraits(instance)`
**Then** they run once per class and once per instance respectively, in trait order.

**Given** the runtime has loaded
**When** `Symbol.metadata` is read
**Then** it is defined (the polyfill `Symbol.for('Symbol.metadata')`).

**Given** `inject({ a: Foo, b: String })` as a TC39 class or method decorator, or `inject(map, fn)`
**When** `readInjectMetadata(target)` runs
**Then** it returns the map with its key order preserved.

### Story 9.10: PHP exception hierarchy

As a Framework Agent,
I want PHP's base and SPL exception classes as JS `Error` subclasses registered under their PHP names,
So that `instanceof` checks and `expectException` translate one to one (AD-19, AD-26).

**Acceptance Criteria:**

**Given** the runtime
**When** it loads
**Then** it exports and registers these classes, with PHP's parent chain:
- `Exception`, `ErrorException`, `Error`, `TypeError`, `ValueError`, `ArgumentCountError`, `ArithmeticError`, `DivisionByZeroError`, `JsonException`;
- `RuntimeException`, `LogicException`, `InvalidArgumentException`, `DomainException`, `LengthException`, `OutOfRangeException`, `OutOfBoundsException`, `RangeException`, `OverflowException`, `UnderflowException`, `UnexpectedValueException`, `BadFunctionCallException`, `BadMethodCallException`.

**Given** `new InvalidArgumentException('m', 5, previous)`
**When** it is inspected
**Then** `getMessage()`, `getCode()` and `getPrevious()` return the arguments
**And** it is `instanceof LogicException`, `Exception` and `Error`.

**Given** PHP's SPL exception classes (`\RuntimeException`, `\LogicException`, `\BadMethodCallException`, `\UnexpectedValueException`, `\OutOfBoundsException`, `\InvalidArgumentException` and their parents) and the `\Error`/`\Exception` split
**When** the runtime loads
**Then** it publishes them through a `Symbol.for` protocol that the grader can read without importing `@xaravel/runtime` (ESC-4.3-1 items 10 and 14, ESC-4.4-2 item 7, ESC-4.5-1 item 2).

**Given** the runtime package
**When** the Epic closes
**Then** `docs/` describes every runtime primitive, and `async-surface.json` is committed (empty if no method is async).

### Story 9.11: Grader follow-ups to the runtime value model

As a Framework Agent,
I want `@xaravel/assert` to read the runtime's PHP classes and float marker,
So that equality, exception and instanceof assertions match PHP once those values exist (component `assert`; Epic 4 retro S4; Mockery's half is Story 9.12, ESC-9.11-1).

**Acceptance Criteria:**

**Given** Story 9.5's float marker
**When** `phpStrictEquals(1, 1.0)` and `assertSame(1, 1.0)` run
**Then** they are false and fail, as in PHP (ESC-4.1-1's follow-up).

**Given** Story 9.10's SPL and `\Error`/`\Exception` protocol
**When** the grader throws or compares exceptions
**Then** its exceptions extend the runtime's SPL classes, `expectException(\RuntimeException::class)` matches a PHPUnit failure, and `ExceptionComparator` takes only `\Exception`s (the grader's half of closing the ESC-4.3-1 item 10 divergence clause; Story 9.12 does Mockery's).

**Given** a caught assertion failure
**When** Laravel's `TestResponseAssert` appends to its message
**Then** a supported grader API rewrites the message (ESC-4.3-1 item 11).

**Given** Story 5.4's signature lookup and a PHPUnit test double whose target has a surface row for the called method
**When** the method is called without a configured return, or with omitted arguments
**Then** it returns PHPUnit's generated value for the declared return type, pads omitted arguments and `willReturnMap` rows with the declared defaults, names parameters as declared and gives `Invocation::toString` its `: <type>` suffix; a target with no row keeps the null default (ESC-4.7-1 item 2).

**Given** an assertion that fails after its test's counts have ended (a timer or un-awaited promise the body left behind)
**When** it fails
**Then** it does not throw into whichever test is running then: it reports itself to the `xaravel.harness.late` hook, and the harness fails the test it belongs to (ESC-5.3-3).

### Story 9.12: Mockery exceptions on the runtime's SPL classes

As a Framework Agent,
I want `@xaravel/mockery`'s exceptions to extend the runtime's PHP SPL classes,
So that a Mockery failure is the `\Exception` subclass PHP's Mockery throws, and the ESC-4.3-1 item 10 divergence clause can close (component `mockery`; ESC-9.11-1, ESC-4.5-1 item 2).

**Acceptance Criteria:**

**Given** Story 9.10's SPL and `\Error`/`\Exception` protocol, and Story 9.11's grader side of it
**When** Mockery throws or compares exceptions
**Then** its exceptions (the copies in `packages/mockery/src/php/`) extend the runtime's SPL classes when the runtime's class map is published, and keep today's chain when it is absent; `expectException` on a Mockery failure matches as in PHP (ESC-4.5-1 item 2).

**Given** Stories 9.11 and 9.12 have both landed
**When** the Epic closes
**Then** a planning change records in `decisions/DIV-9.md` that DIV-9.8 is closed, naming both Stories, and updates the `PORTING.md` line that cites it.

### Story 9.13: Oracle rows for the runtime's PHP-mirroring checks

As a Framework Agent,
I want the runtime checks that mirror PHP and have no Oracle row to be compared with signed PHP output,
So that the Epic's PHP-mirroring behaviour is grounded in the Oracle, not only in the test author's reading of PHP (component `runtime`; Epic 9 retro finding S2, MAINT-2026-10-22-epic-9-item-3-split).

**Acceptance Criteria:**

**Given** the class-name lookups of XT-runtime-12..14 (case-insensitive names and a leading `\`)
**When** the same lookups run on the Oracle
**Then** each Xaravel result matches the signed fixture, in requests from `conformance/oracle-requests/9.13.jsonl`.

**Given** a function that writes through a `Ref<T>` box (XT-runtime-18)
**When** the same by-reference write runs on the Oracle with `&`
**Then** the value the caller reads back matches the signed fixture.

**Given** `normalizeNull(v)` over the values XT-runtime-20 checks
**When** the PHP value each one stands for is read back on the Oracle
**Then** each result matches the signed fixture.

**Given** `valueCopy(x)` of a nested array or `PhpArray` (XT-runtime-23)
**When** the copy is mutated on the Oracle as the test mutates it
**Then** the original and the copy match the signed fixture
**And** any difference a fixture shows is fixed in `packages/runtime`, never by removing or weakening an assertion.

### Story 9.14: `fqcn()` of a contract token

As a Framework Agent,
I want `fqcn()` to name a contract token as it names a class,
So that a token's FQCN has the one identity lookup AD-10 gives every class, for the container and Story 10.4's `canonicalToken` (component `runtime`; ESC-10.1-3).

**Acceptance Criteria:**

**Given** a frozen, non-function object whose own, non-writable `Symbol.for('xaravel.class.fqcn')` data property is a string, as `contract<T>()` makes
**When** `fqcn(value)` runs
**Then** it returns that string.

**Given** a class, an instance, an unregistered class, or any other object
**When** `fqcn(value)` runs
**Then** it behaves exactly as before: a registered class or instance gives its FQCN (test frames first), and anything else throws
**And** `resolveClass` never resolves a token's name as a class.

## Epic 10: `@xaravel/contracts`: tokens, aliases & Xaravel-only contracts

Packages built in parallel agree on every interface and container key without importing each other's half-built code.

**Covers:** AD-1, AD-27; supports FR-10, FR-19 and FR-21.

**Kind:** Xaravel Component.
- Every acceptance criterion is verified by an `XT-contracts-<n>` test.
- The API-surface check for contracts compares interfaces with Upstream `Illuminate\Contracts\*`.

**Order:** after Epic 9. The package becomes Protected after Phase 1 (FR-112).

### Story 10.1: Token, brand and `contract<T>()` mechanism

As a Framework Agent,
I want each contract to be a TypeScript interface plus a same-named branded runtime token,
So that injection and `instanceof` work as they do in PHP (AD-1, DIV-3).

**Acceptance Criteria:**

**Given** a contract token `Arrayable`, with brand `Symbol.for('Illuminate\\Contracts\\Support\\Arrayable')`
**When** `x instanceof Arrayable` runs
**Then** it is `true` exactly when `x`'s prototype chain carries `get [Arrayable.brand]() { return true }` (the brand key `Symbol.for('Illuminate\\Contracts\\Support\\Arrayable')`, ESC-10.1-1).

**Given** a class that `implements Arrayable` without the brand getter
**When** it type-checks
**Then** compilation fails.

**Given** `contract<T>('App\\Contracts\\Billing')`
**When** it is used as a token
**Then** it behaves like a framework token, and its FQCN is resolvable through `fqcn()`.

**Given** a contract token
**When** a test double reads it
**Then** it carries its method names at `Symbol.for('xaravel.contract.methods')`, and each method's parameter names at `Symbol.for('xaravel.contract.parameters')` as a frozen `{ <method>: [<param>, …] }` record (ESC-4.5-1 item 3, ESC-4.7-1 item 5, ESC-10.1-1).

**Given** `@xaravel/contracts/psr`
**When** it is imported
**Then** it exports the PSR container, simple-cache and log interfaces with tokens.

### Story 10.2: Port the contracts for the core and service namespaces

As a Framework Agent,
I want the contracts for the Support, Container, Config, Foundation, Pipeline, Events, Bus, Queue, Cache, Redis, Encryption, Hashing, Filesystem, Process, Translation, Validation, Debug, Concurrency and JsonSchema namespaces ported,
So that Phase 1–5 packages can depend on them.

**Acceptance Criteria:**

**Given** each `Illuminate\Contracts\<Ns>\*` interface in those namespaces at the Pin
**When** it is ported
**Then** it lives at `@xaravel/contracts/<ns-kebab>`, exports an interface and a token under the Upstream name, and keeps Upstream's method names, parameter names and defaults (AD-26 options objects).

**Given** an Upstream contract that names a concrete class, such as `Collection`
**When** it is ported
**Then** it uses a structural interface declared in contracts, never an import from an implementation package.

**Given** the API-surface diff for those namespaces
**When** it runs
**Then** there are zero unexplained members.

### Story 10.3: Port the contracts for the web and application namespaces

As a Framework Agent,
I want the contracts for the Auth, Broadcasting, Cookie, Database, Http, Mail, Notifications, Pagination, Routing, Session, View, Console and Image namespaces ported,
So that Phase 4–8 packages can depend on them.

**Acceptance Criteria:**

**Given** each remaining `Illuminate\Contracts\<Ns>\*` interface at the Pin
**When** it is ported
**Then** it follows the same rules as Story 10.2
**And** marker interfaces such as `ShouldQueue` and `ShouldBroadcast` are brand-only tokens, checkable with `hasBrand(Class, Token)` (DIV-9).

**Given** the API-surface diff for all of `Illuminate\Contracts`
**When** it runs
**Then** there are zero unexplained members.

### Story 10.4: Container alias table and canonical tokens

As a Framework Agent,
I want Upstream's core container aliases and provider string bindings as data,
So that `app('cache')`, `app(CacheManager)` and `app(Cache\Factory)` resolve to one instance (AD-1).

**Acceptance Criteria:**

**Given** `@xaravel/contracts/aliases`
**When** it is compared with Upstream `Application::registerCoreContainerAliases` and each provider's string bindings at the Pin
**Then** every alias string and FQCN pair is present, verbatim.

**Given** a service with several aliases
**When** `canonicalToken(abstract)` runs on any of them (a string alias, a concrete class FQCN, or another contract)
**Then** it returns the single most specific contract token, as AD-1 specifies.

**Given** an alias with no canonical contract
**When** the table is validated
**Then** validation fails and names the alias.

### Story 10.5: Xaravel-only contracts

As a Framework Agent,
I want the shared Xaravel seams declared once in contracts,
So that View, Testing and the async tooling agree on them before they are built (AD-6, AD-11, AD-25, AD-27).

**Acceptance Criteria:**

**Given** `@xaravel/contracts/async`
**When** it is imported
**Then** it exports the thenable type list (Builders, Relations, `PendingRequest`, `PendingDispatch`, `PendingChain`, `PendingBatch`, `PendingBroadcast`, `PendingCommand`, `PendingTestResponse`) and the `NotPromise<T>` type
**And** the `async-surface` tool (Story 6.4) now reads its thenable list from here
**And** every framework class with a `then` method declares `implements PromiseLike<…>`, and a check fails on one that does not, so `checkThenables` sees it (ESC-6.1-1).

**Given** `@xaravel/contracts/view`
**When** it is imported
**Then** it exports `RenderContext` (data, factory, sections, stacks, `@once` set, component stack, loop stack and fragment capture) and the names of the emitted-code helpers that make up the `Blade.directive` ABI.

**Given** `@xaravel/contracts/testing`
**When** it is imported
**Then** it exports the hook-order contract: `createApplication` → `afterApplicationCreated` → `setUp<Trait>` → test → `tearDown<Trait>` → `beforeApplicationDestroyed`.

### Story 10.6: Contracts complete and Protected

As the Maintainer,
I want the contracts package closed and Protected at the end of Phase 1,
So that later Phases can't change a shared interface without an Escalation (FR-112, FR-114).

**Acceptance Criteria:**

**Given** `packages/contracts`
**When** its Epic closes
**Then** `api-surface:gate contracts` passes, `docs/` lists every contract with its Upstream FQCN, and `async-surface.json` is committed
**And** because this is the first Component gate on real code, the API-surface mappings (camelCase, AD-26 options objects, DIV-12 renames, defaults and nullability) are re-checked against the gate's matched and extra members; any mapping that misreads real code raises an Escalation instead of an `additions.jsonl` or `exceptions.jsonl` line (Epic 6 retro V1, Maintainer ruling on item 9).

**Given** the Phase 1 acceptance decision `decisions/PHASE-1-EXIT.md`
**When** it is merged
**Then** the protected-paths check treats `packages/contracts/**` as Protected, because the `after-phase:1` marker in `conformance/protected-paths` is active
**And** a Story PR that touches contracts afterwards fails.

## Epic 11: Macroable

App Developers can `macro()` any Macroable class.

**Covers:** FR-26.

**Kind:** Upstream Component. Test scope is given as selectors against `conformance/upstream/framework/`, which sprint planning resolves to Test IDs.

### Story 11.1: Macroable trait

As an App Developer,
I want `X.macro('name', fn)`, `mixin()`, `hasMacro()` and `flushMacros()` on Macroable classes,
So that I can extend framework classes as Laravel allows (FR-26).

**Acceptance Criteria:**

**Given** the test scope `tests/Support/SupportMacroableTest.php::*`
**When** the harness runs it on every variant
**Then** every Test ID passes, or carries a valid Skip Reason that isn't `not-ported-yet`.

**Given** `Macroable` as a runtime trait (`mixin(Base, Macroable)`)
**When** a macro is registered
**Then** it is callable on instances, through the prototype, and statically
**And** `this` inside it is bound as in Upstream.

**Given** an Application that is `sealed`
**When** a macro is registered inside a request frame
**Then** it throws `ScopeFrameException`. Inside a test frame, it goes to that test's overlay (AD-5).

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate macroable` passes, and the docs page mirrors Laravel's, with a Divergences section.

## Epic 12: Conditionable

App Developers can use `when()` / `unless()` wherever Laravel provides them.

**Covers:** FR-26.

**Kind:** Upstream Component, with selector test scope.

### Story 12.1: Conditionable trait

As an App Developer,
I want `when()` and `unless()` on Conditionable classes,
So that fluent chains branch as they do in Laravel (FR-26).

**Acceptance Criteria:**

**Given** the test scope `tests/Conditionable/**` and `tests/Support/SupportConditionableTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `when(value, callback, default)`, where `value` is a closure
**When** it is called
**Then** the closure's result decides the branch
**And** a call with no callback returns Upstream's higher-order proxy.

**Given** an async callback
**When** `when` / `unless` runs it
**Then** the method returns a Promise. A sync callback returns `T` (AD-6 dual helpers), and a `T | Promise<T>` declared return type is never used.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate conditionable` passes, the docs are written, and `async-surface.json` is committed.

## Epic 13: Reflection

Framework code can inspect closures and callables as Laravel's Reflector does, within the limits of erased types (DIV-3).

**Covers:** FR-26.

**Kind:** Upstream Component, with selector test scope.

### Story 13.1: Reflector and ReflectsClosures

As a Framework Agent,
I want `Reflector` and `ReflectsClosures` ported over `inject` metadata,
So that Events, Container and Routing can read a callable's declared parameters (DIV-3, DIV-7).

**Acceptance Criteria:**

**Given** the test scope `tests/Support/SupportReflectorTest.php::*` and `tests/Support/SupportReflectsClosuresTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a closure or method declared with `inject({ event: OrderShipped })`
**When** `firstClosureParameterType` / `getParameterClassName` runs
**Then** it returns the declared class from the metadata, and the test assertion is marked `adapted:DIV-3.<k>`.

**Given** a closure with no `inject` declaration
**When** its parameter types are requested
**Then** it throws Upstream's exception type, with a message that names the `inject` form.

**Given** a test that depends on PHP-runtime reflection with no TypeScript analogue (union-type introspection of undeclared parameters, for example)
**When** it is classified
**Then** it is `intentional-divergence:DIV-3` only if no DIV-3 clause adapts it. An Escalation is raised if neither fits.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate reflection` passes and the docs are written.

## Epic 14: Collections

App Developers can use `Collection` and `LazyCollection` with every Laravel 13 method and PHP array semantics.

**Covers:** FR-23.

**Kind:** Upstream Component, with selector test scope. Abbreviations: `SCT` = `tests/Support/SupportCollectionTest.php`, `SLCT` = `tests/Support/SupportLazyCollectionTest.php`, `SLCLT` = `tests/Support/SupportLazyCollectionIsLazyTest.php`.

**Selector rules:**
- Selectors are applied in Story order, so a Test ID matched by an earlier Story's selector belongs to that Story.
- Any `SCT` Test ID matched by no selector belongs to Story 14.5.
- Most `SCT` cases run once for `Collection` and once for `LazyCollection` through their data provider. Each Story implements its methods on both classes.

### Story 14.1: Enumerable core: construction, conversion and serialization

As an App Developer,
I want to create, wrap, convert and serialize `Collection` and `LazyCollection` with PHP key semantics,
So that the base every other Collection method relies on exists and behaves like Laravel (FR-23).

**Acceptance Criteria:**

**Given** the test scope `SCT::{testCollectionIsConstructed,testMake*,testWrap*,testUnwrap*,testTimesMethod,testRangeMethod,testEmptyMethod,testFromJson*,testConstruct*,testGetArrayableItems,testToArray*,testJsonSerialize*,testToJson*,testToPrettyJson*,testCastingToString*,testLazyReturnsLazyCollection,testCountable*,testIterable,testCachingIterator,testOffset*,testArrayAccess*,testBehavesLikeAnArray*,testEmptyCollection*,testCollect*,testEnsure*,testDump,testMacroable,testCanAddMethodsToProxy}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** integer-like string keys and mixed keys
**When** a collection is built and iterated
**Then** key order and PHP key normalisation follow `PhpArray`
**And** `toArray()` and `jsonEncode` produce the list or object shape that the Oracle produces (FR-23).

**Given** `$collection[0]`-style tests
**When** they are translated
**Then** they use `collection.get(0)` / `offsetGet`, and each changed assertion is marked `adapted:DIV-12.<k>`.

**Given** `LazyCollection.make()` from an array, an `Arrayable`, a generator function or a non-generator function
**When** it is enumerated
**Then** it behaves as Upstream does, and a bare generator object is rejected as in `testDoesNotCreateCollectionFromGenerator`.

### Story 14.2: Retrieval, search and mutation methods

As an App Developer,
I want the methods that read, find, add and remove items,
So that common Collection code ports unchanged (FR-23).

**Acceptance Criteria:**

**Given** the test scope `SCT::{testFirst*,testLast*,testSole*,testHasSole,testHasMany,testValue*,testGetOrPut*,testGetPluckValueWithAccessors,testHas*,testContains*,testDoesntContain*,testSome,testSearch*,testBefore*,testAfter*,testNth*,testRandom*,testPluck*,testKeys,testValues*,testOnly,testExcept*,testSelect*,testPop*,testShift*,testPull*,testPut*,testPush*,testPrepend,testUnshift*,testAdd,testForget*,testSplice}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `contains('1')` on `collect([1])` and `containsStrict('1')` on the same collection
**When** they run
**Then** they return `true` and `false`, using the runtime's PHP loose comparison.

**Given** `sole()` with zero or several matches, and `firstOrFail()` with zero matches
**When** they run
**Then** they throw `ItemNotFoundException` or `MultipleItemsFoundException`, registered under their Upstream FQCNs.

### Story 14.3: Filtering, slicing and conditional methods

As an App Developer,
I want `filter`, `where*`, `unique`, `skip*`, `take*`, `slice`, `partition` and higher-order proxies,
So that filtering code keeps Laravel's key-preserving behaviour (FR-23).

**Acceptance Criteria:**

**Given** the test scope `SCT::{testFilter,testReject*,testWhere*,testBetween,testUnique*,testDuplicates*,testSkip*,testTake*,testSlice*,testEvery,testPartition*,testHigherOrder*,testHigh*,testWhen*,testUnless*}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `filter()` on a list
**When** items are removed
**Then** the original keys are kept, and `values()` re-indexes, matching the Oracle (FR-23).

**Given** a sync API such as `filter` or `map`
**When** it is passed an async callback in TypeScript
**Then** type-checking rejects it through the `NotPromise` overloads, and lint rejects the call (AD-6)
**And** `filterAsync` / `rejectAsync` / `partitionAsync` / `everyAsync` / `containsAsync` / `firstAsync` exist and await callbacks in order.

### Story 14.4: Set operations and combining

As an App Developer,
I want `merge`, `replace`, `union`, `diff*`, `intersect*`, `combine`, `concat`, `crossJoin`, `zip`, `pad`, `collapse`, `flatten`, `flip`, `join`, `implode`, `multiply`, `dot` and `undot`,
So that array-algebra code gives PHP's results (FR-23).

**Acceptance Criteria:**

**Given** the test scope `SCT::{testMerge*,testReplace*,testUnion*,testDiff*,testIntersect*,testCombine*,testConcat*,testCross*,testZip,testPad*,testCollapse*,testFlatten*,testFlip*,testJoin,testImplode*,testMultiply*,testDot*,testUndot}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `merge()` with integer keys and with string keys
**When** it runs
**Then** integer keys are renumbered and string keys overwrite, as PHP's `array_merge` does
**And** `union()` keeps the left-hand keys, as `+` does.

**Given** `implode` on a collection of models (`testImplodeModels`)
**When** it is classified
**Then** it is `blocked-by:database` until Epic 36 re-verifies it.

### Story 14.5: Mapping, grouping, sorting, chunking and aggregates

As an App Developer,
I want `map*`, `groupBy`, `keyBy`, `countBy`, `sort*`, `chunk*`, `split*`, `sliding`, `sum` / `avg` / `min` / `max` / `median` / `mode`, `reduce*`, `pipe*`, `each*` and `tap`,
So that transformation code ports unchanged (FR-23).

**Acceptance Criteria:**

**Given** the test scope `SCT::{testMap*,testFlat*,testTransform,testGroup*,testKey*,testCount*,testSort*,testNatural*,testReverse,testChunk*,testSplit*,testSliding,testGetting*,testCanSum*,testValueRetriever*,testMedian*,testMode*,testEven*,testWith*,testPercentage*,testReduce*,testPipe*,testEach*,testTap*,testPaginate}`, plus every `SCT` Test ID that no earlier selector matched
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `sortBy` with `SORT_NUMERIC` / `SORT_NATURAL` flags and with multiple sort keys
**When** it runs
**Then** the order matches PHP's sort, including stability and flag semantics, and is checked against Oracle fixtures.

**Given** `mapInto` with int- and string-backed enums
**When** it runs
**Then** the enum classes follow AD-26 (static instances, `from`, `tryFrom`), and the result matches Upstream.

**Given** `mapAsync` / `eachAsync`
**When** they run with async callbacks
**Then** the callbacks run sequentially, in key order.

### Story 14.6: `Arr` helpers

As an App Developer,
I want `Arr` with every Laravel 13 method, including dot notation,
So that array helpers behave exactly as in PHP (FR-23).

**Acceptance Criteria:**

**Given** the test scope `tests/Support/SupportArrTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `Arr.get` / `set` / `has` / `forget` with dot notation on nested `PhpArray`s, plain objects and lists
**When** they run
**Then** they behave as Upstream does, without mutating the caller's data (AD-9 value copy)
**And** `testMapByReference` adapts to `Ref<T>`, marked `adapted:DIV-9.<k>`.

**Given** `testPluckWithCarbonKeys`
**When** it is classified
**Then** it is `blocked-by:support`, and Epic 19 re-verifies it.

### Story 14.7: LazyCollection behaviour

As an App Developer,
I want LazyCollection's own methods (`remember`, `eager`, `takeUntilTimeout`, `throttle`, `tapEach`, `withHeartbeat`, `dot`),
So that streaming pipelines work as in Laravel (FR-23).

**Acceptance Criteria:**

**Given** the test scope `SLCT::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `remember()` with two concurrent enumerations
**When** both iterate
**Then** the source is enumerated once.

**Given** `takeUntilTimeout`, `throttle` and `withHeartbeat`
**When** they run under the test clock
**Then** they use the frame-scoped clock, so the tests are deterministic (NFR-7). Until Epic 19 delivers the clock, clock-dependent Test IDs are `blocked-by:support`.

### Story 14.8: LazyCollection laziness guarantees

As an App Developer,
I want every lazy method to enumerate its source no more than Laravel does,
So that large or infinite sources stay safe (FR-23).

**Acceptance Criteria:**

**Given** the test scope `SLCLT::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a source that counts its enumerations
**When** each `*IsLazy` method is called without consuming the result
**Then** the source isn't enumerated
**And** each `*EnumeratesOnce` method enumerates it exactly once.

**Given** the package
**When** the Epic closes
**Then**:
- no `SCT`, `SLCT`, `SLCLT` or `SupportArrTest` Test ID remains `not-ported-yet`;
- `api-surface:gate collections` passes;
- `async-surface.json` lists the `*Async` companions;
- the Collections docs page (with Divergences: DIV-1 companions, DIV-12 index access) is written;
- `@xaravel/collections` installs and works standalone (FR-10).

## Epic 15: Config & environment

App Developers read configuration through Laravel's Repository, and environment files are parsed with phpdotenv's exact grammar, with Bun's own `.env` loading out of the way.

**Covers:** FR-20, through the Repository and the env parser.
- `env()` itself is a Support helper (Epic 20).
- Which env file loads, and with what precedence, is Foundation bootstrap (Epic 51).
- `config:cache` is a Foundation command (Epic 55).

**Kind:** Upstream Component, with selector test scope. The phpdotenv port is verified by Oracle Differential Xaravel Tests (AD-22).

### Story 15.1: Config Repository

As an App Developer,
I want Laravel's config Repository with dot-notation get, set, push, prepend and typed getters,
So that configuration reads exactly as in Laravel (FR-20).

**Acceptance Criteria:**

**Given** the test scope `tests/Config/RepositoryTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a `config([...])` set on a sealed Application inside a unit frame
**When** another concurrent unit reads the key
**Then** it sees the base value, because runtime config writes go to the frame overlay (AD-5)
**And** this is proven with `interleave`.

**Given** a config value holding a class or an FQCN string
**When** it is read
**Then** it is returned as stored, and the `$class` rehydration form is left to `config:cache` (AD-10).

### Story 15.2: phpdotenv grammar port

As an App Developer,
I want `.env` files parsed by phpdotenv's exact grammar,
So that the same `.env` file gives the same values in Xaravel and PHP Laravel (FR-20).

**Acceptance Criteria:**

**Given** Oracle fixtures from phpdotenv at the Pin, covering:
- unquoted, single-quoted and double-quoted values;
- escape sequences;
- `${VAR}` interpolation, including nested and undefined variables;
- multiline quoted values;
- `export` prefixes;
- inline and full-line comments;
- empty values;
- whitespace;
- invalid lines and their error messages.

**When** the Xaravel parser runs on the same inputs
**Then** the parsed values and the errors match the Oracle.

**Given** immutable and mutable repository modes
**When** a variable already exists in the real environment
**Then** precedence matches phpdotenv's: real environment variables win by default.

### Story 15.3: Bun's `.env` autoload neutralised

As an App Developer,
I want only Xaravel's loader to read env files,
So that Bun's built-in `.env` loading never changes a value (FR-20, Consistency Conventions).

**Acceptance Criteria:**

**Given** a fixture app with `.env`, `.env.local` and `.env.production`, and Bun's autoload rules
**When** an entry script runs with the root or Skeleton `bunfig.toml` (`env = false`) and `--no-env-file`
**Then** `process.env` contains none of those files' values until Xaravel's loader runs.

**Given** an entry script missing `--no-env-file`
**When** the entry-script lint runs
**Then** it fails.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate config` passes, the docs are written, and the phpdotenv dependency reason is recorded in the README (NFR-2).

## Epic 16: JsonSchema

App Developers can build, serialize and deserialize JSON Schemas with Laravel 13's builder.

**Covers:** FR-84 (JsonSchema).

**Kind:** Upstream Component, with selector test scope.

### Story 16.1: Schema types and serializer

As an App Developer,
I want the JsonSchema type builders and serializer,
So that tools, MCP servers and validation can describe JSON shapes as in Laravel (FR-84).

**Acceptance Criteria:**

**Given** the test scope `tests/JsonSchema/{TypeTest,StringTypeTest,IntegerTypeTest,NumberTypeTest,BooleanTypeTest,ArrayTypeTest,ObjectTypeTest,AnyOfTypeTest,UnionTypeTest,SerializerTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a schema built with the fluent API
**When** it is serialized
**Then** the JSON output is byte-identical to Upstream's, using `jsonEncode`.

### Story 16.2: Schema deserializer

As an App Developer,
I want JSON Schemas deserialized back into builder objects,
So that schemas round-trip (FR-84).

**Acceptance Criteria:**

**Given** the test scope `tests/JsonSchema/DeserializerTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** any schema produced in Story 16.1's tests
**When** it is serialized, deserialized and serialized again
**Then** both serializations are identical.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate json-schema` passes and the docs are written.

## Epic 17: Container

App Developers bind, resolve, scope, tag and contextually inject services, with `inject` autowiring and per-unit `scoped` isolation.

**Covers:** FR-19. **Implements:** AD-1 (canonical tokens, aliases), AD-4, AD-5 (base and overlay writes), AD-6 (sync `resolving` hooks, `afterResolvingAsync` and `callAsync`).

**Kind:** Upstream Component, with selector test scope under `tests/Container/`.
- `tests/Integration/Container/**` waits as `blocked-by:testbench` and is cleared in Epic 60.
- Contextual attributes that resolve services from later Components (`Storage()`, `DB()`, `Cache()`, `Log()`, `CurrentUser()`, …) are `blocked-by:<component>` until those Components land.

### Story 17.1: Binding and resolution core

As an App Developer,
I want `bind`, `singleton`, `instance`, `alias`, `make` with parameters, and `inject` autowiring,
So that services resolve exactly as in Laravel, even though TypeScript erases parameter types (FR-19, DIV-3).

**Acceptance Criteria:**

**Given** the test scope `tests/Container/{ContainerTest,UtilTest,RewindableGeneratorTest,ContainerResolveNonInstantiableTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a class declared with `@inject({ mailer: Mailer, retries: Number })`
**When** `make(X, { retries: '3' })` runs
**Then** `mailer` resolves by token, and `retries` is coerced with PHP's rules, giving `3`
**And** adapted assertions carry `adapted:DIV-3.<k>`.

**Given** a string abstract (`'cache'`), a concrete class or a contract token
**When** each is resolved
**Then** each resolves through `fqcn()` and the alias table to the service's canonical token, so autowiring a listed concrete class never builds a second instance (AD-1).

**Given** a class with constructor parameters but no `inject` declaration
**When** the container autowires it
**Then** it throws `BindingResolutionException`, with a message that names the class and the `inject` form.

### Story 17.2: Contextual binding and contextual attributes

As an App Developer,
I want `when().needs().give()`, `needs('$name')` and Laravel's contextual attributes as `inject` Spec descriptors,
So that per-consumer dependencies work as in Laravel (FR-19, AD-4).

**Acceptance Criteria:**

**Given** the test scope `tests/Container/{ContextualBindingTest,ContextualAttributeBindingTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `when(Consumer).needs('$timeout').give(30)`
**When** `Consumer` is declared with `inject({ timeout: Number })`
**Then** it receives `30`, matched by key name.

**Given** the descriptors `Config('app.timezone')`, `Give(X)`, `Tag('reports')`, `RouteParameter('post')` and `oneOf(A, B)`
**When** they are used as Spec values
**Then** they resolve as Upstream's container attributes do
**And** descriptors whose service belongs to a later Component raise `BlockedByComponentError(<c>)` when that Component isn't installed.

**Given** the first Component-owned resolution that can fail
**When** `BlockedByComponentError` is defined
**Then** it lives in `@xaravel/runtime`, is registered as a framework class, has `name` `BlockedByComponentError`, and its message starts `BlockedByComponentError(<c>)`, where `<c>` is the owning Component's package name from the component map; that is the form the harness matches (ESC-5.3-1).

### Story 17.3: Calling, extending, tagging and resolving hooks

As an App Developer,
I want `call`, `extend`, `tag` / `tagged`, and the `resolving` / `afterResolving` callbacks,
So that container-driven code ports unchanged (FR-19, AD-6).

**Acceptance Criteria:**

**Given** the test scope `tests/Container/{ContainerCallTest,ContainerExtendTest,ContainerTaggingTest,ResolvingCallbackTest,AfterResolvingAttributeCallbackTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `app.call([Controller, 'show'], { id: 5 })` on a method declared with `inject`
**When** it runs
**Then** named parameters bind by key, and the rest are injected.

**Given** a `resolving` callback that returns a Promise
**When** it is registered
**Then** registration throws, because `resolving` callbacks must be sync (AD-6)
**And** `afterResolvingAsync(brand, fn)` hooks run only through `callAsync`, after parameter resolution and before the call.

### Story 17.4: Scoped bindings and Scope Frame write rules

As an App Developer,
I want `scoped` bindings isolated per unit of work, and post-boot writes routed by AD-5's rules,
So that concurrent requests never share container state (FR-19, NFR-4, AD-5).

**Acceptance Criteria:**

**Given** a `scoped(Cart)` binding and two units run with `interleave`
**When** each resolves `Cart` across several `await`s
**Then** each unit gets its own instance, and the instance is discarded when the unit ends (FR-19 consequence).

**Given** a container whose owning Application is `sealed`
**When** `bind`, `singleton`, `alias`, `extend` or `tag` is called inside a non-test unit frame
**Then** it throws `ScopeFrameException`
**And** inside a test frame the write goes to that frame's overlay
**And** `instance()` always writes to the innermost unit frame's overlay, which is read first.

**Given** a base singleton whose constructor resolves a frame-owned binding (a request-like fixture)
**When** dev mode is on
**Then** resolution throws, naming both bindings (AD-5).

**Given** a registered singleton class
**When** lint runs
**Then** `xaravel/no-singleton-field-write` also reports writes into a field's contents after boot (`this.f.set(…)`, `.push(…)`, `this.f[k] = v`, `Object.assign(this, …)`, and writes through an alias of `this`)
**And** a field that holds a process-wide cache, such as a manager's `drivers` or `customCreators`, is exempt only when `singletons.json` lists it with a citation of the Upstream member it mirrors; per-request state is never exempt (AD-5; Epic 6 retro L4, Maintainer ruling on item 9).

**Given** a singleton bound through a closure (`view`, `session.store`, `cache.store`, `queue.connection`, …)
**When** `singletons.json` is generated
**Then** its `classes` entry names the concrete class the closure returns instead of `null`, found by booting Upstream through the Oracle and recording `get_class(app(<abstract>))` for each binding the static scan left `null`, so `Illuminate\View\Factory` and the others are checked (Epic 6 retro L5, Maintainer ruling on item 9).

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate container` passes, `async-surface.json` lists `callAsync`, and the docs page (with Divergences: DIV-3, DIV-11) is written.

## Epic 18: Support: strings & inflection

App Developers use `Str` and `Stringable` with Laravel's behaviour: pluralization, ascii/slug transliteration, identifiers and safe markdown.

**Covers:** FR-24 (`Str`, `Stringable`). **Owns ports (AD-22):** doctrine/inflector, voku/portable-ascii, ramsey/uuid and symfony/uid, league/commonmark. Each foreign library is verified by Oracle Differential Xaravel Tests (`XT-support-<n>`).

**Kind:** Upstream Component (a slice of Support), with selector test scope. `SST` = `tests/Support/SupportStrTest.php`. Selectors apply in Story order. Any `SST` Test ID matched by no selector belongs to Story 18.4.

**Note:** the Pilot translations (Story 8.7) on `pilot/porting` are reference input for this Epic.

### Story 18.1: Inflector port and Pluralizer

As an App Developer,
I want `Str.plural` / `singular` to follow Doctrine Inflector's English rules,
So that model, table and route names pluralize as in Laravel (FR-24).

**Acceptance Criteria:**

**Given** the test scope `tests/Support/SupportPluralizerTest.php::*` and `SST::{testPlural*,testSingular}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** Oracle fixtures for `Pluralizer::plural` / `singular` over a word list containing Doctrine's irregular, uninflected and rule-based cases, plus case preservation
**When** the Xaravel Inflector runs on it
**Then** every result matches the Oracle.

**Given** `tests/Integration/Support/PluralizerPortugueseTest.php`
**When** it is classified
**Then** it is `blocked-by:testbench`, and is cleared in Epic 60.

### Story 18.2: UUIDs, ULIDs and binary codecs

As an App Developer,
I want `Str.uuid`, `orderedUuid`, `ulid`, the freeze and sequence factories, and `BinaryCodec`,
So that identifiers generate and validate as in Laravel, and can be faked in tests (FR-24, NFR-7).

**Acceptance Criteria:**

**Given** the test scope `SST::{testUuid,testIsUuid*,testIsUlid,testItCanFreezeU*,testItCreatesU*,testItCanSpecifyASequenceOfU*,testItCanSpecifyAFallbackForA*Sequence,testResetFactoryState}` and `tests/Support/SupportBinaryCodecTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `Str.orderedUuid()` and `Str.ulid()`
**When** values are generated over time under the test clock
**Then** they sort in creation order, and their formats match Oracle fixtures.

**Given** a UUID or ULID factory set inside a test frame
**When** the test frame ends
**Then** the next test sees the default factory (`Str.createUuidsUsing` is a `frameStatic`, AD-5).

### Story 18.3: Transliteration, slugs and markdown

As an App Developer,
I want `Str.ascii`, `slug` and `transliterate` to match PHP, and `Str.markdown` / `inlineMarkdown` to be safe,
So that URLs and rendered user content are identical to Laravel's and resist XSS (FR-24).

**Acceptance Criteria:**

**Given** the test scope `SST::{testStringAscii*,testAsciiNull,testSlug,testTransliterate*,testMarkdown,testInlineMarkdown}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** Oracle fixtures for `Str::ascii` (with and without a locale) and `Str::slug` over portable-ascii's character tables, including multibyte and locale-specific inputs
**When** the Xaravel functions run on them
**Then** every output matches.

**Given** an XSS payload suite (`<script>`, `javascript:` links, `onerror` attributes, raw HTML blocks), with each input run with `html_input` set to `strip`, `escape` and `allow`, and with `allow_unsafe_links` set to `true` and `false`
**When** `Str.markdown` and `Str.inlineMarkdown` render them
**Then** the HTML matches the Oracle (league/commonmark) byte for byte.

**Given** the markdown backend
**When** it is chosen
**Then** `Bun.markdown` is used only if it matches the whole Oracle suite. Otherwise a CommonMark-compliant npm package is used, and the reason is recorded in the README (NFR-2).

### Story 18.4: Str: the remaining methods

As an App Developer,
I want the rest of `Str` (casing, padding, masking, matching, replacing, word and length functions, random and password),
So that string helpers port unchanged (FR-24).

**Acceptance Criteria:**

**Given** the test scope: every `SST` Test ID not matched by Stories 18.1–18.3
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** multibyte input to `length`, `substr`, `limit`, `padBoth`, `wordWrap`, `ucfirst` and `mask`
**When** they run
**Then** results count Unicode code points as PHP's `mb_*` functions do, matching Oracle fixtures, not UTF-16 code units.

**Given** `Str.is`, `match`, `replaceMatches` and `isMatch` with patterns from Upstream tests
**When** they run
**Then** they take a JS `RegExp` (DIV-10)
**And** any test that depends on a PCRE feature with no JS equivalent is `intentional-divergence:DIV-10`, with the feature named in `PORTING.md`.

### Story 18.5: Stringable, HtmlString and Js

As an App Developer,
I want the fluent `Stringable` and the `HtmlString` and `Js` helpers,
So that chained string code and safe JS embedding work as in Laravel (FR-24).

**Acceptance Criteria:**

**Given** the test scope `tests/Support/{SupportStringableTest,SupportHtmlStringTest,SupportJsTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a `Stringable`
**When** it is used in a template literal, concatenated or compared loosely
**Then** it converts through `toString()` and `[Symbol.toPrimitive]` (AD-26).

**Given** `Js.from(value)`
**When** it is rendered
**Then** the output matches Upstream's `json_encode` flags, including `JSON_HEX_*` escaping, via `jsonEncode`.

**Given** this slice
**When** it closes
**Then**:
- the Support strings docs are written;
- the API-surface diff shows zero unexplained members for `Str`, `Stringable`, `Pluralizer`, `HtmlString`, `Js` and `BinaryCodec`;
- each ported library's dependency reason is in the README.

## Epic 19: Support: dates

App Developers use a Carbon-equivalent date API, built on Temporal, that matches the Oracle's formatting and parsing and has a frame-scoped test clock.

**Covers:** FR-25. **Owns ports (AD-22):** nesbot/carbon over `Temporal`, as decided by OQ-4 (Story 8.4).

**Kind:** a slice of Support.
- Upstream selectors cover `Illuminate\Support\Carbon`.
- The Carbon port itself (no Upstream Test IDs) is verified by Oracle Differential Xaravel Tests (`XT-support-<n>`).

### Story 19.1: Carbon core: construction, arithmetic and comparison

As an App Developer,
I want `now()`, `Carbon` / `CarbonImmutable` construction, timezones, `add*` / `sub*`, `startOf*` / `endOf*`, comparisons and `diffIn*`,
So that date logic gives PHP's results, including around DST and at month ends (FR-25).

**Acceptance Criteria:**

**Given** Oracle fixtures for Carbon covering:
- construction from timestamps and strings;
- timezone conversion;
- additions across DST transitions;
- month-overflow and no-overflow arithmetic;
- every `startOf` / `endOf` unit;
- `diffIn*` with absolute and signed values;
- comparisons.

**When** the Xaravel implementation runs on the same inputs
**Then** every result matches.

**Given** mutable `Carbon` and `CarbonImmutable`
**When** a mutating method is called
**Then** `Carbon` changes in place and `CarbonImmutable` returns a new instance, as Upstream does.

### Story 19.2: Formatting, parsing and `diffForHumans`

As an App Developer,
I want PHP `date()` format strings, `Carbon.parse` / `createFromFormat`, ISO formats and `diffForHumans`,
So that rendered dates are byte-identical to Laravel's (FR-25).

**Acceptance Criteria:**

**Given** Oracle fixtures for every PHP `date()` format character, `createFromFormat` with each format character, `parse` on common relative strings (`'tomorrow'`, `'next monday'`, `'+1 week'`, `'last day of this month'`), and `diffForHumans` with its options
**When** the Xaravel functions run on them
**Then** every output matches the Oracle (FR-25 consequence).

**Given** a relative-time string that PHP's `strtotime` accepts but the port doesn't support
**When** it is parsed
**Then** it throws, and the gap is listed in the docs. It never silently produces a different date.

### Story 19.3: Support Carbon, the Date facade and duration helpers

As an App Developer,
I want Laravel's `Illuminate\Support\Carbon`, the `Date` factory and facade, and the duration helpers,
So that Laravel's date surface ports unchanged (FR-25).

**Acceptance Criteria:**

**Given** the test scope `tests/Support/{SupportCarbonTest,DateFacadeTest,SupportDurationFunctionsTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `Date.use(CarbonImmutable)` or `Date.useCallable(fn)`
**When** `now()` is called
**Then** it returns the configured type.

**Given** `testPluckWithCarbonKeys` (`blocked-by:support` since Story 14.6)
**When** this Story re-verifies it
**Then** it passes, or carries a valid non-`blocked-by` reason.

### Story 19.4: Test clock

As an App Developer,
I want `Carbon.setTestNow`, `travelTo` and `freezeTime` scoped to the current test,
So that time-dependent tests are deterministic and never leak (FR-25, NFR-7).

**Acceptance Criteria:**

**Given** `Carbon.setTestNow(t)` inside a test frame
**When** `now()`, `Carbon.now()`, `CarbonImmutable.now()` and `Date.now()` run in that frame
**Then** they return `t`. A concurrent unit, proven with `interleave`, sees the real clock.

**Given** a test that set the test clock
**When** the test frame ends
**Then** the next test sees the real clock (FR-25 consequence: the clock resets after every test).

**Given** the clock-dependent LazyCollection Test IDs (`blocked-by:support` since Story 14.7)
**When** this Story re-verifies them
**Then** they pass, or carry a valid non-`blocked-by` reason.

**Given** this slice
**When** it closes
**Then** the dates docs page, which documents any unsupported `strtotime` forms, is written
**And** the API-surface diff shows zero unexplained members for `Carbon`, `DateFactory` and the duration functions.

## Epic 20: Support: helpers, arrays, numbers, URIs & facade base

App Developers use Laravel's global helpers, `Fluent`, `Number`, `Uri`, `MessageBag`, `Sleep`, `Lottery`, `Once`, `Benchmark`, `ServiceProvider` and the `Facade` base, with `fake` and `swap`.

**Covers:** FR-21, FR-24 (the rest); also FR-20 (`env()`). **Owns ports (AD-22):** league/uri, brick/math, symfony/var-dumper (`dump` / `dd`).

**Kind:** a slice of Support, with selector test scope.
- `tests/Integration/Support/**` is `blocked-by:testbench`.
- The `SupportTesting*FakeTest` and facade-for-component suites are `blocked-by` their Components (Story 20.6).

### Story 20.1: Facade base, forwarding and higher-order proxies

As an App Developer,
I want the `Facade` base with generated static delegators, `fake` / `swap` / `shouldReceive`, and Laravel's forwarding and proxy helpers,
So that `Route.get(...)`, `Cache.fake()` and similar calls work once each root exists (FR-21, AD-26).

**Acceptance Criteria:**

**Given** the test scope `tests/Support/{SupportFacadeTest,ForwardsCallsTest,HigherOrderProxyTest,SupportTappableTest,SupportOptionalTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `conformance/scans/facades.jsonl`
**When** the facade generator runs
**Then** it emits one `Facade` subclass per Upstream facade in `@xaravel/support/facades`, with static delegating methods matching the `@method` signatures
**And** the classes are typed through `interface FacadeRoots`, which owning packages augment.

**Given** a facade
**When** it is called inside a unit frame
**Then** it resolves its root from `currentFrame()?.app`, falling back to the default Application
**And** `Facade.swap(x)` writes to the frame overlay, so concurrent units are unaffected (FR-21 consequences).

**Given** `Facade.shouldReceive('m')`
**When** `@xaravel/mockery` is installed as Support's optional peer
**Then** it returns a Mockery expectation. Without it, the call throws an error naming the package.

### Story 20.2: Global helpers and `env()`

As an App Developer,
I want Laravel's global helpers (`tap`, `value`, `retry`, `rescue`, `transform`, `with`, `throw_if`, `blank`, `filled`, `class_basename`, `e`, `data_*`, `env`, …),
So that everyday code reads as it does in Laravel (FR-21, FR-20).

**Acceptance Criteria:**

**Given** the test scope `tests/Support/{SupportHelpersTest,SupportEnumValueFunctionTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `retry`, `rescue`, `tap`, `value`, `transform` and `with`
**When** they are given a sync callback
**Then** they return `T`, and given an async callback they return `Promise<T>`, as AD-6's dual helpers specify.

**Given** `env('X')` with values `'true'`, `'(false)'`, `'empty'`, `'null'` and quoted strings
**When** it reads them
**Then** it returns Upstream's coerced values
**And** `Env.getOrFail` throws Upstream's exception for a missing key.

**Given** the PHP 8.4 lazy-object helpers (`lazy()`, `proxy()`, and the `testLazy*` / `testProxy*` / `testClosureOnly*` tests)
**When** they are ported
**Then** they are implemented over a Proxy wherever Upstream behaviour can be reproduced
**And** any test that relies on engine-level lazy-object semantics raises an Escalation proposing `adapted` or `php-only`. It is never skipped without one.

### Story 20.3: Fluent, Number, Uri, MessageBag and ValidatedInput

As an App Developer,
I want `Fluent`, `Number`, `Uri` / `UriQueryString`, `MessageBag`, `ViewErrorBag` and `ValidatedInput`,
So that value objects used across the framework behave as in Laravel (FR-24).

**Acceptance Criteria:**

**Given** the test scope `tests/Support/{SupportFluentTest,SupportNumberTest,SupportUriTest,SupportMessageBagTest,SupportViewErrorBagTest,ValidatedInputTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `Number.format`, `currency`, `percentage`, `fileSize`, `forHumans` and `spell` with several locales
**When** they run
**Then** they match Oracle fixtures produced with PHP's `intl`, using Bun's `Intl`
**And** any locale whose output differs is recorded as a Skip Reason with an Escalation, never silently accepted.

**Given** `Uri.of(url)` with mutations to the query, path, fragment and user info
**When** it is converted back to a string
**Then** the result matches Upstream's league/uri behaviour, verified against Oracle fixtures.

### Story 20.4: Sleep, Lottery, Once, Benchmark and Timebox

As an App Developer,
I want `Sleep`, `Lottery`, `once()`, `Benchmark` and `Timebox`, with their fakes,
So that timing and randomness are testable and reset after each test (FR-24, NFR-7).

**Acceptance Criteria:**

**Given** the test scope `tests/Support/{SleepTest,LotteryTest,OnceTest,SupportBenchmarkTest,SupportTimeboxTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `Sleep.fake()`, `Lottery.alwaysWin()` or a cached `once()` value set in one test
**When** the next test starts
**Then** each is back to its default, because the state is frame-scoped (NFR-7)
**And** each reset is proven by its own Xaravel Test.

**Given** `Sleep.for(1).second()`, not awaited
**When** the unit ends
**Then** the sleep was awaited by the frame. Sleep is a destructor-terminal-style object if Upstream relies on its destructor, or an explicit await otherwise, as `PORTING.md` records.

### Story 20.5: ServiceProvider, Manager and environment utilities

As an App Developer,
I want the `ServiceProvider` base, the `Manager` / `MultipleInstanceManager` driver pattern, and Support's environment utilities,
So that Components and packages extend the framework the Laravel way (FR-21).

**Acceptance Criteria:**

**Given** the test scope `tests/Support/{SupportServiceProviderTest,SupportNamespacedItemResolverTest,ConfigurationUrlParserTest,SupportComposerTest,SupportNodePackageManagerTest,SupportCapsuleManagerTraitTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason
**And** `SupportComposerTest` and `SupportNodePackageManagerTest` are `blocked-by:process` until Epic 28.

**Given** a `Manager` subclass with `create<Name>Driver` methods
**When** `driver('name')` is called
**Then** it creates the driver once per Application, and `extend('name', fn)` registers a custom driver (Contract → Manager → Driver).

**Given** `ConfigurationUrlParser`
**When** it parses a `DATABASE_URL` / `REDIS_URL`-style string
**Then** the result matches Upstream's.

### Story 20.6: Port the testing-fake and component-facade suites

As a Framework Agent,
I want the Support suites that depend on later Components translated now, so that they fail with `BlockedByComponentError`,
So that their Test IDs leave `not-ported-yet` and are re-verified when each Component lands (Global rules, AD-15).

**Acceptance Criteria:**

**Given** the test scope `tests/Support/{SupportTestingBusFakeTest,SupportTestingQueueFakeTest,SupportTestingMailFakeTest,SupportTestingNotificationFakeTest,SupportTestingEventFakeTest,SupportFacadesQueueTest,SupportFacadesHttpTest,SupportFacadesEventTest}.php::*`
**When** the harness runs it
**Then** each Test ID passes, or fails with `BlockedByComponentError(<c>)` and is recorded as `blocked-by:<c>`, where `<c>` is bus, queue, mail, notifications, events or http
**And** the translations pass Fidelity Review against Upstream.

**Given** this slice and Epics 18 and 19
**When** Support's Phase 2 work closes
**Then**:
- the API-surface diff for every Support class except the fakes shows zero unexplained members;
- `async-surface.json` is committed;
- the Support helpers docs are written;
- `@xaravel/support` installs and works standalone (FR-10).

## Epic 21: http-foundation

Http, Routing, Session, Cookie and Filesystem get the Symfony HttpFoundation and HttpKernel surface that Laravel exercises, ported once over Web `Request` / `Response`.

**Supports:** FR-28, FR-29. **Owns port (AD-22):** symfony/http-foundation and the HttpKernel exceptions.

**Kind:** Xaravel Component.
- Every acceptance criterion is verified by an `XT-http-foundation-<n>` test.
- Symfony behaviour is verified by Oracle Differential Xaravel Tests.
- **Scope:** every Symfony HttpFoundation and HttpKernel member that Upstream `src/` or `tests/` references at the Pin. A Story 21.1 scan produces the list.

### Story 21.1: Request and parameter bags over Web `Request`

As a Framework Agent,
I want Symfony's `Request`, its bags and server variables built from a Bun `Request`,
So that Laravel's Request layer ports on top of the same API it uses in PHP (FR-28).

**Acceptance Criteria:**

**Given** a scan of the Symfony HttpFoundation and HttpKernel classes and members referenced in Upstream `src/` and `tests/`
**When** it is committed as `packages/http-foundation/surface.jsonl`
**Then** every listed member is implemented by the Epic's close, and Story 21.3 checks this.

**Given** a Web `Request` with a method, URL, headers and a body
**When** `Request.createFromBase(webRequest, { remoteAddress })` builds the request
**Then** `query`, `request`, `attributes`, `cookies`, `files`, `server` and `headers` are populated as Symfony populates them from PHP's superglobals
**And** `getMethod`, `getScheme`, `getHost`, `getPort`, `getPathInfo`, `getRequestUri`, `getUri` and `getClientIp` (with trusted proxies and headers) match Oracle fixtures.

**Given** `await request.loadBody({ maxBytes })`
**When** the body is larger than `maxBytes`
**Then** it rejects without reading past the limit
**And** a second call returns the already-parsed body without reading it again (FR-28 consequences, AD-12).

**Given** an `application/x-www-form-urlencoded` or `multipart/form-data` body with nested `a[b][]` keys
**When** it is parsed
**Then** the result matches PHP's `$_POST` / `$_FILES` structure as `PhpArray`s.

### Story 21.2: Response family and conversion to Web `Response`

As a Framework Agent,
I want Symfony's `Response`, `JsonResponse`, `RedirectResponse`, `StreamedResponse`, `BinaryFileResponse`, `Cookie` and `ResponseHeaderBag`,
So that Laravel's responses port unchanged and convert to a Bun `Response` (FR-29).

**Acceptance Criteria:**

**Given** each response class
**When** it is prepared against a request and converted with `toWebResponse()`
**Then** the status, headers (including `Set-Cookie` and `Content-Disposition`) and body match Oracle fixtures of the same response in PHP.

**Given** `HeaderUtils.makeDisposition` with non-ASCII, empty and `%`-containing filenames
**When** it runs
**Then** it produces Symfony's ASCII fallback and RFC 5987 encoding, matching the Oracle.

**Given** a `StreamedResponse` created inside a unit frame
**When** its callback writes chunks after the handler returns
**Then** each chunk is flushed as it is written, and `currentFrame()` inside the callback is the creating frame (AD-5).

### Story 21.3: UploadedFile, File and HttpKernel exceptions

As a Framework Agent,
I want `File`, `UploadedFile` and the HttpKernel `HttpException` hierarchy,
So that uploads and HTTP errors behave as in Laravel (FR-28, FR-35).

**Acceptance Criteria:**

**Given** a multipart upload
**When** it becomes an `UploadedFile`
**Then** `getClientOriginalName`, `getClientOriginalExtension`, `getMimeType`, `guessExtension`, `getSize`, `isValid` and `getError` behave as in Symfony
**And** MIME guessing uses `@xaravel/mime` once Epic 22 is accepted, with an extension-based fallback until then.

**Given** `HttpException`, `NotFoundHttpException`, `AccessDeniedHttpException`, `MethodNotAllowedHttpException`, `TooManyRequestsHttpException` and the rest of the referenced hierarchy
**When** they are constructed
**Then** status codes and headers match Symfony's, and each class is registered under its Symfony FQCN.

**Given** `surface.jsonl`
**When** the Epic closes
**Then** every listed member exists, the package docs record that it covers "Laravel's exercised surface only" (OQ-3), and `async-surface.json` lists `loadBody`.

## Epic 22: mime

Mail and Http get the symfony/mime surface that Laravel uses, ported once.

**Owns port (AD-22):** symfony/mime. **Kind:** Xaravel Component. Every acceptance criterion is verified by an `XT-mime-<n>` test, with Oracle Differential output for message rendering.

### Story 22.1: MIME types and addresses

As a Framework Agent,
I want `MimeTypes` guessing and `Address` parsing as in Symfony,
So that uploads, downloads and mail agree on types and addresses (FR-28, FR-89).

**Acceptance Criteria:**

**Given** Symfony's extension-to-type map at the Pin's version
**When** `MimeTypes.getMimeTypes(ext)` and `getExtensions(type)` are called for every entry
**Then** the results match the Oracle.

**Given** file contents with known signatures (png, jpg, pdf, gif, svg, zip)
**When** `guessMimeType(path)` runs
**Then** it returns Symfony's result.

**Given** `Address.create('"Name" <a@b.c>')`, IDN domains and invalid strings
**When** they are parsed
**Then** the results and exceptions match Symfony.

### Story 22.2: Email message model and rendering

As a Framework Agent,
I want Symfony's `Email`, `Part` and `Header` classes to render the bytes Symfony renders,
So that Mail can produce messages that are byte-identical to Laravel's (FR-89).

**Acceptance Criteria:**

**Given** messages with text and HTML alternatives, attachments, inline parts, UTF-8 subjects and long headers
**When** they render with a fixed boundary, date and message ID
**Then** the bytes match Oracle fixtures, including header folding and encoded-word encoding.

**Given** the package
**When** the Epic closes
**Then** every symfony/mime member referenced by Upstream `src/` exists, and the docs are written.

## Epic 23: finder

Filesystem, Session and others get symfony/finder over `Bun.Glob`, ported once.

**Owns port (AD-22):** symfony/finder. **Kind:** Xaravel Component. Every acceptance criterion is verified by an `XT-finder-<n>` test.

### Story 23.1: Finder over `Bun.Glob`

As a Framework Agent,
I want the Finder API that Laravel uses, built on `Bun.Glob`,
So that file discovery returns the same files in the same order as in PHP (AD-22).

**Acceptance Criteria:**

**Given** a fixture directory tree containing dotfiles, nested directories and symlinks
**When** Finder queries run, combining `in`, `files`, `directories`, `name`, `notName`, `depth`, `exclude`, `ignoreDotFiles`, `ignoreVCS`, `followLinks`, `sortByName` and `date`
**Then** the results and their order match Oracle fixtures from symfony/finder.

**Given** every Finder member referenced in Upstream `src/`
**When** the Epic closes
**Then** each exists, the docs are written, and the dependency reason is in the README.

## Epic 24: Pipeline

App Developers send objects through pipes, as Laravel does.

**Covers:** FR-24 (Pipeline). **Kind:** Upstream Component, with selector test scope.

### Story 24.1: Pipeline and Hub

As an App Developer,
I want `Pipeline.send().through().then()` with class, closure and string pipes, and the `Hub`,
So that middleware-style processing works as in Laravel (FR-24).

**Acceptance Criteria:**

**Given** the test scope `tests/Pipeline/{PipelineTest,HubTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason
**And** `tests/Integration/Pipeline/**` is `blocked-by:testbench`.

**Given** a pipe that returns a Promise
**When** the pipeline runs
**Then** `then()` returns a Promise and pipes run strictly in order (DIV-1 callback clause)
**And** with only sync pipes, `then()` returns synchronously.

**Given** string pipes with parameters (`'throttle:60,1'`)
**When** they are resolved
**Then** they resolve through the container and receive their parameters as Upstream specifies.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate pipeline` passes, `async-surface.json` is committed, and the docs are written.

## Epic 25: Encryption

App Developers encrypt with `Crypt`, and payloads interoperate with PHP Laravel in both directions, including key rotation.

**Covers:** FR-77. **Implements:** AD-23 (`AppKey`, `jsonEncode` flags). **Kind:** Upstream Component, with selector test scope, plus Oracle interop Xaravel Tests.

### Story 25.1: Encrypter

As an App Developer,
I want `Crypt.encrypt` / `decrypt` / `encryptString` with AES-256-CBC and AES-256-GCM, MAC verification and `APP_PREVIOUS_KEYS`,
So that encryption behaves exactly as Laravel's (FR-77).

**Acceptance Criteria:**

**Given** the test scope `tests/Encryption/EncrypterTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason
**And** `tests/Integration/Encryption/**` is `blocked-by:testbench`.

**Given** `@xaravel/encryption`'s `AppKey`
**When** it parses `APP_KEY=base64:...` and `APP_PREVIOUS_KEYS`
**Then** `raw()`, `configString()` and `previous()` return the forms that `PORTING.md` records for each consumer.

**Given** a payload that fails MAC verification, or uses an unsupported cipher
**When** it is decrypted
**Then** it throws `DecryptException` with Upstream's message.

### Story 25.2: PHP interoperability

As an App Developer migrating from Laravel,
I want payloads encrypted by PHP Laravel to decrypt in Xaravel, and the reverse,
So that a migrated app keeps its encrypted data (FR-77).

**Acceptance Criteria:**

**Given** Oracle fixtures of `Crypt::encrypt` (serialized) and `encryptString` (unserialized), made with a fixed key, for scalars, arrays and strings, with both ciphers
**When** Xaravel decrypts them with the same key
**Then** it recovers the original values.

**Given** Xaravel-encrypted payloads, submitted as a Story 3.4 Oracle request
**When** the Oracle decrypts them
**Then** it recovers the original values (FR-77 consequence).

**Given** a payload encrypted with a previous key
**When** it is decrypted after rotation
**Then** it decrypts with the previous key.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate encryption` passes and the docs are written.

## Epic 26: Hashing

App Developers hash and verify bcrypt and argon2id passwords. PHP `$2y$` hashes and passwords over 72 bytes behave exactly as in PHP.

**Covers:** FR-78. **Kind:** Upstream Component, with selector test scope, plus Oracle Differential Xaravel Tests.

### Story 26.1: Hasher drivers and PHP compatibility

As an App Developer migrating from Laravel,
I want bcrypt and argon2id hashing over `Bun.password`, compatible with PHP,
So that a migrated users table keeps working (FR-78).

**Acceptance Criteria:**

**Given** the test scope `tests/Hashing/HasherTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** Oracle `$2y$` hashes of passwords of 0, 71, 72, 73 and 200 bytes, including multibyte UTF-8
**When** `Hash.check` verifies them
**Then** each verifies, because input is truncated to 72 UTF-8 bytes before Bun is called (OQ-8 decision)
**And** Xaravel hashes of the same passwords verify in the Oracle.

**Given** argon2id hashes from the Oracle, with its memory, time and threads options
**When** they are verified, and `needsRehash` runs with Laravel's config
**Then** both match PHP
**And** `hashing.argon.threads` behaviour is decided by these Differential Tests, with any difference raised as an Escalation.

**Given** `hashing.verify = true` and a hash from a different algorithm
**When** `check` runs
**Then** it throws, as Upstream does.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate hashing` passes and the docs are written.

## Epic 27: Filesystem

App Developers use `Storage` disks (local, public, and s3 through `Bun.S3Client`) with streaming, temporary URLs, visibility and fakes.

**Covers:** FR-76. **Owns port (AD-22):** league/flysystem, over Bun file APIs and `Bun.S3Client`.

**Kind:** Upstream Component, with selector test scope. `FAT` = `tests/Filesystem/FilesystemAdapterTest.php`. `tests/Integration/Filesystem/**` is `blocked-by:testbench`.

**Needs:** Epics 21 and 23.

### Story 27.1: The local `Filesystem` class

As an App Developer,
I want `Illuminate\Filesystem\Filesystem` (`File`) for local file operations, including `LockableFile`,
So that framework and app code manipulate files as in Laravel (FR-76).

**Acceptance Criteria:**

**Given** the test scope `tests/Filesystem/{FilesystemTest,JoinPathsHelperTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a sync Upstream method such as `File.exists` or `File.get`
**When** it is classified under AD-6
**Then** it is async only if it reaches the `Filesystem` IO root, as recorded in `async-surface.json`
**And** each test that awaits it is marked `adapted:DIV-1.<k>`.

### Story 27.2: flysystem port and the local disk adapter

As an App Developer,
I want `FilesystemAdapter` over a flysystem-compatible local adapter,
So that `Storage.disk('local')` behaves as in Laravel (FR-76).

**Acceptance Criteria:**

**Given** the test scope: every `FAT` Test ID not matched by Stories 27.3 and 27.4
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `put`, `get`, `readStream` / `writeStream`, `copy`, `move`, `delete`, `visibility` and `checksum`
**When** they run on the local disk
**Then** their results and exceptions match Upstream
**And** the `throw` and `report` disk options behave as in `testThrowExceptionsFor*` / `testReportExceptionsFor*`.

**Given** a path containing `..` that escapes the root or prefix
**When** it is resolved
**Then** it is rejected as Upstream rejects it.

### Story 27.3: S3 disk and temporary URLs over `Bun.S3Client`

As an App Developer,
I want the `s3` disk with temporary download and upload URLs, on `Bun.S3Client`,
So that cloud storage works without the AWS SDK (FR-76).

**Acceptance Criteria:**

**Given** the test scope `FAT::{test*S3*,testProvidesTemporaryU*,testTemporaryU*,testPrefixesUrls,testUsesRightSeperator*,testCreateFtpDriver}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** Upstream S3 tests that mock the AWS SDK client
**When** they are translated
**Then** they need an adaptation rule for `Bun.S3Client`. The implementing agent raises an Escalation proposing a DIV clause, and these Test IDs stay `not-ported-yet` until the clause exists.

**Given** a local S3-compatible service in CI (Xaravel Tests)
**When** `put`, `get`, `temporaryUrl` and `temporaryUploadUrl` run
**Then** the files round-trip, and presigned URLs work until they expire.

**Given** `ftp` and `sftp` drivers
**When** they are classified
**Then** they are `deferred:` items. The Maintainer adds them to `conformance/deferred-items`, or rules otherwise through an Escalation.

### Story 27.4: FilesystemManager, `Storage.fake` and file responses

As an App Developer,
I want the disk manager, `Storage.fake()` and the download and stream responses,
So that apps configure disks and test storage as in Laravel (FR-76).

**Acceptance Criteria:**

**Given** the test scope `tests/Filesystem/FilesystemManagerTest.php::*` and `FAT::{testResponse,testMimeTypeIsNotCalled*,testSizeIsNotCalled*,testFallbackName*,testDownload*,testAssertEmpty*}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `Storage.fake('avatars')` in a test
**When** the test ends
**Then** the fake disk and its files are discarded, and the next test sees the configured disk (NFR-7).

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate filesystem` passes, `async-surface.json` is committed, the docs are written, and the flysystem port's reason is in the README.

## Epic 28: Process

App Developers run processes, pools and pipes through `Bun.spawn`, with timeouts and fakes.

**Covers:** FR-80. **Owns port (AD-22):** symfony/process, over `Bun.spawn`.

**Kind:** Upstream Component, with selector test scope. `PT` = `tests/Process/ProcessTest.php`.

### Story 28.1: Real processes, output, timeouts and pipes

As an App Developer,
I want `Process.run` / `start` with output callbacks, standard input, timeouts, idle timeouts and pipes,
So that shelling out works as in Laravel (FR-80).

**Acceptance Criteria:**

**Given** the test scope `PT::{testSuccessfulProcess,testOutputCanBeRetrieved*,testReal*,testQuietProcessesReturnEmptyOutput,testQuietProcessesCanThrow,testATimeout*,testASubSecond*,testGeneralTimeouts*,testIdleTimeouts*,testTimedOutProcesses*,testProcessPipe*,testProcessSimplePipe*,testProcessWithMultipleEnvironmentVariablesAndSequences}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a process that exceeds its timeout
**When** it runs
**Then** it is killed and `ProcessTimedOutException` is thrown, and the result is still available, as in Upstream.

### Story 28.2: Process pools

As an App Developer,
I want `Process.pool()` with named processes, iteration and failure handling,
So that concurrent commands work as in Laravel (FR-80).

**Acceptance Criteria:**

**Given** the test scope `PT::{testProcessPool*,testInvokedProcessPool*,testQuietProcessesInPoolsCanThrow}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a pool
**When** it starts
**Then** its processes run concurrently. This use of `Promise.all` is listed in `PORTING.md` as Upstream-concurrent (AD-6).

### Story 28.3: Process fakes and assertions

As an App Developer,
I want `Process.fake()`, sequences, stray-process prevention and the fake assertions,
So that code that runs processes is testable (FR-80).

**Acceptance Criteria:**

**Given** the test scope: every `PT` Test ID not matched by Stories 28.1 and 28.2
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `Process.fake()` in one test
**When** the next test runs a real process
**Then** it isn't faked, because the fake is frame-scoped (NFR-7).

**Given** `SupportComposerTest` and `SupportNodePackageManagerTest` (`blocked-by:process` since Story 20.5)
**When** this Story re-verifies them, with `component: support` in the manifest
**Then** they pass, or carry a valid non-`blocked-by` reason.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate process` passes, `async-surface.json` is committed, and the docs are written.

## Epic 29: Log & Context

App Developers log through Laravel's channels. Request-scoped Context is added to log entries and isolated per unit.

**Covers:** FR-81; also FR-35 (logging). **Owns port (AD-22):** monolog/monolog. **Implements:** AD-6 (sync logger with buffered async flush), AD-5 (Log context and Context in frame slots).

**Kind:** Upstream Component, with selector test scope.
- Most Upstream Log and Context tests are integration tests (`tests/Integration/Log/**`), so they are `blocked-by:testbench` and cleared in Epic 60.
- Until then, Xaravel Tests (`XT-log-<n>`) and Oracle Differential tests cover the behaviour.

### Story 29.1: Monolog port

As a Framework Agent,
I want the Monolog surface that Laravel uses: `Logger`, handlers, formatters and processors,
So that log channels write exactly what Laravel writes.

**Acceptance Criteria:**

**Given** `Logger`, `StreamHandler`, `RotatingFileHandler`, `SyslogHandler`, `ErrorLogHandler`, `NullHandler`, `LineFormatter`, `JsonFormatter`, `PsrLogMessageProcessor` and the level model
**When** records with context and extra data are formatted, under a fixed clock
**Then** the formatted lines match Oracle fixtures from Monolog at the Pin's version.

**Given** a log call
**When** it runs
**Then** it returns synchronously. Handler IO is buffered and flushed asynchronously, and the flush is registered on the current frame's `defer` list (AD-6)
**And** processes flush on `beforeExit` and on SIGTERM / SIGINT.

### Story 29.2: Log manager and channels

As an App Developer,
I want the `single`, `daily`, `stack`, `stderr`, `syslog`, `null` and custom channels, with Laravel's Logger wrapper,
So that `Log.channel('x').info()` behaves as in Laravel (FR-35).

**Acceptance Criteria:**

**Given** the test scope `tests/Log/LogLoggerTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason
**And** `tests/Integration/Log/{LogManagerTest,JsonFormatterTest,LoggingIntegrationTest}.php::*` are translated and recorded as `blocked-by:testbench`.

**Given** each built-in driver, configured as in Laravel's default `config/logging.php`
**When** a message is logged (Xaravel Tests)
**Then** it reaches the expected file, rotation file, stream or no-op
**And** `stack` fans out in order, and a custom `via` factory is honoured.

**Given** `Log.withContext({...})` inside one unit
**When** a concurrent unit logs
**Then** it doesn't carry that context, because Log context is a frame slot (AD-5)
**And** `MessageLogged` listeners must be sync, so registering an async one throws.

### Story 29.3: Context

As an App Developer,
I want `Context.add` / `push` / `addHidden` / `scope` / `remember` and the dehydrate and hydrate hooks,
So that request-scoped data reaches log entries and jobs (FR-81).

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Log/{ContextTest,ContextIntegrationTest}.php::*`
**When** it is translated
**Then** each Test ID is recorded as `blocked-by:testbench` (Epic 60 re-verifies them).

**Given** two units interleaved at every `await`, with `Context.add` in each
**When** each reads its Context
**Then** each sees only its own data (FR-81 consequence).

**Given** a log entry written while Context holds visible and hidden values
**When** it is formatted
**Then** visible values appear under `context`, and hidden values never do (`ContextLogProcessor`).

**Given** `Context.dehydrating(fn)`
**When** a payload is built
**Then** Context is serialized under `illuminate:log:context`, ready for the AD-24 envelope. The queue side is `blocked-by:queue`.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate log` passes, `async-surface.json` is committed, and the Log and Context docs are written.

## Epic 30: Translation

App Developers use language files, `__()`, `trans_choice()` and JSON translations.

**Covers:** FR-83. **Kind:** Upstream Component, with selector test scope. `tests/Integration/Translation/**` is `blocked-by:testbench`.

**Needs:** Epic 27.

### Story 30.1: Translation file loaders

As an App Developer,
I want language files loaded from `lang/<locale>/*.ts` and `lang/<locale>.json`, with namespaced and vendor paths,
So that translations are organised as in Laravel (FR-83).

**Acceptance Criteria:**

**Given** the test scope `tests/Translation/TranslationFileLoaderTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** Upstream's PHP-array language files
**When** they are translated for Xaravel
**Then** they become `export default {...}` TypeScript modules, by the rule in `PORTING.md`, loaded synchronously after boot (Translator is sync, AD-6).

### Story 30.2: Translator and pluralization

As an App Developer,
I want `__()`, `trans()`, `trans_choice()`, replacements, fallbacks and per-locale plural rules,
So that localized output matches Laravel's (FR-83).

**Acceptance Criteria:**

**Given** the test scope `tests/Translation/{TranslationTranslatorTest,TranslationMessageSelectorTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `App.setLocale('fr')` inside one unit
**When** a concurrent unit translates
**Then** it uses its own locale, because the Translator locale is a frame slot (AD-5).

**Given** `trans_choice` with interval and range syntax (`{0} none|[1,19] some|[20,*] many`) across the plural-rule locales
**When** it runs
**Then** the selected form matches Oracle fixtures.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate translation` passes and the docs are written.

## Epic 31: serializable-closure

Closures can be serialized safely, with explicit arguments and signed payloads, before Bus needs them.

**Covers:** FR-88 (the codec). **Implements:** AD-14, DIV-4. **Kind:** Xaravel Component. Every acceptance criterion is verified by an `XT-serializable-closure-<n>` test.

### Story 31.1: Closure analysis and capture rejection

As an App Developer,
I want a closure that captures outer variables to fail at dispatch with an explanatory error,
So that I find out at the call site, not on the worker (FR-88, DIV-4).

**Acceptance Criteria:**

**Given** a closure's source, parsed with the parser chosen under NFR-2 (recorded in the README)
**When** its free identifiers are computed
**Then** an identifier is allowed only if it is one of:
- a parameter;
- an ECMAScript standard built-in;
- a name in `allowed-identifiers.json` (a facade or helper).

**Given** `dispatch(async ({ podcast }) => podcast.publish(), { podcast })`
**When** it is analysed
**Then** it is accepted.

**Given** `dispatch(async () => podcast.publish())`, where `podcast` is an outer variable
**When** it is analysed
**Then** it throws an error that names `podcast` and shows the rewrite to an explicit argument (FR-88 consequence).

**Given** closures that use `this`, `arguments`, `import()` or an imported binding
**When** they are analysed
**Then** each is rejected with a specific message.

### Story 31.2: Signed payload codec and worker reconstruction

As an App Developer,
I want closure payloads signed with `APP_KEY` and rebuilt on the worker with only their arguments, built-ins and facades,
So that a forged or tampered payload never runs (FR-88).

**Acceptance Criteria:**

**Given** an accepted closure and its arguments
**When** it is serialized
**Then** the payload carries the source and the arguments (classes by FQCN, models as `ModelIdentifier` placeholders, other values through `phpSerialize`)
**And** it is signed with the config-string `APP_KEY` in `laravel/serializable-closure`'s signed format.

**Given** a payload with an invalid signature
**When** it is unserialized
**Then** it throws `InvalidSignatureException` and never evaluates the source (FR-88 consequence).

**Given** a valid payload on a worker
**When** it is rebuilt with a resolver that supplies facades and helpers from the Application
**Then** the closure can reach only its arguments, ES built-ins and those facades and helpers
**And** reading any other global throws a `ReferenceError`, and the codec imports no facade itself (AD-14).

**Given** the package
**When** the Epic closes
**Then** the docs, with Divergences (DIV-4), are written.

## Epic 32: Bus

App Developers dispatch commands, and use Bus chains and batches on the Bus side.

**Covers:** FR-87 (Bus). **Implements:** AD-6 (destructor terminals), AD-14.

**Kind:** Upstream Component, with selector test scope.
- Paths that need a queue connection are `blocked-by:queue`.
- Batch storage needs the database: `blocked-by:database`.

**Needs:** Epics 24 and 31.

### Story 32.1: Dispatcher, PendingDispatch and Queueable

As an App Developer,
I want `dispatch()`, `dispatchSync`, `Bus.dispatch` and the `Queueable` options, with `dispatch()` starting itself like Laravel's destructor does,
So that `dispatch(new Job).onQueue('emails')` works without an `await` (FR-87, DIV-1).

**Acceptance Criteria:**

**Given** the test scope `tests/Bus/{BusDispatcherTest,BusPendingDispatchTest,QueueableTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `dispatch(job).onQueue('emails').delay(10)`, called synchronously
**When** the current microtask finishes
**Then** the dispatch terminal starts once, with both options applied
**And** the frame awaits it before the unit ends, and `await dispatch(job)` returns the same Promise (AD-6).

**Given** a `PendingDispatch` created outside any frame
**When** it is constructed
**Then** it throws.

**Given** job middleware
**When** a command runs through the dispatcher
**Then** the middleware runs through Pipeline, in Upstream's order.

### Story 32.2: Chains and batches

As an App Developer,
I want `Bus.chain()` and `Bus.batch()` with callbacks, `allowFailures` and `Batchable`,
So that multi-job workflows are described as in Laravel (FR-87).

**Acceptance Criteria:**

**Given** the test scope `tests/Bus/{BusPendingBatchTest,BusBatchTest,BusBatchableTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid Skip Reason other than `not-ported-yet`
**And** the tests that need the database batch repository are `blocked-by:database`.

**Given** `Bus.batch([...]).then(cb).catch(cb).finally(cb).dispatch()`
**When** the callbacks are stored
**Then** they are serialized through the serializable-closure codec, and a callback that captures outer variables fails at dispatch (DIV-4).

**Given** `PendingChain` / `PendingBatch` `dispatch`
**When** it is called without `await`
**Then** it starts in a microtask and is tracked by the frame, as in Story 32.1.

### Story 32.3: Re-verify Support's Bus fake

As a Framework Agent,
I want `BusFake` implemented in Support now that Bus exists,
So that the Support Test IDs that were `blocked-by:bus` are cleared (Global rules).

**Acceptance Criteria:**

**Given** a manifest with `component: support` and the test scope `tests/Support/SupportTestingBusFakeTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid reason that names a later Component (for example `blocked-by:queue`).

**Given** the Bus package
**When** the Epic closes
**Then** `api-surface:gate bus` passes, `async-surface.json` lists the destructor terminals, and the docs (with Divergences: DIV-1 self-starting dispatch, DIV-4) are written.

## Epic 33: Events

App Developers dispatch events to listeners and subscribers, with discovery from files (DIV-7) and `Event.fake()`.

**Covers:** FR-75. **Kind:** Upstream Component, with selector test scope.
- Queued listeners are `blocked-by:queue`, and broadcast events `blocked-by:broadcasting`.
- `tests/Integration/Events/**` is `blocked-by:testbench`.

**Needs:** Epic 32.

### Story 33.1: Event dispatcher

As an App Developer,
I want `Event.listen`, wildcards, `until`, `push` / `flush`, subscribers and `dispatch`,
So that event-driven code ports unchanged (FR-75).

**Acceptance Criteria:**

**Given** the test scope `tests/Events/{EventsDispatcherTest,EventsSubscriberTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** three listeners, one of them async
**When** an event is dispatched
**Then** they run sequentially in registration order, each awaited, and `dispatch` returns a Promise (DIV-1).

**Given** an event object
**When** it is dispatched
**Then** its name is `fqcn(event)`, never `constructor.name` (AD-10).

**Given** `Event.listen(...)` called at runtime inside a request frame after `sealed`
**When** a concurrent unit dispatches
**Then** it doesn't see the listener, because runtime listeners are frame overlays (AD-5).

### Story 33.2: Listener discovery without reflection

As an App Developer,
I want listeners in `app/Listeners` discovered from their `inject` metadata,
So that I don't register them by hand, even though TypeScript erases types (FR-75, DIV-7).

**Acceptance Criteria:**

**Given** a listener class whose `handle` is declared with `inject({ event: OrderShipped })`
**When** `discoverEvents(dirs)` runs
**Then** it maps `OrderShipped`'s FQCN to that listener, using the first `inject` key (AD-4).

**Given** an invokable listener with `__invoke` declared with `inject`
**When** discovery runs
**Then** it registers `__invoke`.

**Given** a listener without `inject` metadata on its `handle`
**When** discovery runs
**Then** it is skipped, with a warning naming the file.

**Given** a union `inject({ event: oneOf(A, B) })`
**When** discovery runs
**Then** the listener is registered for both `A` and `B`, as PHP union types are.

### Story 33.3: Queued and broadcast events, and Support's Event fake

As a Framework Agent,
I want the queued-listener and broadcast-event suites translated, and `EventFake` implemented in Support,
So that their Test IDs leave `not-ported-yet`, and the Support entries blocked on Events are cleared (Global rules).

**Acceptance Criteria:**

**Given** the test scope `tests/Events/{QueuedEventsTest,BroadcastedEventsTest}.php::*`
**When** the harness runs it
**Then** each Test ID passes, or is recorded as `blocked-by:queue` or `blocked-by:broadcasting`, matching its `BlockedByComponentError`.

**Given** a re-verification manifest with `component: support` and the test scope `tests/Support/{SupportTestingEventFakeTest,SupportFacadesEventTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid reason that names a later Component.

**Given** the Events package
**When** the Epic closes
**Then** `api-surface:gate events` passes, `async-surface.json` is committed, and the docs (with Divergences: DIV-1, DIV-7) are written.

### Story 33.4: Phase 3 `blocked-by` sweep

As the Maintainer,
I want every `blocked-by` entry that names a Phase 3 Component re-verified,
So that Phase 3 can complete. A Phase isn't complete while any `blocked-by` entry points at it (Global rules, FR-13).

**Acceptance Criteria:**

**Given** the test scope: every Expectations entry whose reason is `blocked-by:<c>`, for `<c>` in {http-foundation, mime, finder, pipeline, encryption, hashing, filesystem, process, log, translation, serializable-closure, bus, events}, resolved by sprint planning when this Story is planned, with one manifest per owning Component (AD-21), including Container's `Storage()` and `Log()` descriptors (Story 17.2)
**When** the harness runs it
**Then** each Test ID passes, or carries a valid reason that names a later-Phase Component.

**Given** the Expectations File after this Story merges
**When** the Phase-completion check runs
**Then** zero entries are `blocked-by:<c>` for any Phase 3 Component, and the check fails, listing them, if any remain.

## Epic 34: Database: connections, query builder, grammars & transactions

App Developers query SQLite and Postgres with Laravel's builder. SQL matches the Oracle for all five grammars, and transactions hold their connection under concurrency.

**Covers:** FR-53, FR-54, FR-55. **Implements:** AD-6 (thenable builders, IO Terminals), AD-9 (`normalizeRow`, lossless integers), AD-20 (connection leases).

**Kind:** Upstream Component (Database, slice 1), with selector test scope under `tests/Database/`. `QBT` = `DatabaseQueryBuilderTest.php`. Selectors apply in Story order.
- `tests/Integration/Database/**` (about 888 methods) is `blocked-by:testbench` and is cleared in Epic 60.
- The MySQL, MariaDB and SQL Server **grammars** are built in full. Their **drivers** are `deferred:mysql-driver`, `deferred:mariadb-driver` and `deferred:sqlsrv-driver`.

**Risk:** this Epic prototypes the transaction and connection scoping (PRD §7.4).

### Story 34.1: PDO-compatible driver shim over `bun:sqlite` and `Bun.sql`

As a Framework Agent,
I want a small PDO-shaped driver seam over Bun's database clients,
So that Laravel's `Connection` code and the 38 Upstream Database test files that mock `PDO` port without restructuring (FR-53, PRD §5.1).

**Acceptance Criteria:**

**Given** the seam (`Pdo`, `PdoStatement`), with the methods Upstream calls (`prepare`, `bindValue`, `execute`, `fetchAll`, `fetch`, `rowCount`, `lastInsertId`, `beginTransaction`, `commit`, `rollBack`, `inTransaction`, `exec` and `getAttribute`)
**When** it is backed by `bun:sqlite` and by `Bun.sql`
**Then** Xaravel Tests run the same statement suite on the `sqlite` and `pgsql` variants and get the same results.

**Given** Upstream tests that `m::mock(PDO::class)`
**When** the agent starts translating them
**Then** it first raises an Escalation proposing the adaptation clause "PDO mocks target `@xaravel/database`'s `Pdo` seam". The Maintainer endorsed this design on 2026-10-16, and the Escalation records it formally. Those Test IDs stay `not-ported-yet` until the clause exists (FR-114).

**Given** a `BIGINT` column holding 2^53 + 1 with no lossless hint
**When** it is fetched through any path (`select`, `cursor`, `pluck`, `value` or an aggregate)
**Then** `normalizeRow` throws `IntegerOverflowException` naming the column
**And** with `castsBigint(['id'])` or connection `integers: 'bigint'`, it returns a `bigint` (AD-9).

### Story 34.2: Connection: statements, events, query log and errors

As an App Developer,
I want `DB.select` / `insert` / `update` / `delete` / `statement`, `pretend`, `listen`, the query log and `QueryException`,
So that raw database access behaves as in Laravel (FR-53, FR-54).

**Acceptance Criteria:**

**Given** the test scope `{DatabaseConnectionTest,DatabaseQueryExceptionTest,QueryDurationThresholdTest,DatabaseConnectionLostTest,DatabasePostgresConnectionTest,DatabaseProcessorTest,DatabaseSQLiteProcessorTest,DatabasePostgresProcessorTest,DatabaseMySqlProcessorTest,DatabaseMariaDbProcessorTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `DB.listen(fn)` and `DB.enableQueryLog()` inside one unit
**When** a concurrent unit runs queries
**Then** neither its listener nor its log sees them, because both are frame overlays (AD-5).

**Given** every statement method
**When** `async-surface.json` is generated
**Then** each one is tagged `@asyncRoot`, as a database statement method (AD-6).

### Story 34.3: Connectors, factory, manager and read/write splitting

As an App Developer,
I want connections configured from Laravel's `DB_*` keys, with multiple named connections and read/write splitting,
So that SQLite in development and Postgres in production need only `.env` changes (FR-53, FR-60).

**Acceptance Criteria:**

**Given** the test scope `{DatabaseConnectionFactoryTest,DatabaseConnectorTest,DatabaseManagerTest,DatabaseIntegrationTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a connection configured with `read` and `write` hosts and `sticky: true`
**When** a write precedes a read in the same unit
**Then** the read uses the write connection, and stickiness is per unit, not per process (AD-5).

**Given** `DB_CONNECTION=mysql` at the alpha
**When** a connection is made
**Then** it throws an error that names the deferred driver. The grammar still compiles SQL.

### Story 34.4: Query builder: selects, wheres and havings

As an App Developer,
I want the select, where and having API of the query builder,
So that query construction generates Laravel's SQL (FR-54).

**Acceptance Criteria:**

**Given** the test scope `QBT::{testBasicSelect*,testAddingSelects,testSelect*,testAlias*,testBasicAlias,testBasicTable*,testFrom*,testBasicWhere*,testWhere*,testOrWhere*,testBasicOr*,testNestedWhere*,testRawWhere*,testRawOr*,testEmptyWhere*,testArrayWhere*,testDynamicWhere*,testJsonWhere*,testJsonPath*,testDateBased*,testHaving*,testHavings*,testRawHavings,testNestedHaving*,testBitwise*,testAddBinding*,testBindingOrder*,testRawExpressions,testRawValue,testCaseInsensitive*,testPassingArray*,testProvidingNull*,testSubSelect*,testSubqueriesBindings,testWhenCallback*,testUnlessCallback*,testTapCallback,testPipeCallback}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** the same builder chain compiled by each of the five grammars
**When** `toSql()` and `getBindings()` run
**Then** they are synchronous, and match Oracle fixtures for sqlite, pgsql, mysql, mariadb and sqlsrv (FR-54 consequences).

**Given** `testDynamicWhere*` (`whereEmail()`)
**When** it is classified
**Then** it is `intentional-divergence:DIV-12` (no dynamic wheres, AD-26).

### Story 34.5: Query builder: joins, unions, ordering, aggregates, pagination and chunking

As an App Developer,
I want joins, unions, ordering, grouping, limits, aggregates, the IO Terminals, pagination and chunking,
So that read queries run and return results as in Laravel (FR-54).

**Acceptance Criteria:**

**Given** the test scope `QBT::{testBasicJoins,test*Join*,testUnion*,testUnions,testMultipleUnion*,testOrderBy*,testOrderBys*,testInOrder*,testInRandom*,testReorder,testLatest,testOldest,testGroupBys,testLimitsAnd*,testForPage*,testGetCount*,testAggregate*,testPaginate*,testCursorPaginate*,testChunk*,testFind*,testFirst*,testValue*,testPluck*,testImplode,testExistsOr*,testDoesntExists*,testClone*,testMergeBuilders*,testMergeWheres,testToRaw}` and `tests/Database/DatabaseConcernsBuildsQueriesTraitTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `const users = await DB.table('users').where('active', 1).get()`
**When** it runs
**Then** awaiting the builder runs its `get()` terminal (a thenable, AD-6). `get`, `first`, `value`, `pluck`, `count`, `exists`, `paginate` and `chunk` return Promises.

**Given** `cursor()` and `lazy()`
**When** they are consumed with `for await`
**Then** they yield an `AsyncLazyCollection`, and translated tests use `adapted:DIV-1.<k>` for `instanceof LazyCollection`.

**Given** `chunk(n, cb)`
**When** `cb` is async
**Then** the chunks run sequentially, and returning `false` stops the iteration.

### Story 34.6: Query builder: writes, locks, index hints and driver-specific SQL

As an App Developer,
I want insert, upsert, update, delete, truncate, increment, locking, index hints, vector and full-text clauses, and each driver's SQL quirks,
So that write queries match Laravel on every grammar (FR-54).

**Acceptance Criteria:**

**Given** the test scope: every `QBT` Test ID not matched by Stories 34.4 and 34.5, plus `{DatabaseQueryGrammarTest,DatabaseSQLiteQueryGrammarTest,DatabasePostgresQueryGrammarTest,DatabaseMySqlQueryGrammarTest,DatabaseMariaDbQueryGrammarTest,DatabaseSqlServerQueryGrammarTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `insertGetId` on SQLite and Postgres
**When** it runs
**Then** it returns the new key through `normalizeRow`.

**Given** `lockForUpdate()` / `sharedLock()`
**When** the query runs
**Then** it runs on a connection leased to the current frame (AD-20), on its own lease, or on the enclosing transaction's lease.

### Story 34.7: Transactions and connection leases

As an App Developer,
I want `DB.transaction(async () => …)`, nested savepoints, `afterCommit` and manual transactions, isolated per unit,
So that queries inside a transaction always use its connection, even under concurrent requests (FR-55, AD-20).

**Acceptance Criteria:**

**Given** the test scope `{DatabaseTransactionsTest,DatabaseTransactionsManagerTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** two units interleaved at every `await`, one inside `BEGIN … await … COMMIT`
**When** the other runs a query on the same named connection
**Then** that query doesn't join the transaction. This is proven for each lease mode: Postgres `reserve()`, file SQLite WAL, the `:memory:` FIFO mutex and a pool of size 1 (FR-55 consequence, NFR-4).

**Given** `afterCommit(cb)` registered inside nested transactions
**When** the outermost transaction of that unit commits
**Then** `cb` runs once
**And** on rollback it is discarded, and a concurrent unit's commit never triggers it.

**Given** a narrow `DB.transaction` frame
**When** code inside it writes non-lease slots
**Then** the writes pass through to the enclosing unit (AD-5).

## Epic 35: Database: schema builder & grammars

App Developers describe tables with the Schema builder, and the generated DDL matches the Oracle on every grammar.

**Covers:** FR-56 (schema).

**Kind:** Upstream Component (Database, slice 2), with selector test scope under `tests/Database/`. `schema:dump` needs Process (Epic 28), which is available.

### Story 35.1: Blueprint and the schema builders

As an App Developer,
I want `Schema.create` / `table` / `drop` / `hasTable` / `hasColumn` and the `Blueprint` column and index API,
So that migrations describe tables as in Laravel (FR-56).

**Acceptance Criteria:**

**Given** the test scope `{DatabaseSchemaBlueprintTest,DatabaseSchemaBuilderTest,DatabaseAbstractSchemaGrammarTest,DatabaseSchemaBuilderIntegrationTest,DatabaseSQLiteBuilderTest,DatabasePostgresBuilderTest,DatabaseMySqlBuilderTest,DatabaseMySQLSchemaBuilderTest,DatabasePostgresSchemaBuilderTest,DatabaseMariaDbBuilderTest,DatabaseMariaDbSchemaBuilderTest,SqlServerBuilderTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a `Blueprint` built by a migration
**When** it runs against live SQLite and Postgres (Xaravel Tests on both variants)
**Then** the resulting tables, columns, indexes and foreign keys match what Schema introspection reports for the same migration in the Oracle.

### Story 35.2: SQLite and Postgres schema grammars

As an App Developer,
I want the SQLite and Postgres schema grammars to emit Laravel's DDL,
So that the alpha backends migrate identically to Laravel (FR-56).

**Acceptance Criteria:**

**Given** the test scope `{DatabaseSQLiteSchemaGrammarTest,DatabasePostgresSchemaGrammarTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** SQLite table alterations that need a table rebuild
**When** they compile
**Then** the statement sequence matches Upstream's.

### Story 35.3: MySQL, MariaDB and SQL Server schema grammars

As an App Developer,
I want the MySQL, MariaDB and SQL Server schema grammars complete, even though their drivers come after the alpha,
So that grammar conformance is full from the start (FR-54, FR-56).

**Acceptance Criteria:**

**Given** the test scope `{DatabaseMySqlSchemaGrammarTest,DatabaseMariaDbSchemaGrammarTest,DatabaseSqlServerSchemaGrammarTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a grammar test that needs a live server
**When** it is classified
**Then** it is `deferred:<engine>-driver`, never `skip` without a reason.

### Story 35.4: Schema state and `schema:dump` support

As an App Developer,
I want schema dumps and loads for SQLite and Postgres,
So that `schema:dump` and squashed migrations work as in Laravel (FR-56).

**Acceptance Criteria:**

**Given** the test scope `{DatabaseSqliteSchemaStateTest,DatabasePostgresSchemaStateTest,DatabaseMySqlSchemaStateTest,DatabaseMariaDbSchemaStateTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `SchemaState.dump()` / `load()` on SQLite and Postgres
**When** they run through `Process`
**Then** they invoke `sqlite3` and `pg_dump` / `psql` with the arguments Upstream uses, and a dump followed by a load reproduces the schema (Xaravel Tests).

## Epic 36: Eloquent: models, attributes, casts, events & serialization

App Developers define models with Laravel's conventions, casts, accessors, observers, serialization and API resources.

**Covers:** FR-61, FR-64, FR-65, FR-66. **Implements:** AD-7 (the constructor Proxy), AD-9 (brands, `bigint` casts), AD-10 (model registration), AD-23 (`toJSON` delegates to `jsonSerialize`).

**Kind:** Upstream Component (Database, slice 3), with selector test scope. `EMT` = `tests/Database/DatabaseEloquentModelTest.php`, `EBT` = `tests/Database/DatabaseEloquentBuilderTest.php`.
- **Relationship selectors** in `EMT` and `EBT` belong to Epic 37, and are excluded here:
  - in `EMT`: `testHasOne`, `testHasMany`, `testBelongsTo*`, `testMorph*`, `testCorrectMorph*`, `testRelations*`, `testRelationship*`, `testWith*`, `testEagerLoading`, `testWithoutMethod`;
  - in `EBT`: `test*Has*`, `testWith*`, `testWit*`, `testWhereHas*`, `testDoesntHave*`, `testOrDoesnt*`, `testWhereDoesnt*`, `testWhereMorphed*`, `testWhereAttached*`, `testWhereBelongs*`, `testEagerLoad*`, `testRelationshipEager*`, `testGetRelation*`, `testSelfHas*`, `testRealNested*`.
- Within this Epic, selectors apply in Story order, and any remaining `EMT` Test ID belongs to Story 36.1.

### Story 36.1: Model core: attributes, fill, guard and dirty tracking

As an App Developer,
I want models whose columns read and write as properties, with `fillable` / `guarded`, dirty tracking, `replicate` and `clone`,
So that a model class looks and behaves like its Laravel original (FR-61, AD-7).

**Acceptance Criteria:**

**Given** the test scope `EMT::{testDirty*,testClean*,testFill*,testFillable*,testGuarded*,testGlobalGuarded,testUnguard*,testForceFill,testSetAttribute,testSettingAttributes,testAttributeManipulation,testGetOriginal,testDiscardChanges,testCloneModel*,testReplicate*,testNewInstance*,testMakeMethod,testUnderscoreProperties,testIssetBehaves*,testArrayAccess,testModelAttribute*,testCalculatedAttributes,testHasAttribute,testGetKey,testIntKey,testStringKey,testIntAnd*,testFloatAnd*,testNonExisting*,testUnsavedModel*}`, `tests/Database/{DatabaseConcernsHasAttributesTest,DatabaseConcernsPreventsCircularRecursionTest}.php::*`, plus every `EMT` Test ID matched by no selector in Epics 36 and 37
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `class Post extends Model { declare title: string; published = false; }`
**When** it is constructed with `new Post({ title: 'x' })`
**Then** it follows Laravel's order: config, then defaults, then `syncOriginal()`, then `fill`. `post.title` reads through `getAttribute`, and `published` defaults to `false` without being dirty.

**Given** a subclass field that is neither config, nor `declare`, nor a known default
**When** the class is first constructed
**Then** it throws, naming the field
**And** `Object.keys(post)` returns attribute names only (AD-7).

**Given** a colliding Upstream method (`fillable(arr)` or `touches(rel)`)
**When** it is called
**Then** it is available as `setFillable(arr)` / `isTouching(rel)`, and those tests carry `adapted:DIV-12.<k>`.

### Story 36.2: Persistence: save, update, delete, timestamps and refresh

As an App Developer,
I want `save`, `create`, `update`, `delete`, `destroy`, `push`, `increment` / `decrement`, `touch`, timestamps, `fresh` and `refresh`,
So that persisting models behaves as in Laravel (FR-61).

**Acceptance Criteria:**

**Given** the test scope `EMT::{testInsert*,testUpdate*,testSaveIs*,testDelete*,testDestroy*,testPush*,testIncrement*,testDecrement*,testTouch*,testTimestamps*,testNotTouching*,testWithoutTouching*,testCreateMethod,testForceCreate,testFindMethod,testRefresh*,testConnection*,testQualifyColumn,testRouteKey*,testRouteName,testDateTime*,testFromDate*,testModelDate*}` and `tests/Database/DatabaseEloquentTimestampsTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `await post.save()`
**When** it runs
**Then** it returns a Promise. `save`, `update`, `delete` and `push` are async by derivation, because they fire awaited model events (AD-6).

**Given** a model with a `'bigint'` cast on its key
**When** it is saved and refreshed
**Then** the key is a `bigint` (AD-9).

### Story 36.3: Eloquent Builder (non-relationship)

As an App Developer,
I want the Eloquent Builder's finders, `firstOr*`, `createOrFirst`, `updateOrCreate`, `withAttributes`, chunking, `pluck` and passthrough,
So that model queries behave as in Laravel (FR-61).

**Acceptance Criteria:**

**Given** the test scope: every `EBT` Test ID not reserved for Epic 37, plus `tests/Database/{DatabaseEloquentBuilderCreateOrFirstTest,DatabaseEloquentWithAttributesTest,DatabaseEloquentWithAttributesPendingTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `User.where('active', 1).first()`
**When** it is awaited
**Then** the static call forwards to a new Builder through a generated delegating method, not a Proxy (AD-26), and resolves to a hydrated `User` or `null`.

**Given** `firstOrFail()` / `findOrFail()` with no match
**When** they run
**Then** they throw `ModelNotFoundException`, with Upstream's message and the model's FQCN.

### Story 36.4: Casts, accessors and mutators

As an App Developer,
I want `Attribute` accessors and mutators, the built-in casts and custom casts,
So that attribute transformation is identical to Laravel's (FR-64).

**Acceptance Criteria:**

**Given** the test scope `EMT::{test*Cast*,testCastsMethod,testMergeCasts,testUnsetCast,testHasCasts,testJsonCasting,testTheMutator*,testGetMutated*,testUsing*,testMergeingStringable*}` and `tests/Database/{DatabaseEloquentModelAttributesTest,DatabaseEloquentAsBinaryCastTest,DatabaseEloquentAsVectorCastTest,EloquentModelCustomCastingTest,DatabaseEloquentWithCastsTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `@attribute(() => Attribute.make({ get, set })) accessor title!: string`
**When** `title` is read and written
**Then** the accessor and mutator run as Laravel's `Attribute` does, including caching and `shouldCache`.

**Given** the `encrypted*`, `hashed`, `AsStringable`, enum and date casts
**When** they run
**Then** they use `@xaravel/encryption`, `@xaravel/hashing`, Support's `Stringable`, AD-26 enums and Carbon, and give Upstream's results.

**Given** `casts` declared either as a field or as a method
**When** the model reads its casts
**Then** both forms work (an option pair, AD-26).

### Story 36.5: Model events and observers

As an App Developer,
I want model events and observers that run in registration order and are awaited,
So that `saving` / `created` / `deleting` hooks behave as in Laravel (FR-65).

**Acceptance Criteria:**

**Given** the test scope `EMT::{testModelObservers*,testEventsCan*,testWithoutEvent*,testSetObservable,testAddObservable,testAddMultiple*,testRemoveObservable,testRemoveMultiple*,testBootedCallbacks,testCallbacksCan*,testReplicatingEvent}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a `saving` listener that returns `false`, or resolves to `false`
**When** `save()` runs
**Then** nothing is written, and `save()` resolves `false` (FR-65 consequence).

**Given** `@ObservedBy([PostObserver])` on a model
**When** the model boots
**Then** the observer's methods are registered, as the PHP attribute registers them (AD-7, AD-26).

**Given** the model event dispatcher
**When** `Model.withoutEvents(fn)` runs in one unit
**Then** concurrent units still dispatch events, because the dispatcher is a frame slot (AD-5).

### Story 36.6: Serialization and API resources

As an App Developer,
I want `toArray`, `toJson`, `jsonSerialize`, `hidden` / `visible` / `appends`, and Eloquent's resource support,
So that models serialize in Laravel's shape, including through `JSON.stringify` (FR-66).

**Acceptance Criteria:**

**Given** the test scope `EMT::{testToArray*,testModelJson*,testModelTo*,testHidden*,testVisible*,testMakeHidden*,testMakeVisible*,testMergeHidden,testMergeVisible,testMergeAppends,testHasAppended*,testWithoutAppends,testWithHidden,testDynamicHidden,testDynamicVisible,testAppendingOf*,testVisibleCreates*,testOnly,testExcept,testGetArrayable*,testGetQueueable*}` and `tests/Database/{DatabaseEloquentResourceCollectionTest,DatabaseEloquentResourceModelTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason
**And** the tests that need `JsonResource` from Http are `blocked-by:http`.

**Given** a model
**When** `JSON.stringify(model)` runs
**Then** the result equals `model.toJson()`, because `toJSON()` delegates to `jsonSerialize()` (FR-66, AD-23).

**Given** `toJson()`
**When** it is called
**Then** it returns a string, as in Laravel.

**Given** this slice
**When** it closes
**Then** the API-surface diff for `Model`, `Builder` and the cast classes shows zero unexplained members, and `async-surface.json` is regenerated.

## Epic 37: Eloquent: relationships & Strict Loading

App Developers define every relationship type, eager-load them, and get Strict Loading by default, with `related()` and automatic eager loading.

**Covers:** FR-62, FR-63. **Implements:** AD-8, DIV-2.

**Kind:** Upstream Component (Database, slice 4), with selector test scope. It owns the relationship selectors reserved in Epic 36's header.
- Most Strict Loading and auto-eager-load Upstream tests live in `tests/Integration/Database/` (`EloquentStrictLoadingTest`, `EloquentModelRelationAutoloadTest`), so they are `blocked-by:testbench`.
- Until Epic 60 clears them, Xaravel Tests (`XT-database-<n>`) cover these behaviours.

### Story 37.1: Relationship definition, `related()` and Strict Loading

As an App Developer,
I want `@hasOne` / `@hasMany` / `@belongsTo` relationship accessors, the typed `related(name)` builder and Strict Loading,
So that relationships read safely as properties and load only explicitly (FR-62, FR-63).

**Acceptance Criteria:**

**Given** the test scope `tests/Database/{DatabaseEloquentRelationTest,DatabaseEloquentHasOneTest,DatabaseEloquentHasManyTest,DatabaseEloquentBelongsToTest,DatabaseEloquentRelationNoConstraintsTest,DatabaseEloquentRelationshipsTest,DatabaseEloquentDynamicRelationsTest,DatabaseEloquentIrregularPluralTest,DatabaseEloquentComparesRelatedModelsTest,EloquentHasOneOrManyDeprecationTest,DatabaseEloquentHasOneOrManyWithAttributesTest,DatabaseEloquentHasOneOrManyWithAttributesPendingTest}.php::*` and `EMT::{testHasOne,testHasMany,testBelongsTo*,testRelations*,testRelationship*}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `@hasMany(() => Post) accessor posts!: Collection<Post>`
**When** `user.posts` is read before it is loaded
**Then** it throws `LazyLoadingViolationException`
**And** `await user.related('posts')` loads it, caches it, and makes `user.posts` readable (FR-63).

**Given** `user.related('posts').where('published', true)`
**When** it is awaited
**Then** it runs the chained query without caching it on the model
**And** `user.related('typo')` is a compile error, and `user.posts()` doesn't exist.

**Given** a Laravel test that uses `$m->rel()` or lazy `$m->rel`
**When** it is translated
**Then** it uses `m.related('rel')` or `await m.related('rel')`, with `adapted:DIV-2.<k>` markers.

### Story 37.2: BelongsToMany and pivots

As an App Developer,
I want `belongsToMany` with pivot models, `attach` / `detach` / `sync` / `toggle`, `wherePivot` and custom pivot classes,
So that many-to-many relationships behave as in Laravel (FR-62).

**Acceptance Criteria:**

**Given** the test scope `tests/Database/{DatabaseEloquentBelongsToMany*Test,DatabaseEloquentPivotTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `await user.related('roles').sync([1, 2])`
**When** it runs
**Then** it returns `{ attached, detached, updated }`, with Upstream's value types, and touches the parent when it is configured to.

### Story 37.3: Through relationships and one-of-many

As an App Developer,
I want `hasOneThrough`, `hasManyThrough`, `ofMany` / `latestOfMany` / `oldestOfMany`, and their `createOrFirst` forms,
So that indirect and aggregate relationships work as in Laravel (FR-62).

**Acceptance Criteria:**

**Given** the test scope `tests/Database/{DatabaseEloquentHasManyThroughIntegrationTest,DatabaseEloquentHasOneThroughIntegrationTest,DatabaseEloquentHasOneThroughOfManyTest,DatabaseEloquentHasOneOfManyTest,DatabaseEloquentMorphOneOfManyTest,DatabaseEloquentHasManyThroughCreateOrFirstTest,DatabaseEloquentHasManyCreateOrFirstTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a relationship callback that returns a different Relation (`(r) => r.one().latestOfMany()`)
**When** the relation is read
**Then** the returned Relation is used (AD-8).

### Story 37.4: Polymorphic and inverse relationships

As an App Developer,
I want `morphOne`, `morphMany`, `morphTo`, `morphToMany` / `morphedByMany`, strict morphs, the Registry-backed morph map, and `inverse()` / `chaperone()`,
So that polymorphic models work as in Laravel (FR-62, FR-68).

**Acceptance Criteria:**

**Given** the test scope `tests/Database/{DatabaseEloquentMorphTest,DatabaseEloquentMorphToTest,DatabaseEloquentMorphToManyTest,DatabaseEloquentPolymorphicIntegrationTest,DatabaseEloquentPolymorphicRelationsIntegrationTest,DatabaseEloquentStrictMorphsTest,DatabaseEloquentInverseRelation*Test}.php::*` and `EMT::{testMorph*,testCorrectMorph*}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a morph type stored as an FQCN, or as an alias from `Relation.morphMap`
**When** `morphTo` resolves it
**Then** the class comes from the Class Registry, and an unknown type throws an error naming it (FR-22, AD-10).

### Story 37.5: Eager loading, existence queries, aggregates and Eloquent Collections

As an App Developer,
I want `with`, `load`, `loadMissing`, `has` / `whereHas`, `withCount` and the `with*` aggregates, and the Eloquent Collection methods,
So that relationship queries and N+1-free loading work as in Laravel (FR-62).

**Acceptance Criteria:**

**Given** the test scope: the `EBT` and `EMT` relationship selectors reserved in Epic 36's header that no earlier Story in this Epic has claimed, plus `tests/Database/DatabaseEloquentCollectionTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `await users.load('posts')`, `loadMissing` and `fresh` on an Eloquent Collection
**When** they run
**Then** they return Promises, and the sync Collection methods stay sync (FR-62 consequence).

**Given** `Model.automaticallyEagerLoadRelationships()`, enabled, and a collection of 10 users
**When** `await users.get(0).related('posts')` runs
**Then** one query loads `posts` for all 10 users, and sync reads of `posts` on the siblings succeed
**And** a sync read of an unloaded relation still throws (FR-63, Maintainer decision 2026-10-16).

**Given** `handleLazyLoadingViolationUsing()`
**When** this Story starts
**Then** the agent raises the Escalation that AD-8 requires, and its Test IDs stay `not-ported-yet` until the decision is merged.

## Epic 38: Eloquent: factories, scopes, soft deletes & pruning

App Developers build test data with factories, and use scopes, `SoftDeletes`, pruning and morph maps. The full Capsule-backed Eloquent integration suite passes on SQLite.

**Covers:** FR-67, FR-68. **Kind:** Upstream Component (Database, slice 5), with selector test scope. `EIT` = `tests/Database/DatabaseEloquentIntegrationTest.php`.

### Story 38.1: Model factories

As an App Developer,
I want factories with states, sequences, `has` / `for`, `recycle` and `@faker-js/faker`,
So that test data is built as in Laravel (FR-67).

**Acceptance Criteria:**

**Given** the test scope `tests/Database/DatabaseEloquentFactoryTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `HasFactory` on a model and `Database\Factories\PostFactory`
**When** `Post.factory()` is called
**Then** the factory is resolved by Laravel's naming convention through the PSR-4 map and the Registry.

**Given** Upstream assertions on exact strings that PHP Faker produced
**When** this Story starts
**Then** the agent raises the Escalation for the adaptation clause that the Maintainer endorsed on 2026-10-16: "Faker-derived expected values are regenerated once from seeded `@faker-js/faker` 10.6.0 output and frozen."
**And** those Test IDs stay `not-ported-yet` until the clause is in the DIV record.

**Given** the clause is merged
**When** such an assertion is translated
**Then** only the Faker-derived literal changes. The line carries `adapted:DIV-<n>.<k>`, the seed is fixed in the test, and Fidelity Review checks that nothing else in the assertion changed.

### Story 38.2: Local and global scopes

As an App Developer,
I want `@scope` local scopes and global scopes (classes and closures), with `withoutGlobalScope(s)`,
So that reusable constraints work as in Laravel (FR-68).

**Acceptance Criteria:**

**Given** the test scope `tests/Database/{DatabaseEloquentGlobalScopesTest,DatabaseEloquentLocalScopesTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `@scope static published(query)`
**When** it is called as `Post.published()` or as `Post.query().published()`
**Then** both apply the scope (AD-7).

### Story 38.3: Soft deletes

As an App Developer,
I want `SoftDeletes` with `trashed`, `restore`, `forceDelete`, `withTrashed` and `onlyTrashed`,
So that soft deletion behaves as in Laravel (FR-68).

**Acceptance Criteria:**

**Given** the test scope `tests/Database/{DatabaseSoftDeletingScopeTest,DatabaseSoftDeletingTest,DatabaseSoftDeletingTraitTest,DatabaseEloquentSoftDeletesIntegrationTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `class Post extends mixin(Model, SoftDeletes)`
**When** the class boots
**Then** `bootSoftDeletes` registers the scope, and `initializeSoftDeletes` adds the cast, as Upstream does (AD-26).

### Story 38.4: Pruning

As an App Developer,
I want `Prunable` / `MassPrunable` models,
So that old records can be pruned as in Laravel (FR-68).

**Acceptance Criteria:**

**Given** the test scope `tests/Database/PruneCommandTest.php::*`
**When** the harness runs it
**Then** each Test ID passes, or is recorded as `blocked-by:console` (Epic 54 re-verifies them).

**Given** `prunable()` on a model (Xaravel Tests, until Epic 60 clears the integration tests)
**When** `pruneAll()` runs
**Then** `Prunable` deletes model by model and fires events, while `MassPrunable` deletes in one query without events, as Upstream does.

### Story 38.5: Eloquent integration suite: queries, writes and pagination

As an App Developer,
I want the Capsule-backed Eloquent integration tests for basic models, writes, chunking and pagination to pass on SQLite,
So that the slices work together end to end (FR-61, FR-62, FR-58).

**Acceptance Criteria:**

**Given** the test scope `EIT::{testBasic*,testCreate*,testUpdate*,testSave*,testFirstOr*,testFindOr*,testCheckAnd*,testPluck*,testChunk*,testLazy*,testEachBy*,testPaginated*,testCursor*,testPrevious*,testForPage*,testCountFor*,testAggregated*,testMultiInserts*,testNested*,testTimestamps*,testIncrementing*,testDefault*,testConfigured*,testSpecial*,testToArray*,testFill*,testCanFill*,testFresh*,testIsAfter*}` and `tests/Database/DatabaseEloquentIntegrationWithTablePrefixTest.php::*`
**When** the harness runs it on `sqlite`
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason
**And** the pagination tests that need `@xaravel/pagination` are `blocked-by:pagination`.

### Story 38.6: Eloquent integration suite: relationships and the rest

As an App Developer,
I want the remaining Capsule-backed Eloquent integration tests to pass,
So that relationships, morphs, touches and transactions work together end to end (FR-62, FR-63, FR-55).

**Acceptance Criteria:**

**Given** the test scope: every `EIT` Test ID not matched by Story 38.5, plus `tests/Database/DatabaseEloquentCollectionQueueableTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason
**And** the queueable-collection tests are `blocked-by:queue`.

**Given** `testImplodeModels`, which has been `blocked-by:database` since Story 14.4
**When** this Story re-verifies it, with `component: collections`
**Then** it passes.

**Given** the Eloquent slices
**When** this Epic closes
**Then** the Eloquent docs page (with Divergences: DIV-1, DIV-2, DIV-9, DIV-12) is written, and the API-surface diff for `Illuminate\Database\Eloquent\*` shows zero unexplained members.

## Epic 39: Database: migrations, seeding & database commands

App Developers run migrations and seeders. The command-level tests are translated now and wait for Console.

**Covers:** FR-56 (migrate), FR-57.

**Kind:** Upstream Component (Database, slice 6), with selector test scope. Migration files are TypeScript modules that export an anonymous class extending `Migration` (AD-3).

**Phase 4 review:** when this Epic is accepted, the Maintainer runs the Phase 4 progress review (PRD §7.2) and records `decisions/PHASE-4-REVIEW.md`. The review may re-sequence work, but it never cuts scope.

### Story 39.1: Migrator, repository and migration creator

As an App Developer,
I want the Migrator, the migrations table repository and the migration file creator,
So that migrations run, roll back and report status as in Laravel (FR-56).

**Acceptance Criteria:**

**Given** the test scope `tests/Database/{DatabaseMigratorTest,DatabaseMigratorIntegrationTest,DatabaseMigrationRepositoryTest,DatabaseMigrationCreatorTest,TableGuesserTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `MigrationCreator.create('create_flights_table')`
**When** it writes a file
**Then** the file is the Database migration stub with its placeholders filled, and it compiles under `tsc --strict`. The comparison against the reviewed reference files (Story 55.3) happens in Epics 55 and 60, never here.

**Given** migrations under `database/migrations/*.ts`, each with `export default class extends Migration { … }`
**When** `migrator.run(paths)` runs
**Then** they are `await import()`ed and run in filename order, and each batch is recorded, as Upstream does.

### Story 39.2: Seeders

As an App Developer,
I want `Seeder` classes with `call`, `callWith` and `callSilent`,
So that databases seed as in Laravel (FR-57).

**Acceptance Criteria:**

**Given** the test scope `tests/Database/DatabaseSeederTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `Database\Seeders\DatabaseSeeder`
**When** it is resolved through the PSR-4 map
**Then** `call([UserSeeder])` runs each seeder in order, awaiting each one.

### Story 39.3: Database command suites

As a Framework Agent,
I want the `migrate:*`, `db:seed` and `db` command tests translated now,
So that their Test IDs leave `not-ported-yet` and Console can re-verify them (Global rules; FR-56, FR-57).

**Acceptance Criteria:**

**Given** the test scope `tests/Database/{DatabaseMigrationInstallCommandTest,DatabaseMigrationMakeCommandTest,DatabaseMigrationMigrateCommandTest,DatabaseMigrationRefreshCommandTest,DatabaseMigrationResetCommandTest,DatabaseMigrationRollbackCommandTest,SeedCommandTest,DatabaseConsoleDirectConnectionTest}.php::*`
**When** the harness runs it
**Then** each Test ID passes, or is recorded as `blocked-by:console`, matching its `BlockedByComponentError`.

**Given** the Database Component
**When** this Epic closes
**Then**:
- no Database unit Test ID remains `not-ported-yet`;
- `api-surface:gate database` passes;
- `async-surface.json` is committed;
- the Database docs pages (queries, migrations, seeding) are written.

### Story 39.4: Phase 4 `blocked-by` sweep

As the Maintainer,
I want every `blocked-by` entry that names a Phase 4 Component re-verified,
So that Phase 4 can complete. A Phase isn't complete while any `blocked-by` entry points at it (Global rules, FR-13).

**Acceptance Criteria:**

**Given** the test scope: every Expectations entry whose reason is `blocked-by:<c>`, for `<c>` in {database}, resolved by sprint planning when this Story is planned, with one manifest per owning Component (AD-21), including Bus's database batch repository tests (Story 32.2, `component: bus`) and Container's `DB()` descriptor
**When** the harness runs it
**Then** each Test ID passes, or carries a valid reason that names a later-Phase Component.

**Given** the Expectations File after this Story merges
**When** the Phase-completion check runs
**Then** zero entries are `blocked-by:<c>` for any Phase 4 Component, and the check fails, listing them, if any remain.

## Epic 40: Pagination

App Developers paginate results with length-aware, simple and cursor paginators, and render or serialize them.

**Covers:** FR-58. **Kind:** Upstream Component, with selector test scope under `tests/Pagination/`.
- Rendering the pagination Blade views needs View, so it is `blocked-by:view`.
- `JsonResource` integration needs Http, so it is `blocked-by:http`.

### Story 40.1: Paginators, cursors and URL windows

As an App Developer,
I want `Paginator`, `LengthAwarePaginator`, `CursorPaginator`, `Cursor` and `UrlWindow`,
So that paginated results, links and JSON match Laravel (FR-58).

**Acceptance Criteria:**

**Given** the test scope `tests/Pagination/{PaginatorTest,LengthAwarePaginatorTest,CursorPaginatorTest,CursorTest,UrlWindowTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a paginator
**When** it is JSON-encoded
**Then** the shape (`current_page`, `data`, `links`, `per_page`, `next_cursor`, …) is byte-identical to the Oracle's.

**Given** `Cursor.encode()` / `fromEncoded()`
**When** a cursor round-trips
**Then** the encoded string matches PHP's base64url JSON encoding.

### Story 40.2: Eloquent pagination, resources and views

As an App Developer,
I want `paginate`, `simplePaginate` and `cursorPaginate` on queries and models, `loadMorph` on paginators, and the Tailwind and Bootstrap pagination views,
So that paginated pages render as in Laravel (FR-58).

**Acceptance Criteria:**

**Given** the test scope `tests/Pagination/{PaginatorLoadMorphTest,PaginatorLoadMorphCountTest,CursorPaginatorLoadMorphTest,CursorPaginatorLoadMorphCountTest,PaginatorResourceTest,CursorResourceTest}.php::*`
**When** the harness runs it
**Then** each Test ID passes, or is recorded as `blocked-by:http`, matching its error.

**Given** Upstream's pagination Blade views
**When** they are ported
**Then** they live in `packages/pagination/resources/views` as Blade, with PHP expressions translated by the `PORTING.md` rule. Rendering them is `blocked-by:view` until Epic 49.

**Given** the pagination tests that have been `blocked-by:pagination` since Story 38.5
**When** this Story re-verifies them with `component: database`
**Then** they pass, or carry a valid non-`blocked-by` reason.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate pagination` passes and the docs are written.

## Epic 41: Redis

App Developers use Redis connections through `Bun.redis`, with leased transactions, pipelines and the Redis limiters.

**Covers:** FR-59. **Implements:** AD-20 (Redis leases), and the Redis Pub/Sub item from the spine's Deferred table.

**Kind:** Upstream Component, with selector test scope under `tests/Redis/`.
- Tests run on the `redis` variant.
- Cluster tests are `deferred:redis-cluster`.

### Story 41.1: Redis manager and connections over `Bun.redis`

As an App Developer,
I want `Redis.connection()`, commands, events and the manager, backed by `Bun.redis`,
So that Redis code works as in Laravel without phpredis or predis (FR-59).

**Acceptance Criteria:**

**Given** the test scope `tests/Redis/{RedisConnectionTest,RedisConnectorTest,RedisManagerExtensionTest,RedisEventsTest}.php::*`
**When** the harness runs it on `redis`
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `tests/Redis/{PhpRedisConnectorTest,PredisConnectorTest}.php`, which test the PHP client libraries
**When** the agent classifies them
**Then** it raises an Escalation proposing either an adaptation clause ("client-library tests target the `Bun.redis` connector") or `intentional-divergence`. Those Test IDs stay `not-ported-yet` until the ruling.

**Given** `tests/Redis/Connections/PhpRedisClusterConnectionTest.php`
**When** it is classified
**Then** it is `deferred:redis-cluster`.

**Given** a command method on a connection
**When** `async-surface.json` is generated
**Then** each command is tagged `@asyncRoot` as a Redis command (AD-6).

### Story 41.2: Transactions, pipelines, WATCH and Pub/Sub on leases

As an App Developer,
I want `transaction`, `pipeline`, `watch`, `select`, `subscribe` / `psubscribe` and blocking commands on a connection leased to my unit,
So that `MULTI` never captures another request's commands (FR-59, AD-20).

**Acceptance Criteria:**

**Given** two units interleaved at every `await`, one inside `Redis.transaction(async (tx) => …)`
**When** the other runs commands on the same named connection
**Then** they don't join the transaction, because the transaction runs on a duplicated client (Xaravel Tests, NFR-4).

**Given** `Redis.subscribe(['ch'], cb)`
**When** a message is published
**Then** `cb` receives it on the lease's client, and the subscription ends when the unit ends.

**Given** a CI leg on Redis 7.2, as the spine's Deferred table asks
**When** this Story merges
**Then** the nightly matrix includes it, or the gap is recorded in an Escalation.

### Story 41.3: Redis limiters

As an App Developer,
I want `Redis.throttle()` / `funnel()` (the duration and concurrency limiters),
So that distributed rate limiting works as in Laravel (FR-59).

**Acceptance Criteria:**

**Given** the test scope `tests/Redis/{DurationLimiterTest,ConcurrencyLimiterTest,ConcurrentLimiterTest}.php::*`
**When** the harness runs it on `redis`
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** the limiters' Lua scripts
**When** they run
**Then** the scripts are Upstream's, verbatim.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate redis` passes, `async-surface.json` is committed, and the docs (with Divergences: client libraries, Cluster deferred) are written.

## Epic 42: Cache

App Developers use the array, file, database and redis stores, with `remember`, `flexible`, tags, locks, `memo` and `RateLimiter`.

**Covers:** FR-74; also FR-36 (`RateLimiter`). **Implements:** AD-6 (`Cache\Store` is an async root, including `array`), AD-23 (cached values are `phpSerialize`d, numbers raw).

**Kind:** Upstream Component, with selector test scope under `tests/Cache/`.
- `tests/Integration/Cache/**` is `blocked-by:testbench`.

**Needs:** Epic 41.

### Story 42.1: Repository, array store, events and the memo driver

As an App Developer,
I want the Cache Repository API (`get`, `put`, `remember`, `flexible`, `many`, `pull`, `forever`, `increment` / `decrement`), the array and null stores, cache events and `Cache.memo()`,
So that caching behaves as in Laravel (FR-74).

**Acceptance Criteria:**

**Given** the test scope `tests/Cache/{CacheRepositoryTest,CacheArrayStoreTest,CacheNullStoreTest,CacheEventsTest,CacheManagerTest,CacheSpyMemoTest,CacheMemoizedStoreTest,LimitTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `Cache.get('k')` on the array store
**When** it is called
**Then** it returns a Promise, as every store does (a uniform async interface, DIV-1)
**And** the translated tests are marked `adapted:DIV-1.<k>`.

**Given** `Cache.remember('k', 60, async () => compute())`
**When** two concurrent units miss at the same time
**Then** both call `compute`, as Upstream's non-locking `remember` does. Only `flexible`'s deferred refresh is registered on the unit's defer list.

### Story 42.2: File, database, storage and failover stores

As an App Developer,
I want the `file`, `database`, Storage-disk and `failover` cache stores,
So that the alpha's persistent stores work as in Laravel (FR-74).

**Acceptance Criteria:**

**Given** the test scope `tests/Cache/{CacheFileStoreTest,CacheDatabaseStoreTest,CacheStorageStoreTest,CacheFailoverStoreTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a value written by PHP Laravel's file or database store (Oracle fixture)
**When** Xaravel reads it
**Then** it gets the same value, and the reverse holds too (AD-23 interop).

### Story 42.3: Tags, locks and the Redis store

As an App Developer,
I want tagged caches, atomic locks (`lock`, `block`, `restoreLock`, `funnel`) and the Redis store,
So that coordination primitives work as in Laravel (FR-74).

**Acceptance Criteria:**

**Given** the test scope `tests/Cache/{CacheTaggedCacheTest,CacheRedisStoreTest,CacheRedisTaggedCacheTest,ConcurrencyLimiterTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a lock held by one unit
**When** a second unit calls `block(5)` under the test clock
**Then** it waits and acquires the lock on release, or throws `LockTimeoutException`, as Upstream does.

### Story 42.4: RateLimiter

As an App Developer,
I want `RateLimiter.for()`, `attempt`, `hit`, `tooManyAttempts`, `availableIn` and `clear`,
So that rate limits defined in a provider apply as in Laravel (FR-36, FR-74).

**Acceptance Criteria:**

**Given** the test scope `tests/Cache/{CacheRateLimiterTest,RateLimiterTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `RateLimiter.for('api', fn)` called at runtime inside a request frame
**When** a concurrent unit resolves `'api'`
**Then** it doesn't see the limiter, because runtime definitions are frame overlays (AD-5). Limiters defined in a provider's `boot` are base definitions.

### Story 42.5: Non-alpha stores and the cache commands

As a Framework Agent,
I want the Memcached, APC, DynamoDB and session-store suites, and `cache:clear`, classified or translated,
So that no Cache Test ID stays `not-ported-yet` (Global rules; FR-74, FR-3).

**Acceptance Criteria:**

**Given** the test scope `tests/Cache/{CacheMemcachedConnectorTest,CacheMemcachedStoreTest,CacheMemcachedLockTest,CacheApcStoreTest,CacheDynamoDbStoreTest}.php::*`
**When** they are classified
**Then** the agent raises an Escalation asking the Maintainer to add `deferred:memcached`, `deferred:apc` and `deferred:dynamodb` to the deferred items (they aren't in PRD §7.2), or to rule otherwise.

**Given** `tests/Cache/{CacheSessionStoreTest,ClearCommandTest}.php::*`
**When** the harness runs it
**Then** each Test ID passes, or is recorded as `blocked-by:session` or `blocked-by:console`.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate cache` passes, with the deferred stores listed in `exceptions.jsonl`; `async-surface.json` is committed; and the docs are written.

## Epic 43: Validation

App Developers validate with every Laravel 13 rule. Default messages match the Oracle, and IO rules are awaited.

**Covers:** FR-50, FR-52. **Owns port (AD-22):** egulias/email-validator.

**Kind:** Upstream Component, with selector test scope under `tests/Validation/`. `VVT` = `ValidationValidatorTest.php`.
- Selectors apply in Story order, and any `VVT` Test ID matched by no selector belongs to Story 43.5.
- `tests/Integration/Validation/**` is `blocked-by:testbench`.

### Story 43.1: Validator engine, rule parsing and messages

As an App Developer,
I want the Validator engine: rule parsing, implicit, `sometimes`, nested and `*` rules, `bail`, custom messages and attributes, translated messages, `validated()` / `safe()` and `ValidationException`,
So that validation flows and error bags behave as in Laravel (FR-50).

**Acceptance Criteria:**

**Given** the test scope: every `VVT` Test ID whose method doesn't start with `testValidate`, plus `{ValidationRuleParserTest,ValidationFactoryTest,ValidationExceptionTest,ValidationMacroTest,ValidationAddFailureTest,ValidatorAfterRuleTest,ValidationForEachTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** the default English messages for every rule, with attribute and value placeholders
**When** they are rendered for the same failing input
**Then** they match Oracle fixtures exactly (FR-50 consequence).

**Given** a rule set
**When** `passes()`, `fails()`, `validate()` or `validated()` is called
**Then** each returns a Promise, because rules may be async (DIV-1 callback clause).

### Story 43.2: Email, URL and network rules

As an App Developer,
I want the `email` rule (rfc, strict, dns and filter validation modes), `url`, `active_url`, `ip` / `ipv4` / `ipv6` and `mac_address`,
So that address validation matches PHP exactly (FR-50).

**Acceptance Criteria:**

**Given** the test scope `VVT::{testValidateEmail*,testValidateUrl*,testValidateActive*,testValidateIp*,testValidateMac*}` and `tests/Validation/ValidationEmailRuleTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** Oracle fixtures from egulias/email-validator over a corpus of valid, invalid and edge-case addresses, in each validation mode
**When** the Xaravel port validates them
**Then** every verdict matches.

**Given** `email:spoof`
**When** it is classified
**Then** it is `deferred:email-spoof` (FR-50).

**Given** `email:dns` and `active_url`
**When** they are classified
**Then** the agent raises the Escalation for the `network` backend tag, as the spine's Deferred table asks. Until the ruling, these Test IDs stay `not-ported-yet`.

### Story 43.3: File, image and MIME rules

As an App Developer,
I want `file`, `image`, `mimes`, `mimetypes`, `extensions`, `dimensions` and the `File` rule builder,
So that upload validation works as in Laravel (FR-50).

**Acceptance Criteria:**

**Given** the test scope `VVT::{testValidateImage*,testValidateMime*,testValidateFile,testValidateExtension*}` and `tests/Validation/{ValidationFileRuleTest,ValidationImageFileRuleTest,ValidationDimensionsRuleTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** an `UploadedFile` from `@xaravel/http-foundation`
**When** `mimes:png` validates it
**Then** the check uses `@xaravel/mime` guessing, as Upstream does.

### Story 43.4: Database rules and async validation

As an App Developer,
I want `exists` and `unique`, with the database presence verifier, awaited, and `validateSync()`,
So that IO rules work and sync validation refuses them (FR-52).

**Acceptance Criteria:**

**Given** the test scope `VVT::{testValidateUnique*,testValidateExists*}` and `tests/Validation/{ValidationExistsRuleTest,ValidationUniqueRuleTest,ValidationDatabasePresenceVerifierTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a rule set that contains `exists`, `unique` or a closure rule that queries
**When** `validateSync()` is called
**Then** it throws, naming the IO rule (FR-52 consequence).

**Given** a rule set with no IO rules
**When** `validateSync()` is called
**Then** it returns the validated data synchronously.

### Story 43.5: Built-in rules

As an App Developer,
I want every remaining built-in rule (presence, type, size and comparison, dates, timezones, strings, arrays, conditional and prohibition rules, `regex`),
So that rule strings port unchanged (FR-50).

**Acceptance Criteria:**

**Given** the test scope: every `VVT` Test ID not matched by Stories 43.1–43.4
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `regex:/^\p{Lu}/u` and `not_regex`
**When** they run
**Then** the pattern is a JS `RegExp` (DIV-10). A PCRE-only pattern in a test is `intentional-divergence:DIV-10`, with the feature named.

**Given** the `timezone` rule with its groups and countries
**When** it validates identifiers
**Then** the accepted set matches PHP's `DateTimeZone::listIdentifiers` from Oracle fixtures.

### Story 43.6: Rule objects and fluent rule builders

As an App Developer,
I want `Rule.in`, `notIn`, `enum`, `requiredIf`, `prohibitedIf`, `excludeIf`, `anyOf`, `password`, `numeric`, `string`, `date`, `array`, `can`, `contains` / `doesntContain`, and invokable and closure rules,
So that object-style rules work as in Laravel (FR-50).

**Acceptance Criteria:**

**Given** the test scope `tests/Validation/{ValidationNumericRuleTest,ValidationAnyOfRuleTest,ValidationExcludeIfTest,ValidationProhibitedIfTest,ValidationInArrayKeysTest,ValidationProhibitedUnlessRuleTest,ValidationEnumRuleTest,ValidationStringRuleTest,ValidationDateRuleTest,ValidationRuleCanTest,ValidationRequiredIfTest,ValidationExcludeUnlessRuleTest,ValidationArrayKeysRuleTest,ValidationPasswordRuleTest,ValidationNotPwnedVerifierTest,ValidationArrayRuleTest,ValidationInRuleTest,ValidationRuleBuilderMethodTest,ValidationInvokableRuleTest,ValidationRuleDoesntContainTest,ValidationRuleContainsTest,ValidationInArrayRuleTest,ValidationNotInRuleTest,ValidationRequiredUnlessRuleTest}.php::*`
**When** the harness runs it
**Then** each Test ID passes, or carries a valid reason. `ValidationRuleCanTest` is `blocked-by:auth`, and `ValidationNotPwnedVerifierTest` is `blocked-by:http`.

**Given** an invokable or closure rule that returns a Promise
**When** validation runs
**Then** it is awaited in rule order.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate validation` passes, `async-surface.json` is committed, and the docs (with Divergences: DIV-1, DIV-10, `email:spoof` deferred) are written.

### Story 43.7: Phase 5 `blocked-by` sweep

As the Maintainer,
I want every `blocked-by` entry that names a Phase 5 Component re-verified,
So that Phase 5 can complete. A Phase isn't complete while any `blocked-by` entry points at it (Global rules, FR-13).

**Acceptance Criteria:**

**Given** the test scope: every Expectations entry whose reason is `blocked-by:<c>`, for `<c>` in {pagination, redis, cache, validation}, resolved by sprint planning when this Story is planned, with one manifest per owning Component (AD-21), including Container's `Cache()` descriptor
**When** the harness runs it
**Then** each Test ID passes, or carries a valid reason that names a later-Phase Component.

**Given** the Expectations File after this Story merges
**When** the Phase-completion check runs
**Then** zero entries are `blocked-by:<c>` for any Phase 5 Component, and the check fails, listing them, if any remain.

## Epic 44: Cookie

App Developers queue and encrypt cookies as Laravel does, and cookies encrypted by PHP Laravel stay readable.

**Covers:** FR-33 (cookies); also FR-77 (encrypted-cookie interop). **Kind:** Upstream Component, with selector test scope under `tests/Cookie/`. `tests/Integration/Cookie/**` is `blocked-by:testbench`.

### Story 44.1: CookieJar, queued cookies and cookie encryption

As an App Developer,
I want `Cookie.make` / `queue` / `forget` and the `EncryptCookies` and `AddQueuedCookiesToResponse` middleware,
So that cookies behave, and interoperate, as in Laravel (FR-33, FR-31).

**Acceptance Criteria:**

**Given** the test scope `tests/Cookie/{CookieTest,Middleware/EncryptCookiesTest,Middleware/AddQueuedCookiesToResponseTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `Cookie.queue(...)` in one unit
**When** a concurrent unit's response is sent
**Then** that response doesn't carry the cookie, because the CookieJar queue is a frame slot (AD-5).

**Given** a cookie encrypted by PHP Laravel with the same `APP_KEY` (an Oracle fixture, including its HMAC value prefix)
**When** `EncryptCookies` reads it
**Then** it decrypts to the original value, and a Xaravel-encrypted cookie decrypts in the Oracle (FR-77 consequence, AD-23 raw key).

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate cookie` passes and the docs are written.

## Epic 45: Session

App Developers use sessions on every alpha driver, with flash data and regeneration, and with payloads that interoperate with PHP.

**Covers:** FR-33. **Implements:** AD-6 (session is loaded once, then sync), AD-23 (Laravel's session serialization), AD-20 (Redis handler leases).

**Kind:** Upstream Component, with selector test scope under `tests/Session/`. `tests/Integration/Session/**` is `blocked-by:testbench`.

### Story 45.1: Session store and handlers

As an App Developer,
I want the session Store, with the `file`, `cookie`, `database`, `redis` and `array` handlers,
So that session data persists as in Laravel (FR-33).

**Acceptance Criteria:**

**Given** the test scope `tests/Session/{SessionStoreTest,ArraySessionHandlerTest,FileSessionHandlerTest,CacheBasedSessionHandlerTest,SessionManagerTest,EncryptedSessionStoreTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** the `database` and `redis` handlers
**When** Xaravel Tests run on the `session-database@sqlite`, `session-database@pgsql` and `session-redis@redis` variants
**Then** read, write, destroy and gc behave as in Upstream.

**Given** a session payload written by PHP Laravel at the Pin (an Oracle fixture, in the default `session.serialization` format)
**When** Xaravel reads it
**Then** it gets the same attributes, and the reverse holds too, so a migrated app keeps its users logged in (FR-77 consequence).

### Story 45.2: StartSession, flash data and the loaded-once session

As an App Developer,
I want `StartSession` to load the session once, so that `session()`, `old()` and `$errors` read synchronously, with flash ageing and `regenerate` / `invalidate`,
So that session code ports unchanged (FR-33, DIV-1).

**Acceptance Criteria:**

**Given** a request through `StartSession`
**When** a controller calls `session().get('k')`, `old('name')` or `request.session().flash(...)`
**Then** the calls are synchronous, and the session is persisted when the response is sent (AD-6).

**Given** two concurrent requests with different session cookies
**When** they interleave at every `await` (Xaravel Tests)
**Then** neither sees the other's session (FR-27, NFR-4).

**Given** the test scope `tests/Session/Middleware/AuthenticateSessionTest.php::*`
**When** the harness runs it
**Then** each Test ID passes, or is recorded as `blocked-by:auth`.

**Given** the `CacheSessionStoreTest` Test IDs (`blocked-by:session` since Story 42.5)
**When** this Story re-verifies them with `component: cache`
**Then** they pass, or carry a valid non-`blocked-by` reason.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate session` passes, `async-surface.json` is committed, and the docs are written.

## Epic 46: Http: requests & responses

Controllers read input synchronously and return every Laravel response type over `Bun.serve`.

**Covers:** FR-28, FR-29; also FR-66 (`JsonResource`). **Kind:** Upstream Component (a slice of Http), with selector test scope under `tests/Http/`. `tests/Integration/Http/**` is `blocked-by:testbench`.

### Story 46.1: Request

As an App Developer,
I want Laravel's Request API: `input`, `query`, `all`, `only`, `except`, `has`, `filled`, `boolean`, `date`, `enum`, `file`, `json`, `ip`, `header`, `bearerToken`, `isMethod`, `routeIs`, `expectsJson`, `fingerprint` and the rest,
So that controllers read requests as in Laravel (FR-28).

**Acceptance Criteria:**

**Given** the test scope `tests/Http/{HttpRequestTest,HttpUploadedFileTest,HttpTestingFileFactoryTest,HttpMimeTypeTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `testMagic*` (`$request->title`)
**When** it is translated
**Then** it uses `request.input('title')`, marked `adapted:DIV-12.<k>`.

**Given** a request whose body has been loaded
**When** any input accessor runs in a controller
**Then** it is synchronous (FR-28 consequence)
**And** reading input before `loadBody` throws an error naming the `BeforeBody` stage.

**Given** an uploaded file
**When** `request.file('avatar').store('avatars')` runs
**Then** it stores through `@xaravel/filesystem` and returns the path, as Upstream does.

### Story 46.2: Responses, redirects and JSON resources

As an App Developer,
I want `Response`, `JsonResponse`, `RedirectResponse` (with `with`, `withInput`, `withErrors`), `JsonResource`, `ResourceCollection` and JSON:API resources,
So that controllers return Laravel's responses and resource shapes (FR-29, FR-66).

**Acceptance Criteria:**

**Given** the test scope `tests/Http/{HttpResponseTest,HttpJsonResponseTest,HttpRedirectResponseTest,JsonResourceTest,Resources/JsonApi/JsonApiResourceTest,Resources/JsonApi/RelationResolverTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a controller that returns a string, an array, a model or a collection
**When** the response is prepared
**Then** it becomes Laravel's response type, with JSON encoded by `jsonEncode` (AD-23).

**Given** the resource tests that have been `blocked-by:http` since Stories 36.6 and 40.2
**When** this Story re-verifies them, with `component: database` and `component: pagination` in separate manifests
**Then** they pass, or carry a valid non-`blocked-by` reason.

### Story 46.3: Http middleware

As an App Developer,
I want `TrustProxies`, `HandleCors`, `ValidatePostSize`, `SetCacheHeaders` and `PrefersJsonResponses`,
So that the Http-owned middleware behave as Upstream does (FR-31).

**Acceptance Criteria:**

**Given** the test scope `tests/Http/Middleware/{TrustProxiesTest,CacheTest,PrefersJsonResponsesTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `ValidatePostSize`, `TrustProxies`, the `HandleCors` preflight and (in Epic 51) `PreventRequestsDuringMaintenance`
**When** they are declared
**Then** each carries the `BeforeBody` brand, and runs on headers only (AD-12).

**Given** a request whose `Content-Length` exceeds `post_max_size`, or a chunked body that grows past it
**When** `ValidatePostSize` runs
**Then** it throws `PostTooLargeException` (413) before the body is buffered (FR-28 consequence).

**Given** the Http request and response slice
**When** it closes
**Then** the API-surface diff for `Request`, `Response`, `RedirectResponse`, the resources and the middleware shows zero unexplained members, and the docs are written.

## Epic 47: Http client

App Developers make outbound requests with `Http`, with retries, pools, fakes and stray-request prevention, over `fetch`.

**Covers:** FR-79. **Replaces (AD-22):** guzzlehttp/guzzle with `fetch`.

**Kind:** Upstream Component (Http, client slice), with selector test scope. `HCT` = `tests/Http/HttpClientTest.php`. Selectors apply in Story order, and any `HCT` Test ID matched by no selector belongs to Story 47.4.

### Story 47.1: PendingRequest core, fakes and recording

As an App Developer,
I want `Http.get` / `post` with request building, `Http.fake()` with sequences, stray-request prevention, and the recording assertions,
So that outbound HTTP is easy to write and to test (FR-79).

**Acceptance Criteria:**

**Given** the test scope `HCT::{test*Fake*,test*Stray*,test*Assert*,test*Sequence*,test*Record*,test*Prevent*,test*Stub*,testAllowing*,testRequest*,testResponse*}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `await Http.withToken(t).post(url, data)`
**When** it runs
**Then** the request goes through `fetch` with Laravel's headers, body encoding and query handling, and `PendingRequest` is a thenable (AD-6).

**Given** `Http.fake()` with `preventStrayRequests()` in one test
**When** the next test makes a real request
**Then** it isn't faked, because the fake is frame-scoped (NFR-7).

### Story 47.2: Retries, timeouts and exceptions

As an App Developer,
I want `retry`, `timeout`, `connectTimeout`, `throw` / `throwIf` and the status-specific exceptions,
So that failure handling behaves as in Laravel (FR-79).

**Acceptance Criteria:**

**Given** the test scope `HCT::{test*Retr*,test*Timeout*,test*Throw*,test*Exception*,testTooMany*,testUnauthorized*,testForbidden*,testNotFound*,testConflict*,testUnprocessable*,testPayment*,testBad*,testConnect*,testNetwork*}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `retry(3, 100)` under the test clock
**When** a fake returns 500, then 500, then 200
**Then** three attempts are made, with Upstream's sleeps faked through `Sleep`.

### Story 47.3: Pools, batches, async requests and middleware

As an App Developer,
I want `Http.pool`, `Http.batch`, `async()` requests and client middleware,
So that concurrent outbound calls work as in Laravel (FR-79).

**Acceptance Criteria:**

**Given** the test scope `HCT::{test*Pool*,test*Batch*,test*Async*,test*Concurren*,test*Middleware*,testGlobal*}`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a pool of requests
**When** it runs
**Then** the requests are concurrent, and this `Promise.all` is listed in `PORTING.md` (AD-6).

### Story 47.4: Remaining client behaviour and re-verifications

As an App Developer,
I want the rest of the client (sinks, attachments, multipart, streaming, URL templates, SSL options),
So that the HTTP client is complete (FR-79).

**Acceptance Criteria:**

**Given** the test scope: every `HCT` Test ID not matched by Stories 47.1–47.3
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** the `blocked-by:http` entries from `SupportFacadesHttpTest` (Story 20.6) and `ValidationNotPwnedVerifierTest` (Story 43.6)
**When** this Story re-verifies them, in manifests with `component: support` and `component: validation`
**Then** they pass, or carry a valid non-`blocked-by` reason.

**Given** the client slice
**When** it closes
**Then** the API-surface diff for `Illuminate\Http\Client\*` shows zero unexplained members, the docs are written, and the `@xaravel/http` package's API-surface gate passes.

## Epic 48: Routing

App Developers register routes, including `Route.query`, with model binding, resource controllers, signed URLs, throttling and `route:cache`.

**Covers:** FR-30, FR-34, FR-36. **Owns port (AD-22):** the symfony/routing route compiler. **Implements:** AD-4 (binding by `inject` key), AD-5 (current route as a frame slot).

**Kind:** Upstream Component, with selector test scope. `RRT` = `tests/Routing/RoutingRouteTest.php`.
- Selectors apply in Story order, and any `RRT` Test ID matched by no selector belongs to Story 48.2.
- `tests/Integration/Routing/**` (198 methods) is `blocked-by:testbench`.

### Story 48.1: Route registration, groups and the `QUERY` verb

As an App Developer,
I want `Route.get` / `post` / … / `query`, groups, prefixes, names, domains, resource routes and the registrar,
So that `routes/web.ts` reads as in Laravel (FR-30).

**Acceptance Criteria:**

**Given** the test scope `tests/Routing/{RouteRegistrarTest,RouteCollectionTest,RouteActionTest,RouteUriTest,RouteSignatureParametersTest,RoutingControllerAttributeTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `Route.query('/search', [SearchController, 'index'])`
**When** an htmx `hx-query` request (method `QUERY`, with a body) arrives through `serve()`'s `fetch` handler
**Then** it reaches that action (FR-30 consequence, OQ-7).

**Given** controller attributes such as `#[Middleware]`
**When** they are translated
**Then** they become TC39 decorators of the same name (AD-26).

**Given** route registration after `sealed` inside a request frame
**When** it is attempted
**Then** it throws `ScopeFrameException` (AD-5).

### Story 48.2: Route compiler, matching and dispatch

As an App Developer,
I want routes matched by Laravel's compiler (parameters, optional parameters, `where` patterns, domains) and dispatched to closures and controllers,
So that URLs resolve exactly as in Laravel (FR-30).

**Acceptance Criteria:**

**Given** the test scope: every `RRT` Test ID not matched by Story 48.3
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** the symfony/routing `RouteCompiler` port
**When** it compiles Upstream's route fixtures
**Then** the regexes and variables match Oracle fixtures.

**Given** a controller action with no `inject` declaration
**When** it is dispatched
**Then** it receives the route parameters positionally (AD-4).

**Given** an action declared with `inject`
**When** it is dispatched
**Then** it is called through the container's `callAsync`, so `afterResolvingAsync` hooks run.

### Story 48.3: Route model binding and resource controllers

As an App Developer,
I want implicit and explicit model binding, scoped bindings, enum binding and missing-model handling,
So that `Route.get('/posts/{post}', …)` hands controllers a model, as in Laravel (FR-30).

**Acceptance Criteria:**

**Given** the test scope `RRT::{testImplicitBinding*,testModelBinding*,testRouteBinding*,testResolvingBinding*,testParentChild*,testOptionalBacked*,testShallowResource*,testResourceRout*,testApiResource*}` and `tests/Routing/{ImplicitRouteBindingTest,RouteBindingTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `show(post)`, declared with `inject({ post: Post })`, on the route `/posts/{post}`
**When** it is dispatched
**Then** the segment name equals the `inject` key, so `Post` is resolved by its route key (AD-4)
**And** a `{blog_post}` segment matches the key `blogPost` through `Str.snake`.

**Given** a missing model
**When** binding runs
**Then** it throws `ModelNotFoundException`, or calls `missing()`, as Upstream does.

### Story 48.4: URL generation, signed URLs, Redirector and ResponseFactory

As an App Developer,
I want `route()`, `url()`, `action()`, `asset()`, signed and temporary signed URLs, `redirect()` and `response()`,
So that links and redirects are generated as in Laravel (FR-34, FR-29).

**Acceptance Criteria:**

**Given** the test scope `tests/Routing/{RoutingUrlGeneratorTest,RoutingRedirectorTest,RoutingResponseFactoryTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a signed URL generated by PHP Laravel with the same key (an Oracle fixture)
**When** `hasValidSignature` checks it
**Then** it validates. A Xaravel-signed URL validates in the Oracle, using the config-string key with previous keys (AD-23).

**Given** a tampered signed URL
**When** it passes through `ValidateSignature`
**Then** the response is 403 (FR-34 consequence).

**Given** `UrlGenerator` and `Redirector`
**When** they read the current request
**Then** they read it from a frame slot (AD-5).

### Story 48.5: Routing middleware, throttling and `route:cache`

As an App Developer,
I want middleware sorting and priority, `SubstituteBindings`, `ThrottleRequests` and route caching,
So that request handling and rate limits work as in Laravel (FR-31, FR-36, FR-30).

**Acceptance Criteria:**

**Given** the test scope `tests/Routing/RoutingSortedMiddlewareTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `throttle:api`, backed by a `RateLimiter.for('api')` limit of 2 per minute
**When** a client sends a third request (Xaravel Tests)
**Then** the response is 429, with a correct `Retry-After` header and the `X-RateLimit-*` headers (FR-36).

**Given** `route:cache` serialization
**When** routes with controller actions are cached and reloaded
**Then** they match the uncached routes
**And** closure routes follow Upstream at the Pin, or an Escalation is raised, as the spine's Deferred table records.

**Given** `QUERY` requests
**When** CSRF classification is decided
**Then** it follows Upstream at the Pin, or an Escalation is raised (OQ-7).

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate routing` passes, `async-surface.json` is committed, and the docs are written.

## Epic 49: View: Blade compiler, directives & escaping

App Developers write Blade templates that compile to cached async modules. Rendered HTML and escaping match the Oracle.

**Covers:** FR-44, FR-46, FR-47, FR-48. **Implements:** AD-11, DIV-5.

**Kind:** Upstream Component (a slice of View), with selector test scope under `tests/View/`.
- **Adaptation rule (FR-48):**
  - Each Upstream template input is kept, with its PHP expressions translated by the `PORTING.md` rule.
  - Assertions on compiled PHP become Oracle Differential Tests on the HTML that the same template renders with fixed data.
  - Snapshot tests on the emitted JS are Xaravel Tests only.
- `tests/Integration/View/**` is `blocked-by:testbench`.

### Story 49.1: Compiler pipeline, module cache and `view:cache`

As an App Developer,
I want Blade compiled to TypeScript, transpiled to a cached ES module with `render(ctx)` and `fragments`, and precompiled by `view:cache`,
So that templates render fast and identically to Laravel (FR-47, AD-11).

**Acceptance Criteria:**

**Given** the test scope `tests/View/{ViewBladeCompilerTest,ViewCompilerEngineTest,ViewEngineResolverTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a template
**When** it is compiled
**Then** the module is written to `storage/framework/views/<hash>.js`, exports `render(ctx: RenderContext): Promise<string>` and `fragments`, and is reused until the source changes.

**Given** `{{ $user.name }}` with data `{ user }`
**When** it renders
**Then** `$user` is destructured from the data. An undeclared `$name` is `undefined`, so `@isset` stays safe (AD-11).

**Given** the compiler's TypeScript output for the templates in the test scope
**When** the package's tests run
**Then** that output is kept as `.ts` snapshot files under `packages/view/tests/__snapshots__/`, not Bun `.snap` files, so the type-aware lint rules run over it (AD-6's compiled-view snapshots)
**And** `lint:disables` and XT-conformance-129 point at those real files instead of the Story 6.1 placeholder (Epic 6 retro S5, Maintainer ruling on item 9).

**Given** `tests/View/ViewPhpEngineTest.php`
**When** it is classified
**Then** it is `intentional-divergence:DIV-5`, because there are no PHP view files.

### Story 49.2: Echo, escaping and the XSS suite

As an App Developer,
I want `{{ }}`, `{!! !!}`, `@{{ }}`, comments, `@verbatim`, `@json` and `@js`, with Laravel's exact escaping,
So that output is safe and byte-identical (FR-46).

**Acceptance Criteria:**

**Given** the test scope `tests/View/Blade/{BladeEchoTest,BladeEscapedTest,BladeEchoHandlerTest,BladeExpressionTest,BladeVerbatimTest,BladeCommentsTest,BladeJsonTest,BladeJsTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** the Xaravel XSS suite (Xaravel Test IDs), covering:
- `<script>`;
- attribute breakouts;
- `javascript:` URLs;
- entity tricks;
- `Htmlable` and `HtmlString` values;
- each payload in `{{ }}`, `{!! !!}`, attributes and `@js`.

**When** the suite renders
**Then** the output matches Oracle-generated expected values exactly, and is not counted in the Conformance Rate (FR-46 consequence).

**Given** an expression that evaluates to a Promise or thenable
**When** it is printed with `{{ }}`
**Then** rendering throws `ViewException`, naming the expression.

### Story 49.3: Control-flow, loop and form directives

As an App Developer,
I want `@if` / `@unless` / `@isset` / `@empty` / `@switch`, the loops with `$loop`, `@break` / `@continue`, `@php` blocks (TypeScript), `@use`, `@inject`, `@checked` / `@selected` / `@disabled`, `@class` / `@style`, `@error`, `@env` / `@production`, `@session`, `@lang` and `@context`,
So that every logic directive works as in Laravel (FR-44).

**Acceptance Criteria:**

**Given** the test scope `tests/View/Blade/{BladeIfStatementsTest,BladeElseStatementsTest,BladeElseIfStatementsTest,BladeUnlessStatementsTest,BladeIfIssetStatementsTest,BladeIfEmptyStatementsTest,BladeForStatementsTest,BladeForeachStatementsTest,BladeForelseStatementsTest,BladeWhileStatementsTest,BladeBreakStatementsTest,BladeContinueStatementsTest,BladeBoolTest,BladePhpStatementsTest,BladeUnsetStatementsTest,BladeUseTest,BladeInjectTest,BladeCheckedStatementsTest,BladeClassTest,BladeStyleTest,BladeErrorTest,BladeEnvironmentStatementsTest,BladeSessionTest,BladeLangTest,BladeContextTest,BladeHelpersTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a directive condition or loop iterable that evaluates to a thenable
**When** the template renders
**Then** the guard throws `ViewException` (AD-11).

**Given** `@php … @endphp`
**When** it compiles
**Then** the block contains TypeScript, which may `await` (FR-44).

### Story 49.4: Layouts, sections, stacks, includes and auth directives

As an App Developer,
I want `@extends` / `@section` / `@yield` / `@parent` / `@show`, `@stack` / `@push` / `@prepend` / `@once`, `@include*` / `@each`, and `@auth` / `@guest` / `@can` / `@cannot` / `@canany`,
So that page composition works as in Laravel (FR-44).

**Acceptance Criteria:**

**Given** the test scope `tests/View/Blade/{BladeExtendsTest,BladeSectionTest,BladeYieldTest,BladeShowTest,BladeStopSectionTest,BladeEndSectionsTest,BladeOverwriteSectionTest,BladeAppendTest,BladeHasSectionTest,BladeSectionMissingTest,BladeStackTest,BladePushTest,BladePrependTest,BladeHasStackTest,BladeIncludesTest,BladeIfAuthStatementsTest,BladeElseAuthStatementsTest,BladeIfGuestStatementsTest,BladeElseGuestStatementsTest,BladeCanStatementsTest,BladeCannotStatementsTest,BladeCananyStatementsTest}.php::*` and `tests/View/Concerns/ManagesStacksTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason
**And** the renders that need a Gate are `blocked-by:auth`.

**Given** sections, stacks and the `@once` set
**When** two views render concurrently
**Then** each render has its own state in its `RenderContext` (AD-5, AD-11).

**Given** `@can('update', $post)`
**When** it compiles
**Then** it compiles to an awaited Gate check (AD-11).

### Story 49.5: View factory, finder, sharing and composers

As an App Developer,
I want `view()`, `View.share`, composers and creators, namespaces and the file view finder,
So that views resolve and receive data as in Laravel (FR-44, FR-47).

**Acceptance Criteria:**

**Given** the test scope `tests/View/{ViewFactoryTest,ViewTest,ViewFileViewFinderTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `View.share('x', 1)` at runtime inside a request
**When** a concurrent request renders
**Then** it doesn't see `x`, because runtime shares are frame overlays (AD-5).

**Given** `` `${view('x')}` `` or `view('x').toString()`
**When** it is evaluated
**Then** it throws `ViewException`, naming `await view(...).render()` (AD-11).

**Given** an unloaded relation read during rendering
**When** the template renders
**Then** it throws `LazyLoadingViolationException` (FR-47 consequence).

### Story 49.6: Custom directives and the emitted-code ABI

As an App Developer,
I want `Blade.directive`, `Blade.if`, `Blade.stringable` and echo handlers to work against a fixed ABI,
So that custom directives written for Xaravel keep working across releases (FR-44, AD-11).

**Acceptance Criteria:**

**Given** the test scope `tests/View/Blade/BladeCustomTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a directive handler
**When** it returns TypeScript source
**Then** the source may call only the emitted-code helpers named in `@xaravel/contracts/view`, and a handler that refers to another runtime name fails compilation with a message naming it.

**Given** `Blade.directive` registered after `sealed` inside a request
**When** it is called
**Then** it throws `ScopeFrameException` (AD-5).

## Epic 50: View: Blade components & fragments

App Developers compose anonymous and class-based components with slots and attributes, and declare `@fragment`s that render alone.

**Covers:** FR-45; also FR-39 (fragment capture). **Implements:** AD-11 (fragments), AD-12 (the View-owned seams: `renderTargetResolver` and the `lastRenderedView` frame slot).

**Kind:** Upstream Component (a slice of View), with selector test scope.

### Story 50.1: Component tag compiler

As an App Developer,
I want `<x-name>`, `<x-slot>`, `<x-dynamic-component>` and namespaced `<x-pkg::name>` tags compiled as in Laravel,
So that component markup ports unchanged (FR-45).

**Acceptance Criteria:**

**Given** the test scope `tests/View/Blade/{BladeComponentTagCompilerTest,BladeComponentFirstTest,BladeComponentsTest,BladePropsTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a component tag whose class or view is resolved through the Class Registry or the view finder
**When** an async-path miss occurs
**Then** the class is loaded lazily through the PSR-4 map (AD-10).

### Story 50.2: Component classes, attribute bags, slots and `@aware`

As an App Developer,
I want class-based and anonymous components with `$attributes` merging, `@props`, `@aware`, default and named slots, and data that may be awaited,
So that UI building blocks behave as in Laravel (FR-45, FR-47).

**Acceptance Criteria:**

**Given** the test scope `tests/View/{ComponentTest,ViewComponentTest,ViewComponentAttributeBagTest,DynamicComponentTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a component whose `data()` returns a Promise
**When** the parent renders
**Then** the component's output appears in place, after its data resolves.

**Given** `$attributes.merge({ class: 'btn' })` with an incoming `class`
**When** it renders
**Then** the classes merge in Upstream's order and escaping.

### Story 50.3: Fragments and render-target seams

As an App Developer,
I want `@fragment` / `view().fragment()` / `fragmentIf` / `fragments()`, and the View seams the htmx Integration uses,
So that a single part of a page can be returned on its own (FR-39, FR-42).

**Acceptance Criteria:**

**Given** the test scope `tests/View/Blade/BladeFragmentTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `view('invoices.index', data).fragment('row')`
**When** it renders
**Then** the whole view renders with capture, as in Upstream, and only the fragment's HTML is returned
**And** a fragment that the compiler marks closed may be rendered directly through `fragments.row(ctx)` (AD-11).

**Given** `ViewFactory.renderTargetResolver(fn)`, and the `lastRenderedView` frame slot that View writes on every render
**When** no resolver is registered
**Then** rendering is exactly Upstream's (AD-12 seams are no-ops by default).

**Given** the pagination views (`blocked-by:view` since Story 40.2)
**When** this Story re-verifies them with `component: pagination`
**Then** they render, matching Oracle HTML.

**Given** the View package
**When** this Epic closes
**Then** `api-surface:gate view` passes, `async-surface.json` is committed, and the Blade docs (with Divergences: DIV-5, TypeScript expressions, `$` variables) are written.

## Epic 51: Foundation: application, providers, HTTP kernel, middleware & CSRF

App Developers configure the app in `bootstrap/app.ts`, serve it with the production entry point (and, in Phase 7, `bun artisan serve`), and get Laravel's middleware, CSRF and Form Requests.

**Covers:** FR-18, FR-27, FR-31, FR-32, FR-51; also FR-20 (env-file selection and precedence), FR-43 (WebSocket upgrade). **Implements:** AD-2 (package discovery), AD-5 (lifecycle and unit end), AD-10 (discovery imports), AD-12 (the two-stage pipeline, `serve()`, graceful drain).

**Kind:** Upstream Component (Foundation, core slice), with selector test scope under `tests/Foundation/`.
- `tests/Integration/Foundation/**` is `blocked-by:testbench`.
- Foundation's console and testing parts are in Epics 55 and 57.

### Story 51.1: Application lifecycle, providers and environment bootstrap

As an App Developer,
I want the Application, with providers that `register` and then `boot` in Laravel's order, deferred providers, package discovery and the environment and config bootstrappers,
So that the app boots as Laravel does (FR-18, FR-20, AD-5).

**Acceptance Criteria:**

**Given** the test scope `tests/Foundation/{FoundationApplicationTest,FoundationAliasLoaderTest,FoundationProviderRepositoryTest,FoundationPackageManifestTest,FoundationEnvironmentDetectorTest,Bootstrap/LoadEnvironmentVariablesTest,Bootstrap/LoadConfigurationTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** an Application
**When** it boots
**Then** its state moves through `registering → booting → sealed`. `register()` is sync, `boot()` may be async and is awaited in order, and every kernel completes boot before it opens a unit frame (AD-5).

**Given** a deferred provider
**When** its service is first resolved after `sealed`, from any frame
**Then** it registers and boots into the base under a mutex, exactly once.

**Given** `.env`, `.env.testing`, `APP_ENV=testing` and real environment variables (fixtures)
**When** `LoadEnvironmentVariables` runs
**Then** the file chosen and the precedence match Laravel, and Bun's own `.env` loading has no effect (FR-20 consequence).

**Given** a package whose `package.json` declares `"xaravel": { "providers": [...] }`
**When** `package:discover` runs
**Then** it writes `bootstrap/cache/packages.json`, and providers load as framework defaults, then discovered providers, then `bootstrap/providers.ts` (AD-2).

### Story 51.2: `bootstrap/app.ts` and the ApplicationBuilder

As an App Developer,
I want `Application.configure().withRouting().withMiddleware().withExceptions().withProviders().create()`,
So that `bootstrap/app.ts` reads as in Laravel (FR-18).

**Acceptance Criteria:**

**Given** the test scope `tests/Foundation/{FoundationApplicationBuilderTest,Configuration/MiddlewareTest,Configuration/ExceptionsTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `withMiddleware((m) => m.web({ append: [X] }).alias({ admin: Y }).priority([...]))`
**When** the kernel is built
**Then** the groups, aliases and priority match Upstream's configuration result.

### Story 51.3: HTTP kernel on `Bun.serve`

As an App Developer,
I want the HTTP kernel served through `Bun.serve`, with a production entry point and graceful shutdown,
So that requests run through Laravel's pipeline natively on Bun (FR-27, AD-12).

**Acceptance Criteria:**

**Given** the test scope `tests/Foundation/Http/KernelTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a request
**When** `kernel.handle()` runs
**Then** it runs the `BeforeBody` global middleware on headers only, then `await request.loadBody(limits)`, then the rest of the pipeline (AD-12)
**And** the unit ends only after the body is flushed, terminable middleware and `terminating` callbacks have run, and the defer list has drained (AD-5).

**Given** 50 concurrent requests, each carrying distinct session, auth-like and scoped-container state (Xaravel Tests)
**When** they interleave
**Then** none sees another's state (FR-27 consequence, NFR-4).

**Given** a route that accepts a WebSocket upgrade
**When** a client upgrades
**Then** `serve()` returns 101 and hands the socket to the route's handler, and each message runs as a child unit of the connection frame (FR-43, AD-5).

**Given** SIGTERM
**When** units are in flight
**Then** `serve()` stops accepting new connections and drains the open units before it exits.

**Given** every package's dependencies
**When** the dependency check runs
**Then** no third-party HTTP framework appears (FR-27 consequence).

### Story 51.4: Foundation middleware and maintenance mode

As an App Developer,
I want `TrimStrings`, `ConvertEmptyStringsToNull`, `TransformsRequest`, `ValidatePathEncoding`, `ValidatePostSize` and `PreventRequestsDuringMaintenance`, with the file and cache maintenance modes,
So that the default middleware stack behaves as Upstream does (FR-31).

**Acceptance Criteria:**

**Given** the test scope `tests/Foundation/{Http/Middleware/TrimStringsTest,Http/Middleware/ConvertEmptyStringsToNullTest,Http/Middleware/TransformsRequestTest,Http/Middleware/ValidatePathEncodingTest,FoundationArrayMaintenanceModeTest,FoundationCacheBasedMaintenanceModeTest}.php::*` and the remapped `tests/Http/Middleware/TrimStringsTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** the app is in maintenance mode, with a secret bypass cookie
**When** a request arrives
**Then** `PreventRequestsDuringMaintenance` (a `BeforeBody` middleware) answers 503, or lets the request through, as Upstream does.

### Story 51.5: CSRF: token and origin checks

As an App Developer,
I want token-based CSRF (`VerifyCsrfToken`) and Laravel 13's origin-based `PreventRequestForgery`,
So that state-changing requests are protected exactly as in Laravel (FR-32).

**Acceptance Criteria:**

**Given** the remapped test scope `tests/Http/Middleware/PreventRequestForgeryTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a POST without a valid token (Xaravel Tests)
**When** it is handled
**Then** the response is 419.
**And** a token in `_token`, `X-CSRF-TOKEN`, or an encrypted `X-XSRF-TOKEN` cookie value is accepted (FR-32 consequences).

**Given** an htmx Request carrying `HX-Request: true` and the token in an `X-CSRF-TOKEN` header, as an inherited `hx-headers` would send it
**When** it is handled
**Then** it passes (FR-32 consequence).

**Given** `@csrf` and `csrf_token()`
**When** a view renders
**Then** they output the current session's token.

### Story 51.6: Form Requests and Foundation helpers

As an App Developer,
I want Form Requests (`authorize`, `rules`, `messages`, `attributes`, `prepareForValidation`, `passedValidation`), `request.validate()` and Foundation's global helpers,
So that controller validation reads as in Laravel (FR-51, FR-21).

**Acceptance Criteria:**

**Given** the test scope `tests/Foundation/{FoundationFormRequestTest,FoundationHelpersTest,FoundationAuthorizesRequestsTraitTest,FoundationAuthenticationTest}.php::*`
**When** the harness runs it
**Then** each Test ID passes, or carries a valid reason. `FoundationAuthorizesRequestsTraitTest` and `FoundationAuthenticationTest` are `blocked-by:auth`.

**Given** a controller method declared with `inject({ request: StoreInvoiceRequest })`
**When** it is dispatched
**Then** the Form Request is resolved, authorized and validated in an `afterResolvingAsync` hook, before the action runs (AD-6)
**And** a failure on a non-htmx request redirects back with errors and old input, as in Laravel.

**Given** `await request.validate({...})`
**When** the rules pass
**Then** it returns the validated data.

**Given** Foundation's core slice
**When** this Epic closes
**Then** the API-surface diff for the Foundation core classes shows zero unexplained members, `async-surface.json` is committed, and the lifecycle, middleware and CSRF docs are written.

## Epic 52: Foundation: exceptions, error pages & Vite

App Developers customise error handling, get debug and generic error pages and JSON errors, and load assets with `@vite` under a strict CSP.

**Covers:** FR-35, FR-49. **Owns port (AD-22):** symfony/error-handler, for the debug page. **Implements:** AD-12 (`Handler.fallbackRenderable`), AD-5 (the exception dedupe map and the Vite nonce in frame slots).

**Kind:** Upstream Component (Foundation, slice), with selector test scope.

### Story 52.1: Exception handler and `withExceptions`

As an App Developer,
I want `report`, `render`, `reportable` / `renderable`, `dontReport`, throttled reporting, context and JSON rendering,
So that errors are handled as in Laravel (FR-35).

**Acceptance Criteria:**

**Given** the test scope `tests/Foundation/{FoundationExceptionsHandlerTest,Bootstrap/HandleExceptionsTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a request that `expectsJson()`
**When** an unhandled exception occurs
**Then** the response is Laravel's JSON error shape and status (FR-35 consequence).

**Given** `Handler.fallbackRenderable(fn)`
**When** it is registered
**Then** it runs only after every app and framework renderable has declined (AD-12).

### Story 52.2: Debug and production error pages

As an App Developer,
I want Laravel's debug error page in `local` and a generic page in `production`,
So that development errors are informative and production errors leak nothing (FR-35).

**Acceptance Criteria:**

**Given** the test scope `tests/Foundation/{Exceptions/Renderer/FrameTest,Exceptions/Renderer/ListenerTest,Http/HtmlDumperTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `APP_ENV=local` and `APP_DEBUG=true`
**When** an unhandled exception occurs on a browser request
**Then** the debug page shows the message, the source-mapped TypeScript frames and the request context.

**Given** `APP_ENV=production`
**When** an unhandled exception occurs
**Then** the generic error page is shown, with no stack trace or exception message (FR-35 consequence).

### Story 52.3: Vite and CSP nonces

As an App Developer,
I want `@vite`, Vite preloading and the CSP nonce helpers,
So that assets load in development and production, and htmx runs under a strict CSP (FR-49).

**Acceptance Criteria:**

**Given** the test scope `tests/Foundation/{FoundationViteTest,FoundationViteFontsTest}.php::*` and the remapped `tests/Http/Middleware/VitePreloadingTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `Vite.useCspNonce()`
**When** a page renders the Vite tags, the htmx 4 `<script>` tag and htmx 4's inline configuration
**Then** all three carry the per-request nonce. `csp_nonce()` and `@nonce` return the same value, and concurrent requests get distinct nonces (frame slot).

**Given** a page served with `Content-Security-Policy: script-src 'nonce-<n>'` (a Xaravel browser-free test that checks every script tag)
**When** it renders
**Then** no inline script lacks the nonce (FR-49 consequence).

### Story 52.4: Foundation Cloud classification

As a Framework Agent,
I want the Laravel Cloud integration suites classified,
So that their Test IDs leave `not-ported-yet` as post-alpha work (PRD §7.2; FR-3).

**Acceptance Criteria:**

**Given** the test scope `tests/Foundation/Cloud/**` and `tests/Foundation/LaravelCloudJsonFormatterTest.php::*`
**When** they are classified
**Then** each is `deferred:foundation-cloud`, which `conformance/deferred-items` lists from PRD §7.2 ("the rest of Foundation (Cloud and other integrations)").

**Given** this Epic
**When** it closes
**Then** the docs for error handling and Vite (with the CSP nonce section) are written.

## Epic 53: htmx 4 Integration

Controllers answer htmx Requests with Fragments, htmx headers, htmx-aware redirects, 422 validation re-renders and streaming. Non-htmx requests stay exactly Upstream (UJ-2).

**Covers:** FR-37 to FR-43; also FR-35 (htmx error Fragments). **Implements:** AD-12.

**Kind:** Xaravel Component.
- Every acceptance criterion is verified by an `XT-htmx-<n>` test, which drives requests through `kernel.handle()`.
- No Upstream-mirroring package imports `@xaravel/htmx`.
- Every seam is a no-op for a non-htmx request, except the `Vary` header.

### Story 53.1: htmx Request detection

As an App Developer,
I want `request.htmx()`, `isBoosted()`, `requestType()`, `currentUrl()`, `isHistoryRestore()`, `source()` and `target()`,
So that controllers and middleware can branch on htmx context (FR-37).

**Acceptance Criteria:**

**Given** the htmx provider
**When** it boots
**Then** it installs the accessors onto `Request` with `mixinStrict`, which throws if a member already exists (AD-12).

**Given** requests with and without each `HX-*` header
**When** the accessors are called
**Then** the booleans are `false` when the header is missing, `requestType()` returns `full` or `partial`, and `target()` parses `tag#id` into its parts (FR-37 consequences).

**Given** an htmx Request that sends `Accept: text/html`
**When** `expectsJson()` is called
**Then** it returns `false`.

### Story 53.2: htmx response helpers

As an App Developer,
I want fluent `hxTrigger`, `hxLocation`, `hxRedirect`, `hxRefresh`, `hxRetarget`, `hxReswap`, `hxReselect`, `hxPushUrl` and `hxReplaceUrl` on responses,
So that controllers drive htmx without hand-writing headers (FR-38).

**Acceptance Criteria:**

**Given** `response(html).hxTrigger('invoiceCreated', { id: 5 })`
**When** it is sent
**Then** `HX-Trigger` is `{"invoiceCreated":{"id":5}}`, encoded by `jsonEncode`, in a form that htmx 4.0.0 parses (FR-38 consequence)
**And** several triggers merge into one object.

**Given** the response mixin
**When** its members are listed
**Then** there is no helper for `HX-Trigger-After-Swap` or `HX-Trigger-After-Settle` (FR-38 consequence).

### Story 53.3: Fragment responses and full-versus-partial rendering

As an App Developer,
I want htmx partial requests to get only the requested Fragment or the content region, and boosted and history-restore requests to get the full page,
So that one route serves both full pages and swaps (FR-39, FR-42).

**Acceptance Criteria:**

**Given** `return view('invoices.index', data)` on a route
**When** it is requested as a non-htmx request, a boosted request, a history-restore request and a partial request (`HX-Request-Type: partial`)
**Then** the first three get the full page. The partial request gets the named Fragment, or the layout's `content` region if it names none, through the `renderTargetResolver` seam (FR-42 consequences).

**Given** `view(...).fragments(['row', 'totals'])`, or Fragments wrapped in `<hx-partial>` or marked out-of-band
**When** they are returned in one response
**Then** only those Fragments' HTML is sent (FR-39 consequences).

**Given** any response through the view or response seams, htmx or not
**When** it is sent
**Then** it carries `Vary: HX-Request, HX-Request-Type`
**And** for a non-htmx request this is the only difference from Upstream's response (FR-42 consequence, §5.1).

### Story 53.4: htmx-aware redirects

As an App Developer,
I want `return redirect().route('invoices.index')` to work for both htmx and non-htmx requests, with `.hxRedirect()` for full reloads,
So that controller code stays Laravel's (FR-41).

**Acceptance Criteria:**

**Given** the same controller action
**When** it is called as a non-htmx request, and then as an htmx Request
**Then** the first gets a 302, and the second gets a 200 with `HX-Location`, through `Redirector` / `ResponseFactory` decoration and `Router.prepareResponseUsing` (FR-41 consequence).

**Given** `redirect().route('home').with('status', 'ok')`
**When** the next request reads the session, on either path
**Then** the flash data is present (FR-41 consequence).

**Given** `redirect().route('login').hxRedirect()` on an htmx Request
**When** it is sent
**Then** it carries `HX-Redirect`.

### Story 53.5: Validation failure on htmx Requests

As an App Developer,
I want an invalid htmx form submission to come back as the re-rendered form Fragment, with errors, old input and 422,
So that htmx swaps the errors in place (FR-40, UJ-2).

**Acceptance Criteria:**

**Given** a Form Request or route that declares `.fragment('invoices.create', 'form')` (the `Route` / `FormRequest` macros)
**When** validation fails on an htmx Request
**Then** that Fragment renders with `$errors` and `old()` shared through `session.now`, never flashed, and the status is 422 (FR-40).

**Given** no declared Fragment
**When** `HX-Target` names an id that matches a Fragment in the view the route last rendered (`lastRenderedView`)
**Then** that Fragment re-renders.

**Given** no declared or matching Fragment
**When** validation fails
**Then** a 422 Fragment rendered with the `validation-errors` component is returned.

**Given** the same route requested without htmx
**When** validation fails
**Then** the response is Laravel's redirect back, with errors and old input (FR-40 consequence).

### Story 53.6: Error Fragments for htmx Requests

As an App Developer,
I want unhandled exceptions on htmx Requests to return an HTML error Fragment with the right status,
So that htmx 4, which swaps 4xx and 5xx responses, shows a useful error instead of a full page (FR-35).

**Acceptance Criteria:**

**Given** an htmx Request whose handler throws a 404, a 403 or an unhandled error
**When** the exception is rendered through `Handler.fallbackRenderable`
**Then** the response is an HTML error Fragment with status 404, 403 or 500. The Fragment is detailed in `local` and generic in `production` (FR-35 consequence).

**Given** an app renderable registered for the exception
**When** the exception occurs
**Then** the app's renderable wins (AD-12 ordering).

### Story 53.7: Streaming: SSE, `multipart/mixed` and WebSockets

As an App Developer,
I want server-sent events, `multipart/mixed` responses for `hx-multipart`, and WebSocket routes,
So that htmx 4's streaming features work end to end (FR-43).

**Acceptance Criteria:**

**Given** a controller that streams server-sent events, with an `await` between events (Xaravel Test with a real client)
**When** a client reads the stream
**Then** each event arrives when it is written, not when the handler finishes (FR-43 consequence).

**Given** a `multipart/mixed` response writer
**When** parts are written with delays between them
**Then** each part is flushed as it is written, with htmx 4's expected part headers (FR-43 consequence).

**Given** a WebSocket route (served by Story 51.3)
**When** a client connects and sends messages
**Then** the upgrade returns 101, and the handler receives messages with frame isolation per message (FR-43 consequence).

**Given** the htmx package
**When** this Epic closes
**Then** `xt:coverage htmx` reports every FR-37 to FR-43 consequence covered by a passing Xaravel Test, apart from the FR-96 assertions (Epic 58)
**And** the htmx docs page (requests, responses, fragments, redirects, validation, streaming) is written.

### Story 53.8: Phase 6 `blocked-by` sweep

As the Maintainer,
I want every `blocked-by` entry that names a Phase 6 Component re-verified,
So that Phase 6 can complete. A Phase isn't complete while any `blocked-by` entry points at it (Global rules, FR-13).

**Acceptance Criteria:**

**Given** the test scope: every Expectations entry whose reason is `blocked-by:<c>`, for `<c>` in {cookie, session, http, routing, view, foundation}, resolved by sprint planning when this Story is planned, with one manifest per owning Component (AD-21) (htmx is a Xaravel Component and has no Upstream entries)
**When** the harness runs it
**Then** each Test ID passes, or carries a valid reason that names a later-Phase Component.

**Given** the Expectations File after this Story merges
**When** the Phase-completion check runs
**Then** zero entries are `blocked-by:<c>` for any Phase 6 Component, and the check fails, listing them, if any remain.

## Epic 54: Console: commands, prompts & scheduling

App Developers define and run `bun artisan` commands with Laravel's signatures, prompts, output and the scheduler.

**Covers:** FR-69, FR-70, FR-72. **Owns ports (AD-22):** symfony/console, laravel/prompts, nunomaduro/termwind, dragonmantank/cron-expression.

**Kind:** Upstream Component, with selector test scope under `tests/Console/`.
- `tests/Integration/Console/**` (213 methods) is owned by Epic 60.
- Testbench is in this same Phase, so those tests can't be recorded as `blocked-by`.
- Libraries outside the Inventory are verified by Oracle Differential Xaravel Tests.

### Story 54.1: symfony/console core port

As a Framework Agent,
I want the symfony/console surface that Laravel uses, ported once: Application, input and definitions, output and formatter styles, Table, ProgressBar and Question helpers,
So that Laravel's Console layer ports onto the API it uses in PHP (FR-69).

**Acceptance Criteria:**

**Given** the test scope `tests/Console/{ConsoleApplicationTest,ConsoleParserTest,CommandSignatureTest,OutputStyleTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** tables, progress bars, styled output (`<info>`, `<error>`, custom styles) and `OutputStyle` sections, rendered at a fixed terminal width
**When** they render to a buffered output
**Then** the bytes match Oracle fixtures of the same calls in PHP.

**Given** a signature such as `mail:send {user} {--queue=} {--force} {ids*}`
**When** it is parsed
**Then** the argument and option definitions match Upstream's parser.

### Story 54.2: Command class, IO, signals and mutexes

As an App Developer,
I want `Command` with `handle`, `argument`, `option`, `info` / `error` / `table` / `withProgressBar`, signal trapping and command isolation mutexes,
So that commands are written as in Laravel (FR-69).

**Acceptance Criteria:**

**Given** the test scope `tests/Console/{CommandTest,Concerns/InteractsWithIOTest,CommandTrapTest,SignalsTest,CommandMutexTest,CacheCommandMutexTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `handle()` declared with `inject({...})`
**When** the command runs
**Then** dependencies are injected through `callAsync`, and the command runs inside a `command` unit frame.

**Given** `this.trap([SIGTERM], fn)`
**When** the process receives SIGTERM
**Then** `fn` runs, through `process.on`, with Upstream's semantics.

### Story 54.3: Prompts

As an App Developer,
I want `text`, `password`, `confirm`, `select`, `multiselect`, `suggest`, `search`, `pause`, `spin`, `table` and `form`, with laravel/prompts behaviour, plus `PromptsForMissingInput`,
So that interactive commands feel like Laravel's (FR-70).

**Acceptance Criteria:**

**Given** the test scope `tests/Console/{ConfiguresPromptsTest,PromptsForMissingInputTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** each prompt, driven by scripted keystrokes in a virtual terminal (Oracle Differential Xaravel Tests against laravel/prompts at the Pin)
**When** it renders and accepts input
**Then** the rendered frames and the returned values match.

**Given** a non-interactive terminal
**When** a prompt runs
**Then** it falls back as laravel/prompts does: it uses the default value or fails validation.
**And** `expectsQuestion` / `expectsChoice` support for prompts is verified in Story 57.4 (FR-70 consequence).

### Story 54.4: Termwind and console view components

As an App Developer,
I want Laravel's console view components (`info`, `warn`, `error`, `task`, `twoColumnDetail`, `bulletList`, `alert`),
So that framework commands print exactly as in Laravel (FR-69).

**Acceptance Criteria:**

**Given** the test scope `tests/Console/View/ComponentsTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** the termwind port (over `Bun.stringWidth` and `Bun.wrapAnsi`)
**When** the components render at fixed terminal widths
**Then** the output matches Oracle fixtures.

### Story 54.5: Task scheduling

As an App Developer,
I want schedules in `routes/console.ts` with the frequency API, `withoutOverlapping`, `onOneServer` and `runInBackground`, run by `schedule:run` / `schedule:work`,
So that scheduled tasks behave as in Laravel (FR-72).

**Acceptance Criteria:**

**Given** the test scope `tests/Console/{ConsoleEventSchedulerTest,ConsoleScheduledEventTest,Scheduling/FrequencyTest,Scheduling/ScheduleTest,Scheduling/EventTest,Scheduling/ScheduleWorkCommandTest,Scheduling/CacheSchedulingMutexTest,Scheduling/CacheEventMutexTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** the cron-expression port
**When** it computes the next and previous run dates for Upstream's expression corpus, across timezones and DST
**Then** the results match Oracle fixtures.

**Given** `Schedule.call(inject({ reports: ReportService }, async (reports) => …)).daily()`
**When** it is due
**Then** it runs in a `scheduled task` unit frame, with injection.

**Given** `withoutOverlapping()` and `onOneServer()`
**When** two schedulers run
**Then** the cache mutexes allow only one, as Upstream does.

### Story 54.6: Re-verify the command suites

As a Framework Agent,
I want the command suites that waited for Console re-verified,
So that their `blocked-by:console` entries are cleared (Global rules; FR-69).

**Acceptance Criteria:**

**Given** the `blocked-by:console` entries from Stories 38.4 (prune), 39.3 (migrate, seed and db commands) and 42.5 (`cache:clear`)
**When** this Story re-verifies them, in manifests with `component: database` and `component: cache`
**Then** each passes, or carries a valid non-`blocked-by` reason.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate console` passes, `async-surface.json` is committed, and the Console docs (Artisan, prompts, scheduling) are written.

## Epic 55: Foundation: console kernel, generators & tinker

App Developers scaffold every file type with `make:*`, producing TypeScript that compiles under `--strict`, run the framework commands, and open a booted REPL.

**Covers:** FR-71, FR-73; also FR-20 (`config:cache`). **Implements:** DIV-5 (TypeScript reference files), AD-3 (generated imports come from `@xaravel/framework/...`), AD-7 and AD-9 (generated brands and `declare` fields).

**Kind:** Upstream Component (Foundation, console slice).
- Stub-backed commands that live in other packages (Routing controllers, Database migrations, factories and seeders, `cache:table`, `session:table`) are Stories here whose manifests name those packages as `component:` (AD-21).
- The Queue and Notifications table generators are in Epics 62 and 66.
- `tests/Integration/Generators/**` (111 methods) is owned by Epic 60.

### Story 55.1: Console kernel and the `bun artisan` entry

As an App Developer,
I want `bun artisan` to boot the app, discover commands in `app/Console/Commands`, load closure commands from `routes/console.ts`, and run `about`, `serve` and `dev`,
So that the CLI works as Laravel's does (FR-69).

**Acceptance Criteria:**

**Given** the test scope `tests/Foundation/{Console/KernelTest,Console/AboutCommandTest,Console/CliDumperTest,Console/ServeCommandTest,Console/ServeCommandLogParserTest,Console/DevCommandTest,FoundationDevCommandsTest,FoundationDevCommandTest,FoundationDevListCommandTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a Skeleton-shaped fixture app
**When** `bun artisan list` runs, with `--no-env-file`
**Then** it lists the framework commands and the discovered app commands (DIV-7), and finishes boot before it opens any command frame.

**Given** `bun artisan serve`
**When** it starts
**Then** it uses Foundation's `serve()` (Story 51.3), and prints the address and request log lines as Upstream does.

**Given** `tests/Foundation/FoundationDocsCommandTest.php` (`docs` opens laravel.com)
**When** it is classified
**Then** the agent raises an Escalation proposing to adapt it to Xaravel's docs URL, or to mark it `intentional-divergence`.

### Story 55.2: Framework caching and maintenance commands

As an App Developer,
I want `config:cache` / `config:clear`, `route:cache`, `view:cache`, `event:cache`, `optimize` / `optimize:clear`, `package:discover`, `key:generate`, `storage:link`, `down` / `up` and `route:list`,
So that production optimisation works as in Laravel (FR-20, FR-30, FR-47).

**Acceptance Criteria:**

**Given** the test scope `tests/Foundation/Console/{RouteListCommandTest,ChannelListCommandTest}.php::*`
**When** the harness runs it
**Then** each Test ID passes, or carries a valid reason. `ChannelListCommandTest` is `blocked-by:broadcasting`.

**Given** a config holding a class value
**When** `config:cache` writes `bootstrap/cache/config.php` (or its `.json` form) and the app reloads
**Then** every value equals the uncached one, and classes are rehydrated from `{ "$class": "<FQCN>" }` (FR-20 consequence, AD-10).

**Given** `optimize`
**When** it runs
**Then** it writes the config, route, event and view caches and `bootstrap/cache/classes.json` (AD-10).

**Given** `key:generate`
**When** it runs
**Then** it writes a `base64:` 32-byte `APP_KEY` into `.env`, as Upstream does.

### Story 55.3: Generator reference files (Infrastructure Story)

As the Maintainer,
I want one reviewed TypeScript reference file for every Upstream `make:*` stub,
So that generator conformance is graded against an agreed target and not against the generator's own output (FR-71, DIV-5).

**Acceptance Criteria:**

**Given** the 88 `.stub` files at the Pin (Foundation 63, Routing 13, Database 5, Queue 3, and Auth, Cache, Notifications and Session 1 each)
**When** this Story merges
**Then** `conformance/fixtures/generators/<stub>.ts` exists for each one, written as idiomatic Xaravel:
- AD-3 imports;
- `inject` for constructor dependencies;
- brand getters for marker interfaces;
- `declare` columns on models;
- Pest-style tests for `make:test`.

**And** the PR passes Maintainer Code Owner review, because the path is Protected.

**Given** each reference file
**When** it is type-checked against the framework packages, with placeholders filled
**Then** it compiles under `tsc --strict`.

### Story 55.4: Generators for models, the database and app classes

As an App Developer,
I want `make:model` (with `-mfsc` and the other combinations), `make:controller` (plain, resource, API, invokable, model), `make:migration`, `make:factory`, `make:seeder`, `make:observer`, `make:cast`, `make:scope`, `make:policy`, `make:resource`, `make:enum`, `make:class`, `make:interface`, `make:trait`, `make:exception`, `cache:table` and `session:table`,
So that `bun artisan make:model Invoice -mfc` scaffolds Laravel-shaped TypeScript (FR-71, UJ-1).

**Acceptance Criteria:**

**Given** each listed command, run against a fixture app
**When** it generates a file
**Then** the file equals its reference from Story 55.3, after placeholder substitution, and compiles under `tsc --strict` (FR-71 consequences).

**Given** `make:model Invoice -mfc`
**When** it runs
**Then** it creates `app/Models/Invoice.ts`, a timestamped migration, `database/factories/InvoiceFactory.ts` and `app/Http/Controllers/InvoiceController.ts`, and the model ends with `registerClass('App\\Models\\Invoice', Invoice)` (AD-10).

**Given** commands that live in other packages (`make:controller` in Routing; `make:migration`, `make:factory` and `make:seeder` in Database; `cache:table` in Cache; `session:table` in Session)
**When** their Stories are planned
**Then** each has its own manifest naming that package, under this Story's acceptance criteria.

### Story 55.5: Generators for HTTP, console and messaging, plus `stub:publish`

As an App Developer,
I want `make:request`, `make:middleware`, `make:rule`, `make:provider`, `make:command`, `make:test`, `make:view`, `make:component`, `make:channel`, `make:event`, `make:listener`, `make:job`, `make:job-middleware`, `make:mail` and `make:notification`, plus `stub:publish`,
So that every Upstream generator exists (FR-71).

**Acceptance Criteria:**

**Given** each listed command, run against a fixture app
**When** it generates a file
**Then** the file equals its Story 55.3 reference and compiles under `tsc --strict`.

**Given** `make:test InvoiceTest`
**When** it runs
**Then** the test uses the Pest-style form `uses(TestCase, RefreshDatabase)` and `test(name, async function () { … })` (FR-96, AD-25).

**Given** `stub:publish`
**When** it runs, and a published stub is edited
**Then** generators use the edited stub (FR-71 consequence).

### Story 55.6: `bun artisan tinker`

As an App Developer,
I want an interactive TypeScript REPL with the app booted,
So that I can poke at models and services as I would in Laravel (FR-73).

**Acceptance Criteria:**

**Given** `bun artisan tinker` in a fixture app (Xaravel Tests, run through a pseudo-terminal)
**When** it starts
**Then** facades, helpers, models (via the PSR-4 map) and `config()` are in scope, inside a `command` unit frame (FR-73 consequence).

**Given** the expression `await User.first()`, or plain `User.first()`, which returns a thenable
**When** it is evaluated
**Then** the Promise is awaited and the model is printed (FR-73 consequence).

**Given** this Epic
**When** it closes
**Then** the Foundation console docs (Artisan commands, generators and their TypeScript output, tinker) are written, and the API-surface diff for `Foundation\Console\*` shows zero unexplained members.

## Epic 56: Mail

App Developers send Mailables built from Blade or Markdown over the smtp, log, array and failover transports. Markdown HTML matches the Oracle.

**Covers:** FR-89. **Owns ports (AD-22):** symfony/mailer (SMTP over Bun TCP/TLS), and tijsverkoyen/css-to-inline-styles (an npm package or a port).

**Kind:** Upstream Component, with selector test scope under `tests/Mail/`. `tests/Integration/Mail/**` is owned by Epic 60.

### Story 56.1: Transports

As an App Developer,
I want the `smtp` (with STARTTLS and AUTH), `log`, `array` and `failover` transports,
So that mail sends at the alpha without third-party services (FR-89).

**Acceptance Criteria:**

**Given** a local SMTP sink used as a test fixture
**When** a message is sent with the smtp transport, with and without TLS and AUTH (Xaravel Tests)
**Then** the sink receives the bytes that `@xaravel/mime` renders, and the SMTP dialogue matches symfony/mailer's.

**Given** the `failover` transport with a failing first transport
**When** a message is sent
**Then** it is delivered through the next transport.

**Given** each transport's `send`
**When** `async-surface.json` is generated
**Then** each is tagged `@asyncRoot` as a Mail transport.

### Story 56.2: Mailables, envelopes, content and attachments

As an App Developer,
I want Mailables with `Envelope`, `Content`, `Headers`, `Attachment` and `Attachable`, plus the mailable assertions,
So that mail classes read as in Laravel 13 (FR-89, AD-26).

**Acceptance Criteria:**

**Given** the test scope `tests/Mail/{MailMailableTest,MailableAlternativeSyntaxTest,MailMailableDataTest,MailMailableHeadersTest,AttachableTest,AttachmentTest,MailMailableAssertionsTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `new Envelope({ subject: 'Hi' })` and `new Content({ markdown: 'mail.invoice' })`
**When** they are used
**Then** they are object-first (AD-26), and `envelope` / `content` may be fields or methods (option pairs).

### Story 56.3: Markdown mail and CSS inlining

As an App Developer,
I want Markdown mail components (`x-mail::message`, `button`, `panel`, `table`) rendered with Laravel's themes and inlined CSS,
So that emails look byte-identical to Laravel's (FR-89).

**Acceptance Criteria:**

**Given** Laravel's mail component templates, ported to Xaravel Blade
**When** Markdown mailables from an Oracle fixture set render
**Then** the HTML and text bodies match the Oracle's (league/commonmark plus the CSS inliner) byte for byte (FR-89 consequence)
**And** if `Bun.markdown` differs, the CommonMark library chosen in Story 18.3 is used.

### Story 56.4: Mailer, messages, queued mail and the Mail fake

As an App Developer,
I want `Mail.to(...).send()` / `queue()` / `later()`, `Message` and `Mail.fake()`,
So that sending and testing mail work as in Laravel (FR-89).

**Acceptance Criteria:**

**Given** the test scope `tests/Mail/{MailMailerTest,MailMessageTest,MailableQueuedTest}.php::*`
**When** the harness runs it
**Then** each Test ID passes, or is recorded as `blocked-by:queue`.

**Given** `SupportTestingMailFakeTest` (`blocked-by:mail` since Story 20.6)
**When** this Story re-verifies it with `component: support`
**Then** it passes, or carries a valid reason that names a later Component.

### Story 56.5: Non-alpha transports

As a Framework Agent,
I want the SES, SES v2, Resend and Cloudflare transport suites classified,
So that their Test IDs leave `not-ported-yet` as post-alpha work (PRD §7.2; FR-89, FR-3).

**Acceptance Criteria:**

**Given** the test scope `tests/Mail/{MailSesTransportTest,MailSesV2TransportTest,MailResendTransportTest,MailCloudflareTransportTest}.php::*`
**When** they are classified
**Then** each is `deferred:mail-transports` (PRD §7.2, "additional mail transports").

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate mail` passes, with the deferred transports listed in `exceptions.jsonl`; `async-surface.json` is committed; and the Mail docs are written.

## Epic 57: Testing & Foundation testing

App Developers write Pest-style HTTP, console and database tests with fakes and time control.

**Covers:** FR-96, FR-97, FR-98, FR-99; also FR-70 (prompt test assertions). **Implements:** AD-25, and AD-5 (embedded child units, test frames).

**Kind:** Upstream Component (Testing, plus Foundation's testing slice), with selector test scope. `TRT` = `tests/Testing/TestResponseTest.php`. `tests/Integration/Testing/**` is owned by Epic 60.

### Story 57.1: The Pest-style app test shape and HTTP test calls

As an App Developer,
I want `uses(TestCase, RefreshDatabase)` and `test(name, async function () { … })`, with `this.get` / `post` / `json` / … returning a thenable `PendingTestResponse`,
So that `await this.post(url, data).assertRedirect(route('x')).assertSessionHas('ok')` works (FR-96, AD-25).

**Acceptance Criteria:**

**Given** the test scope `tests/Foundation/Testing/{Concerns/MakesHttpRequestsTest,Concerns/InteractsWithContainerTest,Concerns/InteractsWithViewsTest,BootTraitsTest}.php::*` and `tests/Testing/Concerns/TestViewsTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a test file that calls `uses(TestCase, RefreshDatabase)`
**When** its `test()` bodies run
**Then** `this` is the TestCase instance, and the hooks run in AD-25 order. The test frame opens first, and the Application is created, booted and sealed inside it.

**Given** `this.post(...)` inside a test
**When** it runs
**Then** the kernel handles the request as a child unit of the test frame. Auth, session, config and instances land in the test frame, so post-request assertions see them (AD-5).

**Given** chained assertions on a `PendingTestResponse`
**When** the chain is awaited
**Then** the assertions queue until the response arrives, and run in order.

### Story 57.2: TestResponse: status, headers, cookies, session, redirects and views

As an App Developer,
I want the TestResponse status, header, cookie, session, redirect, view, download and stream assertions,
So that feature tests assert as in Laravel (FR-96).

**Acceptance Criteria:**

**Given** the test scope: every `TRT` Test ID not matched by Story 57.3, plus `tests/Testing/{SeeInHtmlTest,AssertRedirectToRouteTest,AssertRedirectToActionTest,AssertRedirectToSignedRouteTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** an assertion that takes a predicate (`assertSessionHas('k', (v) => …)`)
**When** the predicate is async
**Then** the assertion returns `Promise<void>` (DIV-8).

### Story 57.3: JSON assertions and AssertableJson

As an App Developer,
I want `assertJson*`, `assertExactJson`, `assertJsonPath`, `assertJsonStructure`, `assertJsonValidationErrors` and the fluent `AssertableJson`,
So that API tests assert as in Laravel (FR-96).

**Acceptance Criteria:**

**Given** the test scope `TRT::{testAssertJson*,testAssertExact*,testAssertSimilar*,testJson*}` and `tests/Testing/{Fluent/AssertTest,AssertTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** JSON with integer-like keys and nested lists
**When** it is compared
**Then** the comparison uses PHP array semantics, through `PhpArray` and `jsonDecode` (AD-9).

### Story 57.4: Console tests

As an App Developer,
I want `this.artisan('cmd')` with `expectsQuestion`, `expectsChoice`, `expectsConfirmation`, `expectsOutput`, `expectsTable` and `assertExitCode`,
So that commands, including prompts, are testable as in Laravel (FR-97, FR-70).

**Acceptance Criteria:**

**Given** the test scope `tests/Testing/{Console/RouteListCommandTest,Console/ConfigShowCommandTest,ParallelConsoleOutputTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `this.artisan('invoice:send').expectsQuestion('Which?', 'all').assertExitCode(0)`
**When** it is not awaited
**Then** the `PendingCommand` runs as a destructor terminal, and the test frame awaits it (AD-6)
**And** a Laravel prompt (`text`, `select`) answered with `expectsQuestion` / `expectsChoice` behaves as in Upstream (FR-70 consequence).

### Story 57.5: Database testing

As an App Developer,
I want `RefreshDatabase`, `LazilyRefreshDatabase`, `DatabaseTransactions`, `DatabaseMigrations`, `DatabaseTruncation` and the database assertions,
So that database tests are isolated and fast, as in Laravel (FR-98).

**Acceptance Criteria:**

**Given** the test scope `tests/Foundation/{FoundationInteractsWithDatabaseTest,Testing/DatabaseTruncationTest,Testing/DatabaseMigrationsTest,Testing/DatabaseTransactionsManagerTest,Testing/LazilyRefreshDatabaseTest,Testing/RefreshDatabaseTest,Testing/Traits/CanConfigureMigrationCommandsTest}.php::*` and `tests/Testing/{Concerns/InteractsWithDatabaseTest,Concerns/TestDatabasesTest,Concerns/TestCachesTest,ParallelTestingTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `RefreshDatabase`
**When** a test makes HTTP calls that write
**Then** the embedded requests reuse the test's transaction lease, so there is no deadlock, and everything rolls back afterwards (AD-20).

**Given** Laravel's parallel-testing hooks
**When** they are mapped onto `bun test --parallel`
**Then** per-process databases are suffixed as in Upstream, or an Escalation records a gap.

### Story 57.6: Fakes, time travel and the NFR-7 resets

As an App Developer,
I want `travel`, `travelTo`, `freezeTime`, `Exceptions.fake()`, and every fake reset after each test,
So that tests are deterministic (FR-99, NFR-7).

**Acceptance Criteria:**

**Given** the test scope `tests/Foundation/{FoundationInteractsWithTimeTest,Testing/WormholeTest}.php::*` and `tests/Testing/Concerns/InteractsWithDeprecationHandlingTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** each NFR-7 item (the clock, every facade fake, Mockery expectations, `Str` factories, `Sleep`, `Once`, `Lottery`)
**When** one test sets it and the next test reads it
**Then** the next test sees the default. Each item has its own Xaravel Test, under `XT-testing-<n>` (NFR-7, AD-25).

**Given** the Testing package
**When** this Epic closes
**Then**:
- `api-surface:gate testing` passes;
- `async-surface.json` lists `PendingTestResponse` and `PendingCommand`;
- the Testing docs (with Divergences: DIV-8, the Pest-style shape) are written;
- `@xaravel/testing` depends on `@xaravel/mockery` at runtime (AD-2).

## Epic 58: htmx test assertions

App Developers assert `HX-Trigger`, Fragments and `HX-Location` in their feature tests.

**Covers:** FR-96 (the htmx consequence). **Implements:** AD-12 (TestResponse mixins, installed only when `@xaravel/testing` is present).

**Kind:** Xaravel Component (a slice of htmx). Every acceptance criterion is verified by an `XT-htmx-<n>` test.

### Story 58.1: `assertHxTrigger`, `assertFragment`, `assertHxLocation` and friends

As an App Developer,
I want htmx assertions on TestResponse,
So that htmx behaviour is as easy to test as the rest of Laravel (FR-96).

**Acceptance Criteria:**

**Given** `@xaravel/testing` installed as an optional peer of `@xaravel/htmx`
**When** the htmx provider boots
**Then** it installs `assertHxTrigger(name, payload?)`, `assertFragment(name)`, `assertHxLocation(url)`, `assertHxRedirect(url)`, `assertHxRetarget(sel)` and `assertHxReswap(mode)` with `mixinStrict`
**And** without `@xaravel/testing`, nothing is installed and nothing fails.

**Given** UJ-2's invoice form fixture
**When** a test posts an invalid form as an htmx Request
**Then** `.assertStatus(422).assertFragment('form')` passes
**And** posting a valid form passes `.assertHxTrigger('invoiceCreated')`.

**Given** a non-htmx response
**When** `assertFragment` runs
**Then** it fails with a message saying the response is a full page.

**Given** the htmx Component
**When** this Epic closes
**Then** `xt:coverage htmx` reports every FR-37 to FR-43 consequence and the FR-96 htmx consequence covered.

## Epic 59: Testbench

Library authors and the framework's own integration tests boot a Testbench app with config, migration, env and database hooks.

**Covers:** FR-101. **Implements:** AD-25 (Testbench's `TestCase` extends Foundation's and only adds hooks), AD-10 (the `workbench/app` → `Workbench\App\` mapping).

**Kind:** Xaravel Component. Every acceptance criterion is verified by an `XT-testbench-<n>` test.

### Story 59.1: The Testbench application and TestCase

As a library author,
I want `@xaravel/testbench`'s TestCase to boot a default application with `defineEnvironment`, `getPackageProviders` and `getPackageAliases`,
So that I can test a Xaravel package the way Orchestra Testbench tests Laravel packages (FR-101).

**Acceptance Criteria:**

**Given** a TestCase that extends `Orchestra\Testbench\TestCase`'s Xaravel equivalent
**When** a test runs
**Then** a fresh Application boots, with Testbench's default config, the package providers and aliases, and the `testing` SQLite `:memory:` connection, inside the test frame (AD-25).

**Given** the Testbench package
**When** it is inspected
**Then** it ships a default `users` migration and a `UserFactory` (FR-101 consequence), and maps `workbench/app` to `Workbench\App\`.

### Story 59.2: Testbench attributes and helpers

As a library author,
I want `@WithConfig`, `@WithMigration`, `@RequiresDatabase`, `@WithEnv`, `@RequiresEnv` and `InteractsWithPublishedFiles`,
So that integration tests declare their environment as Upstream's do (FR-101).

**Acceptance Criteria:**

**Given** each attribute as a TC39 decorator on a class or a method (AD-26)
**When** the test runs
**Then** its hook runs before providers register, as Upstream does.

**Given** `@RequiresDatabase('pgsql')`
**When** the harness runs a non-`pgsql` variant
**Then** the test reports Upstream's skip, and the Inventory's `backends` tags agree with it.

**Given** `@RequiresDatabase('mysql')`
**When** it runs at the alpha
**Then** the test is `deferred:mysql-driver`.

**Given** the package
**When** the Epic closes
**Then** the Testbench docs are written.

## Epic 60: Integration-test unlock for Phases 1–7

The roughly 2,800 Upstream integration tests that waited for the Testbench are ported or re-verified, Component by Component.

**Covers:** the Global rules on `blocked-by` and on acceptance of each Component's last Epic (PRD §4).

**Kind:** re-verification Stories. Each Story's manifest names one Component (AD-21). Every Story has the same done check: each Test ID in its scope passes, or carries a valid reason other than `not-ported-yet` and `blocked-by:testbench`.

**Gate:** Phase 7 is complete only when no Expectations entry is `blocked-by:testbench`.

### Story 60.1: Small Components' integration suites

As a Framework Agent,
I want the small integration suites ported,
So that Container, Cookie, Encryption, Pipeline, Redis, Session and Translation leave `blocked-by:testbench` (FR-101, Global rules).

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/{Container,Cookie,Encryption,Pipeline,Redis,Session,Translation}/**`, with one manifest per Component
**When** the harness runs it on every alpha variant
**Then** every Test ID passes, or carries a valid reason that isn't `not-ported-yet` or `blocked-by:testbench`.

### Story 60.2: Validation and View integration

As a Framework Agent,
I want the Validation and View integration suites ported,
So that form validation and rendering are proven through a booted app (FR-101, Global rules).

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Validation/**` and `tests/Integration/View/**`, with one manifest each
**When** the harness runs it
**Then** every Test ID passes, or carries a valid reason that isn't `not-ported-yet` or `blocked-by:testbench`.

### Story 60.3: Filesystem and Events integration

As a Framework Agent,
I want the Filesystem and Events integration suites ported,
So that `ServeFile` / `ReceiveFile`, Storage, `ShouldDispatchAfterCommit` and `Event.fake` are proven end to end (FR-101, Global rules).

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Filesystem/**` and `tests/Integration/Events/**`, with one manifest each
**When** the harness runs it
**Then** every Test ID passes, or carries a valid reason. Queue-dependent tests are `blocked-by:queue`.

### Story 60.4: Support integration

As a Framework Agent,
I want the Support integration suites ported (facades, managers, deferred callbacks, maintenance mode, Portuguese pluralizer),
So that Support's last entries are cleared (FR-101, Global rules).

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Support/**`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid reason that isn't `not-ported-yet` or `blocked-by:testbench`.

### Story 60.5: Log and Context integration

As a Framework Agent,
I want the Log manager, JSON formatter and Context integration suites ported,
So that FR-81's Context behaviour is proven against Upstream's own tests.

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Log/**`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid reason. The Context-into-jobs tests are `blocked-by:queue`.

### Story 60.6: Cache integration

As a Framework Agent,
I want the Cache integration suites ported (memoized store, file and Redis locks, Redis store, failover, Repository),
So that Cache's store and lock behaviour is proven on real backends (FR-101, Global rules).

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Cache/**`
**When** the harness runs it on `none`, `sqlite`, `pgsql` and `redis`
**Then** every Test ID passes, or carries a valid reason
**And** the phpredis-specific, DynamoDB and Memcached files follow the rulings from Stories 41.1 and 42.5.

### Story 60.7: Database integration: queries, schema, connections and locks

As a Framework Agent,
I want the Database integration suites for the query builder, schema builder, connections, locks, the cache store and events ported,
So that Database works end to end through a booted app on SQLite and Postgres (FR-53 to FR-56, FR-60).

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Database/{QueryBuilderTest,QueryBuilderUpdateTest,QueryBuilderWhereLikeTest,QueryingWithEnumsTest,SchemaBuilderTest,SchemaBuilderSchemaNameTest,DatabaseConnectionsTest,DatabaseLockTest,DatabaseCacheStoreTest,DatabaseTransactionsTest,AfterQueryTest,ConnectionThreadsCountTest,DatabaseExplainTest,EventConnectionEstablishedTest,TimestampTypeTest,UniqueConstraintViolationTest,MigrateWithRealpathTest,MigrationServiceProviderTest,MigratorEventsTest,RefreshCommandTest}.php::*` and `tests/Integration/Migration/**`
**When** the harness runs it on `sqlite` and `pgsql`
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` reason.

### Story 60.8: Database integration: Eloquent relationships, Strict Loading and auto-eager-loading

As a Framework Agent,
I want the Eloquent relationship integration suites ported,
So that FR-62 and FR-63 are proven against Upstream's own integration tests.

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Database/{EloquentBelongsToManyTest,EloquentBelongsToTest,EloquentHasManyTest,EloquentHasManyThroughTest,EloquentHasOneIsTest,EloquentHasOneOfManyTest,EloquentThroughTest,EloquentMorph*Test,EloquentWhereHas*Test,EloquentWhereTest,EloquentWithCountTest,EloquentAggregateTest,EloquentEagerLoadingLimitTest,EloquentLazyEagerLoadingTest,EloquentMultiDimensionalArrayEagerLoadingTest,EloquentCollection*Test,EloquentModelLoad*Test,EloquentModelRelationAutoloadTest,EloquentStrictLoadingTest,EloquentTouchParentWithGlobalScopeTest,EloquentPivot*Test,EloquentCustomPivotCastTest}.php::*`
**When** the harness runs it on `sqlite` and `pgsql`
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` reason
**And** the `EloquentStrictLoadingTest` / `EloquentModelRelationAutoloadTest` adaptations follow DIV-2 and the AD-8 ruling.

### Story 60.9: Database integration: models, casts, events, pagination and the rest

As a Framework Agent,
I want the remaining Database integration suites ported,
So that Eloquent models, casts, transactions with `afterCommit`, pruning and pagination are proven end to end (FR-101, Global rules).

**Acceptance Criteria:**

**Given** the test scope: every `tests/Integration/Database/*.php` Test ID not covered by Stories 60.7 and 60.8, including the `Queue/` subdirectory
**When** the harness runs it on `sqlite` and `pgsql`
**Then** every Test ID passes, or carries a valid reason. Broadcasting and Queue dependents are `blocked-by:<c>`.

### Story 60.10: Database integration: engine-specific suites

As a Framework Agent,
I want the per-engine Database suites ported or deferred,
So that SQLite- and Postgres-specific behaviour is proven, and the other engines are honestly deferred (FR-101, Global rules).

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Database/{Sqlite,Postgres}/**`
**When** the harness runs it on the matching variant
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` reason.

**Given** `tests/Integration/Database/{MySql,MariaDb,SqlServer}/**`
**When** they are classified
**Then** each is `deferred:<engine>-driver`.

### Story 60.11: Http integration

As a Framework Agent,
I want the Http integration suites ported,
So that requests, responses, resources and throttling are proven through the full kernel (FR-101, Global rules).

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Http/**`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid reason that isn't `not-ported-yet` or `blocked-by:testbench`.

### Story 60.12: Routing integration

As a Framework Agent,
I want the Routing integration suites ported,
So that route binding, URL signing, fallback, redirects and middleware are proven through the full kernel (FR-101, Global rules).

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Routing/**`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid reason that isn't `not-ported-yet` or `blocked-by:testbench`.

### Story 60.13: Foundation integration

As a Framework Agent,
I want the Foundation integration suites ported (core aliases, event discovery, the exception handler, service providers, maintenance mode, configuration, testing),
So that Foundation's acceptance can complete (FR-101, Global rules).

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Foundation/**`, excluding `CloudBootstrapperTest` (which is `deferred:foundation-cloud`)
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` reason.

### Story 60.14: Generator integration

As a Framework Agent,
I want the `make:*` integration suites ported against the TypeScript reference files,
So that FR-71 is proven by Upstream's own generator tests.

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Generators/**`
**When** the harness runs it
**Then** each Test ID asserts against its Story 55.3 reference file (DIV-5), and passes or carries a valid reason
**And** the Queue and Notifications generators are `blocked-by:queue` / `blocked-by:notifications`.

### Story 60.15: Console integration

As a Framework Agent,
I want the Console integration suites ported (scheduling, command events, prompts assertions, env encryption),
So that FR-69, FR-70 and FR-72 are proven end to end.

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Console/**`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid reason. Job scheduling is `blocked-by:queue`.

### Story 60.16: Mail and Testing integration, and the Phase 7 gate

As a Framework Agent,
I want the Mail and Testing integration suites ported, and the `blocked-by:testbench` gate checked,
So that Phase 7 can complete (FR-101, Global rules).

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Mail/**` and `tests/Integration/Testing/**`, with one manifest each
**When** the harness runs it
**Then** every Test ID passes, or carries a valid reason that isn't `not-ported-yet` or `blocked-by:testbench`.

**Given** the whole Expectations File
**When** this Story's check runs
**Then** zero entries are `blocked-by:testbench`, and the check fails, listing them, if any remain.

## Epic 61: Skeleton, Installer & `@xaravel/framework`

An App Developer runs `bun create xaravel invoices` and gets a Laravel-shaped htmx app that passes its own suite on SQLite and Postgres (UJ-1, UJ-3).

**Covers:** FR-11, FR-15, FR-16, FR-17 (the layout and welcome page), FR-60. **Implements:** AD-2 (the meta-package lists every optional peer), AD-3 (`@xaravel/framework/<namespace>` imports).

**Kind:** Xaravel Components (Skeleton, Installer). Every acceptance criterion is verified by an `XT-skeleton-<n>` or `XT-installer-<n>` test.

### Story 61.1: `@xaravel/framework` meta-package

As an App Developer,
I want one package that brings every Component and the Laravel-namespaced import paths,
So that app code imports `@xaravel/framework/support/facades` as generated code does (FR-11, AD-3).

**Acceptance Criteria:**

**Given** `packages/framework`
**When** it is installed
**Then** it depends on every Component, with each optional peer listed as a real dependency (AD-2)
**And** it exports `@xaravel/framework/<namespace-kebab>` subpaths for every Upstream namespace, plus `@xaravel/framework/helpers` and the real-time facade paths (AD-3, AD-26).

**Given** every Story 55.3 reference file
**When** it is type-checked against `@xaravel/framework` alone
**Then** it compiles.

### Story 61.2: Laravel-shaped Skeleton

As an App Developer,
I want the Skeleton to mirror `laravel/laravel` at the Pin, in TypeScript,
So that I find everything where I expect it (FR-16, UJ-1).

**Acceptance Criteria:**

**Given** `skeleton/`
**When** it is inspected
**Then** it has:
- `app/Http/Controllers`, `app/Models/User.ts` and `app/Providers`;
- `bootstrap/app.ts` and `bootstrap/providers.ts` (which imports `@xaravel/htmx`);
- `config/*.ts`, mirroring `laravel/laravel`'s config files;
- `database/{migrations,factories,seeders}`, including the users, cache and jobs migrations;
- `resources/views`;
- `routes/{web,console}.ts`;
- `storage/` and `tests/`;
- the `artisan` entry.

**And** `package.json` depends on `@xaravel/framework` and declares the PSR-4 `autoload` map (FR-16, AD-10).

**Given** `.env.example`
**When** it is inspected
**Then** it uses Laravel's key names: `APP_*`, `DB_*`, `CACHE_STORE`, `QUEUE_CONNECTION`, `SESSION_DRIVER`, `MAIL_*`, `REDIS_*` and `LOG_CHANNEL` (FR-16 consequence).

**Given** the Skeleton's `bunfig.toml`, entry scripts and lint config
**When** they are inspected
**Then** `env = false` is set, every entry passes `--no-env-file`, and the thenable-return and floating-promise rules are on (AD-6, NFR-3).

### Story 61.3: htmx-ready layout and welcome page

As an App Developer,
I want the base layout to load htmx 4 with CSRF and a CSP nonce, and a welcome page with a working Fragment,
So that a new app is htmx-ready on first run (FR-17).

**Acceptance Criteria:**

**Given** the base layout
**When** a page renders
**Then** it loads `htmx.org@4.0.0` (an exact pin) through `@vite` or a nonce'd script tag
**And** it sets `hx-headers:inherited` with the CSRF token on `<body>`, so every htmx Request carries the token (FR-17 consequence, FR-32).

**Given** the welcome page
**When** its htmx control is triggered
**Then** a partial request returns a Fragment, and htmx swaps it in. A Skeleton feature test verifies this with `assertFragment` (FR-17 consequence).

### Story 61.4: Skeleton test suite on SQLite and Postgres

As an App Developer,
I want the Skeleton's own tests to pass on SQLite and on Postgres in CI,
So that changing only `.env` is proven to work (FR-60, UJ-3).

**Acceptance Criteria:**

**Given** the Skeleton's Pest-style tests (welcome page, Fragment request, user factory and database assertions, an example validation flow)
**When** CI runs them with `DB_CONNECTION=sqlite` and again with `DB_CONNECTION=pgsql`
**Then** both runs pass (FR-60 consequence).

**Given** UJ-1's path (create the app, `bun artisan serve`, `make:model Invoice -mfc`, `migrate`), run end to end by a CI job on a fresh directory
**When** it completes
**Then** the welcome page answers 200, the generated files compile, and the migration has run.

### Story 61.5: Installer

As an App Developer,
I want `bun create xaravel <name>` to scaffold the Skeleton,
So that starting an app takes one command (FR-15, UJ-1).

**Acceptance Criteria:**

**Given** `bun create xaravel invoices`
**When** it runs
**Then** it offers SQLite (the default) or Postgres, copies the Skeleton, installs dependencies, runs `key:generate`, initialises git with a first commit, and prints the next steps (FR-15 consequences).

**Given** Bun older than 1.4
**When** the Installer starts
**Then** it exits with a non-zero code, before writing anything, and prints the upgrade command (FR-15 consequence).

**Given** the Installer's post-install steps
**When** they are defined
**Then** they are a list that later Epics can add to. Epic 69 adds the `boost:install` offer.

### Story 61.6: Production entry and deployment guide

As an App Developer,
I want a production server entry and a deployment guide,
So that the app runs in production as UJ-3 describes (FR-27, the spine's Deferred table).

**Acceptance Criteria:**

**Given** the Skeleton's production entry (`server.ts`)
**When** it starts with `APP_ENV=production`
**Then** it boots once, serves through `serve()`, and drains on SIGTERM.

**Given** the deployment guide
**When** it is read
**Then** it covers environment keys, `migrate --force`, `optimize`, `queue:work` and the scheduler, plus a process-manager example, and states the non-affiliation notice (NFR-8).

**Given** the Skeleton and Installer
**When** this Epic closes
**Then** `xt:coverage skeleton` and `xt:coverage installer` report every FR-15, FR-16, FR-17 (non-auth) and FR-60 consequence covered.

## Epic 62: Queue

App Developers dispatch jobs, chains, batches and closures on the sync, database and redis drivers, and run supervised workers.

**Covers:** FR-85, FR-86, FR-87, FR-88; also FR-71 (`queue:table`, `queue:failed-table`, `queue:batches-table`). **Implements:** AD-13, AD-14, AD-24, AD-20 (blocking pops on leases).

**Kind:** Upstream Component, with selector test scope under `tests/Queue/` and `tests/Integration/Queue/`. The Testbench (Phase 7) is available, so integration tests run directly.
- **Variants:** `none`, `queue-database@sqlite`, `queue-database@pgsql` and `queue-redis@redis`.
- SQS and Beanstalkd are `deferred:sqs` and `deferred:beanstalkd`.

### Story 62.1: Job payloads, model serialization and the sync driver

As an App Developer,
I want job classes queued in Laravel's JSON envelope, with `SerializesModels` and the sync driver,
So that payloads are Laravel-shaped and models arrive rehydrated in `handle()` (FR-85, AD-24).

**Acceptance Criteria:**

**Given** the test scope `tests/Queue/{QueueSyncQueueTest,QueueManagerTest,QueueAttributesTest,QueueRoutesTest,InteractsWithQueueTest,QueueExceptionTest,BeforeCommitContractTest}.php::*` and `tests/Integration/Queue/{ModelSerializationTest,CallQueuedHandlerTest,CustomPayloadTest,PreparesForDispatchTest,JobEncryptionTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a job holding a model
**When** it is queued
**Then** the payload has Upstream's envelope fields, with `data.command = phpSerialize(job)` and the model as a `ModelIdentifier`
**And** the worker runs a sync `phpUnserialize`, then `await restoreModels(job)`, before `handle()` (AD-24).

**Given** a payload produced by PHP Laravel for the same job class FQCN (an Oracle fixture)
**When** it is decoded
**Then** it yields the same command properties.

**Given** Context set when a job is dispatched
**When** the job runs
**Then** Context is restored from `illuminate:log:context` (FR-81 consequence).

### Story 62.2: Database and Redis drivers and failed jobs

As an App Developer,
I want the `database` and `redis` queue drivers, the failover queue and the failed-job providers,
So that the alpha's production queues work as in Laravel (FR-85).

**Acceptance Criteria:**

**Given** the test scope `tests/Queue/{QueueDatabaseQueueUnitTest,QueueDatabaseQueueIntegrationTest,QueueRedisQueueTest,QueueRedisJobTest,DatabaseFailedJobProviderTest,DatabaseUuidFailedJobProviderTest,FileFailedJobProviderTest,FailoverQueueTest}.php::*` and `tests/Integration/Queue/{RedisQueueTest,QueueConnectionTest,QueueDelayTest,QueueSizeTest}.php::*`
**When** the harness runs it on every queue variant
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** two workers popping from one `database` queue concurrently
**When** jobs are reserved
**Then** no job is reserved twice, because reservations use `lockForUpdate` on a lease (AD-20).

**Given** a blocking Redis pop
**When** it waits
**Then** it waits on a duplicated client leased to the worker's frame, and other units' commands are unaffected.

### Story 62.3: Workers, the timeout supervisor and queue commands

As an App Developer,
I want `queue:work` / `queue:listen` with `--queue`, `--tries`, `--max-jobs`, `--max-time` and `--timeout`, graceful SIGTERM, `queue:restart`, `queue:retry`, the failed-job and batch commands, and the table generators,
So that running queues in production works as in Laravel (FR-86, FR-71).

**Acceptance Criteria:**

**Given** the test scope `tests/Queue/{QueueWorkerTest,QueueListenerTest,QueuePauseResumeTest,QueueRetryCommandTest,QueueClearCommandTest,QueueListFailedCommandTest,ListFailedCommandTest,QueueForgetFailedCommandTest,RetryBatchCommandTest,PruneBatchesCommandTest}.php::*` and `tests/Integration/Queue/{WorkCommandTest,QueueRestartCommandTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `queue:work --timeout=2` and a job that runs a sync loop for 5 seconds
**When** the timeout elapses
**Then** the supervisor kills the child, records the attempt with `TimeoutExceededException`, and starts a new child (AD-13)
**And** the timeout tests use a spawned fixture app and are marked `adapted:DIV-11.<k>`.

**Given** SIGTERM to `queue:work`
**When** a job is running
**Then** the worker finishes that job and exits, as Upstream does.

**Given** `queue:table`, `queue:failed-table` and `queue:batches-table`
**When** they run
**Then** they generate migrations equal to their Story 55.3 references.

### Story 62.4: Chains, batches, job middleware, unique and rate-limited jobs

As an App Developer,
I want `Bus.chain`, `Bus.batch` with progress and callbacks, job middleware (`RateLimited`, `ThrottlesExceptions`, `WithoutOverlapping`, `Skip`, `FailOnException`), unique and debounced jobs, and `Queue.fake()` / `Bus.fake()`,
So that multi-job workflows run as in Laravel (FR-87).

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Queue/{JobChainingTest,UniqueJobTest,UniqueUntilProcessingJobTest,DebouncedJobTest,DebouncedListenerTest,RateLimitedTest,RateLimitedWithRedisTest,ThrottlesExceptionsTest,ThrottlesExceptionsWithRedisTest,ReleaseMiddlewareTest,SkipMiddlewareTest,SkipIfBatchCancelledTest,WithoutOverlappingJobsTest,FailOnExceptionMiddlewareTest,JobDispatchingTest,QueueFakeTest,QueuedListenersTest,DeleteModelWhenMissingTest,DeleteMailableWhenMissingModelTest}.php::*`
**When** the harness runs it on every queue variant
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `tests/Integration/Queue/DynamoBatchTest.php`
**When** it is classified
**Then** it follows the Story 42.5 ruling on DynamoDB.

### Story 62.5: Dispatching closures

As an App Developer,
I want `dispatch(async ({ podcast }) => podcast.publish(), { podcast })` to queue, sign and run safely,
So that queued closures work within DIV-4's rules (FR-88).

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Queue/SerializableClosureV1QueueTest.php::*`
**When** the harness runs it
**Then** each Test ID passes, or carries a valid reason under DIV-4.

**Given** a queued closure
**When** its payload is inspected
**Then** it carries the source and arguments, signed with `APP_KEY` (FR-88 consequence).

**Given** a payload whose signature was altered
**When** a worker picks it up
**Then** the job fails with `InvalidSignatureException` and the source is never evaluated (FR-88 consequence).

**Given** a closure that captures an outer variable
**When** `dispatch` is called
**Then** it throws at dispatch with the explanatory error (FR-88 consequence).

**Given** a rebuilt closure on the worker
**When** it reads a global other than its arguments, the ES built-ins, or facades and helpers
**Then** it throws (FR-88 consequence).

### Story 62.6: Non-alpha drivers and the `blocked-by:queue` sweep

As a Framework Agent,
I want the SQS, Beanstalkd and DynamoDB suites classified, and every `blocked-by:queue` entry re-verified,
So that Queue's Phase can complete (Global rules).

**Acceptance Criteria:**

**Given** the test scope `tests/Queue/{QueueSqsConnectorTest,QueueSqsQueueTest,QueueSqsJobTest,QueueBeanstalkdQueueTest,QueueBeanstalkdJobTest,DynamoDbFailedJobProviderTest}.php::*`
**When** they are classified
**Then** they are `deferred:sqs`, `deferred:beanstalkd`, or the Story 42.5 DynamoDB ruling.

**Given** every Expectations entry with `blocked-by:queue`, including those from Stories 20.6, 29.3, 32.x, 33.3, 38.6, 56.4 and 60.x, with one manifest per owning Component
**When** they are re-verified
**Then** each passes, or carries a valid reason that names a later Component.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate queue` passes, `async-surface.json` is committed, and the Queue docs (with Divergences: DIV-4, DIV-11 timeouts) are written.

## Epic 63: Concurrency

App Developers run tasks concurrently with `Concurrency.run()`, under DIV-4.

**Covers:** FR-82. **Kind:** Upstream Component, with selector test scope under `tests/Integration/Concurrency/`.

### Story 63.1: Concurrency drivers

As an App Developer,
I want `Concurrency.run([...])` and `Concurrency.defer([...])` on the `process` and `sync` drivers,
So that independent work runs in parallel, as in Laravel (FR-82).

**Acceptance Criteria:**

**Given** the test scope `tests/Integration/Concurrency/{ConcurrencyTest,Console/InvokeSerializedClosureCommandTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** the `process` driver
**When** tasks run
**Then** each task is serialized with the serializable-closure codec and run by `bun artisan invoke-serialized-closure` in a child process, and the results come back in key order.

**Given** a task closure that captures outer variables
**When** `run` is called
**Then** it fails at the call site (DIV-4).

**Given** the `fork` driver, which depends on `pcntl` / spatie/fork
**When** it is classified
**Then** the agent raises an Escalation proposing `php-only` under DIV-6, or a mapping onto the `process` driver.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate concurrency` passes and the docs are written.

## Epic 64: Broadcasting

App Developers broadcast events to authorized channels through the log, null and Pusher-protocol drivers.

**Covers:** FR-91. **Kind:** Upstream Component, with selector test scope. No WebSocket server is built (it would be the equivalent of Reverb, NG-5).

### Story 64.1: Broadcast manager, channels and authorization

As an App Developer,
I want `ShouldBroadcast` events, `broadcast()`, the channel routes in `routes/channels.ts` with authorization callbacks, and the log and null drivers,
So that broadcasting is defined as in Laravel (FR-91).

**Acceptance Criteria:**

**Given** the test scope `tests/Broadcasting/{BroadcasterTest,BroadcastEventTest,UsePusherChannelsNamesTest}.php::*` and `tests/Integration/Broadcasting/{BroadcastManagerTest,SendingBroadcastsViaAnonymousEventTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `broadcast(new OrderShipped(order)).toOthers()`, not awaited
**When** the unit ends
**Then** the `PendingBroadcast` terminal has run once, and the frame awaited it (AD-6).

**Given** an async channel authorization callback
**When** a private-channel auth request arrives
**Then** the callback is awaited, and the response matches Upstream's.

### Story 64.2: Pusher-protocol and Redis broadcasters

As an App Developer,
I want the Pusher-protocol broadcaster (signed HTTP API calls over `fetch`) and the Redis broadcaster,
So that broadcasts reach Pusher-compatible servers, Soketi for example (FR-91).

**Acceptance Criteria:**

**Given** the test scope `tests/Broadcasting/{PusherBroadcasterTest,RedisBroadcasterTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** Upstream's Pusher tests, which mock the Pusher PHP SDK
**When** they are translated
**Then** the agent raises an Escalation proposing an adaptation clause that targets Xaravel's Pusher client. Those Test IDs stay `not-ported-yet` until the ruling.

**Given** a broadcast to a Pusher-protocol test server (Xaravel Test)
**When** it is sent
**Then** the HTTP request's auth signature verifies, and the event arrives.

### Story 64.3: Other broadcasters and the `blocked-by:broadcasting` sweep

As a Framework Agent,
I want the Ably and Mercure suites classified, and every `blocked-by:broadcasting` entry re-verified,
So that Broadcasting's Phase can complete (FR-91, FR-3).

**Acceptance Criteria:**

**Given** the test scope `tests/Broadcasting/{AblyBroadcasterTest,CachingTokenProviderTest,MercureBroadcasterTest,MercureChannelEncrypterTest}.php::*` and `tests/Integration/Broadcasting/MercureFrankenPhpHubTest.php::*`
**When** they are classified
**Then** the agent raises an Escalation asking the Maintainer to add `deferred:ably` and `deferred:mercure`, or to rule otherwise.

**Given** every `blocked-by:broadcasting` entry (Stories 33.3, 55.2, 60.9, …), with one manifest per owning Component
**When** they are re-verified
**Then** each passes, or carries a valid reason.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate broadcasting` passes and the docs are written.

## Epic 65: Notifications

App Developers send notifications over the mail, database and broadcast channels, on demand or queued.

**Covers:** FR-90; also FR-71 (`notifications:table`). **Kind:** Upstream Component, with selector test scope.

### Story 65.1: Channel manager, sender, on-demand and queued notifications

As an App Developer,
I want `user.notify(...)`, `Notification.send(...)`, `Notification.route(...)` (on demand), `ShouldQueue` notifications and `Notification.fake()`,
So that notifications dispatch as in Laravel (FR-90).

**Acceptance Criteria:**

**Given** the test scope `tests/Notifications/{NotificationChannelManagerTest,NotificationSenderTest,NotificationSendQueuedNotificationTest,NotificationRoutesNotificationsTest,NotificationActionTest,NotificationMessageTest}.php::*` and `tests/Integration/Notifications/SendingNotificationsViaAnonymousNotifiableTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `via` declared as a method or as a property
**When** channels are resolved
**Then** both forms work (an option pair, AD-26).

**Given** `SupportTestingNotificationFakeTest` (`blocked-by:notifications` since Story 20.6) and `tests/Integration/Queue/DeleteNotificationWhenMissingModelTest.php`
**When** this Story re-verifies them, with `component: support` and `component: queue`
**Then** they pass, or carry a valid reason.

### Story 65.2: Mail channel and MailMessage

As an App Developer,
I want `toMail()` with `MailMessage` (lines, actions, Markdown) or a Mailable, with locale support,
So that mail notifications render as in Laravel (FR-90).

**Acceptance Criteria:**

**Given** the test scope `tests/Notifications/NotificationMailMessageTest.php::*` and `tests/Integration/Notifications/{SendingMailNotificationsTest,SendingMailableNotificationsTest,SendingNotificationsWithLocaleTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a `MailMessage` notification
**When** it renders
**Then** the HTML matches the Oracle's output for the same notification.

### Story 65.3: Database and broadcast channels

As an App Developer,
I want the `database` channel (with `DatabaseNotification` and read/unread), the `broadcast` channel and `notifications:table`,
So that in-app notifications work as in Laravel (FR-90, FR-71).

**Acceptance Criteria:**

**Given** the test scope `tests/Notifications/{NotificationDatabaseChannelTest,NotificationBroadcastChannelTest}.php::*` and `tests/Integration/Notifications/DatabaseNotificationTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** `notifications:table`
**When** it runs
**Then** the generated migration equals its Story 55.3 reference
**And** the `blocked-by:notifications` generator tests (Story 60.14) are re-verified with `component: foundation`.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate notifications` passes and the docs are written.

## Epic 66: Auth

App Developers authenticate users, authorize with gates and policies, reset passwords and verify email.

**Covers:** FR-92, FR-93, FR-94, FR-95. **Implements:** AD-5 (guards and the Gate user resolver as frame slots), AD-6 (the authenticated user is loaded once, then sync; Gate checks are async).

**Kind:** Upstream Component, with selector test scope under `tests/Auth/` and `tests/Integration/Auth/`. **Needs:** Epic 65.

### Story 66.1: Guards and user providers

As an App Developer,
I want session and token guards, the `eloquent` and `database` user providers, `Auth.attempt` / `login` / `logout` / `once`, remember-me and `logoutOtherDevices`,
So that authentication works as in Laravel (FR-92).

**Acceptance Criteria:**

**Given** the test scope `tests/Auth/{AuthGuardTest,AuthTokenGuardTest,AuthEloquentUserProviderTest,AuthDatabaseUserProviderTest,AuthenticatableTest}.php::*` and `tests/Integration/Auth/{AuthenticationTest,RehashOnLogoutOtherDevicesTest,ApiAuthenticationWithEloquentTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a request after `StartSession`, with the guard's user resolved into the frame
**When** a controller calls `request.user()`, `Auth.user()`, `Auth.check()` or `Auth.id()`
**Then** each is synchronous (AD-6).

**Given** a guard that was never resolved
**When** `Auth.guard('api').user()` is read
**Then** it throws `AuthGuardNotResolvedException`, pointing to `await Auth.guard('api').authenticate()`.

**Given** two concurrent requests for different users
**When** they interleave at every `await`
**Then** neither sees the other's user (NFR-4).

### Story 66.2: Authentication middleware and password confirmation

As an App Developer,
I want the `auth`, `auth:<guard>`, `guest` and `password.confirm` middleware,
So that routes are protected as in Laravel (FR-92).

**Acceptance Criteria:**

**Given** the test scope `tests/Auth/{AuthenticateMiddlewareTest,RedirectIfAuthenticatedMiddlewareTest}.php::*` and `tests/Integration/Auth/Middleware/{RequirePasswordTest,RedirectIfAuthenticatedTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** an unauthenticated htmx Request to an `auth` route
**When** it is redirected to login
**Then** the redirect goes through the htmx path (200 with `HX-Location`), because the htmx Integration decorates the Redirector (FR-41).

### Story 66.3: Gates, policies and authorization responses

As an App Developer,
I want `Gate.define`, `Gate.allows` / `denies` / `authorize` / `inspect`, policies by convention or by registration, `before` / `after` hooks, `can()`, the `can` middleware and `Response.deny()`,
So that authorization works as in Laravel (FR-93).

**Acceptance Criteria:**

**Given** the test scope `tests/Auth/{AuthAccessGateTest,AuthAccessResponseTest,AuthHandlesAuthorizationTest,AuthorizeMiddlewareTest,AuthorizesResourcesTest}.php::*` and `tests/Integration/Auth/GatePolicyResolutionTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a gate or policy method that returns a Promise
**When** `Gate.allows(...)` is called
**Then** it returns `Promise<boolean>`. Lint rejects a non-awaited `Gate.allows` used as a condition (AD-6, `no-misused-promises`).

**Given** `App\Models\Post`
**When** its policy is guessed
**Then** `App\Policies\PostPolicy` is found through `fqcn()` and the PSR-4 map (FR-93 consequence, AD-10).

**Given** `Gate.define` called at runtime inside a request
**When** a concurrent request checks the gate
**Then** it doesn't see the definition (frame overlay, AD-5).

### Story 66.4: Password reset

As an App Developer,
I want the password broker, with reset tokens, throttling, the reset notification and token expiry,
So that "forgot password" works as in Laravel (FR-94).

**Acceptance Criteria:**

**Given** the test scope `tests/Auth/{AuthPasswordBrokerTest,AuthPasswordBrokerManagerTest,AuthDatabaseTokenRepositoryTest}.php::*` and `tests/Integration/Auth/{ForgotPasswordTest,ForgotPasswordWithoutDefaultRoutesTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a token created by PHP Laravel's broker with the same key (an Oracle fixture)
**When** Xaravel validates it
**Then** it validates. Token hashing uses the `Hasher`, as Upstream does.

### Story 66.5: Email verification and the `blocked-by:auth` sweep

As an App Developer,
I want `MustVerifyEmail`, signed verification URLs, the `SendEmailVerificationNotification` listener and the `verified` middleware,
So that email verification works as in Laravel (FR-95).

**Acceptance Criteria:**

**Given** the test scope `tests/Auth/{EnsureEmailIsVerifiedTest,AuthListenersSendEmailVerificationNotificationHandleFunctionTest}.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** an unverified user
**When** they request a `verified` route
**Then** they are redirected to the verification notice, and a tampered verification URL gets 403.

**Given** every `blocked-by:auth` entry (Stories 17.2, 43.6, 45.2, 49.4, 51.6, …), with one manifest per owning Component
**When** they are re-verified
**Then** each passes, or carries a valid reason.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate auth` passes, `async-surface.json` is committed, and the Auth docs (authentication, authorization, password reset, verification) are written.

## Epic 67: Image

App Developers use Laravel 13's Image API through `Bun.Image`.

**Covers:** FR-84 (Image). **Kind:** Upstream Component, with selector test scope under `tests/Image/` and `tests/Integration/Image/`.

### Story 67.1: Image API and manager

As an App Developer,
I want Laravel 13's Image API (load, resize, crop, encode, optimise, store) and its manager, on a `Bun.Image` driver,
So that image handling works without PHP extensions (FR-84).

**Acceptance Criteria:**

**Given** the test scope `tests/Image/{ImageTest,ImageManagerTest}.php::*` and `tests/Integration/Image/ImageTest.php::*`
**When** the harness runs it
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** an operation whose output pixels are asserted
**When** `Bun.Image` produces them
**Then** dimensions, formats and metadata match Upstream exactly
**And** a byte-level difference in an encoded image raises an Escalation proposing a tolerance clause, rather than weakening the assertion.

### Story 67.2: The GD and Imagick driver suites

As a Framework Agent,
I want the GD and Imagick driver suites classified,
So that Image's Test IDs leave `not-ported-yet` honestly.

**Acceptance Criteria:**

**Given** the test scope `tests/Image/Drivers/{GdDriverTest,ImagickDriverTest}.php::*`
**When** they are classified
**Then** the agent raises an Escalation proposing either `php-only` under DIV-6 (PHP extensions) or an adaptation onto the `Bun.Image` driver.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate image` passes and the docs are written.

## Epic 68: MCP

App Developers define MCP servers with Tools, Resources and Prompts, over HTTP (guarded) or stdio.

**Covers:** FR-104. **Built on:** `@modelcontextprotocol/server` 2.3.1.

**Kind:** Upstream Component (`laravel/mcp`).
- The test scope is given as selectors against `conformance/upstream/mcp/tests/**`, with Pest Test IDs.
- OAuth through Passport or Sanctum is `out-of-scope:NG-5` (OQ-6).

### Story 68.1: Servers, Tools, Resources and Prompts

As an App Developer,
I want `Server` classes with Tools (with JSON Schema input), Resources and Prompts, as `laravel/mcp` defines them,
So that I can expose app capabilities to AI agents (FR-104).

**Acceptance Criteria:**

**Given** the Pest suites under `conformance/upstream/mcp/tests/` for servers, tools, resources and prompts
**When** the harness runs them
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** a Tool's input schema, built with `@xaravel/json-schema`
**When** the server lists its tools
**Then** the schema JSON matches Upstream's.

### Story 68.2: HTTP and stdio transports, with guards

As an App Developer,
I want `Mcp.web('/mcp', Server)` on a Xaravel route (streamable HTTP) and `Mcp.local('name', Server)` over stdio through `bun artisan mcp:start`,
So that MCP servers run the Laravel way (FR-104).

**Acceptance Criteria:**

**Given** the `laravel/mcp` transport and conformance suites
**When** the harness runs them
**Then** every Test ID passes, or carries a valid reason. The OAuth suites are `out-of-scope:NG-5`.

**Given** `Mcp.web(...).middleware('auth:api')`
**When** a request fails the guard
**Then** it is rejected with 401, and a request that passes reaches the server (FR-104 consequence).

**Given** `Mcp.local(...)`
**When** an MCP client connects over stdio
**Then** tools are listed and called, with each call run as a unit frame.

### Story 68.3: MCP testing helpers and inspector

As an App Developer,
I want `laravel/mcp`'s test helpers (calling tools, asserting responses) and `mcp:inspector`,
So that MCP servers are testable as in Laravel (FR-104).

**Acceptance Criteria:**

**Given** the `laravel/mcp` testing suites
**When** the harness runs them
**Then** every Test ID passes, or carries a valid non-`not-ported-yet` Skip Reason.

**Given** the package
**When** the Epic closes
**Then** `api-surface:gate mcp` passes against `laravel/mcp`'s surface, and the docs are written.

## Epic 69: Boost app tools

App Agents introspect a Xaravel app (routes with Fragments, schema, last error, commands) and run its tests with structured failures, safely by default (UJ-6).

**Covers:** FR-105, FR-106, FR-107, FR-110. **Built on:** Epic 68.

**Kind:** Xaravel Component.
- Applicable `laravel/boost` Pest tests are ported, under selectors against `conformance/upstream/boost/tests/**`. Everything else is verified by `XT-boost-<n>` tests.
- Documentation search (FR-108) and record-rule are post-alpha (`deferred:boost-docs-search`, `deferred:boost-record-rule`).
- Boost adds provider-level hooks only, and never edits producer packages (the spine's Deferred table).

### Story 69.1: `boost:install` and agent guidelines

As an App Developer,
I want `bun artisan boost:install` to register Boost with my coding agents and write versioned guidelines and skills,
So that agents working in my repo know Xaravel's conventions (FR-105).

**Acceptance Criteria:**

**Given** the applicable `laravel/boost` install suites
**When** the harness runs them
**Then** each Test ID passes, or carries a valid reason.

**Given** `boost:install`
**When** it runs in a Skeleton app
**Then** it writes MCP config for the selected agents, plus `CLAUDE.md` / `AGENTS.md` guidelines and skills pinned to the installed Xaravel version, covering the DIVs, the async rules and the htmx conventions.

**Given** the Installer's post-install list (Story 61.5)
**When** this Story merges
**Then** `bun create xaravel` offers to run `boost:install` (FR-105 consequence).

### Story 69.2: App, route, container and config introspection

As an App Agent,
I want tools for application info, routes (with Fragment-returning routes marked), container bindings, config keys, absolute URLs and the CLI command list,
So that I never have to guess the app's structure (FR-106, UJ-6).

**Acceptance Criteria:**

**Given** each tool
**When** it is called against a fixture app
**Then** it returns the output schema decided in this Story and recorded in the Boost docs (the spine's Deferred table)
**And** the data comes only from Upstream public APIs (`getBindings`, the route collection, the console kernel).

**Given** a route whose action returns `view(...).fragment(...)`, or that declares `.fragment(...)`
**When** the route list is produced
**Then** the route is marked as Fragment-returning.

### Story 69.3: Database, logs, last error and browser logs

As an App Agent,
I want database connection and schema tools, read-only queries (once enabled), log entries, the last error and browser logs,
So that I can diagnose bugs from evidence (FR-106, FR-110).

**Acceptance Criteria:**

**Given** the database schema tool
**When** it is called
**Then** it returns tables, columns, indexes and foreign keys from Schema introspection.

**Given** the read-only query tool, enabled
**When** a statement other than `SELECT`, `WITH … SELECT` or `EXPLAIN` is submitted, or a select with side effects
**Then** it is refused. Allowed queries run inside a transaction that is always rolled back (the read-only enforcement in the spine's Deferred table).

**Given** the last-error and log tools
**When** an exception is reported
**Then** it is captured through the exception handler's `reportable` hook and log taps, without editing Foundation.

### Story 69.4: Test-run tool

As an App Agent,
I want to run the app's tests, or a filtered subset, and get structured failures,
So that I can verify a fix without parsing terminal output (FR-107).

**Acceptance Criteria:**

**Given** the test-run tool with a filter
**When** a test fails
**Then** the result lists each failure with its test name, the assertion, the expected and actual values and the file location (FR-107).

**Given** a passing run
**When** the tool returns
**Then** it reports the counts and the duration.

### Story 69.5: Safe by default

As an App Developer,
I want Boost read-only by default, with query, eval and write tools enabled explicitly and refused in production,
So that installing Boost never endangers data (FR-110).

**Acceptance Criteria:**

**Given** a default config
**When** an agent lists tools
**Then** only read-only tools are offered.

**Given** the query, eval (tinker) or write tools, enabled in config
**When** `APP_ENV=production`
**Then** every call is refused with an explanatory error (FR-110).

**Given** the Boost package
**When** the Epic closes
**Then** `xt:coverage boost` reports every FR-105, FR-106, FR-107 and FR-110 consequence covered, and the Boost docs are written.

## Epic 70: Skeleton htmx auth pages & dashboard

A new app ships working htmx login, registration and password-reset pages and an authenticated dashboard. This meets the OQ-2 trigger for 13.x versioning.

**Covers:** FR-17 (auth, OQ-10). **Kind:** Xaravel Component (Skeleton). Every acceptance criterion is verified by an `XT-skeleton-<n>` test.

### Story 70.1: htmx auth pages

As an App Developer,
I want login, registration, password reset and logout pages built with htmx Fragments,
So that a new app has working auth on first run (FR-17, OQ-10).

**Acceptance Criteria:**

**Given** the Skeleton's auth routes, controllers, Form Requests and views
**When** a user registers, logs in, requests a password reset and resets their password through htmx forms (Skeleton feature tests on SQLite and Postgres)
**Then** each invalid submission returns the form Fragment with 422 and errors
**And** each valid submission navigates with `HX-Location`, while logout uses `.hxRedirect()` for a full reload.

**Given** the same pages without JavaScript
**When** the forms submit normally
**Then** they work through Laravel's redirect-back flow.

### Story 70.2: Authenticated dashboard

As an App Developer,
I want an authenticated dashboard with an example Fragment-driven panel,
So that the starter site shows the whole Xaravel stack (FR-17).

**Acceptance Criteria:**

**Given** a logged-in user
**When** they open `/dashboard`
**Then** the page renders behind the `auth` (and optionally `verified`) middleware, and its panel refreshes through a partial htmx Request.

**Given** a guest
**When** they open `/dashboard`
**Then** they are redirected to login.

**Given** `bun create xaravel` with these pages
**When** the Skeleton suite passes on both databases
**Then** the OQ-2 condition ("`bun create xaravel` produces a working starter site with auth and a dashboard") is met. The Maintainer records it in `decisions/OQ-2-TRIGGER.md`.

### Story 70.3: Phase 8 sweep and alpha-gate readiness

As the Maintainer,
I want proof that Phases 1–8 leave nothing `not-ported-yet` or `blocked-by`, and that every Phase 1–8 Component has user docs,
So that the public alpha can be judged on evidence (SM-1, PRD §7.2).

**Acceptance Criteria:**

**Given** the test scope: every remaining `blocked-by:<c>` entry for a Phase 8 Component, with one manifest per owning Component
**When** it is re-verified
**Then** each passes, or carries a valid reason that is neither `blocked-by` nor `not-ported-yet`.

**Given** the Expectations File
**When** the alpha-readiness check runs
**Then** zero entries for Phase 1–8 Components are `not-ported-yet` or `blocked-by`
**And** the dashboard's SM-1 figure (Applicable Test IDs passing on every alpha variant) is reported against the 90% gate.

**Given** every Phase 1–8 package
**When** the docs check runs
**Then** each has a `docs/` page that mirrors its Laravel 13 page, with a Divergences section (NFR-9), and the check fails, listing any that are missing.

## Epic 71: Browser tests (post-alpha, outline)

App Developers drive a real browser against htmx pages with a Pest 4-style API on Playwright.

**Covers:** FR-102. **Status:** outline only (Maintainer decision, 2026-10-16). Acceptance criteria are written at Phase 9 planning, after the post-alpha Pin bump.

### Story 71.1: `visit()` and the browser test lifecycle on Playwright

As an App Developer,
I want `visit('/login')` inside Pest-style tests, with a Playwright browser bound to the running test app,
So that I can test pages as a user sees them (FR-102).

**Acceptance Criteria:** written at Phase 9 planning. They must cover headless CI runs (FR-102 consequence).

### Story 71.2: Interactions, assertions, screenshots and device emulation

As an App Developer,
I want `type`, `click`, `assertSee`, `assertUrlIs`, screenshots and device emulation,
So that browser tests read like Pest 4's (FR-102).

**Acceptance Criteria:** written at Phase 9 planning.

### Story 71.3: Assertions after htmx swaps settle

As an App Developer,
I want assertions to wait for htmx 4 swaps to settle,
So that htmx pages can be tested without timing hacks (FR-102 consequence).

**Acceptance Criteria:** written at Phase 9 planning.

## Epic 72: AI SDK (post-alpha, outline)

App Developers define AI Agents with tools, streaming, embeddings and fakes, on the Vercel `ai` SDK. The `laravel/ai` Test IDs leave `deferred:ai-sdk`.

**Covers:** FR-103. **Status:** outline only. The scope is `conformance/upstream/ai/tests/**` (about 338 test files).

### Story 72.1: Agent classes, tools and structured output

As an App Developer, I want Agent classes with tools, provider tools, middleware and structured output, so that AI features are defined the Laravel way (FR-103).

**Acceptance Criteria:** written at Phase 9 planning.

### Story 72.2: Streaming, including the Vercel data protocol

As an App Developer, I want streamed agent responses, so that htmx and SSE clients receive tokens as they arrive (FR-103).

**Acceptance Criteria:** written at Phase 9 planning.

### Story 72.3: Embeddings, reranking, images, audio and files

As an App Developer, I want the non-chat modalities, so that the whole `laravel/ai` surface is available (FR-103).

**Acceptance Criteria:** written at Phase 9 planning.

### Story 72.4: Conversation memory, provider failover and `AI.fake()`

As an App Developer, I want database-backed conversation memory, failover across providers, and fakes, so that AI features are reliable and testable (FR-103).

**Acceptance Criteria:** written at Phase 9 planning. They must cover conversation memory stored in database tables (FR-103 consequence).

## Epic 73: Boost documentation search (post-alpha, outline)

App Agents search the installed version's docs offline.

**Covers:** FR-108. **Status:** outline only.

### Story 73.1: Versioned local docs index shipped with the package

As an App Agent, I want a docs index built from the installed Xaravel version, so that answers match the code in front of me (FR-108).

**Acceptance Criteria:** written at Phase 9 planning.

### Story 73.2: Offline search tool

As an App Agent, I want a Boost tool that searches the local index with no network access, so that docs search works anywhere (FR-108 consequences).

**Acceptance Criteria:** written at Phase 9 planning.

## Epic 74: Laravel 14 re-sync (post-alpha, outline)

Xaravel moves its Baseline Pin to Laravel 14, and the Inventory diff becomes backlog (PRD §5.3).

**Covers:** FR-7, applied to a major version. **Status:** outline only. The other post-alpha items become Phase 9 Stories in their owning Epics' packages: the MySQL, MariaDB and SQL Server drivers, Redis Cluster, SQS and Beanstalkd, extra mail transports, `email:spoof`, Windows and Foundation Cloud.

### Story 74.1: Laravel 14 pin bump and Inventory diff

As the Maintainer, I want the pin-bump tool run against the first Laravel 14 tag at a freeze point, so that added, changed and removed Test IDs become backlog (FR-7).

**Acceptance Criteria:** written at Phase 9 planning.

### Story 74.2: Divergence and contract review for Laravel 14

As the Maintainer, I want every DIV record and `@xaravel/contracts` reviewed against Laravel 14's changes, through Escalations, so that the parity rule still holds (PRD §5.1, FR-114).

**Acceptance Criteria:** written at Phase 9 planning.

### Story 74.3: Versioning switch

As the Maintainer, I want Xaravel's major version to mirror Laravel's, under the OQ-2 decision, so that "Xaravel 14 targets Laravel 14" (PRD §5.3).

**Acceptance Criteria:** written at Phase 9 planning.
