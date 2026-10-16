---
review: verification
target: ../ARCHITECTURE-SPINE.md
lens: every committed decision was web-researched or reality-checked (versions, existence/fit, runtime behaviour)
date: 2026-10-16
runtime: Bun 1.4.3 (c6da4a4d3) macOS arm64; tsc 7.0.2 via bunx; oxlint 1.88.0 + oxlint-tsgolint 7.0.2004; Docker postgres:18 (18.6), redis:8.10.2
experiments: /private/tmp/claude-501/-Users-ea-repos-xaravel/4938bf12-5049-4602-8a93-aa5f3cdac010/scratchpad/verify/
---

# Verification review — Architecture Spine (Xaravel)

**Verdict:** All 10 Stack pins are real and current, and most runtime claims hold on Bun 1.4.3. Four claims hold only with conditions the spine does not state, and these change what agents must do:

1. **AD-6:** the lint rules do not catch un-awaited thenables unless an option is set.
2. **AD-5:** the request scope is lost in two Bun streaming body forms.
3. **AD-18:** neither `bun publish` nor plain `npm publish` can do the release on its own.
4. **Conventions:** `env = false` only works when Bun runs from the directory that holds `bunfig.toml`.

Two smaller defects are a polyfill line that fails under `tsc --strict` (AD-4) and an outdated PostgreSQL 19 GA date.

Verdict legend: **confirmed** (checked against the web, the registry or the runtime) · **wrong** (contradicted by evidence) · **partial** (true, but missing a condition the spine depends on) · **unverified** (could not be checked here).

## Top issues

| # | Where | Issue | Verdict |
| --- | --- | --- | --- |
| 1 | AD-6 | The thenables that AD-6 relies on (query builders, Relations, `PendingDispatch`, `PendingRequest`) are **not** flagged by `typescript/no-floating-promises` at default options. The rule needs `checkThenables: true`. | partial |
| 2 | AD-5 | The AsyncLocalStorage store is **lost** inside `Bun.serve` async-generator Response bodies and `type: "direct"` ReadableStreams. These are the natural forms for FR-43 SSE and `response()->stream()`. A standard ReadableStream keeps it. | partial |
| 3 | AD-18 | `bun publish` rejects provenance. `npm publish` does not rewrite the `workspace:*` that AD-2 mandates. The release must `bun pm pack` and then run `npm publish <tgz>` with npm >= 11.5.1 on Node >= 22.14. The first publish of each new `@xaravel/*` name probably needs a bootstrap step. | partial |
| 4 | Conventions (env) | `env = false` works only as a **top-level** bunfig key (it is ignored under `[run]`). It applies only when `bunfig.toml` is in the **cwd**. Running from a subdirectory still auto-loads that directory's `.env`. | partial |
| 5 | AD-4 / NFR-1 / Deferred | The literal polyfill line `Symbol.metadata ??= …` fails with TS2540 under tsc 7 strict. Service containers are Linux-only, so the macOS legs of the matrix cannot get PG/Redis that way. The PG 19 GA date moved from 2026-10-29 to 2026-11-19. | wrong / partial |

---

## A. Stack versions

### A1. Bun 1.4.3 (CI pin), engines `>=1.4`
- **Evidence:** `npm view bun dist-tags` → `latest: 1.4.3`. `gh api repos/oven-sh/bun/releases` → `bun-v1.4.3 2026-10-10`, `bun-v1.4.0 2026-08-20`. Docker `oven/bun:1.4.3` exists. Local `bun --version` → `1.4.3`.
- **Verdict:** confirmed.
- **Fix:** none.

### A2. TypeScript 7.0.2
- **Evidence:** `npm view typescript dist-tags` → `latest: 7.0.2`, `next: 7.1.0-dev.20261015.1`. The npm publish time is **2026-07-08** (GH `microsoft/typescript-go` tag `typescript/v7.0.2` 2026-07-08). `bunx -p typescript@7.0.2 tsc --version` → `Version 7.0.2`.
- **Verdict:** confirmed. The memlog's release date (2026-08-20) is wrong, but the spine does not carry the date.
- **Fix:** optionally correct the memlog date.

### A3. oxlint 1.88.0 + oxlint-tsgolint 7.0.2004
- **Evidence:** npm `oxlint latest: 1.88.0` (2026-10-13). `oxlint-tsgolint latest: 7.0.2004` (2026-10-10), with optional native deps for linux/darwin/win32 × x64/arm64. A local install runs `oxlint --type-aware` against a TS 7 project. The three named rules exist and fire (see C9).
- **Verdict:** confirmed. AD-6's reliance on their **default** options is a separate problem (C9).
- **Fix:** see C9.

### A4. `@modelcontextprotocol/server` 2.3.1
- **Evidence:** npm `latest: 2.3.1` (2026-10-05). GH release `@modelcontextprotocol/server@2.3.1`. The v1 line `@modelcontextprotocol/sdk` is at 1.32.1. Package metadata: `engines.node >=20`, deps `zod ^4.2.0` and `@modelcontextprotocol/core 2.3.1`.
- **Runtime:** `McpServer` + `WebStandardStreamableHTTPServerTransport` served from `Bun.serve` answered `initialize` (protocol 2025-11-25) and `tools/call` (returned `"5"` for add 2+3) with HTTP 200.
- **Verdict:** confirmed. The package runs on Bun.serve with Web Request/Response, so it fits the no-HTTP-framework rule.
- **Fix:** record `zod ^4` as a transitive third-party dependency in the `packages/mcp` README (AD-2 / NFR-2).

### A5. htmx.org 4.0.0 (exact pin, npm `next`)
- **Evidence:** npm `htmx.org` dist-tags `latest: 2.0.11`, `next: 4.0.0` (4.0.0 published 2026-08-28). GH `bigskysoftware/htmx v4.0.0` is not a prerelease.
- **Maintainer intent:** 2.x stays `latest` and 4.x stays `next` "until some point in early 2027" (https://runtimewire.com/article/carson-gross-htmx-4-fetch-streaming-npm-next; announcement https://four.htmx.org/announcements/2026-08-28-htmx-4.0.0-is-released).
- **Package contents:** `dist/htmx.js`, `dist/htmx.esm.js`, `htmx.d.ts`. The headers it sends include `HX-Request` and `HX-Request-Type`, so AD-12's `Vary: HX-Request, HX-Request-Type` names real headers. htmx 4 also sends `HX-Source`, `HX-Target`, `HX-Current-URL` and `HX-Boosted`.
- **Verdict:** confirmed.
- **Fix:** keep the exact pin. Never write `htmx.org@latest` or an unversioned CDN URL in the Skeleton or docs, because those resolve to 2.x.

### A6. @faker-js/faker 10.6.0
- **Evidence:** npm `latest/stable/next: 10.6.0` (2026-08-14). It imports and seeds under Bun 1.4.3.
- **Verdict:** confirmed.
- **Fix:** none.

### A7. PostgreSQL 18 (CI service)
- **Evidence:** the postgres repo has tags `REL_18_6` and `REL_19_RC1`. Docker Hub `postgres:18` exists (updated 2026-10-07), and the running container reports `PostgreSQL 18.6`.
- **Verdict:** confirmed.
- **Fix:** optionally pin `postgres:18.6` so CI does not drift on minor updates.

### A8. Redis 8.10.2 (minimum supported 7.2)
- **Evidence:** GH `redis/redis 8.10.2` (2026-09-17). Docker `redis:8.10.2` exists, and the container reports `v=8.10.2`. Bun's Redis docs say "Bun's Redis client supports Redis server versions 7.2 and up" and list Sentinel and Cluster as unsupported (https://bun.com/docs/runtime/redis). A live `Bun.RedisClient` set/get against 8.10.2 worked.
- **Verdict:** confirmed.
- **Fix:** the docs show no key-prefix option on `Bun.redis`. AD-17's `xaravel:<key>:` prefix must therefore be applied by Xaravel's Redis connection (Laravel's `prefix` option), not by the driver. One clause in AD-17 would cover it.

### A9. Oracle PHP 8.5.11
- **Evidence:** GH `php/php-src php-8.5.11` (2026-09-24), the newest 8.5 release. Docker `php:8.5.11-cli` exists. Laravel v13.37.0 requires `php ^8.3` (checked in its `composer.json`).
- **Verdict:** confirmed.
- **Fix:** none.

### A10. laravel/framework v13.37.0 (Baseline Pin)
- **Evidence:** GH release `v13.37.0` published **2026-10-16T05:00Z** (today). Its `composer.json` has `php ^8.3`, `mockery/mockery ^1.6.10`, `orchestra/testbench-core ^11.6.0` and `phpunit ^11.5.50 || ^12.5.8 || ^13.0.3`. `src/Illuminate/Contracts/composer.json` requires only `php`, `psr/container` and `psr/simple-cache`, which supports AD-1's premise.
- **Verdict:** confirmed.
- **Fix:** none. Laravel ships about weekly, so the Pin will be stale within days; that is expected.

---

## B. Existence and fit of the named technologies

### B1. GitHub Actions runners for the NFR-1 matrix (linux/macos × x64/arm64)
- **Labels:** the GitHub docs (https://docs.github.com/en/actions/reference/runners/github-hosted-runners) list `ubuntu-24.04` / `ubuntu-26.04` (x64), `ubuntu-24.04-arm` / `ubuntu-26.04-arm` (arm64), `macos-15` / `macos-26` (arm64) and `macos-15-intel` / `macos-26-intel` (x64). All are available to public and private repos.
- **Intel horizon:** GitHub's macOS 13 retirement changelog says x86_64 macOS support ends when the macOS 15 image retires in **Fall 2027** (https://github.blog/changelog/2025-09-19-github-actions-macos-13-runner-image-is-closing-down/).
- **Service containers:** "If your workflows use … service containers, then you must use a Linux runner" (https://docs.github.com/en/actions/tutorials/use-containerized-services/use-docker-service-containers).
- **Verdict:** partial.
  - All four OS/arch cells exist today.
  - The spine's matrix line "linux/macos x x64/arm64, PG 18, Redis 8" cannot get PG and Redis from `services:` on macOS.
  - macOS x64 has a known end date.
- **Fix:**
  - State that macOS legs install PG 18 and Redis natively (Homebrew `postgresql@18`, `redis`), or that macOS legs run only the SQLite and no-backend variants.
  - Add "macOS x64 leg dropped when GitHub retires macos-15-intel (Fall 2027)" to Deferred.

### B2. npm trusted publishing with provenance (AD-18)
- **npm requirements:** "Trusted publishing requires npm CLI version 11.5.1 or later and Node version 22.14.0 or higher". It works only on GitHub-hosted runners. Provenance is generated automatically, but only for a **public repo and public package** (https://docs.npmjs.com/trusted-publishers).
- **Bun:** the docs say "`bun publish` cannot generate provenance statements yet". `--provenance` or `publishConfig.provenance` is an error (https://bun.com/docs/cli/publish). The local `bun publish --help` has no provenance or OIDC flag; it authenticates by `NPM_CONFIG_TOKEN` or OTP only.
- **workspace protocol (experiment in `verify/ws`):**
  - `bun pm pack` rewrites `"@xv/a": "workspace:*"` to `"0.3.1"`, in both `dependencies` and optional `peerDependencies`.
  - `npm pack` (npm 10.9.4) leaves `"workspace:*"` literal, so a direct `npm publish` would publish uninstallable packages.
- **First publish:** community guides (e.g. https://developer.wordpress.org/playground/handbook/contributing/releases/, https://scalar.com/products/sdks/publishing/typescript) say a trusted publisher can only be configured on an **existing** package. A brand-new package therefore needs one bootstrap publish, by hand or with a token. The npm docs neither confirm nor deny this.
- **Verdict:** partial. The mechanism exists, but AD-18 needs a specific toolchain recipe, and "No other … credential can publish" conflicts with bootstrapping roughly 40 new package names.
- **Fix:** amend AD-18.
  - The release job uses `bun pm pack` per package, then `npm publish <tarball> --access public`, with npm >= 11.5.1 and Node >= 22.14 installed in that job, and `permissions: id-token: write`.
  - The repo and packages must be public for provenance.
  - Add a one-time, Maintainer-run bootstrap: publish placeholder `0.0.0` names, or use org-level trusted-publisher config if npm supports it. Configure each package's trusted publisher, then revoke the bootstrap token.

### B3. oxlint type-aware on tsgo / TS 7
- **Evidence:** `oxlint --type-aware` with tsgolint 7.0.2004 type-checked a `tsc 7.0.2` project (`module: preserve`, `strict`) and reported typed diagnostics. tsgolint's version line (7.0.x) tracks TS 7. The v7.0.2004 release notes contain fixes to `no-floating-promises` and `no-misused-promises`.
- **Verdict:** confirmed (see C9 for the option gap).
- **Fix:** none.

---

## C. Runtime claims

### C1. AD-11 — `Bun.Transpiler` turns TS into JS at runtime; modules cached as `storage/framework/views/<hash>.js`
- **Experiment:** `verify/rt/transpiler.ts`.
  - `new Bun.Transpiler({ loader: "ts" }).transformSync(src)` strips the types and keeps `export async function render` and the fragment exports.
  - Writing the output to `cache/abc123.js` and loading it with `import()` worked. `await` inside the expressions worked. `scanImports` works.
- **Caching experiment:** `verify/rt/reimport.ts`.
  - Rewriting a module at the **same path** and importing it again returns the **stale** module (`1` after rewrite to `2`).
  - A `?t=` query, or `delete require.cache[path]`, loads the new code.
- **Verdict:** confirmed, with a caveat. Laravel names compiled views by `sha1(path)`. If Xaravel copies that, recompiling a changed view does not take effect in a running process.
- **Fix:**
  - AD-11 should say `<hash>` is a hash of the **compiled content** (or path + source mtime), or that the loader imports with a version query.
  - Note that `Bun.Transpiler` does not type-check, so a type error in a Blade expression only shows at runtime unless `view:cache` also runs tsc.

### C2. AD-9 — `bun:sqlite` `safeIntegers`
- **Experiment:** `verify/rt/sqlite.ts`.
  - With default options, `9007199254740993` comes back as `number 9007199254740992` (lossy).
  - With `{ safeIntegers: true }` it comes back as `bigint 9007199254740993`. Ints and rowids also become `bigint`.
  - A per-statement `stmt.safeIntegers(true)` exists, and binding `2n**62n` round-trips.
- **Quirk:** `new Database(":memory:", {})` throws `SQLITE_MISUSE: flags must include SQLITE_OPEN_READONLY or SQLITE_OPEN_READWRITE`. Pass `undefined`, or include `create` / `readwrite`, when building options dynamically.
- **Verdict:** confirmed.
- **Fix:** none to the spine. Note the quirk for the database Epic.

### C3. AD-9 — `Bun.sql` `bigint: true`
- **Experiment:** `verify/rt/pg.ts` against Postgres 18.6.
  - With default options, `int8` comes back as `string "9007199254740993"`.
  - With `{ bigint: true }` it comes back as `bigint`.
  - `int4` is `number`. `numeric` is `string` in both modes.
- **Verdict:** confirmed.
- **Fix:** none. Note for DIV-9 / decimal casts that `numeric` arrives as a string.

### C4. Conventions — bunfig `env = false` turns off Bun's `.env` autoload
- **Experiment:** `verify/envt`, with `.env` and `.env.local` present.
  - With no bunfig, both files load.
  - With top-level `env = false`, nothing loads for `bun x.ts`, `bun run <script>` or `bun test`. `--no-env-file` behaves the same.
  - **`[run]\nenv = false` is ignored** (both files still load).
  - With `bunfig.toml` in the parent and cwd = subdirectory, the subdirectory's `.env` **is loaded**: `bunfig.toml` is not found by walking up. Running a script by absolute path from another cwd also loads that cwd's `.env`.
- **Verdict:** partial. The key works, but only top-level and only from the project root.
- **Fix:**
  - Spell out "top-level `env = false` (not under `[run]`)".
  - Add a guard: the Skeleton's entry scripts (artisan equivalent, server entry) use `#!/usr/bin/env -S bun --no-env-file`, or the scripts in `package.json` pass `--no-env-file`.
  - Alternatively, Xaravel's loader detects keys that Bun pre-populated. That requires recording `process.env` before Bun runs, which is not possible, so prefer the flag.

### C5. AD-5 — AsyncLocalStorage propagation in Bun
- **Experiments:** `verify/rt/als.ts` and `verify/rt/als2.ts`.
- **Kept the store (expected value seen):**
  - `await`, `setTimeout` (both the callback and awaiting it), `setInterval`, `setImmediate`, `queueMicrotask`, `process.nextTick`, `.then`.
  - `Bun.sleep`, `Bun.file().text()`, `fetch`, awaiting a custom thenable, async generators.
  - Two units interleaved at random `await`s did not mix stores.
  - Inside `Bun.serve`: the `fetch` handler after `await`, the `routes` handler, a standard `ReadableStream` `pull` (including 4 pulls under backpressure with `highWaterMark: 0`), and SSE built from `start()` plus `setInterval` enqueues.
  - No leak into a handler that did not call `run()`.
- **Lost the store (`undefined`):**
  - a `Bun.serve` Response whose body is an **async generator function**, both before and after `await`;
  - a `ReadableStream({ type: "direct", pull })`, both before and after `await`.
- **Workarounds verified:**
  - `AsyncLocalStorage.snapshot()` around the generator work restores the frame.
  - `AsyncLocalStorage.bind(pull)` for direct streams restores it across `await`.
- **EventEmitter:** a listener registered in A and emitted in B sees B. This is Node semantics, but it matters for the events dispatcher only if it relies on a Node EventEmitter.
- **Verdict:** partial. The general claim is true, but two Bun streaming body forms drop the frame.
- **Fix:** add to AD-5:
  - "Framework code that returns a streamed body (`response()->stream()`, `eventStream()`, SSE for FR-43, streamed views) builds a standard `ReadableStream`, or wraps the producer with `AsyncLocalStorage.bind` / `snapshot()`. Async-generator bodies and `type: "direct"` streams are wrapped."
  - Add an NFR-4 test that reads the Scope Frame inside each streaming form.

### C6. AD-4 / AD-8 — standard decorators, auto-accessor decorators, `Symbol.metadata` polyfill
- **Experiment:** `verify/deco`.
- **Without the polyfill:**
  - `Symbol.metadata` is `undefined` on Bun 1.4.3.
  - `ctx.metadata` is still an object, and class and method decorators share the same object.
  - Bun already stores it on `Class[Symbol.for("Symbol.metadata")]`. The polyfill `Symbol.metadata ??= Symbol.for("Symbol.metadata")` therefore matches Bun's key, and reading `Svc[Symbol.metadata]` works afterwards.
- **Subclass metadata:** it inherits from the parent through the prototype chain.
- **Auto-accessor with the AD-7 Proxy:**
  - `@hasMany(() => Post) accessor posts!: Post[]` on a `Model` whose constructor returns a Proxy works.
  - Reading an unloaded relation throws `LazyLoadingViolationException`, and reading a loaded one returns its value.
  - The subclass field `name = "default-name"` is captured by the `defineProperty` trap as an attribute default.
  - `declare email` emits nothing, and setting it goes through `setAttribute`.
  - `instanceof` still works through the Proxy.
- **tsc 7.0.2 strict:** the same decorated classes type-check with no errors.
- **The polyfill line as written fails under tsc:** `Symbol.metadata ??= Symbol.for("Symbol.metadata")` → `TS2540: Cannot assign to 'metadata' because it is a read-only property.`
- **Mode trap:** Bun honours `experimentalDecorators: true` in tsconfig and **silently** switches to legacy decorators (the second argument becomes `undefined`). Verified in `verify/legacy` vs `verify/stdd`.
- **Verdict:** behaviour confirmed. The literal code line in AD-4 is **wrong** for `tsc --strict`.
- **Fix:**
  - Change AD-4's line to `(Symbol as { metadata?: symbol }).metadata ??= Symbol.for("Symbol.metadata");`, or use `Object.defineProperty`.
  - Add a CI check that no tsconfig (repo, Skeleton, generated app) sets `experimentalDecorators` or `emitDecoratorMetadata`.

### C7. AD-9 — `unique symbol` brand interface forces the field through `implements` (tsc)
- **Experiment:** `verify/deco/brand.ts` with `bunx -p typescript@7.0.2 tsc -p`.
  - `class BadJob implements ShouldQueue {}` → `TS2420 … Property '[ShouldQueue]' is missing`.
  - `readonly [ShouldQueue] = false` → `TS2416 … 'false' is not assignable to 'true'`.
  - `readonly [ShouldQueue] = true as const` passes.
  - Using `Symbol.for(...)` as the `unique symbol` initializer and merging a same-name `const` with an `interface` both type-check.
  - AD-1's token pattern (`interface Mailer` + `const Mailer: unique symbol`) also type-checks under `verbatimModuleSyntax`.
- **Verdict:** confirmed.
- **Fix:** none.

### C8. AD-6 — "callbacks passed to sync APIs are typed sync-only, so an async callback is a type error"
- **Experiment:** `verify/deco/cb.ts` with tsc 7.0.2.
  - `cb: (x) => void` **accepts** an async callback (no error).
  - `cb: (x) => void | false` rejects it (TS2345).
  - Generic `map<U>(cb: (x) => U)` **accepts** it (U = Promise).
  - Only a guard such as `(x) => U extends PromiseLike<unknown> ? never : U` rejects it (TS2322).
  - oxlint `no-misused-promises` (default `checksVoidReturn`) does flag the plain `void` case (`[1,2].forEach(async …)` flagged).
- **Verdict:** partial. The rule describes an outcome that TS does not give by default. Agents porting `map`, `tap`, `when`, `transform`, `pipe` and so on will type them naturally and accept async callbacks.
- **Fix:**
  - Name the mechanism in AD-6: a shared `SyncReturn<U>` helper type in `@xaravel/support`, applied to every generic-return callback.
  - Rely on `no-misused-promises` (checksVoidReturn) for `void` callbacks.
  - Add one type test per Collections method.

### C9. AD-6 / NFR-3 — oxlint rules `no-floating-promises`, `await-thenable`, `no-misused-promises`
- **Experiment:** `verify/lint/src/{a,b}.ts`, oxlint 1.88.0 `--type-aware`, tsgolint 7.0.2004, TS 7.0.2.
- **At default options:**
  - flagged: a floating `Promise` call, `await 5` (await-thenable), an async callback where void is expected, and a Promise in a conditional;
  - **not flagged:** an un-awaited `new Builder().where("x")` where `Builder implements PromiseLike`; a function returning `PromiseLike<number>`; a structurally thenable object.
- **With `"typescript/no-floating-promises": ["error", { "checkThenables": true }]`:** all three thenable cases are flagged.
- **Verdict:** partial. AD-6 makes query builders, Relations, `PendingDispatch` and `PendingRequest` thenable, and NFR-3 as configured would miss every un-awaited one: `User.where(...).update(...)` without `await` passes lint.
- **Fix:** bind the option in AD-6: "`no-floating-promises` runs with `checkThenables: true`". Commit the shared `.oxlintrc.json` as a Protected Path, so agents cannot weaken rule options.

### C10. AD-13 — supervisor kills a child that is stuck in synchronous JS
- **Experiment:** `verify/rt/sup.ts`. A `Bun.spawn` child running `while(true){}` was killed with `SIGKILL` after 300 ms. `exited` gave `137` and `signalCode: "SIGKILL"`.
- **Verdict:** confirmed.
- **Fix:** none.

### C11. OQ-7 — does `Bun.serve` accept the HTTP `QUERY` method?
- **Experiment:** `verify/rt/query.ts`.
  - `curl -X QUERY --data 'select=*'` against a `fetch` handler → `HTTP/1.1 200`, with `req.method === "QUERY"` and the body readable.
  - Bun's `fetch()` client sends `QUERY` with a body, and `new Request(…, { method: "QUERY" })` keeps the method.
  - **But** a `routes: { "/q": { QUERY: … } }` per-method handler is not matched; the request falls through to `fetch` (404 fallback).
- **Verdict:** answered. `QUERY` works end to end through the `fetch` handler, which is the path Xaravel's own router uses (no third-party framework). Bun's built-in `routes` method map does not support it.
- **Fix:** close OQ-7 as "supported via `fetch`". Add one line: Xaravel routing must not delegate method dispatch to `Bun.serve` `routes`.

### C12. Memlog spot-checks
- **Laravel `composer.json` dependencies:** re-verified, matches.
- **htmx dist-tags:** re-verified, matches.
- **Redis 7.2 minimum:** re-verified, matches.
- **TS 7.0.2 release date:** the memlog date is off (actual 2026-07-08).
- **Memlog line 14 (decorators, Proxy, ALS across `await` + `setTimeout`):** re-verified, true. The ALS line was too narrow; see C5.

---

## D. Other dated statements

### D1. Deferred: "PostgreSQL 19 in the CI matrix — After 19 GA (planned 2026-10-29)"
- **Evidence:** the PostgreSQL release team (J. Katz, pgsql-hackers, 2026-10-10) wrote: "The release team decided to move the PostgreSQL 19 GA to November 19". An RC2 was added for November 12 (https://www.postgresql.org/message-id/f161fbb7-e193-42eb-bec7-4cfc1af74a50%40postgresql.org). The `REL_19_RC1` tag exists.
- **Verdict:** wrong (out of date). The memlog line 27 date has the same problem.
- **Fix:** change it to "planned 2026-11-19 (RC2 2026-11-12)".

### D2. AD-17 — Redis key prefix `xaravel:<key>:`
- **Evidence:** the Bun Redis docs list no prefix option (see A8).
- **Verdict:** unverified as stated. It is feasible only at the framework layer.
- **Fix:** see A8.

### D3. AD-1 — "A contract imported with `import type` for injection is a lint error"
- **Evidence:** no oxlint built-in rule for this was checked. The decorator argument is a value, so `@inject({ m: Mailer })` with `Mailer` imported by `import type` is already a tsc error (TS1361: value position).
- **Verdict:** unverified as a lint rule. It is probably covered by tsc instead.
- **Fix:** say "a type error (TS1361) or lint error", or name the custom oxlint JS-plugin rule if one is intended.
