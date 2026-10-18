---
title: 'Retro 3 item 3: run the real-PHP Oracle tests in CI in require mode'
type: 'chore'
created: '2026-10-18'
status: 'done'
baseline_revision: '3c2bba8f6758c206f8838e07f1289c88973b2655'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      CI cannot request PHP 8.5.11 exactly: setup-php takes only major.minor, so a newer 8.5 patch on the runner turns php-fixtures red (fail closed) until PHP_VERSION moves.
    evidence: |-
      setup-php README at eb7c497 documents php-version as '8.5', lowest, highest, nightly, master or pre-installed; no patch form. CI run 39120411357 installed 8.5.11 today. oracle-fixtures/oracle-story phpUnmet compare against PHP_VERSION 8.5.11 (tools/oracle/oracle.ts:58). A durable fix runs these tests in the Oracle image or uses another PHP installer.
    location: >-
      .github/workflows/ci.yml php-fixtures setup-php step
    severity: medium
  - summary: >-
      php-fixtures is advisory, so a red real-PHP Oracle run does not block a merge.
    evidence: |-
      .github/rulesets/main.json requires only audit, ownership and protected-paths; Maintainer action item epic-3-retro-item-8-fixture-verify-blocks-merge (finding S2) owns the required-checks question.
    location: >-
      .github/rulesets/main.json
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `evaluate.php` never runs for real in CI. The real-PHP blocks of `oracle-fixtures.test.ts`, `oracle-story.test.ts` and `oracle-extract.test.ts` skip unless PHP 8.5.11 with `pcntl` and a locked local framework install at `/tmp/xaravel-inv/framework` are present, and the `php-fixtures` job runs only `php-scripts.test.ts` and `api-surface.test.ts` in require mode (Epic 3 retrospective, finding S4; action item `epic-3-retro-item-3-real-php-oracle-tests-in-ci`).

**Approach:** In `.github/workflows/ci.yml` `php-fixtures`, sync the Upstream snapshot, build the locked framework install at `/tmp/xaravel-inv/framework` the way `docs/ops/inventory.md` documents (copy the snapshot, copy `conformance/oracle/locks/framework/composer.lock`, `COMPOSER_ROOT_VERSION=<Pin version> composer install`), deriving the version from `conformance/baseline-pin`, and add the three Oracle test files to the require-mode `bun test` step. Pin the new shape in XT-conformance-33 and keep the workflow header accurate.

## Boundaries & Constraints

**Always:** Require mode stays fail-closed: a wrong PHP patch, missing `pcntl` or missing install fails the job. The Pin version is read from `conformance/baseline-pin`, never written into the workflow. No new token, secret, `if:` or `continue-on-error`. Existing assertions stay; XT-conformance-33 changes only to expect the new steps.

**Never:** Change the Oracle tests' gating, `tools/oracle/**`, `packages/**` or `conformance/expectations/**`. Do not touch `conformance/protected-paths`, `tools/protected-paths/` or `.github/workflows/protected-paths.yml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | runner PHP 8.5.11 + pcntl, install built | the real-PHP Oracle blocks run and pass | none |
| PHP patch drift | setup-php installs 8.5.12 | require-mode tests fail `php 8.5.12 is not 8.5.11` | fail closed |
| Install fails | composer or snapshot sync fails | step exits non-zero, job red | fail closed |

</intent-contract>

## Code Map

- `.github/workflows/ci.yml:22-31` -- header paragraph on `php-fixtures`; extend it.
- `.github/workflows/ci.yml:124-146` -- `php-fixtures` job: add `bun run upstream:sync`, the install step, and the three test files; `timeout-minutes` 15 → 20 for the framework composer install.
- `conformance/tests/xaravel/repository-policy.test.ts:794-814` -- XT-conformance-33 pins `php-fixtures` timeout and `run` list.
- `conformance/tests/xaravel/oracle-fixtures.test.ts:45,328-356`, `oracle-story.test.ts:31,357-385`, `oracle-extract.test.ts:46-66` -- gating, read-only: `/tmp/xaravel-inv/framework/vendor/autoload.php`, `PHP_VERSION` 8.5.11 (`tools/oracle/oracle.ts:58`), pcntl.
- `docs/ops/inventory.md:138` -- the documented local-install recipe the CI step follows.
- `conformance/baseline-pin:15` -- `laravel/framework v13.37.0 …`, source of the version.

## Tasks & Acceptance

**Execution:**
- `.github/workflows/ci.yml` -- add the snapshot sync and locked install steps, the three test files, raise the timeout, update the header -- closes S4.
- `conformance/tests/xaravel/repository-policy.test.ts` -- XT-conformance-33 expects the new run list and timeout, and that the install reads the version from `conformance/baseline-pin`.

**Acceptance Criteria:**
- Given the updated workflow, when XT-conformance-33 runs, then it passes and pins that `php-fixtures` runs the three Oracle test files under `XARAVEL_PHP_FIXTURES=require`.
- Given this PR, when CI's `php-fixtures` job runs, then it is green with the real-PHP Oracle blocks executed (not skipped).

## Spec Change Log

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 19 findings — high 0, medium 4, low 6, false 9, maybe-false 0
- findings:
  - (edge) `[medium]` `[defer]` setup-php '8.5' floats the patch; Oracle blocks need exactly 8.5.11 — setup-php has no patch-version input (README at eb7c497); deferred with the durable fixes named; header now states it.
  - (edge) `[false]` `[reject]` The pin-line lookup fails on a tab separator — `conformance/baseline-pin` uses single spaces, and the new awk run (patch below) checks the workflow's own parse.
  - (edge) `[low]` `[reject]` The negative version check misses a `v13.37.0` or matches an unrelated substring — no such token exists in the script; hard-coding is unlikely and the added awk check pins behaviour.
  - (edge) `[medium]` `[defer]` AC2 green holds only while 8.5.11 is the newest patch — same root as the first row; deferred.
  - (intent) `[medium]` `[defer]` Exact PHP is enforced, not provided — same root as the first row; deferred.
  - (intent) `[false]` `[reject]` The tests check only workflow text, not the runner — this PR's own `php-fixtures` run is the runtime evidence; the orchestrator waits for it before merging.
  - (intent) `[false]` `[reject]` Local verification not evidenced — the require-mode run (29 pass), a scratch install with the final flags and the full suite ran; recorded below.
  - (intent) `[medium]` `[defer]` The job stays advisory — pre-existing, Maintainer item epic-3-retro-item-8; deferred.
  - (intent) `[low]` `[patch]` The version check does not show the awk extracts the right value — patched: `PIN_VERSION_AWK` constant builds the step and XT-conformance-33 runs it against `conformance/baseline-pin`, expecting the pinned version.
  - (intent) `[false]` `[reject]` Scope grew (sync, timeout, header) — each follows from providing the install; no harm named.
  - (verification-gap) no gaps; its other finding is the PHP-patch row above (deferred).
  - (blind) `[medium]` `[defer]` CI never installs 8.5.11 exactly — same root as the first row; a `php -v` step adds nothing, the test failure prints the version.
  - (blind) `[low]` `[patch]` Awk extraction untested, `test -n` weak — same patch as the intent row; a stale lock surfaces in composer install, not later (`oracle:check` needs Docker).
  - (blind) `[medium]` `[defer]` Advisory job — same as the intent row; deferred.
  - (blind) `[low]` `[patch]` Header credits oracle-extract.test.ts with the 8.5.11/pcntl/install gate — patched: header attributes each gate to its file and notes the major.minor limit.
  - (blind) `[false]` `[reject]` Nothing checks for zero skips — in require mode `phpTest` registers a throwing test instead of `test.skip` in all three files; no skip path is reachable.
  - (blind) `[low]` `[reject]` No Composer cache, timeout is a guess — the scratch install took about a minute locally; caching adds a step for no observed failure.
  - (blind) `[false]` `[reject]` Protected Paths edited with no approval — MAINT-2026-10-16 and its 2026-10-17 amendments approve orchestrator PRs to Protected Paths.
  - (blind) `[false]` `[reject]` Code Map stale, docs silent, `upstream:check` skipped — Code Map edits are spec edits; `upstream:sync` verifies every tree hash as it fetches (ci.yml header), so `upstream:check` adds no gate here.

## Verification

**Commands:**
- `XARAVEL_PHP_FIXTURES=require bun test conformance/tests/xaravel/oracle-fixtures.test.ts conformance/tests/xaravel/oracle-story.test.ts conformance/tests/xaravel/oracle-extract.test.ts` -- expected: all pass, none skipped.
- The install step's script run locally into a scratch directory -- expected: `vendor/autoload.php` exists.
- `bun test`, `bun run typecheck`, `bun run lint`, `bun run workflows:check` -- expected: clean.

## Auto Run Result

Status: done

**Summary:** The `php-fixtures` CI job now syncs the Upstream snapshot, builds the locked framework install at `/tmp/xaravel-inv/framework` (snapshot + Oracle lock + `COMPOSER_ROOT_VERSION` read from `conformance/baseline-pin`, `composer install --no-plugins --no-scripts`), and runs `oracle-fixtures.test.ts`, `oracle-story.test.ts` and `oracle-extract.test.ts` under `XARAVEL_PHP_FIXTURES=require`, so `evaluate.php` executes in CI. Closes retro finding S4.

**Files changed:**
- `.github/workflows/ci.yml` -- two new `php-fixtures` steps, three test files added, timeout 15 → 20, header.
- `conformance/tests/xaravel/repository-policy.test.ts` -- XT-conformance-33 pins the new steps and runs the install's awk program against the Pin.

**Review:** 19 findings; 2 patched (low: awk behaviour test, header accuracy), 2 entries deferred (exact PHP patch, advisory job), the rest rejected with reasons in the triage log. Follow-up review: false (no high or medium patched).

**Verification:** `XARAVEL_PHP_FIXTURES=require bun test` on the three Oracle files: 29 pass, none skipped, against both the existing install and a scratch install built with the final command. `bun test` 128 pass; typecheck, lint, `workflows:check` clean.

**Residual risk:** setup-php cannot pin 8.5.11; when the runner gets a newer 8.5 patch, `php-fixtures` goes red until `PHP_VERSION` moves (deferred).
