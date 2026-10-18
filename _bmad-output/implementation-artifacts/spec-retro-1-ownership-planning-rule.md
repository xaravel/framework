---
title: 'Ownership check: planning/* may not change packages/** or conformance/expectations/**; bot/* limited to Expectations (retro epic-1 item 17)'
type: 'feature'
created: '2026-10-17'
status: 'done'
baseline_revision: '5393009a25301f99f363b506f0bd12db16ed4bbe'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/decisions/MAINT-2026-10-17-epic-1-items.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md'
warnings: []
deferred:
  - summary: >-
      The bot rule is keyed on the `bot/*` branch name, not on the bot App identity AD-16 names.
    evidence: |-
      Anyone who can push a `bot/x` branch is judged by the bot path rule. Who may push `bot/*` is a ruleset matter (AD-16 Permissions), never part of the ownership check, and no bot exists until Story 5.8.
    location: >-
      tools/ownership/ownership.ts evaluatePr
    severity: low
---

<intent-contract>

## Intent

**Problem:** `evaluatePr` (`tools/ownership/ownership.ts`) passes every non-`story/*` branch unconditionally (retro finding D3). AD-16, as amended by ruling item 15, says a `planning/*` branch may never change `packages/**` or `conformance/expectations/**`, and `bot/*` branches are exempt only when they change Expectations `status` values.

**Approach:** Add two branch rules to `evaluatePr`. A `planning/*` PR gets a violation for each changed path (or renamed-from path) under `packages/` or `conformance/expectations/`. A `bot/*` PR gets a violation for each path outside `conformance/expectations/**` and `conformance/escalations/ESC-bot-<n>.md`, the path-level half of the status-only rule. Both fail closed on a truncated file list. Other non-story branches keep passing as before.

## Boundaries & Constraints

**Always:** Keep every `story/*` behaviour and message byte-for-byte unchanged. Use new violation kinds, `planning scope:` and `bot scope:`, so the orchestrator's `out of scope:` allowance for Story PRs can never match a planning or bot violation. Check a renamed file's previous name the same way Story PRs do. Reject paths with empty, `.` or `..` segments as forbidden on both branch kinds. Match the forbidden prefixes on `planning/*` in any letter case (`Packages/x` is forbidden), the same any-case rule the protected-paths check uses for inclusions. Document both rules in the file's header comment. The CLI summary line for a passing planning or bot PR says which rule it passed.

**Never:** Do not parse Expectations file contents. The value-level "only `status` values change" check needs the Expectations format (Story 5.1) and is owned by Story 5.8's AC ("Given a bot PR that changes only Expectations `status` values … exempt; anything else fails"). Do not edit `.github/workflows/ownership.yml`, the spine, `AGENTS.md` or any manifest. Do not remove any existing assertion. XT-conformance-23's two "other branches pass" examples become planning and bot cases that still pass under the new rules (the ruling requires the old expectation to change); the new forbidden cases go in new tests.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Planning, allowed | `planning/x`: `AGENTS.md`, `tools/a.ts`, `decisions/x.md`, `conformance/tests/a.ts`, `stories/9.1.md`, `packagesx/a`, `conformance/expectationsx/a` | pass, `storyId: null`, no violations | exit 0 |
| Planning, forbidden | `planning/x`: `packages/support/src/A.ts`, `conformance/expectations/support/x.jsonl`, `Packages/a.ts` | one `planning scope:` line per path, sorted | exit 1 |
| Planning rename out of packages | `planning/x`: `docs/A.ts` renamed from `packages/support/A.ts` | `planning scope: packages/support/A.ts` | exit 1 |
| Planning, truncated | 1 file returned, `changed_files` 2 | `truncated file list:` | exit 1 |
| Bot, allowed | `bot/q`: `conformance/expectations/support/x.jsonl`, `conformance/escalations/ESC-bot-3.md` | pass | exit 0 |
| Bot, forbidden | `bot/q`: `tools/x.ts`, `packages/support/A.ts`, `conformance/escalations/ESC-9.1-1.md`, `conformance/expectations/../tools/x` | one `bot scope:` line per path | exit 1 |
| Other branch | `feature/x` or a fork branch touching `packages/**` | pass, unchanged | exit 0 |

</intent-contract>

## Code Map

- `tools/ownership/ownership.ts:405` `evaluatePr` -- the early `return` for non-`story/` refs is what changes. Reuse the truncated-file check (`:410`) and the rename handling (`:432`). `allowedPath` (`:383`) shows the segment check to reuse. `STORY_BRANCH` const at `:95`. Header comment `:1-41` lists violation kinds. CLI summary in `pr()` at `:476`.
- `conformance/tests/xaravel/ownership.test.ts:244` XT-23 -- ends with a `planning/x` PR touching `packages/container/src/B.ts` expected to pass and a `bot/expectations` `tools/x.ts` expected to pass; both contradict the ruling. Helpers: `runPr`, `file`, `fixtureRoot`, `withRoots` (`:1-160`).
- `_bmad-output/implementation-artifacts/story-manifests.md:18` -- records off-manifest XT IDs and says the next free one is `XT-conformance-180`. This work takes 180 and 181.
- Read-only: `.github/workflows/ownership.yml` runs main's copy under `pull_request_target`, so this PR is judged by the old rule and passes.

## Tasks & Acceptance

**Execution:**
- `tools/ownership/ownership.ts` -- add `PLANNING_BRANCH`/`BOT_BRANCH`, exported `planningAllowedPath(path)` and `botAllowedPath(path)`, and the branch handling in `evaluatePr`. Fill `outOfScope` with the forbidden paths. Update the header and the CLI summary -- ruling item 15.
- `conformance/tests/xaravel/ownership.test.ts` -- XT-23: change the planning example's files to allowed ones (`AGENTS.md`, `tools/x.ts`) and its expected stdout, and the bot example to an Expectations path. Add `XT-conformance-180` (planning matrix rows, through the CLI and `evaluatePr`) and `XT-conformance-181` (bot rows plus the other-branch row).
- `_bmad-output/implementation-artifacts/story-manifests.md` -- record 180 and 181 as taken by this retro item, and the next free ID as 182.

**Acceptance Criteria:**
- Given each matrix row, when `evaluatePr` or `ownership.ts pr` runs, then the result and exit code match the matrix.
- Given the full suite, when `bun test`, `bun run typecheck` and `bun run lint` run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 12, false 4, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) any other branch name (`fix/x`, `Planning/x`) skips the planning rule and may change `packages/**` — real, but the intent says "other non-story branches unchanged", so it excludes closing this; flagged to the Maintainer in the PR body.
  - `[false]` `[reject]` (blind) allowing `conformance/escalations/ESC-bot-<n>.md` on `bot/*` is a local AD decision — AD-16 defines an Escalation as that file and says bots open `ESC-bot-<n>` Escalations; `tools/escalations/escalations.ts:151` already accepts the ID. Story 5.8's "anything else" is read against that.
  - `[low]` `[defer]` (blind) the bot rule is keyed on the branch name, not the bot App identity — pre-existing: who may push `bot/*` is a ruleset matter (AD-16 Permissions), never checked by ownership; no bot exists before Story 5.8.
  - `[low]` `[reject]` (blind) a bad-segment path outside the prefixes gets the "packages/** …" reason text — GitHub's files API never returns such paths, and a separate message adds a branch.
  - `[low]` `[patch]` (blind) the header describes bad-segment and case handling for planning but not bot — header now states both for bot.
  - `[low]` `[reject]` (blind) XT-23's title "other branches pass" is stale — still true of other branches; the body comment names the new rules and tests.
  - `[low]` `[reject]` (blind) `pr()` re-derives the branch rule for its summary — fix adds a public result field; both read the same two constants.
  - `[low]` `[patch]` (blind) "passed the bot rule" overclaims — summary now says path-level only and names Story 5.8.
  - `[low]` `[reject]` (blind) the spec's "any manifest" Never contradicts editing `story-manifests.md` — fix edits this build's spec.
  - `[low]` `[patch]` (blind) no test for a removed file in `packages/` or a rename into `packages/` on planning — two `evaluatePr` assertions added to XT-180. The other listed gaps (bot copy, bot CLI rename, ordering) share code already covered by the Story and planning cases.
  - `[low]` `[reject]` (blind) `ownership:check` does not exercise the new rule — fix edits this build's spec; it guards the manifests after the XT allocation.
  - `[low]` `[reject]` (edge) a case-varied branch prefix (`Planning/x`) skips the rule — same bypass as any other unlisted prefix, which the intent keeps passing; folding only the case would not close it.
  - `[low]` `[reject]` (verification-gap, other) unprefixed branches bypass the rule — same as the first blind row.
  - `[false]` `[reject]` (intent) bot rule takes a path-level reading (B3), not "no change" (B1) or full value check (B2) — B1 contradicts AD-16 ("exempts them when they change only Expectations status values"); B2 needs the Expectations format (Story 5.1) and is Story 5.8's AC. The split is stated in code and PR.
  - `[false]` `[reject]` (intent) planning adds case-folding and bad-segment strictness beyond the literal intent — only adds failures no legitimate planning PR can hit, matching the protected-paths convention.
  - `[false]` `[reject]` (intent) tests stop below the CI surface — the workflow runs this same `ownership.ts pr` CLI for every PR into main, which the tests run against a fake API.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/ownership.test.ts` -- expected: pass
- `bun test` -- expected: no failures
- `bun run typecheck` and `bun run lint` -- expected: clean
- `bun run ownership:check` -- expected: exit 0

## Auto Run Result

Status: done

**Summary:** The ownership check now judges `planning/*` and `bot/*` PRs (ruling item 15, finding D3). A `planning/*` PR fails with one `planning scope:` line for each path, or renamed-from path, under `packages/` or `conformance/expectations/`, matched in any letter case. A `bot/*` PR fails with one `bot scope:` line for each path outside `conformance/expectations/**` and `conformance/escalations/ESC-bot-<n>.md`; that is the path-level half of the status-only rule, and Story 5.8 owns the value-level half. Both fail closed on a truncated file list. Other non-story branches pass as before.

**Files:**
- `tools/ownership/ownership.ts`: `planningAllowedPath`, `botAllowedPath`, the branch dispatch in `evaluatePr`, shared helpers pulled out of the Story path (behaviour unchanged), the header comment and the CLI summaries.
- `conformance/tests/xaravel/ownership.test.ts`: the XT-23 planning and bot examples now use paths the new rules allow; new XT-conformance-180 (planning) and XT-conformance-181 (bot and other branches).
- `_bmad-output/implementation-artifacts/story-manifests.md`: records 180 and 181 as taken; the next free ID is 182.

**Review:** 3 low patches applied (bot header text, bot summary says path-level only, planning removed and rename-into-packages tests). 1 low deferred (the bot rule is keyed on the branch name, not the App identity). Rejected: the bypass through unlisted branch names (the intent keeps them unchanged; flagged to the Maintainer), the bad-segment message text, the XT-23 title, the duplicated summary dispatch, two spec-only edits, and 4 false.

**Follow-up review recommended:** false. Patched counts: high 0, medium 0, low 3.

**Verification:** `bun test` 114 pass, 0 fail; `bun run typecheck` and `bun run lint` clean; `bun run ownership:check` exit 0.

**Residual risks:**
- Any branch outside `story/`, `planning/` and `bot/` (for example `fix/x`) can still change `packages/**`, as the intent required.
- Main's copy judges PRs under `pull_request_target`, so the rule applies only to PRs evaluated after this merges.
