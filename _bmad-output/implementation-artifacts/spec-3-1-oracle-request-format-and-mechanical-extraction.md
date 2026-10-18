---
title: 'Story 3.1: Oracle request format and mechanical extraction'
type: 'feature'
created: '2026-10-17'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
  - 'stories/3.1.md'
  - 'conformance/escalations/ESC-3.1-1.md'
  - 'decisions/ESC-3.1-1.md'
warnings: [oversized]
deferred: []
---

# Story 3.1: Oracle request format and mechanical extraction

<intent-contract>

## Intent

**Problem:** Differential Tests need expected values from real PHP, and those values must trace back to Upstream inputs, not hand-written guesses (FR-6, AD-15). Nothing yet says what an Oracle request is or extracts one.

**Approach:** Build what ESC-3.1-1 option 1 (approved, `decisions/ESC-3.1-1.md`) describes: a request schema, five family extractor modules with a closed Differential file set, and `bun run oracle:extract`, which reads method bodies statically through PHP's own tokenizer, takes Test IDs and dataset rows from `tools/inventory/lister.php` (image, or `--local`), and writes sorted, byte-stable `conformance/oracle/requests/<component>.jsonl`.

## Boundaries & Constraints

**Always:**
- A request line is JSON with exactly `id`, `kind`, `input`, `sha256`, in that order. `sha256` = lowercase hex SHA-256 of the canonical JSON of `{id, kind, input}`: object keys sorted by UTF-16 code unit at every depth, no whitespace, UTF-8, `/` unescaped. The canonical serializer writes strings itself (never via a JS object, which reorders integer-like keys).
- `kind` ∈ `php-expr`, `sql-grammar`, `blade-render`, `validation-message`, `date-format`. Input key order per kind: `php-expr` `{bindings, setup, exprs}`; `sql-grammar` `{grammar, setup, exprs}` (`grammar` ∈ `base, sqlite, pgsql, mysql, mariadb, sqlsrv`); `blade-render` `{template, data}`; `validation-message` `{lines, data, rules, messages, attributes, format, exprs}`; `date-format` `{now, timezone, setup, exprs}`. `setup` and `exprs` are arrays of PHP source strings; `format` and `now` are string or null.
- The Differential set is closed, listed as `files` in each module under `tools/oracle/extract/`: `str.ts` (Support/SupportStrTest, SupportStringableTest), `sql.ts` (Database/DatabaseQueryBuilderTest and the five Database{SQLite,MySql,MariaDb,Postgres,SqlServer}SchemaGrammarTest), `blade.ts` (every tests/View/Blade/*.php, Integration/View/BladeTest.php), `validation.ts` (Validation/ValidationValidatorTest), `date.ts` (Support/SupportCarbonTest). A Test ID × dataset is Differential exactly when its module captures at least one input; anything unreadable yields no request, never a guess.
- PHP source in `setup`/`exprs` is the verbatim token text (whitespace and comments kept, trimmed at the ends) with class names resolved to fully qualified `\Name` against the file's namespace and `use` imports, as PHP's compiler would; nothing else is rewritten.
- Evaluation contract (documented for Story 3.2): `setup` then `exprs`, in order, run in a closure bound to an instance of the Test ID's Upstream class, between its `setUp()` and `tearDown()`, after each `bindings` entry (PHP literal source) is assigned to its variable.
- Output: one file per Component that has requests (Component from `buildEntries` + the component map), lines sorted by `id` then `sha256` (UTF-16 order, `compareUnits`), identical requests deduplicated, LF, trailing newline. Two requests with the same `sha256` but different lines fail the run. Two runs on the same snapshot give identical bytes.
- CLI shape of `tools/inventory/inventory.ts`: `main(argv)`, `UsageError` → exit 2, strict flags `--check`, `--root`, `--image <ref>` | `--local <dir> [--php <bin>]`; `--check` writes nothing and reports drift per file, failing closed. Docker only through `tools/oracle/oracle.ts` `runInImage`.
- XT tests use `bun:test` like the other `conformance/tests/xaravel/*.test.ts`; PHP-executing parts follow `php-scripts.test.ts`: skip with the reason when `php` is absent, fail under `XARAVEL_PHP_FIXTURES=require`.

**Never:** No change to the spine, SPEC, PRD or `epics.md`. No new npm dependency. No Oracle evaluation, fixtures or signing (Story 3.2), no `conformance/oracle-requests/` handling (Story 3.4). No edit to `lister.php` or the Inventory format. No guessed inputs: an unreadable body, binding or argument drops that request.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pure Str call | `$this->assertSame('FOO', Str::upper('foo'));` | `php-expr` `{bindings:{}, setup:[], exprs:["\\Illuminate\\Support\\Str::upper('foo')"]}` | none |
| Dataset | provider row `[0=>'a',1=>'b']`, params `$x, $y` | `bindings {"x":"'a'","y":"'b'"}`, one request per dataset | non-literal export (object, closure, hex, resource, recursion) → no request |
| Interleaved body | stmts S1, A1, S2, A2 | segment 1 `{setup:[S1], exprs:[actual(A1)]}`; segment 2 `{setup:[S1, actual(A1)+';', S2], exprs:[actual(A2)]}` | — |
| Unreadable | `if`/`foreach`/`try`/`return` statement, unknown assertion, named args, `expectException*`, `shouldReceive`/`Mockery`, `$this->x` not declared in the class, `self::`/`static::`/`parent::` outside an assertion head, undefined top-level variable | no request for that body | none |
| SQL multi-grammar | `$b = $this->getMySqlBuilder(); … $b = $this->getPostgresBuilder(); …` | one request per segment × grammar, `grammar` from the builder helper (schema files: from the file) | segment with no known grammar → no request |
| Blade literal | `compileString('@if($a) x @endif')` or `Blade::render('{{ $n }}', ['n'=>'T'])` | one `blade-render` per distinct template, `data` `{}` or decoded literal | variable/interpolated template, other statements than assertions and literal assignments → no request |
| Validation | translator, `addLines([...],'en')`, `$v = new Validator($trans, …)`, `setFormat`, asserts on `messages()`/`errors()` | `validation-message` with decoded arrays and those asserts' actuals | non-literal arrays, locale ≠ `en`, validator not `$v`, two validators → no request |
| Drift | `--check`, committed file differs/missing/stray | exit 1, `oracle requests drift: <file> …` per file | — |

</intent-contract>

## Code Map

- `tools/inventory/inventory.ts` -- reuse `listSuite(root, "framework", snapshot, LISTER, options)` (650; runs the lister in image or `--local`, includes `checkLocalCopy`), `RawTest` (96: `id, method, dataset, file, source, data`), `buildEntries(raws, readMap(root))` (352) for each id's Component, `compareUnits` (167), `oracleImage`, `ImageRunner`, `parseOptions` (805) as the flag-parsing model, `generate --check` drift (717-775) and `firstDifference` (private; copy).
- `tools/inventory/lister.php` -- `export()` (312) is the binding value format: `var_export` scalars, `[k=>v,…]` arrays, else `Class{…}`, `closure(…)`, `hex(…)`, `resource(…)`, `*RECURSION*`, `Enum::Case`. Read-only.
- `tools/oracle/oracle.ts` -- `runInImage(image, mounts, command)` (720), `IMAGE_UPSTREAM_DIR` (60), `ORACLE_DIR` (52).
- `tools/upstream/upstream.ts` -- `upstreamPath(root, "framework", ".")` (381) for the snapshot dir.
- `tools/ruleset/ruleset.ts:85` -- the canonical-JSON rule being matched (private).
- `conformance/tests/xaravel/php-scripts.test.ts` -- PHP guard pattern; its tests at 176-299 hold XT-conformance-68..74, which belong to Stories 3.1-3.3 (rename below).
- `_bmad-output/implementation-artifacts/story-manifests.md:18`, `spec-retro-2-execute-php-scripts.md:154` -- record the off-manifest IDs.
- `docs/ops/oracle.md` -- Oracle operator doc; gains a Requests section.
- Upstream shapes: SupportStringableTest's `$this->stringable($s)` helper; DatabaseQueryBuilderTest helpers `getBuilder` (base), `getPostgresBuilder[WithProcessor]`, `getMySqlBuilder[WithProcessor]`, `getMariaDbBuilder`, `getSQLiteBuilder`, `getSqlServerBuilder` (8076-8146); schema grammar files build `new Blueprint($this->getConnection(), …)`; ValidationValidatorTest uses `$trans = $this->getIlluminateArrayTranslator()` and `$v = new Validator(…)` (1535 of 1579); SupportCarbonTest's `setUp` calls `Carbon::setTestNow($this->now = Carbon::create(…, 'UTC'))`; phpunit.xml.dist sets `date.timezone` UTC.
- Local install for `--local`: `/tmp/xaravel-inv/framework` (lister runs in ~6 s).

## Tasks & Acceptance

**Execution:**
- `tools/oracle/extract/tokens.php` -- `php tokens.php <dir> <file>…`: one JSON line per file `{"file","tokens":[[name,text,line],…]}` from `PhpToken::tokenize` (`getTokenName()`), files as given, `JSON_THROW_ON_ERROR`, exit 1 with reason on failure -- real PHP tokenizer, no vendor needed.
- `tools/oracle/extract/php.ts` -- typed tokens; file model (namespace, `use` imports incl. group/function/const, class methods with params and bodies, declared properties); body → top-level statements; assertion recognition (`$this->`/`static::`/`self::` + table of assert name → actual-argument index; unknown → unreadable); segmenting; readability rules from the matrix; free-variable check at top level; class-name resolution (before `::`, after `new`/`instanceof`, type hints); PHP literal decoding (strings incl. escapes, heredoc/nowdoc without interpolation, `.` concatenation, ints, floats, bools, null, arrays → JSON list/object, integer-keyed non-lists unreadable); export-string splitting and literal check for bindings.
- `tools/oracle/extract/{str,sql,blade,validation,date}.ts` -- one `Family` each: `kind`, closed `files`, `extract(test) → input[]`, per the rules above.
- `tools/oracle/request.ts` -- request types, `canonicalJson`, `requestHash`, `makeRequest`, `validateRequest(value, schema)` (small JSON-Schema subset interpreter reading `conformance/oracle/schema.json`, plus the hash check), `renderRequests`.
- `conformance/oracle/schema.json` -- JSON Schema 2020-12: the four required keys, `additionalProperties: false`, `id` pattern (PHPUnit Test ID, Pest Test ID or `XT-<component>-<n>`), `kind` enum, per-kind `input` via `allOf`/`if`/`then`, `sha256` `^[0-9a-f]{64}$`, descriptions stating the evaluation contract.
- `tools/oracle/extract.ts` + `package.json` script `oracle:extract` -- the CLI; runs lister and tokens.php (image: both mounted read-only; local: local php, tokens read from the snapshot), joins raws to families, writes or checks files, prints counts per Component and per family.
- `conformance/oracle/requests/*.jsonl` -- generated with `bun run oracle:extract --local /tmp/xaravel-inv/framework`.
- `conformance/tests/xaravel/oracle-extract.test.ts` -- XT-conformance-68 (schema accepts each kind; rejects missing/extra keys, bad kind, bad sha256, wrong hash, malformed input; canonical JSON sorts integer-like keys by code unit), XT-conformance-69 (fixture root with small Upstream test files for all five families + fake lister runner → exact request files, sorted, one request per readable Test ID × dataset/segment/grammar/template, unreadable cases absent; real committed requests validate against the schema, and their ids exist in the Inventory), XT-conformance-70 (two runs → identical bytes; `--check` passes, then reports drift after a byte change; usage errors exit 2).
- `conformance/tests/xaravel/php-scripts.test.ts` -- rename XT-conformance-68..74 to 173..179, same order; update `story-manifests.md:18` (next free becomes 180) and `spec-retro-2-execute-php-scripts.md:154`.
- `docs/ops/oracle.md` -- Requests section: command, modes, request format, evaluation contract per kind, Differential set, readability rules.

**Acceptance Criteria:**
- Given the request schema in `conformance/oracle/schema.json`, when a request is validated, then it requires `id` (Test ID or XT ID), `kind` (the five), `input` and a `sha256` of the canonical request, and a wrong hash fails.
- Given the five family modules, when `bun run oracle:extract` runs, then it writes `conformance/oracle/requests/<component>.jsonl`, sorted, one request per Differential Test ID × dataset (× segment, grammar or template).
- Given the same snapshot, when extraction runs twice, then the output is identical and `--check` passes.

## Spec Change Log

## Review Triage Log

## Design Notes

Segmenting keeps every assertion: segment k's `setup` replays everything before it, with earlier assertions reduced to their actual argument as an expression statement, so side effects (random sequences, lazy validation) happen as in Upstream. A single-segment body is exactly ESC-3.1-1's `{setup: statements before, exprs}`. Multiple requests per Test ID are already implied by the ESC's per-grammar rule; Story 3.2 keys fixtures by `sha256`.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/oracle-extract.test.ts conformance/tests/xaravel/php-scripts.test.ts` -- all pass
- `bun run oracle:extract --check --local /tmp/xaravel-inv/framework` -- exit 0
- `bun run typecheck` and `bun run lint` -- clean
- `bun test` -- no new failures

## Auto Run Result

Previous run (2026-10-17), status blocked. Blocking condition: intent gap. The request `input` per kind, the canonical form behind `sha256`, and the set of Differential Test IDs are undefined in the PRD, the spine and `epics.md`, and the Upstream shapes admit several readings with different outputs. Raised as `conformance/escalations/ESC-3.1-1.md`, since approved (option 1, `decisions/ESC-3.1-1.md`).
