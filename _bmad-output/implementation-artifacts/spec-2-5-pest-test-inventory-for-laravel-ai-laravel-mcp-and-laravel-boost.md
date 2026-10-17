---
title: 'Story 2.5: Pest Test Inventory for `laravel/ai`, `laravel/mcp` and `laravel/boost`'
type: 'feature'
created: '2026-10-17'
baseline_revision: 'c65a1a286e2df7dc5b48ea0a575b8ee6b7bb9f6e'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/stories/2.5.md'
  - '{project-root}/docs/ops/inventory.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Pest-mode lister logic (prepend hook, closure and arch extent, describe stripping, dataset export) is checked by bun test only through source-text needles and the committed output.
    evidence: |-
      bun test must not need PHP or vendor files (intent Never list), so no test runs lister.php; a regression that leaves the committed files alone ships until the next manual regeneration. Same gap Story 2.4 deferred for PHPUnit mode; Story 2.7's determinism and runner-listing cross-check runs the real lister.
    location: >-
      tools/inventory/lister.php
    severity: medium
  - summary: >-
      Image mode for the Pest suites has not been run against a real Oracle image; the committed files were generated with --local.
    evidence: |-
      The orchestrator host has no Docker. Only the stand-in runner exercised the image command (php /xaravel/lister.php /oracle/upstream/<suite> 8.5.11 pest, one read-only mount). Story 2.7's Inventory workflow runs in the image.
    location: >-
      tools/inventory/inventory.ts listSuite
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The Inventory covers only `laravel/framework`. The three Pest suites (`laravel/ai`, `laravel/mcp`, `laravel/boost`) have no Test IDs, so AI, MCP and Boost conformance has no denominator (FR-1).

**Approach:** `tools/inventory/lister.php` gains a `pest` mode. It runs the suite's own `vendor/bin/pest --list-tests-xml` with itself as `auto_prepend_file`. At shutdown, inside Pest's process, it reads the listing (authoritative) and Pest's test repository, and writes one raw line per listed test. `tools/inventory/inventory.ts` gains `--suite <framework|ai|mcp|boost|all>` and turns Pest raw lines into `conformance/inventory/<suite>.jsonl`, in Story 2.4's record format.

## Boundaries & Constraints

**Always:**
- Entry keys, order, file format, sorting and `JSON.stringify` are Story 2.4's. Each Pest suite writes only `<suite>.jsonl`; every entry's `component` is `componentForTest(map, "<suite>/<test file>")`, and it must equal the suite name (`ai` entries are Component `ai`).
- `id` is `<suite>/<test file>::<describe> > … > <test name>` plus `#<dataset>` for a dataset. `<test file>` is relative to the suite directory (`tests/…`). `<describe>` values are Pest's `describe()` descriptions, outermost first; `<test name>` is Pest's description without its describe prefix (`it(…)` keeps its `it ` prefix). `<dataset>` is the dataset label Pest's runner lists, verbatim (for example `dataset "tools/list"` or `('Mcp-Name')`). Each dataset is its own entry.
- `source` is `<suite>/<file>:<start>-<end>`: the test closure's lines, or for a closure-less `arch('<name>')` test, its statement's lines. It lies inside `<suite>/tests/`.
- `hash` is Story 2.4's formula. The tokens are the closure's, from `function`/`fn` to its end (a `function`'s closing brace, an `fn`'s expression end), or the `arch(…)` statement's through its `;`. `data` is the dataset export, with randomness pinned as in Story 2.4.
- `kind`: `integration` under `<suite>/tests/Integration/`, otherwise `unit`. `backends`: `#[RequiresDatabase]` drivers on the test class hierarchy, plus `redis` when it uses `InteractsWithRedis`; otherwise `["none"]`. The framework-only directory and queue rules do not apply.
- The lister fails closed on: the wrong PHP version; Pest output other than its one `INFO  Wrote list of tests …` line; a non-zero Pest exit; a listed method that matches no Pest test; a describe prefix that does not match; a dataset with no provider label; a closure-less test that is not exactly one `arch('<literal>')` statement.
- CLI: `generate [--suite <s>] [--root] [--image <ref> | --local <dir> [--php <bin>]]`. Without `--local`, the default suite is `all` (framework, then ai, mcp, boost). With `--local`, `<dir>` is one suite's locked install, the suite defaults to `framework` (Story 2.4's form keeps working), and `all` is a usage error. `--local` checks that `<dir>`'s `tests/`, `src/` and `phpunit.xml.dist` equal the suite's snapshot copy. Image mode runs `php /xaravel/lister.php /oracle/upstream/<suite> <php> pest` with the same single read-only mount.
- Existing framework behaviour, the framework Inventory files and every Story 2.4 test stay byte-identical.

**Never:**
- Fetch anything, or edit the snapshot, the component map, `ci.yml`, `conformance/protected-paths`, `tools/protected-paths/`, `tools/ownership/` or any existing test's expected values.
- Make `bun test` need PHP, Docker or vendor files.
- Write `assertions` or `oracle` (Story 2.6), add a CI workflow or the runner cross-check (Story 2.7), or write Expectations (`deferred:ai-sdk` is Epic 5's).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Generate all | image mode, real snapshot | framework files plus `ai.jsonl`, `mcp.jsonl`, `boost.jsonl`; counts; exit 0 | — |
| One suite local | `--suite mcp --local <mcp install>` | writes only `mcp.jsonl` | — |
| Describe | `describe('A', fn () => describe('B', fn () => it('x')))` | `…::A > B > it x` | — |
| Dataset | `->with(['a' => [1], [2]])` | `…#dataset "a"`, `…#(2)` separate entries | — |
| Wrong component | Pest file maps to a Component other than the suite | exit 1 `… maps to <c>, not <suite>` | — |
| Bad usage | `--local x --suite all`, unknown suite | exit 2 | — |
| Bad raw line | missing or mistyped field | exit 1 `raw line <n>: …` | — |
| Stale local copy | file differs from `conformance/upstream/<suite>` | exit 1 naming the file | — |
| No snapshot | `conformance/upstream/<suite>` absent | exit 1 `run bun run upstream:sync` | no fetch |

</intent-contract>

## Code Map

- `tools/inventory/inventory.ts` -- Story 2.4's generator: `RawTest`/`parseRaw` (:57, :122), `kindFor`/`backendsFor` (:216, :224), `buildEntries` (:253, framework-only path prefix), `parseInventory` (:304, `SOURCE` regex framework-only at :300), `checkLocalCopy` (:384, messages hard-code `framework`), `generate` (:427), CLI `parseOptions`/`main` (:487, :520). `FOREIGN_COMPONENTS` must stay `["ai","boost","mcp"]`: XT-49 excludes them from its 16216 count.
- `tools/inventory/lister.php` -- framework lister; reusable helpers `fail`, `relativePath`, `tokensOf`, `tokenString`, `lineCodeTokens`, `export`, `requiredDatabases`, `usesRedis`, `pinRandomness`. Top-level functions are compile-time bound, so an early `return` in prepend mode still leaves them callable.
- `conformance/tests/xaravel/inventory.test.ts:217-221` -- XT-49 pins image mode's single mount and 4-element command for the framework, and `generate(fx.dir, { runner })` with no suite must still do framework only; `:191` pins the fake php's 3 args.
- Pest 4.7.8 / PHPUnit 12.5.33 (all three locks). `Pest\TestSuite::getInstance()->tests` (`TestRepository`, private `testCases`: filename → `TestCaseFactory`), `TestCaseFactory::getMethod($phpunitMethod)`; `TestCaseMethodFactory` has `description` (already `Str::describe`d: `` `A` → `B` → name``), `describing` (list of `Pest\Support\Description`, Stringable), `closure`. Generated class `P\Tests\…` has static `$__filename`; listing XML `testClass@file` is eval'd code, so use `$__filename`. Closure-less tests are `arch()` (7 in mcp, 5 in boost); their closure is Pest's default in `vendor/pestphp/pest/src/Factories/TestCaseMethodFactory.php`.
- Prototype at the Pin (`/tmp/xaravel-inv25/<suite>`: snapshot copy + `composer install` from `conformance/oracle/locks/<suite>/composer.lock`): `pest --list-tests-xml` lists ai 3381, mcp 1284, boost 1138 methods; stdout is `\n   INFO  Wrote list of tests that would have been run to <file>.\n\n`.
- `tools/oracle/oracle.ts` -- `IMAGE_UPSTREAM_DIR`, `PHP_VERSION`, `runInImage`; `tools/upstream/upstream.ts` `upstreamPath`, `UPSTREAM_NAMES`.

## Tasks & Acceptance

**Execution:**
- `tools/inventory/lister.php` -- add `pest` mode (4th arg): version guard, run `PHP_BINARY -d auto_prepend_file=<this file> vendor/bin/pest --colors=never --do-not-cache-result --list-tests-xml <list>` with env `XARAVEL_INVENTORY_PEST=<out file>`; in prepend mode register the shutdown dump and return. Raw line: `{"id","class","method","dataset","file","describe":string[],"name","source","tokens","data","requiresDatabase","redis"}`. Framework mode unchanged.
- `tools/inventory/inventory.ts` -- `Suite` type and `PEST_SUITES`; `PestRawTest`, `parsePestRaw`, `pestTestId`, `buildPestEntries`; suite-aware `kindFor`/`backendsFor`, `parseInventory` source, `checkLocalCopy`; `generate(root, {suite})` (default `framework`); CLI `--suite`.
- `conformance/inventory/{ai,mcp,boost}.jsonl` -- generated with `--local` per suite.
- `conformance/tests/xaravel/pest-inventory.test.ts` -- new: XT-conformance-53..55 and the matrix, fixture roots and fake `--php`, committed-file checks (snapshot-guarded where needed).
- `docs/ops/inventory.md` -- Pest section: suites, ID form, dataset labels, source/hash for closures and arch tests, backends, `--suite`.

**Acceptance Criteria:**
- Given the Oracle image (or locked local installs) and the snapshot, when `bun run inventory` runs, then every Pest test in the three snapshots gets an entry `{id, component, kind, backends, source, hash}` with an ID `<suite>/<file>::<describe> > … > <test name>#<dataset>`. The committed files hold ai 3381, mcp 1284, boost 1138 unique, sorted, well-formed ids, and `CompletionTest` describe entries use ` > ` (XT-conformance-53).
- Given a Pest `with()` dataset, when it is inventoried, then each dataset is its own entry, carrying Pest's label; for example mcp's `it adds caching hints to every cacheable result#dataset "tools/list"` and `it rejects a request missing a required header#('Mcp-Name')` (XT-conformance-54).
- Given the `laravel/ai` entries, when they are written, then every one is Component `ai` in `ai.jsonl`, and mcp/boost entries are `mcp`/`boost`; a Pest file mapped to another Component fails (XT-conformance-55).

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 29 findings — high 0, medium 2, low 19, false 6, maybe-false 2
- findings:
  - `[medium]` `[defer]` (intent-alignment) Pest-mode lister.php and image mode are never run by a test — same root as the verification-gap lister finding; bun test may not need PHP; deferred to Story 2.7.
  - `[maybe-false]` `[defer]` (intent-alignment) committed files were generated with `--local`, not in the Oracle image the AC names — no Docker on this host; would be settled by an image-mode run producing identical files (Story 2.7). Deferred as medium (unverified).
  - `[false]` `[reject]` (intent-alignment) the `<suite>/` prefix on `<test-file-path>` is an interpretation — the PRD form is kept; the path is snapshot-relative, as in the component map and every `source`, and keeps IDs unique across repositories.
  - `[false]` `[reject]` (intent-alignment) `bun run inventory` now defaults to all suites — the AC requires exactly that ("When `bun run inventory` runs … every Pest test"); `--local` keeps Story 2.4's form.
  - `[low]` `[patch]` (verification-gap) the CLI's default suite is untested at the CLI — added a CLI-level assertion.
  - `[medium]` `[defer]` (verification-gap) Pest-mode lister logic is checked only by source-text needles — grouped with the intent-alignment lister finding; deferred.
  - `[low]` `[reject]` (verification-gap) `buildPestEntries` and `listSuite` word the outside-`tests/` failure differently — `buildPestEntries` is the exported function's own defence (Story 2.4 precedent); not reachable through `generate()`.
  - `[low]` `[patch]` (verification-gap) header comment line in inventory.ts not wrapped — rewrapped.
  - `[low]` `[reject]` (edge-case) a one-line test closure holding a nested `fn` gives "2 candidate test closures" — fails closed; none at the Pin; the fix adds selection logic.
  - `[low]` `[reject]` (edge-case) a closure-less non-arch test's error blames arch() — fails closed with the file named; none at the Pin; message tweak adds a branch.
  - `[low]` `[reject]` (edge-case) two same-named arch() tests in different describes fail closed — none at the Pin; disambiguation adds logic.
  - `[low]` `[reject]` (edge-case) describe/name containing ` > ` or `#` can make IDs ambiguous — none at the Pin (committed files parse; duplicates fail); a guard covers an undemonstrated state.
  - `[low]` `[reject]` (edge-case) `--local` does not compare workbench/, config/, testbench.yaml, functions.php — consistent with Story 2.4's checked set; the regeneration procedure copies the whole snapshot.
  - `[low]` `[reject]` (blind) the generated `.jsonl` files are absent from the review diff — excluded deliberately as 5803 generated lines; they are checked by XT-53..55 and were regenerated byte-identically.
  - `[low]` `[reject]` (blind) ambiguous Pest IDs with ` > ` or `#` — same as the edge-case finding; rejected.
  - `[low]` `[reject]` (blind) unreachable `buildPestEntries` message — same as the verification-gap finding; rejected.
  - `[low]` `[patch]` (blind) the Failures table misstates how Pest-mode lister failures surface (they are wrapped in `pest --list-tests-xml exited 1`) and misses the `<suite>/tests is missing` row — docs corrected.
  - `[low]` `[reject]` (blind) `--local <mcp install>` without `--suite` reports a long file list — the documented form names the suite; the list names every file, which points at the cause; detection adds magic.
  - `[low]` `[patch]` (blind) no test checks that one suite's run leaves other suites' files untouched — assertion added.
  - `[low]` `[patch]` (blind) the plain-PHPUnit-class branch is unasserted — the boost entry is pinned in the committed-file checks.
  - `[medium]` `[defer]` (blind) lister logic checked only by string matching — same root as the deferred lister finding.
  - `[low]` `[patch]` (blind) the docs' "every entry is `["none"]`" claim is unasserted — committed-file assertion added.
  - `[low]` `[reject]` (blind) `parseInventory` does not cross-check id file and source file — a new check; the committed-file test already checks both exist.
  - `[low]` `[patch]` (blind) regeneration steps hard-code `COMPOSER_ROOT_VERSION` values — docs now point to `conformance/baseline-pin`.
  - `[low]` `[reject]` (blind) prepend mode leaves globals in Pest's process — harmless in a listing-only process; refactor adds churn.
  - `[low]` `[reject]` (blind) `SOURCES` regex repeated per suite — cosmetic; four fixed suites.
  - `[low]` `[reject]` (blind) `enclosingCall` stops at `[`/`{` so a dataset `fn` in `with([…])` on the same line is a candidate — same as the edge-case nested-closure finding; fails closed, none at the Pin.
  - `[maybe-false]` `[reject]` (blind) XT-53 is one large test that hides later failures — Story 2.4's convention (one test per XT id); would only be low.
  - `[low]` `[patch]` (blind) header wrap and missing Failures row — handled with the rows above.

## Design Notes

The suite prefix makes the ID unique across repositories and matches `source` and the component map (`ai/tests/`). The dataset label is verbatim from Pest's listing, as Story 2.4 keeps PHPUnit's: Story 2.7 cross-checks the IDs against the runner, and an invented index would need a mapping. Running inside Pest's own process is what gives the authoritative listing and the in-memory describe tree together; re-bootstrapping Pest separately would duplicate its loader. `kind` reuses Story 2.4's `tests/Integration/` rule: only `laravel/ai` has that directory, and its `Pest.php` groups it as `integration`. The suites use in-memory SQLite through `phpunit.xml.dist` env, as framework tests outside engine directories do, so they are `["none"]`, consistently with Story 2.4.

Pest also runs plain PHPUnit classes. At the Pin, `boost/tests/Feature/BrowserLogsRouteRegistrationTest.php` is one. It has no Pest test record, so its test name is the method name, it has no describe, and its source and hash are the method's, as in Story 2.4: `boost/tests/Feature/BrowserLogsRouteRegistrationTest.php::test_browser_logs_route_is_not_registered_when_the_watcher_is_disabled`. Failing on it would leave boost short of the 1138 tests its runner lists, which the AC forbids.

## Verification

**Commands:**
- `bun run inventory --suite <s> --local /tmp/xaravel-inv25/<s>` for ai, mcp, boost -- expected: exit 0 with the counts above; run twice, no diff
- `bun run inventory --local /tmp/xaravel-inv/framework` -- expected: framework files unchanged (`git diff --stat conformance/inventory` empty)
- `bun test`, `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `bun run protected-paths:codeowners --check`, `bun run component-map:check`, `bun run upstream:check` -- expected: clean

## Auto Run Result

Status: done (2026-10-17)

**Summary.** `tools/inventory/lister.php` has a new `pest` mode. It runs the suite's own `vendor/bin/pest --list-tests-xml` with itself as `auto_prepend_file`. At Pest's shutdown it reads the listing and Pest's test repository, and writes one raw line per listed test. `tools/inventory/inventory.ts` turns those lines into `conformance/inventory/{ai,mcp,boost}.jsonl`, with IDs of the form `<suite>/<file>::<describe> > … > <test name>#<Pest dataset label>`, and gains `--suite <framework|ai|mcp|boost|all>`. `bun run inventory` (image mode) now covers all four suites. `--local` takes one suite and defaults to `framework`, so Story 2.4's form still works. The framework Inventory is byte-identical.

**Files changed:**
- `tools/inventory/lister.php`: Pest mode (prepend hook, closure and `arch()` extents, describe stripping, dataset export, plain PHPUnit classes); framework mode unchanged.
- `tools/inventory/inventory.ts`: suites, Pest raw parsing, Pest IDs and entries, suite-aware kind, backends, local-copy check and `parseInventory`; the `--suite` CLI option.
- `conformance/inventory/ai.jsonl` (3381), `mcp.jsonl` (1284), `boost.jsonl` (1138): generated with `--local` for each suite.
- `conformance/tests/xaravel/pest-inventory.test.ts`: new. XT-conformance-53..55 and every row of the matrix.
- `docs/ops/inventory.md`: Pest section, `--suite`, failures table, regeneration steps.

**Review:** 29 findings: 2 medium, 19 low, 6 false, 2 maybe-false.
- **Patched:** 8 low, all tests and docs:
  - a CLI test of the default suite;
  - a test that a run leaves the other suites' files untouched;
  - the plain-class boost entry pinned, and the all-`["none"]` backends claim asserted;
  - the failures table corrected;
  - the regeneration versions now read from `baseline-pin`;
  - the header comment rewrapped.
- **Deferred:**
  - the Pest-mode lister logic, which `bun test` does not run (medium, Story 2.7);
  - image mode, never run against a real Oracle image (medium, unverified, Story 2.7).
- **Rejected:** 13 low, 6 false and 1 maybe-false. Each one's reason is in the Review Triage Log.

**Follow-up review recommended:** `false`. Patched by verdict: high 0, medium 0, low 8.

**Verification:**
- `bun run inventory --suite <s> --local /tmp/xaravel-inv25/<s>` exits 0 for each suite, with ai 3381, mcp 1284 and boost 1138; repeated runs give the same files.
- `bun run inventory --local /tmp/xaravel-inv/framework` gives 16216 tests with no change to the framework files.
- `bun test`: 57 pass, 0 fail.
- `typecheck`, `lint`, `workflows:check`, `protected-paths:codeowners --check`, `component-map:check` and `upstream:check`: all exit 0.
- Matrix audit: every row is covered by a passing test in XT-53..55.

**Residual risks:**
- Image mode has not been run against a real image, because there is no Docker on this host.
- Closure matching is a line-based heuristic that fails closed. All 5803 tests at the Pin resolve.
- A describe or name containing ` > ` or `#` would make an ID ambiguous. There are none at the Pin.
- The ai suite needed the per-class token-cache reset to fit in PHP's default 128M of memory. The image's memory headroom is untested.
