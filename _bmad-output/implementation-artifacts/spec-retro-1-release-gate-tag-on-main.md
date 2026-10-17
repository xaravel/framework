---
title: 'Release gate refuses a tag whose commit is not on main (retro epic-1 item 7)'
type: 'bugfix'
created: '2026-10-17'
status: 'done'
baseline_revision: 'cfd4421028c71be2e249ad02397f43896836ed75'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `gate` decides from the tag name, the root version and the live `release` environment only (`tools/release/release.ts:598-612`, retro finding D7). A `v0.<n>.<p>` tag pushed on a commit that never merged to `main`, with a matching root version, would publish that commit's code once the Maintainer approves the run.

**Approach:** `gate` takes a new required `--sha <commit>` (the tagged commit; `release.yml` passes `${{ github.sha }}`). After the tag check passes and before the environment check, it asks the GitHub API `GET /repos/<repo>/compare/main...<sha>` and publishes only when the response `status` is `identical` or `behind` (the commit is reachable from `main`). Anything else refuses with `publish=false` and a one-line reason, exit 0, like every other refusal.

## Boundaries & Constraints

**Always:** Fail closed: no token, a fetch error, a non-2xx (404 included), non-JSON, a missing `status`, or `ahead` / `diverged` each give `publish=false` with a reason that names the commit and `main`. Use the same `GITHUB_API_URL` / `GH_TOKEN` / headers as `liveEnvironmentDecision`. Order of checks: tag, then `main`, then environment, so a bad tag still never reaches the API. `--sha` must be 40 lowercase hex characters; missing or malformed is a usage error (exit 2). Export a pure `mainDecision(sha, json)` beside `environmentDecision` for unit tests. Keep every existing reason text, exit code and the other commands unchanged. Update the header comment and `docs/ops/release.md` step 4 to state the new rule. XT-conformance-35/36 keep every existing case; the ok-path `hits` grows by the compare path, the pinned gate `run:` line gains `--sha "$SHA"`, and new cases cover the matrix.

**Never:** No local `git` call and no `fetch-depth` change (the API answer does not depend on the checkout). Do not change the `gate` job's permissions (compare needs only `contents: read`), the `release` job, the protected-paths, ownership or workflow-permissions tools, `AGENTS.md`, the spine, SPEC, PRD or `epics.md`. Do not read the default branch from the API; `main` is fixed (AD-16).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| On main | compare `status: identical` or `behind`, env protected | `publish=true` | — |
| Off main | `status: ahead` or `diverged` | `publish=false`, reason `commit <sha> is not on main (compare main...<sha>: <status>)…` | exit 0 |
| Unknown commit | compare HTTP 404 | `publish=false`, reason names HTTP 404 | exit 0 |
| API error | compare HTTP 500, non-JSON, no `status` | `publish=false` with reason | exit 0 |
| No token | `GH_TOKEN` unset | `publish=false`, `GH_TOKEN is not set` (main cannot be verified) | exit 0 |
| Bad tag | `v1.0.0` | refused before any API call | exit 0 |
| Usage | no `--sha`, or `--sha abc` | usage error | exit 2 |

</intent-contract>

## Code Map

- `tools/release/release.ts` -- header comment lines 11-18 (gate usage); `tagDecision` (204), `environmentDecision` (219), `liveEnvironmentDecision` (258, fetch pattern to reuse: headers, 404/!ok/JSON handling); `Options` / `parseOptions` (529-560, add `sha`); `gateCommand` (598-618); gate's allowed-argument list is passed to `parseOptions` from the command dispatch further down.
- `.github/workflows/release.yml` -- `gate` job step `decide` (lines 45-53): add `SHA: ${{ github.sha }}` to `env` and `--sha "$SHA"` to the command. Header comment lines 3-8.
- `conformance/tests/xaravel/release.test.ts` -- `runGate` fake server (97-135): add a compare route `/repos/xaravel/framework/compare/main...<sha>` with a configurable status/body, and pass a default 40-hex `--sha`; XT-35 ok path (269-275) `hits`; XT-35 pinned `run:` line (405-407); XT-36 refusal table (453-490) and usage errors (498-502).
- `docs/ops/release.md:31` -- step 4 describes what `gate` checks; line 12 the command synopsis.

## Tasks & Acceptance

**Execution:**
- `tools/release/release.ts` -- add `--sha`, `mainDecision`, a live compare fetch, and the check in `gateCommand` between tag and environment; update the header comment -- closes D7.
- `.github/workflows/release.yml` -- pass the tagged commit to `gate`.
- `conformance/tests/xaravel/release.test.ts` -- extend `runGate` and XT-35/36 with every matrix row; unit-test `mainDecision`.
- `docs/ops/release.md` -- state that `gate` refuses a tag whose commit is not on `main`.

**Acceptance Criteria:**
- Given a matching `v0.<n>.<p>` tag on a commit the API reports as `ahead` of `main`, when `gate` runs, then it writes `publish=false` and a reason naming the commit and `main`, and never queries the environment.
- Given the repository's `release.yml`, when XT-conformance-35 reads the `gate` step, then it passes `--sha` from `github.sha`.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 16 findings — high 0, medium 2, low 10, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` (edge) The compare path uses the bare name `main`; git-style resolution prefers a tag named `main` over the branch, so an unmerged commit could read identical/behind — the request path is now `compare/refs/heads/main...<sha>` (verified live against the GitHub API: identical for the tip, behind for an ancestor, diverged for squash-merged PR heads, 404 for an unknown commit); `COMPARE_PATH` in the tests pins it. Reason text unchanged.
  - `[low]` `[reject]` (edge) No fetch timeout — a hang fails closed (the `release` job needs `publish=true`) and the environment check has the same shape; unlikely, and the fix adds a new parameter to both calls.
  - `[low]` `[reject]` (edge) The publish=true reason gains the main clause, against "keep every existing reason text" — no consumer matches the success text (the workflow reads `publish=`); the only fix is editing this spec.
  - `[medium]` `[patch]` (verification-gap) The fail-closed branch when the compare `fetch` throws is untested — XT-36 now runs gate against a closed port and asserts exit 0, `publish=false` and the `failed (…), so commit <sha> cannot be verified to be on main` reason.
  - `[medium]` `[patch]` (blind) No test for the fetch-throws path — same root cause as the verification-gap row; same fix. 401/403 share the `!ok` branch already covered by HTTP 500.
  - `[low]` `[reject]` (blind) Fixtures pass `ahead_by` though `mainDecision` ignores it — GitHub never returns `behind` with commits ahead; fixture style only.
  - `[medium]` `[patch]` (blind) `main` is an unqualified ref — same root cause as the first edge row; same fix.
  - `[low]` `[patch]` (blind) No unit case for an unrecognised string status — added `{ status: "unknown" }` and `{ status: "Behind" }` refusals to XT-36.
  - `[low]` `[reject]` (blind) Publish reason text changed — same as the edge claim row; spec-only fix.
  - `[false]` `[reject]` (blind) The compare call pulls a large diff for an old ancestor — for `behind` the merge base is the tagged commit, so the head-side commits and files are empty; the response stays small.
  - `[low]` `[reject]` (blind) Docs do not explain recovery after a refusal — step 3 already says to tag the merge commit and the reason names the commit and `main`; doc nicety.
  - `[low]` `[reject]` (blind) The spec's Verification wording and Code Map line numbers — fix edits this build's spec.
  - `[low]` `[reject]` (blind) The 404 reason wording differs and its regex is loose — cosmetic; it still refuses and names the commit, `main` and HTTP 404.
  - `[low]` `[reject]` (blind) The release.yml assertion does not rule out a job-level `SHA` override — such an edit is itself a Protected Path change under review; the fix adds assertions for an unlikely edit.
  - `[false]` `[reject]` (intent) GitHub compare status is assumed equal to git ancestry and never checked against real history — checked live on 2026-10-17: origin/main tip → identical, `HEAD~3` → behind, squash-merged branch heads `story/1.7` and `planning/orchestrator-opus-token` → diverged, an unknown SHA → 404.
  - `[false]` `[reject]` (intent) Gate and release publishing the same commit rests on the release job's default checkout — `actions/checkout` with no `ref` checks out `github.sha`, the value gate is given; both read the same event context.

## Design Notes

Compare `main...<sha>` has base `main` and head `<sha>`: `behind` means `<sha>` is an ancestor of `main`, `identical` means it is `main`'s tip. `ahead` and `diverged` both mean it holds commits `main` lacks. The API answer is used instead of `git merge-base --is-ancestor` because `gate` checks out shallow and already calls the API with the token it has.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/release.test.ts` -- expected: all pass
- `bun test` -- expected: all pass
- `bun run typecheck` and `bun run lint` -- expected: clean
- `bun run release:check` / `bun run workflows:check` (whatever `package.json` names them) -- expected: exit 0

## Auto Run Result

Status: done

- **Change:** `gate` takes a required `--sha <commit>` (from `${{ github.sha }}` in `release.yml`). After the tag check, and before the environment check, it asks `GET /repos/<repo>/compare/refs/heads/main...<sha>`. It publishes only on `identical` or `behind`. `ahead`, `diverged`, any other status, a 404 or other non-2xx response, non-JSON, a fetch error, or no token all refuse with `publish=false` and a reason naming the commit and `main` (closes retro finding D7).
- **Files:**
  - `tools/release/release.ts` -- `MAIN_BRANCH`, `COMMIT_SHA`, `mainDecision`, `liveMainDecision`, shared `apiHeaders`, `--sha` parsing, the check order in `gateCommand`, header and usage text.
  - `.github/workflows/release.yml` -- the gate step passes `--sha "$SHA"` with `SHA: ${{ github.sha }}`; header comment.
  - `conformance/tests/xaravel/release.test.ts` -- fake compare route; XT-35/36 cover every matrix row, the fetch error, unknown statuses, check order via `hits`, `--sha` usage errors and the workflow wiring. No assertion removed; the unreadable-root case now passes `--sha` so it still reaches the root read.
  - `docs/ops/release.md` -- synopsis and step 4 state the rule.
- **Review:** 16 findings. Patched: 2 medium (qualified `refs/heads/main` path; fetch-error test), 1 low (unknown-status unit cases). Deferred: none. Rejected: 13, reasons in the triage log.
- **Follow-up review recommended:** false. Two medium entries were patched, but both are verified: the qualified path was checked against the live API, and the fetch-error case is a test that runs and passes. No specific risk is left unverified.
- **Verification:** `bun test` 38 pass, 0 fail. `bun run typecheck`, `bun run lint`, `bun run release:check` and `bun run workflows:check` all exit 0. Live compare probes on xaravel/framework behaved as the Design Notes state.
- **Residual risk:** reachability is checked once at gate time; `main` cannot lose commits under the ruleset, so a later re-check would not change the answer.

