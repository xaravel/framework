---
test_ids:
  - XT-config-4
trigger: contract
proposed: >-
  Option 1 (recommended): `@xaravel/runtime/php` owns PHP's process
  environment as the PHP CLI the Oracle runs sees it, as a runtime item
  under the same approval as ESC-15.2-1: `getenv` / `putenv` read and write
  `process.env`; `$_SERVER` and `$_ENV` are two process-wide string-keyed
  arrays exported by the runtime (for example `superglobals.server` and
  `superglobals.env`), seeded once at module load from `process.env` as PHP
  CLI seeds them under the Oracle image's `variables_order` (record the
  image's value: the Dockerfile sets none, PHP's built-in default with no
  php.ini is `EGPCS`, which fills both, while the php.ini-production
  `GPCS` leaves `$_ENV` empty), and never re-read after.
  They hold boot-time process state, not per-request state, so AD-5's frame
  slots do not apply; a later Http Story that needs request `$_SERVER`
  keys builds its own bag (Symfony's ServerBag, AD-22's http-foundation
  row). phpdotenv's `ServerConstAdapter`, `EnvConstAdapter` and
  `PutenvAdapter` then port line for line over them, and XT-config-4
  asserts, against Oracle fixtures, that a name already in `$_SERVER` /
  `$_ENV` wins over the file in immutable mode and loses in mutable mode.
  Option 2: the adapters read and write `process.env` directly. It is
  simpler, but `createImmutable` would then treat every `getenv`-only
  variable as externally defined, unlike PHP, where the default adapters
  never read `getenv`, and a value set with `putenv` would show up in
  `$_SERVER` reads; precedence would differ from the Oracle.
evidence: >-
  epics.md Story 15.2 AC 2: "precedence matches phpdotenv's: real
  environment variables win by default". In phpdotenv v5.7.0
  Repository/RepositoryBuilder.php DEFAULT_ADAPTERS is
  [ServerConstAdapter, EnvConstAdapter]: the default repository reads and
  writes `$_SERVER` and `$_ENV` only, and `getenv`/`putenv` only through
  `createUnsafe*` (Dotenv.php). ImmutableWriter::isExternallyDefined
  decides precedence from those readers. `grep -rn 'getenv\|_ENV\|_SERVER'
  packages/*/src` finds no runtime counterpart; the only `process.env`
  reads are XARAVEL_NO_SCOPE_GLOBAL (packages/runtime/src/scope/scope.ts:568).
  AD-5 puts per-request state in Scope Frame slots and forbids module
  variables for it, so where these process-wide arrays live is a contract
  question, not a choice for `packages/config`. The Oracle forks one child
  per request (tools/oracle/evaluate.php), so its superglobal writes do not
  leak between requests.
---

# ESC-15.2-2: where `$_SERVER`, `$_ENV`, `getenv` and `putenv` live

phpdotenv's default repository reads and writes `$_SERVER` and `$_ENV`. Its precedence rule ("real environment variables win") comes from those arrays, not from `getenv`. The runtime has no counterpart for any of them. Option 1 has the runtime own them as process-wide arrays seeded once from `process.env`, as PHP CLI does. Option 2 has every adapter use `process.env`, which changes precedence compared with the Oracle.
