---
title: 'Retro epic 2 item 4: execute the PHP lister, recorder and runner in tests'
type: 'feature'
created: '2026-10-17'
status: 'done'
baseline_revision: '064fc5d00dfdb52bbd800ddbe75b9049eb0d122c'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: []
deferred:
  - summary: >-
      The ci / php-fixtures job is advisory: it is not a required check, so a red run can still merge.
    evidence: |-
      .github/rulesets/main.json requires only audit, ownership and protected-paths, and XT-conformance-33 pins that list. Making php-fixtures required is a Maintainer ruleset change, like Epic 1 retro item 2 (epic-1-retro-item-2-require-remaining-checks).
    location: >-
      .github/rulesets/main.json
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `tools/inventory/lister.php`, `tools/baseline/recorder.php` and `tools/baseline/runner.php` are never executed by `bun test`. Only fakes and string greps cover them, so the fork-guard bug, which recorded assertion counts 21 times, reached a live CI run (Epic 2 retro finding R5, action `epic-2-retro-item-4-execute-php-lister-recorder`).

**Approach:** Commit two tiny fixture projects, one PHPUnit and one Pest, each with its own `composer.json` and `composer.lock` pinned to the Oracle locks' PHPUnit and Pest versions. Install their `vendor/` (gitignored) with one script. Add a `bun test` file that runs the real PHP scripts against them with the local `php` and asserts exact output. When `php` or a fixture `vendor/` is absent, the test skips with a reason. CI installs the fixtures and sets an env var that turns that skip into a failure.

## Boundaries & Constraints

**Always:**
- The test never touches the network. `composer install` runs only in the install script and the CI step.
- Fixture versions:
  - The PHPUnit fixture uses `phpunit/phpunit` 13.4.3, as in `conformance/oracle/locks/framework`.
  - The Pest fixture uses `pestphp/pest` v4.7.8 with `phpunit/phpunit` 12.5.33, as in `conformance/oracle/locks/{ai,mcp,boost}`.
- The PHP scripts are passed the running PHP's own `PHP_VERSION`. The test reads it with `php -r 'echo PHP_VERSION;'`.
- A skip names its cause: `php not on PATH`, or `<fixture>/vendor missing; run bun run php-fixtures:install`.
- With `XARAVEL_PHP_FIXTURES=require`, an unmet precondition fails the test instead of skipping it.
- The test's assertions are exact values (ids, datasets, outcomes, assertion counts), not `toContain` greps.
- The test style matches the sibling tests in `conformance/tests/xaravel/`: `bun:test`, not `portedTest`, because these are tool tests, not Ported Tests.
- Every new action in a workflow is pinned to a full commit SHA, with the version in a comment, like the existing ones.

**Never:**
- Do not change the PHP scripts' behaviour unless a real run exposes a bug. If one does, fix it and record the fix in this spec.
- Do not weaken or remove any existing assertion.
- Do not commit `vendor/`.
- Do not edit `conformance/protected-paths`, `tools/protected-paths/`, `tools/ownership/` or their workflows.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| PHPUnit listing | `php lister.php <phpunit-fixture> <ver>` | Exits 0. One raw line per listed test, in listing order. `parseRaw` accepts them. Ids equal `phpunit --list-tests` ids via `parseRunnerListing`. Provider datasets have `data` exported, and plain tests have `data: null`. | none |
| Pest listing | `php lister.php <pest-fixture> <ver> pest` | Exits 0. `parsePestRaw` accepts the lines. `pestTestId` gives the expected `describe > name#dataset` ids. Ids equal `pest --list-tests` via `parseRunnerListing`. | none |
| PHPUnit baseline | `php runner.php <phpunit-fixture> <ver> phpunit -` | Exits 0. The recorder lines give the exact pass, skip or fail outcome and the exact `{kind: count}` per test. A nested `assertThat` inside `assertCount` counts once. | none |
| Fork in a test | A test asserts once and then `pcntl_fork()`s; the child exits | That test's count is recorded once, not repeated by the child | The test needs the `pcntl` extension (`RequiresPhpExtension`) |
| Pest baseline | `php runner.php <pest-fixture> <ver> pest -` | Exits 0. Exact outcomes and counts per Pest test id. | none |
| Files list | A runner given a files-list naming one file | Only that file's tests are recorded | none |
| No PHP or vendor | `php` missing, or `vendor/` missing | The test is skipped with the reason. With `XARAVEL_PHP_FIXTURES=require` it fails with the reason. | — |

</intent-contract>

## Code Map

- `tools/inventory/lister.php` -- read-only. PHPUnit mode needs `vendor/autoload.php`, `vendor/bin/phpunit` and `phpunit.xml.dist`, and expects exactly two lines of PHPUnit output (L139-143). Pest mode (`pestRun` L535) expects exactly one `INFO  Wrote list…` line. Field order is at L510-521 (PHPUnit) and `pestRawLine` L960 (Pest). A dataset name with no matching provider label fails (L495).
- `tools/baseline/runner.php` -- read-only. Takes `<suite-dir> <ver> <phpunit|pest> <files-list|->`. Requires `vendor/phpunit/phpunit/src/Framework/Assert.php`. Writes `phpunit.xaravel-baseline.xml` into the suite dir and removes it. Copies the recorder lines to stdout.
- `tools/baseline/recorder.php` -- read-only. The fork guard is at L439-450 (`getmypid()`). Line shape: `{"test","class","outcome","assertions"}`, with tests sorted and then class lines.
- `tools/inventory/inventory.ts` -- reuse `parseRaw` (L256), `parsePestRaw` (L264), `pestTestId` (L280) and `LISTER`.
- `tools/inventory/cross-check.ts` -- reuse `parseRunnerListing(text, runner)` (L80).
- `conformance/tests/xaravel/{inventory,baseline,pest-inventory}.test.ts` -- the style to match: `import { expect, test } from "bun:test"`, plus temp dirs and `Bun.spawnSync`.
- `.github/workflows/ci.yml` -- the `check` job runs `bun run test` on ubuntu-latest, which has no suitable PHP. Add a `php-fixtures` job.
- `.gitignore` -- add the fixture `vendor/` dirs.
- `package.json` -- add the `php-fixtures:install` script.

## Tasks & Acceptance

**Execution:**
- `conformance/tests/xaravel/php-fixtures/phpunit/{composer.json,composer.lock,phpunit.xml.dist,tests/…}` -- Add a PHPUnit 13.4.3 project. Its tests cover: a passing test with mixed assertion kinds; `assertCount` (nested `assertThat`); a `DataProvider` with two named datasets; a skipped test; a failing test; and a pcntl fork test. It autoloads `Fixture\Tests\` from `tests/`.
- `conformance/tests/xaravel/php-fixtures/pest/{composer.json,composer.lock,phpunit.xml.dist,tests/…}` -- Add a Pest v4.7.8 project. Its tests cover: a top-level `test`; a `describe` block with an `it`; a `->with()` dataset; a skipped test; and a failing `expect`.
- `package.json` -- Add `"php-fixtures:install"`. It runs `composer install --no-interaction --no-progress` in both fixture dirs, with `--no-plugins --no-scripts` unless Pest needs its plugin. If Pest does need it, note why in Design Notes.
- `.gitignore` -- Ignore `/conformance/tests/xaravel/php-fixtures/*/vendor/`.
- `conformance/tests/xaravel/php-scripts.test.ts` -- Add the tests for the I/O matrix, with real PHP, exact expected values, and the skip or require logic.
- `.github/workflows/ci.yml` -- Add a `php-fixtures` job with `contents: read` and `timeout-minutes: 15`. It runs checkout, setup-bun, `bun install --frozen-lockfile --ignore-scripts`, and `shivammathur/setup-php@eb7c497e18156a6bbabfef1d3a82760b9eda3962 # 2.40.0` with `php-version: '8.5'`, `extensions: dom, mbstring, pcntl, tokenizer, xml` and `coverage: none`. Then it runs `bun run php-fixtures:install` and `XARAVEL_PHP_FIXTURES=require bun test conformance/tests/xaravel/php-scripts.test.ts`. Update the header comment.

**Acceptance Criteria:**
- Given installed fixtures and PHP ≥ 8.4 with pcntl, when `bun test conformance/tests/xaravel/php-scripts.test.ts` runs, then every matrix row passes and none is skipped.
- Given the recorder's fork guard removed locally, when the test runs, then the fork test's recorded count is wrong and the test fails. This is a mutation check, run during verification and not committed.
- Given no fixture `vendor/`, when `bun run test` runs, then the new tests report as skipped with the reason and the suite still passes. When `XARAVEL_PHP_FIXTURES=require` is set, they fail.
- Given the PR, when CI runs, then `ci / php-fixtures` is green, and `workflow-permissions` passes.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 28 findings — high 0, medium 7, low 15, false 6, maybe-false 0
- findings:
  - `[medium]` `[defer]` (blind) `php-fixtures` is not a required check, so a red run can still merge — making it required edits `.github/rulesets/main.json` and the XT-33 pin, a Maintainer ruleset change like Epic 1 retro item 2; the ci.yml header now says the job is advisory (patched comment).
  - `[medium]` `[patch]` (blind) fixture locks can drift from the Oracle locks — added a PHP-free test comparing the phpunit/pest versions of both fixture locks with the Oracle locks.
  - `[medium]` `[patch]` (blind) the skip check misses pcntl and PHP < 8.4 — added both preconditions with named reasons.
  - `[medium]` `[patch]` (blind) `vendor/` existing is too weak for a partial install — the check is now `vendor/autoload.php` plus `vendor/bin/<runner>`.
  - `[low]` `[reject]` (blind) the skip/require logic has no automated test — checked by hand (php hidden from PATH: 6 skip; with require: fail with the reason), and XT-33 pins the require env in the CI command; a recursive bun-test-in-bun-test adds complexity for an unlikely regression.
  - `[low]` `[patch]` (blind) XT-70 repeats XT-69 — XT-70 now runs a files list naming only `tests/ForkTest.php`.
  - `[false]` `[reject]` (blind) the lister fix covers Pest mode only — PHPUnit mode never hands the path to a process with another cwd (`realpath` at lister.php:87 runs before `chdir`), so a relative path there was never broken; the absolute-path comment was expanded (patched comment).
  - `[low]` `[reject]` (blind) the spec contradicts itself about lister.php being read-only — the fix edits this build's spec.
  - `[low]` `[reject]` (blind) the composer.lock files are missing from the reviewed diff — they are generated; the verification-gap layer checked their phpunit/pest versions against the Oracle locks with jq, and the new drift test pins them.
  - `[low]` `[reject]` (blind) no `config.platform.php` in the fixture composer.json — only a later `composer update` would re-resolve; the exact-version pins plus the drift test cover the versions that matter, and adding it means regenerating both locks.
  - `[low]` `[patch]` (blind) `warned`/`cachedVersion` are declared after `phpTest` — moved above it.
  - `[low]` `[patch]` (blind) XT-73 masks unmapped recorder ids — it now asserts every id is listed, with no fallback.
  - `[medium]` `[patch]` (edge) no pcntl means a mismatch, not a skip — same fix as the pcntl precondition above.
  - `[low]` `[patch]` (edge) PHP < 8.4 means a fatal, not a skip — same fix as the version precondition above.
  - `[low]` `[patch]` (edge) a partial install means opaque failures — same fix as the vendor-file check above.
  - `[low]` `[patch]` (edge) the XT-44 docker scan walks into the installed fixture vendor/ — the scan now skips `vendor` directories.
  - `[low]` `[reject]` (edge) tsconfig `conformance/**/*.ts` could typecheck vendor .ts — maybe someday; typecheck passes with the fixtures installed, and the PHP packages ship no .ts.
  - `[low]` `[reject]` (edge) a symlinked relative suite dir gets its as-given spelling replaced less — relative paths failed outright before this change and the tools always pass absolute paths.
  - `[low]` `[reject]` (edge) XT-44's `isFile()` filter skips nested or symlinked test files — `conformance/tests/xaravel/` holds no nested test files; the only subdirectory is the PHP fixtures.
  - `[medium]` `[patch]` (verification-gap) fixture lock versions are unchecked against the Oracle locks — same fix as the drift test above.
  - `[medium]` `[defer]` (verification-gap) the require-mode gate runs only in a non-required job — same as the first row; deferred to the Maintainer.
  - `[low]` `[reject]` (verification-gap, other) XT-72 does not cover the `{root}` replacement for relative input — no regression, because relative input failed before.
  - `[false]` `[reject]` (intent a) real execution needs an installed vendor/ — the intent explicitly allows a skip when vendor is absent and forbids network at test time.
  - `[low]` `[reject]` (intent b) the gate is advisory — duplicate of the deferred required-check row.
  - `[false]` `[reject]` (intent c) the fork test does not model counts recorded before the fork — the mutation check (guard removed) failed XT-69 and XT-70, as both the implementer and the verification-gap layer ran.
  - `[false]` `[reject]` (intent d) pcntl is unchecked — duplicate claim, fixed above; as a divergence report it is already covered.
  - `[false]` `[reject]` (intent e) the recorder runs only through runner.php — that is the surface the intent names ("runs through").
  - `[false]` `[reject]` (intent f) Protected Paths without approval — the MAINT ruling and its 2026-10-17 amendments approve orchestrator changes to Protected Paths.

## Design Notes

These tests run the real PHP scripts against committed fixture sources, but their `vendor/` is installed by a script and not committed. That keeps third-party code out of the repo and keeps the test offline. `bun test` alone skips with a reason when `vendor/` is absent. The CI job is what turns this into a gate, through `XARAVEL_PHP_FIXTURES=require`. It is a separate job because ubuntu-latest's PHP 8.3 cannot run PHPUnit 13.

Pest does not need its Composer plugin here: with `--no-plugins --no-scripts` (no `vendor/pest-plugins.json`), `pest --list-tests`, `--list-tests-xml` and the baseline run all work on the fixture, so both fixtures install the same way.

A real run exposed one lister bug, now fixed. In Pest mode, `lister.php` passed `<suite-dir>` exactly as given to the inner Pest process in `XARAVEL_INVENTORY_PEST_ROOT`. That process runs in the suite directory, so a relative `<suite-dir>` resolved against the wrong directory and the listing failed with `<suite-dir> is not a directory`. `pestRun` now passes the real path when the given one is relative. An absolute path is passed as before, so the `{root}` replacement of an as-given absolute path is unchanged. The tools always pass absolute paths, so the committed Inventory is unaffected. XT-conformance-177 (first numbered XT-conformance-72) checks that a relative path lists the same lines.

Besides the two skip causes above, a PHP older than 8.4 (`php <ver> is older than 8.4`) and, for the PHPUnit fixture, a PHP without pcntl (`php lacks the pcntl extension`) also skip with the reason, or fail under `XARAVEL_PHP_FIXTURES=require`. `vendor/` counts as installed only when `vendor/autoload.php` and `vendor/bin/<runner>` exist. XT-conformance-179 (first numbered XT-conformance-74) needs no PHP and always runs: it checks that the fixture locks' PHPUnit and Pest versions equal the Oracle locks', so a pin bump that moves them fails.

Two existing tests changed shape, with no assertion weakened. XT-conformance-33 lists the new `php-fixtures` job among ci.yml's jobs and pins its steps, permissions, timeout and the install script. XT-conformance-44 read every entry of `conformance/tests/xaravel/` as a file, and now reads only its files, so the `php-fixtures/` directory does not fail it with `EISDIR`.

## Verification

**Commands:**
- `bun run php-fixtures:install` -- expected: both fixtures install.
- `XARAVEL_PHP_FIXTURES=require bun test conformance/tests/xaravel/php-scripts.test.ts` -- expected: all pass, none skipped.
- `bun run test`, `bun run typecheck`, `bun run lint`, `bun tools/workflow-permissions/workflow-permissions.ts check` -- expected: all pass with the fixtures installed. Also run `bun run test` without them, and expect the new tests to skip.

## Auto Run Result

Status: done

**Summary.** `bun test` now runs `tools/inventory/lister.php`, `tools/baseline/runner.php` and `tools/baseline/recorder.php` with real PHP. Two committed fixture projects are pinned to the Oracle locks' PHPUnit and Pest versions. Their `vendor/` is gitignored and installed by `bun run php-fixtures:install`, so the tests never touch the network. A precondition that is not met (no `php`, PHP older than 8.4, no pcntl, or an incomplete `vendor/`) skips the test and names the cause. With `XARAVEL_PHP_FIXTURES=require` it fails instead. The new advisory CI job `php-fixtures` runs the tests that way.

**Files changed**
- `conformance/tests/xaravel/php-fixtures/{phpunit,pest}/**` -- the fixture projects: composer.json, composer.lock, phpunit.xml.dist and their tests.
- `conformance/tests/xaravel/php-scripts.test.ts` -- XT-conformance-173..179, first numbered XT-conformance-68..74 and renamed in Story 3.1 because `stories/3.1.md`..`3.3.md` allocate 68..74:
  - The lister output and the recorder output are checked for exact values against real PHP.
  - Fork-guard isolation.
  - A files-list run.
  - A lock-drift check that needs no PHP.
- `tools/inventory/lister.php` -- fixes Pest mode for a relative `<suite-dir>`, a bug the real run exposed.
- `.github/workflows/ci.yml` -- the advisory `php-fixtures` job, which uses setup-php 2.40.0 pinned to a full SHA.
- `package.json` -- the `php-fixtures:install` script.
- `.gitignore` -- ignores the fixture `vendor/` dirs.
- `conformance/tests/xaravel/repository-policy.test.ts` -- XT-33 pins the new job and the new script.
- `conformance/tests/xaravel/oracle.test.ts` -- XT-44 now reads only files, and its docker scan skips `vendor/`.

**Review.** 28 findings: 7 medium, 15 low, 6 false.
- Patched: 3 medium entries (lock drift, the pcntl and version preconditions, the incomplete-vendor check) and 4 low entries (declaration order, XT-73 masking, XT-70 isolation, the XT-44 vendor scan), plus two comment clarifications.
- Deferred: 1 item, the required-check gate, which needs the Maintainer.
- Rejected: every other finding, with its reason, in the Review Triage Log.

**Follow-up review recommended: true.** Three medium entries were patched on a first pass. The one specific risk left unverified is that `ci / php-fixtures` has not run yet. It depends on setup-php's PHP 8.5 including pcntl, and on `composer install --no-plugins --no-scripts` working on the runner. The PR's CI run settles both.

**Verification**
- With PHP 8.5.11 and pcntl:
  - `bun run php-fixtures:install`: OK.
  - `XARAVEL_PHP_FIXTURES=require bun test conformance/tests/xaravel/php-scripts.test.ts`: 7 pass, 0 skip.
  - `bun run test`: 76 pass, 0 fail.
  - typecheck, lint, workflow-permissions, scaffold:check and graph:check: all OK.
- With `php` hidden from PATH:
  - The PHP tests skip, with the reason `php not on PATH`.
  - Under `require` they fail, with the same reason.
- Mutation check: with the recorder's fork guard removed, XT-69 and XT-70 fail. The file was restored.

**Residual risks**
- The CI job is advisory until the Maintainer adds it to the required checks (deferred).
- The fixture locks resolve transitive packages on their own. Only the phpunit/phpunit and pestphp/pest versions are pinned to the Oracle locks.
