---
test_ids:
  - XT-config-3
  - XT-config-4
trigger: contract
proposed: >-
  Option 1 (recommended): a runtime action item (`packages/runtime` only,
  under decisions/MAINT-2026-10-26-runtime-builtins.md, as epic-15-item-1..3
  were) exports the three PHP builtins vlucas/phpdotenv v5.7.0 and
  phpoption 1.10.0 use that ESC-15.2-1's hand-made list missed, each under
  its PHP name and behaviour with XT-runtime cases against PHP's results:
  (a) the constant `DIRECTORY_SEPARATOR` (`"/"` on the Oracle image's
  Linux and on macOS); (b) `array_reduce($array, $callback, $initial =
  null)`; (c) the class `EmptyIterator` (an `Iterator` with no elements:
  `valid()` false, `current()` and `key()` throwing PHP's
  `BadMethodCallException` "Accessing the value of an EmptyIterator" /
  "Accessing the key of an EmptyIterator", registered under its PHP
  name). Story 15.2 then replaces its three `BlockedByComponentError
  (runtime)` throws with Upstream's code: `Paths::filePaths`,
  `Option::lift` and `None::getIterator`. Option 2: `packages/config`
  writes the three itself; it builds, but it is the second implementation
  PORTING.md (§ Idiom table, "Nothing else re-implements them") and the
  spec's Never list forbid.
evidence: >-
  Checked on 2026-10-30 against the exports of
  packages/runtime/src/php/index.ts and packages/runtime/src/index.ts:
  none of `DIRECTORY_SEPARATOR`, `array_reduce` or `EmptyIterator` is
  exported, and `grep -rn 'DIRECTORY_SEPARATOR\|array_reduce\|EmptyIterator'
  packages/runtime/src` finds nothing. Call sites: vlucas/phpdotenv v5.7.0
  Store/File/Paths.php:38 (`rtrim($path, DIRECTORY_SEPARATOR) .
  DIRECTORY_SEPARATOR . $name`, reached by every file-backed `Dotenv::create*`
  and so by Foundation's LoadEnvironmentVariables, Epic 51); phpoption
  1.10.0 Option.php:169 `lift()` (`array_reduce($args, …)`) and
  None.php:132 `getIterator(): EmptyIterator` (reached by `iterator_to_array` of a None,
  as RepositoryBuilder::addAdapter does for an unsupported adapter class
  such as ApacheAdapter). ESC-15.2-1's evidence says its list "was made by
  hand from the source at the tag", because `bun run scan:builtins` reads
  only conformance/upstream/, which holds neither library. Neither XT's
  cases reach the three members: XT-config-3 calls `Dotenv::parse`
  (StringStore, ArrayAdapter) and XT-config-4 loads through StringStore
  with the default, putenv and allow-list repositories, so both are
  ported in full and this stops no case of theirs; the Test IDs are listed
  because the members are part of the surface they grade.
---

# ESC-15.2-6: three PHP builtins the phpdotenv port needs that the runtime lacks

Porting phpdotenv, PhpOption and Result Type line for line found three PHP builtins that ESC-15.2-1's hand-made list missed and `@xaravel/runtime` does not export: the constant `DIRECTORY_SEPARATOR` (phpdotenv's `Paths::filePaths`, which every file-backed `Dotenv::create*` uses), `array_reduce` (PhpOption's `Option::lift`) and the class `EmptyIterator` (PhpOption's `None::getIterator`). Until the runtime has them, those three members throw `BlockedByComponentError(runtime)` instead of copying the builtins into `packages/config`. Option 1 adds them to the runtime, as items 1-3 did for the rest. Option 2 copies them into `packages/config`, which PORTING.md forbids.

No case of XT-config-3 or XT-config-4 reaches them (`Dotenv::parse` and `StringStore` loads), so the Story's tests are not stopped; loading a `.env` file from a path is, until the ruling lands.
