---
title: 'Retro 6 item 5: one grader list for the lint plugin'
type: 'refactor'
created: '2026-10-19'
status: 'done'
baseline_revision: '842e0667448f69b4f741a5131b7c61d6b0bf4dc9'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/ops/lint.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-retro-2026-10-19.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The grader list exists three times (finding R5): `GRADER_PACKAGES` in `tools/lint-rules/plugin.ts`, the regex `GRADER_LOCATIONS` hard-coding `(assert|mockery)` in the same file, and `kind: "grader"` rows in `tools/scaffold/packages.jsonl`. Only `GRADER_PACKAGES` is compared with the table (`registration.test.ts:162`), so adding a grader package to the table and to `GRADER_PACKAGES` would leave the identity-rule exemption stale.

**Approach:** Build `GRADER_LOCATIONS` from `GRADER_PACKAGES`, and add a Xaravel Test that reads the committed package table and checks both `GRADER_PACKAGES` and `isGraderLocation` / `isFrameworkSource` against its `kind: "grader"` rows.

## Boundaries & Constraints

**Always:** behaviour on today's tree is unchanged (`assert`, `mockery`, `conformance/`, `tools/` exempt, nothing else); every existing assertion in `conformance/tests/xaravel/lint-rules.test.ts` and `registration.test.ts` keeps passing; package names are regex-escaped when interpolated.

**Never:** change `.oxlintrc.json`, rule names, messages or levels; edit `tools/scaffold/packages.jsonl`, `AGENTS.md`, `conformance/expectations/**` or Protected Path tooling; remove or weaken any assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Grader package under `packages/` | each `kind: "grader"` row with `dir` `packages/<p>` | `<p>` ∈ `GRADER_PACKAGES`; `isGraderLocation("<dir>/src/X.ts")` and `("/tmp/t/<dir>/src/X.ts")` true; `isFrameworkSource("<dir>/src/X.ts")` false | — |
| Grader outside `packages/` | `tools/boost-framework` row | `isGraderLocation("tools/boost-framework/src/X.ts")` true; not required in `GRADER_PACKAGES` | — |
| Non-grader package | every other row with `dir` `packages/<p>` | `isGraderLocation("<dir>/src/X.ts")` false; `isFrameworkSource("<dir>/src/X.ts")` true | — |
| Exact set | `GRADER_PACKAGES` | equals the set of grader rows under `packages/` (no extras) | — |

</intent-contract>

## Code Map

- `tools/lint-rules/plugin.ts:141-142` -- `GRADER_PACKAGES` (the one source in code).
- `tools/lint-rules/plugin.ts:172-173` -- `GRADER_LOCATIONS` regex hard-codes `(assert|mockery)`; derive it from `GRADER_PACKAGES` with escaped names.
- `tools/lint-rules/plugin.ts:183-198` -- `isFrameworkSource`, `isGraderLocation` (unchanged logic).
- `tools/scaffold/table.ts:269` -- `readTable(path)` returns `PackageRow[]` with `name`, `dir`, `kind`; reuse it in the test.
- `conformance/tests/xaravel/lint-rules.test.ts:189,337` -- `pathCases()` called inside XT-conformance-132; add a sibling `graderListCases()` called next to it.
- `conformance/tests/xaravel/registration.test.ts:162` -- existing `GRADER_PACKAGES` vs table check; leave as is.
- `docs/ops/lint.md:37` -- path-scope paragraph; add one sentence that the grader packages come from `GRADER_PACKAGES`, checked against the table's `kind: "grader"` rows.

## Tasks & Acceptance

**Execution:**
- `tools/lint-rules/plugin.ts` -- replace the hard-coded alternation in `GRADER_LOCATIONS` with one built from `GRADER_PACKAGES` (escape regex metacharacters) -- one grader list in code.
- `conformance/tests/xaravel/lint-rules.test.ts` -- add `graderListCases()` covering every matrix row from `readTable(join(root, "tools/scaffold/packages.jsonl"))`, and call it beside `pathCases()` -- the table and both code lists stay in step.
- `docs/ops/lint.md` -- add the sentence above.

**Acceptance Criteria:**
- Given the repository, when `bun test conformance/tests/xaravel/lint-rules.test.ts conformance/tests/xaravel/registration.test.ts`, `bun run lint`, `bun run lint:disables` and `bun run typecheck` run, then all pass.
- Given a `kind: "grader"` row added under `packages/` without updating `GRADER_PACKAGES`, when the lint-rules test runs, then it fails.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 11, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` (edge-case) non-grader rows outside `packages/` (e.g. `installer`) were never checked against the exemption — the non-grader `isGraderLocation` false checks now run on every non-grader row outside `tools/` and `conformance/` (exempt wholesale by ESC-6.2-1), with a guard that one such row exists.
  - `[low]` `[reject]` (edge-case) an empty `GRADER_PACKAGES` yields `packages/()/` — unreachable on the real table (the test asserts grader rows exist and set-equality with the list); a guard would add a branch for a state nobody meets.
  - `[false]` `[reject]` (blind) the test passes against the old hard-coded regex — on today's table both regexes are identical, so nothing is lost; the drift the item targets (a grader added to the table and `GRADER_PACKAGES`) fails the per-row `isGraderLocation` check under a hard-coded regex, and cannot occur with the derived one.
  - `[low]` `[reject]` (blind) AC2 was already met by `registration.test.ts:162` — the fix would edit this build's spec.
  - `[low]` `[reject]` (blind) the test re-implements `graderPackages()` — both read the same committed table with the same `packages/<p>` rule; the duplicate check costs nothing and the per-row predicate checks need the rows anyway.
  - `[false]` `[reject]` (blind) naming `tools/boost-framework` makes the test fail when that row moves — failing loudly on a table change is the intended behaviour; the per-row loop covers any grader root generally.
  - `[low]` `[reject]` (blind) empty `GRADER_PACKAGES` builds a wrong pattern — same as the edge-case row above.
  - `[low]` `[patch]` (blind) `isFrameworkSource` asserted only on cwd-relative paths — added the `/tmp/t/` absolute form for grader (false) and non-grader (true) package rows.
  - `[low]` `[patch]` (blind) the `lint.md` sentence omits the JSON.stringify scope, XT-conformance-141, and editing the list with the table — sentence extended with all three.
  - `[low]` `[reject]` (blind) `escapeRegExp` escapes `/` needlessly and has no direct test — `\/` is a valid identity escape in a non-unicode RegExp; no package name has a metacharacter, so no one meets it.
  - `[low]` `[reject]` (blind) the spec's Code Map line numbers are stale — fix edits this build's spec.
  - `[low]` `[reject]` (blind) XT-conformance-132's title does not mention the table — a Test ID title change has wider reach than this item; the function's doc comment names the check.
  - `[false]` `[reject]` (intent) `GRADER_LOCATIONS` is tested through `isGraderLocation` rather than directly — the constant is private and the predicate is its only consumer (`plugin.ts` identity rule), so the predicate is the outermost surface.
  - `[low]` `[patch]` (intent) the `installer` non-grader row was not compared with the exemption — same root cause and fix as the edge-case row above.
  - `[false]` `[reject]` (intent) `tools/boost-framework`'s check passes only through the blanket `tools/` exemption — that exemption is the ruled behaviour (ESC-6.2-1); the check proves the row is exempt, which is what the table requires.
  - `[false]` `[reject]` (intent) the coverage sits in `lint-rules.test.ts`, not `registration.test.ts` — the intent asks to test both lists, not where; the lint test owns `GRADER_LOCATIONS`.
- note: during implementation the subagent temporarily edited `tools/scaffold/packages.jsonl` to prove the test fails on drift and restored it (verified unchanged by `git status`); against the epic 4 lesson on temporarily overwriting tracked files.

## Auto Run Result

Status: done

- **Change:** `GRADER_LOCATIONS` in `tools/lint-rules/plugin.ts` is built from `GRADER_PACKAGES` (names regex-escaped), so the code holds one grader list; XT-conformance-132's new `graderListCases()` checks that list, the identity exemption and the JSON.stringify scope against the `kind: "grader"` rows of `tools/scaffold/packages.jsonl`.
- **Files:** `tools/lint-rules/plugin.ts` (derived pattern, `escapeRegExp`); `conformance/tests/xaravel/lint-rules.test.ts` (`graderListCases`); `docs/ops/lint.md` (one-list paragraph).
- **Review:** 4 low patches applied (3 entries), 0 deferred, 12 rejected as logged above.
- **Follow-up review:** false (no high or medium patched).
- **Verification:** `bun test conformance/tests/xaravel/lint-rules.test.ts conformance/tests/xaravel/registration.test.ts` 4 pass / 0 fail; `bun run lint`, `bun run lint:disables`, `bun run typecheck` exit 0. Drift (a non-grader row flipped to `grader`) fails XT-conformance-132.
- **Residual risk:** escaping is not exercised by any real package name.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/lint-rules.test.ts conformance/tests/xaravel/registration.test.ts` -- expected: pass
- `bun run lint && bun run lint:disables && bun run typecheck` -- expected: exit 0
