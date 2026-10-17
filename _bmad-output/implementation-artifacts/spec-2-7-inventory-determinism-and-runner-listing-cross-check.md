---
title: 'Story 2.7: Inventory determinism and runner-listing cross-check'
type: 'feature'
created: '2026-10-17'
status: 'done'
baseline_revision: '492c4caae041cbbb85aee12bfdc4e59cb7756164'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/stories/2.7.md'
  - '{project-root}/docs/ops/inventory.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Nothing proves that the committed Inventory is what the lister produces at the Pin, or that its Test ID set is what PHPUnit and Pest themselves list. A lister bug, a stale regeneration or a hand edit could silently grow or shrink the conformance denominator (FR-1).

**Approach:** Add a `--check` mode to `bun run inventory`. It regenerates in memory and fails on any byte difference from the committed files, and writes nothing. Add a cross-check tool, `tools/inventory/cross-check.ts`, that runs each suite's own `--list-tests` inside the Oracle image and compares that set of IDs with the Inventory's, listing the missing and extra IDs. A new workflow, `.github/workflows/inventory.yml`, runs both every night, on `workflow_dispatch`, and on PRs that touch their inputs. AC 3 already holds through `/conformance/` in `conformance/protected-paths`; a test pins it.

## Boundaries & Constraints

**Always:**
- **`--check`.** `bun tools/inventory/inventory.ts generate --check` (so `bun run inventory --check`) takes the same suite and mode flags as `generate`. It builds every selected suite's files in memory exactly as `generate` does, carry-over included, then compares them byte for byte with `conformance/inventory/`. Problems, one line each on stderr:
  - `inventory drift: <file> differs from the regenerated Inventory (first difference at line <n>)`;
  - `inventory drift: <file> is missing`;
  - `inventory drift: <file> is not generated`, for a framework Component file that the framework generation would delete.
  It never writes or deletes a file. It exits 0 with `Inventory check OK: <total> tests in <n> files are byte-identical.`, and 1 with `Inventory check failed: <k> file(s) differ.` `oracle-nondeterminism.jsonl` is never compared.
- **Cross-check.** `bun tools/inventory/cross-check.ts [--suite <framework|ai|mcp|boost|all>] [--root <dir>] [--image <ref> | --local <dir> [--php <bin>]]`, with the script `inventory:cross-check`. The suite and mode rules are `generate`'s: image mode defaults to `all`, and `--local` takes one suite, defaulting to `framework`.
  - **Runner listing.** It runs `php -d memory_limit=-1 vendor/bin/phpunit --list-tests --colors=never` (framework) or `vendor/bin/pest` with the same flags (Pest suites) in the suite directory. In image mode this goes through `runInImage` (no network) as `sh -c 'cd "$0" && exec php -d memory_limit=-1 "vendor/bin/$1" --list-tests --colors=never' /oracle/upstream/<suite> <phpunit|pest>`. In local mode it runs `<php>` with `cwd` set to the install, after the same snapshot-copy check that `generate --local` makes.
  - A non-zero exit is a failure: `<runner> --list-tests failed (exit <n>): <stderr>`.
  - **Parsing.** Accepted header lines: PHPUnit's `PHPUnit <version> by Sebastian Bergmann and contributors.`, and `Available test:` or `Available tests:`, which Pest prints as `INFO  Available tests:` after leading spaces. Blank lines are allowed. Every other line must start with ` - `, and any other line fails as `unexpected <runner> output: <line>`. In Pest mode, one trailing `.` on the last entry is stripped; that is Pest's INFO renderer, since a method name cannot contain `.` and a dataset entry ends with `"`.
  - **Entries.** Each entry is `<class>::<method>`, optionally followed by `#<digits>` or `"<name>"`. It becomes the PHPUnit ID `<class>::<method>`, `…#<digits>` or `…#<name>`. Any other shape fails as `unparseable <runner> entry: <line>`, and a repeated ID fails as `duplicate <runner> entry: <id>`.
  - **Mapping.** For the framework, the PHPUnit ID is the Inventory ID. For a Pest suite, the tool runs the lister through `listSuite` and maps each runner ID through the lister's raw `id` with `pestTestId`. This is the mapping `tools/baseline` uses. A runner ID that the lister does not list is extra, reported under its runner ID.
  - **Comparison.** For each suite: `missing from <runner>'s listing: <inventory id>` for an Inventory ID that no runner entry maps to, and `not in the Inventory: <id>` for a runner entry whose Inventory ID is not in the Inventory, or that has none. Both lists are sorted by UTF-16 code units. On success it prints `<suite>: <n> runner tests match <n> Inventory entries`. It exits 0 when every suite matches, 1 with `Inventory cross-check failed: <m> missing, <e> extra` (or on any failure above), and 2 on a usage error. Every suite is checked before the summary.
- **Workflow** `.github/workflows/inventory.yml`:
  - Triggers: `schedule` (one nightly cron), `workflow_dispatch`, and `pull_request` to `main` on paths `tools/inventory/**`, `tools/oracle/**`, `tools/upstream/**`, `tools/component-map/**`, `conformance/inventory/**`, `conformance/oracle/**`, `conformance/baseline-pin`, `conformance/component-map` and the workflow file itself.
  - Top-level `permissions: contents: read`, with no job-level write scope. Actions are pinned to the same commit SHAs as `baseline.yml`.
  - One job. It checks out without persisted credentials, sets up Bun from `.bun-version`, then runs `upstream:sync`, `upstream:check` and `oracle:check`, and `oracle:build "xaravel-oracle:<tag>"` with `GITHUB_TOKEN`, as `baseline.yml` does. Then it runs `bun run inventory --check` and `bun run inventory:cross-check`, both in image mode for all suites.
- Tests follow the existing convention: a `// XT-conformance-<n>` line, then `test("XT-conformance-<n>: … (FR-1)")`, using `bun:test` like the other `conformance/tests/xaravel` files, with no PHP, Docker or vendor files. The fake PHP and stand-in image runners are the pattern from `inventory.test.ts`.

**Never:**
- Change the Inventory data, the ID forms, `hash`, the lister's output or behaviour, `baseline.yml`, `tools/baseline/`, the snapshot, the component map, `conformance/protected-paths`, `tools/protected-paths/`, `tools/ownership/` or `ownership.yml`.
- Weaken any existing assertion. `generate` without `--check` must behave byte-for-byte as before.
- Give a workflow a write scope, or fetch from inside the inventory tools.
- Write `conformance/variants` or Expectations, or build the Pin bump (Story 2.8).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Check, unchanged | committed files equal regeneration | `Inventory check OK: …`; no file touched | exit 0 |
| Check, edited line | one `hash` changed in `bus.jsonl` | `inventory drift: conformance/inventory/bus.jsonl differs … (first difference at line <n>)`; file left as edited | exit 1 |
| Check, missing file | `support.jsonl` deleted | `… support.jsonl is missing` | exit 1 |
| Check, stray file | extra `ghost.jsonl` (framework) | `… ghost.jsonl is not generated`; not deleted | exit 1 |
| Cross-check, match | runner lists exactly the Inventory IDs | `framework: 3 runner tests match 3 Inventory entries` | exit 0 |
| Named / int datasets | ` - C::m"uses string"`, ` - C::m#0` | IDs `C::m#uses string`, `C::m#0` | — |
| Pest trailing dot | last line ` - P\T::__pest_evaluable_x.` | runner ID `P\T::__pest_evaluable_x` | — |
| Missing / extra | runner lacks A, adds B | `missing from phpunit's listing: A`, `not in the Inventory: B` | exit 1 |
| Pest unmapped | runner ID the lister does not list | `not in the Inventory: <runner id>` | exit 1 |
| Noise | `There was 1 PHPUnit test runner warning` | `unexpected phpunit output: …` | exit 1 |
| Runner fails | non-zero exit | `phpunit --list-tests failed (exit 2): …` | exit 1 |
| Bad usage | `--image` with `--local`, unknown suite, `--local` with `all` | usage message | exit 2 |

</intent-contract>

## Code Map

- `tools/inventory/inventory.ts`:
  - `generate` (:679) builds `generated` (:701-707), then writes and removes files (:709-731). Split it so that `--check` compares the same in-memory output instead of writing. Framework stray-file detection mirrors the removal loop at :722-730 (skip `NONDETERMINISM_FILE` and `FOREIGN_COMPONENTS`).
  - `GenerateOptions` (:128) gains `check?: boolean`, and `parseOptions` (:742) accepts a valueless `--check`. `main` (:787) prints the check summary, and `USAGE` (:740) and the header comment (:1-39) are updated.
  - Reuse in cross-check: `listSuite` (:638, which runs the lister in image or local mode and validates sources), `pestTestId` (:269), `readSuiteInventory` (:604), `oracleImage` (:577), `compareUnits`, `SUITES`/`PEST_SUITES`, `ImageRunner` (:126) and `PHP_VERSION`. `checkLocalCopy` (:547) is private; export it for the local-mode check.
- `tools/oracle/oracle.ts:595` `runInImage(image, mounts, command)`: `--network none`, with no workdir option, hence the `sh -c 'cd "$0" …'` form. `IMAGE_UPSTREAM_DIR` is `/oracle/upstream`. The image's `USER` is 1001 and its `WORKDIR` is `/oracle/upstream` (`conformance/oracle/Dockerfile:114-115`).
- PHPUnit 13.4.3's text listing comes from `vendor/phpunit/phpunit/src/TextUI/Command/Commands/ListTestsAsTextCommand.php`: `' - ' . Class::class . '::' . str_replace(' with data set ', '', nameWithDataSet())`. That gives `m#0` for an int key and `m"name"` for a string key. Pest 4 prints the same entries under `   INFO  Available tests:` and appends `.` to the last line.
- Prototype evidence (local PHP 8.5.11, `/tmp/xaravel-inv*`): with the parsing above, the runner sets for mcp (1284), ai (3381) and boost (1138) equal the lister's raw ID sets exactly. The framework's local listing (16216) differs from the committed Inventory (16267) only by the phpredis-dependent IDs, because the host has no `redis` extension. That is why the cross-check runs in the image.
- `.github/workflows/baseline.yml`: copy its checkout, setup-bun, sync, check and `oracle:build` steps and its SHA pins verbatim.
- `tools/workflow-permissions/workflow-permissions.ts`: the new workflow must pass `bun run workflows:check`.
- `tools/protected-paths/protected-paths.ts`: `parseList`, `activePhases`, `isProtected` (:198), `evaluatePr` (:253), `checkMirror` (:224), `LIST_PATH` and `CODEOWNERS_PATH`, for XT-conformance-61.
- Tests: `conformance/tests/xaravel/inventory.test.ts` (fixture `withFixture`, `FAKE` php :104, `RAWS`) and `pest-inventory.test.ts` are the models. The IDs are XT-conformance-59, 60 and 61 (`stories/2.7.md`).

## Tasks & Acceptance

**Execution:**
- `tools/inventory/inventory.ts` -- add `--check` (an in-memory build, a byte comparison, drift lines, no writes) and export `checkLocalCopy` -- AC 1.
- `tools/inventory/cross-check.ts` (new) -- export the pure `parseRunnerListing(text, runner)` and `compareListing(suite, runnerIds, inventoryIds, map?)`, plus `crossCheck(root, options)` (with an `ImageRunner` injectable as in `GenerateOptions`) and the CLI -- AC 2.
- `package.json` -- add the script `"inventory:cross-check": "bun tools/inventory/cross-check.ts"` -- the workflow entry point.
- `.github/workflows/inventory.yml` (new) -- as in the constraints, with a header comment in `baseline.yml`'s style -- AC 1 and 2 in CI.
- `conformance/tests/xaravel/inventory-checks.test.ts` (new) -- XT-conformance-59: `--check` on a fixture (OK; an edited line, a missing file and a stray file each fail and are left untouched; `generate` output unchanged), and the workflow's shape. XT-conformance-60: every parsing and comparison row of the matrix, and the CLI's local mode with a fake PHP for the framework and a Pest suite, with exit codes 0, 1 and 2. XT-conformance-61: every committed `conformance/inventory/*` file, plus a new file there, is Protected under the real list and phases; `evaluatePr` fails a PR that edits one, without the Maintainer's head-commit approval, naming it, and passes with that approval; the real CODEOWNERS mirrors the list -- every matrix row.
- `docs/ops/inventory.md` -- a "Checks" section: `--check`, the cross-check, the nightly workflow and the failure messages, plus a pointer in "Regenerating" -- ops doc.
- `stories/2.7.md` -- set `status: done` at the end.

**Acceptance Criteria:**
- Given the committed Inventory, when `inventory.yml` regenerates it in the Oracle image from the same Pin (`bun run inventory --check`), then the output is byte-identical and the job passes. Any difference fails the job and names the file (XT-conformance-59; the PR's `inventory` run is the live evidence).
- Given `phpunit --list-tests` and `pest --list-tests` inside the Oracle, when `bun run inventory:cross-check` runs, then each suite's set of Test IDs equals the Inventory's set, and missing or extra IDs are listed (XT-conformance-60; the PR's `inventory` run shows all four suites matching).
- Given a PR that edits `conformance/inventory/`, when checks run, then `protected-paths` fails unless the Maintainer approved the head commit, because the Inventory is Protected (XT-conformance-61).

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 24 findings — high 0, medium 3, low 12, false 9, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) No test runs the cross-check CLI in image mode without `--suite`; the workflow relies on the `all` default — added a no-flag CLI test that asserts ai and boost are checked.
  - `[low]` `[patch]` (verification-gap, other) `crossCheck()` defaults to `framework` while the CLI and docs say `all` — the default is now `all` unless `--local`.
  - `[low]` `[patch]` (blind) Two runner IDs mapping to one Inventory ID pass silently — a repeated mapped ID is now extra; the lister's duplicate raw IDs throw.
  - `[false]` `[reject]` (blind) Duplicate Inventory IDs are hidden by the Set — `parseInventory` rejects unsorted or equal IDs within a file (inventory.ts:531), and the same ID in two framework files makes `--check` fail in the same job.
  - `[medium]` `[patch]` (blind) The workflow's `pull_request.paths` omits `package.json`, `.bun-version`, `bun.lock` and `tools/scaffold/packages.jsonl` — added, with the test and docs.
  - `[false]` `[reject]` (blind) The Story is marked done before the live evidence exists — the merge waits on the PR's green `inventory` run, which is the gate (section 4 of the orchestrator rules).
  - `[false]` `[reject]` (blind) Pest may wrap lines at 80 columns without a TTY — `COLUMNS=80 pest --list-tests` with piped stdout printed 193-character lines unwrapped and nothing but entries and the header.
  - `[false]` `[reject]` (blind) Multi-line dataset names break the parser — no Inventory ID at the Pin contains a newline, and a future one fails closed (`unexpected … output`), which is the specified behaviour.
  - `[low]` `[reject]` (blind) `written` is filled in check mode — no caller other than `main` reads it; it is cosmetic.
  - `[low]` `[reject]` (blind) A lister failure under `--check` prints `Inventory generate failed` — the message still names the lister failure, and nobody meets this in everyday use; changing it adds a branch.
  - `[low]` `[patch]` (blind) The per-suite mismatch header and the `<suite>: ` prefix are undocumented — documented in docs/ops/inventory.md.
  - `[low]` `[patch]` (blind) Same root cause as the verification-gap default finding — fixed there.
  - `[false]` `[reject]` (blind) Image-mode runner failures lose their exit code for other `runInImage` forms — the cross-check only calls `runInImage`, whose only failure form is `… failed (exit n): …` (oracle.ts:603); the `:652` form is another function.
  - `[low]` `[reject]` (blind) `--check` is not tested with `--suite all` or a Pest stray file — the drift logic is shared per file and tested; extra tests add no new branch.
  - `[low]` `[reject]` (blind) The workflow has no `concurrency` group — this is a cost preference, not a defect; baseline.yml has none either.
  - `[low]` `[reject]` (blind) XT-conformance-61 uses `toBeGreaterThan(4)` and only one edited file — every committed file is asserted Protected individually, and a new file is covered; widening adds no new behaviour.
  - `[low]` `[patch]` (edge) Same root cause as the collision finding — fixed there.
  - `[low]` `[patch]` (edge) Duplicate raw lister IDs collapse in the map — grouped with the collision; now throws `duplicate lister id`.
  - `[low]` `[patch]` (edge) Negative integer dataset keys (`#-1`) are unparseable — the regex now allows `-`.
  - `[medium]` `[patch]` (edge) Same root cause as the blind paths finding — fixed there.
  - `[false]` `[reject]` (edge, claim) "match" can print unequal counts — after the collision fix, a clean match implies equal counts.
  - `[false]` `[reject]` (intent) Carry-over lets a tampered `assertions`/`oracle` on an unchanged entry pass `--check` — those fields are checked by `baseline.yml`'s `merge` job, which runs on every PR that touches `conformance/inventory/**`.
  - `[false]` `[reject]` (intent) For Pest the mapping is lister-mediated — the runner's raw IDs are compared exactly against the lister's raw IDs, so the lister cannot drop or add a test unnoticed.
  - `[false]` `[reject]` (intent) Run-twice stability is no longer exercised — `--check` compares a fresh run against a committed earlier run, which is a cross-run comparison, and the PR and nightly runs repeat it.

## Design Notes

- **Why `--list-tests` text and not JUnit.** JUnit needs a full test run, which the baseline already does at a cost of about 20 minutes. The text listing comes from PHPUnit's own command, independent of the lister's `--list-tests-xml` parsing, provider join and filters. That is the code path most able to drift.
- **Why the Pest mapping reuses the lister.** Pest's runner lists only the PHPUnit-level `P\…::__pest_evaluable_…` names. The describe and name structure behind an Inventory ID exists only in Pest's test repository, which the lister reads. The cross-check still compares the runner's own set exactly with the lister's raw IDs, through the extra-or-missing rules, and compares the mapped set with the Inventory.
- **Why a CLI `--check` and not `git diff`.** It can be tested hermetically, it names the file, and it never writes, so a failing nightly leaves no partial state. It keeps carry-over, so it checks the generator's output at the Pin, not the baseline fields, which `baseline.yml`'s `merge` already checks.

## Verification

**Commands:**
- `bun test`, `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `bun run protected-paths:codeowners --check` -- expected: clean.
- `bun tools/inventory/cross-check.ts --suite mcp --local /tmp/xaravel-inv25/mcp` (and ai, boost) -- expected: exit 0, every set matching.
- `bun tools/inventory/cross-check.ts --local /tmp/xaravel-inv/framework` -- expected: exit 1, listing only phpredis-dependent IDs (the host has no `redis`); this shows that missing and extra IDs are reported.
- On the PR: the `inventory` workflow is green (both `--check` and the cross-check pass in the image), and `baseline` stays green.

## Auto Run Result

Status: done

**Summary.** `bun run inventory --check` regenerates the Inventory in memory and fails, naming each file, on any byte difference from the committed files. It writes nothing. `bun run inventory:cross-check` runs `phpunit --list-tests` and `pest --list-tests` in the Oracle image and compares each suite's Test ID set with the Inventory's, listing the missing and extra IDs. The new `inventory` workflow runs both every night, on `workflow_dispatch`, and on PRs that touch their inputs. XT-conformance-61 pins the existing Protected Path coverage of `conformance/inventory/`.

**Files changed**
- `tools/inventory/inventory.ts`: `generate --check` (drift lines and no writes), plus shared exports (`checkLocalCopy`, `parseOptions`, `UsageError`).
- `tools/inventory/cross-check.ts` (new): runner-listing parser, comparison, image and local modes, CLI.
- `.github/workflows/inventory.yml` (new): the nightly, dispatch and PR checks; read-only.
- `package.json`: the `inventory:cross-check` script.
- `conformance/tests/xaravel/inventory-checks.test.ts` (new): XT-conformance-59, 60 and 61.
- `docs/ops/inventory.md`: a new "Checks" section; "Regenerating" now uses `--check`.
- `stories/2.7.md`: status set to `done`.

**Review.** 24 findings: 3 medium, 12 low and 9 false.
- Patched: the cross-check default suite (image mode is now `all`) and its CLI test; Pest mapping collisions and duplicate lister IDs; negative integer dataset keys; the workflow trigger paths (`package.json`, `.bun-version`, `bun.lock`, `tools/scaffold/packages.jsonl`); the docs for the mismatch header and prefixes.
- Nothing deferred.
- Rejected: see the triage log. Each has its refutation or the reason a low finding was not worth fixing.

**Follow-up review:** false. Two medium entries were patched, but each patch is covered by a test that ran and passed, so no specific unverified risk remains in them.

**Verification**
- `bun test`: 63 of 63 pass.
- `typecheck`, `lint`, `workflows:check` and `protected-paths:codeowners --check`: clean.
- Local cross-check:
  - ai (3381), mcp (1284) and boost (1138) match their Inventories, exit 0.
  - The framework exits 1 with 89 missing and 38 extra, all phpredis-dependent, because the host has no `redis` extension. This is as expected, and it shows the reporting works.

**Residual risk.** The live in-image runs (`--check` and the cross-check for all four suites) happen only on the PR's `inventory` workflow, which gates the merge.
