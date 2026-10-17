---
title: 'Story 1.4: Protected Paths and the protected-paths check'
type: 'feature'
created: '2026-10-16'
status: 'done'
baseline_revision: 'df4de847347927676701eb99809e84520ae00a74'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/stories/1.4.md'
warnings: ['oversized']
deferred:
  - summary: >-
      AD-16's list doesn't protect `.claude/` (settings, hooks, skills) or case variants of `CLAUDE.md`, which agents load as instructions.
    evidence: |-
      `.claude/skills/` and settings drive every agent run, and on macOS a `claude.md` resolves case-insensitively. The spec forbids entries beyond AD-16, so widening the list needs an Escalation (AD-16 list change) for the Maintainer.
    location: >-
      conformance/protected-paths
    severity: medium
  - summary: >-
      `.bun-version`, which pins the toolchain the grader runs on, is not in AD-16's Protected list.
    evidence: |-
      The workflows read it through `bun-version-file`, so a Story could change the Bun version unreviewed. Widening the list is an AD-16 change; retro epic-1 item 14 asks the Maintainer to rule on it.
    location: >-
      conformance/protected-paths
    severity: medium
---

<intent-contract>

## Intent

**Problem:** AD-16's Protected list only exists in prose. Nothing stops a Story PR from editing the grader, its own checks or its own scope, and `CODEOWNERS` doesn't exist yet.

**Approach:** Commit the list as `conformance/protected-paths`, generate `.github/CODEOWNERS` from it, and add `tools/protected-paths/protected-paths.ts`. That file holds the parser, the matcher, the CODEOWNERS renderer and mirror check, and a PR evaluator, plus a CLI. A `pull_request_target` workflow runs the CLI from the default branch and reads the PR's files and reviews from the GitHub API as data. XT-conformance-17..21 cover the five ACs.

## Boundaries & Constraints

**Always:**
- **List format** (`conformance/protected-paths`): one CODEOWNERS-style pattern per line. `#` comments and blank lines are ignored. A `!` prefix marks an exclusion. A trailing ` after-phase:<n>` marks an entry that is active only once `decisions/PHASE-<n>-EXIT.md` exists in the checked root (Story 10.6). The entries, in order, are exactly AD-16's:
  - `/conformance/`, then `!/conformance/expectations/`, `!/conformance/escalations/`, `!/conformance/oracle-requests/`, `!/conformance/fixtures/`;
  - `/decisions/`, `/PORTING.md`, `/stories/`, `/.github/`, `/tools/`;
  - `/packages/assert/`, `/packages/mockery/`, `/packages/contracts/ after-phase:1`;
  - `/package.json`, `/bun.lock`, `/bunfig.toml`, `/tsconfig*.json`, `/tsconfig.base.json`, `/.oxlintrc.json`, `/.gitattributes`;
  - `/AGENTS.md`, `**/CLAUDE.md`.
  
  `conformance/protected-paths` is covered by `/conformance/`, so the list protects itself.
- **Matching** (CODEOWNERS semantics): a leading `/` anchors the pattern at the root. A trailing `/` matches everything under that directory. `*` matches within one path segment, and `**/` matches any number of leading directories. A path is protected when the **last** active entry that matches it is not an exclusion.
- **CODEOWNERS** lives at `.github/CODEOWNERS`, where `/.github/` protects it. It is rendered exactly from the active entries in list order:
  - a header comment naming the source and the regenerate command;
  - an inclusion becomes `<pattern> @edanisko`;
  - an exclusion becomes the bare `<pattern>`, a line with no owner, which leaves the path unowned (this is how `conformance/fixtures/` is excluded).
  
  The Maintainer handle `@edanisko` is the single exported constant `MAINTAINER`.
- **Mirror check:** `checkMirror(listText, codeownersText, activePhases)` returns `[]` or a violation that names the first differing line. `bun run protected-paths:codeowners` rewrites the file; `--check` fails on drift.
- **PR evaluation** (`evaluatePr`):
  - Protected files are every PR file's `filename`, plus the `previous_filename` of a rename, that matches.
  - The check passes when no file is protected. It also passes when the Maintainer's latest `APPROVED`/`CHANGES_REQUESTED`/`DISMISSED` review is `APPROVED` and its `commit_id` equals the head SHA.
  - Otherwise it fails and lists each protected file, sorted.
  - The rule applies to every PR whatever its branch, so `story/*` is included.
  - If the API returned fewer files than the PR's `changed_files`, the check fails closed and says so.
- **CLI** `bun tools/protected-paths/protected-paths.ts`:
  - `codeowners [--check] [--root <dir>]`;
  - `pr --repo <owner/name> --pr <n> [--root <dir>]`. It reads `GITHUB_API_URL` (default `https://api.github.com`) and `GH_TOKEN`, and pages through `/pulls/<n>/files` and `/pulls/<n>/reviews`. It also fetches `conformance/protected-paths`, `.github/CODEOWNERS` and `decisions/PHASE-1-EXIT.md` at the head SHA through the contents API (as data; a 404 means absent) and runs the mirror check on them. It decides protection from the root's own list, which is the base checkout.
  
  Exit codes: 0 pass, 1 violations, 2 usage error.
- **Workflow** `.github/workflows/protected-paths.yml`:
  - trigger only `pull_request_target` (opened, synchronize, reopened, ready_for_review); top-level `permissions: contents: read`; job `protected-paths` adds `pull-requests: read`;
  - steps: `actions/checkout` pinned to `3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1) with no `ref` and `persist-credentials: false`, then `oven-sh/setup-bun` pinned to `0c5077e51419868618aeaa5fe8019c62421857d6` (v2.2.0) with `bun-version-file: .bun-version`, then the `pr` CLI. There is no `bun install`. PR values reach the step only through `env`, never by expression interpolation inside `run`.
- The tool uses only Bun and Node builtins. The tests are hermetic: temp roots, plus a `Bun.serve` fake GitHub API on port 0.

**Never:**
- Never check out, install or run PR code in the workflow. Never use a `pull_request_review` or `pull_request` trigger, because both run the PR's copy of the workflow. After approving, the Maintainer re-runs the check.
- Never accept a label or a file as approval. AD-16 says the Code Owner review replaces any label.
- Don't add entries beyond AD-16's list. Don't configure the ruleset or required checks; that is Story 1.7. Don't edit `AGENTS.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Story touches grader | `story/9.1` changes `packages/assert/src/x.ts`, `packages/support/src/y.ts` | fail, listing `packages/assert/src/x.ts` only | exit 1 |
| Allowed conformance subdirs | changes under `conformance/expectations/`, `escalations/`, `oracle-requests/`, `fixtures/` | pass | — |
| Contracts before Phase 1 exit | changes `packages/contracts/src/a.ts`, no `PHASE-1-EXIT.md` | pass; contracts absent from CODEOWNERS | — |
| Contracts after exit | same, with `decisions/PHASE-1-EXIT.md` in root | fail; CODEOWNERS must now list contracts | exit 1 |
| Nested CLAUDE.md | adds `packages/x/CLAUDE.md` | fail | exit 1 |
| Rename out of protected dir | `tools/a.ts` → `packages/x/a.ts` | fail, listing `tools/a.ts` | exit 1 |
| Maintainer approved head | approval with `commit_id` = head | pass | — |
| Stale or other approval | Maintainer approved an older commit, or a non-Maintainer approved | fail | exit 1 |
| Approval then changes requested | the latest Maintainer state is `CHANGES_REQUESTED` | fail | exit 1 |
| Truncated file list | `changed_files` > files returned | fail closed | exit 1 |
| Head CODEOWNERS drift | the PR edits the list without regenerating CODEOWNERS | fail, naming the differing line | exit 1 |

</intent-contract>

## Code Map

- `tools/graph/graph.ts` -- the pattern to copy: header comment listing the violation kinds, `main(argv)` returning an exit code, `if (import.meta.main) process.exit(main(...))`, and violations printed to stderr.
- `conformance/tests/xaravel/graph.test.ts` -- the test style: `bun:test` `expect`; titles start with the Test ID, state the rule and cite the AD; `mkdtempSync` roots; a `runCli` helper using `Bun.spawnSync`.
- `package.json` -- root scripts. Add `protected-paths:codeowners`.
- `tsconfig.json` -- add `tools/protected-paths/**/*.ts` to `include`.
- `stories/1.4.md` -- XT-conformance-17..21, in AC order.
- `Bun.YAML.parse` exists on Bun 1.4.3 (probed); the tests use it to parse the workflow.
- `.github/` does not exist yet. GitHub Actions is enabled on `xaravel/framework`, and `@edanisko` is the only org member and an admin.

## Tasks & Acceptance

**Execution:**
- `conformance/protected-paths` -- the list above, with a short header comment citing AD-16 and the `after-phase` rule.
- `tools/protected-paths/protected-paths.ts` -- exports `MAINTAINER`, `LIST_PATH`, `CODEOWNERS_PATH`, `parseList`, `activePhases(root)`, `isProtected`, `renderCodeowners`, `checkMirror` and `evaluatePr`, plus the CLI.
- `.github/CODEOWNERS` -- generated by the CLI.
- `.github/workflows/protected-paths.yml` -- as specified above.
- `package.json`, `tsconfig.json` -- the script and the include.
- `conformance/tests/xaravel/protected-paths.test.ts` -- covers each matrix row under its AC:
  - XT-17: the parsed list equals the expected entries exactly; the four conformance subdirectories are not protected; contracts carries `after-phase:1`; the list file itself is protected.
  - XT-18: the committed CODEOWNERS equals the rendering, every inclusion line ends with `@edanisko`, and fixtures has no owner. A drifted copy fails `checkMirror` and `codeowners --check` exits 1. A root with `PHASE-1-EXIT.md` renders contracts.
  - XT-19: the CLI `pr` command runs against the fake API, with exit codes and listed files.
  - XT-20: workflow YAML assertions.
  - XT-21: the approval cases.

**Acceptance Criteria:**
- Given `conformance/protected-paths`, when it is read, then it holds exactly AD-16's globs including itself, excludes the four conformance subdirectories, and marks contracts `after-phase:1` (XT-conformance-17).
- Given `CODEOWNERS`, when the mirror check runs, then every protected glob maps to `@edanisko`, fixtures is unowned, and divergence fails (XT-conformance-18).
- Given a `story/*` PR modifying a protected file, when the check runs, then it exits 1 and lists each protected file touched (XT-conformance-19).
- Given the workflow file, when it is inspected, then its only trigger is `pull_request_target`, no step checks out a PR ref or runs PR code, and PR data comes only from the API (XT-conformance-20).
- Given an Infrastructure PR touching Protected Paths with the Maintainer's approving review on the head commit, when the check runs, then it exits 0 (XT-conformance-21).

## Spec Change Log

## Review Triage Log

### 2026-10-16 — Review pass
- verdicts: 24 findings — high 0, medium 5, low 14, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) the fake GitHub API ignores `Accept`, so a wrong contents media type would break every CI run unnoticed — the fake now returns raw text only for `application/vnd.github.raw+json` and the JSON envelope otherwise.
  - `[low]` `[patch]` (verification-gap) fail-closed on API errors is untested — added HTTP 500 cases (files endpoint and a contents path) asserting exit 1 and the `HTTP 500` line.
  - `[low]` `[reject]` (edge) the head mirror check probes only `PHASE-1-EXIT.md` — only `after-phase:1` exists, and any new marker changes the Protected list through the Maintainer; a per-marker probe adds a loop for a case nobody meets yet.
  - `[low]` `[reject]` (edge) head SHA read live rather than pinned to the event — the status a stale run posts sits on the older commit, and every push starts a fresh run on the new head that judges it; pinning adds a CLI flag.
  - `[false]` `[reject]` (edge) `changed_files` missing skips the truncation guard — GitHub's single-PR endpoint always returns `changed_files`.
  - `[low]` `[reject]` (edge) `claude.md` case variants are unprotected — CODEOWNERS matching is case-sensitive, so a case-insensitive matcher would diverge from the mirror; the list's coverage is AD-16's (see the deferred agent-files item).
  - `[low]` `[patch]` (edge) `codeowners --root --check` takes `--check` as the root — a value starting with `--` is now a usage error (exit 2).
  - `[medium]` `[patch]` (edge) re-targeting a PR's base (`edited`) does not re-run the check — grouped with the base-branch finding below.
  - `[low]` `[patch]` (edge) XT-18 and the runPr default head assume no Phase has exited — the live assertions now use `activePhases(root)`, so Story 10.6's `PHASE-1-EXIT.md` won't break them.
  - `[medium]` `[patch]` (edge, claim) a PR into a non-default branch is judged by that branch's list — grouped with the blind base-branch finding.
  - `[medium]` `[patch]` (blind) `pull_request_target` runs the base branch's copy, so a PR against a weakened side branch passes and keeps its green after its base is changed to main — added `branches: [main]` and the `edited` type; XT-20 asserts both. This keeps the Story AC's "the default branch's version" and the contract's "trigger only `pull_request_target`".
  - `[low]` `[reject]` (blind) the Maintainer is matched by login, not numeric id — a hijack needs the login renamed and re-registered; unlikely, and the fix adds an id constant and a second identity rule.
  - `[low]` `[reject]` (blind) the head phases are hard-coded — duplicate of the edge row; same reason.
  - `[low]` `[reject]` (blind) the head SHA isn't pinned — duplicate of the edge row; same reason.
  - `[low]` `[reject]` (blind) a green check goes stale after a later `CHANGES_REQUESTED` — that review comes from the Maintainer, the only person who can merge such a PR; the `edited` part is patched above.
  - `[medium]` `[defer]` (blind) `.claude/` (settings, hooks, skills) and case variants of `CLAUDE.md` are not in AD-16's list — adding entries is a Protected-list change outside AD-16, which needs an Escalation (recorded in `deferred`).
  - `[low]` `[reject]` (blind) no fetch timeout, page cap, `timeout-minutes` or `concurrency` — the job fails closed on an error, and GitHub caps the files list at 3000; unlikely to matter, and the fix adds several knobs.
  - `[low]` `[reject]` (blind) XT-20 doesn't whitelist job-level keys (`if`, `container`, `env`) — the workflow is Protected, so any such edit itself needs the Maintainer; the fix adds a large assertion block.
  - `[false]` `[reject]` (blind) the spec and code disagree (status, export list, matrix rows) — the sprint status is `in-progress` by design until the Story is done, and the extra exports are helpers; the fix edits this spec.
  - `[low]` `[reject]` (blind) contents paths aren't percent-encoded — they are three constants with no special characters; unlikely.
  - `[low]` `[patch]` (intent) AC4's own scenario (a PR editing the workflow file) was never run through the check — XT-20 now evaluates a PR whose only change is the workflow file.
  - `[false]` `[reject]` (intent) the rule applies to every PR, with no `story/*` or Infrastructure class — deliberate (contract: "applies to every PR whatever its branch"); `story/*` is covered, and a branch-scoped rule would let a fork PR named `planning/x` through.
  - `[false]` `[reject]` (intent) PRs authored as `@edanisko` can't get the approving review — GitHub forbids self-approval, so the Maintainer merges as bypass actor; this is the Design Notes' operational effect, not a defect.
  - `[false]` `[reject]` (intent) nothing runs `codeowners --check` on main, and inactive contracts aren't in CODEOWNERS — every PR's head is mirror-checked, so main can't drift through a PR; "every protected glob" means every active one until `after-phase:1` fires, which Story 10.6's AC confirms.

### 2026-10-17 — Follow-up review pass
Scoped to the Story's squash commit (`47a4927`, excluding `_bmad-output/`), because `followup_review_recommended` was `true` (retro epic-1 item 11, finding R9). Findings were verified against `main` at `09f2efd`, which includes retro items 8 and 10.
- verdicts: 29 findings — high 0, medium 3, low 10, false 16, maybe-false 0
- findings:
  - Blind Hunter
    - `[false]` `[reject]` The head mirror probes only Phase 1. — Fixed on `main` by retro item 10 (#39): `pr()` probes every `after-phase:<n>` the head list names (`protected-paths.ts:436-447`), and XT-19 covers Phase 2.
    - `[false]` `[reject]` `changed_files` and `head.sha` are unvalidated. — Fixed by #39: `pr()` throws on a non-string head SHA or non-number `changed_files` (`protected-paths.ts:424-427`).
    - `[false]` `[reject]` The check ignores the branch type. — carried: the rule applies to every PR whatever its branch, by contract.
    - `[medium]` `[defer]` `.bun-version` is not in the Protected list. — A Protected-list change outside AD-16 is the Maintainer's; tracked as retro item 14 (waiting on the Maintainer). Recorded in `deferred`.
    - `[medium]` `[defer]` `.claude/`, case variants of `CLAUDE.md` and nested `AGENTS.md` are unprotected. — carried: the existing deferred agent-files item; retro item 14.
    - `[false]` `[reject]` Nothing makes the check binding. — Story 1.7 made `protected-paths` a required check (`.github/rulesets/main.json`); this Story's spec excluded the ruleset.
    - `[low]` `[reject]` Files and the head SHA are read at different moments. — carried: head SHA pinning; each push starts a fresh run on the new head.
    - `[low]` `[reject]` Fail-closed is tested on only two endpoints. — Every endpoint goes through the same `json`/`paged` helpers, which throw on non-2xx; more fixtures add little.
    - `[low]` `[reject]` A malformed head list is labelled `codeowners drift`. — It still fails closed and the message names the list line and the error; XT-19 pins the wording. Cosmetic.
    - `[false]` `[reject]` Duplicate or redundant entries (`/tsconfig*.json` vs `/tsconfig.base.json`). — The list is exactly AD-16's, by contract; dropping the line would diverge from AD-16.
    - `[low]` `[reject]` One workflow comment line is unwrapped, and `edited` fires on title edits. — Cosmetic; a re-run on a title edit is harmless.
  - Edge Case Hunter
    - `[false]` `[reject]` Phase n ≠ 1 at the head. — Fixed by #39 (see above).
    - `[false]` `[reject]` `changed_files` missing or non-numeric. — Fixed by #39 (see above).
    - `[false]` `[reject]` `head.sha` missing. — Fixed by #39 (see above).
    - `[low]` `[reject]` A malformed head list is labelled as drift. — Same as the Blind Hunter row; same reason.
    - `[low]` `[reject]` Unbounded pagination. — carried: no page cap; GitHub caps the files list at 3000.
    - `[low]` `[reject]` A head path that is a directory. — The list and CODEOWNERS are Protected files; making either a directory needs the Maintainer, and the check then fails closed on drift.
    - `[false]` `[reject]` A Maintainer-authored PR can never pass. — carried: self-approval; handled by the MAINT ruling and `--admin`.
    - `[low]` `[reject]` A `copied` file's unchanged source is flagged. — Fails closed, and the PR files API rarely reports `copied`; a status branch adds complexity for a rare false alarm.
    - `[low]` `[reject]` `GH_TOKEN` unset runs unauthenticated. — The workflow always sets it from `github.token`; only a local run can hit this.
  - Verification Gap
    - `[medium]` `[patch]` Nothing tests that the base list, not the head list, judges the PR. — Added a XT-19 case: the head drops `/tools/` and `/conformance/` with a matching CODEOWNERS; the PR still fails on `tools/x.ts` and the list, with no drift reported.
    - `[low]` `[reject]` Reviews past the first page are never exercised. — Needs over 100 reviews on one PR; `paged` is shared with files, which XT-19 pages.
    - `[false]` `[reject]` (other) The head mirror probes only Phase 1. — Fixed by #39, as the reviewer noted.
  - Intent Alignment
    - `[false]` `[reject]` `edited` and `branches: [main]` are not in the intent's trigger list. — carried: the first pass added both to close the re-targeting hole and keep "the default branch's version".
    - `[false]` `[reject]` Only Phase 1 is detected at the head. — Fixed by #39.
    - `[false]` `[reject]` XT-17/18/20 read the committed list and workflow. — The tests assert the committed artifacts by design; every PR run uses temp roots and the port-0 fake.
    - `[false]` `[reject]` CODEOWNERS has a third header line. — It explains the unowned-line convention; XT-18 pins the renderer's output.
    - `[false]` `[reject]` The fake models `DISMISSED` as a separate review. — `evaluatePr` takes the latest decisive state, so a dismissed approval read as `DISMISSED` fails either way.
    - `[false]` `[reject]` The `tsconfig.json` include is not in the intent. — It type-checks the new tool, which `bun run typecheck` requires.

## Design Notes

**`.github/CODEOWNERS`, not the root.** The Structural Seed shows a root `CODEOWNERS`, but AD-16's list doesn't cover the root file. Under `.github/` it is protected by `/.github/` without adding an entry. GitHub reads `.github/CODEOWNERS` first.

**Reviews can't re-trigger the check.** A review event would run the PR's copy of the workflow. So the check reads reviews when it runs, and the Maintainer re-runs it after approving.

**Operational effect.** The Maintainer can't approve their own PR. Once this merges, any PR authored as `@edanisko` that touches Protected Paths, including the orchestrator's Epic 1–8 Stories, shows a red `protected-paths` check until the Maintainer merges it as the bypass actor. This is AD-16 working as intended. Report it on the status issue; do not route around it.

## Verification

**Commands:**
- `bun test` -- expected: XT-conformance-1..21 pass
- `bun tools/protected-paths/protected-paths.ts codeowners --check` -- expected: exit 0
- `bun run typecheck` / `bun run lint` / `bun run graph:check` / `bun run scaffold:check` -- expected: exit 0

## Auto Run Result

Status: done

**Summary.** AD-16's Protected list is now a file and a check.
- `conformance/protected-paths` holds AD-16's globs. It protects itself through `/conformance/`, excludes `expectations/`, `escalations/`, `oracle-requests/` and `fixtures/`, and marks contracts `after-phase:1`. That marker becomes active when `decisions/PHASE-1-EXIT.md` exists.
- `.github/CODEOWNERS` is generated from the list (`bun run protected-paths:codeowners`). Every active inclusion is owned by `@edanisko`, and the exclusions are lines with no owner. A mirror check fails on drift.
- The `protected-paths` workflow runs on `pull_request_target`, only for PRs into `main` and only from main's copy. It checks out no PR code. It reads the PR's files, reviews and head CODEOWNERS from the API as data.
- The check fails any PR that touches a Protected Path and lists each file, unless the Maintainer's latest decisive review approves the head commit.

**Files changed.**
- `conformance/protected-paths`: the list.
- `.github/CODEOWNERS`: the generated mirror.
- `.github/workflows/protected-paths.yml`: the check workflow.
- `tools/protected-paths/protected-paths.ts`: the parser, matcher, renderer, mirror check and PR evaluator, and the `codeowners` and `pr` CLI.
- `conformance/tests/xaravel/protected-paths.test.ts`: XT-conformance-17..21, using a `Bun.serve` fake of the GitHub API.
- `package.json`: the `protected-paths:codeowners` script.
- `tsconfig.json`: type-checks `tools/protected-paths`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: Story status.

**Review findings.** There were 24 findings: 5 medium, 14 low, 5 false.
- Patched, 7 rows in 6 fixes:
  - the fake API now honours `Accept`;
  - tests for fail-closed on HTTP 500;
  - an option value starting with `--` is a usage error;
  - `branches: [main]` plus the `edited` trigger, which closes the hole where a PR goes green against a side branch and is then re-targeted to main;
  - XT-18 is now independent of the Phase;
  - XT-20 runs AC4's own workflow-file PR through the check.
- Deferred, 1: `.claude/` and case variants of `CLAUDE.md` are outside AD-16's list. Widening the list needs an Escalation.
- Rejected, 16, each with its reason in the Review Triage Log:
  - the head-phase probe and head-SHA pinning (each reported twice);
  - `changed_files` missing;
  - case variants of `CLAUDE.md`;
  - Maintainer matched by login rather than id;
  - a stale green after `CHANGES_REQUESTED`;
  - no network timeouts;
  - XT-20's job-key whitelist;
  - spec/code drift;
  - contents path encoding;
  - the rule applying to every branch;
  - self-approval;
  - no mirror check on main.

**Follow-up review recommendation:** true. This pass patched 2 medium entries (the fake's `Accept` handling, and the base-branch/`edited` trigger), 0 high and 3 low. The unverified risk: the workflow has never run on GitHub. The base-branch filter, the `edited` re-run and the raw-contents fetch are proven only by YAML parsing and a fake API. The first real PR after merge is the live test.

**Verification.**
- `bun test`: 21 pass, 0 fail.
- `bun tools/protected-paths/protected-paths.ts codeowners --check`: exit 0.
- `bun run typecheck`, `bun run lint`, `bun run graph:check` and `bun run scaffold:check`: all exit 0.

**Residual risks.**
- Once this merges, every PR that touches Protected Paths shows a red `protected-paths` check until the Maintainer approves and re-runs it. That includes the orchestrator's own Epic 1–8 Stories, which are authored as `@edanisko`, who cannot self-approve. Those PRs then need the Maintainer to merge them as bypass actor.
- The check is not yet required; that is Story 1.7.
- The deferred agent-files gap.

### Follow-up review (2026-10-17)

Run for retro epic-1 item 11 (finding R9), scoped to `47a4927` and verified against `main` at `09f2efd`. 29 findings: 3 medium, 10 low, 16 false.
- Patched (medium 1): XT-19 now proves the base list judges the PR, using a head list that drops `/tools/` and `/conformance/`.
- Deferred: `.bun-version` outside AD-16's list (retro item 14, with the Maintainer).
- Rejected: the rest, with reasons in the Review Triage Log; five were already fixed on `main` by retro item 10.
- The first pass's unverified risk is retired: the workflow has run live on every PR since #17 (for example #39), and its expected `needs @edanisko's approving review` failures match the design.
- **Follow-up review recommendation:** false. No high was patched, so the work has converged.
- Verification: `bun test` 39 pass, 0 fail; `typecheck`, `lint`, `graph:check`, `scaffold:check` and `codeowners --check` exit 0.
