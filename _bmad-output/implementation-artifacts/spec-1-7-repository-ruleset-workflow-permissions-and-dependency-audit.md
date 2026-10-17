---
title: 'Story 1.7: Repository ruleset, workflow permissions and dependency audit'
type: 'feature'
created: '2026-10-17'
baseline_revision: '0da986da7bf805248fb17ead715cdbbd16de7a60'
status: 'blocked'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/stories/1.7.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `main` is guarded only by a hand-made "Protect main" ruleset: no required checks, no linear history, no merge queue, no Code Owner review. It has no committed definition and nothing detects drift. Workflow permissions, the agent push identity and `bun audit` are not checked at all (AD-16, AD-28, NFR-5).

**Approach:** Commit the rulesets as JSON under `.github/rulesets/`. Add `tools/ruleset/ruleset.ts`, with `verify` (committed vs live, plus the policy invariants), `apply` (committed → live), `identity` (the push restriction) and `merge-group-pr`. Add `tools/workflow-permissions/workflow-permissions.ts`, and a `ci.yml` with `audit` and `workflow-permissions` jobs. Teach the two required checks to run in the merge queue, document the identity setup in `docs/ops/identities.md`, then apply the rulesets live. XT-conformance-30..33 cover the four ACs.

## Boundaries & Constraints

**Always:**
- **`.github/rulesets/main.json`** ("Protect main", target branch, `~DEFAULT_BRANCH`, active) has these rules:
  - `deletion` and `non_fast_forward`;
  - `required_linear_history`;
  - `pull_request` with 0 approvals, `require_code_owner_review: true`, `dismiss_stale_reviews_on_push: true` and `allowed_merge_methods: ["squash"]`;
  - `required_status_checks` with `protected-paths`, `ownership` and `audit`, each pinned to GitHub Actions (`integration_id: 15368`), and a non-strict policy;
  - `merge_queue` with merge method SQUASH, grouping ALLGREEN, 5 entries to build, 5 to merge, minimum 1, a 5-minute wait and a 60-minute timeout.

  The only bypass actor is `OrganizationAdmin` (`always`).
- **`.github/rulesets/agent-push.json`** ("Agent pushes", target branch) includes `~ALL` and excludes `refs/heads/story/**`, `refs/heads/main` (guarded by main.json) and `refs/heads/gh-readonly-queue/**` (the merge queue's own branches). Its rules are `creation`, `update` and `deletion`. **`.github/rulesets/agent-tags.json`** ("Agent tags", target tag, `~ALL`) has the same three rules. Both have only the `OrganizationAdmin` bypass.
- **Normalisation.** Only `name`, `target`, `enforcement`, `conditions`, `rules` and `bypass_actors` are compared. Rules are sorted by `type`, required checks by `context`, ref patterns are sorted, and an `OrganizationAdmin` `actor_id` becomes null. Object keys compare order-free. Every rule parameter the live API returns must appear in the committed file.
- **`verify [--repo <o/r>] [--root <dir>]`** lists the live rulesets and matches committed files to them by `name`, then GETs each one in full. Each difference is one `ruleset drift: <file> <json-path>: committed <a>, live <b>` line, and a missing ruleset is `missing ruleset:`. It then checks `main.json`'s invariants (`policy:` lines):
  - `protected-paths` and `ownership` are required;
  - `required_linear_history` and `merge_queue` are present;
  - every bypass actor on every ruleset is `OrganizationAdmin`;
  - the org's admins (`GET /orgs/<org>/members?role=admin`) are exactly the Maintainer (`MAINTAINER` from protected-paths).
- **`apply`** creates (POST) or updates (PUT `/rulesets/<id>`) each committed ruleset, matched by name. Only the Maintainer or the orchestrator runs it, from an admin token. CI never runs it.
- **`identity [--agent <login>]`** reads the active rules from `GET /rules/branches/<ref>`. For `planning/probe`, `bot/probe` and `release/probe` it requires `creation` and `update`; for `main` it requires `pull_request`; for `story/probe` it requires neither `creation`, `update` nor `pull_request`. It also requires a live, active `Agent tags` ruleset. With `--agent`, the login's repo `role_name` must be `write` or `triage`, and the login must not be an org admin.
- **`merge-group-pr <ref>`** prints `<n>` for `refs/heads/gh-readonly-queue/<base>/pr-<n>-<sha>` and exits 1 otherwise.
- **`workflow-permissions check [--root]`** parses every `.github/workflows/*.y{a,}ml` with `Bun.YAML.parse`. Top-level `permissions` must be exactly `{contents: read}`. A job may hold a `write` scope, `write-all` or `id-token: write` only when its id is in `ALLOWED_WRITE_JOBS` (`oracle`, `dashboard`, `release`). Violations are `workflow permissions: <file> …` lines.
- The tools share one convention: exit 0 pass, 1 violations or any failure (fail closed), 2 usage. Violations go to stderr, one per line, ending `(AD-16)`. API base `GITHUB_API_URL`, token `GH_TOKEN`. Only Bun and Node builtins. Tests are hermetic (a `Bun.serve` fake on port 0, temp roots).
- **Workflows.**
  - `protected-paths.yml` and `ownership.yml` also run on `merge_group`. There they check out `merge_group.base_sha`, take the PR number from `merge-group-pr` on the base checkout, and run the same `pr` command. Job names stay `protected-paths` / `ownership`.
  - `ci.yml` (`pull_request`, `merge_group`, push to main; top-level `contents: read`) has two jobs. `audit` runs `bun install --frozen-lockfile --ignore-scripts`, then `bun audit --audit-level=high`. `workflow-permissions` runs the check.
  - Actions are pinned as in the existing workflows, and values reach the shell only through `env`.
- `docs/ops/identities.md` covers the Maintainer's one-time setup: a separate agent account with `write` role and no admin rights, an SSH key or fine-grained token, and `bun run ruleset:apply`. It also covers how to check it (`bun run ruleset:identity --agent <login>`).

**Never:**
- Never put a bypass actor other than `OrganizationAdmin` in a committed ruleset. Never let CI hold an admin token.
- Never edit `conformance/protected-paths`, `tools/protected-paths/`, `tools/ownership/` (code), `AGENTS.md` or `stories/`.
- Leave out the release workflow and its version check (Story 1.8), `ratchet` (Epic 5) and the Epic 5 CI pipeline.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rulesets match | live = committed, order and actor_id differ | exit 0 | — |
| Drift | live lacks `merge_queue`, or a check differs | `ruleset drift` names the path | exit 1 |
| Missing | no live "Agent pushes" | `missing ruleset` | exit 1 |
| Extra bypass | live adds a `Team` bypass | drift and `policy` | exit 1 |
| Second admin | org admins `[edanisko, eve]` | `policy` | exit 1 |
| Committed lacks a required check | `ownership` removed | `policy` | exit 1 |
| API 500 / 401 | any GET fails | failure line | exit 1 |
| Identity ok | rules per ref as specified | exit 0 | — |
| story ref restricted | `story/probe` has `update` | violation | exit 1 |
| planning ref open | no `creation` on `planning/probe` | violation | exit 1 |
| Agent is admin | `--agent bot` with role `admin` | violation | exit 1 |
| Merge-group ref | `refs/heads/gh-readonly-queue/main/pr-12-<40 hex>` | `12` | other refs exit 1 |
| Workflow top-level wrong | `permissions: write-all`, missing, or extra `issues: read` | violation | exit 1 |
| Job write not allowed | job `build` with `contents: write` | violation | exit 1 |
| Allowed job | job `release` with `id-token: write` | pass | — |

</intent-contract>

## Code Map

- `tools/protected-paths/protected-paths.ts:31` -- `MAINTAINER` ("@edanisko") to import. `GitHub` (line 349) is repo-scoped and GET-only, so the ruleset tool needs its own small client (GET/POST/PUT, absolute paths for `/orgs/...`). Its error-handling and `main(argv)` pattern (line 446) is the model to copy.
- `tools/escalations/escalations.ts` -- the latest tool in the same style (`UsageError`, `parseOptions`, `report`, `import.meta.main`). Copy it.
- `conformance/tests/xaravel/escalations.test.ts:75-140` -- `runCli` (`Bun.spawn` with a stripped env), plus a `Bun.serve` fake API that checks `Bearer test-token`. Copy both.
- `.github/workflows/protected-paths.yml`, `ownership.yml` -- the `pull_request_target` jobs that get `merge_group`. `ownership` has `if: github.event_name == 'pull_request_target'`. The `manifests` job also runs on push.
- Live state (2026-10-17): ruleset 25223480 "Protect main" has deletion, non_fast_forward and pull_request (0 approvals, no code owners, every merge method), with an OrganizationAdmin bypass (`actor_id: null`). edanisko is the only org member and admin. Default workflow permissions are `read`. `bun audit` works from `package.json` + `bun.lock` alone.
- `package.json` scripts and `tsconfig.json` `include` -- add `ruleset:verify`, `ruleset:apply`, `ruleset:identity`, `workflows:check`, plus the two tool globs.

## Tasks & Acceptance

**Execution:**
- `.github/rulesets/{main,agent-push,agent-tags}.json` -- the definitions above.
- `tools/ruleset/ruleset.ts` -- exports `normalize`, `diffRulesets`, `policyViolations(main, rulesets, admins)`, `identityViolations(rulesByRef, tagsRuleset, agent?)`, `prFromMergeGroupRef`, and the CLI (`verify`, `apply`, `identity`, `merge-group-pr`).
- `tools/workflow-permissions/workflow-permissions.ts` -- exports `ALLOWED_WRITE_JOBS`, `checkWorkflow(file, text)`, `checkWorkflows(root)`, and the CLI.
- `.github/workflows/ci.yml` (new), `protected-paths.yml`, `ownership.yml` -- as specified.
- `docs/ops/identities.md` -- the setup and how to check it.
- `package.json`, `tsconfig.json` -- scripts and includes.
- `conformance/tests/xaravel/repository-policy.test.ts`:
  - XT-30: normalise/diff rows, the committed main.json invariants, `verify` against the fake API (match, drift, missing, extra bypass, second admin, 500), and `merge-group-pr` rows.
  - XT-31: workflow rows on fixture roots, plus the check passing on the repo root.
  - XT-32: `identity` against the fake (ok, story restricted, planning open, admin agent), agent-push.json excluding exactly the three patterns, and identities.md naming the command.
  - XT-33: `ci.yml`'s `audit` job runs on `pull_request` and `merge_group` and runs `bun audit --audit-level=high`, and main.json requires `audit`.
- Live: `bun run ruleset:apply`, then fold any extra live rule parameters into the JSON, and finally `bun run ruleset:verify` and `bun run ruleset:identity` (MAINT-2026-10-16 approves this as an Epic 1 Infrastructure Story).

**Acceptance Criteria:**
- Given `.github/rulesets/main.json`, when `bun run ruleset:verify` runs, then it matches the live ruleset: `protected-paths` and `ownership` are required, history is linear, the Maintainer is the only bypass, and the merge queue is required. Otherwise it exits 1 naming the difference (XT-conformance-30).
- Given every workflow, when the permissions check runs, then top-level permissions are `contents: read`, and write scopes appear only in `oracle` / `dashboard` / `release` jobs (XT-conformance-31).
- Given the agent push identity, when it pushes outside `story/*`, then live rules reject it, and `bun run ruleset:identity` verifies this. The setup is documented in `docs/ops/identities.md` (XT-conformance-32).
- Given any PR, when checks run, then `audit` runs `bun audit` and fails on high or critical advisories. It is a required check (XT-conformance-33).

## Spec Change Log

## Review Triage Log

## Design Notes

**Merge queue vs `pull_request_target`.** A required check has to report on the merge group, or the queue stalls. Re-running the same `pr` command for the PR named in the queue ref keeps the guarantee (the same files, and the same Maintainer review on the same head commit) without running PR code. The workflow file itself is the merge group's copy, and that file is a Protected Path, so changing it already needs the Maintainer's review.

**Why the agent restriction is a ruleset.** GitHub can't scope a user's push rights by ref, but a ruleset with a bypass list can. Any identity that isn't an org admin can only create, update or delete `story/*` refs. `main` is excluded here because the main ruleset already allows changes to it only through a PR.

## Verification

**Commands:**
- `bun test` -- expected: XT-conformance-1..33 pass
- `bun run workflows:check`, `bun run ruleset:verify`, `bun run ruleset:identity` -- expected: exit 0 (the last two against live GitHub)
- `bun run typecheck` / `bun run lint` / `bun run graph:check` / `bun run scaffold:check` / `bun run ownership:check` / `bun run escalations:check` / `bun tools/protected-paths/protected-paths.ts codeowners --check` -- expected: exit 0

## Auto Run Result

Status: blocked
Blocking condition: permission denied: live ruleset apply (`bun run ruleset:apply`, POST/PUT `repos/xaravel/framework/rulesets`). The auto-mode permission classifier also denied the read-only `bun run ruleset:identity`. AC 1 (`ruleset:verify` matches live) and AC 3 (live rules reject agent pushes) need the live rulesets, so the Story can't reach `done`. Review (step 4) did not run.

**State of the work.** The implementation is complete locally and is preserved, unmerged and unreviewed, on branch `story/1.7` (no PR):
- `.github/rulesets/{main,agent-push,agent-tags}.json`;
- `tools/ruleset/ruleset.ts` (`verify`, `apply`, `identity`, `merge-group-pr`) and `tools/workflow-permissions/workflow-permissions.ts`;
- `.github/workflows/ci.yml` (`audit`, `workflow-permissions`), plus `merge_group` support in `protected-paths.yml` and `ownership.yml`;
- `docs/ops/identities.md`;
- `conformance/tests/xaravel/repository-policy.test.ts` (XT-conformance-30..33).

The branch also updates the workflow-layout assertions in XT-conformance-20 (`protected-paths.test.ts`) and XT-24 (`ownership.test.ts`) for the `merge_group` trigger. They still assert that only the base commit is checked out and that nothing is installed. The Maintainer should confirm these changes don't weaken the grader.

**Local verification on that branch:**
- `bun test`: 33 pass, 0 fail.
- `typecheck`, `lint` and `workflows:check`: exit 0.
- The one live `ruleset:verify` run, before the apply was denied, exited 1. It reported `Agent pushes` and `Agent tags` as missing, and `merge_queue`, `required_linear_history` and `required_status_checks` as missing from "Protect main".

**To unblock (Maintainer):**
1. Run `GH_TOKEN="$(gh auth token)" bun run ruleset:apply` from `story/1.7`.
2. Run `ruleset:verify` and fold any extra live rule parameters into the JSON.
3. Run `ruleset:identity`.

Alternatively, allow the orchestrator to run `ruleset:apply`. The orchestrator then resumes the Story. Its PR must merge with `--admin`, because its own merge group would run `merge-group-pr` from a base commit that doesn't have `tools/ruleset/` yet.
