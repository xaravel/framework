# Jaravel dependency-replacement map

Researched 2026-10-15. Source of truth: `laravel/framework` shallow clone at commit `86864f3` (Application::VERSION = **13.37.0**), cloned read-only into `tmp/research/deps-laravel/framework`. Nothing in the clone was executed.

Target stack: Bun 1.4.x (released 2026-08-20, first Rust build), Hono 4.x (npm latest 4.13.13), htmx 4.0.0 (released 2026-08-28, npm tag `next`).

npm weekly downloads come from `api.npmjs.org/downloads/point/last-week` and were fetched 2026-10-15. "Last publish" is the registry `modified` date and is approximate.

Legend for **Tier**: **B** = Bun built-in, **H** = Hono built-in, **N** = npm package, **W** = write ourselves (often as a port of the PHP source). `?` = unverified, see the notes.

---

## 0. Inventory: what laravel/framework actually requires

### Root `composer.json` → `require` (non-ext, non-illuminate)
brick/math, doctrine/inflector, dragonmantank/cron-expression, egulias/email-validator, fruitcake/php-cors, guzzlehttp/guzzle, guzzlehttp/promises, guzzlehttp/psr7, guzzlehttp/uri-template, laravel/prompts, laravel/serializable-closure, league/commonmark, league/flysystem, league/flysystem-local, league/uri, monolog/monolog, nesbot/carbon, nunomaduro/termwind, psr/container, psr/http-message, psr/log, psr/simple-cache, ramsey/uuid, symfony/console, symfony/error-handler, symfony/finder, symfony/http-foundation, symfony/http-kernel, symfony/mailer, symfony/mime, symfony/polyfill-php84/85/86, symfony/process, symfony/routing, symfony/uid, symfony/var-dumper, tijsverkoyen/css-to-inline-styles, vlucas/phpdotenv, voku/portable-ascii, composer-runtime-api.

PHP extensions: ctype, filter, hash, mbstring, openssl, session, tokenizer. Suggested extensions: apcu, fileinfo, ftp, gd, memcached, pcntl, pdo, posix, redis.

**Note:** `symfony/css-selector` is **not** a direct dependency. It arrives transitively through `tijsverkoyen/css-to-inline-styles`. Other transitive Symfony packages that are not imported directly include event-dispatcher (through http-kernel; one direct import in Foundation/Console/Kernel), string, service-contracts, deprecation-contracts, and translation-contracts (through carbon). This list comes from general knowledge and was not checked against a lockfile.

### Per-component external requires (from `src/Illuminate/*/composer.json`)

| Component | require (external) | suggest (external) |
|---|---|---|
| Broadcasting | psr/log | ably/ably-php, pusher/pusher-php-server, symfony/http-client, symfony/mercure, web-token/jwt-library |
| Cache | — | ext-apcu, ext-memcached, symfony/cache |
| Collections | symfony/polyfill-php84/85/86 | symfony/var-dumper |
| Concurrency | laravel/serializable-closure | spatie/fork |
| Console | laravel/prompts, nunomaduro/termwind, symfony/console, symfony/process | ext-pcntl, dragonmantank/cron-expression, guzzlehttp/guzzle |
| Container / Contracts | psr/container, psr/simple-cache | — |
| Cookie | symfony/http-foundation, symfony/http-kernel | — |
| Database | brick/math, laravel/serializable-closure | ext-pdo, fakerphp/faker, symfony/finder |
| Encryption | (ext-openssl, ext-hash, ext-mbstring) | — |
| Filesystem | symfony/finder | league/flysystem (+aws-s3-v3, ftp, sftp-v3), symfony/filesystem, symfony/mime, ext-fileinfo, ext-ftp |
| Http | fruitcake/php-cors, guzzlehttp/{guzzle,promises,psr7,uri-template}, psr/http-message, symfony/http-foundation, symfony/http-kernel, symfony/mime | ext-gd |
| Image (new in 12/13) | — | intervention/image, ext-fileinfo |
| Log | monolog/monolog, psr/log | — |
| Mail | league/commonmark, psr/log, symfony/mailer, tijsverkoyen/css-to-inline-styles | aws/aws-sdk-php, resend/resend-php, symfony/http-client, symfony/mailgun-mailer, symfony/postmark-mailer |
| Process | symfony/process | — |
| Queue | laravel/serializable-closure, ramsey/uuid, symfony/process | aws/aws-sdk-php, pda/pheanstalk, ext-pcntl, ext-posix, ext-pdo |
| Redis | — | ext-redis, predis/predis |
| Routing | symfony/http-foundation, symfony/http-kernel, symfony/routing | php-http/discovery, symfony/psr-http-message-bridge |
| Session | symfony/finder, symfony/http-foundation | (ext-session) |
| Support | doctrine/inflector, nesbot/carbon, voku/portable-ascii | laravel/serializable-closure, league/commonmark, league/uri, ramsey/uuid, symfony/process, symfony/uid, symfony/var-dumper, vlucas/phpdotenv |
| Testing | — | brianium/paratest, mockery/mockery, phpunit/phpunit |
| Validation | brick/math, egulias/email-validator, symfony/http-foundation, symfony/mime | ramsey/uuid |
| View | (ext-tokenizer) | — |
| Auth, Bus, Config, Events, Hashing, JsonSchema, Notifications, Pagination, Pipeline, Translation, Macroable, Conditionable, Reflection | none | — |

### Import weight (counts of `use <Namespace>` lines in `src/Illuminate`). This shows where porting effort goes.

| Namespace | Imports | Where |
|---|---|---|
| Symfony\Component\Console | **253** | Console, Foundation/Console, every `make:*`/`*:cache` command |
| Symfony\Component\HttpFoundation | 62 | Http, Routing, Session, Cookie, Foundation, Validation |
| League\Flysystem | 51 | Filesystem |
| Symfony\Component\Mailer | 40 | Mail transports |
| Carbon | 34 | Support (everywhere: Date facade, casts, cache TTLs, queue delays) |
| Symfony\Component\HttpKernel | 26 | HttpException classes, Kernel interfaces |
| Symfony\Component\Process | 24 | Process, Console, Queue Listener, Schema dump, Scheduling |
| Monolog | 23 | Log |
| Symfony\Component\Mime | 19 | Mail, Filesystem, Validation (MimeTypes) |
| Laravel\Prompts | 17 | Console |
| Symfony\Component\Mercure | 15 | Broadcasting (new Mercure broadcaster) |
| Symfony\Component\VarDumper | 13 | dump()/dd(), Http client `dd()` |
| Symfony\Component\Finder | 11 | Filesystem, Session file handler, generators |
| Egulias | 11 | Validation `email` rule |
| Ramsey\Uuid | 10 | Str::uuid/orderedUuid, Queue job ids |
| Laravel\SerializableClosure | 10 | queued closures, batches, Concurrency, route caching |
| League\CommonMark | 9 | Str::markdown, Mail Markdown |
| GuzzleHttp\* | ~25 | Http client |
| Symfony\Component\Routing | 8 | Route compiler, compiled route matcher |
| Symfony\Component\ErrorHandler | 8 | Exception handler / renderer |
| Dotenv | 6 | Bootstrap/LoadEnvironmentVariables, Support\Env |
| Brick\Math | 6 | Eloquent `decimal:N` cast, Validation numeric/decimal/size |
| League\Uri | 4 | Support\Uri, UriQueryString |
| Symfony\Component\Uid | 3 | Str::ulid, BinaryCodec |
| Cron | 2 | Console/Scheduling |
| Termwind | 5 files | Console View Components (alert, bullet-list, line, two-column-detail), `serve`, `queue:work` |
| voku, Doctrine\Inflector, TijsVerkoyen, Fruitcake | 1 each | Str::ascii/slug, Pluralizer, Mail Markdown CSS inlining, HandleCors |

---

## 1. Replacement map: Symfony components

| Dependency | Laravel uses it for | Replacement | Tier | Notes / Bun caveats |
|---|---|---|---|---|
| symfony/http-foundation | `Illuminate\Http\Request` extends Symfony Request; Response, JsonResponse, RedirectResponse, StreamedResponse, BinaryFileResponse, Cookie, ParameterBag/InputBag/HeaderBag/FileBag/ServerBag, UploadedFile, IpUtils, AcceptHeader, Session interfaces | Port only the parts that leak into Laravel's tests, as `@jaravel/http-foundation`. Back it with Web `Request`/`Response`: Hono `c.req.raw` on input, a Web `Response` on output. Use **Bun.Cookie/Bun.CookieMap** for cookies, Web `File`/`FormData` plus `Bun.write` for uploads, and `new Response(Bun.file(p))` for file responses | W (+B, H) | Details in §6.1. About 27 test files import HttpFoundation directly (`tests/Http/HttpRequestTest.php` alone is 2,138 lines). |
| symfony/http-kernel | `HttpKernelInterface`, `TerminableInterface`, HttpException hierarchy (`NotFoundHttpException`, `HttpException`), `Kernel` constants | Write: a small set of exception classes plus interfaces. Hono's `HTTPException` can wrap them at the edge | W | Trivial. |
| symfony/routing | `Route::compile()` uses Symfony's `RouteCompiler` (regex, optional params, host patterns); `CompiledRouteCollection` uses `CompiledUrlMatcher`/`CompiledUrlMatcherDumper` | Port Symfony `RouteCompiler` (~300 LOC). The Laravel Router owns matching, and Hono registers one catch-all handler. Bun 1.4 ships **`URLPattern`** natively, which can serve as an alternative matcher. Hono's `RegExpRouter` can be adopted later as a fast prefilter | W (+B) | Laravel route tests (optional params, `where`, domain routes, 405, HEAD-for-GET, fallback, `route:cache`) need Laravel semantics. Hono's matcher semantics differ. |
| symfony/console | Base `Command`, `Application`, Input/Output, verbosity, `Table`, `ProgressBar`, `QuestionHelper`, `OutputFormatter` `<info>` tags, signals | **Write** a slim Symfony-Console-compatible core (`@jaravel/console`). Do not use citty/commander as the core. Details in §6.2 | W | The largest single dependency (253 imports). |
| symfony/process | `Illuminate\Process` (Process::run/start/pool/pipe/fake), `queue:listen`, `schema:dump`, scheduler background tasks, `composer` wrapper | **Bun.spawn / Bun.spawnSync / Bun.$** (shell). Use **Bun.Terminal** (new built-in PTY in 1.4) for `tty()` | B | Timeouts: `AbortSignal.timeout` plus `proc.kill()`. Idle timeout: write it. Signals: `proc.kill(sig)`. |
| symfony/finder | `Filesystem::files/allFiles/directories`, file session GC, `make:*` stubs, config/event discovery | **Bun.Glob** + `node:fs` `readdir({recursive:true})` | B | Use `tinyglobby` (215M/wk) only if Bun.Glob misses a pattern feature. |
| symfony/mailer | Transports (SMTP, sendmail, SES, Postmark, Mailgun, Resend, Cloudflare, log, array, failover, roundrobin), `SentMessage`, `Envelope` | Write the Laravel `MailManager` plus thin transport classes. Use **nodemailer** (25.7M/wk, v10.1.1, active; README states ESM build "runs on Bun") for SMTP and sendmail. Use `fetch` for Postmark/Mailgun/Resend/Cloudflare APIs, and `@aws-sdk/client-sesv2` (5.2M/wk) for SES | N + W | Tests assert on Symfony `Email`/`SentMessage` objects, so wrap our own Email model around nodemailer's composer. |
| symfony/mime | `Email`, `Address`, `Part`s, attachments, embedding; `MimeTypes` guessing in Filesystem/Validation | Write the Email/Address model. For MIME serialization, use nodemailer's `MailComposer`. For extension→type, use **`Bun.file(p).type`** or `mime-types` (287M/wk). For content sniffing (finfo), use **`file-type`** (58M/wk) | W + N + B | Validation `mimes`/`mimetypes` rules need magic-byte sniffing. |
| symfony/var-dumper | `dump()`, `dd()`, `Collection::dump()`, Http client `dd()` | **Bun.inspect** for CLI. **`@poppinss/dumper`** (23M/wk; AdonisJS; HTML and console dumps) for browser output | B + N | — |
| symfony/error-handler | `HandleExceptions` bootstrap, `HtmlErrorRenderer` fallback, `FlattenException`; Laravel 12+ has its own exception page (`Foundation/Exceptions/Renderer`) | Port Laravel's Renderer. Use **`youch`** v4 (25M/wk) as the reference/fallback page, `error-stack-parser` (29M/wk) for frames, and `process.on('uncaughtException'/'unhandledRejection')` | W + N | JS has no PHP-style warnings→exceptions, so most of HandleExceptions does not apply. |
| symfony/uid | `Str::ulid()`, `Str::isUlid`, ULID↔UUID conversions | **`ulid`** (12.2M/wk) or `ulidx`; UUIDv7 via **Bun.randomUUIDv7()** | N + B | — |
| symfony/polyfill-php84/85/86 | `array_find`, `array_any`, etc. | Not applicable | — | — |
| symfony/mercure (suggest) | Mercure broadcaster | `fetch` POST to hub + **jose** (154M/wk) for JWT | W + N | — |
| symfony/http-client (suggest) | Mercure, mail API transports | `fetch` | B | — |
| symfony/psr-http-message-bridge, php-http/discovery (suggest) | PSR-7 request injection into routes | Not applicable: Web `Request` is already the standard | — | Optional: allow injecting the raw `Request` into controllers. |
| symfony/cache, symfony/filesystem (suggest) | PSR-6 bridge; `relativeLink` | `node:path` relative | — | — |
| symfony/translation (dev) | Test-only | Port Laravel `Translator` + `MessageSelector`; **Intl.PluralRules** for plural forms | W + B | — |
| symfony/css-selector (transitive) | Used by css-to-inline-styles | `css-select` (85M/wk), pulled in by juice/cheerio | N | — |

## 2. Replacement map: other PHP packages

| Dependency | Laravel uses it for | Replacement | Tier | Notes / Bun caveats |
|---|---|---|---|---|
| nesbot/carbon | `Illuminate\Support\Carbon`, `Date` facade, `now()`, casts, `diffForHumans`, `setTestNow`, `CarbonInterval`, `CarbonPeriod` | **Temporal (native in Bun 1.4, on by default)** plus our own `Carbon`/`CarbonImmutable`/`CarbonInterval`/`CarbonPeriod` façade. Fallback: **temporal-polyfill** (4.8M/wk, v1.0.6, published 2026-10-13). If Temporal is avoided, the closest semantics are luxon (42M/wk, but last release 2025-09) | B + W | Details in §6.3. |
| league/flysystem (+local, aws-s3-v3, ftp, sftp-v3, path-prefixing, read-only) | `Storage` disks, `FilesystemAdapter`, `Storage::fake` | Write the Flysystem-shaped adapter interface. **Local:** `Bun.file`/`Bun.write`/`node:fs`. **S3/R2/MinIO:** **Bun.S3Client / Bun.s3**. **FTP:** `basic-ftp` (27M/wk). **SFTP:** `ssh2-sftp-client` (2.8M/wk). **Reference design:** **flydrive** (AdonisJS, 65k/wk, v2.2.0, active). `unstorage` (24M/wk) is KV-oriented and a poor fit | B + W (+N) | Flysystem semantics (visibility, temporaryUrl, checksum, directory listing with `deep`) are what the tests check. `ssh2` has a native addon; Bun compatibility for it is unverified. |
| league/commonmark | `Str::markdown()`, `Str::inlineMarkdown()`, Mail Markdown (CommonMark core + Table extension) | **Bun.markdown** (built-in, GFM tables/strikethrough/task lists; docs mark the API "unstable"). Fallback for extension/HTML parity: **markdown-it** (28.8M/wk, active) | B (+N) | Byte-identical HTML with league/commonmark is not guaranteed. Expect to adjust `SupportStrTest` expectations. Bun.markdown output is **not sanitized**, so we must implement `html_input: strip/escape` and `allow_unsafe_links` ourselves. |
| monolog/monolog | `LogManager` channels: single, daily (Rotating), slack, syslog, errorlog, stderr, stack, custom `monolog` driver with handler/formatter/processors, `LineFormatter`, `JsonFormatter` | **Write** a minimal Monolog-shaped core (Logger, Handler, Formatter, Processor, LogRecord, Level). Tests reference Monolog handler classes. Optionally provide a pino (54M/wk) handler | W (+N) | pino transports run in `worker_threads`. Bun supports workers, but pino-transport-on-Bun issues have been reported historically (not re-verified). Use `Bun.file().writer()` for stream handlers. |
| ramsey/uuid | `Str::uuid()`, `Str::orderedUuid()`, `Str::isUuid`, queue job UUIDs, `HasUuids` | **crypto.randomUUID()**, **Bun.randomUUIDv7()**; **`uuid`** (318M/wk, v14) for v1/v3/v5/v6 and parse/validate | B + N | `orderedUuid` is Ramsey's "timestamp-first COMB", so write it (~30 LOC). |
| dragonmantank/cron-expression | Scheduler: `isDue`, `getNextRunDate`, `getPreviousRunDate`, timezones | **croner** (10M/wk, v10.0.1, zero deps, Bun ≥1.0 supported): `nextRun`, `previousRuns`, `match(date)`, `timezone`, `L`/`W`/`#`, `@hourly` aliases. **Bun.cron.parse()** only computes the next fire time | N (+B) | For the OS-level "every minute" `schedule:run` entry, **Bun.cron(path, schedule, title)** registers crontab/launchd/Task Scheduler jobs. That could replace the docs' crontab line. Bun 1.4 changed Bun.cron to use local time by default. |
| egulias/email-validator | `email:rfc,strict,dns,spoof,filter` rule | **Port** the egulias lexer/parser (RFC 5321/5322 + warnings). DNS: `node:dns` `resolveMx`. `filter`: port PHP `FILTER_VALIDATE_EMAIL` regex | W | npm `email-validator` (2.2M/wk) is a simple regex and fails RFC tests. **Spoof check** needs ICU Spoofchecker, which JS lacks. Approximate it with `Intl.Segmenter` + a Unicode confusables table, or mark it unsupported. |
| doctrine/inflector | `Str::plural/singular` (Pluralizer) | **Port** Doctrine's English rules: Inflectible/Uninflected/Irregular data, ~500 LOC | W | `pluralize` (41M/wk) has different rules and was last released in 2019 (8.0.0), so it fails `SupportPluralizerTest`. |
| brick/math | Eloquent `decimal:N` cast (BigDecimal::toScale HALF_UP), Validation `decimal`/`numeric`/`size`/`between` comparisons | **BigInt** (native) + **decimal.js** (100M/wk) or **big.js** (34M/wk) | B + N | big.js is the smallest. decimal.js covers more rounding modes. |
| voku/portable-ascii | `Str::ascii($v, $lang)`, `Str::slug`, `Str::transliterate` | **Port the data tables** (PHP arrays → JSON, generated once). Alternatives: `any-ascii` (113k/wk) or `transliteration` (852k/wk), but their outputs differ | W | Language-specific maps (`de`, `bg`, etc.) are tested. |
| nunomaduro/termwind | Tailwind-in-terminal rendering for 4 Console view components, plus `terminal()->width()` | **Port** the components directly to ANSI. **Bun.stringWidth / Bun.wrapAnsi / Bun.sliceAnsi** (built-in in 1.4), `process.stdout.columns`, **picocolors** (248M/wk) or `node:util.styleText` | B + W | Light usage, so no Termwind port is needed. |
| laravel/prompts | `text`, `select`, `multiselect`, `confirm`, `search`, `suggest`, `password`, `spin`, `progress`, `table`, `form`; `Prompt::fake()` in tests | **Port** laravel/prompts on raw stdin (`process.stdin.setRawMode`). **@clack/core** (30M/wk) can serve as a state-machine reference, with **@clack/prompts** (30M/wk, v1.8.1) as a fallback | W (+N) | Details in §6.2. |
| laravel/serializable-closure | Queued closures, `Bus::batch` callbacks, `Concurrency::run`, `Route` closure caching, `once()` | **Cannot be replicated faithfully**: `Function.prototype.toString()` loses captured scope. Write a restricted model: (a) closures registered by stable name/module export, (b) invokable job classes serialized with a class registry, (c) static analysis that rejects free variables. Sign payloads with **Bun.CryptoHasher** HMAC | W | **Semantic divergence.** Mark the affected tests as adapted. Concurrency `process` driver: `Bun.spawn` a worker entry module. `fork` driver: Bun `Worker`. |
| guzzlehttp/guzzle, /psr7, /promises | `Illuminate\Http\Client` (`Http::get`, pools, retries, middleware, `Http::fake`, stray-request prevention, `TransferStats`) | Port `PendingRequest`/`Factory` on **fetch** (Bun native; 1.4 adds experimental http2/http3 and a `proxy` object). Replace promises with native `Promise`. Pools: `Promise.all` + **p-limit** (341M/wk). Cookies: **tough-cookie** (141M/wk). Fakes: intercept in our own handler stack, not by monkey-patching fetch | B + W (+N) | Guzzle handler-stack middleware semantics need reimplementing. `undici` is unnecessary on Bun. |
| guzzlehttp/uri-template | `Http::withUrlParameters` | **url-template** (17.7M/wk; last release 2023, stable RFC 6570) or write it (~150 LOC) | N/W | — |
| league/uri | `Illuminate\Support\Uri`, `UriQueryString` | WHATWG **URL** / **URLSearchParams** + own port | B + W | league/uri follows RFC 3986, WHATWG URL does not. Normalization differs (default ports, IDN, empty query). Some tests may need adjusting. |
| fruitcake/php-cors | `HandleCors` middleware driven by `config/cors.php` | **hono/cors** (defaults include `QUERY` method) or port fruitcake's `CorsService` (~250 LOC) for `allowed_origins_patterns`/`supports_credentials` parity | H / W | Port recommended, so `HandleCorsTest` passes unchanged. |
| tijsverkoyen/css-to-inline-styles | Mail Markdown theme CSS inlining | **juice** (3.5M/wk, v12.2.0, active) | N | Pure JS (cheerio), so Bun-safe. |
| vlucas/phpdotenv | `LoadEnvironmentVariables` (`.env`, `.env.{APP_ENV}`), `Env::get` casting (`true`/`(true)`/`null`/`empty`), immutable repository | **Write** the Laravel `Env` repository plus a phpdotenv-grammar parser. Disable Bun's auto-load in the app (`bunfig.toml` `env = false` or `--no-env-file`) so precedence is deterministic. `dotenv` (192M/wk) `parse()` is an option, but its quoting/interpolation rules differ | W (+B) | Bun's built-in `.env` loading is keyed on NODE_ENV, not APP_ENV, and has its own `$VAR` expansion. 1.4 no longer loads `.env` when Bun runs as `node`. |
| psr/container, psr/log, psr/simple-cache, psr/http-message | Contracts | TypeScript interfaces in `@jaravel/contracts` | W | Trivial. |
| composer-runtime-api | Package discovery (`PackageManifest`), `Composer` helper | `package.json` field such as `"jaravel": { "providers": [...] }` plus `bun pm` | W | — |

## 3. PHP extensions and runtime features

| Ext / feature | Used by | Replacement | Tier | Notes |
|---|---|---|---|---|
| ext-pdo | Database connections (MySQL, PostgreSQL, SQLite, SQL Server) | **Bun.sql** (Postgres, MySQL 5.7+/8, MariaDB, SQLite since 1.2.21) and **bun:sqlite**. SQL Server: **mssql** (3.3M/wk, tedious-based; Bun compatibility unverified) | B (+N) | Laravel uses `?` placeholders and imperative `beginTransaction/commit/rollBack`. Use `sql.unsafe(query, params)` for dynamic SQL and `sql.reserve()` for a pinned connection, then issue `BEGIN`/`SAVEPOINT` ourselves. 1.4 decodes MySQL DATETIME as UTC. The Query Builder, Grammars, and Schema are a pure port, so no Kysely or Drizzle. |
| ext-redis / predis | Redis connections, cache, queue, locks, broadcasting, throttling (Lua) | **Bun.redis / RedisClient**. Fallback: **ioredis** (31M/wk, v6.0.0) or **iovalkey** for Cluster/Sentinel | B (+N) | Per the Bun docs, Bun's client does **not** support Cluster or Sentinel, MULTI/EXEC needs raw `send()`, Pub/Sub is "experimental" (since 1.2.23), and the server must be 7.2+. |
| ext-openssl | `Encrypter` (AES-128/256-CBC + HMAC-SHA256, AES-GCM), `encrypt()`, cookies, signed URLs | `node:crypto` `createCipheriv` / WebCrypto `crypto.subtle` | B | The payload format (base64 JSON `{iv,value,mac,tag}`) must be byte-compatible. |
| ext-hash | `hash_hmac`, `hash_equals`, `crc32`, `xxh128` | **Bun.CryptoHasher** (HMAC across sha*/sha3/blake2b/md5), **Bun.hash** (crc32, xxHash3/64, wyhash), `crypto.timingSafeEqual` | B | No xxh128 in Bun.hash; Bun.hash.xxHash3 is 64-bit. Use an npm xxhash if 128-bit output is needed. |
| (Hashing component) bcrypt/argon2 | `Hash::make/check/needsRehash`, `BcryptHasher`, `ArgonHasher`, `Argon2IdHasher` | **Bun.password** (argon2id/argon2i/argon2d/bcrypt; `cost`, `memoryCost`, `timeCost`; auto-detects algorithm on verify; sync variants) | B | (1) No `threads` option. (2) **bcrypt input >72 bytes is SHA-512-pre-hashed by Bun, unlike PHP**, which breaks Laravel's ">72 bytes" behavior and cross-verification of PHP-made hashes for long passwords. Guard in our hasher. (3) Verification of `$2y$` prefixes is undocumented; normalize `$2y$`→`$2b$` before verify. (4) `needsRehash` and `info()`: parse PHC/MCF ourselves. (5) 1.4 enforces argon2 `memoryCost` ≥ 8. |
| ext-session | `SessionHandlerInterface` only | Port `Illuminate\Session` (file/cookie/database/redis/array handlers) | W | Do not use hono-sessions (10k/wk). |
| ext-mbstring, ext-ctype, ext-filter | `Str::*`, Validation (`filter_var` for IP/URL/email/int/float), `Pagination` | JS strings, `Intl.Segmenter`, `Array.from` (code points), `String.prototype.normalize`. Port `filter_var` flags | B + W | JS strings are UTF-16, so `mb_strlen` is code points, not `.length`. **validator** (25.7M/wk) helps for IP/URL but differs from PHP filters. |
| ext-tokenizer | Blade compiler (PHP tokenization of `@php` blocks, component attributes) | **acorn** (254M/wk) or **meriyah** (11M/wk) to parse/validate embedded JS expressions | N | — |
| ext-pcntl, ext-posix | `queue:work` signals, job timeouts (SIGALRM), `Concurrency` fork | `process.on('SIGTERM'/'SIGINT'/'SIGUSR2')`. Timeouts: run jobs in a `Worker` (`worker.terminate()`) or the main loop with `AbortSignal` | B + W | No synchronous preemption in JS. A CPU-bound job cannot be interrupted in-thread. |
| ext-apcu | `apc` cache store | In-process `Map` | W | — |
| ext-memcached | `memcached` store | `memjs` (1.7M/wk) | N | Low priority. |
| ext-gd / intervention/image | `Illuminate\Image` (new), `UploadedFile::fake()->image()`, `dimensions` rule | **Bun.Image** (new in 1.4: JPEG/PNG/WebP/GIF/BMP decode/resize/encode; HEIC/AVIF/TIFF only on macOS/Windows). Fallback: **sharp** (116M/wk, Bun-compatible prebuilt binaries) | B (+N) | — |
| ext-fileinfo | `UploadedFile::getMimeType`, `mimetypes` rule | **file-type** (58M/wk) | N | — |
| ext-ftp | ftp disk | basic-ftp | N | — |

## 4. Dev / test / optional service dependencies

| Dependency | Used for | Replacement | Tier | Notes |
|---|---|---|---|---|
| phpunit/phpunit | Test runner for the spec suite | **bun test** (`--parallel`, `--isolate`, `--shard`, `--changed`, retries, `jest.useFakeTimers`/`setSystemTime` in 1.4) plus our own **PHPUnit-assertion shim** (`assertSame`, `assertEquals` with PHP loose semantics, `expectException`, data providers → `test.each`) | B + W | The shim is what makes the mechanical test port feasible. |
| brianium/paratest | Parallel testing (`--parallel`, `ParallelTesting` tokens) | `bun test --parallel` / `--shard`. Emulate `TEST_TOKEN` per worker | B | Whether Bun exposes a per-worker index is unverified. |
| mockery/mockery | `Facade::shouldReceive`, `$this->mock()`, `partialMock`, `spy` | **Write** a Mockery-style fluent API (`shouldReceive().once().with().andReturn()`) over Proxies. `bun:test` `mock`/`spyOn` for primitives. sinon (10.9M/wk) as an alternative | W (+B) | Mockery semantics are deeply embedded in the tests (hundreds of uses). |
| orchestra/testbench-core | Bootstraps an app for package tests | Write `@jaravel/testbench` | W | — |
| fakerphp/faker | Model factories | **@faker-js/faker** (17.9M/wk, v10.6.0) | N | Method names differ, so map `fake()->name()` and similar. |
| aws/aws-sdk-php | SQS queue, SES mail, DynamoDB cache/lock, S3 | `@aws-sdk/client-sqs` (12.8M/wk), `-sesv2`, `-dynamodb`. S3 via **Bun.S3Client** | N + B | — |
| pda/pheanstalk | beanstalkd queue | Write it (text protocol over `Bun.connect`) | W | Low priority. |
| pusher/pusher-php-server, ably/ably-php | Broadcasters | `pusher` (1.05M/wk) / `ably` (1.3M/wk), or REST via fetch + HMAC (small) | N/W | — |
| web-token/jwt-library | Mercure JWTs | **jose** (154M/wk). Hono also ships `hono/jwt` | N/H | — |
| resend/resend-php | Resend mail transport | `fetch` (or `resend` npm, 13M/wk) | B | — |
| opis/json-schema | JsonSchema component tests | **ajv** (392M/wk) | N | — |
| spatie/fork | Concurrency fork driver | Bun `Worker` / `Bun.spawn` | B | — |
| filp/whoops | Legacy error page | youch | N | — |
| laravel/tinker | REPL | `bun repl` (unverified) or `node:repl` with the app booted | B? | — |
| laravel/pint, phpstan, rector | Lint/types | Biome or oxlint, `tsc --noEmit` | N | Not a runtime concern. |

## 5. Cross-cutting capabilities that are not composer packages but block the port

| Need | Why | Approach |
|---|---|---|
| Container autowiring | Laravel resolves constructor dependencies through PHP reflection type-hints. TS types are erased at runtime | Option A: legacy decorators + `emitDecoratorMetadata` + `reflect-metadata` (45M/wk). Bun's transpiler supports this; 1.4 also ships standard TC39 decorators, which do **not** emit metadata. Option B: explicit `static inject = [...]` / tokens. Option C: build-time codegen. Decide early. |
| PHP `serialize()` for queued jobs, cache values, sessions | Queue payloads embed serialized PHP objects | JSON + class registry (`@SerializesModels` → `{class, id}`), optionally `devalue` (17.5M/wk) / `superjson` (12.4M/wk). |
| Sync request input | `$request->input()` is synchronous, but Web Request bodies are async | Read and parse the body once in an async "capture" stage before the pipeline (Hono `c.req.parseBody()`/`json()` cache), then expose sync bags. Streaming uploads opt out. |
| Request-scoped globals (`request()`, `auth()`, `Context`) | PHP is one request per process; Bun serves many requests concurrently | **AsyncLocalStorage** (Bun supports it; Hono `context-storage` middleware uses it). Every facade that is "singleton per request" in PHP must be ALS-scoped. **This is the biggest semantic shift.** |
| HTML escaping | `e()` | **Bun.escapeHTML** |
| CSRF | `ValidateCsrfToken` (token + XSRF-TOKEN cookie) and Laravel 13's new **`PreventRequestForgery`** (Sec-Fetch-Site origin check + token fallback, `useOriginOnly()`) | Port both. **Bun.CSRF** (HMAC tokens with expiry) and **hono/csrf** (Origin/Sec-Fetch-Site) are not drop-in replacements for Laravel's token format. |
| Signed URLs, cookies encryption | `URL::signedRoute`, `EncryptCookies` | Bun.CryptoHasher HMAC, node:crypto |
| WebSockets (Reverb-like broadcasting, htmx `hx-ws`) | — | `Bun.serve({ websocket })` / `hono/bun` `upgradeWebSocket` |

Hono 4.x built-ins available for reuse: middleware `basic-auth, bearer-auth, body-limit, cache, combine, compress, context-storage, cors, csrf, etag, ip-restriction, jsx-renderer, jwk, jwt, language, logger, method-not-allowed, method-override, mount, pretty-json, request-id, secure-headers, timeout, timing, trailing-slash`; helpers `accepts, adapter, conninfo, cookie, css, dev, factory, html, jwt, proxy, route, ssg, streaming, testing, websocket` (from hono.dev/llms.txt). Useful as **implementation details inside Laravel-named middleware**: `compress`, `etag`, `secure-headers`, `body-limit` (→ ValidatePostSize), `request-id`, `streaming` (→ StreamedResponse/SSE), `conninfo` (→ `$request->ip()`), `testing`/`app.request()` (→ in-process `$this->get()` HTTP tests).

---

## 6. Specific questions

### 6.1 What replaces Symfony HttpFoundation's Request/Response?

- **Hono's role:** Hono is the server adapter (`export default { fetch: app.fetch }` on Bun.serve) and supplies its middleware set. Hono's `Context` is **not** the Laravel Request. One catch-all route (`app.all('*', kernel.handle)`) hands control to Jaravel's HTTP Kernel, which owns middleware, routing, and response conversion.
- **Request:** `Illuminate\Http\Request` is our own class built from the Web `Request` plus connection info (`server.requestIP()` / Hono `getConnInfo`). It holds:
  - `query` from `URL.searchParams`, with PHP bracket parsing (`a[b][]=1`). Write a `qs`-compatible parser; PHP's `parse_str` rules differ from `URLSearchParams`.
  - `request`/`json`/`files` pre-parsed by the async capture stage (`formData()`, `json()`). `UploadedFile` wraps the Web `File`.
  - `headers` as a `HeaderBag` over `Headers`, `cookies` via `Bun.CookieMap` (decrypted by `EncryptCookies`).
  - A synthetic `server` bag (`REQUEST_METHOD`, `HTTP_HOST`, `REMOTE_ADDR`), because the tests use `Request::create($uri, $method, $params, $cookies, $files, $server, $content)`.
  - Trusted proxies / `X-Forwarded-*` (port `IpUtils`), `_method` override, `Accept` negotiation (Hono `accepts` helper or `negotiator` 219M/wk), and `isSecure`, `getSchemeAndHttpHost`, `fullUrl`, `is()`, `routeIs()`, `expectsJson()`, `prefers()`.
  - First-class htmx accessors (§7).
- **Response:** our own `Response`/`JsonResponse`/`RedirectResponse`/`StreamedResponse`/`StreamedJsonResponse`/`BinaryFileResponse` mutable classes, with headers + status + cookies queue + content. They convert to a Web `Response` at the edge with one `toWebResponse()`:
  - Strings and buffers → body.
  - `StreamedResponse` → `ReadableStream` (Hono `stream`/`streamSSE` helpers or `Response.textStream()` in 1.4).
  - `BinaryFileResponse` → `new Response(Bun.file(path))`, with Range/conditional handling ported or delegated. Bun 1.4 adds 206/304/412 handling in `Bun.serve`, but the release notes mention it next to directory serving, so whether it applies to arbitrary `Response(Bun.file)` is unverified.
  - `Set-Cookie` via `Bun.Cookie` serialization. Bun 1.4 changed the `Expires` format, so pin it in tests.
- **Testing:** `$this->get('/x')` → `kernel.handle(new Request(...))` or `app.request()`, in-process, with no sockets.

### 6.2 Artisan CLI: Symfony Console + laravel/prompts replacement

| Candidate | Weekly dl | Fit for Laravel's model | Verdict |
|---|---|---|---|
| commander 15.0.0 | 538M | argv→action. No InputDefinition/OutputInterface/verbosity/Helper set; no `{name} {--opt=}` signature DSL | Not the core |
| yargs 18.2 | 274M | Same as commander | No |
| citty 0.2.2 (unjs) | 36M | Lightweight, lazy sub-commands, ESM. No I/O abstraction | No (could front `bunx jaravel` only) |
| cac 7.1 | 51M | Similar | No |
| clipanion 4.0.0-rc.4 | 4.8M | Class-based commands (closest shape), but still RC since 2024 | No |
| @poppinss/cliui / AdonisJS Ace | 225k | Reference design for a Laravel-like CLI in TS | Read for ideas |
| @clack/prompts 1.8.1 / @clack/core | 30M / 30M | Look and feel close to laravel/prompts | **Fallback renderer / reference** |
| @inquirer/prompts 8.7 | 43M | Mature, different look and API | Alternative |
| ink 8.0 | 7.9M | React TUI; too heavy | No |

**Recommendation:** write `@jaravel/console`, a direct, slimmed port of the Symfony Console pieces that Laravel touches:
- `Application`, `Command`
- `InputDefinition`/`InputArgument`/`InputOption`, `ArgvInput`/`ArrayInput`/`StringInput`
- `OutputInterface` + `ConsoleOutput`/`BufferedOutput`/`NullOutput`, `OutputFormatter` with `<info>/<comment>/<error>/<fg=…>` tags
- `Table`, `ProgressBar`, `QuestionHelper`, `SignalRegistry`, verbosity

Laravel's signature `Parser`, `Command`, `OutputStyle`, and `InteractsWithIO` then port almost line-for-line. The 253 imports and the `artisan()->expectsQuestion()/expectsTable()/expectsOutput()` test API all assume Symfony semantics.

Use **picocolors** or `node:util.styleText` for colour, **Bun.stringWidth/wrapAnsi/sliceAnsi** for layout, and **Bun.Terminal** where a PTY is needed. Port **laravel/prompts** itself; its `Prompt::fake()` keypress-driven tests can be ported. Keep @clack/core as a fallback if the raw-mode/key-parsing port proves costly.

Unverified: I could not confirm a documented clack→laravel/prompts lineage. The visual similarity is my observation only.

### 6.3 Carbon replacement

- **Temporal is native in Bun 1.4** ("`Temporal` and `Date.prototype.toTemporalInstant` are now defined", on by default, `BUN_JSC_useTemporal=0` disables it; `toEqual` compares Temporal objects by value).
  - Uncertainty: as of Jan 2026, Igalia reported that JSC's Temporal lacked ZonedDateTime/PlainYearMonth/PlainMonthDay and failed many test262 tests. Whether 1.4's JSC is complete is unverified. Run test262-Temporal or a ZonedDateTime/DST smoke test before committing; `temporal-polyfill` (v1.0.6, maintained, 4.8M/wk) is the drop-in fallback.
- **Build our own `Carbon` façade on Temporal:**
  - Mutable `Carbon` boxes a `Temporal.ZonedDateTime`. `CarbonImmutable` returns new instances.
  - `CarbonInterval` wraps `Temporal.Duration`. `CarbonPeriod` is an iterator.
- **Must write:**
  - PHP `date()` format tokens (`Y-m-d H:i:s`, `D, d M Y`, `U`, `u`, `v`, `e`, `T`, `P`, `c`, `r`).
  - `createFromFormat` (PHP `DateTime::createFromFormat`).
  - `parse()` with `strtotime` relative phrases (`next monday`, `+1 day`, `first day of next month`).
  - `diffForHumans` and `setTestNow`/`withTestNow`.
  - Overflow semantics (`addMonthNoOverflow`), `startOf/endOf*`, and the macro system.
- **locutus** (823k/wk, PHP functions ported to JS, including `date`/`strtotime`) is a useful starting point for formatting and parsing. Its `strtotime` coverage is partial; verify it against Carbon tests.
- **Locale translations** for `diffForHumans`: port Carbon's `lang/*.php` for the locales the test suite uses. `Intl.RelativeTimeFormat`/`Intl.DurationFormat` give similar but not identical strings.
- **`setTestNow`** must go through our own clock, not only `bun:test`'s `setSystemTime`. Whether `setSystemTime` affects `Temporal.Now` is unverified.
- dayjs (76M/wk) and date-fns 4 (97M/wk, with `@date-fns/tz`) are fine utilities, but neither models Carbon's API or timezone-aware mutable instances. Luxon (42M/wk) is the closest non-Temporal model, but its last release was 2025-09. Not recommended now that Temporal ships.

### 6.4 Templating for htmx 4 (Blade replacement)

| Engine | dl/wk | Blade-likeness | Bun | Verdict |
|---|---|---|---|---|
| **Own Blade compiler** (port `Illuminate\View\Compilers\BladeCompiler` + 22 `Compiles*` concerns + `ComponentTagCompiler`) emitting JS functions | — | 100% by construction: `@extends/@section/@yield/@parent`, `@include*`, `@each`, `<x-…>` tags with `:prop` binding, `$attributes->merge/class()`, `@props`, `@aware`, `<x-slot:name>`, `@stack/@push/@prepend/@once`, `@fragment`, `@error`, `@csrf`, `@method`, `@class/@style`, `@json/@js`, `@auth/@can/@env`, `@verbatim`, custom directives, `Blade::if`, anonymous + class components | Native: compile to `.js` in `storage/framework/views`, `import()` with mtime check, `Bun.escapeHTML` for `{{ }}`, `{!! !!}` raw | **Recommended** |
| Edge.js 6.5.1 (AdonisJS) | 82k | Closest maintained JS engine, and Blade-inspired: `{{ }}`, `{{{ }}}` raw, `@if/@elseif/@else`, `@each`, `@include`, `@component` + named `@slot`, components-as-tags (`@modal()`, `@!button()`), `$props.toAttrs()`, stacks, `@let`, async templates, accurate error stacks, custom tags. **But:** `@end` closers, no `<x-…>` HTML tags, and v6 **removed `@layout/@section`** (compat only via `edge.js/plugins/migrate`) | ESM, `node >=18.16`, pure JS (deps: edge-lexer/parser, he, @poppinss/*). Bun not officially listed but very likely fine (unverified) | Best off-the-shelf fallback / design reference |
| hono/jsx (+ `jsx-renderer`, `hono/jsx/streaming` Suspense) | (part of hono, 74M) | Not Blade syntax. Typed components, children/props, streaming with Suspense, `renderToReadableStream`, no extra deps | First-class on Bun | Offer as **second view engine** (typed fragments for htmx) |
| Eta 4.6.0 | 7.9M | EJS-style `<%= %>`; layouts and partials only, no components/slots | Zero deps, Bun-safe | No |
| Nunjucks 3.2.4 | 3.7M | Jinja: `extends/block/include/macro`; no component tags | Last release Apr 2023, effectively unmaintained (11ty keeps a fork) | No |
| LiquidJS 10.30 / Handlebars 4.7 / Pug 3 | 2.5M / 43M / 3.7M | Not Blade-like | OK | No |
| stx / bun-plugin-stx (Stacks) | 87k* | "Laravel Blade-like" for Bun: `@if/@foreach/@forelse/@auth/@can/@csrf/@method/@layout/@section/@yield`, `{{ }}`/`{!! !!}`, but Vue-style `<Card/>` components + `<slot/>`, client signals, and tied to the Stacks framework. GitHub has 20 stars and no tagged releases | Bun-only | No (immature, divergent component model). *Downloads likely inflated by its own ecosystem's CI. |
| waxe 0.0.8, bladejs 1.0.3 | 8 / 4 | Toy Blade imitations, dead since 2022 | — | No |
| `blade` (npm) | 23k | **Naming trap:** now ronin-co's "React at the edge" framework, unrelated to Laravel Blade | — | No |

**Why write our own:**
1. The spec is Laravel's suite: `tests/View` holds 63 Blade test files that assert compiler output and rendering. Only a port of the compiler can satisfy them; they need adapting from PHP output strings to JS output or render output.
2. No JS engine implements `<x-component>` tags with `$attributes` bags and `@props`/`@aware`. Those features are central to modern Blade and to htmx-style component markup.
3. Blade is a regex/token compiler of manageable size (~22 concern files + ComponentTagCompiler), so a port is bounded work.

Use acorn or meriyah to validate embedded expressions and produce good errors, and copy Edge's error-stack mapping approach. Templates embed **JS expressions** instead of PHP (`{{ $user->name }}` → `{{ user.name }}`). Decide whether to keep `$`-prefixed variables for familiarity (cheap with `with`-free destructuring of the data object).

---

## 7. htmx 4 requirements for the response layer

Sources: four.htmx.org "Changes in htmx 4.0", migration guide, reference, `<hx-partial>` reference, hx-multipart/hx-sse extension pages, and the 4.0.0 release announcement (2026-08-28). 4.0.0 ships on npm tag **`next`**; 2.x stays `latest` until about early 2027 and remains supported.

### Request headers the framework must read (`$request->htmx()` helper object)
| Header | Meaning | Change vs htmx 2 |
|---|---|---|
| `HX-Request: true` | Request issued by htmx | same |
| `HX-Request-Type: full \| partial` | Full-page versus fragment request | **new**. Use it to decide layout versus `@fragment` rendering |
| `HX-Boosted` | `hx-boost` navigation | same (`hx-boost` must now be `:inherited` to cascade) |
| `HX-Current-URL` | Browser URL at request start | same |
| `HX-History-Restore-Request` | Back/forward restore | same, but now **always hits the server**: the localStorage history cache was removed, so the server must return a full page |
| `HX-Source` | Triggering element as `tag#id` | **new, replaces `HX-Trigger`** (request side) |
| `HX-Target` | Target element, now `tag#id` format | format changed |
| `HX-Trigger-Name` | — | **removed** |
| `HX-Prompt` | — | only with the `hx-prompt` extension |
| `Accept: text/html` (`+ text/event-stream` with hx-sse) | — | **new**. Content negotiation should treat htmx requests as HTML, not JSON |

### Response headers the framework must emit (fluent helpers, e.g. `response()->htmx()->trigger(...)`)
`HX-Trigger` (event name or JSON), `HX-Location`, `HX-Redirect`, `HX-Refresh`, `HX-Retarget`, `HX-Reswap`, `HX-Reselect`, `HX-Push-Url`, `HX-Replace-Url`, all unchanged. **Removed:** `HX-Trigger-After-Swap`, `HX-Trigger-After-Settle`; do not offer helpers for them. With the `hx-ptag` extension, polling uses an `HX-PTag` version tag ("skips unchanged polls"). Exact server contract unverified; plan an ETag-like helper. Recommended: add `Vary: HX-Request, HX-Request-Type` for cache correctness (my recommendation, not from the htmx docs).

### Behavioural changes that affect framework defaults
1. **Error responses now swap.** Every status except 204/304 swaps by default (2.x skipped 4xx/5xx), and per-status client rules come from `hx-status:422` / `50x` / `5xx`.
   - Validation failure on an htmx request should **render the form fragment with errors and status 422**, not `redirect()->back()` with 302.
   - htmx 4 uses `fetch()`, which follows redirects transparently, so a 302-to-GET would swap the whole redirected page into the target.
   - Laravel's `ValidationException` rendering and the exception handler need an htmx branch, similar to `expectsJson()`.
   - Prefer `HX-Location`/`HX-Redirect` over 3xx for htmx requests.
2. **Partials.** `<hx-partial hx-target="#sel" hx-swap="beforeend">…</hx-partial>` (or `<template hx type="partial">` for engines that strip unknown tags). Multiple partials per response; `id` is a targeting shorthand; `hx-swap` defaults to `innerHTML`; a response with only partials leaves the main target alone. `hx-swap-oob` still works. **OOB and partials now apply after the main swap.**
   - Framework: Blade already has `@fragment`/`view()->fragment()/fragmentIf()/fragments()` (`CompilesFragments`, `View::fragment*`). Add a `@partial('#target', 'beforeend') … @endpartial` directive and a `response()->partials([...])` builder.
3. **Streaming.**
   - `hx-sse` reads `text/event-stream`. Messages without `event:` are swapped as HTML; messages with `event:` are dispatched as DOM events. Use Hono `streamSSE` or a `ReadableStream`, and offer `response()->eventStream()` (Laravel already has one).
   - `hx-multipart` reads `multipart/mixed` (beta6 notes also mention `multipart/parallel` and per-part `HX-*` headers), with each `text/html` part swapped as it arrives. **Write a multipart/mixed stream writer**, e.g. `response()->multipart(async function* () {...})`.
   - `hx-ws` → Bun.serve websockets.
   - The default request **timeout is 60 s**, so long-polling endpoints should become streams.
4. **New HTTP method `QUERY`** (`hx-query` sends parameters in the body). The router needs `Route::query()`. hono/cors already lists QUERY in its default `allowMethods`. Whether `Bun.serve` accepts arbitrary/QUERY methods is unverified; test early.
5. **Form-data scope.** `hx-delete` no longer includes the enclosing form's inputs (like `hx-get`). This matters for `_method`/`_token` conventions; the app needs `hx-include="closest form"`.
6. **CSRF.** Attribute inheritance is explicit, so `hx-headers='{"X-CSRF-TOKEN": …}'` on `<body>` must be `hx-headers:inherited`, or requests 419. Ship a Blade `@htmxCsrf` helper. Laravel 13's `PreventRequestForgery` (Sec-Fetch-Site same-origin acceptance) works naturally with htmx's default `mode: 'same-origin'`.
7. **CSP.** `hx-csp` and `inlineScriptNonce`: views should expose a per-request nonce (Laravel `Vite::useCspNonce()` equivalent).
8. **History:** no client cache; back navigation re-fetches with `HX-History-Restore-Request`, so a full layout must render. Optional `hx-history-cache` extension (sessionStorage).
9. **Extensions** are loaded by including scripts (`hx-ext` removed) and allow-listed via `<meta name="htmx-config" content='{"extensions":"sse, ws"}'>`. Provide a Blade `@htmx` asset directive that emits the meta config.
10. Morphing (`innerMorph`/`outerMorph` via idiomorph, `hx-morph-skip`) and view transitions (`htmx.config.transitions`) are client-only, but stable element ids in Blade components help.

---

## 8. Uncertainty register

- JSC Temporal completeness in Bun 1.4 (ZonedDateTime, DST, calendars). Mitigation: temporal-polyfill.
- Bun.password: `$2y$` verification; >72-byte SHA-512 pre-hash diverges from PHP.
- Bun.markdown output parity with league/commonmark; API marked unstable.
- Bun.serve support for the `QUERY` method; whether Range/304 handling applies to `Response(Bun.file)`.
- Bun.redis: no Cluster/Sentinel; Pub/Sub experimental.
- Edge.js on Bun (no official statement); closing-tag flexibility (`@endif`) unverified.
- nodemailer on Bun: README says yes; verify SMTP STARTTLS against a real server.
- `ssh2` (SFTP) and `mssql`/tedious on Bun: unverified.
- htmx `HX-PTag` server contract and `hx-multipart` per-part header format: docs thin; pin to 4.0.x and re-check.
- Third-party reports of Bun 1.4 Rust-port regressions (WebSocket regression on release day, "19 known regressions"), not confirmed by the official post. Pin the Bun patch version in CI.

## 9. Source URLs

- Bun 1.4.0 release notes: https://bun.com/blog/bun-v1.4.0 (Temporal default-on, Bun.Image, Bun.markdown, Bun.cron, Bun.Terminal, URLPattern, Bun.stringWidth/wrapAnsi/sliceAnsi, test runner, .env changes, breaking changes)
- Bun.SQL MySQL/SQLite (1.2.21): https://bun.com/blog/bun-v1.2.21 · https://bun.com/docs/runtime/sql
- Bun Redis limits: https://bun.com/docs/runtime/redis
- Bun.cron: https://bun.com/docs/runtime/cron · https://bun.com/blog/bun-v1.3.11
- Bun.CSRF: https://bun.com/docs/runtime/csrf
- Bun hashing / password: https://bun.com/docs/runtime/hashing
- Bun markdown: https://bun.com/docs/runtime/markdown.md
- Bun Temporal issue: https://github.com/oven-sh/bun/issues/15853 · JSC Temporal status: https://blogs.igalia.com/compilers/2026/01/31/implementing-the-temporal-proposal-in-javascriptcore
- Hono docs index: https://hono.dev/llms.txt · CORS: https://hono.dev/docs/middleware/builtin/cors · Streaming/JSX: https://hono.dev/docs/helpers/streaming
- htmx 4: https://four.htmx.org/whats-new-in-htmx-4 · https://four.htmx.org/migration-guide-htmx-4/ · https://four.htmx.org/reference · https://four.htmx.org/reference/tags/hx-partial · https://four.htmx.org/extensions/hx-multipart · https://four.htmx.org/extensions/hx-sse · https://four.htmx.org/announcements/2026-08-28-htmx-4.0.0-is-released · https://www.infoq.com/news/2026/09/htmx-4-released/
- Edge.js: https://edgejs.dev/docs/introduction · https://edgejs.dev/docs/components/introduction · https://edgejs.dev/docs/changelog/upgrading-to-v6
- stx: https://github.com/stacksjs/stx
- croner: https://github.com/Hexagon/croner
- nodemailer on Bun: https://unpkg.com/nodemailer@10.0.14/README.md
- npm download API: https://api.npmjs.org/downloads/point/last-week/{pkg}
- Laravel source: https://github.com/laravel/framework (commit 86864f3, v13.37.0)
