---
id: SPEC-xaravel
companions:
  - capability-map.md
  - ../../planning-artifacts/prds/prd-xaravel-2026-10-15/prd.md
  - ../../planning-artifacts/prds/prd-xaravel-2026-10-15/addendum.md
  - ../../planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Xaravel: Laravel 13 in TypeScript on Bun, for htmx 4

## Why

This is a vision, held to a measurable standard. Xaravel is Laravel, written in TypeScript and running natively on Bun, with server-rendered htmx 4 as its only front end. A Laravel developer who must move to TypeScript keeps the conventions, the API and the productivity they already have. Adopters need proof that it really is Laravel, so Laravel's own test suite is the specification: every Upstream test is inventoried, ported and tracked against the full-suite denominator. Unattended AI agents build the framework in parallel, under guardrails that stop them gaming the grader, and the Maintainer accepts each Epic. The PRD (companion) defines every term used here.

## Capabilities

Each capability is accepted under the PRD's Global rules (§4). For an Upstream Component, every Test ID × Backend Variant passes or carries a valid Skip Reason other than `not-ported-yet`. For a Xaravel Component, every testable FR consequence has a passing Xaravel Test (FR-115). `capability-map.md` maps each capability to its FRs, its governing ADs and its Phase.

- **CAP-1**
  - **intent:** The Maintainer and Framework Agents can measure conformance to Laravel and run the porting work queue, without agents being able to weaken the grader.
  - **success:** The Test Inventory regenerates identically and matches the Oracle runner's listing. The Ratchet fails CI on any unexpected pass or failure. The public dashboard shows the full denominator, the alpha-gate figure, Skip Reason counts and open Escalations. A Story PR that touches a Protected Path, an unowned Test ID, or a zero-assertion test fails CI (FR-1..9, FR-111..116).
- **CAP-2**
  - **intent:** App Developers install Xaravel as split `@xaravel/*` packages, or as `@xaravel/framework`, on Bun only, released in lockstep 0.x versions.
  - **success:** `@xaravel/collections` and `@xaravel/support` each work standalone. Every package declares `engines.bun >= 1.4`. One CI-published version with provenance exists per Phase, and its notes state the Baseline Pin (FR-10..14).
- **CAP-3**
  - **intent:** An App Developer creates a Laravel-shaped app with `bun create xaravel <name>`.
  - **success:** The Installer scaffolds the Skeleton with SQLite or Postgres, generates `APP_KEY`, initialises git and prints next steps. It fails with an upgrade command on Bun older than 1.4. The welcome page serves a working htmx 4 Fragment. The Skeleton ships htmx auth pages (login, register, password reset) and an authenticated dashboard, delivered with Auth in Phase 8 (FR-15..17, OQ-10, UJ-1).
- **CAP-4**
  - **intent:** App Developers configure and boot an app through `bootstrap/app.ts`, providers, the service container, config and env, facades, helpers and the Class Registry, with Laravel's semantics.
  - **success:** The Container and Foundation Ported Tests pass. `scoped` bindings and facades stay isolated across concurrent requests. Resolving an unregistered class name throws an error that names it (FR-18..22).
- **CAP-5**
  - **intent:** App Developers use Collections, `Str`, `Arr`, dates, macros and the other Support helpers with PHP array and value semantics.
  - **success:** Collections and Support Ported Tests pass, including key-order and list-versus-associative cases. Differential Tests against the Oracle match for transliteration, pluralization and date formatting (FR-23..26).
- **CAP-6**
  - **intent:** App Developers serve HTTP on `Bun.serve` with Laravel's requests, responses, routing, middleware, CSRF, sessions, cookies, URLs, errors, logging and rate limiting.
  - **success:** Http, Routing, Session and Cookie Ported Tests pass. A tampered signed URL returns 403, a missing CSRF token returns 419, and a throttled request returns 429 with `Retry-After`. Concurrent requests never share request, session or auth state (FR-27..36).
- **CAP-7**
  - **intent:** Controllers detect htmx Requests and answer them with Fragments, htmx headers, htmx-aware redirects, validation re-renders and streaming, while non-htmx requests behave exactly as in Upstream.
  - **success:** The same controller action returns a 302 to a non-htmx request and a 200 with `HX-Location` to an htmx Request. Invalid htmx form input returns the form Fragment with status 422. Server-sent events and multipart parts flush as they are written. Every FR-37..43 consequence has a passing Xaravel Test (UJ-2).
- **CAP-8**
  - **intent:** App Developers write Blade views, components and Fragments that compile to async JavaScript, with Laravel's directives and escaping.
  - **success:** View Differential Tests on rendered HTML match the Oracle. The XSS suite's escaping matches the Oracle. A page under a strict CSP runs htmx with Vite nonces (FR-44..49).
- **CAP-9**
  - **intent:** App Developers validate input with every Laravel 13 rule, with Form Requests and with async IO rules.
  - **success:** Validation Ported Tests pass, and default messages match the Oracle. `validateSync()` throws when the rule set contains an IO rule (FR-50..52).
- **CAP-10**
  - **intent:** App Developers query, migrate, seed, paginate and use Redis, writing the same code for SQLite and Postgres.
  - **success:** Generated SQL matches the Oracle for all five grammars. The Skeleton's test suite passes on both SQLite and Postgres in CI. Queries inside a transaction callback use its connection, even under concurrency (FR-53..60, UJ-3).
- **CAP-11**
  - **intent:** App Developers define Eloquent models, relationships, casts, events, serialization, factories and scopes, with Strict Loading by default.
  - **success:** Eloquent Ported Tests pass under the DIV-1, DIV-2 and DIV-9 adaptation rules. Reading a relationship that isn't loaded throws `LazyLoadingViolationException`, and `await model.related('posts')` loads it. With `automaticallyEagerLoadRelationships()` on, a single `await` loads the relation for the whole originating collection in one query (FR-61..68).
- **CAP-12**
  - **intent:** App Developers run and define `bun artisan` commands, prompts, `make:*` generators, schedules and a REPL.
  - **success:** Console Ported Tests pass. Each generator's output matches its reviewed TypeScript reference file and compiles under `tsc --strict`. `bun artisan tinker` boots the app and awaits Promises before printing them (FR-69..73).
- **CAP-13**
  - **intent:** App Developers use cache, events, storage, encryption, hashing, the HTTP client, processes, Context, concurrency, localization, image and JSON Schema, as in Laravel.
  - **success:** These Components' Ported Tests pass. Payloads encrypted by PHP Laravel decrypt in Xaravel and the reverse, using the same key. PHP `$2y$` bcrypt hashes verify, including passwords longer than 72 bytes (FR-74..84).
- **CAP-14**
  - **intent:** App Developers dispatch jobs, chains, batches and closures, and run workers on the sync, database and redis drivers.
  - **success:** Queue and Bus Ported Tests pass. A worker rejects a closure payload with an invalid signature. A closure that captures disallowed outer variables fails at dispatch time with an explanatory error (FR-85..88).
- **CAP-15**
  - **intent:** App Developers send Mailables, notifications and broadcasts.
  - **success:** Mail, Notifications and Broadcasting Ported Tests pass. Markdown mail HTML matches the Oracle. The smtp, log, array and failover transports and the Pusher-protocol driver work (FR-89..91).
- **CAP-16**
  - **intent:** App Developers authenticate users, authorize with gates and policies, reset passwords and verify email.
  - **success:** Auth Ported Tests pass. After the auth middleware runs, `request.user()` reads synchronously, and the `verified` middleware blocks unverified users (FR-92..95).
- **CAP-17**
  - **intent:** App Developers test their apps with HTTP, console and database tests, fakes, mocks, time control and the Testbench.
  - **success:** Testing Ported Tests pass. A Pest-style `test()` with `this.post(...).assertRedirect(...)` works. Fakes and the test clock reset after each test. The htmx assertions (`assertHxTrigger`, `assertFragment`, `assertHxLocation`) have passing Xaravel Tests (FR-96..101; FR-102 post-alpha).
- **CAP-18**
  - **intent:** App Developers define MCP servers over HTTP or stdio, and, after the alpha, AI agents.
  - **success:** The ported `laravel/mcp` tests pass. An `Mcp.web()` server rejects a request that fails its auth guard (FR-104; FR-103 post-alpha).
- **CAP-19**
  - **intent:** App Agents and Framework Agents introspect a Xaravel app, or the monorepo, through the Boost MCP server, safely by default.
  - **success:** Framework mode, read-only, serves Test IDs, statuses, Conformance Rates, Story assignments and Escalations from Phase 0. App tools list routes (marking those that return Fragments), schema, the last error and the CLI commands, and run tests with structured failures. Write and eval tools are refused when `APP_ENV=production` (FR-105..110; FR-108 post-alpha).
- **CAP-20**
  - **intent:** Every public Xaravel API keeps its Laravel 13 name, arguments, defaults and behaviour. The only differences are TypeScript syntax and the divergences listed in the PRD (DIV-1..12).
  - **success:** The API-surface diff against Upstream has no unexplained missing or extra members at each Component's last Epic. Every adapted test carries an `adapted:DIV-<n>.<clause>` marker that Fidelity Review checks (PRD §5, spine AD-15).

## Constraints

- Bun 1.4 or later (CI pins 1.4.3), TypeScript `strict`, ESM only. macOS and Linux on x64 and arm64. No Node.js, no Deno, and no third-party HTTP framework.
- htmx 4 is the only front end (pinned at `htmx.org@4.0.0`).
- The parity rule (PRD §5.1) binds every API. A difference not covered by DIV-1..12 is a bug. A new divergence requires an Escalation that the Maintainer approves (FR-114).
- The target is `laravel/framework` v13.37.0 plus `laravel/ai`, `laravel/mcp` and `laravel/boost`. The Baseline Pin moves only at Phase freeze points (FR-7).
- The architecture spine's AD-1..AD-28 bind every Epic and Story. A Story that conflicts with an AD raises an Escalation; it never overrides the AD locally.
- The grader is out of the graded agents' reach:
  - Protected Paths and base-branch Story manifests;
  - Expectations edits limited to the Story's own Test IDs;
  - Fidelity Review by at least two independent reviewers;
  - an assertion floor and a CI-checked rule for every Skip Reason;
  - no stubbing of one Component to pass another's tests.
- Phases 0–8 run in dependency order. Phase 1 starts only after `PORTING.md` and the Divergence Records are merged and piloted (FR-8).
- No request, session, auth, transaction, Context or scoped state crosses between concurrent units of work (NFR-4).
- Only the Maintainer releases, from CI, with npm provenance. Agents never hold publish credentials (NFR-11).
- MIT licence that keeps Laravel's notice. Laravel's trademark policy is followed: described as "a TypeScript port of Laravel", with a non-affiliation notice and no Laravel logo (NFR-8).
- Dependency order: a Bun built-in first, then a maintained npm package, then our own code. Each ported PHP library has one owning package (NFR-2, AD-22).
- Correctness before performance. Benchmarks are informational and never gate before the alpha (NFR-6).

## Non-goals

- MongoDB (NG-1).
- Front ends other than htmx: Inertia, React, Vue, Svelte, Livewire or Alpine starter kits (NG-2).
- Node.js or Deno support (NG-3).
- Running PHP code, or acting as a PHP compatibility layer (NG-4).
- Laravel's first-party products beyond the framework, AI SDK, MCP and Boost: Sanctum, Passport, Cashier, Horizon, Telescope, Pulse, Reverb, Scout, Socialite, Dusk, Sail, and the Forge, Vapor and Cloud integrations (NG-5).
- Cutting scope to a minimal v1 (NG-6).
- Performance work before the public alpha (NG-7).
- Before the alpha, also out (PRD §7.2): the AI SDK, Boost documentation search, browser tests, Windows, the MySQL, MariaDB and SQL Server drivers, Redis Cluster, SQS and Beanstalkd, mail transports beyond smtp, log, array and failover, `email:spoof`, and the Laravel 14 re-sync.

## Success signal

- **Public alpha.** Phases 0–8 are accepted. At least 90% of Applicable Test IDs for the Phase 1–8 Components pass on every alpha Backend Variant: SQLite, Postgres, Redis, and the sync, database and redis queue drivers. No `not-ported-yet` or `blocked-by` entries remain for those Components. User docs exist for every Phase 1–8 Component.
- **Dogfood.** The Maintainer's own htmx app runs in production on Xaravel.
- **Rework rate.** From Phase 2 onwards, at least 90% of Epics are accepted on first review (SM-1, SM-2, SM-3).

## Open Questions

- **OQ-4:** confirm that Bun 1.4.3's Temporal covers everything Carbon needs. Temporal is present, and DST, month clamping and nanosecond instants work. By the end of Phase 0.
- **OQ-6 (deferred):** which first-party package comes first after the alpha (Sanctum is likeliest)? By Phase 9 planning.
- **OQ-8:** confirm against the Oracle that truncating input to 72 bytes before Bun's bcrypt reproduces PHP. By the end of Phase 0.
- **OQ-11:** confirm that the Bun primitives are sufficient. The Maintainer expects yes. By the end of Phase 0.
- **OQ-12 (deferred):** can security-relevant Upstream releases trigger an out-of-cycle pin bump? By the end of Phase 0.
- **`handleLazyLoadingViolationUsing()`:** what does it mean under Strict Loading? It goes to an Escalation in the first Eloquent relationships Epic (spine AD-8).

## Resolved since the PRD

- **OQ-1:** the Maintainer emails Taylor Otwell before the first public npm publish.
- **OQ-2:** versions switch from 0.x to 13.x once `bun create xaravel` produces a working starter site with auth and a dashboard.
- **OQ-3:** no Symfony test suites are ported. Laravel's suite and Oracle Differential Tests grade the ports.
- **OQ-10:** yes. The Skeleton ships htmx auth pages and a dashboard.
- **`automaticallyEagerLoadRelationships()`:** batch on await (spine AD-8, PRD DIV-2).
