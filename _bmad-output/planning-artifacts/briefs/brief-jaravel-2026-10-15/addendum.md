# Addendum: Jaravel

Supporting depth for downstream documents (PRD, architecture). Not part of the brief itself.

## Landscape snapshot (researched 2026-10-15)

Star counts and versions pulled from GitHub/npm on 2026-10-15; other claims via web search. Uncertain items flagged.

### Lumen
- Officially discouraged: README says "always begin new projects with Laravel" (citing PHP speed + Octane). Skeleton `laravel/lumen` archived; Packagist marks it abandoned. Last framework release v11.2.0 (2024-12-10).

### Laravel-like JS/TS frameworks
| Project | Runtime / HTTP | ORM | CLI | Traction | Notes |
|---|---|---|---|---|---|
| AdonisJS v7.6 | Node ≥24, own HTTP server; Bun not officially supported (unverified) | Lucid (Active Record, Knex) | Ace | ~19k★, v7 Feb 2026 | The incumbent "Laravel for Node" |
| Stacks.js | Bun only | own | Buddy (`make:*`) | ~633★, pre-1.0 | Very broad surface, low traction |
| Guren v2.30 | Bun + **Hono** | Drizzle | `guren add` | ~34★ | Closest analogue; **Inertia/React**, not HTMX |
| H3ravel | H3 (Node/Bun/Deno) | Arquebus (Eloquent-like) | Musket | ~22★, last release Nov 2025 | Appears stalled |
| Sails | Node | Waterline | sails | ~22.8k★ | Maintenance mode |
| NestJS | Node | any | nest | ~77k★ | Angular-style DI; not Laravel in feel |
| Wasp | compiler/DSL | Prisma | wasp | — | Markets as "Laravel for JS" |

### Hono
- v4.13.x, ~32.5k★, native on Bun, rich first-party middleware, Zod/Valibot validators.
- HonoX (official meta-framework): alpha (v0.1.x), file routing + islands; no ORM/CLI/queues/auth.
- `hono/jsx` server-side JSX via `c.html()` with streaming. Official htmx example page; community `@lakubudavid/hono-htmx` (partial vs full-layout). No batteries-included Hono+HTMX framework found.

### Bun (v1.4.3; 1.4 released 2026-08-20)
Built-ins a framework can wrap instead of building: `Bun.sql` (Postgres/MySQL/SQLite), `bun:sqlite`, `Bun.redis` (cluster/streams status unverified), `bun test` (`--parallel`), `Bun.cron()`, `Bun.password`, `Bun.file`/S3, `.env` loading, single-file executables.

### TS ORMs
- Active Record / Eloquent-style: Sutando (Knex, ~309★, claims Eloquent parity), Lucid (Adonis-coupled; standalone use unverified), Arquebus (early).
- Query builder / schema-first: Drizzle (~36k★, 1.0 RC), Kysely (~14k★, good base for a custom AR layer), Prisma (~48k★, v8 RC), TypeORM (both styles), MikroORM (data mapper).
- Gap: no mature Bun-native Eloquent-style ORM on `Bun.sql`.

### Demand signals
- Recurring "why no Laravel for JS?" discourse (largely vendor-authored).
- Many small Laravel clones (Guren, Stacks, H3ravel) — demand exists, none broke out beyond Adonis.
- htmx: ~49.6k★; htmx 4.0 released 2026-08-28 (fetch-based, streaming), but npm `latest` stays 2.x until early 2027 → must choose a target major.

### Positioning gap (as observed)
No project combines Hono + Bun + Eloquent-style ORM + Artisan-style CLI + HTMX-first. Threats: Adonis adding Bun support; Guren adding an HTMX mode.

## Desired feature surface (user wish list, 2026-10-15)

Mirrors the Laravel docs table of contents. Not yet prioritized into v1 vs later.

- **The Basics:** Routing, Middleware, CSRF Protection, Controllers, Requests, Responses, Views, Sessions, Validation, Error Handling, Logging, URL Generation, Templating for HTMX
- **Digging Deeper:** Console (Artisan-style), Cache, Collections, Context, Events, File Storage, Helpers, HTTP Client, Mail, Notifications, Queues, Rate Limiting
- **Security:** Authentication, Authorization, Password Reset, Hashing, Encryption
- **Database:** Query Builder, Pagination, Migrations, Seeding, Redis — **explicitly no MongoDB**
- **Eloquent-style ORM:** Relationships, Collections, Mutators/Casts, API Resources, Serialization, Factories
- **Testing:** HTTP Tests, Console Tests, Browser Tests, Database, Mocking
- **AI:** AI SDK, MCP, Boost (Laravel's AI-agent tooling equivalents)

## AI layer: Laravel AI SDK, MCP, Boost (researched 2026-10-15, docs at laravel.com/docs/13.x)

All three are separate Composer packages (not in laravel/framework), each with its own Pest suite — portable as conformance specs.

| Laravel package | Version | Test files | What it is | TS building block to wrap |
|---|---|---|---|---|
| `laravel/ai` | 1.2.3 | 338 | Agent classes (tools, provider tools, middleware, structured output), streaming (incl. Vercel data protocol), DB-backed conversation memory, images/TTS/STT/embeddings/reranking/files/vector stores, failover, `::fake()`, ~15 providers | `ai` (Vercel) v7 + `@ai-sdk/*` providers |
| `laravel/mcp` | 1.0.2 | 122 (incl. Conformance) | MCP servers: Tools/Resources/Prompts; `Mcp::web()` (HTTP) and `Mcp::local()` (stdio CLI); OAuth 2.1 (Passport) or Sanctum; inspector + test helpers | `@modelcontextprotocol/sdk` 1.32 (v2 split pkgs at 2.3.1) + `@hono/mcp` 0.3.2 (peers sdk ^1.29 → v1 vs v2 decision needed) |
| `laravel/boost` | 2.10.3 (dev dep) | 95 | MCP server for coding agents built on laravel/mcp: app info, browser logs, DB connections/query/schema, absolute URL, last error, log entries, record rule, hosted semantic docs search (~17k entries); tinker (off by default); writes guidelines to CLAUDE.md/AGENTS.md, Agent Skills, `.ai/rules/`; package hook | Built on Jaravel's own MCP layer |

### "Jaravel Boost" candidate surface
Route table (incl. htmx fragment routes), container bindings, config/env keys, DB schema + read-only query, logs + last error, CLI command list, eval REPL, browser logs, version-pinned docs search, record-rule/project rules, per-module skills, run-test-suite with structured failures. Strategic: the same tool serves the agents building Jaravel and the agents building apps on it.

Open checks: Bun stdio-transport edge cases (spike); MCP SDK v1 vs v2.

## Laravel framework anatomy (researched 2026-10-15)

Full tables: [`research/laravel-anatomy.md`](research/laravel-anatomy.md). Source: `laravel/framework` 13.x @ v13.37.0 (read-only clone; nothing executed).

- **Target:** Laravel 13 (13.0.0 on 2026-03-17; v13.37.0 latest). Majors yearly ~Q1; **Laravel 14 expected ~Q1 2027** → plan a re-sync epic.
- **Size:** 36 Illuminate components + Foundation; 275,616 PHP src lines; **13,544 test methods (10,735 unit / 2,809 integration)**, ~16–18k executed cases with data providers (est.); Mockery in 226 files.
- **Biggest suites:** Database 3,703 · Foundation 1,152 · Support 1,052 · Http 751 · Validation 670 · Collections 657 · Queue 648 · Routing 556 · Cache 505 · View 454.
- **Backends:** most DB tests need no server (grammar/SQL-string unit tests + SQLite `:memory:`); only 161 integration methods are engine-specific. Redis tests auto-skip without a server.

### Suggested epic order (dependency-adjusted; total test methods)
1. Foundations: Macroable 16, Conditionable 8, Contracts (interfaces), Collections 657, Reflection 24, Config 33, JsonSchema 110
2. Container 211, Support core ~1,052 (facades/fakes deferred to their components)
3. Pipeline 25, Encryption 29, Hashing 13, Filesystem 202, Process 76, Log 113, Translation 70, Bus 75, Events 114
4. Database: Query/Schema grammars → Eloquent → Migrations (3,703)
5. Pagination 50, Cache 505, Redis 159, Validation 670
6. HTTP layer on Hono: Http 751, Cookie 32, Session 109, Routing 556
7. View/templating 454, Console 396, Mail 211
8. Queue 648, Concurrency 17, Broadcasting 165, Auth 313, Notifications 103, Image 291
9. Foundation 1,152 (incl. generators), Testing 431, Jaravel Testbench

### Structural prerequisites / decisions surfaced
- **Testbench equivalent** gates all 2,809 integration tests → unit tests first, integration unlock after Foundation + Testbench.
- **Mockery shim** (or rewrite to bun:test mocks); global afterEach reset (clock, Str, Sleep, Once, Lottery).
- **Closure serialization** impossible in JS → design decision for queued closures + Concurrency.
- **Test-adaptation policy** needed where tests assert PHP output (Blade compiler → PHP, 88 generator stubs) or PHP reflection (container autowiring, implicit route binding, listener discovery, casts).
- Replacements needed: Carbon, doctrine/inflector, symfony/http-foundation+kernel (→ Hono), symfony/routing, symfony/console + prompts + termwind, symfony/mailer, monolog, Guzzle, flysystem, egulias/email-validator, brick/math.

## Porting strategy (researched 2026-10-15)

Full notes (~6.7k words, with prior-art citations): [`research/porting-strategy.md`](research/porting-strategy.md).

### Prior-art lessons that shape the plan
- **Bun Zig→Rust (Jul 2026):** write a `PORTING.md` idiom table before any code; pilot on a few files; per unit run implementer → 2 adversarial reviewers → fixer; failing-test list *is* the work queue; no skips. Main agent failure mode: stubbing to make it compile. Regressions were semantic, not syntactic.
- **Carlini C compiler:** the verifier must be near-perfect; short greppable harness output; `--fast` sampled mode; use the original (PHP Laravel) as a differential oracle.
- **Deno WPT / Node-compat:** machine-maintained `expectations.json`; CI fails on unexpected passes *and* failures (ratchet).
- **Pyodide:** skip reasons from a fixed vocabulary. **uutils:** last few % of conformance take years. **tsgo / Ladybird:** diff textual outputs (SQL, HTML) against the original.
- Pass rates must state their denominator (the full upstream inventory, not "tests we ported").

### Top semantic gaps (risk → approach)
| Gap | Risk | Approach |
|---|---|---|
| Eloquent magic attributes / `__call` | H | Proxy; `declare` typed fields; no `#private` on proxied classes |
| PHP arrays (ordered, key coercion, value semantics) | H | Collections on ordered Map with PHP key normalisation; `toPhpIdentical` / `toPhpEqual` matchers |
| Container autowiring (types erased) | H | Explicit `static inject` tokens canonical; `@inject()` decorators optional sugar; codegen later |
| Class-name string identity (morph types, queue payloads) | H | Class registry in Epic 1 |
| Serializable closures | H | Only closures with explicit captured vars, signed; job-class registry |
| Traits → mixins | M | `uses()` helper recording trait list (keeps `boot{Trait}`) |
| Facades | M | Proxy + per-request scope via AsyncLocalStorage |
| Carbon | M–H | Temporal polyfill (no evidence Bun ships Temporal) |
| Strings / regex (bytes vs UTF-16, PCRE) | M | Explicit helpers; flag PCRE-only features |
| `static::` late static binding | L–M | `this` in static methods |

### Async: "sync core, async edges" (recommended)
- In-memory stays sync: Collections, Str/Arr, Config, Container, route matching, query *building* and `toSql()`, model attributes/casts/serialization, template compilation.
- Only IO terminals are async: builders are thenable (`await User.where(...).get()`), `save/delete/refresh` return Promises, `cursor()` is `AsyncIterable`.
- **No implicit lazy loading:** `user.posts` throws unless loaded — Laravel's own `preventLazyLoading()` strict mode made default. Use `with()`, `await user.load()`, or automatic eager loading.
- Events, observers, policies, transaction callbacks awaited sequentially in registration order (tests assert query order).
- **Hidden hard part:** transaction/connection state scoped with AsyncLocalStorage — prototype in the first DB epic.
- Guardrails: type-aware lint (`no-floating-promises`, `await-thenable`, `no-misused-promises`) in CI for framework and ported tests.
- Rejected: sync-over-worker with `Atomics.wait` (blocks event loop; unbenchmarked), generator coroutines.
- Payoff: ~4–5k test methods (Support, Collections, Container, Config, Str, Pipeline, route matching, SQL grammars) port with zero async edits → early momentum.

### Test-porting pipeline
1. Pin upstream commit; run real PHPUnit across the DB matrix → JUnit baseline + full test list.
2. Inventory via php-parser: stable IDs `FQCN::method#dataset`, tags, difficulty score.
3. `PORTING.md` + ADRs; build PHPUnit-compat, mini-Mockery, Testbench, matcher shims; pilot on Support.
4. Where tests are input→output data (Str, SQL grammars, messages, dates), extract outputs from PHP as fixtures and generate TS tests.
5. Staged per-file translation: translate → `tsc` → floating-promise lint → `bun test` → record in `expectations.json`; retries per stage; adversarial fidelity review.
6. Implement against red tests, sync components first.
7. CI ratchet (unexpected pass or fail both fail); per-component dashboard against full inventory; periodic differential runs vs PHP Laravel.

Unverified: Bun `test.failing` / `test.skipIf` / `setSystemTime`, Bun Redis completeness, Bun.SQL raw bindings, PHPUnit `--list-tests-xml` on 12/13.

## Dependency replacement map (researched 2026-10-15)

Full tables (per component, npm downloads, Bun caveats, sources): [`research/deps-map.md`](research/deps-map.md).

- **Bun built-ins:** Bun.sql + bun:sqlite (← PDO; SQL Server needs `mssql`), Bun.redis (← predis; no Cluster/Sentinel, Pub/Sub experimental), Bun.password (← bcrypt/argon; caveat: >72-byte bcrypt pre-hash differs from PHP, `$2y$` verify undocumented), Bun.S3Client, Bun.spawn/$ + Bun.Terminal (← symfony/process), Bun.Glob (← finder), Bun.CryptoHasher/node:crypto, Bun.randomUUIDv7, Bun.inspect, Bun.stringWidth/wrapAnsi (← termwind), Bun.Image (← gd/intervention), Bun.markdown (← commonmark; unstable, unsanitised), bun test (← PHPUnit), Temporal (reported on by default in 1.4 — completeness unverified; fallback temporal-polyfill), Bun.cron().
- **Hono:** server adapter, cors, compress, etag, secure-headers, body-limit, conninfo, streaming/SSE, websocket, `app.request()` for tests. Hono's csrf ≠ Laravel token CSRF.
- **npm:** nodemailer, croner, juice, uuid/ulid, decimal.js/big.js + BigInt, file-type, mime-types, @poppinss/dumper + youch, jose, @faker-js/faker, @aws-sdk/*, tough-cookie, p-limit, basic-ftp, sharp (fallback).
- **Write ourselves:** slim HttpFoundation over Web Request/Response (parse body once before pipeline; per-request ALS); router incl. Symfony RouteCompiler port (Laravel matches, Hono gets a catch-all — *architecture decision*); Symfony-compatible console core (253 imports + `expectsQuestion()` test API; commander/citty/cac lack the I/O model); laravel/prompts port (@clack/core fallback); Carbon façade on Temporal (PHP `date()` formats, strtotime parsing, `diffForHumans`, `setTestNow`); Monolog-shaped logger; Doctrine inflector rules; portable-ascii tables; email validation (no JS spoof-check equivalent); phpdotenv grammar; Mockery-style API; PHPUnit assertion shims; container autowiring. **serializable-closure cannot be faithfully reproduced** → restricted model, divergent tests.

### Templating recommendation
Port Blade's compiler (BladeCompiler, 22 Compiles* concerns, ComponentTagCompiler) emitting JS render functions. Reasons: 63 Blade test files assert compile/render; no JS engine supports `<x-component>` + `$attributes`/`@props`/`@aware`. Edge.js 6 is the best design reference (but `@end` closers, no `@layout/@section` in v6, Bun not officially stated). hono/jsx as an optional second, typed engine. Rejected: Eta, Nunjucks (stale), stx, bladejs (dead).

### htmx 4 must-haves (4.0.0, 2026-08-28; npm tag `next`)
- Read: HX-Request, HX-Request-Type (full/partial), HX-Boosted, HX-Current-URL, HX-History-Restore-Request, HX-Source (replaces request HX-Trigger), HX-Target (`tag#id`), `Accept: text/html`.
- Emit: HX-Trigger, HX-Location, HX-Redirect, HX-Refresh, HX-Retarget, HX-Reswap, HX-Reselect, HX-Push-Url, HX-Replace-Url (After-Swap/After-Settle triggers removed).
- 4xx/5xx now swap → validation failures on htmx requests render the fragment with 422 instead of a 302 redirect.
- Partials: `<hx-partial>` + `@fragment`; OOB/partial swaps apply after main swap.
- Streaming: SSE, `multipart/mixed` writer, websockets; client timeout default 60s.
- Router needs the **QUERY** verb (`hx-query`); verify Bun.serve accepts it.
- CSRF in `hx-headers` must be `:inherited`; CSP nonce hook; history navigation re-fetches full page.
