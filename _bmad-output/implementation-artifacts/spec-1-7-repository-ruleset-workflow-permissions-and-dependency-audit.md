---
title: 'Story 1.7: Repository ruleset, workflow permissions and dependency audit'
type: 'feature'
created: '2026-10-17'
baseline_revision: '41da75aa4fcaebeafc4f40f64e9d4e110a13b207'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/stories/1.7.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Make `workflow-permissions` and `escalations` required checks (with `merge_group` support for `escalations`).
    evidence: |-
      Neither is in main.json required_status_checks, so a write-scoped workflow or an Escalation-record violation can merge with that check red. The spec deliberately lists three required checks; adding more is a ruleset-policy decision for the Maintainer.
    location: >-
      .github/rulesets/main.json; tools/ruleset/ruleset.ts REQUIRED_CHECKS
    severity: medium
  - summary: >-
      `verify` checks org admins only, not repository-level admin collaborators.
    evidence: |-
      A collaborator with the repo Admin role can edit or disable rulesets while `verify` reports the policy holds. The intent's invariant is org admins.
    location: >-
      tools/ruleset/ruleset.ts verify
    severity: medium
  - summary: >-
      `gh-readonly-queue/**` is excluded from "Agent pushes" and never probed by `identity`.
    evidence: |-
      The intent requires the exclusion for the merge queue's own branches. Whether a write-role account can push there needs a live test with the agent account.
    location: >-
      .github/rulesets/agent-push.json; tools/ruleset/ruleset.ts CLOSED_PROBES
    severity: medium (unverified)
  - summary: >-
      Agent identity model vs current operation: no separate agent account exists, the orchestrator runs as the Maintainer (an org admin), and "Agent pushes" would make `planning/*` unpushable for a future agent account, contrary to the AGENTS.md `planning/<topic>` convention.
    evidence: |-
      AC 3 is satisfied by the rules and `identity` without `--agent`, but never with a real agent login. Resolving the planning-branch conflict needs an AGENTS.md/AD-16 decision.
    location: >-
      docs/ops/identities.md; .github/rulesets/agent-push.json; AGENTS.md
    severity: medium
  - summary: >-
      No automatic drift detection: `ruleset:verify` runs only by hand.
    evidence: |-
      A scheduled read-only verify needs a token that can read the org's admin members; Maintainer decision.
    location: >-
      .github/workflows/
    severity: low
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

### 2026-10-17 — Review pass
Run by the Maintainer's session after the live apply, resuming this spec at step 4 (the orchestrator's run stopped before review). Live state at review time: `ruleset:verify` → "Rulesets OK", `ruleset:identity` → "Identity OK".
- verdicts: 50 findings — high 7, medium 16, low 16, false 9, maybe-false 2
- findings:
  - Verification Gap
    - `[high]` `[patch]` `apply` (POST/PUT, duplicate-name guard, request body) is never executed; the test fake returns 405 for non-GET. — apply cases added to XT-30 (fake records writes).
    - `[medium]` `[patch]` "Find the PR" step only text-matched (`toContain`), never run; an inverted condition or a wrong output key would stall both required checks. — exact `toBe` plus a bash execution case for both events in XT-20/XT-24.
    - `[medium]` `[defer]` `workflow-permissions` is not a required check, so AC 2 does not gate merges. — Maintainer ruleset-policy decision; the spec lists three required checks.
    - `[false]` `[reject]` Other: XT-20/XT-24 edits weaken the grader. — Checked: the checkout `ref` is pinned by exact `toEqual`, and the forbidden-pattern regex gained `merge_group.head_sha`; not weakened.
  - Edge Case Hunter
    - `[low]` `[defer]` Merge group base predates `tools/ruleset/`, so this PR can't pass the queue. — Real for this one PR; merged by org-admin bypass. Documented in `identities.md` (patched below).
    - `[medium]` `[patch]` Header comment claims a PR cannot change its own check, false under `merge_group`. — Comment corrected in both workflows.
    - `[maybe-false]` `[defer]` `gh-readonly-queue/**` excluded from Agent pushes and never probed. — The intent requires the exclusion; whether GitHub lets a write-role account push there needs a live test with the agent account (medium, unverified).
    - `[medium]` `[patch]` Agent tags `exclude` not checked by `identity`. — Violation added for a non-empty `exclude`, with a test.
    - `[high]` `[patch]` `policy` does not require main `enforcement: active`, `pull_request`, `non_fast_forward`, `deletion`. — policy lines added, with tests.
    - `[high]` `[patch]` `policy` does not enforce `integration_id: 15368` on required checks. — policy line added, with tests.
    - `[false]` `[reject]` Concealed org admins hidden from `members?role=admin`. — The documented token is an org admin's, which sees concealed members.
    - `[medium]` `[defer]` Repository-level admin collaborators are not checked. — Beyond the intent's org-admin invariant; Maintainer policy.
    - `[medium]` `[patch]` Duplicate committed ruleset names: last file silently wins on apply. — `readCommitted` throws, with a test.
    - `[low]` `[reject]` `apply` partial failure not itemised. — Unlikely; `verify` after apply already shows the state; fix adds complexity.
    - `[low]` `[reject]` `story/probe` deletion/non_fast_forward not checked. — The intent fixes the rule types checked for `story/probe`.
    - `[medium]` `[patch]` `checkWorkflows` passes with no workflows dir (fails open). — Now a violation, with a test.
    - `[low]` `[reject]` Allow-list keyed by job id regardless of file. — The intent defines `ALLOWED_WRITE_JOBS` by job id.
    - `[low]` `[reject]` `fetch` has no timeout. — Unlikely; adds a guard.
    - `[low]` `[reject]` `ci.yml` `pull_request` lacks `edited`. — Re-targeting is rare; a new push re-runs it.
    - `[false]` `[reject]` sprint-status blocker note removed. — The live apply has now happened; status is finalised to `done`.
    - `[false]` `[reject]` Spec `in-review` while live task undone. — Live apply, verify and identity ran before this review.
    - `[maybe-false]` `[defer]` AC 3: agent can push outside `story/*` via `gh-readonly-queue/**`. — Same root as the gh-readonly-queue row; grouped.
    - `[medium]` `[defer]` AC 1: only `OrganizationAdmin` checked; repo admins not. — Same root as the repo-admin row; grouped.
    - `[low]` `[patch]` merge_group trust rests on the pull_request_target gate (claim). — Same root as the header-comment row; grouped.
  - Blind Hunter
    - `[high]` `[patch]` `integration_id` pinning not enforced by policy. — Grouped with the Edge Case row; patched.
    - `[high]` `[patch]` main policy invariants too narrow. — Grouped with the Edge Case row; patched.
    - `[medium]` `[defer]` `workflow-permissions` not required and runs PR code. — Grouped with the Verification Gap defer row.
    - `[medium]` `[patch]` XT-33 doesn't assert no `continue-on-error`/`if`, or the triggers. — Assertions added.
    - `[medium]` `[patch]` XT-20/XT-24 `toContain` loosens the old exact match. — Grouped with the "Find the PR" row; exact match restored. Escalation not needed: the assertion now pins more than before, and the MAINT ruling approves Phase 0 Protected Path edits.
    - `[low]` `[reject]` Write-scope allow-list ignores the file. — Grouped with the Edge Case reject row.
    - `[medium]` `[patch]` Workflow check fails open when the dir is missing. — Grouped; patched.
    - `[high]` `[patch]` `apply` untested. — Grouped with the Verification Gap row; patched.
    - `[low]` `[reject]` identity: closed probes don't require `deletion`; `verify` doesn't report extra live rulesets. — The intent fixes the checked rule types and matching by committed name.
    - `[medium]` `[defer]` Agent push restriction vs the AGENTS.md `planning/<topic>` convention. — Needs an AGENTS.md/AD-16 decision (Maintainer); moot while the orchestrator runs as the Maintainer.
    - `[medium]` `[defer]` Orchestrator holding an admin token contradicts the identity model. — Maintainer's standing choice (MAINT-2026-10-16); revisit when an agent account exists.
    - `[low]` `[defer]` No automatic drift detection. — A scheduled `verify` needs a token that can read org admins; Maintainer decision.
    - `[low]` `[patch]` Merge-queue bootstrap not documented. — Bootstrapping note added to `identities.md`.
    - `[low]` `[defer]` `escalations` check not required and has no `merge_group`. — Maintainer ruleset-policy decision, with the workflow-permissions row.
    - `[false]` `[reject]` Status records disagree. — Finalised to `done` everywhere after the live apply.
    - `[low]` `[patch]` `identities.md`: "none of the three" wording; `--agent` token scope. — Fixed. The `triage` role and missing tag-push manual test are rejected: the intent allows `write` or `triage`.
    - `[false]` `[reject]` `require_extra_approval_for_unattributed_changes` uncommitted/unexplained. — The live API returns it (it was on the original "Protect main"), so normalisation requires it in the committed file; `verify` passes live.
  - Intent Alignment
    - `[false]` `[reject]` AC 1 tested only against a synthetic live. — Live `verify` passed at review time.
    - `[medium]` `[defer]` AC 3 never exercised with a real agent account. — No agent account yet, by Maintainer choice; `identity` without `--agent` passes live.
    - `[high]` `[patch]` `apply` has no tested surface. — Grouped with the Verification Gap row.
    - `[low]` `[reject]` AC 4 failure on an advisory is left to `bun audit`. — The check is configured as specified; simulating an advisory adds a fixture registry for little gain.
    - `[low]` `[defer]` Live enforcement ahead of `main`'s workflows (applied before merge). — Window closes when this PR merges by admin bypass; documented.
    - `[false]` `[reject]` Grader edits in XT-20/XT-24. — They follow the intended workflow change and pin more than before.
    - `[low]` `[reject]` CLI header line and indentation vs "one line per violation". — Cosmetic; matches the other tools' output.
    - `[medium]` `[patch]` `workflow-permissions` exits 0 with no workflows dir. — Grouped; patched.
    - `[false]` `[reject]` `manifests` skipped on `merge_group`. — Intended: no PR checkout in the queue, and the manifest check already ran on the PR.

## Design Notes

**Merge queue vs `pull_request_target`.** A required check has to report on the merge group, or the queue stalls. Re-running the same `pr` command for the PR named in the queue ref keeps the guarantee (the same files, and the same Maintainer review on the same head commit) without running PR code. The workflow file itself is the merge group's copy, and that file is a Protected Path, so changing it already needs the Maintainer's review.

**Why the agent restriction is a ruleset.** GitHub can't scope a user's push rights by ref, but a ruleset with a bypass list can. Any identity that isn't an org admin can only create, update or delete `story/*` refs. `main` is excluded here because the main ruleset already allows changes to it only through a PR.

## Verification

**Commands:**
- `bun test` -- expected: XT-conformance-1..33 pass
- `bun run workflows:check`, `bun run ruleset:verify`, `bun run ruleset:identity` -- expected: exit 0 (the last two against live GitHub)
- `bun run typecheck` / `bun run lint` / `bun run graph:check` / `bun run scaffold:check` / `bun run ownership:check` / `bun run escalations:check` / `bun tools/protected-paths/protected-paths.ts codeowners --check` -- expected: exit 0

## Auto Run Result

Status: done

**History.** The orchestrator's first run (2026-10-17, 00:48) implemented the Story but halted `blocked` before review: auto mode denied the live `ruleset:apply`. The Maintainer applied the rulesets from this branch ("Created Agent pushes, Created Agent tags, Updated Protect main"). The branch was rebased onto `main` at `41da75a`, and step 4 (review) was resumed from the Maintainer's session.

**Summary.** `main` is now guarded by a committed, verified "Protect main" ruleset: required `protected-paths`, `ownership` and `audit` checks pinned to GitHub Actions, linear history, squash-only PRs with Code Owner review, and the merge queue. "Agent pushes" and "Agent tags" restrict non-admin identities to `story/*` branches and no tags. `ruleset.ts` gives `verify`, `apply`, `identity` and `merge-group-pr`. `workflow-permissions.ts` and `ci.yml` (`audit`, `workflow-permissions`) cover AC 2 and AC 4.

**Files changed**
- `.github/rulesets/{main,agent-push,agent-tags}.json` — the three committed rulesets.
- `tools/ruleset/ruleset.ts` — verify/apply/identity/merge-group-pr; policy invariants; apply matches all names before writing.
- `tools/workflow-permissions/workflow-permissions.ts` — top-level `contents: read`, job write scopes only in the allow-list; fails closed without a workflows dir.
- `.github/workflows/ci.yml` — `audit` and `workflow-permissions` jobs.
- `.github/workflows/{protected-paths,ownership}.yml` — `merge_group` support; header comments say where queue-time trust comes from.
- `docs/ops/identities.md` — agent identity setup, apply, checks, bootstrapping.
- `conformance/tests/xaravel/repository-policy.test.ts` — XT-conformance-30..33, including apply against a write-recording fake.
- `conformance/tests/xaravel/{protected-paths,ownership}.test.ts` — XT-20/XT-24 updated for `merge_group`, with the "Find the PR" step pinned exactly and executed.
- `package.json`, `tsconfig.json` — scripts and includes.

**Review findings.** 50 findings (high 7, medium 16, low 16, false 9, maybe-false 2). Patched: the policy invariants (`integration_id`, `enforcement`, `pull_request`/`non_fast_forward`/`deletion`, code-owner review), duplicate committed names, the Agent tags `exclude`, the fail-open workflows dir, untested `apply`, the text-only "Find the PR" step, XT-33's audit assertions, the workflow trust comments and `identities.md`. Deferred (frontmatter `deferred`): extra required checks, repo-level admins, `gh-readonly-queue/**`, the agent identity model, automatic drift detection. Every rejected finding and its reason is in the Review Triage Log.

**Follow-up review: recommended.** This pass patched high entries (policy invariants, `integration_id`, `apply`). Patched counts: high 7, medium 9, low 4. The unverified risk is the new `policyViolations` and `apply` code itself, which no review layer has read.

**Verification**
- `bun test`: 33 pass, 0 fail (4734 assertions, 7 files).
- `typecheck`, `lint`, `workflows:check`, `graph:check`, `scaffold:check`, `ownership:check`, `escalations:check`, `protected-paths codeowners --check`: all exit 0.
- Live, against `xaravel/framework`: `ruleset:verify` → "Rulesets OK: 3 committed ruleset(s) match xaravel/framework; policy holds." `ruleset:identity` → "Identity OK: only story/* is open to non-admin identities on xaravel/framework."

**Residual risks**
- AC 3 is verified by the live rules and `identity` without `--agent`; no separate agent account exists yet (Maintainer choice), so the push rejection has not been tried with a real agent login.
- Live enforcement is ahead of `main` until this PR merges: `main`'s workflows lack `merge_group` and `ci.yml`, so open PRs need the org-admin bypass. This PR is merged that way, by design.
- The orchestrator runs as the Maintainer, an org admin, so it bypasses every ruleset; the MAINT ruling and its amendments govern when it may.
