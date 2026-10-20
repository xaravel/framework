---
title: 'Retro 7 item 3: harden the framework-mode tool tests'
type: 'chore'
created: '2026-10-20'
status: 'done'
baseline_revision: '145a92994a56255482d9fac0b4b7c9fa9fbcc9c3'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-retro-2026-10-19.md'
warnings: []
deferred:
  - summary: >-
      Story 8.1's own done check does not run XT-boost-1, so its Divergence Records meet the clause check only in CI's full Xaravel run.
    evidence: |-
      story:check's xaravel-tests clause runs only the Story's own xaravel_test_ids; XT-boost-1 belongs to Story 7.3. CI's `bun run harness --xaravel` (ci.yml) runs it on every PR, so a bad record still fails a PR check, but not 8.1's local done check. Listing XT-boost-1 in stories/8.1.md is a manifest edit outside this retro item.
    location: >-
      stories/8.1.md xaravel_test_ids
    severity: low
---

<intent-contract>

## Intent

**Problem:** XT-boost-6's `callEveryTool` says "each tool was called successfully at least once" but asserts only `0 < errors < calls.length` over all calls, so a tool that always errors passes (epic 7 retro L3). `divergence.get`'s clause parser has run only on the fixture's `DIV-3`; no real `decisions/DIV-*.md` exists yet, so nothing will check Story 8.1's records against it (S6). Action item `epic-7-retro-item-3-boost-tool-tests`.

**Approach:** Count successes per tool name in `callEveryTool` and assert every name in `TOOL_NAMES` has at least one successful call, keeping the existing aggregate assertions. In XT-boost-1's real-repository section, list every `decisions/DIV-*.md`, require each file name to be a `DIV-<n>.md` the tool can address, and require `divergence.get` (through the stdio server) to return `exists: true` with at least one clause, each clause id `DIV-<n>.<k>`. While there are none, assert the listing is empty and that `divergence.get` on `DIV-1` reports `exists: false`, so the check is explicit, not silent.

## Boundaries & Constraints

**Always:** Only `conformance/tests/xaravel/boost-framework.test.ts` changes (plus this spec and sprint status). Keep every existing assertion. Per-case messages name the tool or record, in the file's `expect(\`<name>: …\`).toBe(…)` style.

**Never:** Changing `tools/boost-framework/src/**`, `conformance/expectations/**`, the spine, SPEC, PRD, `epics.md`, `AGENTS.md`, or any Story manifest; adding a new Test ID.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| A tool always errors | e.g. every `story.tests` call returns `isError` | XT-boost-6 fails naming `story.tests` | none |
| No real records (today) | `decisions/` has no `DIV-*.md` | listing empty; `DIV-1` reports `exists: false`; test passes | none |
| A real record with no parsable clause | `decisions/DIV-2.md` whose clauses use `DIV 2.1` | XT-boost-1 fails naming `DIV-2` | none |
| A misnamed record | `decisions/DIV-02.md` | XT-boost-1 fails naming the file | none |

</intent-contract>

## Code Map

- `conformance/tests/xaravel/boost-framework.test.ts:33` -- `TOOL_NAMES`, the six tool names.
- `conformance/tests/xaravel/boost-framework.test.ts:1172-1207` -- `callEveryTool`; aggregate-only assertions at `:1203-1205`. Called at `:1131` (XT-boost-5), `:1263` and `:1277` (XT-boost-6). On the real repo, `divergence.get` for a missing record is a success (`exists: false`), so all six tools succeed in every caller.
- `conformance/tests/xaravel/boost-framework.test.ts:449-462` -- XT-boost-1's real-repository `withServer(null, …)` block; add the DIV loop here.
- `tools/boost-framework/src/tools.ts:397-466` -- `DIV_ID`, `CLAUSE_START`, `divergenceClauses`, `divergenceGet` (read-only reference). Records live at `decisions/DIV-<n>.md`.

## Tasks & Acceptance

**Execution:**
- `conformance/tests/xaravel/boost-framework.test.ts` -- in `callEveryTool`, count successes per tool, assert the called names equal `TOOL_NAMES` and each has a success; fix the comment. In XT-boost-1's real-repo block, add the `DIV-*.md` loop and the empty-case assertions.

**Acceptance Criteria:**
- Given `callEveryTool`, when any one tool errors on every call, then the test fails naming that tool (checked by a temporary local mutation, not committed).
- Given a real `decisions/DIV-<n>.md` with no clause the parser recognises, when XT-boost-1 runs, then it fails naming the record (checked by a temporary file outside git tracking, removed afterwards).
- Given the current repository, when `bun run harness --xaravel` runs, then everything passes.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 20 findings — high 0, medium 2, low 10, false 8, maybe-false 0 (2 low rejected, 1 deferred)
- findings:
  - `[medium]` `[patch]` (verification-gap) The DIV-record loop never runs in CI (no real records) and no committed test proves it can pass or fail — grouped with blind #1; the loop became `divergenceRecordProblems`, which returns messages; XT-boost-1 asserts `[]` on the fixture's good `DIV-3` and the exact problems for misnamed, lowercase and clause-less fixture records, and `[]` on the real repository.
  - `[low]` `[patch]` (verification-gap other) Case-sensitive `DIV-*.md` filter silently skips `div-2.md` — the listing now takes every `/^div/i` entry and reports any name that is not exactly `DIV-<n>.md`.
  - `[low]` `[patch]` (verification-gap other) `expect(records).toEqual([])` inside `records.length === 0` is a tautology — removed; the empty case now asserts `decisions/` exists and keeps the `DIV-1 exists: false` check.
  - `[low]` `[patch]` (edge) Misnamed record of different case or extension skipped — same patch as the filter row.
  - `[false]` `[reject]` (edge) A `DIV-<n>.md` directory or dangling symlink fails without naming its cause — `divergence.get` then returns an error, which the per-record message names with the record id and error text.
  - `[false]` `[reject]` (edge) A null clause element throws a TypeError — `divergenceClauses` only builds `{id, text}` objects (`tools.ts:419-425`); unreachable.
  - `[low]` `[patch]` (edge) Empty-listing assertion vacuous — same patch as the tautology row.
  - `[false]` `[reject]` (edge) Action item marked `done` before review ends — the status lands in the same commit as the reviewed, finished change; nothing reads it in between.
  - `[medium]` `[patch]` (blind) The loop never runs today and has no fixture coverage — same patch as the verification-gap row.
  - `[low]` `[patch]` (blind) Tautological `toEqual([])` — same patch as the tautology row.
  - `[low]` `[patch]` (blind) Narrow misnamed-record filter — same patch as the filter row.
  - `[low]` `[defer]` (blind) Story 8.1's own `story:check` will not run XT-boost-1; only CI's `bun run harness --xaravel` will — listing XT-boost-1 in 8.1's manifest is outside this item (manifests are not edited); recorded in `deferred`.
  - `[low]` `[reject]` (blind) Nothing checks the full DIV-1..12 set or frontmatter `id` — the record format and set are Story 8.1's contract and its own tests; checking them here would freeze a format no done Story owns (LESSONS, epic 2).
  - `[low]` `[reject]` (blind) Clause-id check is near-tautological; add duplicate and non-empty checks — the parser builds ids and always keeps the start line, so these checks cannot fail either; the discriminating assertion is "at least one clause".
  - `[false]` `[reject]` (blind) Sprint status `done` while spec `in-review` — same refutation as the edge row.
  - `[low]` `[patch]` (blind) Name-set assertion depends on `TOOL_NAMES` being written sorted — compares with `[...TOOL_NAMES].sort()`.
  - `[false]` `[reject]` (blind) Spec omits XT-boost-5 as a caller and has stale Code Map lines — fix edits this build's spec.
  - `[false]` `[reject]` (intent) Helper change also tightens XT-boost-5 — stricter, not a defect; the intent asks for per-case assertions.
  - `[false]` `[reject]` (intent) Real-repo `divergence.get` success is the missing-record path — matches the intent's "(non-isError)"; the parser path is covered by the fixture and by the new record check.
  - `[false]` `[reject]` (intent) Added to XT-boost-1 instead of a new Test ID — a new ID needs a manifest edit outside this item; XT-boost-1 is the test that covers the six tools over stdio.

## Verification

**Commands:**
- `bun run typecheck` -- expected: clean
- `bun run lint` -- expected: clean
- `bun test conformance/tests/xaravel/boost-framework.test.ts` -- expected: pass
- `bun run harness --xaravel` -- expected: pass

## Auto Run Result

- **Summary:** `callEveryTool` (XT-boost-5, XT-boost-6) now counts successes per tool and fails naming any of the six tools that never succeeds; the called-name set must equal `TOOL_NAMES`. A new helper, `divergenceRecordProblems`, lists every `decisions/div*` entry and checks each through `divergence.get` over stdio: an exact `DIV-<n>.md` name, no error, `exists: true`, at least one clause, clause ids `DIV-<n>.<k>`. XT-boost-1 asserts it returns nothing on the real repository (none exist until Story 8.1) and on the fixture's `DIV-3`, and the exact problems for a misnamed, a lowercase and a clause-less fixture record.
- **Files:**
  - `conformance/tests/xaravel/boost-framework.test.ts`: per-tool success in `callEveryTool`; `divergenceRecordProblems`; its fixture and real-repository assertions in XT-boost-1.
  - `_bmad-output/implementation-artifacts/sprint-status.yaml`: `epic-7-retro-item-3-boost-tool-tests` set `done`.
- **Review:** 7 rows patched across 4 entries (2 medium in one entry, the rest low); 1 low deferred (Story 8.1's done check does not run XT-boost-1); 2 low and 8 false rejected, with reasons in the triage log.
- **Follow-up review recommended:** false. One medium entry was patched (two layers reporting the same root cause), and its fix is covered by committed fixture cases.
- **Verification:**
  - `bun run typecheck` and `bun run lint` are clean.
  - `bun test conformance/tests/xaravel/boost-framework.test.ts`: 6 pass.
  - `bun run harness --xaravel`: 265 of 265 pass.
  - Before the review patch, the implementer checked by temporary mutation that a tool that never succeeds fails with `story.tests: never succeeded`.
- **Residual risks:** Real Divergence Records are first checked when Story 8.1 lands; a record format the parser does not recognise will then fail XT-boost-1 in CI, which is the intent.
