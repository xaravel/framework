---
test_ids:
  - XT-config-4
trigger: contract
proposed: >-
  Option 1 (recommended): phpdotenv's file read stays sync, as AD-6 already
  says "Config [is] sync". `@xaravel/runtime/php` exports `file_get_contents`
  for a local path as a sync read (`fs.readFileSync`; `false` plus PHP's
  warning-free `@` form on a missing or unreadable file), under the same
  runtime item as ESC-15.2-1. `Dotenv\Store\File\Reader` ports over it. It
  runs once at boot (Foundation's LoadEnvironmentVariables, Epic 51), which
  is the loaded-once case AD-6 keeps sync. It is not `Filesystem` IO, so
  no async root is added. Option 2: `Dotenv.load()` and `FileStore.read()`
  become async roots. That needs an AD-6 Escalation to add a root, and it
  makes every caller async, `env()` bootstrap included, unlike Laravel.
evidence: >-
  vlucas/phpdotenv v5.7.0 Store/File/Reader.php:73 reads each env file
  with `@\file_get_contents($path)`, and Dotenv::load() (Dotenv.php)
  returns the loaded array synchronously. AD-6
  (ARCHITECTURE-SPINE.md:172) lists the only async roots, among them
  `Filesystem` IO methods, and says "Config [is] sync. Adding a root needs
  an Escalation." It does not say whether a sync file read outside
  `@xaravel/filesystem` is allowed for boot-time loading, and
  `@xaravel/runtime/php` exports no file read
  (packages/runtime/src/php/index.ts). The epic context
  (_bmad-output/implementation-artifacts/epic-15-context.md) says config
  "is explicitly not an async root" and that the repository and parser
  stay sync.
---

# ESC-15.2-3: a sync file read for phpdotenv's FileStore

phpdotenv reads `.env` files with `file_get_contents`. AD-6 makes Config sync and lists `Filesystem` IO among the async roots, but says nothing about a sync read at boot outside `@xaravel/filesystem`. Option 1 adds a sync `file_get_contents` to the runtime for this loaded-once case. Option 2 makes env loading an async root.
