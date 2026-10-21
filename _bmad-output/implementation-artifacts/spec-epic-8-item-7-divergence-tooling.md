---
title: 'Epic 8 retro item 7: harden the divergence tooling'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
baseline_revision: '7af188899d8499e22e3a7c9fb6bdd1dc3f714bf4'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Three gaps in the divergence tooling (Epic 8 retro findings L1, L2, L3, action item `epic-8-retro-item-7-divergence-tooling`): `divergence:check` scans a Ported Test line only when `//` or `/*` appears on it, so a marker on a continuation line of a multi-line block comment is never checked; the harness floor waiver and `divergence:check` parse `fewer_assertions` differently (the harness accepts unquoted numbers and never checks the clause exists; its own test uses `[2]`); Boost `divergence.get` returns `exists: true, clauses: []` for a clause the record does not have.

**Approach:** Track block-comment state across lines in the marker scan, so every line (or line tail) inside a `/* … */` is scanned. Add one exported `fewer_assertions` parser beside Boost's `divergenceClauses` that returns the valid clause items and the problems; `divergence:check` reports its problems and the harness waives only its valid items. `divergence.get` with `DIV-<n>.<k>` reports `exists: false` and a `note` when the record exists but has no clause `<k>`.

## Boundaries & Constraints

**Always:** Every check stays at least as strict as today: every line and token `divergence:check` checks today is still checked, with the same messages. The harness waiver applies only to an item `divergence:check` accepts (a quoted `"<k>"` naming an existing clause of that record). Update the header comments, `docs/ops/divergence.md`, `docs/ops/harness.md` and `tools/boost-framework/docs/framework-mode.md` and the tool description to match.

**Never:** Change a DIV record, an Expectations line, `conformance/review/fidelity.md`, the spine, PRD, SPEC, `epics.md` or `AGENTS.md`. Never remove or weaken an existing test assertion; `harness.test.ts`'s `[2]` fixture becomes `["2"]` plus a matching clause, and `[2]` moves to the unwaived cases.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Block continuation | Ported Test `/*\n * adapted:DIV-13.2\n */` | `<file>:2: adapted:DIV-13.2: clause does not exist`, exit 1 | — |
| Block closes, code after | `/* x\n adapted:DIV-12.1 */ foo(); // adapted:DIV-12.99` | line 2 reports DIV-12.99 only | — |
| Line comment holds `/*` | `// see /* here\nassertSame(1, adapted:x)` | line 2 not scanned (a `//` comment opens no block) | — |
| Harness unquoted | `fewer_assertions: [2]`, `adapted: DIV-3.2`, below floor | `FLOOR` line, exit 1 | — |
| Harness missing clause | `fewer_assertions: ["2"]`, record has no clause DIV-3.2 | `FLOOR` line, exit 1 | — |
| Harness valid | `fewer_assertions: ["2"]`, record has `- **DIV-3.2** …` | waived, differ=0 | — |
| Boost missing clause | `divergence.get {id: "DIV-3.99"}` on an existing DIV-3 | `exists: false`, `clauses: []`, `frontmatter` of the record, `note` naming the missing clause | — |

</intent-contract>

## Code Map

- `tools/divergence/divergence.ts:226-246` -- marker scan; `COMMENT_START`, `COMMENT_MARKER` (line 59-61); `checkRecord` waiver block lines 141-156 moves to the shared parser. Header comment lines 24-43 documents both.
- `conformance/harness/harness.ts:304-321` -- `waiverFor`; reads frontmatter with local `frontmatterOf`; header lines 152-154. Already depends on `tools/pin-bump`, which imports Boost `data.ts`, so importing Boost `tools.ts` adds no new package edge.
- `tools/boost-framework/src/tools.ts:388-466` -- `divergenceClauses`, `divergenceGet`; tool description line 576. New `fewerAssertions` export goes here (divergence.ts imports harness, so the parser cannot live in `tools/divergence/` without a cycle).
- `conformance/tests/xaravel/divergence.test.ts:241-251` (XT-conformance-149 waiver cases), `:265-290` (XT-conformance-152 marker cases) -- add cases.
- `conformance/tests/xaravel/harness.test.ts:470-484` -- waiver fixture.
- `conformance/tests/xaravel/boost-framework.test.ts:417-422` -- divergence.get clause cases.

## Tasks & Acceptance

**Execution:**
- `tools/boost-framework/src/tools.ts` -- add `fewerAssertions(n, fields, body)` returning `{ clauses: Set<string>, problems: string[] }` with today's divergence.ts messages (without the file prefix); `divergenceGet` returns `exists: false` + note for a missing clause; update the description.
- `tools/divergence/divergence.ts` -- use `fewerAssertions`; scan with block-comment state carried across lines; update header.
- `conformance/harness/harness.ts` -- `waiverFor` uses Boost `parseFrontmatter`, `fewerAssertions`; update header.
- Tests above -- add the matrix cases; harness fixture quoted with a clause.
- `docs/ops/divergence.md`, `docs/ops/harness.md`, `tools/boost-framework/docs/framework-mode.md` -- describe the new behaviour.

**Acceptance Criteria:**
- Given the matrix inputs, when `bun run divergence:check`, the harness and `divergence.get` run, then each gives the listed output.
- Given the real repo, when `bun run divergence:check` runs, then it passes with the same record and clause counts as before.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/divergence.test.ts conformance/tests/xaravel/harness.test.ts conformance/tests/xaravel/boost-framework.test.ts` -- expected: all pass
- `bun run divergence:check` -- expected: `Divergence OK`
- `bun run typecheck` and `bun run lint` -- expected: clean
- `bun test` -- expected: all pass

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 21 findings — high 0, medium 4, low 9, false 5, maybe-false 3
- findings:
  - `[medium]` `patch` (verification-gap) No test reopens a block after a `*/` on the same line, or starts inside a block and reopens it — added XT-conformance-152 cases `x(); /* a */ y(); /*…` (line 2) and `/*\n*/ y(); /*…` (line 3).
  - `[low]` `patch` (verification-gap) `fewer_assertions: null` message not pinned after the explicit branch moved into `fewerAssertions` — added an XT-conformance-149 failing row expecting `must be a list, got null`.
  - `[medium]` `patch` (edge-case) A `/*` in a string or glob opens a false block, so later code with `adapted:` text is flagged — the block walk now skips '…', "…" and `…` literals on the line; glob case added (exit 0, 0 markers).
  - `[medium]` `patch` (edge-case) A `//` inside a string ahead of a real `/*` stops the walk, so the block's continuation markers are not checked — same fix; `"http://x"; /*` case added (line 2 reported).
  - `[medium]` `patch` (edge-case) Docstring claim "can only read more, never less" is false — docstring and docs/ops/divergence.md now state the remaining limit (regex literals, multi-line template literals).
  - `[maybe-false]` `reject` (edge-case) Intent "every line inside a block is scanned" not met for unparsed literals — after the patch only regex literals and multi-line templates remain, documented; would need a full TS lexer; markers sit in comments in practice and nothing checked before is unchecked.
  - `[low]` `reject` (edge-case) Harness waives for a record that fails other `checkRecord` rules — `divergence:check` runs in CI on every PR, so such a record cannot merge; the docs describe the per-item rule accurately; fix would add a second record validator to the harness.
  - `[medium]` `patch` (intent) `"http://x"; /*` hides a block (same root cause as the edge-case string finding) — fixed by the string-skipping walk.
  - `[false]` `reject` (intent) `exists` is overloaded for a missing clause — the intent asks that a missing clause be reported "as not found"; `frontmatter` and `note` distinguish the two cases and no code reads `exists`.
  - `[low]` `patch` (blind) `/*` in a template glob opens a false block — grouped with the string fix.
  - `[low]` `patch` (blind) "never less" docstring is false — grouped with the string fix.
  - `[low]` `patch` (blind) No tests for known-bad shapes (block after code, string `/*`, string `//`) — cases added as above.
  - `[false]` `reject` (blind) Docs say "exactly" but the harness checks less — divergence.md's "exactly when" names the per-item conditions the harness does check; see the CI argument above.
  - `[false]` `reject` (blind) `exists: false` means two things — same refutation as the intent row.
  - `[low]` `patch` (blind) framework-mode.md Limits still says other-form records give no clauses only — added the `DIV-<n>.<k>` → `exists: false` note.
  - `[maybe-false]` `reject` (blind) Harness lacks null / non-list / `"02"` waiver cases — those branches are in the shared `fewerAssertions`, tested through divergence:check; the harness case set covers the boolean wiring (valid, unquoted, missing clause); would only be low.
  - `[low]` `patch` (blind) XT-conformance-149 does not pin the null message — row added (same as the verification-gap row).
  - `[low]` `reject` (blind) Duplicate `["2","2"]` items accepted — pre-existing behaviour, not caused by this change; a duplicate grants nothing extra.
  - `[maybe-false]` `reject` (blind) Harness now depends on Boost's tool module, reversing the documented mirror direction — harness already reaches Boost `data.ts` through pin-bump, `graph:check` passes; the framework-mode mirror table covers data Boost mirrors, not this parser; would only be low.
  - `[false]` `reject` (blind) PORTING.md §Grader should name the quoted rule — its sentence ("only clauses listed … waive it") stays true, and the quoted rule lives in docs/ops/divergence.md, which it cites through ESC-5.3-2.
  - `[false]` `reject` (blind) Sprint status still has the item open; spec bookkeeping — sprint status is set after the build by the orchestrator; header line wrap fixed (low, patched with this row).

## Auto Run Result

Status: done

**Summary.** `divergence:check` now carries `/* */` block state across lines (string literals skipped by the walk), so markers on block-comment continuation lines are checked (L1). One `fewer_assertions` parser, Boost's `fewerAssertions`, serves `divergence:check` (problems) and the harness waiver (valid items only): an unquoted number or an item naming no clause waives nothing (L2). Boost `divergence.get` with `DIV-<n>.<k>` for a clause the record lacks returns `exists: false`, the record's frontmatter, `clauses: []` and a note (L3).

**Files.**
- `tools/boost-framework/src/tools.ts` -- `fewerAssertions`; missing-clause result; tool description.
- `tools/divergence/divergence.ts` -- `scannedTail` block walk; uses `fewerAssertions`; header.
- `conformance/harness/harness.ts` -- `waiverFor` uses Boost `parseFrontmatter` + `fewerAssertions`; local `frontmatterOf` removed.
- `conformance/tests/xaravel/divergence.test.ts` -- XT-conformance-149 null row; XT-conformance-152 block, string and reopen cases.
- `conformance/tests/xaravel/harness.test.ts` -- XT-conformance-103 waiver fixture `["2"]` with clause; `[2]` and missing-clause cases unwaived.
- `conformance/tests/xaravel/boost-framework.test.ts` -- `DIV-3.99` missing-clause case.
- `docs/ops/divergence.md`, `docs/ops/harness.md`, `tools/boost-framework/docs/framework-mode.md` -- behaviour and limits.

**Review.** 21 findings: 11 rows patched (4 medium, 7 low, in 5 fixes), 0 deferred, 10 rejected with reasons in the triage log.

**Follow-up review:** recommended (`true`): four medium entries were patched; the unverified risk is the new string-skipping walk in `scannedTail`, which is a heuristic lexer with no real Ported Tests to run against yet.

**Verification.** `bun test` 289 pass / 0 fail; `bun run harness` SUMMARY differ=0 (4 Variants run, 7 NOT-RUN); `bun run divergence:check` OK with unchanged counts (12 records, 39 clauses); `bun run typecheck`, `bun run lint`, `bun run graph:check` clean.

**Residual risks.** Regex literals and multi-line template literals are not parsed by the block walk; the real repo has 0 Ported Tests, so the scan has only fixture coverage until the first Ported Tests land.
