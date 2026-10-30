---
title: 'Runtime process environment phpdotenv reads: getenv, putenv, $_SERVER and $_ENV, file_get_contents'
type: feature
created: '2026-10-30'
status: done
baseline_revision: 5dd22d5205a36aa10658f55cbf108a7e22626c56
review_loop_iteration: 1
followup_review_recommended: false
context:
  - decisions/MAINT-2026-10-30-story-15-2.md
  - decisions/ESC-15.2-2.md
  - decisions/ESC-15.2-3.md
  - conformance/escalations/ESC-15.2-2.md
  - conformance/escalations/ESC-15.2-3.md
warnings: [oversized]
deferred:
  - summary: >-
      file_get_contents throws the runtime's UTF-8 limit for a readable file that is no valid UTF-8, so phpdotenv's Reader cannot load a Latin-1 or Windows-1252 .env file through Str::utf8 with $fileEncoding.
    evidence: |-
      The bytes limit is the runtime's existing rule for every PHP string ("Values JS cannot hold" in
      packages/runtime/docs/php-functions.md); mb_convert_encoding (item 1) also works over UTF-8 only. Story 15.2
      settles how Dotenv::create(..., $fileEncoding) meets it: carry this into Story 15.2's spec, and raise an
      Escalation there if a non-UTF-8 env file must load.
    location: >-
      packages/runtime/src/php/fileFunctions.ts (decodeResult call)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Story 15.2 ports vlucas/phpdotenv v5.7.0, whose adapters read and write `$_SERVER`, `$_ENV`, `getenv` and `putenv`, and whose `Store\File\Reader` reads each env file with `@file_get_contents($path)` (ESC-15.2-1 part g, ESC-15.2-2, ESC-15.2-3). `@xaravel/runtime/php` has none of them.

**Approach:** As action item `epic-15-item-3-runtime-process-environment` rules: export `getenv` and `putenv` over `process.env`; export two process-wide string-keyed PHP arrays for `$_SERVER` and `$_ENV`, seeded once at module load from `process.env` as the PHP CLI seeds them under the Oracle image's `variables_order` and never re-read; export a sync `file_get_contents` for a local path that returns `false` on a missing or unreadable file with no warning (DIV-9.17). XT-runtime cases against a PHP 8.5.11 probe.

## Boundaries & Constraints

**Always:** scope `packages/runtime/**` and this item's records; PHP 8.5.11 results; sync only (AD-6: config is sync, ESC-15.2-3); the arrays are boot-time process state outside AD-5 frame slots (ESC-15.2-2); record the Oracle image's `variables_order` (the image has no php.ini, so PHP's built-in `EGPCS` fills both arrays); existing exports stay.

**Never:** other runtime behaviour changes; another component, PORTING.md, a DIV, the grader or Expectations; a module cache or per-request state; `$_SERVER` keys that do not come from `process.env` (the CLI's `PHP_SELF`, `SCRIPT_NAME`, `SCRIPT_FILENAME`, `PATH_TRANSLATED`, `DOCUMENT_ROOT`, `REQUEST_TIME`, `REQUEST_TIME_FLOAT`, `argv`, `argc`: not environment values; ESC-15.2-2 leaves request keys to a later Http Story's `ServerBag`), listed in the docs' Not ported; stream wrappers, `$use_include_path` true or a `$context` (the runtime has no resources), which throw the JS `TypeError` limit (`Xaravel-only`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| getenv one | `getenv('Q')`, `Q=a=b` set; unset name; `''`; name with `.` | `'a=b'`; `false`; `false`; its value | No error |
| getenv all | `getenv()` / `getenv(null)` | PHP array of every environment entry, names with ` `, `.` or `[` skipped, integer-like names as int keys | No error |
| putenv | `'N=v'`, `'N='`, `'N'`, `'A=b=c'` | `true`; set `v`; set `''`; unset; value `b=c`; `$_SERVER`/`$_ENV` unchanged | No error |
| putenv bad | `''`, `'=x'` | — | `ValueError: putenv(): Argument #1 ($assignment) must have a valid syntax` |
| seeding | child process with a controlled environment | `$_ENV` and `$_SERVER` equal PHP `-n` CLI's environment entries (same filter and key normalisation); later `process.env`/`putenv` changes not seen | No error |
| file read | existing file, `$offset`/`$length` (also negative offset, 0 length) | its contents as PHP gives them | No error |
| file missing | missing path, a path through a file (`file/x`), offset past the end | `false` | no warning (DIV-9.17) |
| file directory | a directory path | PHP's result (`''` in PHP 8.5.11) | no warning |
| file bad args | `''`; path with NUL; `$length` < 0 | — | PHP's `ValueError` messages |

</intent-contract>

## Code Map

- `/tmp/xorch-dotenv/src` (phpdotenv v5.7.0, read-only): `Repository/Adapter/PutenvAdapter.php:44-98` (`function_exists('getenv')`, `getenv($name)` filtered to strings, `putenv("$name=$value")`, `putenv($name)`), `ServerConstAdapter.php`/`EnvConstAdapter.php:42-84` (read, write, `unset` on `$_SERVER`/`$_ENV`), `Store/File/Reader.php:73` (`@\file_get_contents($path)`).
- PHP 8.5.11 `main/php_variables.c` `import_environment_variable`: skips an entry with no `=`, an empty name, or a name holding ` `, `.` or `[`; an integer-like name is an int key; used by `$_ENV`, CLI `$_SERVER` and `getenv()`. Checked on the host: `env -i 'A.B=1' 'A B=2' 'A[=3' '12=x' 'Z=z' 'E=' 'Q=a=b' php -n -r 'var_export($_ENV);'` gives `12, Z, E, Q` (plus macOS's `__CF_USER_TEXT_ENCODING`, which the probe filters). Homebrew's php.ini sets `GPCS`, so the probe's child runs `php -n`.
- `packages/runtime/src/php/phpFunctions.ts:208-235` -- `PHP_FUNCTIONS` `entry(name, fn, required, total, …)`; add `getenv` (0, 2), `putenv` (1, 1), `file_get_contents` (1, 5) with counts from `ReflectionFunction` in the probe; registry grows 129 → 132.
- `packages/runtime/src/php/stringFunctions.ts:30,38` -- `wellFormed` and `decodeResult` (bytes → string, an invalid UTF-8 sequence throws the limit) for file contents and putenv/getenv strings.
- `packages/runtime/src/php/phpArguments.ts:35-65` -- `stringParameter`, `intParameter`, `nullableIntParameter`, `boolParameter` for PHP's coercion and TypeErrors.
- `packages/runtime/src/php/PhpArray.ts:109-262` -- `PhpArray` (mutable, PHP key normalisation) for the two arrays and `getenv()`'s result.
- `packages/runtime/src/php/ValueError.ts` -- PHP's `ValueError`.
- `packages/runtime/src/php/index.ts`, `packages/runtime/src/index.ts` -- export from both, as item 2 did for `preg_*`.
- `packages/runtime/docs/php-functions.md:532-760` -- add a "Process environment and file read" section before "Values JS cannot hold", and Not ported rows (XT-runtime-37 reads docs for every export).
- `packages/runtime/tests/xaravel/php-pcre-functions.{probe.php,probe.txt,test.ts}` -- probe/test pattern (`out`, `attempt`, `each_call`, label map recomputed through the export, `xaravelTest`).
- `packages/runtime/tests/xaravel/php-set-functions.{probe.php,probe.txt,test.ts}` -- `$registry`/`$exports` lists and the count go stale; update and regenerate.
- Last Xaravel Test ID is XT-runtime-138; new tests are XT-runtime-139..142.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/environmentFunctions.ts` (new) -- `getenv`, `putenv`, the shared environment-entry import (PHP's filter and key normalisation) and `superglobals` (`server`, `env`: `PhpArray`s seeded once at module load).
- `packages/runtime/src/php/fileFunctions.ts` (new) -- `file_get_contents` over `readFileSync` with `$offset`/`$length`, `false` on failure, the limits.
- `packages/runtime/src/php/phpFunctions.ts`, `src/php/index.ts`, `src/index.ts`, `docs/php-functions.md` -- registry entries, exports, docs.
- `packages/runtime/tests/xaravel/php-process-environment.probe.php`, `.probe.txt` -- PHP 8.5.11 results for each matrix row; the seeding row runs a `php -n` child through `proc_open` with a fixed environment; file rows over fixtures the probe creates in a temp directory with fixed contents (ASCII, UTF-8, empty).
- `packages/runtime/tests/xaravel/php-process-environment.test.ts` -- XT-runtime-139 (getenv, putenv), XT-runtime-140 (seeding, in a `process.execPath` child with the same environment; not re-read; putenv leaves the arrays alone), XT-runtime-141 (file_get_contents), XT-runtime-142 (registry counts, `ArgumentCountError`s, root/subpath identity, the `Xaravel-only` limits). Restore `process.env` after each case.
- `packages/runtime/tests/xaravel/php-set-functions.*` -- the lists and count the new exports make stale.

**Acceptance Criteria:**
- Given each matrix row, when run through the export, then the result (or the thrown class and message) equals the PHP probe's.
- Given a child process started with an environment that holds names with ` `, `.`, `[`, an integer-like name, an empty value and a value with `=`, when it imports `@xaravel/runtime/php`, then `superglobals.env` and `superglobals.server` hold PHP `-n` CLI's environment entries with PHP's keys and values; and after `process.env` changes or `putenv`, both arrays are unchanged while `getenv` sees the change.
- Given a file holding invalid UTF-8, when read, then the call throws the runtime's JS `TypeError` limit (`Xaravel-only`); a `php://`, `http://` or `file://` path, `$use_include_path` true or a non-null `$context` also throw the limit.
- Given `phpFunction("<name>")` for each new function, too few or too many arguments throw PHP's `ArgumentCountError` with PHP's counts.
- Given the full suite, `bun run harness` reports zero differences and `bun run typecheck` and `bun run lint` exit 0; `bun run fidelity:review status --item epic-15-item-3-runtime-process-environment --spec _bmad-output/implementation-artifacts/spec-epic-15-item-3-runtime-process-environment.md` prints `current`.

## Spec Change Log

- Implementation, from the PHP 8.5.11 probe (the AC's source of truth): `file_get_contents` with a positive `$offset` past the end gives `''`, not `false` (a plain-file seek past the end succeeds); only a negative offset before the start is `false`. The matrix's "offset past the end → false" row is read as the latter.
- Implementation: `getenv` of a name holding `=` is left out of the probe, since libc decides it (macOS matches the name before the `=`, glibc, the Oracle image's, finds nothing); the runtime gives `false`, as glibc does, asserted `Xaravel-only` and recorded in the docs.
- Implementation: a NUL byte in a `getenv` name or `putenv` assignment throws the JS `TypeError` limit (`Xaravel-only`): PHP passes the truncated C string, which `process.env` cannot mirror.

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 27 findings — high 0, medium 2, low 17, false 4, maybe-false 4
- findings:
  - `[medium]` `[defer]` blind: a `.env` file that is no valid UTF-8 (Latin-1 with phpdotenv's `$fileEncoding`) throws the limit instead of reaching `Str::utf8` — real, but the bytes limit is the runtime's existing rule for every string ("Values JS cannot hold", items 1 and 2 too), not new here; how phpdotenv's Reader meets it is Story 15.2's. Deferred, to carry into Story 15.2's spec.
  - `[low]` `[patch]` blind: invalid UTF-8 in `environ` reaches `process.env` as U+FFFD, undocumented — Bun decodes `environ` before the runtime sees it; docs now say so.
  - `[low]` `[patch]` blind: PHP's non-CLI SAPIs restore `putenv` values at request end; the docs did not say the port never does — docs paragraph added (ESC-15.2-2 rules `putenv` over `process.env`).
  - `[low]` `[reject]` blind: nothing resets `superglobals` between tests — `PhpArray` has `copy`, `set` and `delete`, so a consumer test restores what it writes; a helper would add public surface for a need no test has yet.
  - `[maybe-false]` `[reject]` blind: glibc `getenv` with `=`, the image's missing php.ini and the directory result were not checked on the Oracle image — no Docker on this host. glibc's `getenv` matches `name=` against each entry, so `XP_F=1` finds nothing; `conformance/oracle/Dockerfile` copies no php.ini. If wrong, low; CI on Linux runs XT-runtime-140..142.
  - `[low]` `[reject]` blind: the matrix's "offset past the end → false" disagrees with the code — the fix edits this build's spec (the intent contract is read-only); the Spec Change Log records the probe's result.
  - `[low]` `[reject]` blind: the Code Map cites `/tmp/xorch-dotenv/src` — the fix edits this build's spec.
  - `[low]` `[patch]` blind: the `php-set-functions` count comment still sums to 129 — comment now names the 3 new functions.
  - `[low]` `[patch]` blind: the `$context` limit throws before `$offset` is parsed — offset and length are now parsed and validated first; XT-runtime-142 asserts both orders.
  - `[low]` `[patch]` blind: the wrapper match throws for any `<scheme>://`, where PHP reads an unregistered scheme as a local path — narrowed to `stream_get_wrappers()`'s set and a 2+-char scheme; `foo://x` and `c://x` probe rows added (both `false`).
  - `[low]` `[patch]` blind: XT-runtime-139's seeded-variable block could skip silently — asserts the seeded key exists, runs unconditionally.
  - `[low]` `[patch]` blind: verbless Not-ported fragment and an unwrapped intro line — rewritten and rewrapped.
  - `[maybe-false]` `[reject]` blind: Bun might inject variables into the seeding child on Linux — settled by CI's Linux run of XT-runtime-140; Bun passes a spawn `env` as given. If true, low.
  - `[low]` `[reject]` edge: an integer-like name sits first, unlike `environ` order — the ruled source is `process.env` (ESC-15.2-2, the item's action), whose JS key order puts those names first; documented; no ordered source is available to the runtime, and lookups by name (phpdotenv's only use) are unaffected.
  - `[maybe-false]` `[reject]` edge: a directory with a negative offset may give `false` on Linux — needs the Oracle image to settle; if true, low (no caller reads a directory with an offset).
  - `[low]` `[patch]` edge: `c://x` throws where PHP reads a local path — same root as the wrapper match.
  - `[low]` `[patch]` edge: `foo://bar` throws where PHP reads a local path — same root as the wrapper match.
  - `[low]` `[reject]` edge: a non-open `readFileSync` error (a file over 2 GB) returns `false` — never met with env files; the fix adds a branch.
  - `[low]` `[reject]` edge: an environment variable named `PHP_SELF` or `argv` keeps its value in `superglobals.server` — the ruling seeds from `process.env` only and leaves request keys to a later bag (ESC-15.2-2); documented in Not ported.
  - `[false]` `[reject]` edge: "string-keyed" arrays hold int keys — PHP's own `$_ENV` makes an integer-like name an int key (`import_environment_variable`), probed; the port matches.
  - `[low]` `[patch]` verification-gap: stale count comment — same as the blind row.
  - `[low]` `[reject]` verification-gap: the unreadable-file case is skipped as root — root reads a mode-000 file, so no root-independent case exists; every other failure path still runs.
  - `[maybe-false]` `[reject]` intent: tests run against the host's PHP, not the Oracle image — same as the blind Oracle-image row.
  - `[false]` `[reject]` intent: no test runs phpdotenv's adapters over the arrays — the item asks for XT-runtime cases; the adapters are Story 15.2's (XT-config-4).
  - `[false]` `[reject]` intent: "string-keyed" read literally — same refutation as the edge row.
  - `[medium]` `[defer]` intent: a readable non-UTF-8 file throws, outside "contents or false" — same root as the blind row (the runtime's bytes limit).
  - `[false]` `[reject]` intent: harness, typecheck, lint and status outputs are not in the diff — run on this tree: probes clean, typecheck and lint exit 0, `bun run harness` `differ=0`.

### 2026-10-30 — Review pass (Finalize re-check: Fidelity Review on the patched tree e2c701622b2cdb71e8597e7e34cc4162ad53ed9c)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none; both reviewers pass (codex/gpt-6.1-sol, claude/claude-opus-5-5), and `status` prints `current`.

## Design Notes

**Order.** `process.env` is a JS object, so it enumerates integer-like names first, where PHP keeps `environ` order. ESC-15.2-2 names `process.env` as the source, so the arrays take its order; only integer-like names (int keys in PHP too) move. Record this in the docs as a consequence of the ruled source, and order the probe's fixed environment so PHP's order is the same (integer-like name first).

**Seeding.** One import routine builds `getenv()`'s array and both superglobals: for each `[name, value]` of `process.env`, skip an empty name or one holding ` `, `.` or `[` (an `=` cannot occur in a `process.env` name), then `set(name, value)` on a `PhpArray`, whose key normalisation makes an integer-like name an int key. The arrays are two module constants built once; nothing re-reads `process.env` for them.

**file_get_contents.** `readFileSync(path)` gives bytes; apply PHP's `$offset` (negative from the end; a seek outside the file is `false`) and `$length` (`null` to the end), then `decodeResult`. `ENOENT`, `ENOTDIR`, `EACCES` and the like return `false`; `EISDIR` returns PHP's result for a directory. Check `''` and NUL first, with PHP's `ValueError` messages.

## Verification

**Commands:**
- `cd packages/runtime/tests/xaravel && php -d error_reporting=0 php-process-environment.probe.php | diff - php-process-environment.probe.txt` -- expected: no output; the same for `php-set-functions`.
- `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: zero differences.
- `bun run typecheck` and `bun run lint` -- expected: exit 0.
- `bun run harness` -- expected: zero differences (NOT-RUN Variants allowed).
- `bun run fidelity:review status --item epic-15-item-3-runtime-process-environment --spec _bmad-output/implementation-artifacts/spec-epic-15-item-3-runtime-process-environment.md` -- expected: `current`.

## Fidelity Review

### Reviewer 1: pass at tree 78c8fd4ff9d9971f62997aec234a7ba1e92a67b8

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `5dd22d5205a36aa10658f55cbf108a7e22626c56`, on 2026-10-30T16:41:30.150Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed, and no Ported Test IDs are assigned. |
| F-2: No expected value is weakened | pass | The probe comparisons retain exact results and exception messages. The registry count increases from 129 to 132 for the three added functions; no comparison is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are subject to an Upstream assertion count comparison. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adapted marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this change. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared the touched Xaravel Tests and their helpers with their consequence strings and PHP probe records. They check the declared environment behavior, initial seeding, file results and errors, registry metadata, export identity and explicit limits. No consequence tokens are misattributed. |
| F-8: No stub, fake or partial implementation of another Component | pass | All scoped changes are within packages/runtime. The environment primitives and synchronous local file read implement the runtime behavior explicitly authorized by ESC-15.2-2 and ESC-15.2-3; no other Component is faked. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source declarations with AD-6, DIV-1 and ESC-15.2-3. No asyncRoot tags are retained or added, the new environment functions are synchronous, and the synchronous file read is expressly authorized without an async root. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"78c8fd4ff9d9971f62997aec234a7ba1e92a67b8","base":"5dd22d5205a36aa10658f55cbf108a7e22626c56","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T16:41:30.150Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed, and no Ported Test IDs are assigned.","findings":[]},{"id":"F-2","result":"pass","note":"The probe comparisons retain exact results and exception messages. The registry count increases from 129 to 132 for the three added functions; no comparison is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are subject to an Upstream assertion count comparison.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adapted marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this change.","findings":[]},{"id":"F-7","result":"pass","note":"Compared the touched Xaravel Tests and their helpers with their consequence strings and PHP probe records. They check the declared environment behavior, initial seeding, file results and errors, registry metadata, export identity and explicit limits. No consequence tokens are misattributed.","findings":[]},{"id":"F-8","result":"pass","note":"All scoped changes are within packages/runtime. The environment primitives and synchronous local file read implement the runtime behavior explicitly authorized by ESC-15.2-2 and ESC-15.2-3; no other Component is faked.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source declarations with AD-6, DIV-1 and ESC-15.2-3. No asyncRoot tags are retained or added, the new environment functions are synchronous, and the synchronous file read is expressly authorized without an async root.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 78c8fd4ff9d9971f62997aec234a7ba1e92a67b8

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `5dd22d5205a36aa10658f55cbf108a7e22626c56`, on 2026-10-30T16:41:30.150Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests added or changed; the action item assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | No Ported Test expected values touched. Xaravel Tests compare against recorded PHP 8.5.11 probe output exactly (string-compared JSON), nothing loosened. |
| F-3: No assertion is removed without a DIV clause | pass | No Ported Tests; no assertions removed. The php-set-functions test change only updates the registry count 129 to 132 for the three new entries. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations lines added or changed. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted markers added. The only DIV cited is DIV-9.17 (no warnings raised), which the change applies as that record describes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixtures relied on; the change touches no oracle-requests file. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-139..142 bodies check what their consequence strings claim: getenv/putenv against the probe, seeding in a fresh process, file_get_contents including failures, registry counts, exports and the limits. No FR/AD tokens are cited. |
| F-8: No stub, fake or partial implementation of another Component | pass | Change is confined to packages/runtime. It is the Maintainer-approved ESC-15.2-2/3 runtime builtins, which are real ports and not stubs of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | The new exports getenv, putenv, file_get_contents and superglobals are sync with no @​asyncRoot tags. file_get_contents is deliberately sync per ESC-15.2-3 (loaded-once config read, not Filesystem IO). No async methods are added. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request files changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"78c8fd4ff9d9971f62997aec234a7ba1e92a67b8","base":"5dd22d5205a36aa10658f55cbf108a7e22626c56","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T16:41:30.150Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests added or changed; the action item assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test expected values touched. Xaravel Tests compare against recorded PHP 8.5.11 probe output exactly (string-compared JSON), nothing loosened.","findings":[]},{"id":"F-3","result":"pass","note":"No Ported Tests; no assertions removed. The php-set-functions test change only updates the registry count 129 to 132 for the three new entries.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations lines added or changed.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted markers added. The only DIV cited is DIV-9.17 (no warnings raised), which the change applies as that record describes.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixtures relied on; the change touches no oracle-requests file.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-139..142 bodies check what their consequence strings claim: getenv/putenv against the probe, seeding in a fresh process, file_get_contents including failures, registry counts, exports and the limits. No FR/AD tokens are cited.","findings":[]},{"id":"F-8","result":"pass","note":"Change is confined to packages/runtime. It is the Maintainer-approved ESC-15.2-2/3 runtime builtins, which are real ports and not stubs of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"The new exports getenv, putenv, file_get_contents and superglobals are sync with no @asyncRoot tags. file_get_contents is deliberately sync per ESC-15.2-3 (loaded-once config read, not Filesystem IO). No async methods are added.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request files changed.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree e2c701622b2cdb71e8597e7e34cc4162ad53ed9c

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `5dd22d5205a36aa10658f55cbf108a7e22626c56`, on 2026-10-30T17:00:06.661Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are added or changed, and no Ported Test IDs are assigned. |
| F-2: No expected value is weakened | pass | Compared changed expectations and probe outputs with the supplied PHP evidence. Exact comparisons remain; the registry count increases from 129 to 132 for the three added functions. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests change, so no Upstream assertion counterpart is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied upon by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared the touched Xaravel Tests, their helpers and supplied probe results with their consequences. They check environment mutation and seeding, file results and exceptions, registry metadata, exports and declared limits; existing probe comparisons remain exact. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared all changed paths and implementations with the runtime scope and ESC-15.2-2/3. Changes remain in runtime and implement its approved environment and synchronous local-file primitives without faking another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared changed source declarations with AD-6, DIV-1 and ESC-15.2-3. No async tags are retained or added; environment operations are synchronous, and the file read is explicitly approved as synchronous without an async root. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"e2c701622b2cdb71e8597e7e34cc4162ad53ed9c","base":"5dd22d5205a36aa10658f55cbf108a7e22626c56","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-30T17:00:06.661Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are added or changed, and no Ported Test IDs are assigned.","findings":[]},{"id":"F-2","result":"pass","note":"Compared changed expectations and probe outputs with the supplied PHP evidence. Exact comparisons remain; the registry count increases from 129 to 132 for the three added functions.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests change, so no Upstream assertion counterpart is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied upon by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared the touched Xaravel Tests, their helpers and supplied probe results with their consequences. They check environment mutation and seeding, file results and exceptions, registry metadata, exports and declared limits; existing probe comparisons remain exact.","findings":[]},{"id":"F-8","result":"pass","note":"Compared all changed paths and implementations with the runtime scope and ESC-15.2-2/3. Changes remain in runtime and implement its approved environment and synchronous local-file primitives without faking another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared changed source declarations with AD-6, DIV-1 and ESC-15.2-3. No async tags are retained or added; environment operations are synchronous, and the file read is explicitly approved as synchronous without an async root.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree e2c701622b2cdb71e8597e7e34cc4162ad53ed9c

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `5dd22d5205a36aa10658f55cbf108a7e22626c56`, on 2026-10-30T17:00:06.661Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and assigns no Ported Test IDs; it adds and changes only Xaravel Tests (XT-runtime-139..142, 84, 85). There is no Ported Test to compare with Upstream source lines. |
| F-2: No expected value is weakened | pass | Compared each changed expected value. In php-set-functions.test.ts the exact registry count moves 129→132, matching the three new registry entries, and it stays an exact assertSame. php-set-functions.probe.txt only gains PHP-recorded rows for file_get_contents, getenv and putenv in resolver.reflection, resolver.counts and resolver.exports; no existing value changes. The new tests compare exact JSON of runtime results with the PHP 8.5.11 probe record (assertSame on the joined differences). The only substring checks are on JS TypeError limit messages that have no PHP counterpart and are marked Xaravel-only. |
| F-3: No assertion is removed without a DIV clause | pass | No assertion is removed: the php-set-functions.test.ts hunk replaces one exact count assertion with another exact one and extends its comment. All other changes add tests or probe rows. No Ported Test is touched. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No // adapted:DIV-<n>.<k> marker and no Expectations adapted field is added or kept on the changed lines. The DIV-9.17 citations are docblock references to the no-warning rule, not adaptation markers. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows that no assigned or changed Oracle fixture is an error, and the new tests declare no Oracle ids; they rely on host-PHP probe records instead. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-139: the getenv and putenv probe labels cover values, false for unset or empty names, PHP's TypeErrors and the putenv ValueErrors; explicit assertions show putenv and process.env writes leave superglobals.env and superglobals.server unchanged while getenv sees the change. XT-runtime-140: a fresh Bun child with the fixed environment (space, dot or [ names, integer-like names, an empty value, a value with =) is compared with a php -n child's $_ENV, $_SERVER, getenv() and getenv(null), and with the state after putenv and a process.env write. XT-runtime-141: offset and length grid, missing file, path through a file, negative offset, offset past the end, directory, the ValueErrors and TypeErrors, plus an unreadable file and no caching. XT-runtime-142: reflection counts and ArgumentCountErrors, root and subpath identity, and the JS TypeError limits for wrappers, include path, context, invalid UTF-8, NUL and lone surrogate. XT-runtime-84 and 85 keep checking the registry, now including the new functions. No test cites an FR or AD bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every in-scope change is in packages/runtime (src, docs, README, tests), the action item's only component. It adds no stub, fake or partial implementation of another Component; the Http request bag is deferred to a later Story as ESC-15.2-2 rules. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tag in any changed source file, and the new exports getenv, putenv, superglobals and file_get_contents are all synchronous. Under AD-6 Derivation and DIV-1, none is async: none returns a Promise and none takes a callback. file_get_contents uses readFileSync as ESC-15.2-3 rules (loaded once at boot, not Filesystem IO, no async root added), so no tag is missing. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"e2c701622b2cdb71e8597e7e34cc4162ad53ed9c","base":"5dd22d5205a36aa10658f55cbf108a7e22626c56","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-30T17:00:06.661Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and assigns no Ported Test IDs; it adds and changes only Xaravel Tests (XT-runtime-139..142, 84, 85). There is no Ported Test to compare with Upstream source lines.","findings":[]},{"id":"F-2","result":"pass","note":"Compared each changed expected value. In php-set-functions.test.ts the exact registry count moves 129→132, matching the three new registry entries, and it stays an exact assertSame. php-set-functions.probe.txt only gains PHP-recorded rows for file_get_contents, getenv and putenv in resolver.reflection, resolver.counts and resolver.exports; no existing value changes. The new tests compare exact JSON of runtime results with the PHP 8.5.11 probe record (assertSame on the joined differences). The only substring checks are on JS TypeError limit messages that have no PHP counterpart and are marked Xaravel-only.","findings":[]},{"id":"F-3","result":"pass","note":"No assertion is removed: the php-set-functions.test.ts hunk replaces one exact count assertion with another exact one and extends its comment. All other changes add tests or probe rows. No Ported Test is touched.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No // adapted:DIV-<n>.<k> marker and no Expectations adapted field is added or kept on the changed lines. The DIV-9.17 citations are docblock references to the no-warning rule, not adaptation markers.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows that no assigned or changed Oracle fixture is an error, and the new tests declare no Oracle ids; they rely on host-PHP probe records instead.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-139: the getenv and putenv probe labels cover values, false for unset or empty names, PHP's TypeErrors and the putenv ValueErrors; explicit assertions show putenv and process.env writes leave superglobals.env and superglobals.server unchanged while getenv sees the change. XT-runtime-140: a fresh Bun child with the fixed environment (space, dot or [ names, integer-like names, an empty value, a value with =) is compared with a php -n child's $_ENV, $_SERVER, getenv() and getenv(null), and with the state after putenv and a process.env write. XT-runtime-141: offset and length grid, missing file, path through a file, negative offset, offset past the end, directory, the ValueErrors and TypeErrors, plus an unreadable file and no caching. XT-runtime-142: reflection counts and ArgumentCountErrors, root and subpath identity, and the JS TypeError limits for wrappers, include path, context, invalid UTF-8, NUL and lone surrogate. XT-runtime-84 and 85 keep checking the registry, now including the new functions. No test cites an FR or AD bullet.","findings":[]},{"id":"F-8","result":"pass","note":"Every in-scope change is in packages/runtime (src, docs, README, tests), the action item's only component. It adds no stub, fake or partial implementation of another Component; the Http request bag is deferred to a later Story as ESC-15.2-2 rules.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tag in any changed source file, and the new exports getenv, putenv, superglobals and file_get_contents are all synchronous. Under AD-6 Derivation and DIV-1, none is async: none returns a Promise and none takes a callback. file_get_contents uses readFileSync as ESC-15.2-3 rules (loaded once at boot, not Filesystem IO, no async root added), so no tag is missing.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: done

**Summary.** `@xaravel/runtime/php` (and the package root) now export `getenv` and `putenv` over `process.env`, `superglobals` (`server` and `env`: two `PhpArray`s for `$_SERVER` and `$_ENV`, seeded once at module load from `process.env` through PHP's `import_environment_variable` filter and key normalisation, never re-read), and a sync `file_get_contents` for a local path (offset and length as PHP's; `false` with no warning on a missing or unreadable file, DIV-9.17). The Oracle image's `variables_order` is recorded: no php.ini, so PHP's built-in `EGPCS` fills both arrays. Three registry entries were added (129 → 132).

**Files changed.**
- `packages/runtime/src/php/environmentFunctions.ts` (new): `getenv`, `putenv`, `superglobals`.
- `packages/runtime/src/php/fileFunctions.ts` (new): `file_get_contents` and its limits (registered stream wrappers, include path, context, invalid UTF-8).
- `packages/runtime/src/php/phpFunctions.ts`, `src/php/index.ts`, `src/index.ts`: registry entries and exports.
- `packages/runtime/docs/php-functions.md`, `README.md`: a "Process environment and file read" section and Not ported rows.
- `packages/runtime/tests/xaravel/php-process-environment.{probe.php,probe.txt,test.ts}`: XT-runtime-139..142 against PHP 8.5.11.
- `packages/runtime/tests/xaravel/php-set-functions.*`: the registry lists, count and its comment.

**Review.** Pass 1 had 27 findings (Review Triage Log).
- Patched, 10 rows in 7 entries, all low: the wrapper match narrowed to PHP's registered wrappers (also two edge rows); `$offset`/`$length` parsed before the limits; XT-runtime-139's seeded block unconditional; the stale count comment (also verification-gap); docs for U+FFFD in `environ`, `putenv` with no request-end restore, the Not-ported sentence and wrapping.
- Deferred 1 entry (2 rows), medium: a non-UTF-8 env file throws the runtime's existing bytes limit; carried to Story 15.2.
- Rejected 15: two spec-edit fixes (matrix row, Code Map path); `superglobals` reset helper (`PhpArray` already restores); integer-like name order and env-named CLI keys (the ruled `process.env` source, documented); files over 2 GB; the root-only unreadable case; three `maybe-false` Oracle-image claims (no Docker here; Linux CI runs the tests); four `false` (int keys are PHP's own, the adapters are Story 15.2's, the checks were run).

Pass 2 was the Finalize re-check: the Fidelity Review on tree `e2c701622b2cdb71e8597e7e34cc4162ad53ed9c`, both pass; `status` prints `current`.

**Follow-up review recommended: false.** Patched counts by entry verdict: high 0, medium 0, low 7.

**Verification.**
- Both probes regenerate with no diff against PHP 8.5.11.
- `bun run typecheck` and `bun run lint` exit 0.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`; Xaravel Tests 517, 512 passed, 0 failed, 5 skipped.
- `fidelity:review status --item epic-15-item-3-runtime-process-environment` prints `current`.

**Residual risks.**
- Probed on macOS PHP 8.5.11, not inside the Oracle image: glibc's `getenv` of a name with `=`, a directory read with a negative offset, and the wrapper set (the host also lists `zip` and `compress.bzip2`).
- Integer-like environment names come first in the arrays (`process.env` order).
- The deferred non-UTF-8 env file case for Story 15.2.
