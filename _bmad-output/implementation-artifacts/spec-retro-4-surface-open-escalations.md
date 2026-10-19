---
title: 'Retro 4 item 9: escalations:check warns on open Escalations of done Stories'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: '7736ed8fbf5fb9fe517a24be262b73ad23193f13'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      The warnings reach only stdout of a green CI job; neither the orchestrator loop nor a CI annotation passes them to the Maintainer.
    evidence: |-
      `.github/workflows/escalations.yml:55` runs `check`, which exits 0, so the lines sit in a passing job log. `tools/orchestrator/iteration.md` steps G and I never run `escalations:check`. The retro item's purpose ("so idle reports and the Maintainer see unruled contracts") needs one consumer wired in: a `::warning::` annotation or job summary, or a step-I instruction to run the check and quote its warnings. Both are Protected Path edits outside this item's stated surface.
    location: >-
      tools/orchestrator/iteration.md
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `escalations:check` passes with "15 escalation(s) and 11 decision(s) valid" while ESC-4.2-1, ESC-4.3-1, ESC-4.4-2 and ESC-4.6-1 have no decision, because a missing decision just means "open" (`tools/escalations/escalations.ts:35`). Their Stories merged `done`, and nothing told the Maintainer or the orchestrator's idle report that rulings were outstanding. Epic 4 retrospective findings S1 and P2, action item `epic-4-retro-item-9-surface-open-escalations`.

**Approach:** After a passing `check`, print one warning line on stdout for each `ESC-<story-id>-<n>` whose `escalationStatus` is `open` and whose Story manifest `stories/<story-id>.md` is valid with `status: done`. The exit code stays 0. A library function returns the warnings so the CLI and tests share one source.

## Boundaries & Constraints

**Always:** Warnings go to stdout, after the existing `Escalations OK: …` line, one per Escalation, sorted by file name, in the form `warning: open escalation: conformance/escalations/<id>.md has no ruling, but Story <story-id> (stories/<story-id>.md) is done; it waits on the Maintainer (AD-16)`. Reuse `escalationStatus` (so a stale or invalid decision also counts as open) and `parseManifest` from `tools/ownership/ownership.ts`. Update the file's header comment to describe the warning. A root with no open-and-done Escalation prints exactly what it prints today.

**Never:** Change the exit code for a warning, or make `pr` warn. Change AD-16, the PRD, SPEC, `epics.md`, `AGENTS.md`, any manifest, Escalation or decision. Warn for `ESC-bot-<n>` (it has no Story), or when the manifest is missing, invalid or not `done` (`ownership:check` owns manifest validity). Print warnings when `check` already fails with violations. Remove or weaken any existing assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open, Story done | `ESC-9.1-1` with no decision; `stories/9.1.md` status `done` | exit 0; stdout OK line then the warning line for ESC-9.1-1 | none |
| Open, Story not done | same, manifest `in-progress` | exit 0; stdout only the OK line | none |
| Ruled | approved decision bound to the current text; manifest `done` | no warning | none |
| Stale decision | decision digest does not match | exit 1 with the stale violation; no warning printed | existing violation |
| No or invalid manifest | Escalation open; `stories/9.1.md` absent or unparseable | no warning, exit 0 | none |
| Bot Escalation | `ESC-bot-1` open | no warning | none |
| Two warnings | ESC-9.2-1 and ESC-9.1-1 open, both Stories done | two lines, ESC-9.1-1 first | none |

</intent-contract>

## Code Map

- `tools/escalations/escalations.ts:1-71` -- header comment; add the warning to the `check` description and note warnings do not change the exit code.
- `tools/escalations/escalations.ts:322-343` -- `escalationStatus(id, root)`: reuse for "open" (missing, invalid or stale decision).
- `tools/escalations/escalations.ts:345-381` -- `markdownFiles`, `checkRecords`; add the exported warnings function beside them, iterating valid-named Escalation files.
- `tools/escalations/escalations.ts:602-609` -- CLI `check`: print warnings after the OK line only on pass.
- `tools/escalations/escalations.ts:83` -- already imports `parseManifest`, `STORIES_DIR` from `../ownership/ownership`; `Manifest.status` is one of `STATUSES` (`tools/ownership/ownership.ts:75`).
- `conformance/tests/xaravel/escalations.test.ts:59-104` -- `fixtureRoot`, `withRoot`, `manifest()` (status fixed to `in-progress`; add an optional status parameter), `runCli`.
- `conformance/tests/xaravel/escalations.test.ts:367-394` -- existing exact-stdout `check` assertions; these roots have no manifests and must keep passing unchanged. The live-repo run (`:392`) asserts only the prefix and exit 0.
- Read-only: `conformance/tests/xaravel/oracle.test.ts:809` runs `escalations:check` offline expecting success; warnings keep exit 0.

## Tasks & Acceptance

**Execution:**
- `tools/escalations/escalations.ts` -- add exported `openEscalationWarnings(root): string[]` and print its lines in `check` on pass; update header comment -- surfaces unruled contracts (S1, P2).
- `conformance/tests/xaravel/escalations.test.ts` -- let `manifest()` take a status; add a test covering every matrix row through `runCli(["check", "--root", dir])` and the library function.

**Acceptance Criteria:**
- Given the repository at the baseline, when `bun run escalations:check` runs after the change, then it exits 0 and prints one warning each for ESC-4.2-1, ESC-4.3-1, ESC-4.4-2 and ESC-4.6-1 (whose Stories are `done`), and none for the ruled Escalations.
- Given the change, when `bun test conformance/tests/xaravel/escalations.test.ts conformance/tests/xaravel/oracle.test.ts`, `bun run typecheck` and `bun run lint` run, then they pass.

## Spec Change Log

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 18 findings — high 0, medium 3, low 11, false 4, maybe-false 0
- findings:
  - `[medium]` `[defer]` (blind) Warnings reach no consumer: stdout of a green CI job, and the orchestrator never runs the check — true; wiring CI annotations or the orchestrator's step I is a Protected Path change outside the item's stated `check` surface. Deferred.
  - `[low]` `[patch]` (blind) Header comment and message claim invalid or stale decisions warn through `check`, which exits 1 on them first — patched: the `check` description now says only a missing decision reaches the warning; the library note says the function alone also counts invalid or stale decisions.
  - `[low]` `[reject]` (blind) Live-repo assertion compares the CLI with the function it calls — the fixture rows pin the behaviour exactly; the live run only guards exit 0 and line shape, and adding a manifest re-read there adds code for no new case.
  - `[false]` `[reject]` (blind) Code Map misstates `oracle.test.ts:809` — the fix is an edit to this spec; the warning's exit 0 is pinned by XT-conformance-184's exact `code: 0` rows instead.
  - `[low]` `[reject]` (blind) Lexical sort puts ESC-10.1-1 before ESC-9.1-1 — deliberate: it is the same `compare` order `checkRecords` uses; a numeric sort adds code for a cosmetic order.
  - `[low]` `[reject]` (blind) Missing cases (invalid Escalation frontmatter, `story_id` mismatch, other manifest faults) — each exits 1 in `check` or is an invalid manifest the parser already rejects; the covered rows exercise both branches.
  - `[low]` `[reject]` (blind) Seven rows in one test ID — matches the file's one-XT-per-behaviour pattern and the single ID in the off-manifest ledger.
  - `[false]` `[reject]` (blind) Spec record incomplete while `in-review` — the triage log and result are written in this step, as the workflow orders.
  - `[low]` `[reject]` (blind) Re-reading files per Escalation — 15 files today; negligible, and a cache adds state.
  - `[medium]` `[patch]` (edge) "Done" ignored sprint status, which `ownership.ts:6-9` makes the authority through `sprint_key` — true (Epic 1 left manifests stale). Patched: the manifest goes through `applySprintStatus(root, [manifest])`; two fixture cases cover both directions.
  - `[low]` `[reject]` (edge) An I/O error in the warning pass turns a pass into exit 1 — that is the file's fail-closed rule (`main` catch); an unreadable record should fail loudly.
  - `[low]` `[reject]` (edge) A directory at `stories/<id>.md` throws — same fail-closed rule; no such state is shown reachable.
  - `[low]` `[reject]` (edge, claim) "Warnings never change the exit code" while an I/O fault can — the claim is about warnings; an I/O fault is a failure, as the exit-code comment says.
  - `[medium]` `[patch]` (edge) No test of the `sprint_key` override — same root cause as the sprint-status row; patched with the two cases.
  - `[false]` `[reject]` (intent) Gap 1: orchestrator loop does not run the command — same root cause as the deferred consumer row; recorded there, not a defect of this diff.
  - `[false]` `[reject]` (intent) Gap 2: CI shows nothing — same root cause as the deferred row.
  - `[low]` `[reject]` (intent) Gap 3: no test reaches the consumers — follows from the deferral; nothing to test until a consumer exists.
  - `[low]` `[patch]` (intent) "has no ruling" for invalid or stale decisions in the library — same root cause as the header-comment row; patched there.

## Auto Run Result

- **Summary:** `escalations:check` now prints, after its OK line and only on a pass, one `warning: open escalation:` line per `ESC-<story-id>-<n>` with no ruling whose Story is done (sprint status decides through `sprint_key`, as `ownership:check` does). Exit codes are unchanged. On `main` today it lists ESC-4.2-1, ESC-4.3-1, ESC-4.4-2 and ESC-4.6-1.
- **Files:**
  - `tools/escalations/escalations.ts` -- new exported `openEscalationWarnings(root)`, printed by `check`; header comment.
  - `conformance/tests/xaravel/escalations.test.ts` -- `manifest()` takes a status; XT-conformance-184 covers every matrix row plus the sprint-status override.
  - `_bmad-output/implementation-artifacts/story-manifests.md` -- records XT-conformance-184 in the off-manifest ledger; next free ID 185.
- **Review:** 18 findings. Patched 3 entries (2 medium as one root cause, sprint status; 1 low, comment wording). Deferred 1 medium (no consumer reads the warnings). Rejected 14, reasons in the triage log.
- **Follow-up review:** `false`. One medium root cause was patched, below the threshold of two.
- **Verification:** `bun run escalations:check` exits 0 and prints 4 warnings; `bun test` on the escalations, oracle and ownership test files passes (14 tests); `bun run typecheck` and `bun run lint` exit 0; full `bun test` run before commit.
- **Residual risk:** until the deferred consumer is wired in, the warnings are seen only by whoever runs the check or opens the CI log.

## Verification

**Commands:**
- `bun run escalations:check` -- expected: exit 0, OK line, four warning lines
- `bun test conformance/tests/xaravel/escalations.test.ts` -- expected: pass
- `bun run typecheck && bun run lint` -- expected: pass
