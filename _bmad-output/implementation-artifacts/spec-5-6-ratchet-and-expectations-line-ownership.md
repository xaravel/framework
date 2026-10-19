---
title: 'Story 5.6: Ratchet and Expectations line ownership'
type: 'feature'
created: '2026-10-19'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/AGENTS.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The harness reports differences but nothing turns them into a CI verdict that tells unexpected failures from unexpected passes and knows who owns a Test ID. The ownership check only looks at paths, so a Story PR can rewrite any Expectations line or `portedTest` block in its Component, or demote a `pass`, unseen. Per-Story Oracle request files also go red through no change of their own (Epic 3 retro R5).

**Approach:** Add a `ratchet` tool and a `ratchet` workflow that runs the full harness with grader files pinned to the base branch, and fails on every unexpected failure and on unexpected passes that the run's own Story owns; other unexpected passes are warnings. Extend `tools/ownership` with line-level checks over Expectations lines and `portedTest` blocks, plus the pass-demotion rule. Make Oracle request ownership follow merge order, and let the batch skip requests a merged per-Story file holds.

## Boundaries & Constraints

**Always:**
- Story 5.6 is Maintainer-approved Phase 0 Infrastructure work, so it may edit `tools/`, `conformance/harness/`, `conformance/tests/`, `.github/workflows/`, `stories/5.6.md`, `docs/ops/`, `conformance/README.md` and `package.json`.
- "Open Story" means the effective status (`applySprintStatus`) is not `done`, read from the base tree. A Test ID `X#k` (a dataset row) is owned by a Story whose `test_ids` lists `X#k` or `X`.
- An unexpected failure means every harness difference except `UNEXPECTED-PASS`: `FAIL`, `FLOOR`, `SKIPPED`, `MISSING`, `UNKNOWN`, `ERROR` and the CI `NOT-RUN` of an alpha Variant. Every unexpected failure fails the ratchet on every ref.
- An `UNEXPECTED-PASS` fails the ratchet only when the run is for `story/<id>` and Story `<id>` owns the Test ID. It is a warning when the Test ID is owned by another open Story, when no open Story owns it, and on `main`.
- The line rules diff the PR's head against its merge base (the compare API's `merge_base_commit`), keyed by `(id, variant)` across all changed shards combined, so a line moved between shards is not a change. A removed line counts as changed, and so does a line whose base status was `pass` and whose line was removed.
- Fail closed. Unreadable content, an unparsable Expectations line, an unbalanced ported-test file, or a `portedTest` id that cannot be resolved statically are all violations, never passes.
- Keep every existing message template and exit code in `tools/ownership` and `conformance/harness`. New messages end in `(AD-16)` and print through the existing `report()`.
- Oracle merge order is the first-parent history of `HEAD`: the commit that most recently added each file under `conformance/oracle-requests/` (`git log --first-parent --diff-filter=A`). Older commits come first; within one commit, files sort by `compareUnits`. Files with no add commit (uncommitted, or not a git tree) come after every committed file, by name. A shallow repository throws `oracle request merge order needs full git history (fetch-depth: 0)`.

**Never:**
- No change to `conformance/expectations/**` data, the Expectations format, the Variant vocabulary or Skip Reason rules.
- No weakening of existing assertions. Tests that pin the old R5 behavior (`oracle-story.test.ts`, the batch-rejection and file-name-winner cases in XT-conformance-77/78/79, and the verify cases in XT-74/76) change only where the R5 AC reverses that behavior; mark each such edit with a comment citing "Story 5.6 AC5 (Epic 3 retro R5)".
- No `bot/*` value-level rules: Story 5.8 owns the bot status-only exemption, and bot branches are exempt from the line rules here. No merge-queue Ratchet, reverse-dependency closure or ruleset required-check change: Story 5.7 owns those (its ACs 1, 2 and 4).
- No `JSON.stringify` on framework values. Tools may use it on their own records, as the existing tools do.
- No Node, npm, Jest or other toolchain. No change to `AGENTS.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ratchet clean | No harness differences | `RATCHET ref=<r> failures=0 passes=0 warnings=0`, exit 0 | — |
| Unexpected failure | A `pass` line fails | `UNEXPECTED-FAILURE FAIL <id> [<v>] …` listed; exit 1 | — |
| Own pass | ref `story/11.1`, the pass is owned by 11.1 | `UNEXPECTED-PASS …` listed as a failure; exit 1 | — |
| Other Story's pass | ref `story/11.1`, owned by open 11.2 | `WARNING UNEXPECTED-PASS … (owned by open Story 11.2; fails that Story's next run)`; exit 0 | — |
| Unowned pass on main | ref `main`, no open owner | `WARNING UNEXPECTED-PASS … (owned by no open Story)`; exit 0 | GitHub `::warning::` annotation when `GITHUB_ACTIONS=true` |
| Unowned Expectations line | story/11.1 changes `B [none]`, which is not in its test_ids | `unowned expectation: B [none] changes in <shard>, but Story 11.1's test_ids do not list it (AD-16)` | exit 1 |
| Unowned portedTest | story/11.1 edits the block for `B` | `unowned ported test: B at <file>:<line> changes, but Story 11.1's test_ids do not list it (AD-16)` | exit 1 |
| Dynamic id | `portedTest(makeId(), …)` in a changed file | `unresolved ported test id: <file>:<line> …; failing closed (AD-16)` | exit 1 |
| Pass demoted | `A [none]` goes from `pass` to `fail-known` with no approved ESC listing `A` | `pass demoted: A [none] changes from pass to fail-known in <shard> with no approved Escalation listing it (AD-16)` | exit 1; passes when an approved ESC lists `A` |
| R5 batch | A merged per-Story sha is also in a batch file | verify stays green; `oracle:extract` omits it from the batch | — |
| R5 two Stories | `10.1.jsonl` merged after `3.4.jsonl` and both hold sha S | 3.4 owns S; verify green; `oracle:story` on a new candidate file still rejects S as `also in` | shallow clone → throws |

</intent-contract>

## Code Map

- `conformance/harness/compare.ts:83-89,215-226,231-266` -- `Difference` has no kind. Add `kind: "unexpected-pass" | "unexpected-failure"`: `UNEXPECTED-PASS` → pass, everything else (including `UNKNOWN`) → failure.
- `conformance/harness/harness.ts:171-180,357,402-590` -- `HarnessResult`. Expose `differences: Difference[]` (with kind), including the `ERROR` and CI `NOT-RUN` lines (:357, :547) as `unexpected-failure` entries with `id` `"-"`. The CLI output must not change.
- `tools/ownership/ownership.ts:147,231,255,303,401,418-470,508,525-560` -- `parseManifest`, `readManifests`, `applySprintStatus`, `evaluatePr` and the `pr` command. `OwnershipPrInput` gains `content(path, side: "base" | "head"): string | null` and `mergeBase`/`headSha`. The `pr` command fetches `head.sha` and the merge base (`GET /compare/<base.sha>...<head.sha>`) and reads content with `GitHub.contents(path, ref)`.
- `tools/protected-paths/protected-paths.ts:51,88,122,199-218,374-444` -- `PrFile`, `parseList`, `activePhases`, `isProtected`, and the `GitHub` client (`json`, `paged`, `contents`). Reuse them for the ratchet overlay.
- `tools/escalations/escalations.ts:221,332` -- `parseEscalation`, `parseDecision`, `escalationStatus` (the sha-bound decision). For an ESC that exists only in the PR head, check approval the same way against the head text. Export a small helper rather than copy it.
- `tools/expectations/expectations.ts:68` -- `ExpectationLine`; `tools/pin-bump/pin-bump.ts:365` -- `readExpectations`, `EXPECTATION_KEYS`.
- `tools/expectations/reasons.ts:149,196` -- an example of an Escalation lookup by id.
- `packages/assert/src/declarations/portedTest.ts:69` -- `portedTest(id, options, body)`. Dataset rows are `<id>#<key>`. The harness's `PORTED_GLOB` is at `harness.ts:128`.
- `tools/oracle/story-requests.ts:78,122-138,171,193-231` -- `judgeStoryRequests` (rejects batch shas at :131) and `readStoryRequestFiles` (orders by file name at :203).
- `tools/oracle/story.ts:107-137` -- `runStory`, the candidate check (keep rejecting batch and committed duplicates for a new candidate).
- `tools/oracle/verify.ts:69-90,136` -- `committedRequests` turns every rejection into a violation (:81-82) and lets per-Story overwrite batch (:87).
- `tools/oracle/extract.ts:163,234` -- `buildRequests`/`extract` never read per-Story files.
- `tools/oracle/fixtures.ts:225,323,328,531,586-593` -- the kept set from `story.accepted`.
- `.github/workflows/ownership.yml` -- `pull_request_target`, base checkout; the tool reads head through the API, so no workflow change is needed. `.github/workflows/oracle.yml:243-325` (story job) and `ci.yml` (`fixtures` job runs `oracle:verify-fixtures` at :95) need `fetch-depth: 0` on their checkouts. No workflow sets `fetch-depth` today.
- Tests: `conformance/tests/xaravel/ownership.test.ts` (fixture `GitHub`/`evaluatePr` patterns, XT-22..25,180,181), `oracle-story.test.ts` (XT-77/78/79), `oracle-verify.test.ts` (XT-74/76), `harness.test.ts` (fixture roots run `git init`; `makeRoot`, `env`). Highest XT is XT-conformance-186.
- Docs: `docs/ops/harness.md:11`, `docs/ops/expectations.md:3,45`, `tools/expectations/expectations.ts:54-55`, `tools/expectations/reasons.ts:39`, `.github/workflows/ci.yml:42` all say the Ratchet is "later"; update them. `conformance/README.md` gets a Ratchet section.

## Tasks & Acceptance

**Execution:**
- `conformance/harness/compare.ts`, `conformance/harness/harness.ts` -- add the difference kind and `HarnessResult.differences`, with no change to the printed output -- the ratchet classifies without re-parsing text.
- `tools/ratchet/ratchet.ts` (new) -- `run [--root <dir>] --ref <head-ref>`: run `runHarness(root, {})` in full mode, load open manifests from the root, classify each difference, print `UNEXPECTED-FAILURE <text>` / `UNEXPECTED-PASS <text>` / `WARNING <text> (<why>)` lines, then `RATCHET ref=<r> failures=<n> passes=<n> warnings=<n>`. Exit 1 when failures+passes > 0 or the harness hit a precondition failure; 2 on a usage error. Under `GITHUB_ACTIONS=true`, also print `::warning::` for warnings. Also `overlay --base <dir> --head <dir>`: for every file present in either tree that `isProtected` (the base's list and phases) matches, make head's copy equal base's (copy it, or delete it when base lacks it). The rest of head stays PR code -- a PR cannot change its own grader.
- `package.json` -- add the script `"ratchet": "bun tools/ratchet/ratchet.ts"`.
- `.github/workflows/ratchet.yml` (new) -- job `ratchet`, triggered on `pull_request_target` (main; opened, synchronize, reopened, ready_for_review) and `push` to main, with `permissions: contents: read`. Check out the base sha at `.`, then the PR head at `pr/`, both with `persist-credentials: false`. Pin Bun via `.bun-version`. Run the overlay, `bun install --frozen-lockfile` in `pr/`, and `bun tools/ratchet/ratchet.ts run --root pr --ref <head ref>`, with `CI=true`. On push, `--root .` and `--ref main`. Add services `postgres:18` and `redis:8.10.2`, with the `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD` and `REDIS_HOST`/`REDIS_PORT` env the harness reads (`backends.ts:75-84`). Pass no secrets. The job must pass `bun run workflows:check`.
- `tools/ownership/ownership.ts` -- on `story/*` PRs, add the line rules for changed `conformance/expectations/**/*.jsonl` and `packages/*/tests/ported/**/*.test.ts` files (with previous names). On every branch except `bot/*`, add the pass-demotion rule. Approved Escalations are those whose ESC (on base, or in the PR head) lists the id and whose `decisions/ESC-<id>.md` on base is `approved` with a matching sha. Add the four message templates from the matrix, plus `unreadable content: <path> at <sha> could not be read; failing closed (AD-16)` and `unparsable expectation: <path>:<line> …; failing closed (AD-16)`. Put the `portedTest` scanner in `tools/ownership/ported-blocks.ts` (new). It skips strings, template literals and comments, and resolves ids that are string literals, or templates whose `${X}` are top-level `const X = "<literal>"` in the same file. Its output is `{id, line, text}[]`, or an error for unbalanced input.
- `tools/oracle/merge-order.ts` (new), `story-requests.ts`, `verify.ts`, `extract.ts`, `fixtures.ts`, `story.ts` -- order per-Story files by merge order, not name. In committed state, a sha held by an earlier-merged per-Story file is not a violation in a later file or in the batch: the later holder is shadowed, and the owner's source (component, story) wins in `verify`. `extract` omits from the batch every sha an accepted merged per-Story file holds. The `fixtures` kept set includes the owners' shas. `oracle:story` keeps rejecting a candidate's batch or committed duplicate. Add `fetch-depth: 0` to the checkouts of `ci.yml` `fixtures` and `oracle.yml` jobs that read per-Story files (grep for callers of `readStoryRequestFiles`/`committedRequests`).
- `conformance/tests/xaravel/ratchet.test.ts` (new) -- XT-conformance-115 (AC1) and XT-conformance-118 (AC4), against fixture git roots with a stub Ported Test, plus the overlay case.
- `conformance/tests/xaravel/ownership-lines.test.ts` (new) -- XT-conformance-116 (AC2: Expectations lines, `portedTest` blocks, a moved line, a dataset row, a dynamic id, unreadable content) and XT-conformance-117 (AC3: demotion with no ESC, with an open ESC, with an approved ESC on base, with an approved ESC only in the head, a removed `pass` line, and bot/* exempt).
- `conformance/tests/xaravel/oracle-merge-order.test.ts` (new) -- XT-conformance-187 (AC5): batch overlap, two Stories ordered against file name, a candidate still rejected, and a shallow clone throwing. Also adjust `oracle-story.test.ts` and `oracle-verify.test.ts` only where AC5 reverses their expectation.
- `stories/5.6.md` -- add XT-conformance-187 to `xaravel_test_ids` and an AC-table row for the Oracle request criterion; leave `component` unchanged.
- Docs -- `docs/ops/ratchet.md` (new: CLI, output, owner rules, the overlay, CI), and updates to `docs/ops/harness.md`, `docs/ops/expectations.md`, `docs/ops/oracle.md` (merge-order ownership), the stale comments listed in the Code Map, and the `conformance/README.md` Ratchet section.

**Acceptance Criteria:**
- Given a PR run, when a test fails or passes against its expectation, then the `ratchet` check exits 1 and lists every unexpected failure and every unexpected pass that the run's Story owns (XT-115).
- Given a Story PR, when it changes Expectations lines or `portedTest` blocks whose IDs are not in its `test_ids`, then `bun tools/ownership/ownership.ts pr` fails and lists each one (XT-116).
- Given a change of an entry from `pass` to any other status, including removing the line, when the PR has no approved Escalation listing that Test ID, then the ownership check fails (XT-117).
- Given an unexpected pass of a Test ID owned by no open Story, when the ratchet runs on `main`, then it is a warning and exit 0; and given a Test ID owned by another open Story, then this run warns while that Story's own run fails (XT-118).
- Given a merged per-Story request that a later batch extraction or another Story's file also produces, when `oracle:verify-fixtures` and `oracle:story` run, then the merged file stays valid, the batch skips it, and the earlier-merged Story owns it (XT-187).

## Spec Change Log

## Review Triage Log

## Design Notes

Unowned or foreign unexpected passes are warnings on PR runs too, not only on `main`. The ownership rule forbids a Story from editing lines outside its `test_ids`, so failing it on such a pass would leave the PR no legal fix. The owner's next run fails, and Story 5.8's promotion bot handles unowned passes.

The workflow runs PR code under `pull_request_target`, as AD-28 requires, so that a PR cannot change its own check. The safety rests on four things: `contents: read`, no secrets, `persist-credentials: false`, and the overlay that restores every Protected Path (the harness, tools, tests, root `bunfig.toml` and `package.json`) from base. This workflow does not run on this Story's own PR, because `pull_request_target` uses the base's workflow. Its first live run is the push to `main` after merge.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/ratchet.test.ts conformance/tests/xaravel/ownership-lines.test.ts conformance/tests/xaravel/oracle-merge-order.test.ts conformance/tests/xaravel/ownership.test.ts conformance/tests/xaravel/oracle-story.test.ts conformance/tests/xaravel/oracle-verify.test.ts` -- all pass.
- `bun run ratchet run --ref main` -- `RATCHET ref=main failures=0 passes=0 warnings=0`, exit 0 (locally, not-run Variants are not failures).
- `bun run test`, `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `bun run expectations:check`, `bun run escalations:check`, `bun run oracle:verify-fixtures`, `bun run ownership:check`, `bun run protected-paths:codeowners`, `bun run harness` -- all pass, with no CODEOWNERS drift.
