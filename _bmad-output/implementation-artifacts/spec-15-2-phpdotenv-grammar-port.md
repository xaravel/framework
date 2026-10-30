---
title: 'Story 15.2: phpdotenv grammar port'
type: 'feature'
created: '2026-10-30'
status: 'blocked'
baseline_revision: '7985637e229a149e6c3cce464395273d6c9bade2'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/PORTING.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-15-context.md'
  - '{project-root}/docs/ops/oracle.md'
  - '{project-root}/decisions/DIV-10.md'
  - '{project-root}/conformance/escalations/ESC-15.2-1.md'
  - '{project-root}/conformance/escalations/ESC-15.2-2.md'
  - '{project-root}/conformance/escalations/ESC-15.2-3.md'
  - '{project-root}/conformance/escalations/ESC-15.2-4.md'
warnings: []
deferred:
  - summary: >-
      preg_last_error() reads 0 outside a Scope Frame, so Validator.php:144's idiom (@preg_match($regex, '') === false && preg_last_error() === PREG_INTERNAL_ERROR) misses an invalid allowedRegexValues pattern when Dotenv loads outside a frame.
    evidence: |-
      Deferred here by action item epic-15-item-2-runtime-pcre-functions (its spec's deferred list). Settle it by
      asserting that an invalid allowedRegexValues pattern throws phpdotenv's exception where Dotenv loads.
    location: >-
      packages/runtime/src/php/pcreFunctions.ts (record); phpdotenv Validator.php:144
    severity: medium (unverified)
  - summary: >-
      file_get_contents throws the runtime's UTF-8 limit for a readable file that is no valid UTF-8, so Reader cannot load a Latin-1 or Windows-1252 .env file through Str::utf8 with $fileEncoding.
    evidence: |-
      Deferred here by action item epic-15-item-3-runtime-process-environment (its spec's deferred list). The bytes
      limit is the runtime's rule for every PHP string. Decide whether a non-UTF-8 env file must load; if so, raise
      an Escalation (the runtime has no byte-string form).
    location: >-
      packages/runtime/src/php/fileFunctions.ts (decodeResult call); phpdotenv Store/File/Reader.php:73, Util/Str.php
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `@xaravel/config` has no `.env` parser, so the same `.env` file cannot give the same values in Xaravel as in PHP Laravel (FR-20). AD-22 makes `@xaravel/config` the owner of the `vlucas/phpdotenv` port, at the Pin's v5.7.0.

**Approach:** Port phpdotenv v5.7.0's `src/` line for line under `packages/config/src/Dotenv/**`, with PhpOption and ResultType as ESC-15.2-4 rules. Grade it with Oracle Differential Xaravel Tests XT-config-3 (grammar: values and error messages) and XT-config-4 (immutable and mutable repository precedence), whose inputs are `conformance/oracle-requests/15.2.jsonl` `php-expr` lines run against the framework vendor's `\Dotenv\…`.

## Boundaries & Constraints

**Always:**
- Keep phpdotenv's class, method and exception names and messages byte for byte (`Failed to parse dotenv file. Encountered an invalid name at [...].`). Each class goes in its own file under `src/Dotenv/<sub-path>/<Class>.ts`, ends with `registerClass("Dotenv\\…", X)`, returns `null` and never `undefined`, and stays sync (AD-6; ESC-15.2-3).
- PHP builtins come from `@xaravel/runtime/php` (ESC-15.2-1). Patterns are converted by PORTING.md § PCRE conversion. The superglobals and env functions follow ESC-15.2-2.
- Oracle requests: one `php-expr` line per XT id. `setup` builds the content, and each `expr` is one case (`\Dotenv\Dotenv::parse($c)`, or a repository round-trip). A throwing case is recorded as `throws`. Hashes are checked with `bun run oracle:story check 15.2`. XTs read the signed fixtures as `packages/collections/tests/xaravel/collections.test.ts:44-90` does.

**Never:**
- No module-private copy of a PHP builtin. No `process.env` access outside the runtime's env model. No env-file selection (`.env.<APP_ENV>`), no `env()`, no `LoadEnvironmentVariables` (Epics 20 and 51).
- No edit outside `packages/config/**`, `conformance/oracle-requests/15.2.jsonl` and this Story's Escalations.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Quoting | `A=x`, `B='x y'`, `C="x\ny"` | `x`, `x y`, x+LF+y | none |
| Interpolation | `A=1`, `B="${A}2"`, `C="${NOPE}"` | `12`, `${NOPE}` kept literally | none |
| Multiline | `K="a` LF `b"` | `a`+LF+`b` | none |
| `export` / comments / empty | `export A=1 # c`, `# x`, `E=` | `A=1`, the line skipped, `E=''` | none |
| Invalid | `A="x`, `1 2=3`, `A=x y` | — | `InvalidFileException`, Oracle message |
| Immutable | `$_SERVER['A']='real'`, file `A=file` | `real` kept | none |
| Mutable | same | `file` | none |

</intent-contract>

## Code Map

- phpdotenv v5.7.0 `src/` (41 files, 3,450 lines; `gh api repos/vlucas/phpdotenv/tarball/v5.7.0`). Core: `Parser/{Lexer,Lines,EntryParser,Parser,Entry,Value}.php`, `Loader/{Loader,Resolver}.php`, `Repository/{RepositoryBuilder,AdapterRepository}.php` and `Adapter/*`, `Store/*`, `Util/{Regex,Str}.php`, `Dotenv.php`, `Validator.php`, `Exception/*`.
- `conformance/oracle/locks/framework/composer.lock:5452` -- the Pin: phpdotenv v5.7.0, result-type v1.2.0 (:586), phpoption 1.10.0 (:2196). The Oracle image installs them (`conformance/oracle/Dockerfile:85-140`).
- `tools/oracle/request.ts:135-170` (`canonicalJson`, `requestHash`), `tools/oracle/evaluate.php:380-411` (setup `eval`, per-expr `throws`), `docs/ops/oracle.md:177-211,270-285` (encodings, fixture signature, XT requests).
- `packages/assert/tests/xaravel/oracle-values.ts:107,153,173` -- `decode`, `readRequests`, `readSignedFixture`. A missing fixture fails the XT.
- `conformance/xaravel-consequences/config.jsonl` -- FR-20.1 (grammar) for XT-config-3, FR-20.2 (precedence) for XT-config-4.
- `tools/registration/registration.ts` -- registerClass and the duplicate-FQCN scan.

## Tasks & Acceptance

**Execution (after ESC-15.2-1..4 are ruled and their runtime item is on `main`):**
- `packages/config/src/Dotenv/**` -- port every phpdotenv class, plus PhpOption and ResultType where ESC-15.2-4 puts them -- the Story's surface.
- `packages/config/src/index.ts` -- named exports -- package entry.
- `conformance/oracle-requests/15.2.jsonl` -- XT-config-3 and XT-config-4 requests covering every AC bullet -- the Oracle inputs.
- `packages/config/tests/xaravel/dotenv.test.ts` -- XT-config-3 (FR-20.1) and XT-config-4 (FR-20.2) against the signed fixtures -- the AC's tests.

**Acceptance Criteria:**
- Given the Oracle fixtures for XT-config-3, when the Xaravel parser runs on the same inputs, then every value and error message matches.
- Given a variable already in the real environment, when it is loaded immutably and then mutably, then the precedence matches the XT-config-4 fixtures.

## Spec Change Log

## Review Triage Log

## Design Notes

Planning found four contract questions. They were raised in one round before building (lesson, epic 14), and together they stop both Test IDs, so the Story is blocked until they are ruled. Under the 2026-10-30 amendment the orchestrator does not rule on `contract` Escalations.

- **ESC-15.2-1**: 27 PHP builtins (strings, ctype, mbstring, `filter_var`, PCRE, `getenv`/`putenv`, `function_exists`, `class_exists`) are missing from the runtime.
- **ESC-15.2-2**: `$_SERVER`, `$_ENV`, `getenv` and `putenv` have no runtime home. phpdotenv's default precedence reads the superglobals only.
- **ESC-15.2-3**: `FileStore` reads files with a sync `file_get_contents`, and AD-6 does not settle whether that is allowed.
- **ESC-15.2-4**: AD-22 has no row for PhpOption or ResultType, and Support's `Env` needs them without a composer edge to config.

## Verification

**Commands:**
- `bun run escalations:check` -- expected: valid (run 2026-10-30: OK).
- After the rulings: `bun run oracle:story check 15.2`, `bun run harness --xaravel --id 'XT-config-*'`, `bun run harness --story 15.2`, `bun run typecheck`, `bun run lint`, `bun run registration:check`, `bun run story:check 15.2`.

## Auto Run Result

Status: blocked
Blocking condition: contract Escalations ESC-15.2-1 (missing runtime builtins), ESC-15.2-2 (superglobals and env functions), ESC-15.2-3 (sync env-file read under AD-6) and ESC-15.2-4 (PhpOption/ResultType ownership) need a second key (MAINT-2026-10-16, amendment 2026-10-30). Between them they stop XT-config-3 and XT-config-4, the Story's only Test IDs.
