---
title: 'Story 5.6: Ratchet and Expectations line ownership'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: '3192b6c52c58e6d761ddc1ade6be54706cf72add'
review_loop_iteration: 0
followup_review_recommended: true
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

### 2026-10-19 — Review pass
- verdicts: 27 findings — high 0, medium 5, low 19, false 3, maybe-false 0
- findings:
  - (verification-gap 1) `[medium]` `[patch]` a harness `ERROR` that never reached `HarnessResult.differences` would let the Ratchet pass, untested end to end — `runRatchet` now fails closed on harness code 1 with no counted difference, and XT-115 drives a real ERROR run through `runRatchet`. Grouped with verification-gap other and blind 11.
  - (verification-gap 2) `[low]` `[patch]` `extract()`'s per-Story filter never runs in a test — XT-187 now runs `extract` on a root with a committed per-Story request.
  - (verification-gap 3) `[low]` `[patch]` `generateFixtures` never takes the owned-request branch — XT-187 now runs it and checks the per-Story fixture is byte-identical.
  - (verification-gap other) `[medium]` `[patch]` the Ratchet ignores the harness code — grouped with verification-gap 1.
  - (blind 1) `[low]` `[patch]` the docs claim a PR cannot change its own grader, but PR test code runs with write access to `pr/` after the one-time overlay — in-process code is uncontainable by any test runner; the claim is reworded to what holds (workflow, tool and Protected Paths come from base at start). Grouped with edge 7.
  - (blind 2) `[low]` `[patch]` the overlay skips nested `node_modules` — it now skips only the top-level one.
  - (blind 3) `[low]` `[reject]` Pin bumps that reset a `pass` line need an Escalation — that is the AC's rule, which names no exception, and no `pass` line exists yet; an exemption would be a Maintainer change to the AC.
  - (blind 4) `[low]` `[reject]` any approved Escalation listing the id licenses a later demotion — this is what the AC says ("an approved Escalation covering that Test ID"); tying the line's `escalation` field to it is a stricter rule for the Maintainer to decide.
  - (blind 5) `[low]` `[reject]` a row `X#k` grants block `X` — no manifest splits one test's dataset rows across Stories (617 row parents, 0 shared), so it is unreachable today; now documented (intent patch).
  - (blind 6) `[low]` `[reject]` code outside `portedTest` blocks is not compared — the AC names lines and blocks; any outcome change it causes in another Story's test is an unexpected failure the Ratchet fails; the docs now say so. Grouped with edge 3.
  - (blind 7) `[low]` `[reject]` deleting and re-adding a file moves it later in merge order — the spec's chosen rule; a Story re-landing its own request file is rare, and changing the rule needs a spec change.
  - (blind 8) `[false]` `[reject]` `--first-parent` needs git 2.31+ to diff merges — `main` is squash-merged with linear history (no merge commits on first-parent), and CI and the M1 run git ≥ 2.39.
  - (blind 9) `[low]` `[patch]` an XT-187 comment names 3.4.jsonl where the code re-adds 10.1.jsonl — comment corrected.
  - (blind 10) `[low]` `[reject]` unbounded concurrent contents reads on huge PRs — needs a PR changing thousands of shards; a limiter adds machinery for no everyday case.
  - (blind 11) `[medium]` `[patch]` the Ratchet ignores the harness exit code — grouped with verification-gap 1.
  - (blind 12) `[false]` `[reject]` `ratchet.yml` checkouts are shallow — nothing the Ratchet runs calls `mergeOrder`; there is no bad outcome today.
  - (blind 13) `[low]` `[reject]` no `concurrency` group — redundant runs cost minutes only; Story 5.7 restructures the CI pipeline.
  - (edge 1) `[medium]` `[patch]` two merged Story files of different Components holding one sha: the shadowed Story's fixture fails verify and leaves the kept set — shadowed shas are kept under their holder's Component and verify accepts any holder's Component. Grouped with edge 8.
  - (edge 2) `[false]` `[reject]` a Story branch that merged main ranks main's files at its merge commit — CI reads per-Story files on base checkouts or `refs/pull/<n>/merge`, whose first parent is `main`; only a local branch view differs.
  - (edge 3) `[low]` `[reject]` code outside blocks — grouped with blind 6.
  - (edge 4) `[low]` `[reject]` a row grants the block — grouped with blind 5.
  - (edge 5) `[low]` `[reject]` a regex literal after `)` lexes as division — rare in test files, mostly fails closed; a parenthesis-context tracker adds complexity for no everyday case.
  - (edge 6) `[low]` `[reject]` the overlay does not recreate symlinks — the repository tracks no symlinks (`git ls-files -s` mode 120000: 0).
  - (edge 7) `[low]` `[patch]` claim: a PR cannot change its own grader — grouped with blind 1.
  - (edge 8) `[medium]` `[patch]` claim: R5 is not closed for different Components — grouped with edge 1.
  - (edge 9) `[low]` `[patch]` claim: `conformance/README.md` implies ownership covers all Ported Test code — reworded to say only lines and block texts are compared.
  - (intent) `[low]` `[patch]` descriptive: foreign or unowned passes warn on PRs too (in Design Notes); a row grants its block and `bot/*` is exempt from demotion only in code comments — both now documented in `docs/ops/ratchet.md` and `conformance/README.md`.

## Design Notes

Unowned or foreign unexpected passes are warnings on PR runs too, not only on `main`. The ownership rule forbids a Story from editing lines outside its `test_ids`, so failing it on such a pass would leave the PR no legal fix. The owner's next run fails, and Story 5.8's promotion bot handles unowned passes.

The workflow runs PR code under `pull_request_target`, as AD-28 requires, so that a PR cannot change its own check. The safety rests on four things: `contents: read`, no secrets, `persist-credentials: false`, and the overlay that restores every Protected Path (the harness, tools, tests, root `bunfig.toml` and `package.json`) from base. This workflow does not run on this Story's own PR, because `pull_request_target` uses the base's workflow. Its first live run is the push to `main` after merge.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/ratchet.test.ts conformance/tests/xaravel/ownership-lines.test.ts conformance/tests/xaravel/oracle-merge-order.test.ts conformance/tests/xaravel/ownership.test.ts conformance/tests/xaravel/oracle-story.test.ts conformance/tests/xaravel/oracle-verify.test.ts` -- all pass.
- `bun run ratchet run --ref main` -- `RATCHET ref=main failures=0 passes=0 warnings=0`, exit 0 (locally, not-run Variants are not failures).
- `bun run test`, `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `bun run expectations:check`, `bun run escalations:check`, `bun run oracle:verify-fixtures`, `bun run ownership:check`, `bun run protected-paths:codeowners`, `bun run harness` -- all pass, with no CODEOWNERS drift.

## Auto Run Result

Status: done

**Summary.** Story 5.6 adds three things. First, the `ratchet` check: `tools/ratchet/ratchet.ts` and `.github/workflows/ratchet.yml`. Second, line-level ownership in `tools/ownership`. Third, merge-order ownership of per-Story Oracle requests (Epic 3 retro R5).

- **Ratchet.** It runs the full harness and prints `UNEXPECTED-FAILURE` for every non-pass difference, including `ERROR`, CI `NOT-RUN`, and a harness exit 1 with nothing counted.
  - An `UNEXPECTED-PASS` fails the run only when the run's own `story/<id>` owns it.
  - Every other unexpected pass is a `WARNING` (and `::warning::` under GitHub Actions). The run ends with a `RATCHET ref=… failures=… passes=… warnings=…` line.
  - The workflow runs on `pull_request_target`. It checks out the base at `.` and the PR head at `pr/`. `overlay` restores every Protected Path and the sprint status from the base. The job has Postgres 18 and Redis 8.10.2 services, `CI=true`, `contents: read` and no secrets. It also runs on push to main.
- **Ownership.** On `story/*` PRs, Expectations lines (keyed by `(id, variant)` across all changed shards, at the merge base versus the head) and `portedTest` blocks outside the manifest's `test_ids` are violations.
  - Blocks are found by the new `tools/ownership/ported-blocks.ts` scanner. An id it cannot resolve, or a file it cannot parse, fails closed.
  - A `pass` changed to another status, or removed, needs an approved, sha-bound Escalation listing the id. That Escalation may be on the base or in the PR head; the new `decisionStatus()` in `tools/escalations` checks it.
  - `bot/*` and `planning/*` are exempt from that rule.
- **Oracle R5.** The new `tools/oracle/merge-order.ts` orders per-Story files by their add commit in first-parent history, and throws on a shallow clone.
  - Merged files are judged without the batch. A later holder is shadowed, not rejected, and the earlier-merged Story owns the request.
  - Extraction skips held requests, and fixture generation never re-signs them.
  - `verify` accepts a fixture under any holder's Component.
  - `oracle:story` still rejects a candidate that duplicates the batch or a committed file.
  - `fetch-depth: 0` is set on the `ci.yml` and `oracle.yml` checkouts that read those files.

**Files changed.**
- `tools/ratchet/ratchet.ts` (new): the `run` and `overlay` commands.
- `.github/workflows/ratchet.yml` (new): the `ratchet` job.
- `conformance/harness/compare.ts` and `harness.ts`: a difference `kind`, and `HarnessResult.differences`. Printed output is unchanged.
- `tools/ownership/ownership.ts` and `tools/ownership/ported-blocks.ts` (new): the line rules, the demotion rule and the block scanner.
- `tools/escalations/escalations.ts`: the pure `decisionStatus()`.
- `tools/oracle/merge-order.ts` (new), plus `story-requests.ts`, `verify.ts`, `fixtures.ts`, `extract.ts` and `story.ts`: R5.
- `.github/workflows/ci.yml` and `oracle.yml`: `fetch-depth: 0`.
- New tests:
  - `ratchet.test.ts`: XT-115 and XT-118;
  - `ownership-lines.test.ts`: XT-116 and XT-117;
  - `oracle-merge-order.test.ts`: XT-187.
- Existing tests, changed only where AC5 reverses them, or for fixture content: `oracle-story`, `oracle`, `repository-policy` and `ownership`.
- `package.json`: the `ratchet` script.
- `stories/5.6.md`: XT-187 and its AC row.
- Docs: `docs/ops/ratchet.md` (new), `harness.md`, `expectations.md`, `oracle.md`, `conformance/README.md`, and the stale "later" comments.
- `_bmad-output/implementation-artifacts/story-manifests.md`: the next free ID is now XT-conformance-188.

**Review.** 27 findings: 5 medium, 19 low and 3 false.
- **Patched: 9 entries**, 2 medium and 7 low.
  - The two medium:
    - the Ratchet now fails closed on a harness exit 1 with no counted difference, and a real `ERROR` run is tested through it;
    - a shadowed holder in another Component keeps its fixture valid.
  - The low ones:
    - the extract test;
    - the `generateFixtures` test;
    - the comment fix;
    - the overlay skips only the top-level `node_modules`;
    - the grader-protection wording;
    - the line-rule scope docs;
    - documenting the row-to-block rule and the bot exemption.
- **Deferred:** none.
- **Rejected:** each with its reason in the triage log.
  - The false ones: git older than 2.31; the shallow `ratchet.yml` checkout; a Story branch that merged main.
  - The low ones:
    - the Pin-bump demotion (it is the AC's rule);
    - reusing an old approved Escalation (the AC's wording);
    - a row granting its block (no shared rows exist);
    - code outside blocks (the Ratchet catches the outcomes it changes);
    - delete-and-re-add order;
    - unbounded contents reads;
    - no `concurrency` group;
    - regex lexing after `)`;
    - symlinks (none are tracked).

**Follow-up review recommended: true.** Patched entries by verdict: high 0, medium 2, low 7. The named risk: the medium patches (the harness exit-code fail-closed rule, and multi-Component verify and kept sets) changed the verdict logic and have been reviewed only once.

**Verification.**
- `bun run test`: 213 pass, 0 fail.
- `bun run ratchet run --ref main`: `RATCHET ref=main failures=0 passes=0 warnings=0`.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`.
- `typecheck`, `lint`, `workflows:check`, `expectations:check`, `escalations:check`, `oracle:verify-fixtures` and `ownership:check` pass. `protected-paths:codeowners` causes no drift.
- The XT-187 extraction case ran against local PHP 8.5.11.

**Residual risks.**
- **`ratchet.yml` has never run.** `pull_request_target` uses the base's copy, so its first live run is the push to main after merge. With `CI=true`, an unreachable alpha Variant fails it. The Postgres and Redis service wiring is unverified until then.
- **The ownership line rules have not run live either.** They read content through the compare and contents APIs, which only a fake GitHub server has exercised.
- **In-process tampering.** PR test code runs in-process with write access to `pr/`. The overlay protects the grader only at the start of the run.
- **Neither check is required yet.** `ratchet` becomes a required check, with a merge-queue run, in Story 5.7. The orchestrator merges with `--admin`, so neither check is identity-verified.
