---
title: 'Retro 5 item 11: judge the devcontainer job by the Ratchet verdict'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
baseline_revision: '4b50f93eee165cf1c2f5645d212a7e033f12d97c'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      The devcontainer job's pull_request paths omit tools/ratchet/**, conformance/harness/** and package.json, so a change there reaches the in-container run only on the next nightly.
    evidence: |-
      devcontainer.yml on.pull_request.paths lists only .devcontainer/**, tools/devcontainer/** and the workflow; XT-conformance-193 asserts that exact list. Pre-existing for the harness; the Ratchet dependency is new.
    location: >-
      .github/workflows/devcontainer.yml on.pull_request.paths
    severity: low
---

<intent-contract>

## Intent

**Problem:** `.github/workflows/devcontainer.yml`, step "Run the harness inside the container", exits with the raw `bun run harness` status (Epic 5 retro finding C4, action item `epic-5-retro-item-11-devcontainer-job-ratchet`). The harness exits 1 on every difference, including an unexpected pass that the Ratchet only warns about, so once `main` carries a warned unexpected pass the nightly devcontainer job and every `.devcontainer/**` PR go red over something no one may fix there.

**Approach:** Run the Ratchet inside the container instead of the bare harness: `bun run ratchet run --ref "$REF"`, full mode (no `--scope`), with `REF` the checked-out ref passed through step `env` exactly as `nightly.yml` does (`github.head_ref` on a PR, else `github.ref_name`). The job fails when the Ratchet exits non-zero; otherwise the merged output (the Ratchet writes the harness report to stderr) still goes to `bun run devcontainer:alpha`, which keeps failing an alpha Variant `NOT-RUN`. Update the workflow comment, `docs/ops/ci.md`, `docs/ops/devcontainer.md` and the workflow-shape XT to match.

## Boundaries & Constraints

**Always:** Keep a full run (no `--fast`, `--seed` or `--scope`). Keep the alpha gate as the last command and keep `pipefail` so the Ratchet's own exit survives `tee`. Pass the ref through `env` into a quoted shell variable, never by `${{ }}` interpolation inside `run`. The container still sets no `CI` (the Ratchet's alpha `NOT-RUN` failure is CI-only; `devcontainer:alpha` covers it). Keep every existing XT assertion's strength: replace the raw-harness command match with an equally exact Ratchet command match.

**Never:** Edit `packages/**`, `conformance/expectations/**`, `AGENTS.md`, the PRD, spine, SPEC or `epics.md`. Never change `tools/ratchet/ratchet.ts` or `tools/devcontainer/alpha.ts` behaviour. Never make the job required. `nightly.yml` already runs the Ratchet and `ci.yml`'s `harness --xaravel` grades Xaravel Tests, not Expectations, so neither changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Warned pass only | `main` has an unexpected pass owned by no open Story; all alpha Variants run | Ratchet prints `WARNING UNEXPECTED-PASS …`, exits 0; alpha gate passes; job green | No error |
| Real failure | a `FAIL`/`ERROR`/`MISSING` difference | Ratchet exits 1; step exits 1 before the alpha gate | job red, logs dumped |
| Alpha backend down | Postgres sidecar unreachable | Ratchet exits 0 (no `CI`); `devcontainer:alpha` finds `NOT-RUN [pgsql]`, exits 1 | job red |
| Precondition failure | harness prints no `SUMMARY` | Ratchet fails closed, exits 1 | job red |

</intent-contract>

## Code Map

- `.github/workflows/devcontainer.yml` -- step "Run the harness inside the container" (lines ~65-74) runs `bun run harness … || status=$?`, exits `$status`, then `devcontainer:alpha < $RUNNER_TEMP/harness.txt`; header comment lines 1-21 describe it.
- `.github/workflows/nightly.yml:87-90` -- the pattern to copy: `env: REF: ${{ github.ref_name }}` then `bun tools/ratchet/ratchet.ts run --root . --ref "$REF"`.
- `tools/ratchet/ratchet.ts` -- read-only. `runRatchet` (~line 197): harness report and diagnostics go to stderr (`err`), verdict lines and `RATCHET ref=… failures= passes= warnings=` to stdout; exit 0 unless failures+passes > 0 or no SUMMARY. Alpha `NOT-RUN` counts only with `CI=true`. `package.json` script `ratchet` = `bun tools/ratchet/ratchet.ts`.
- `tools/devcontainer/alpha.ts` -- read-only; matches `^NOT-RUN [<v>]` and `^SUMMARY `, which Ratchet verdict lines (`RATCHET`, `WARNING`, `UNEXPECTED-…`) never start with.
- `conformance/tests/xaravel/devcontainer.test.ts` -- XT-conformance-191 lines ~184-197 match the step's exact commands with `composeCommand(...)`; XT-conformance-194 checks doc topics (keep `bun run harness` in the doc's "Running the harness" section).
- `docs/ops/ci.md:40-46` -- devcontainer table row; `docs/ops/devcontainer.md:57-77` (local recipe), `:121` (CI section).

## Tasks & Acceptance

**Execution:**
- `.github/workflows/devcontainer.yml` -- add step `env: REF: ${{ github.head_ref || github.ref_name }}`; replace the harness command with `docker compose exec -T workspace bun run ratchet run --ref "$REF" 2>&1 | tee "$RUNNER_TEMP/harness.txt" || status=$?`, echo `ratchet exit`, keep the exit-on-non-zero block and the final alpha command; update the header comment to say the Ratchet judges the run (warned unexpected passes do not fail it) -- C4.
- `conformance/tests/xaravel/devcontainer.test.ts` -- in XT-conformance-191 match the new Ratchet command exactly, assert the step's `env.REF` is `${{ github.head_ref || github.ref_name }}`, assert no `bun run harness` command remains in the step, keep the exit block and last-line alpha assertions -- grader keeps equal strength. Also cover the matrix end to end in XT-conformance-191: run `runRatchet` (tools/ratchet/ratchet.ts) on a hermetic root with the injected `harness` option returning a report whose only difference is an `UNEXPECTED-PASS` owned by no open Story with every alpha Variant run, assert code 0 and a `WARNING` line, and assert `alphaNotRun` accepts the merged stderr+stdout text (err lines then out lines); then the same merged text with an alpha `NOT-RUN [pgsql]` line fails `alphaNotRun`. Failure and no-SUMMARY rows are already covered by `conformance/tests/xaravel/ratchet.test.ts` (lines ~186-206).
- `docs/ops/ci.md`, `docs/ops/devcontainer.md` -- describe the CI job as running `bun run ratchet run --ref <ref>` and failing on the Ratchet's verdict, not the raw harness exit; the local recipe may keep `bun run harness`.

**Acceptance Criteria:**
- Given `devcontainer.yml`, when its harness step is read, then it runs `bun run ratchet run --ref "$REF"` in the workspace with `REF` from step env, exits with the Ratchet's status when non-zero, and otherwise pipes the merged report to `bun run devcontainer:alpha` as its last command.
- Given the updated XT and docs, when `bun test conformance/tests/xaravel/devcontainer.test.ts` runs, then it passes.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 11, false 5, maybe-false 0
- findings:
  - `[low]` `[defer]` (blind) `pull_request.paths` omits `tools/ratchet/**`, `conformance/harness/**` and `package.json`, so a Ratchet change reaches this job only nightly — the harness was already outside the paths before this change; widening them changes XT-conformance-193's exact list, so deferred.
  - `[low]` `[patch]` (blind) `GITHUB_ACTIONS` is not forwarded into the container, so warned passes leave no `::warning::` annotation — added `-e GITHUB_ACTIONS=true` to the ratchet `exec` and the XT match (`ratchet.ts:228` is the only reader).
  - `[low]` `[patch]` (blind) "as nightly.yml passes it" is wrong (nightly passes only `ref_name`; a PR checks out the merge commit) — reworded in the header, ci.md and devcontainer.md.
  - `[low]` `[patch]` (blind) PR runs read ownership from the PR's own manifests and sprint status, unlike the overlaid `ratchet` job — documented in devcontainer.md; the job is advisory.
  - `[low]` `[patch]` (blind) the docs omit other fail-closed causes (unreadable manifests, exit with no counted difference, own-Story pass) — added one sentence.
  - `[low]` `[patch]` (blind) the local recipe gives no CI-equivalent command — added the `ratchet run` form with `-p`.
  - `[false]` `[reject]` (blind) the XT never checks an own-Story pass on a `story/<id>` ref — XT-conformance-115 in `ratchet.test.ts` runs `runRatchet` on `story/11.1` with an owning manifest and asserts exit 1.
  - `[low]` `[patch]` (blind) the XT merges output by hand and never asserts the report reaches `err`; `down` asserts only code 0 — added the `err` SUMMARY assertion and a no-`UNEXPECTED-FAILURE` assertion.
  - `[low]` `[reject]` (blind) the step and report file are still named "harness" — the step still runs the harness (through the Ratchet); renaming touches the XT's step lookup for cosmetic gain.
  - `[low]` `[patch]` (blind) ci.md table row has a broken double negative — rewritten.
  - `[low]` `[patch]` (edge) no `GITHUB_ACTIONS` forwarding — same root cause as the blind annotation finding; same patch.
  - `[low]` `[patch]` (edge) no overlay on PR runs — same as the blind ownership finding; documented.
  - `[low]` `[patch]` (edge) nightly parity claim is false — same as the blind wording finding; reworded.
  - `[false]` `[reject]` (verification-gap) no gaps found — nothing to act on.
  - `[false]` `[reject]` (intent) the diff passes the head ref where the action item's example says `--ref main` — the item offers the command as one option ("or …"); both readings stop warned passes failing the job (C4), and on a `story/*` ref the head ref matches the required `ratchet` job's own-Story rule (Design Notes). No bad outcome.
  - `[false]` `[reject]` (intent) tests check workflow text and the library, not a live run — the live job runs on this PR (it touches the workflow); recorded as residual risk, not a defect in the change.

## Design Notes

`--ref` is the checked-out ref, not a fixed `main`, so it matches `nightly.yml`: on a `story/<id>` PR an unexpected pass owned by that Story stays a failure, as it is in the required `ratchet` job; on `main`, the schedule and other branches every unexpected pass is a warning.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/devcontainer.test.ts` -- expected: all pass
- `bun run workflow-permissions` (or the repo's equivalent check) and `bunx oxlint` / `tsc` as the repo runs them -- expected: clean
- `bun run harness --xaravel` -- expected: no new differences

**Manual checks (if no CLI):**
- The live job runs only in CI (nightly or a `.devcontainer/**` PR); this PR touches the workflow, so its own `devcontainer` run is the live proof.

## Auto Run Result

Status: done

**Summary.** The devcontainer CI job now runs `bun run ratchet run --ref "$REF"` inside the container instead of the bare `bun run harness`, so a difference the Ratchet only warns about (an unexpected pass owned by no open Story, or by another Story) no longer turns the advisory job red (retro 5 finding C4, item 11). The merged output still feeds `bun run devcontainer:alpha`, which keeps failing an alpha `NOT-RUN`. `-e GITHUB_ACTIONS=true` makes warned passes visible as annotations.

**Files changed.**
- `.github/workflows/devcontainer.yml` -- Ratchet command with `REF` from step env (`github.head_ref || github.ref_name`), header comment.
- `conformance/tests/xaravel/devcontainer.test.ts` -- XT-conformance-191 matches the new command and env exactly, and runs `runRatchet` end to end on a warned-pass report and an alpha `NOT-RUN` report through `alphaNotRun`.
- `docs/ops/ci.md`, `docs/ops/devcontainer.md` -- describe the Ratchet verdict, the ref, fail-closed cases, the missing overlay and the local CI-equivalent command.

**Review.** 16 findings: 9 patched (all low), 1 deferred (low: PR trigger paths omit the Ratchet and harness), 5 false and 1 low rejected (step name cosmetic); see the Review Triage Log. Follow-up review: not recommended (no high or two medium patches).

**Verification.** `bun test conformance/tests/xaravel/devcontainer.test.ts conformance/tests/xaravel/ratchet.test.ts`: 10 pass, 0 fail. `bun run typecheck`, `bun run lint`: exit 0. `bun run workflows:check`: OK, 14 workflows. `bun run harness --xaravel`: exit 0, differ=0.

**Residual risk.** The in-container run is live-only; this PR touches the workflow, so its own `devcontainer` run is the first live proof.
