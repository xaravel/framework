---
title: 'Story 5.7: CI pipeline: PR checks, merge queue and nightly matrix'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: '068945fe720203568bb66ce8e484477f64dd4912'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/AGENTS.md'
warnings: [oversized]
deferred:
  - summary: >-
      The bench runner's default time-budget iteration mode is never exercised by a test.
    evidence: |-
      Every test passes a fixed iteration count; the nightly passes none. A broken stop condition would only cost nightly report quality, since the job is continue-on-error.
    location: >-
      tools/bench/bench.ts time()
    severity: low
  - summary: >-
      The new ratchet.yml PR and merge-group flows, nightly.yml (arm64 services, macOS Homebrew) and the oracle:recheck step have never run live.
    evidence: |-
      pull_request_target runs the base's workflow, so this PR is graded by the old one; the tests check YAML shape and tool units only. The first live runs are the next PR, the first queued merge, and the first nightly, all listed as Maintainer steps in docs/ops/ci.md.
    location: >-
      .github/workflows/ratchet.yml, .github/workflows/nightly.yml, .github/workflows/oracle.yml
    severity: medium (unverified)
  - summary: >-
      ratchet is required only in the committed ruleset until the Maintainer runs ruleset:apply.
    evidence: |-
      AC4 is met against .github/rulesets/main.json and REQUIRED_CHECKS; ruleset:verify against live GitHub reports drift until the apply.
    location: >-
      .github/rulesets/main.json
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The PR checks from AD-28 mostly exist: `ci.yml` (`check`, `audit`), `protected-paths.yml` and `ownership.yml`. Four things are missing:
- `ratchet.yml` always runs the full harness. It has no reverse-dependency closure, no full run of the Story's `test_ids`, and no `merge_group` run.
- `ratchet` is not a required check.
- No nightly matrix workflow and no benchmark suite exist.
- Nothing re-evaluates committed Oracle fixtures at the current Pin, so a stale fixture can go unnoticed (Epic 3 retro S5).

**Approach:**
- Add a `scope` command to the Ratchet: it computes the AD-2 reverse-dependency closure of what a PR changed. `run` grades only that closure.
- Add a `story` command that runs the Story's `test_ids` in full.
- Run the full Ratchet in the merge queue.
- Make `ratchet` required in the committed ruleset.
- Add `nightly.yml`: a linux/macOS × x64/arm64 matrix plus a benchmark job that never fails.
- Add `oracle:recheck` to the nightly Oracle job. It compares a fresh evaluation of every committed request against its committed fixture.

## Boundaries & Constraints

**Always:**
- This is Maintainer-approved Phase 0 Infrastructure work. It may edit `tools/`, `conformance/harness/`, `conformance/tests/`, `conformance/bench/`, `.github/`, `docs/ops/`, `package.json` and `_bmad-output/implementation-artifacts/`.
- **Scope**
  - `ratchet.ts scope --base <dir> --head <dir> --out <file>` compares file contents between two trees, skipping `.git` and `node_modules`. It writes `{"mode":"full"|"components"|"none","components":[…],"reason":"…"}`.
  - How changed paths map to scope:
    - `packages/<p>/**` → package `p`.
    - `conformance/expectations/<c>/**` and `conformance/fixtures/<c>/**` → Component `c`.
    - The no-effect paths add nothing: `docs/`, `_bmad-output/`, `decisions/`, `stories/`, `conformance/escalations/`, `conformance/oracle-requests/`, `.github/`, and any root `*.md` except `AGENTS.md`. `stories/` is read from the base, and `AGENTS.md` is never graded.
    - Any other path → `full`, with `reason` naming the first such path in sorted order.
  - The closure is every package reachable backwards from a changed package over every `EDGE_FIELDS` edge (dependencies, dev, peer, optional), the changed packages included. Read the package rows and their `package.json` the way `tools/graph/graph.ts` does, and export the closure from there.
  - `components` is the closure ∩ the directory names under the head's `conformance/expectations/`, sorted. If that set is empty, the mode is `none`.
- **`run`**
  - `ratchet.ts run … [--scope <file>]` passes `components` to `runHarness` in `components` mode.
  - In `none` mode it runs no harness and prints `RATCHET ref=<r> scope=none failures=0 passes=0 warnings=0`, exit 0.
  - With no `--scope`, or in `full` mode, it behaves exactly as today. Every RATCHET line gains ` scope=<mode>` after the ref.
- **`story`**
  - `ratchet.ts story --root <dir> --ref <r>` runs `harness --story <id>` in full (never `--fast`) for `story/<id>` refs. It inherits the environment, so `CI=true` makes every alpha Variant run, and it exits with the harness's code.
  - For a non-Story ref, or a manifest with empty `test_ids`, it prints `STORY ref=<r> skipped: <why>` and exits 0. Those two are the only skips; any other error exits 1.
- **`ratchet.yml`**
  - On `pull_request_target`, the order is: `scope` (base vs `pr/`, before `overlay`), then `overlay`, install, `run --scope`, then `story`.
  - On `merge_group`, it checks out `github.sha`. It resolves the PR head ref with `ruleset.ts merge-group-pr` plus `gh pr view --json headRefName` (job permissions `contents: read`, `pull-requests: read`, `GH_TOKEN: github.token`), and runs the full `run --root . --ref <head ref>`.
  - On push to main, it runs the full Ratchet, as today.
  - The job id stays `ratchet`, and the services stay `postgres:18` and `redis:8.10.2`.
- **Ruleset:** add `ratchet` to `REQUIRED_CHECKS` (`tools/ruleset/ruleset.ts:55`) and to `.github/rulesets/main.json` with `integration_id` 15368.
- **`nightly.yml`**
  - Triggers: `schedule` plus `workflow_dispatch`. Top-level `permissions: contents: read`, and every action pinned to the SHAs other workflows already use.
  - Job `linux`, a matrix of `ubuntu-24.04` (x64) and `ubuntu-24.04-arm` (arm64), with services `postgres:18` and `redis:8.10.2`.
  - Job `macos`, a matrix of `macos-15-intel` (x64) and `macos-15` (arm64). It installs `postgresql@18` and `redis` with Homebrew, starts them, and creates the `postgres` role with password `postgres`.
  - Both jobs set `CI=true` and the `PG*`/`REDIS_*` env that `ratchet.yml` sets, then run `bun tools/ratchet/ratchet.ts run --root . --ref main`.
  - Job `bench` on `ubuntu-latest` runs `bun run bench` with `continue-on-error: true` and appends the report to `$GITHUB_STEP_SUMMARY`.
- **Benchmarks**
  - `tools/bench/bench.ts` (script `bench`) discovers `packages/*/bench/**/*.bench.ts` and `conformance/bench/**/*.bench.ts`. Each file default-exports `{ name: string, fn: () => unknown }[]`.
  - It runs a warm-up, then timed iterations, and prints `BENCH <file> <name> median_ns=<n> iterations=<k>` per benchmark, then `BENCH-SUMMARY ran=<n> errors=<e>`.
  - A benchmark that throws, or a file that fails to load, prints `BENCH-ERROR <file> <name|-> <message>`.
  - It always exits 0, except 2 for a usage error.
  - Ship one starter file, `conformance/bench/expectations.bench.ts`, which times reading the committed Expectations File and comparing it to itself with the existing harness/compare code.
- **Recheck**
  - `tools/oracle/recheck.ts` (script `oracle:recheck`) takes `[--root] [--image <ref> | --local <dir> [--php <bin>]]`. The default image is `oracleImage(root)`, the locally built image at the current tag.
  - It takes every batch request, except those listed in `nondeterminism.jsonl` and those `storyHeldShas` holds, plus every per-Story request, accepted or shadowed, under its manifest's Component.
  - Each request whose committed fixture exists at `conformance/fixtures/<component>/<sha>.json` is evaluated once through `evaluateOnce`/`parsePass`, and its `canonicalJson` is compared with the fixture's `output`.
  - Each differing fixture prints `stale fixture: conformance/fixtures/<c>/<sha>.json (<id>): committed <digest> vs evaluated <digest>`. Then comes `Oracle recheck: <n> fixtures compared, <d> differ, <m> requests without a fixture`, and the exit is 1 if `d > 0`.
  - Requests with no fixture are counted, not failed.
  - It never signs or writes anything.
- `oracle.yml`'s `determinism` job runs `bun run oracle:recheck` after the image build. The step runs even if the determinism step failed (`if: ${{ !cancelled() && steps.build.outcome == 'success' }}`).
- **Tests**
  - New tests use `bun:test` + `Bun.YAML.parse`, named `XT-conformance-<n>: …`, as in `ratchet.test.ts`.
  - Map: AC1 → XT-conformance-119, AC2 → -120, AC3 → -121, AC4 → -122, AC5 → XT-conformance-188 (off-manifest; record it in `story-manifests.md`, next free 189).

**Never:**
- No async-surface or API-surface queue step: Stories 6.4 and 6.5 own those.
- No live ruleset apply: that is a Maintainer step.
- No change to `stories/*.md`, `AGENTS.md`, Expectations data, `tools/ownership/`, `tools/protected-paths/`, `conformance/protected-paths`, or the ownership and protected-paths workflows.
- Never weaken an existing assertion. XT-115 (`ratchet.test.ts`) and XT-30 (`repository-policy.test.ts`) may only gain assertions, plus the RATCHET-line suffix change, marked `// Story 5.7: scope=<mode> suffix`.
- No `--fast` anywhere in CI.
- No Node, npm, mitata, or any new dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Docs-only PR | Only `docs/x.md` differs | scope `none`; `RATCHET ref=… scope=none failures=0 …`, exit 0 | — |
| Package PR | `packages/support/src/A.ts` differs; `collections` depends on `support` | scope `components`: `support`, `collections` (those with Expectations dirs) | — |
| Tool PR | `tools/x/y.ts` differs | scope `full`, reason `tools/x/y.ts` | — |
| Story with tests | ref `story/14.1`, test_ids non-empty | `harness --story 14.1` full; exit is the harness's | harness exit forwarded |
| Story without tests | ref `story/5.7`, `test_ids: []` | `STORY ref=story/5.7 skipped: no test_ids`, exit 0 | — |
| Planning ref | ref `planning/x` | `STORY ref=planning/x skipped: not a Story ref`, exit 0 | — |
| Bench throws | one bench fn throws | `BENCH-ERROR …`, others still run, exit 0 | never fails |
| Stale fixture | evaluated output ≠ committed | `stale fixture: conformance/fixtures/<c>/<sha>.json (<id>) …`, exit 1 | evaluation failure as a whole → exit 1 with message |
| Fixture fresh | all equal | summary line, exit 0 | — |

</intent-contract>

## Code Map

- `tools/ratchet/ratchet.ts` -- `runRatchet(root, ref, {env, harness})` at ~:150-183 builds the RATCHET line at :181. `parseFlags`/`main` are at :270-333. `overlay` skips `.git`/`node_modules` via `SKIPPED`, and its `entries()` walker can be reused for `scope`.
- `conformance/harness/harness.ts` -- `HarnessOptions` at :137 (`components`, `story`, `env`); `runHarness`; the CLI usage at :615. `--story` needs `^[1-9]\d*\.[1-9]\d*$` and fails a precondition when `test_ids` is empty, so `story` must check for that first, through `readManifests` / `parseManifest` (`tools/ownership/ownership.ts:147,231`).
- `tools/graph/graph.ts` -- `Package {row, manifest}`, `EDGE_FIELDS`, `readTable(TABLE_PATH)`. Export `reverseClosure(root, names)` here, and keep `checkGraph` unchanged.
- `tools/scaffold/packages.jsonl` -- package rows. The `dir` field is `packages/<name>`, and `<name>` is the Expectations Component name.
- `.github/workflows/ratchet.yml` -- the current job (services, env, overlay order). `.github/workflows/ownership.yml` -- the `merge-group-pr` step pattern to copy.
- `.github/rulesets/main.json`, `tools/ruleset/ruleset.ts:55` (`REQUIRED_CHECKS`), `:241` (`policyViolations`), `:388` (`merge-group-pr`).
- `.github/workflows/oracle.yml` -- the `determinism` job. Give its build step `id: build`.
- `tools/oracle/fixtures.ts` -- `readCommittedRequests` :225, `readNondeterminism` :317, `readStoryRequests` :331, `storyHeldShas` :336, `evaluateOnce` :373, `parsePass` :416, `outputDigest` :444, `MainDeps.runner` (a fake image runner for tests), `FIXTURES_DIR`. `tools/oracle/story.ts:107-160` -- how a temp request dir is written (chmod 755/644) and evaluated.
- `tools/workflow-permissions/workflow-permissions.ts` -- top-level `{contents: read}`. Job-level `pull-requests: read` is allowed.
- `conformance/tests/xaravel/ratchet.test.ts` (XT-111..118, the fixture-root patterns, the XT-115 YAML assertions at ~:222-260), `repository-policy.test.ts` (XT-30 :230-267), `oracle-fixtures.test.ts` (fake runner; a real-PHP block gated by `XARAVEL_PHP_FIXTURES`).
- `.github/workflows/ci.yml` -- the `php-fixtures` job's test file list. Add `oracle-recheck.test.ts` there if it gets a real-PHP block.
- `tools/ratchet/package.json`, `tsconfig.json` -- the template for the `tools/bench` workspace.
- Docs: `docs/ops/ratchet.md` (:38-48), `docs/ops/harness.md:11`, `docs/ops/oracle.md`, `docs/ops/identities.md` (rulesets/queue), and the header comments of `ci.yml` (:43) and `ratchet.yml` (:20).

## Tasks & Acceptance

**Execution:**
- `tools/graph/graph.ts` -- export `reverseClosure(root, changed: readonly string[]): string[]`, with the names as package dir names, sorted -- AD-2 closure.
- `tools/ratchet/ratchet.ts` -- add `scope`, `run --scope`, `story` and the ` scope=<mode>` suffix; update the header and usage text.
- `.github/workflows/ratchet.yml` -- the PR, merge-group and push flows as in Always; update the header comment.
- `tools/ruleset/ruleset.ts`, `.github/rulesets/main.json` -- add `ratchet` as a required check.
- `.github/workflows/nightly.yml` -- new: `linux`, `macos` and `bench` jobs.
- `tools/bench/{bench.ts,package.json,tsconfig.json}`, `conformance/bench/expectations.bench.ts`, `package.json` (`bench`, `oracle:recheck`) -- the benchmark runner and the starter benchmark. Run `bun install` so the workspace lockfile stays frozen-valid.
- `tools/oracle/recheck.ts`, `.github/workflows/oracle.yml` -- the recheck and its nightly step.
- `conformance/tests/xaravel/ci-pipeline.test.ts` -- XT-119 (the PR checks exist across the workflows: lint, typecheck, graph, audit, protected-paths, ownership, ratchet scope/run/story, services, ubuntu x64, no `--fast`; plus scope/closure/story behavior over hermetic git-init fixture roots), XT-120 (`merge_group` flow, full run, `merge_queue` rule in main.json), XT-121 (nightly matrix: OS labels, native brew install on macOS, `bench` step never failing; plus the bench runner's error/exit behavior), XT-122 (`REQUIRED_CHECKS` and main.json contain `ratchet` with integration 15368; `policyViolations` flags a ruleset without it).
- `conformance/tests/xaravel/oracle-recheck.test.ts` -- XT-188, with a fake runner: fresh fixtures → exit 0; one tampered output → names exactly that fixture, exit 1; batch, per-Story and shadowed requests all covered; listed nondeterministic requests skipped. Add a real-PHP block (`--local`, gated like `oracle-fixtures.test.ts`) and add the file to the `php-fixtures` job.
- `docs/ops/ci.md` (new: the pipeline per AD-28, the Maintainer live steps), plus `ratchet.md`, `harness.md`, `oracle.md` and the `ci.yml` header -- docs.
- `_bmad-output/implementation-artifacts/story-manifests.md` -- record XT-conformance-188; the next free ID is 189.

**Acceptance Criteria:**
- Given a Story PR on linux-x64, when CI runs, then lint, typecheck, protected-paths, ownership, dependency-graph, `bun audit`, the Ratchet over the reverse-dependency closure and a full run of the Story's `test_ids` on every Variant all run, with SQLite, Postgres 18 and Redis 8.10.2 (XT-119).
- Given the merge queue, when a PR enters it, then the full Ratchet runs on all alpha Variants, and the committed ruleset requires the queue on main (XT-120).
- Given the nightly schedule, when it runs, then the full matrix runs on linux and macOS, x64 and arm64, with native Postgres and Redis on macOS, and the benchmark suite runs, reports and never fails the job (XT-121).
- Given the `ratchet` check, when the ruleset is verified, then `ratchet` is a required check (XT-122). The live apply is the Maintainer's step.
- Given the committed fixtures and the image at the current Pin, when the nightly runs, then each committed request is re-evaluated, and the run fails naming each differing fixture (XT-188).

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 40 findings — high 0, medium 12, low 17, false 4, maybe-false 7
- findings:
  - **Blind Hunter**
    - `[low]` `[patch]` Existing XT-115/XT-30/XT-33/XT-43 assertions were changed beyond "only gain assertions". All the edits are additive or tighten (`permissions` undefined → the exact object the spec requires), and every one carries a `// Story 5.7` marker (ratchet.test.ts:230-269, repository-policy.test.ts:247,269,859, oracle.test.ts:723). Nothing is weakened, so no code change; recorded here.
    - `[low]` `[reject]` The nightly determinism job will be red from day one, hiding new stale fixtures. This is the intended detector behavior. ESC-5.7-1 routes the fix to the Maintainer, and the upload step uses `if-no-files-found: ignore`, so it uploads no misleading artifact.
    - `[medium]` `[patch]` The docs told triagers to list date-dependent requests in nondeterminism.jsonl, contradicting ESC-5.7-1. Fixed: ci.md and oracle.md now defer to the Maintainer's ruling.
    - `[low]` `[reject]` ESC-5.7-1 metadata (`test_ids` holds the XT ID, `trigger: flaky`, 15 local differences unexplained). The escalations check validates it, and the evidence states the local-run caveat.
    - `[low]` `[patch]` The merge-group run grades the whole group under the head PR's ref. Documented in ratchet.md.
    - `[medium]` `[patch]` macOS backends are not pinned. A Homebrew exact pin for Redis 8.10.2 is not available, so the macOS step now prints the installed server versions; AC3 asks only for a native install.
    - `[low]` `[reject]` Nightly failures and benchmark results are not stored durably. Out of scope: Story 5.8's bots own failure routing, and NFR-6 benchmarks are information only.
    - `[medium]` `[patch]` The bench runner neither awaits async benchmarks nor survives a rejected one. It now awaits a thenable inside the try, so a rejection becomes a BENCH-ERROR line.
    - `[medium]` `[patch]` computeScope checks only the head's Expectations dirs, so a deleted Component dir gave `none`. Fixed: such a Component now makes the scope `full`.
    - `[false]` `[reject]` `none` mode skips openManifests and so does not fail closed. With nothing graded, ownership of no difference is needed. The manifests are still validated by the `ownership` job.
    - `[low]` `[patch]` The node_modules test case proved nothing, and an installed tree marks packages changed. The scope walk now skips node_modules at any depth, and the test now tells the two cases apart.
    - `[low]` `[reject]` XT-120's required-check loop is hard-coded, and SQLite is not asserted. SQLite needs no service. The loop covers every current required check's workflow; deriving it from REQUIRED_CHECKS adds a mapping table for little gain.
    - `[low]` `[reject]` recheckItems drops per-Story files without a Component uncounted. Such a file already fails `oracle:verify-fixtures` (a required check), so it cannot sit on main.
    - `[medium]` `[patch]` workflow_dispatch on another branch is labelled `ref=main`. The ref is now passed from `github.ref_name`.
    - `[low]` `[reject]` One failed evaluation hides every fixture result. It fails loudly with exit 1 and a message, which is correct fail-closed behavior; per-file batching adds complexity for a rare case.
  - **Edge Case Hunter**
    - `[medium]` `[patch]` `decisions/` was no-effect, but the harness reads `decisions/DIV-<n>.md` (harness.ts:263). It is removed from NO_EFFECT, so a decisions/ change makes the scope `full`.
    - `[medium]` `[patch]` A deleted Expectations dir gave `none`. Same root cause and fix as the Blind Hunter row above.
    - `[medium]` `[patch]` A changed package with ported tests and no Expectations dir was dropped, losing its UNKNOWN reports. Such a package now makes the scope `full`.
    - `[low]` `[reject]` An Expectations dir with no lines makes the harness throw. Every committed Expectations dir holds shards (expectations:check), and a throw fails closed.
    - `[false]` `[reject]` Story test_ids with no Expectations lines make `story` exit 1. Failing loudly is correct: a Story's test_ids must have Expectations lines.
    - `[low]` `[reject]` readScope accepts mode none/full with components. Our own `scope` command writes the file in the same job, so it is never inconsistent.
    - `[medium]` `[patch]` The job timeout of 90 exceeds the queue's check timeout of 60. Set to 60.
    - `[medium]` `[patch]` The dispatch ref is mislabelled. Same fix as the Blind Hunter row.
    - `[low]` `[patch]` macOS Redis is unpinned. Same fix as the Blind Hunter row.
    - `[medium]` `[patch]` An async rejected bench crashes the runner. Same fix as the Blind Hunter row.
    - `[low]` `[reject]` Bench names with whitespace. Names are authored in-repo; no current name breaks parsing.
    - `[low]` `[reject]` One slow benchmark eats the job timeout. The job is continue-on-error and information only.
    - `[maybe-false]` `[reject]` A held sha whose Component differs from the batch's is never rechecked. That would need a per-Story request for an id outside its Component, which the story judge rejects (`not owned by Story`). If it were true, the effect would be low.
    - `[maybe-false]` `[reject]` Null-Component per-Story files are skipped silently. The same file fails verify-fixtures; low if true.
  - **Verification Gap**
    - `[medium]` `[patch]` The real-harness components-mode test could not tell scoped grading from full grading. The fixture now has a second Component with a failing test, and the test asserts it is excluded under the scope and reported unscoped.
    - `[low]` `[defer]` The bench budget-iteration mode is never run by a test. The filed disposition is defer: information only.
    - `[low]` `[reject]` The bench main catch path is untested. Information only, and the job is continue-on-error.
  - **Intent Alignment** (descriptive; each divergence recorded)
    - `[maybe-false]` `[reject]` The PR Ratchet is narrowed from always-full. AD-28 asks for the closure, and the classifier errs toward full.
    - `[maybe-false]` `[defer]` PR, queue and nightly are verified only by YAML shape, not live. Their first live runs are listed as Maintainer steps in docs/ops/ci.md.
    - `[maybe-false]` `[defer]` AC4 holds in the committed ruleset only. The live `ruleset:apply` is a Maintainer step.
    - `[false]` `[reject]` The merge-queue trust model runs the PR's copy of the workflow. That is GitHub's merge_group semantics, and the same holds for ownership.yml and protected-paths.yml.
    - `[maybe-false]` `[reject]` The benchmarks measure the harness, not the framework. No framework packages exist yet; the runner discovers `packages/*/bench/` as they arrive.
    - `[low]` `[patch]` macOS backends are unpinned. Same fix as the Blind Hunter row.
    - `[maybe-false]` `[reject]` The recheck is red on known fixtures. Routed through ESC-5.7-1.
    - `[false]` `[reject]` The Story run is skipped on this Story's own PR. Its `test_ids` is `[]`, as the matrix specifies.

## Design Notes

- **Scope compares trees, not git history.** `pr/` is a depth-1 checkout. Comparing the base tip with the head over-approximates when `main` has moved on, and that errs toward running more, which is safe. Scope runs before `overlay`, so a PR's change to a grader package still widens the scope, even though the overlay then restores that package.
- **Live-only paths.** `pull_request_target` runs the base's workflow and tools. Nothing new in `ratchet.yml` therefore runs on this Story's own PR. The first live runs are the push to main, the next PR, the first merge-queue entry, and the first nightly. YAML-shape tests do not verify them (lesson, epic 3).
- **Maintainer live steps.**
  - `bun run ruleset:apply` makes `ratchet` required on the live ruleset. Until then, AC4 holds only in the committed ruleset.
  - Supervise the first nightly run: the Homebrew service setup on macOS has never run live.

## Verification

**Commands:**
- `bun install --frozen-lockfile --ignore-scripts` -- expected: no lockfile change after the first `bun install`.
- `bun test` -- expected: all pass, including XT-119..122 and XT-188.
- `bun run typecheck && bun run lint && bun run graph:check && bun run scaffold:check && bun run workflows:check` -- expected: OK.
- `bun run harness` -- expected: `SUMMARY … differ=0`.
- `bun tools/ratchet/ratchet.ts scope --base . --head . --out /tmp/s.json && cat /tmp/s.json` -- expected: mode `none`.
- `bun run bench` -- expected: BENCH lines, `BENCH-SUMMARY ran=<n> errors=0`, exit 0.

## Auto Run Result

Status: done

**Summary.** The AD-28 pipeline is complete except for Epic 6's queue steps. Changes:
- `ratchet.yml` scopes each PR's Ratchet to the AD-2 reverse-dependency closure of what it changed (`ratchet.ts scope`, `run --scope`).
- `ratchet.yml` then runs the Story's `test_ids` in full (`ratchet.ts story`), and runs the full Ratchet in the merge queue.
- `ratchet` is a required check in the committed ruleset.
- `nightly.yml` runs the full Ratchet on linux and macOS, x64 and arm64 (native Homebrew Postgres 18 and Redis on macOS), plus a never-failing benchmark job (`tools/bench`).
- `oracle.yml`'s nightly `determinism` job runs the new `oracle:recheck`, which re-evaluates every committed request in the image and names each stale fixture.

**Files changed.**
- `tools/graph/graph.ts`: `reverseClosure`.
- `tools/ratchet/ratchet.ts`: `scope`, `run --scope`, `story`, the ` scope=` suffix.
- `tools/ruleset/ruleset.ts` and `.github/rulesets/main.json`: `ratchet` required.
- `.github/workflows/ratchet.yml`: the PR, merge-group and push flows.
- `.github/workflows/nightly.yml`: new; the matrix and bench.
- `.github/workflows/oracle.yml`: the recheck step.
- `.github/workflows/ci.yml`: the header, and `oracle-recheck.test.ts` added to `php-fixtures`.
- `tools/bench/*` and `conformance/bench/expectations.bench.ts`: the benchmark runner and the starter benchmark.
- `tools/oracle/recheck.ts`: the fixture recheck.
- `package.json` and `bun.lock`: the `bench` and `oracle:recheck` scripts, and the bench workspace.
- `conformance/tests/xaravel/ci-pipeline.test.ts` (XT-119..122) and `oracle-recheck.test.ts` (XT-188, including a real-PHP block).
- Additive `// Story 5.7` assertion edits in `ratchet.test.ts`, `repository-policy.test.ts` and `oracle.test.ts`.
- `conformance/escalations/ESC-5.7-1.md`: date-dependent Oracle fixtures, waiting on the Maintainer.
- Docs: `docs/ops/ci.md` (new), plus `ratchet.md`, `harness.md`, `oracle.md` and `identities.md`.
- `story-manifests.md`: XT-188 recorded.

**Review.** One pass with 40 findings:
- 17 patched entries, by verdict: 0 high, 9 medium, 8 low. Patches:
  - `decisions/` is graded.
  - A deleted Expectations dir gives `full`.
  - Ported Tests with no Expectations dir give `full`.
  - `node_modules` is skipped at any depth.
  - The scoped real-harness test now has a second Component.
  - Async benchmarks are awaited.
  - The nightly passes its own ref and prints the backend versions.
  - The job timeout is 60, matching the queue's check timeout.
  - The docs defer to ESC-5.7-1.
  - The merge-group grading is documented.
- 3 deferred items (in frontmatter).
- 20 rejected, with reasons in the triage log.

**Follow-up review recommended: true.** This pass patched several medium findings in `computeScope`'s path classifier. Unverified risk: the scope classifier gives a ratchet check that is soon to be required its pass/none verdict. The first PRs after merge run it live, with the base's copy. A second pass over the classifier's mapping (which paths count as no-effect, and the `full` fallbacks) is worthwhile.

**Verification (2026-10-19).**
- `bun install --frozen-lockfile --ignore-scripts`: no changes.
- `bun test`: 222 pass, 0 fail.
- `typecheck`, `lint`, `graph:check`, `scaffold:check`, `workflows:check`, `expectations:check`, `escalations:check` (23 escalations) and `ownership:check`: all OK.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`.
- `scope --base . --head .`: `none`.
- `bun run bench`: `BENCH-SUMMARY ran=2 errors=0`.
- The real-PHP `oracle-recheck.test.ts` block passed locally with `XARAVEL_PHP_FIXTURES=require`.

**Residual risks.**
- Nothing new in `ratchet.yml`, `nightly.yml` or the recheck step has run live. `pull_request_target` grades this PR with the base's workflow.
- `ratchet` is required only once the Maintainer runs `bun run ruleset:apply`.
- The first nightly recheck is expected to be red on 4 date-dependent `testWhereBetweens` fixtures (ESC-5.7-1, waiting on the Maintainer).
- The macOS legs use Homebrew's current Redis, not 8.10.2; the step prints the version.
