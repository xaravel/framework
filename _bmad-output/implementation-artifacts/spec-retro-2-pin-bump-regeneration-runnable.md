---
title: 'Retro epic 2 item 2: the pin-bump regeneration path runs as printed'
type: 'bugfix'
created: '2026-10-17'
status: 'done'
baseline_revision: 'd10bc4b070a6d1988b15827ae2f9ba31b6df9d7d'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/ops/oracle.md'
  - '{project-root}/docs/ops/upstream.md'
warnings: []
deferred:
  - summary: >-
      The .github/workflows/oracle.yml header comment still says the image hash covers only the locks, the Dockerfile and its dockerignore.
    evidence: |-
      imageHash now also hashes the XARAVEL_ROOT_VERSIONS build argument, so an ai, mcp or boost tag move changes the tag. This spec's Never list keeps oracle.yml unchanged; update the comment with the next change to that workflow.
    location: >-
      .github/workflows/oracle.yml:10-11
    severity: low
---

<intent-contract>

## Intent

**Problem:** After `pin:bump <tag>` moves the framework Pin, the printed regeneration path cannot run (Epic 2 retro R2, action item `epic-2-retro-item-2-pin-bump-regeneration-runnable`). The Dockerfile's hard-coded `for pair in framework:13.37.0 …` list still names the old tag, so `oracle:check`/`oracle:build` fail. `REGENERATION_STEPS` prints `bun run oracle:build` without its image argument and a bare `bun run baseline`, a usage error; the real baseline runs only in CI. Diff mode's default `--from HEAD` also fails once the regenerated Inventory is committed. The docs do not say that the test `hash` misses `setUp`/helper edits (R8) or that a Pin move keeps carried-over `assertions`/`oracle` until the baseline merge (S6).

**Approach:** Derive the Dockerfile's root-version list from `conformance/baseline-pin`. `oracle:build` passes it as the build argument `XARAVEL_ROOT_VERSIONS`, the Dockerfile loops over that argument and fails when it is empty, and `imageHash` hashes the value. Replace `REGENERATION_STEPS` with exact commands that run in one POSIX shell from the repository root. The baseline step dispatches `baseline.yml` and downloads its `inventory` artifact, and the final step passes the pre-move revision with `--from`. A test runs the printed steps against the tools, and the docs state the hash scope and the carry-over guard.

## Boundaries & Constraints

**Always:** `oracle:tag` and `oracle:check` stay offline and never call docker. `checkDockerfile` still rejects undigested bases and `composer update`, and now requires `ARG XARAVEL_ROOT_VERSIONS` with no default and the loop `for pair in $XARAVEL_ROOT_VERSIONS;`. Any literal `<name>:<version>` list in the loop is a problem. The printed steps contain no placeholder: the tag and the pre-move revision (the full 40-hex SHA from `git rev-parse HEAD`) are substituted.

**Never:** No change to the locks, `baseline.yml`, `oracle.yml`, `inventory.yml`, `conformance/protected-paths`, the ai/mcp/boost Pin lines, or the token handling in the Dockerfile. pin-bump still never runs `oracle:*`, `inventory` or `baseline` itself. Existing assertions are not removed. The two whose expected strings encode the old behaviour (the loop message and the printed steps) are replaced with exact new values.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pin moved | Fixture with the real Dockerfile; `pin:bump v1.1.0` moves the framework line | Dockerfile byte-identical; `checkDockerfile` passes; `rootVersions` is `framework:1.1.0 ai:1.2.3 mcp:1.0.2 boost:2.10.3` | No error expected |
| Literal list | Dockerfile loop `for pair in framework:13.37.0 …;` | `oracle:check` exit 1 naming the required `for pair in $XARAVEL_ROOT_VERSIONS;` | exit 1 |
| Missing ARG | Dockerfile without `ARG XARAVEL_ROOT_VERSIONS` | `oracle:check` exit 1 naming the ARG | exit 1 |
| Build | `oracle:build <image>` | both docker builds carry `--build-arg XARAVEL_ROOT_VERSIONS=<rootVersions>` | No error expected |
| Ai tag change | only the ai Pin tag differs | `imageTag` differs | No error expected |
| Printed steps | move mode stdout | `sh -n` accepts them; every `bun run <script>` exists in package.json and its CLI accepts the arguments (no usage error, exit ≠ 2) | test fails |

</intent-contract>

## Code Map

- `conformance/oracle/Dockerfile:90-104` -- install RUN with the literal `for pair in` list; add `ARG XARAVEL_ROOT_VERSIONS` before it and a `: "${XARAVEL_ROOT_VERSIONS:?…}"` guard.
- `tools/oracle/oracle.ts:446-477` -- `checkDockerfile`; the loop rule computes `expected` from `readPin`. Extract it as exported `rootVersions(root)`.
- `tools/oracle/oracle.ts:479-511` -- `imageHash`; add the build argument as one more framed input after the dockerignore: `build-arg XARAVEL_ROOT_VERSIONS\0<len>\0<value>`.
- `tools/oracle/oracle.ts:745-752` -- `dockerBuild(docker, root, args)`; add the `--build-arg`. Header comment :9-14 restates the rules.
- `tools/pin-bump/pin-bump.ts:55` -- `REGENERATION_STEPS`; `:506-519` `moveMode` prints them. The header comment :3-39 describes move mode.
- `tools/baseline/baseline.ts:660-665` -- `run`/`merge` usage; `.github/workflows/baseline.yml` has `workflow_dispatch` and the `merge` job uploads the `inventory` artifact before its committed-equals-output check.
- `conformance/tests/xaravel/oracle.test.ts:240-256,300-330,398-407,470-485` -- Dockerfile static checks, the hash recomputation (XT-conformance-42), the bad-Dockerfile message, and the build-args assertion.
- `conformance/tests/xaravel/pin-bump.test.ts:150-225` -- `moveFixture` and the printed-steps assertion at :224.
- `docs/ops/oracle.md:20,26,37`, `docs/ops/upstream.md:44`, `docs/ops/inventory.md` "The hash" and "Preservation".

## Tasks & Acceptance

**Execution:**
- `conformance/oracle/Dockerfile` -- add `ARG XARAVEL_ROOT_VERSIONS`, guard it as non-empty, and loop `for pair in $XARAVEL_ROOT_VERSIONS;`.
- `tools/oracle/oracle.ts` -- export `rootVersions`; update `checkDockerfile` (ARG line, loop form, no literal list), `imageHash` (hash the value) and `dockerBuild` (pass the argument); update the comments.
- `tools/pin-bump/pin-bump.ts` -- turn `REGENERATION_STEPS` into a function `regenerationSteps(tag, fromRev)` that returns the exact commands. Move mode captures `git rev-parse HEAD` before it writes and prints the commands. Update the header.
- `conformance/tests/xaravel/oracle.test.ts` -- update the hash recomputation, the bad-Dockerfile cases (literal list, missing ARG), and the build-args expectation; add the ai-tag-moves-tag case.
- `conformance/tests/xaravel/pin-bump.test.ts` -- copy the real Dockerfile and dockerignore into `moveFixture`, and assert the matrix's "Pin moved" row. Assert the exact printed steps, then check them: `sh -n`; each `bun run` script exists; each `bun run` step, run from the repository root with `--root <fixture>` appended and no docker or composer on PATH, does not exit 2 or print `Usage:`.
- `docs/ops/oracle.md`, `docs/ops/upstream.md`, `docs/ops/inventory.md` -- document the derivation and the exact regeneration commands, and add the R8 hash-scope consequence for pin bump plus the S6 carry-over guard (the `baseline.yml` merge-output check, not yet a required check, Epic 1 item 2).

**Acceptance Criteria:**
- Given the committed repository, when `bun run oracle:check` (with a synced snapshot) or `bun run oracle:tag` runs, then the check passes on the Dockerfile and the tag prints offline.
- Given move mode's output, when a Maintainer runs the printed lines in order, then no line is a usage error or names a placeholder.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 29 findings — high 0, medium 4, low 20, false 4, maybe-false 1
- findings:
  - `[medium]` `[patch]` (verification-gap) No test pins baseline.yml's `inventory` artifact name, its upload-before-check order or `workflow_dispatch`, which the printed download step depends on — added those assertions to XT-conformance-62, tied to the printed `--name`.
  - `[medium]` `[patch]` (verification-gap other) Lines have no `set -e`; a failed step 6 leaves `run` empty and step 7 still deletes `conformance/inventory` — the download now goes to a temp dir behind `test -n "$run"` and replaces the Inventory only on success.
  - `[low]` `[patch]` (verification-gap other) `gh run watch` without `--exit-status` hides a failed leg until after the `rm -rf` — same root cause and fix as the previous row.
  - `[medium]` `[patch]` (edge) Empty `run` still runs `rm -rf` — same fix as above.
  - `[low]` `[patch]` (edge) Failed leg: no artifact, Inventory wiped — same fix as above.
  - `[low]` `[patch]` (edge) Step 4's main guard or a failed push does not stop the dispatch — steps 4 and 5 merged into one `&&` chain behind the branch guard.
  - `[low]` `[patch]` (edge) Detached HEAD passes `test "" != main` — the merged chain also requires `test -n "$b"`.
  - `[low]` `[reject]` (edge) A re-run after a partial failure finds nothing to commit and skips the push — a recovery scenario; a guard adds a branch for a case the Maintainer sees and handles at the prompt.
  - `[low]` `[patch]` (edge) A failed `oracle:tag` inside `$(...)` builds `xaravel-oracle:` — the tag is now assigned first and chained with `&&`.
  - `[low]` `[reject]` (edge) An ARG before FROM or after the RUN passes `checkDockerfile` — the `:?` guard fails such a build loudly at its first run; a stage-position parser adds complexity for an edit nobody makes.
  - `[low]` `[patch]` (edge) A second `ARG XARAVEL_ROOT_VERSIONS=<literal>` slips past the no-default rule — any `ARG XARAVEL_ROOT_VERSIONS=` line is now a problem, with a test.
  - `[low]` `[patch]` (edge) Removing the `:?` guard is not detected — `checkDockerfile` now requires it, with a test.
  - `[low]` `[reject]` (edge) The gh/git lines are only syntax-checked — the `gh` flags used (`run list --workflow/--event/--commit/--json/--jq`, `run download --name/--dir`, `workflow run --ref`) were checked against `gh --help`; a recording fake would not validate flags either.
  - `[low]` `[reject]` (edge, claim) The AC "no line is a usage error" is only partly tested — same evidence as the previous row; the AC is judged on the printed text and the help-checked flags.
  - `[low]` `[patch]` (edge, claim) upstream.md says a failed leg only makes the download fail, while the Inventory was already deleted — true before the patch; the text now matches the temp-dir download.
  - `[medium]` `[patch]` (blind) `rm -rf` runs when the download cannot succeed — same fix as the verification-gap row.
  - `[low]` `[patch]` (blind) The main guard stops only its own line — same fix as the edge row.
  - `[low]` `[reject]` (blind) `sleep 15` lookup can race or pick an older dispatch — the run is matched by commit and event, and `test -n "$run"` now stops the chain when none is listed; a polling loop adds complexity for a rare delay the Maintainer sees.
  - `[low]` `[reject]` (blind) The test does not commit the moved Pin before the report step, so it never shows default `--from HEAD` failing — that failure is already covered by the diff-mode "--from HEAD already pins" assertions; the printed step passes `--from <pre-move sha>`, asserted exactly.
  - `[low]` `[reject]` (blind) Half the printed steps are never executed — duplicate of the edge row; same evidence.
  - `[low]` `[reject]` (blind) `checkDockerfile` does not check ARG placement or a duplicate defaulted ARG — the duplicate is patched above; placement rejected as above.
  - `[low]` `[defer]` (blind) `.github/workflows/oracle.yml` header still states the old hash scope — comment-only drift in a file this spec's Never list keeps unchanged; deferred to the next change to that workflow.
  - `[false]` `[reject]` (blind) The action item is not closed in sprint status — the orchestrator closes it with the sprint-status script after this build, outside the spec's diff.
  - `[low]` `[patch]` (blind) The printed chain stops before committing the baselined Inventory — added a commit-and-push line after the download.
  - `[low]` `[patch]` (blind) upstream.md "four steps" wording and Pest hooks/`uses()` in the Changed note disagree with inventory.md — the wording and the two docs are made consistent.
  - `[false]` `[reject]` (blind) `bun run --silent oracle:tag` may print a banner — checked: it prints only `v13.37.0-4f2b5b47300d`.
  - `[false]` `[reject]` (blind) Spec bookkeeping is stale — the status follows the workflow's steps; fixing it would edit this spec, which triage does not do.
  - `[maybe-false]` `[reject]` (intent) The tests exercise a weaker surface than "runs as printed": `--root` appended, gh lines syntax-only, real `docker build` left to CI — the spec's Verification names the CI `baseline`/`oracle` runs as the real-image proof; if those fail, it is low (caught before merge). Settled by the PR's CI.
  - `[false]` `[reject]` (intent) Scope widened (tag recipe, check output line, removed constant) — each follows from deriving the list (A1), which the intent names first.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/oracle.test.ts conformance/tests/xaravel/pin-bump.test.ts` -- expected: all pass.
- `bun test`, `bun run typecheck`, `bun run lint` -- expected: clean.
- `bun run oracle:tag` -- expected: one tag line, different from `v13.37.0-7a508f1c8287`.
- CI `baseline` and `oracle` workflows on the PR -- expected: the real image builds with the build argument.

## Auto Run Result

Status: done

**Summary:** The Dockerfile's root-version list now comes from `conformance/baseline-pin`. The Dockerfile declares `ARG XARAVEL_ROOT_VERSIONS` and guards it as non-empty. `oracle:build` passes `rootVersions(root)` as a build argument, and `imageHash` hashes it, which moves the tag to `v13.37.0-4f2b5b47300d`. `checkDockerfile` requires the bare ARG, the guard and the loop over the argument, and rejects any literal or defaulted list. A framework Pin move therefore needs no Dockerfile edit. Move mode now prints `regenerationSteps(tag, fromRev)`, exact chained commands for one shell: lock; build, tagged from `oracle:tag`; inventory; a branch-guarded commit, push and `baseline.yml` dispatch; watch the run; download the `inventory` artifact through a temp dir; commit and push the baselined Inventory; then `pin:bump <tag> --from <pre-move sha>`.

**Files changed:**
- `conformance/oracle/Dockerfile`: the ARG, the guard and the loop over the argument.
- `tools/oracle/oracle.ts`: `rootVersions` and `ROOT_VERSIONS_ARG`; new `checkDockerfile` rules; the build argument in `imageHash` and in both docker builds; and a line in `check` that prints the build argument.
- `tools/pin-bump/pin-bump.ts`: `regenerationSteps` replaces `REGENERATION_STEPS`, and move mode records the pre-move HEAD.
- `conformance/tests/xaravel/oracle.test.ts`: the hash recomputation; the literal, missing, defaulted and unguarded Dockerfile cases; the exact build arguments; and that an ai tag change moves the tag.
- `conformance/tests/xaravel/pin-bump.test.ts`: the move fixture includes the real Dockerfile and passes the Dockerfile check after the move. The test asserts the exact printed steps, runs them through `sh -n`, checks that every `bun run` script exists, and checks that each `bun run` step accepts its arguments. It also checks that `baseline.yml` has `workflow_dispatch` and uploads the `inventory` artifact before its committed-equals-output check.
- `docs/ops/oracle.md`, `docs/ops/upstream.md`, `docs/ops/inventory.md`: the derivation, the exact regeneration commands, the hash scope (R8) and the carry-over guard (S6).

**Review:** 29 findings: 4 medium, 20 low, 4 false, 1 maybe-false.
- **Patched:** 2 medium root causes.
  - The independent lines could delete the Inventory, or dispatch from `main`. The lines are now chained, and the download goes through a temp dir.
  - The `baseline.yml` artifact contract was untested. XT-conformance-62 now asserts it.
- **Patched, low:** a failed tag lookup inside `$(...)`; a detached HEAD; the missing commit of the baselined Inventory; a defaulted ARG and the missing guard in `checkDockerfile`; and the doc consistency.
- **Deferred, 1:** the stale `oracle.yml` header comment.
- **Rejected:** the rest, with reasons in the triage log.

**Follow-up review recommended:** true (2 medium entries patched). The unverified risk: the patched `gh`/`git` chain is only syntax-checked, and a real `docker build` with the space-separated `--build-arg` is proven only by the PR's CI `baseline`/`oracle` runs.

**Verification:**
- `bun test`: 69 pass, 0 fail.
- `bun run typecheck`: clean.
- `bun run lint`: clean.
- `bun run oracle:tag`: `v13.37.0-4f2b5b47300d`.
- `bun run oracle:check` (with a synced snapshot): passes, per the implementer.

**Residual risks:** The next `oracle.yml` push publishes a new tag. The `sleep 15` run lookup can miss a slow dispatch; `test -n "$run"` then stops the chain, and the Maintainer re-runs the line.
