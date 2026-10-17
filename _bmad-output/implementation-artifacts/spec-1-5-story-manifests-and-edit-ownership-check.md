---
title: 'Story 1.5: Story manifests and edit-ownership check'
type: 'feature'
created: '2026-10-17'
status: 'done'
baseline_revision: '6331d244a0419d0dc403b74d043cb4fb5a06b627'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/stories/1.5.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Nothing validates a PR's own `stories/*.md` before merge; a planning PR that adds an invalid manifest or a duplicate open Test ID is caught only by the push run on main.
    evidence: |-
      Under pull_request_target the `manifests` job checks out the base. The AC asks for the check "on main", which the push run satisfies. Pre-merge validation means reading head manifests as API data, which belongs with the CI pipeline (Story 5.7) or a Maintainer ruling.
    location: >-
      .github/workflows/ownership.yml
    severity: medium
  - summary: >-
      Branches other than `story/*` (including `bot/*`, `planning/*` and forks) pass `ownership` unconditionally, so they can edit unprotected packages; AD-16's bot exemption is conditional.
    evidence: |-
      `evaluatePr` returns a pass for any head ref not starting `story/`. The AC covers only `story/*` PRs; the conditional bot rule needs Expectations parsing (Story 5.8), and a rule for other branches needs a Maintainer decision.
    location: >-
      tools/ownership/ownership.ts evaluatePr
    severity: medium
  - summary: >-
      Infrastructure Stories (component `conformance`, Epics 1-8) and orchestrator Story PRs that edit `_bmad-output/` always fail `ownership`, with no approval path short of a Maintainer bypass.
    evidence: |-
      There is no `packages/conformance`, and the four allowed paths are the AC's. AD-16 makes the Maintainer's Code Owner review the Infrastructure approval; whether `ownership` should honour that review, and where orchestrator sprint files may be edited, is a rule change for the Maintainer.
    location: >-
      tools/ownership/ownership.ts allowedPath
    severity: medium
  - summary: >-
      The Xaravel Tests (XT-conformance-1..25) run in no CI workflow, so a regression in a gate can merge green.
    evidence: |-
      `.github/workflows/` holds only protected-paths.yml and ownership.yml; neither runs `bun test`. Closed by the harness (Epic 5) and required checks (Story 1.7).
    location: >-
      .github/workflows/
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Story manifests (`stories/<story-id>.md`) exist, but nothing validates them, nothing stops a Story PR from editing outside its Component, and nothing stops two open Stories from claiming the same Test ID (AD-16, AD-21, NFR-10).

**Approach:** Add `tools/ownership/ownership.ts`: a manifest parser and validator, a duplicate-ID check across open manifests, and a PR scope evaluator, plus a CLI. A workflow `ownership` runs `pr` on `pull_request_target` (base checkout, PR files from the API as data) and `manifests` on the checked-out root on PRs and on pushes to `main`. XT-conformance-22..25 cover the four ACs.

## Boundaries & Constraints

**Always:**
- **Manifest format.** A manifest is a `---`-fenced YAML frontmatter block at the top of `stories/<story-id>.md`, parsed with `Bun.YAML.parse`. Required:
  - `story_id`: string matching `^\d+\.\d+$`, equal to the file stem;
  - `epic`: integer equal to the part of `story_id` before the dot;
  - `component`: kebab-case string (`^[a-z][a-z0-9-]*$`);
  - `status`: one of `backlog`, `ready-for-dev`, `in-progress`, `review`, `done`, `blocked`;
  - `test_ids`, `xaravel_test_ids`: each, when present, a list of non-empty strings. At least one of them must be non-empty. A manifest with both absent or empty fails: a Story with no assigned tests can't be done.

  Each problem is one violation line naming the file and field.
- **Open Story** = a manifest whose `status` is not `done`. The duplicate check pools each open manifest's `test_ids` and `xaravel_test_ids`; an ID listed by two or more open Stories fails, naming every Story that lists it. An ID repeated inside one manifest also fails.
- **Allowed paths** for `story/<id>` with manifest `component: <c>`: `packages/<c>/**`, `conformance/expectations/<c>/**`, `conformance/oracle-requests/<id>.jsonl`, `conformance/escalations/ESC-<id>-<n>.md` (`<n>` a positive integer). Every PR file's `filename`, and a rename's `previous_filename`, must match one; the rest are listed sorted as out-of-scope.
- **PR evaluation** (`evaluatePr(root, pr)`):
  - A head branch not starting `story/` passes with "not a Story branch" (the protected-paths check governs those).
  - A `story/<id>` whose `<id>` has no `stories/<id>.md` in the root (the base checkout), or whose manifest fails validation, fails. The PR's own copy of the manifest is never read.
  - Fewer files returned than `changed_files` fails closed, as in Story 1.4.
- **CLI** `bun tools/ownership/ownership.ts`:
  - `manifests [--root <dir>]`: validate every `stories/*.md` and run the duplicate check;
  - `pr --repo <owner/name> --pr <n> [--root <dir>]`: GET `/pulls/<n>` (`head.ref`, `changed_files`) and page `/pulls/<n>/files`, using `GITHUB_API_URL` (default `https://api.github.com`) and `GH_TOKEN`.

  Exit codes: 0 pass, 1 violations or any failure (fail closed), 2 usage error. Violations go to stderr, one line each.
- Reuse Story 1.4's GitHub client by exporting `GitHub` from `tools/protected-paths/protected-paths.ts`, with no behaviour change.
- **Workflow** `.github/workflows/ownership.yml`: triggers `pull_request_target` (branches `[main]`, types opened, edited, synchronize, reopened, ready_for_review) and `push` (branches `[main]`). Top-level `permissions: contents: read`. Job `ownership` (only for `pull_request_target`, adds `pull-requests: read`) runs `pr`. Job `manifests` runs `manifests`. Both use Story 1.4's pinned checkout (no `ref`, `persist-credentials: false`) and setup-bun steps, with no `bun install`. PR values reach `run` only through `env`.
- Bun and Node builtins only. Hermetic tests: temp roots and a `Bun.serve` fake API on port 0.

**Never:**
- Never read the manifest from the PR head, and never check out or run PR code.
- No exemption for Infrastructure Stories, `bot/*` branches or Maintainer approval. The bot exemption needs Expectations parsing (Story 5.6 / 5.8 territory). Don't configure required checks (Story 1.7). Don't edit `stories/*.md` or `AGENTS.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid manifest | committed `stories/1.5.md` | no violations | — |
| No tests | `test_ids: []`, no `xaravel_test_ids` | fails, names the file | exit 1 |
| Missing field | no `component` | fails, names `component` | exit 1 |
| Stem mismatch | `stories/1.5.md` with `story_id: "1.6"` | fails | exit 1 |
| In-scope PR | `story/9.1` (component support) changes `packages/support/src/A.ts`, `conformance/expectations/support/x.jsonl`, `conformance/oracle-requests/9.1.jsonl`, `conformance/escalations/ESC-9.1-1.md` | pass | — |
| Out-of-scope PR | adds `packages/container/src/B.ts`, `conformance/oracle-requests/9.2.jsonl`, `conformance/escalations/ESC-9.2-1.md` | fails, listing the three, sorted | exit 1 |
| Rename out of scope | `packages/http/x.ts` → `packages/support/x.ts` | fails, listing `packages/http/x.ts` | exit 1 |
| No manifest on base | `story/99.9` | fails, says no manifest on base | exit 1 |
| PR adds its own manifest | head adds `stories/99.9.md`, base lacks it | fails (base is authoritative) | exit 1 |
| Not a Story branch | `planning/x` touching anything | pass | — |
| Truncated list / API 500 | `changed_files` > files, or HTTP 500 | fail closed | exit 1 |
| Duplicate open | 9.1 and 9.2 (both `backlog`) list `T1` | fails naming `T1`, 9.1 and 9.2 | exit 1 |
| Duplicate with done | 9.1 `done`, 9.2 `backlog` list `T1` | pass | — |

</intent-contract>

## Code Map

- `tools/protected-paths/protected-paths.ts` -- the pattern to copy: header comment listing violation kinds, `UsageError`, `parseOptions`, `main(argv)` returning an exit code and failing closed on any error, `import.meta.main`. `class GitHub` (line ~355, `json`, `paged`, `contents`) becomes `export class GitHub`. `PrFile` (`filename`, `previous_filename?`, `status`) is exported already.
- `conformance/tests/xaravel/protected-paths.test.ts` -- test style to copy: `bun:test` `expect`, titles start with the Test ID, state the rule and cite the AD; `mkdtempSync` roots; `runCli` via `Bun.spawn`; `runPr` with a `Bun.serve` fake API (lines ~60–140).
- `.github/workflows/protected-paths.yml` -- the workflow to mirror (pinned SHAs, env-only PR values).
- `stories/*.md` -- 56 manifests, all `status: backlog`, components `conformance|assert|mockery|boost`; probed: no duplicate IDs, every stem equals `story_id`, `story_id` is a string and `epic` a number.
- `package.json` -- add `"ownership:check": "bun tools/ownership/ownership.ts manifests"`. `tsconfig.json` -- add `tools/ownership/**/*.ts` to `include`.

## Tasks & Acceptance

**Execution:**
- `tools/ownership/ownership.ts` -- exports `STORIES_DIR`, `parseManifest(file, text)`, `readManifests(root)`, `checkDuplicates(manifests)`, `allowedPath(manifest, path)`, `evaluatePr(root, pr)`, and the CLI.
- `tools/protected-paths/protected-paths.ts` -- export `GitHub`.
- `.github/workflows/ownership.yml` -- as specified.
- `package.json`, `tsconfig.json` -- script and include.
- `conformance/tests/xaravel/ownership.test.ts` -- XT-22: every committed manifest validates, and `manifests` exits 0 on the repo root, plus the invalid-manifest rows. XT-23: base-only reading, missing manifest, non-story branch. XT-24: in-scope, out-of-scope, rename, truncation, HTTP 500, via the fake API. XT-25: duplicate rows, through the function and the CLI.

**Acceptance Criteria:**
- Given `stories/<story-id>.md`, when its frontmatter is validated, then `story_id`, `epic`, `component` and `status` are required, plus a non-empty `test_ids` or `xaravel_test_ids`; a manifest with neither fails (XT-conformance-22).
- Given a PR from `story/<story-id>`, when the ownership check runs, then it reads the manifest from the base checkout only, and a branch with no manifest on base fails (XT-conformance-23).
- Given a PR that changes files outside the four allowed paths, when the check runs, then it exits 1 and lists the out-of-scope paths (XT-conformance-24).
- Given two open Stories whose manifests list the same Test ID, when `manifests` runs, then it exits 1 and names both Stories (XT-conformance-25).

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 26 findings — high 0, medium 5, low 18, false 2, maybe-false 1
- findings:
  - `[medium]` `[defer]` (verification-gap) XT-conformance-22..25 run in no CI workflow, so a regression in the gate can merge green — no XT test runs in CI yet; the harness (Epic 5) and required checks (Story 1.7) close it.
  - `[medium]` `[defer]` (verification-gap other) on PRs the `manifests` job validates the base, not the PR's `stories/*.md`, so a planning PR adding a duplicate or invalid manifest is caught only after merge — the AC asks for the check "on main", which the push run does; pre-merge validation of head manifests (as API data) contradicts the spec's "never read the PR's copy" rule for Story PRs and belongs with the CI pipeline (Story 5.7) or a Maintainer ruling. Grouped with the edge, blind and intent rows below.
  - `[medium]` `[defer]` (intent 1) duplicate check reads main's state rather than the PR's proposed manifests — same root cause as the row above.
  - `[low]` `[reject]` (intent 2) ownership is path-level, not Expectations-line-level — epics.md assigns line ownership to Story 5.6 ("Ratchet and Expectations line ownership"), so the intent excludes it here.
  - `[medium]` `[defer]` (intent 3) non-`story/*` branches, including `bot/*`, pass unconditionally, looser than AD-16's bot rule — grouped with the blind row on non-story branches.
  - `[medium]` `[defer]` (intent 4) Infrastructure Stories (component `conformance`) always fail `ownership` — grouped with the blind Escalation row.
  - `[false]` `[reject]` (intent 5) "reads the manifest from base" is proved by a stand-in — the root is the base checkout by construction (`pull_request_target`, no `ref`, asserted in XT-24), and the fake API proves no head contents are fetched; that is the testable surface without a live run.
  - `[low]` `[reject]` (intent 6) `backlog`/`blocked` count as open — the spec's definition (status not `done`); stricter is the safe reading of "open".
  - `[low]` `[reject]` (intent 7) XT-22 runs on the 56 committed manifests — deliberate live check, the same pattern as Story 1.4's XT-17/18; a manifest that breaks validation should go red.
  - `[low]` `[patch]` (edge) a `copied` file's `previous_filename` is judged out of scope — `previous_filename` is now checked only for `renamed` files.
  - `[low]` `[patch]` (edge) Test IDs with surrounding whitespace dodge the duplicate check — items with leading/trailing whitespace are now invalid. Grouped with the blind whitespace row.
  - `[low]` `[reject]` (edge) a BOM or trailing spaces on the fence reports "frontmatter is missing" — the manifest still fails loudly; sprint planning writes LF, no-BOM files; unlikely.
  - `[low]` `[reject]` (edge) `--root ""` resolves to the cwd — only a hand-typed empty argument reaches it; unlikely.
  - `[medium]` `[defer]` (edge claim) PR manifests are never validated before merge — same root cause as the verification-gap other row.
  - `[medium]` `[defer]` (blind) non-`story/*` branches skip ownership, so a fork or `planning/*` PR can edit any unprotected package — the AC covers `story/*` PRs only, and AD-16 limits agent pushes to `story/*`; a rule for other branches (and the conditional `bot/*` exemption, Story 5.8) needs a Maintainer decision.
  - `[medium]` `[defer]` (blind) duplicate check ignores the PR's manifests — same root cause as the verification-gap other row.
  - `[low]` `[reject]` (blind) per-ID Expectations rule missing — duplicate of intent 2; Story 5.6.
  - `[medium]` `[defer]` (blind) Infrastructure Stories always fail `ownership` and no Escalation was filed — the four allowed paths are the AC's, and AD-16 makes the Maintainer's Code Owner review the Infrastructure approval, so a red `ownership` on those PRs is the AD applied, not a conflict decided locally; whether `ownership` should honour that approval is a rule change for the Maintainer.
  - `[low]` `[patch]` (blind) Test IDs aren't normalised (`"T1 "`) — patched with the edge row. The XT format check (`XT-<component>-<n>`) is rejected: no AC asks for it.
  - `[low]` `[patch]` (blind) `01.5` and `1.5` both validate — `STORY_ID` now rejects leading zeros.
  - `[low]` `[reject]` (blind) non-`.md` files in `stories/` are skipped, and BOM fences mis-reported — sprint planning writes only `<id>.md`; unlikely.
  - `[low]` `[reject]` (blind) no fetch timeout, `timeout-minutes` or `concurrency` — rejected in Story 1.4 for the same client; the job fails closed.
  - `[low]` `[reject]` (blind) missing tests (removed files, own manifest, mapping-less frontmatter, `test_ids: null`, duplicate keys) — `filename` is checked whatever the status, and the rest are covered branches or YAML-parser behaviour; negligible.
  - `[low]` `[reject]` (blind) weak/fragile assertions (`toBeGreaterThanOrEqual`, `split(" ")[3]`) — cosmetic; the exact `component` case pins the format.
  - `[false]` `[reject]` (blind) the `head.ref` guard is dead and a missing `head` throws a TypeError — the TypeError is caught by `main` and exits 1 (fail closed), the correct outcome.
  - `[maybe-false]` `[reject]` (blind) `story/foo` is labelled `missing manifest` rather than `invalid branch` — the message says the branch does not name a Story ID; the label is cosmetic, if-true `low`.

## Design Notes

**Infrastructure Stories go red too.** Epics 1–8 use `component: conformance`, and there is no `packages/conformance`. Their PRs, and any orchestrator PR that also edits `_bmad-output/` sprint files, fail `ownership`, just as they fail `protected-paths`. The Maintainer merges them as bypass actor. That is AD-16/AD-21 as written; an exemption would be a rule change, so this Story doesn't add one.

**Duplicates count Xaravel Test IDs too.** AD-16 aims to prevent "ID collisions", and XT IDs are allocated per Component across manifests. Pooling both lists catches both kinds.

## Verification

**Commands:**
- `bun test` -- expected: XT-conformance-1..25 pass
- `bun tools/ownership/ownership.ts manifests` -- expected: exit 0
- `bun run typecheck` / `bun run lint` / `bun run graph:check` / `bun run scaffold:check` / `bun tools/protected-paths/protected-paths.ts codeowners --check` -- expected: exit 0

## Auto Run Result

Status: done

**Summary.** Story manifests are validated, and Story PRs are held to their Component's paths.
- `bun tools/ownership/ownership.ts manifests` validates every `stories/*.md` (required `story_id`, `epic`, `component`, `status`, plus a non-empty `test_ids` or `xaravel_test_ids`). It fails when two open Stories (status not `done`) list the same Test ID, naming each.
- `pr` judges a `story/<id>` PR against the manifest in the base checkout only. It fails a branch with no manifest on base, and lists every file outside `packages/<c>/**`, `conformance/expectations/<c>/**`, `conformance/oracle-requests/<id>.jsonl` and `conformance/escalations/ESC-<id>-<n>.md`. Other branches pass.
- The `ownership` workflow runs `pr` on `pull_request_target` from main's copy, and `manifests` on PRs and on every push to main.

**Files changed.**
- `tools/ownership/ownership.ts`: manifest parser and validator, duplicate check, path allowlist, PR evaluator, CLI.
- `tools/protected-paths/protected-paths.ts`: `GitHub` client exported for reuse, no behaviour change.
- `.github/workflows/ownership.yml`: the `ownership` and `manifests` jobs.
- `conformance/tests/xaravel/ownership.test.ts`: XT-conformance-22..25, with a `Bun.serve` fake API.
- `package.json`, `tsconfig.json`: `ownership:check` script and type-check include.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: Story status.

**Review findings.** 26 findings: 5 medium, 18 low, 2 false, 1 maybe-false.
- Patched, 4 rows in 3 fixes (all low): Test IDs with surrounding whitespace are invalid; Story IDs reject leading zeros; a `copied` file's source name is no longer judged.
- Deferred, 4 entries (9 rows, all medium): pre-merge validation of PR manifests; non-`story/*` branches pass unconditionally; Infrastructure and orchestrator Story PRs always fail `ownership`; Xaravel Tests run in no CI workflow.
- Rejected, 13, each with its reason in the Review Triage Log: line-level Expectations ownership (Story 5.6, reported twice); the stand-in for base reading; `blocked` counting as open; the live XT-22 check; BOM and trailing-space fences (reported twice); `--root ""`; missing timeouts; extra test cases; weak assertions; the `head.ref` guard; the branch label; the XT ID format check.

**Follow-up review recommendation:** false. This pass patched 0 high, 0 medium and 3 low entries.

**Verification.**
- `bun test`: 25 pass, 0 fail.
- `bun tools/ownership/ownership.ts manifests`: exit 0 (56 manifests valid, no duplicates).
- `bun run typecheck`, `bun run lint`, `bun run graph:check`, `bun run scaffold:check`, `bun tools/protected-paths/protected-paths.ts codeowners --check`: all exit 0.

**Residual risks.**
- The workflow has never run on GitHub; the first PR after merge is the live test.
- This PR and every later Epic 1-8 Story PR will show red `protected-paths` and `ownership` checks until the Maintainer merges them as bypass actor (see `deferred`).
- The check is not yet required; that is Story 1.7.
