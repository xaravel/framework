# Input reconciliation: research → PRD (Xaravel)

Date: 2026-10-15. Reviewer: input-reconciliation pass (read-only).

**Inputs (research):** `../../briefs/brief-xaravel-2026-10-15/research/`
- `laravel-anatomy.md` (A)
- `deps-map.md` (D)
- `porting-strategy.md` (P)

**Target:** `prd.md`, `addendum.md`, `.memlog.md` in this folder.

**Excluded by instruction:** Hono-related findings (Hono was dropped; HTTP is on `Bun.serve` with Laravel's router and middleware ported). Findings that only need an architecture decision are left out unless architecture or epics would be unsafe without a PRD statement.

Severity: **H** = an alpha gate, Ratchet or public-API contract is wrong or cannot be met as written. **M** = a requirement or divergence is missing and agents would guess. **L** = a clarification or a minor omission.

---

## Gaps

### G-1 (H). Testbench, the Testing toolkit and Foundation are in Phase 9, after the alpha, but the alpha needs them
- **Source:** A §7.1 (Testbench is a prerequisite for every integration test: 2,809 methods, plus 27 unit files that import Testbench); A §3 table (integration share per Component: Log 103/113, Concurrency 17/17, Queue 287/648, Database 900/3,703, Console 213/396, Routing 198/556, Cache 150/505); A §4 takeaways ("Testing really needs Foundation, Http, View, Console, Session"); P §5.1.
- **What's missing or contradictory:**
  - SM-1 requires ≥90% of Phase 1–8 Test IDs to *pass* at the alpha. About 21% of those Test IDs are integration tests that cannot run until Testbench exists, and Testbench is Phase 9, after the alpha. Log (91% integration) and Concurrency (100% integration) can never reach 90%.
  - FR-60 and UJ-3 (the Skeleton test suite passes on SQLite and Postgres), FR-107 (Boost test-run tool, in the alpha) and the dogfood app all need FR-96–FR-99 (HTTP, console and database test helpers), which are also Phase 9.
  - FR-18 (Application lifecycle), the HTTP and console kernels (Phases 6–7) and the `make:*` generators used in UJ-1 (Phase 7) all live in Foundation, which the PRD assigns to "Phase 9: Foundation (full)". The PRD never says which Foundation slices land earlier.
- **Where:** §7.2, §7.3, SM-1, FR-101.
- **Fix:** move Testbench and the core of Foundation Testing (TestCase, TestResponse, RefreshDatabase) to the end of Phase 6 or 7, and list which Foundation slices (bootstrap/Application, HTTP kernel, console kernel, generators) belong to which Phase. If that move is rejected, SM-1 must exclude `blocked-by:testbench` from its numerator and denominator, and say so explicitly.

### G-2 (H). A Test ID cannot express "the same test on another engine or driver"
- **Source:** A §6 (Laravel CI runs `tests/Integration/Database` once per engine via `DB_CONNECTION`, and `tests/Integration/Queue` once per `QUEUE_CONNECTION`; Redis tests switch on `REDIS_CLIENT`, phpredis/predis); A §7.3; P §0, §5.2.
- **What's missing:** FR-3 says "exactly one status for every Test ID", but FR-60 needs the same Test IDs to pass on SQLite *and* Postgres. A test can pass on one engine and fail on the other, and the scheme cannot record that. The Conformance Rate denominator for a multi-engine run is undefined. Nothing says which engine versions are supported (Laravel's CI uses Postgres 10/14/18, MySQL 5.7/8.4/9.7 and others). Nothing says what happens to upstream variants for phpredis/predis when Xaravel has a single Redis client.
- **Where:** Glossary (Test ID, Expectations File, Conformance Rate), FR-1, FR-3, FR-5, FR-60.
- **Fix:** add an execution-context dimension, for example `Test ID @ db=pgsql16,queue=redis`. The Expectations File keys on (Test ID, context). Define the alpha CI matrix (SQLite, a stated Postgres version range, queue `sync`/`database`/`redis`, and a minimum Redis version). Add a rule that collapses phpredis/predis datasets onto the single `Bun.redis` client.

### G-3 (H). The Skip Reason vocabulary has no reason for upstream-skipped, deferred or flaky tests
- **Source:** P §2.1 ("tests skipped or failing in PHP itself must be marked `upstream-skip` so they don't count against Xaravel"); P §2.2 (vocabulary: `upstream-skip`, `flaky`, `needs-infra`); P §1.1 (Pyodide lesson); A §6 (SQS, Pusher and Ably tests use mocked SDKs and need no network); A §3 (Memcached/DynamoDB tests).
- **What's missing:**
  1. **Upstream baseline.** No requirement says to run the PHP suite at the pin to find out which tests are skipped or failing upstream. Those tests currently count against the denominator.
  2. **Deferred drivers.** The global rule says no Test ID may stay `not-ported-yet` at Epic acceptance. But many drivers are "later", not non-goals: MySQL, MariaDB and SQL Server drivers, SQS, Beanstalkd, SES/Postmark/Mailgun/Resend, Redis Cluster. Others are not mentioned at all: the Memcached, DynamoDB and APC cache stores, FTP/SFTP disks, the Ably, Redis and Mercure broadcasters, and the `slack`/`errorlog`/`monolog` log drivers. `out-of-scope:<non-goal>` needs a §7.1 non-goal, and `backend-unavailable` is wrong for SQS and Ably, whose tests use mocked SDKs.
  3. **Flaky tests.** The Ratchet fails on any surprise and nothing handles flaky upstream tests. NFR-7 only covers Xaravel's own determinism.
- **Where:** Glossary (Skip Reason), FR-3, FR-5, §7.2 "After the alpha", SM-1.
- **Fix:** add `upstream-skip` (derived from the Oracle's PHPUnit JUnit baseline at the pin; excluded from or shown separately in the denominator) and `deferred:<milestone>`. List every deferred driver explicitly in §7.2. Add a flaky policy (quarantine with a reason, a re-run rule, and a limited lifetime).

### G-4 (H). FR-77's two-way encryption interop requires PHP `serialize()`, which the research says is a non-goal
- **Source:** P §3.9.3 ("PHP `serialize()` payload compatibility with real Laravel queues is a non-goal"); D §5 (PHP `serialize()` is used for queued jobs, cache values and sessions).
- **What's contradictory:**
  - `Crypt::encrypt()` serializes by default (`$serialize = true`).
  - Laravel's session store serializes attributes with PHP `serialize()` unless its `serialization` option is set to `json`. Verify the default at the pin.
  - So FR-77's promise ("payloads encrypted by PHP decrypt in Xaravel, and the reverse… sessions, so a Laravel app can be migrated without logging every user out") needs a PHP serialize/unserialize codec. No FR or divergence covers one.
  - The PRD also never states the research's non-goal: queue payloads and cache values are not interoperable with PHP Laravel.
- **Where:** FR-77, FR-33, §7.1, `.memlog` decision on PHP interop.
- **Fix:** choose one.
  - (a) Scope FR-77 to `encryptString` and cookies, and require JSON session serialization for migration.
  - (b) Add an FR for a PHP-serialize codec limited to scalars and arrays, where objects are rejected.
  - Either way, add a §7.1 non-goal: "queue payloads, cache values and serialized objects are not interchangeable with PHP Laravel".

### G-5 (H). The fidelity review, anti-stub rule and translation pipeline are not requirements
- **Source:** P §1.2 (Bun's Zig→Rust port: 2 adversarial diff-only reviewers, agents "stubbing functions to make it compile", a human check that 0 tests were skipped or deleted); P §1.3 items 7 and 9; P §2.4 (staged translate → tsc → lint → run → classify, with retries and per-stage failure rates; translate tests *before* the implementation exists); P §6 steps 4–5; Airbnb ("retry loops beat prompt tuning").
- **What's missing:** UJ-4 and SM-C1 mention "two adversarial reviewers", but no FR makes this testable. Nothing prevents:
  - a Ported Test that runs zero assertions (it passes the Ratchet vacuously);
  - a dropped dataset or a weakened assertion;
  - implementation code that special-cases test inputs.

  Nothing states who translates Ported Tests, or when relative to implementation. The research recommends translating first, against a TS API skeleton, so failing tests become the work queue.
- **Where:** §4.1. Add an FR-9a "Ported Test fidelity" and an FR-9b "Translation pipeline".
- **Fix:**
  - **Fidelity:** each Ported Test keeps every upstream assertion and dataset. It is reviewed by an agent other than its author against the PHP source. A Ported Test that executes zero assertions fails CI.
  - **Anti-stub:** code that branches on test-only inputs, or stubs a dependency, is rejected.
  - **Pipeline:** Ported Tests are translated before their implementation exists, through staged gates with retries. The failure rate of each stage is reported.

### G-6 (M-H). The semantics of the PHPUnit-compat assertions are undefined
- **Source:** P §2.3 (13,275 `assertSame` and 4,824 `assertEquals`. `assertSame` on arrays needs PHP `===`, so key order and types matter. `assertEquals` is PHP loose `==`. "Don't map to `toEqual` blindly". `expectException` must wrap the *rest* of the test. Interfaces are erased for `assertInstanceOf`. Mockery and `createMock` together have 1,449 + 379 sites); D §4 (phpunit-compat shim "is what makes the mechanical test port feasible").
- **What's missing:** §7.3 Phase 0 names "PHPUnit-style matchers" but no FR defines them. These semantics decide whether a Ported Test is faithful. FR-100 also doesn't say that PHPUnit `createMock` goes through the same shim.
- **Where:** a new FR in §4.1 (Phase 0), next to FR-100.
- **Fix:** add an FR saying that `assertSame` = PHP `===` (array key order and types included), `assertEquals` = PHP `==`, `expectException` stops the test at the throw, and `createMock` maps to `@xaravel/mockery`. Each rule is verified by its own Xaravel Tests.

### G-7 (M-H). PHP value-model gaps beyond FR-23 have no divergence or parity rule
- **Source:** P §3.6 (copy-on-write arrays, 113 by-reference params, int vs float `1` vs `1.0`, `PHP_INT_MAX`, `intdiv`, `%` on negatives, 64-bit IDs as bigint or string); P §2.3 (`null` vs `undefined`: pick one canonical "absent" value); P §3.12 (bytes vs UTF-16, `mb_*` vs `.length`); P §3.13 (ArrayAccess `$collection[0]`/`$model['x']`, `__invoke`, named arguments, backed enums, and **runtime interfaces such as `instanceof ShouldQueue`, which TS erases**).
- **What's missing:** DIV-6 covers "PHP type juggling" only in a general way. The PRD doesn't say:
  - how int/float tests are adapted;
  - whether `Arr` helpers mutate or copy;
  - what `null`/`undefined` contract the public API uses;
  - how BIGINT columns are returned;
  - whether `collection[0]` works;
  - how an App Developer marks a class as `ShouldQueue`, `ShouldBroadcast`, `ShouldBeUnique` or `MustVerifyEmail` when TS `implements` leaves nothing at runtime. This marker problem is public API: FR-85, FR-91 and FR-95 depend on it.
- **Where:** §5.1 parity rule, §5.2 (new DIV-9 "PHP value model"), FR-23/FR-24, addendum mapping table.
- **Fix:**
  - Add DIV-9 covering int/float collapse, copy versus reference semantics with a documented choice per `Arr` method, and BIGINT handling.
  - Add §5.1 rules: `null` is the canonical absent value; marker interfaces are runtime brands or base classes; Collection index access either is supported or is a divergence.

### G-8 (M-H). DIV-3 doesn't cover implicit route model binding or parameter-name binding
- **Source:** A §7.5 (erased types affect "Container, Events (listener type-hint discovery), Routing (implicit model binding) and Eloquent casts"); P §3.8 (`make(Foo::class, ['name' => 'x'])`, `needs('$name')` and `giveConfig` need parameter *names*; tokens should carry them).
- **What's missing:** FR-30 promises implicit route model binding, and FR-19 promises contextual binding and `make` with parameters. DIV-3 only says "autowired dependencies are declared". Nothing says how a controller declares that `{invoice}` is an `Invoice` model, or how names are kept for parameter overrides.
- **Where:** DIV-3, FR-19, FR-30.
- **Fix:**
  - DIV-3 requires the injection declaration to carry parameter names as well as types.
  - FR-30 gains a consequence: implicit binding resolves from a declared parameter→model map, and an undeclared parameter is passed as a string.

### G-9 (M). The scope of AsyncLocalStorage is incomplete, and Bun's ALS reliability is unvalidated
- **Source:** P §4.2 D.8 (transaction level, query log, `DB::listen`, `afterCommit` callbacks and `setTestNow` are per process in PHP and must be per async context; "the hidden hard part… Risk H. Prototype it in the first DB epic"); P §3.2 (Bun's ALS "promise hooks are incomplete"; use the Octane state-leak rules as a checklist); D §5 ("the biggest semantic shift").
- **What's covered:** FR-55 (transaction connection), FR-19 (scoped bindings), FR-27 and NFR-4 (request isolation), FR-81 (Context).
- **What's missing:** the query log, `DB.listen` listeners, `afterCommit` queues and resolved-facade caches are not named as context-scoped. There is no spike or open question on whether Bun's ALS propagates across `await`, timers, streams, `Bun.serve` callbacks and workers. Phase 2 (Container `scoped`) depends on it.
- **Where:** NFR-4, FR-55, §9.
- **Fix:**
  - Extend NFR-4's list to the query log, DB listeners, `afterCommit` callbacks and the facade instance cache.
  - Add OQ-11: a Bun ALS propagation spike before Phase 2, with the Octane checklist as acceptance.

### G-10 (M). DIV-1 doesn't name its consequences for the API surface
- **Source:** P §4.2 D.2 (`cursor()`/`lazy()` return `AsyncIterable`; `chunk(n, async cb)` runs sequentially; builders are thenable); D.5 (Collections stay sync, with explicit `eachAsync`/`mapAsync` companions; higher-order `each.save()` returns a Promise); P §3.7 ("Accessors must be synchronous").
- **What's missing:** "Callbacks may be async" doesn't tell agents that `collection.map(async…)` returns `Promise[]`. It doesn't say that DB `cursor()` is not a `LazyCollection`, that new companion methods are added API, or that accessors, mutators and casts cannot do IO.
- **Where:** DIV-1, FR-23, FR-64.
- **Fix:** list in DIV-1:
  - the added async companion methods and their order and concurrency rules;
  - `cursor`/`lazy` as `AsyncIterable`;
  - accessors, mutators and casts are synchronous.

### G-11 (M). The Oracle cannot produce generator or Blade expected values as FR-6 and FR-48 describe
- **Source:** A §7.5 (111 Generators methods assert generated *PHP* classes; Blade tests assert compiled PHP); D §6.4 ("Templates embed **JS expressions** instead of PHP… Decide whether to keep `$`-prefixed variables").
- **What's contradictory:**
  - FR-6 lists "generator output reference files" as Oracle-generated. The Oracle emits PHP, while DIV-5 says generators emit TS.
  - FR-48 says Ported Tests "keep every Upstream template input". Upstream templates contain PHP expressions (`{{ $user->name }}`), so they must be translated before Xaravel can render them.
  - Nothing defines the expression language inside `{{ }}`, `@if(...)` and so on. That language is the App Developer's API.
- **Where:** FR-6, FR-44, FR-48, DIV-5.
- **Fix:**
  - Remove generator outputs from FR-6, and use reviewed TS snapshots instead.
  - Add to FR-44 that Blade expressions are TypeScript/JS, and state whether `$`-prefixed variables are kept.
  - Change FR-48 to "template inputs translated by a stated, mechanical PHP→JS expression rule; rendered HTML diffed against the Oracle".

### G-12 (M). FR-71's hand-written generator list misses commands that the alpha's database drivers need
- **Source:** A §5 (88 `.stub` files: Foundation 63, Routing 13, Database 5, Queue 3, Auth/Cache/Notifications/Session 1 each); A §2 and §7.5 (Generators have 111 methods).
- **What's missing:** the `*:table` migration generators: `cache:table`, `session:table`, `queue:table`, `queue:failed-table`, `queue:batches-table` and `notifications:table`. The `database` drivers in FR-33, FR-74, FR-85, FR-87 and FR-90 depend on them. Missing `make:*` variants include `make:channel`, `make:job-middleware`, and the controller variants in the Routing stubs. Because the list is hand-maintained, anything missing from it looks out of scope.
- **Where:** FR-71.
- **Fix:** "Every stub-backed Upstream command at the Baseline Pin (88 stubs), including the `*:table` commands; `stub:publish` covers all of them."

### G-13 (M). Job timeouts cannot stop synchronous code
- **Source:** D §3 (ext-pcntl/posix: "No synchronous preemption in JS. A CPU-bound job cannot be interrupted in-thread"; use a `Worker` and `terminate()`, or `AbortSignal`).
- **What's missing:** FR-85 and FR-86 promise `timeout` with Laravel semantics (SIGALRM kills the job). This can't be met in-thread. Upstream tests that use pcntl need a stated adaptation.
- **Where:** FR-85/FR-86, §5.2.
- **Fix:** add a consequence or a DIV: timeouts are enforced by running jobs in an isolated Worker or process (decided in architecture), or are documented as cooperative, with a rule for adapting pcntl tests.

### G-14 (M). Research answers OQ-8 (bcrypt), so it should be a requirement
- **Source:** D §3 Hashing (Bun pre-hashes bcrypt input longer than 72 bytes with SHA-512, unlike PHP. `$2y$` verification is undocumented, so normalize to `$2b$`. There is no argon `threads` option. 1.4 enforces argon2 `memoryCost` ≥ 8); D §8.
- **What's missing:** OQ-8 asks whether the behaviour diverges. The research says it does. FR-78 needs a testable consequence, otherwise an agent will use `Bun.password` directly. The `hashing.argon.threads` config has no stated behaviour.
- **Where:** FR-78, OQ-8, DIV-6.
- **Fix:**
  - FR-78 consequence: hashing and verifying passwords longer than 72 bytes gives the same result as PHP (Bun's pre-hash is never applied), proven by Differential Tests.
  - `$2y$` hashes verify.
  - `threads` is ignored with a warning (DIV-6).
  - Downgrade OQ-8 to "verify the guard".

### G-15 (M). Markdown output is not sanitized, and its parity with league/commonmark is not guaranteed
- **Source:** D §2 league/commonmark ("Bun.markdown output is **not sanitized**, so we must implement `html_input: strip/escape` and `allow_unsafe_links` ourselves"; "Byte-identical HTML with league/commonmark is not guaranteed… adjust `SupportStrTest` expectations"; the API is "unstable").
- **What's missing:** NFR-5 and FR-24 don't mention `Str.markdown`/`inlineMarkdown` options. FR-89 Markdown mail inherits the same risk. Nothing says whether Markdown output must match the Oracle or is a divergence.
- **Where:** FR-24, FR-89, NFR-5.
- **Fix:**
  - Consequence: `html_input` and `allow_unsafe_links` are honoured, with XSS tests like FR-46's.
  - Decide whether Markdown HTML must match the Oracle (which forces markdown-it or a port) or is a documented divergence.

### G-16 (M). Bun-specific runtime constraints are missing
- **Source:** D §8 (Bun 1.4 Rust-port regressions: "Pin the Bun patch version in CI"); D §2 vlucas/phpdotenv (Bun auto-loads `.env` keyed on NODE_ENV with its own `$VAR` expansion; disable it for deterministic precedence); D §3 ext-gd (Bun.Image HEIC/AVIF/TIFF only on macOS/Windows); A §6 (37 `RequiresOperatingSystem` tests).
- **What's missing:**
  - FR-12 says `>= 1.4`, but no exact tested Bun version is pinned in CI.
  - FR-20 doesn't say that `.env.{APP_ENV}` is loaded or that Bun's own `.env` loading must not interfere.
  - No supported OS list. This affects `RequiresOperatingSystem` tests, Image formats and the Installer.
- **Where:** FR-12, FR-20, FR-84, NFR-1.
- **Fix:**
  - CI pins an exact Bun patch version, and bumps are deliberate.
  - FR-20 consequence: `.env` precedence matches Laravel (`APP_ENV`-keyed), with Bun's auto-load disabled.
  - State the supported OSes (for example Linux and macOS, with Windows best-effort).

### G-17 (L-M). Redis server version and Pub/Sub are not stated
- **Source:** D §3 ext-redis (Bun.redis needs server 7.2+; Pub/Sub is "experimental"; MULTI/EXEC needs raw `send()`); A §6 (Redis tests auto-skip when the extension is missing or 6379 is unreachable).
- **What's missing:** FR-59 states only Cluster/Sentinel. The minimum Redis version and the status of `Redis.subscribe`/`psubscribe` are not stated. The Redis auto-skip pattern is covered generally by FR-9 `backend-unavailable`, but see G-2 and G-3 on its CI interaction.
- **Where:** FR-59.
- **Fix:** "Requires Redis ≥ 7.2. Pub/Sub is supported, flagged experimental until Bun stabilises it, or deferred."
- **Related CI gap:** FR-9 must not let a gating CI job turn `pass` into `backend-unavailable`. A required backend that is down fails the job.

### G-18 (M). The htmx 4 response layer is missing CSP nonce, `Vary` and content negotiation
- **Source:** D §7 items 7 (CSP: `hx-csp`/`inlineScriptNonce`, so views expose a per-request nonce like `Vite::useCspNonce()`), the response-header note (`Vary: HX-Request, HX-Request-Type` for cache correctness), the request-header table (`Accept: text/html`: htmx requests are HTML, not JSON), the "Removed" headers (don't offer helpers for `HX-Trigger-After-Swap`/`-Settle`), item 9 (extensions allow-listed through `<meta name="htmx-config">`) and item 5 (`hx-delete` no longer sends the enclosing form's `_method`/`_token`).
- **What's missing:**
  - There is no CSP nonce requirement in FR-49 or FR-17.
  - No `Vary` requirement in FR-38, FR-39 or FR-42. Without it, a full page and a Fragment share one cache entry.
  - No consequence that `expectsJson()` is false for htmx Requests.
  - No `@htmx` config directive.
  - No Skeleton or docs guidance for `hx-delete` forms.
- **Where:** FR-17, FR-38, FR-42, FR-49, FR-28.
- **Fix:**
  - Add a per-request CSP nonce that `@vite` and the htmx config use.
  - Responses whose body depends on htmx headers send `Vary: HX-Request, HX-Request-Type`.
  - `expectsJson()` is false for htmx Requests.
  - There are no helpers for removed headers.

### G-19 (M). CSRF has no `PreventRequestForgery` and doesn't classify `QUERY`
- **Source:** D §5 CSRF (Laravel 13's new `PreventRequestForgery`: a Sec-Fetch-Site origin check with token fallback and `useOriginOnly()`; "Port both"); D §7 item 6 (it fits htmx's same-origin mode); D §7 item 4 (QUERY).
- **What's missing:**
  - FR-31 and FR-32 cover token CSRF only, so a Laravel 13 middleware is missing.
  - Nothing says whether `QUERY`, which is a safe method by definition, is treated as a reading request (no token) like GET/HEAD/OPTIONS.
- **Where:** FR-31, FR-32, FR-30.
- **Fix:**
  - Add `PreventRequestForgery` to FR-31.
  - Add an FR-32 consequence: `QUERY` is exempt from the token check, or it is required, whichever is decided, and tested.

### G-20 (M). The parity rule ignores the Symfony, Carbon and Monolog API surface that Laravel exposes
- **Source:** D §0 import weight (Symfony Console 253 imports, HttpFoundation 62, Mailer 40, Monolog 23); D §1 ("Tests assert on Symfony `Email`/`SentMessage` objects"; "Tests reference Monolog handler classes"); D §6.2 (the `expectsQuestion()`/`expectsTable()`/`expectsOutput()` test API assumes Symfony semantics); P §0 ("Many Laravel tests implicitly test Symfony and Carbon behaviour").
- **What's missing:** §5.1 defines parity only against "its Laravel 13 counterpart". App Developers use Symfony API directly through Laravel:
  - `request.headers`/`query`/`cookies` bags and `Response` status constants;
  - `HttpException`/`NotFoundHttpException`;
  - console `<info>` tags, verbosity, `Table` and `ProgressBar`;
  - Monolog handlers and formatters in `config/logging`;
  - Mail `Email`/`Address`.

  Without a statement, agents may treat these surfaces as free to reshape. OQ-3 only asks about porting Symfony's test suites.
- **Where:** §5.1, FR-35 (log channels: also `slack`, `errorlog`, `monolog` driver), FR-69.
- **Fix:** extend §5.1: "Third-party APIs that Laravel exposes as part of its public surface (Symfony HttpFoundation/Console/Mime, Carbon, Monolog) follow the same parity rule as far as Upstream tests and docs use them."

### G-21 (M). No regex dialect is stated for patterns that users supply
- **Source:** P §3.12 (262 `preg_*` calls; PCRE-only features: possessive quantifiers, atomic groups, `(?R)`, `\A`/`\z`, `/x`, `(?P<n>)`; plan a `pcre()` translator for the common subset).
- **What's missing:** App Developers write PCRE in the `regex:`/`not_regex:` rules (FR-50), in `Route.where()` constraints (FR-30) and in `Str.match`/`Str.is`. The PRD doesn't say what dialect these accept or what happens with an unsupported construct.
- **Where:** FR-30, FR-50, FR-24, §5.2.
- **Fix:** a DIV or a consequence: user patterns are accepted in PHP delimiter syntax and translated for the stated subset. Unsupported PCRE constructs throw a clear error at definition time.

### G-22 (L-M). Some Validation rules cannot be ported faithfully
- **Source:** D §2 egulias ("Spoof check needs ICU Spoofchecker, which JS lacks… approximate or mark unsupported"; `dns` uses `node:dns`); D §3 (`filter_var` flags must be ported, and `validator` differs from PHP filters).
- **What's missing:** FR-50 promises "every Laravel 13 rule". `email:spoof` needs a stated outcome. `email:dns` needs network access, which NFR-7 forbids unless the test is tagged, and the FR-1 backend list has no `network`/`dns` tag.
- **Where:** FR-50, FR-1 backend tags.
- **Fix:** state that `email:spoof` is either approximated (with the confusables table version stated) or a DIV. Add a `network` backend tag.

### G-23 (M). The closure-serialization divergence is narrower than Laravel's actual use
- **Source:** D §2 laravel/serializable-closure (used by queued closures, `Bus::batch` callbacks, `Concurrency::run`, `Route` closure caching and `once()`); P §3.9 (`SerializesModels` → `{class, id, relations, connection}` with an **async** re-fetch; the JSON payload *shape* can match Laravel's).
- **What's missing:** DIV-4 and FR-88 cover dispatch and Concurrency only. The PRD doesn't say:
  - how `Bus.batch(...).then/catch/finally` and `chain().catch` callbacks (FR-87) are serialized;
  - what `route:cache` (FR-30) does with closure routes;
  - that model rehydration on the worker is async.
- **Where:** DIV-4, FR-87, FR-30, FR-85.
- **Fix:**
  - DIV-4 lists every closure-serializing API and its rule: explicit arguments, or an error.
  - Add an FR-30 consequence: `route:cache` either rejects closure routes with an error or excludes them.

### G-24 (M). Typed model attributes can silently shadow Proxy access
- **Source:** P §3.1 gotcha 1 (with `useDefineForClassFields`, TS class fields "create own properties that shadow the Proxy fallback. Typed attribute declarations must be `declare name: string;`… the main mistake to guard against in Eloquent models"); P §3.1 gotcha 2 (`#private` on proxied classes throws); P §3.7 (an optional `model:typegen`).
- **What's missing:** FR-61 promises "attribute access as properties". An App Developer or App Agent who writes `name: string` on a model breaks attribute storage silently. This is a footgun in the public API, not only an architecture detail.
- **Where:** FR-61, FR-71 (`make:model` output).
- **Fix:** add an FR-61 consequence: a model that declares an attribute as an initialised class field is detected at boot with an explanatory error. `make:model` emits `declare` fields. Optionally add `model:typegen`.

### G-25 (M). Laravel 14 will probably ship before the alpha, and the PRD has no target decision
- **Source:** A §1 (Laravel 14 expected about Q1 2027; `master` already requires PHP ^8.4; L13 bug fixes end about Q3 2027 and security fixes about Q1 2028; 13.x minors ship roughly weekly).
- **What's missing:** §5.3 plans a re-sync Epic, and FR-7 only allows moving the pin at Phase boundaries. With nine Phases and about 13.5k methods, the alpha very likely lands after L14 ships. The PRD doesn't decide:
  - whether the alpha targets 13.x or 14.x;
  - whether "Xaravel 13" (§5.3, OQ-2) would launch on an upstream nearing bug-fix EOL;
  - whether FR-7 may cross a major version at all.
- **Where:** §5.3, FR-7, SM-5, §9.
- **Fix:** add OQ-11 or OQ-12 on the alpha's Laravel major, with a decision deadline before Phase 4. Make FR-7 state whether a major-version bump uses the same tool and rules.

### G-26 (L-M). FR-1 doesn't specify how inventory data is produced or the planning tags
- **Source:** P §2.1 (reconcile the runtime `phpunit --list-tests-xml`, which is the only source of *expanded dataset names*, with a static `nikic/php-parser` AST pass); P §0 (246 `#[TestWith]` in addition to 613 DataProviders); P §6 step 2 (tags: db/async/mock/fake/time/regex/closure-serialization/needs-infra, a difficulty score, dependencies on src classes) "drives component tagging, dependency ordering and difficulty scoring for sprint planning".
- **What's missing:**
  - FR-1 doesn't say that dataset names come from a PHP run, which is the Oracle's job. Providers are computed, so static parsing cannot produce them.
  - FR-1 doesn't say that `#[TestWith]` also expands.
  - FR-1's tags (Component, unit or integration, backend) are too few to plan Stories with (UJ-4, NFR-10).
- **Where:** FR-1, FR-6.
- **Fix:**
  - Dataset IDs come from the Oracle's PHPUnit run at the pin, including `#[TestWith]`, and are cross-checked against a static AST pass.
  - Each entry also carries feature tags (async, mock, fake, time, closure-serialization) and the upstream src classes it touches.

### G-27 (L). Request body capture has no limit and no streaming opt-out
- **Source:** D §5 sync request input ("Read and parse the body once in an async capture stage… Streaming uploads opt out").
- **What's missing:** FR-28 makes input synchronous by buffering the whole body. Large uploads have no stated size limit applied *before* buffering, and there is no opt-out for streaming routes.
- **Where:** FR-28, FR-31 (`ValidatePostSize`).
- **Fix:** add a consequence: `post_max_size`-equivalent limits apply before the body is buffered, and a route can opt out to receive a streaming body.

### G-28 (L). Smaller idiom and divergence items missing from §5.2 or §7.1
- **Source:** P §3.2 (real-time facades `Facades\App\Foo` depend on autoloading: drop them or use explicit `realtime(Foo)`); P §3.1 (dynamic finders `whereEmailAndName` untyped behind `.dynamicWhere()`); D §2 league/uri (RFC 3986 vs WHATWG normalisation differs); D §4 paratest (`ParallelTesting` tokens, one database per worker); D §4 fakerphp (method names differ).
- **Where:** FR-21 (real-time facades: DIV or non-goal), FR-24 (`Uri` normalisation), FR-98 (parallel testing with one database per worker, for App Developers and for the framework's CI), FR-67 (Faker name mapping).
- **Fix:** add one line each, as a DIV or a non-goal.

### G-29 (L). Dashboard and verification extras
- **Source:** P §1.1 and §1.3.2 ("Publish both numbers: % of the full inventory and % of the enabled set"); P §1.2 Corca and §6.7 (end-to-end skeleton smoke apps as a second verification layer).
- **What's missing:** FR-5 shows only the full-inventory rate. Apart from FR-60 and SM-3, there is no end-to-end app-level verification across Components.
- **Fix:**
  - FR-5 also shows the rate over the enabled set, meaning Test IDs that aren't `upstream-skip`, `php-only` or `out-of-scope`.
  - Optionally require one or two smoke apps (auth + queue + Eloquent + htmx) in CI from Phase 8.

### Note: outside the research
FR-1 and the Glossary include `laravel/ai`, `laravel/mcp` and `laravel/boost` in the Test Inventory. None of the three research files sizes or analyses them: no test counts, dependencies or PHP-specific risks. That isn't a research-to-PRD gap, but nothing backs it. Consider a short research spike before Phase 9 planning.

---

## Covered well

- **Conformance core:** the Test ID scheme with per-dataset IDs; an Expectations File whose Ratchet fails on unexpected passes as well as failures; a controlled Skip Reason vocabulary; a denominator that always includes tests not yet ported; Differential Tests against a containerised Oracle; pin bumps that produce Story diffs; `PORTING.md` and the Divergence Records before fan-out (Bun lesson); an agent harness with fast mode, a filter and greppable output (FR-1 to FR-9).
- **Async strategy:** "sync core, async edges" (DIV-1); Strict Loading as the default, with the upstream `preventLazyLoading` precedent (DIV-2, FR-63); `validateSync()` throws on IO rules (FR-52); async Blade rendering (FR-47); type-aware floating-promise lint (NFR-3); async test bodies (DIV-8).
- **Type erasure:** explicit injection tokens with optional decorators (DIV-3); discovery without reflection (DIV-7); a Class Registry with an enforced morph map and an error for unregistered names (FR-22, FR-68).
- **Closures:** only closures with explicit arguments, HMAC-signed with `APP_KEY`, and captured variables rejected at dispatch (DIV-4, FR-88).
- **Request isolation:** transaction connection pinning under concurrency (FR-55); `scoped` bindings per request (FR-19); concurrency tests (NFR-4); per-request Context (FR-81).
- **PHP arrays (core):** key order, integer-like key normalisation, and list-vs-assoc and `json_encode` shape checked against the Oracle (FR-23).
- **Data-table ports:** Doctrine Inflector pluralisation and portable-ascii transliteration (FR-24); the phpdotenv grammar (FR-20); five SQL grammars tested without servers (FR-54).
- **Test infrastructure:** `@xaravel/mockery` in Phase 0 (FR-100); fakes (FR-99); the test clock and resets of fakes, mocks and `Str` factories (FR-25, NFR-7). The `Sleep`, `Once` and `Lottery` resets are missing from NFR-7's list; add them, since Upstream's `AfterEachTestSubscriber` resets them (A §7.2).
- **htmx 4:** the new and changed request headers (FR-37); response headers (FR-38); 422 Fragment re-render on validation failure (FR-40); `HX-Location` in place of 302 for htmx Requests, explained by `fetch()` following redirects (FR-41); full layout on history restore and boosted requests (FR-42); `<hx-partial>` and OOB (FR-39); `Route.query` plus OQ-7; the CSRF token through inherited `hx-headers` (FR-32); SSE, `multipart/mixed` and WebSockets (FR-43).
- **Bun caveats already captured:** no Redis Cluster or Sentinel (FR-59); the Temporal spike (OQ-4); the bcrypt question (OQ-8, see G-14); byte-compatible encryption payloads (FR-77, see G-4); SQL Server driver deferred.
- **Sequencing:** the Phase order follows the research's corrected topology. Events and Bus come before Eloquent, Console after View, and Queue after Database and Console. Sync-only Components come first for early momentum. Database is split into grammars, then Eloquent, then Migrations.
- **Laravel 14:** a re-sync Epic is planned (§5.3). See G-25 for the missing decision on the alpha's target.
- **Symfony suites:** raised as OQ-3. See G-20 for the parity scope.
