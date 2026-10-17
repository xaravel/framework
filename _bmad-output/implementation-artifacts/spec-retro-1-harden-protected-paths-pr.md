---
title: 'Harden protected-paths pr: validate changed_files, head mirror from every after-phase marker (retro epic-1 item 10)'
type: 'bugfix'
created: '2026-10-17'
status: 'done'
baseline_revision: '90ec1b520c91cce8477fdc2b920d19eae73bcf09'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `protected-paths pr` trusts the `GET /pulls/<n>` body. If `changed_files` is missing, `pr.files.length < undefined` is false and the truncation guard silently turns off (`tools/protected-paths/protected-paths.ts:410`). `ownership` and `escalations` already reject such a body. Separately, the head CODEOWNERS mirror check probes only `decisions/PHASE-1-EXIT.md` at the head (`:417`, `:425`), so a head list entry marked `after-phase:2` (or any `n ≠ 1`) is never activated in the expected rendering (retro finding D10).

**Approach:** After fetching the PR, fail closed with `GET /pulls/<n>: missing head.sha or changed_files` (the existing `Protected Paths check failed: …` line, exit 1) when `head.sha` is not a string or `changed_files` is not a number, as the sibling checks do. Build the head mirror's Phase set by parsing the head list, collecting every distinct `after-phase:<n>` marker, and probing `decisions/PHASE-<n>-EXIT.md` at the head commit for each; a Phase is active when its file exists.

## Boundaries & Constraints

**Always:** Fail closed (exit 1) on a malformed pull body and on any probe API error other than 404. Probe only Phases the head list names; if the head list is missing or fails to parse, probe nothing (the existing `missing list` / `codeowners drift` violation still reports it). Base-side behaviour (`activePhases(root)` for the base list) is unchanged. Every existing XT-conformance-17..20 assertion is kept unchanged.

**Never:** No edit to `conformance/protected-paths`, `.github/CODEOWNERS`, `.github/workflows/protected-paths.yml`, `tools/ownership/`, `tools/escalations/`, `AGENTS.md`, the spine, SPEC, PRD or `epics.md`. No change to violation wording other than the new error message. No shared `tools/lib` (deferred in the retro's duplication map).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pull body lacks `changed_files` | `/pulls/7` → `{head:{sha}}` | stderr `Protected Paths check failed: GET /pulls/7: missing head.sha or changed_files` | exit 1 |
| Pull body lacks `head.sha` | `/pulls/7` → `{changed_files:1}` | same line | exit 1 |
| Head list has `x after-phase:2`, head has `PHASE-2-EXIT.md`, CODEOWNERS includes `x` | — | no drift; `contents/decisions/PHASE-2-EXIT.md` requested | exit per other rules |
| Same, CODEOWNERS omits `x` | — | `codeowners drift` naming the missing line | exit 1 |
| Head list has `x after-phase:2`, no `PHASE-2-EXIT.md`, CODEOWNERS omits `x` | — | no drift | — |
| Head list has only `after-phase:1` (committed list) | — | unchanged from today (PHASE-1 probed) | — |

</intent-contract>

## Code Map

- `tools/protected-paths/protected-paths.ts` -- header comment 1-25 (describe the head mirror's Phase rule under `pr`); `parseList` 80-111 (reuse to read head markers); `pr()` 395-436: pull fetch at 404-405 (add validation), `Promise.all` at 406-412 (drop the hard-coded PHASE-1 probe, probe after reading the head list), mirror call at 418 (pass the probed set). `GitHub.contents` returns null on 404 and throws otherwise.
- `tools/ownership/ownership.ts:441-445`, `tools/escalations/escalations.ts:620-625` -- the sibling validation pattern and message shape (read-only).
- `conformance/tests/xaravel/protected-paths.test.ts` -- `FakePr` 84-93 (add an optional `pull` body override); `runPr` 100-150 (serve it at `/pulls/7`); XT-conformance-19 287-378 (add cases beside the truncation and `exitedHead` cases).

## Tasks & Acceptance

**Execution:**
- `tools/protected-paths/protected-paths.ts` -- validate the pull body; export `markedPhases(entries): number[]` (distinct `afterPhase` values, ascending); in `pr()` fetch files, reviews, head list and head CODEOWNERS, then probe `decisions/PHASE-<n>-EXIT.md` at the head for each marked Phase of the parsed head list (empty when absent/unparseable) and pass that set to `checkMirror`; update the header comment -- closes D10.
- `conformance/tests/xaravel/protected-paths.test.ts` -- in XT-conformance-19 add the six matrix rows (both malformed bodies, the three `after-phase:2` cases using a head list of `listText + "/docs/ after-phase:2\n"` and a fixture with the `PHASE-2-EXIT.md` probe, and assert the committed-list case requests `contents/decisions/PHASE-1-EXIT.md`); add a unit assertion for `markedPhases`.

**Acceptance Criteria:**
- Given a PR whose `/pulls/<n>` body omits `changed_files`, when the check runs, then it exits 1 rather than passing with the truncation guard off.
- Given a head list with an `after-phase:<n>` entry for `n ≠ 1` and that Phase's exit file at the head, when the head CODEOWNERS omits the entry, then the check reports `codeowners drift`.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 21 findings — high 0, medium 0, low 15, false 6, maybe-false 0
- findings:
  - `[low]` `[patch]` (verification-gap) The malformed-head-list branch (try/catch around `markedPhases(parseList(...))`) is untested; removing it would hide other violations behind one generic failure — added a `runPr` case with `/x/ bogus`: exit 1, the `unknown marker` drift line and `protected path: bun.lock` both reported, no `PHASE-` probe requested.
  - `[low]` `[reject]` (edge) An empty `head.sha` passes and `?ref=` reads the default branch — GitHub always returns a 40-hex head SHA; the fix adds a new guard for an input never shown reachable.
  - `[low]` `[reject]` (edge) A JSON `null` pull body throws a raw `TypeError` — still exits 1 through `main`'s fail-closed handler; only the message differs.
  - `[low]` `[reject]` (edge) A negative or fractional `changed_files` disables the guard — GitHub never returns one; the siblings (ownership, escalations) check `typeof` only and the fix adds a range rule.
  - `[low]` `[reject]` (edge) `after-phase:01` or a huge marker number makes head probing diverge from base `activePhases` — needs a non-canonical marker in the Maintainer-owned list; the fix tightens the list grammar, outside this item.
  - `[low]` `[reject]` (edge) A head list with many distinct markers fires unbounded parallel probes — only the PR author's own check can fail (closed) on a rate limit; a cap adds complexity for a self-inflicted case.
  - `[low]` `[reject]` (blind) Empty `head.sha` — same as the edge row; rejected for the same reason.
  - `[low]` `[reject]` (blind) `changed_files` range — same as the edge row; rejected for the same reason.
  - `[low]` `[patch]` (blind) The pull body type claims `head.sha` is always present while the code uses `?.` — retyped as `{ head?: { sha?: unknown } | null; changed_files?: unknown }`; the `typeof` checks narrow it. (The `null`-body part is rejected as above.)
  - `[low]` `[reject]` (blind) Unbounded probe count — same as the edge row.
  - `[low]` `[reject]` (blind) Head probe vs base scan treat padded exit names differently — same as the edge `after-phase:01` row.
  - `[low]` `[patch]` (blind) No test shows a failing exit-file probe fails closed — added a case with `contents/decisions/PHASE-2-EXIT.md` answering 500: exit 1, `Protected Paths check failed: … HTTP 500`.
  - `[low]` `[patch]` (blind) No test covers the malformed or missing head list probing nothing — covered by the verification-gap patch above.
  - `[low]` `[patch]` (blind) The malformed-body loop lacks a non-number `changed_files` — added `changed_files: "1"`.
  - `[false]` `[reject]` (blind) The header comment does not list the new fail-closed line — the header lists violation kinds; `Protected Paths check failed:` lines (API errors) were never listed there, and `main`'s comment covers them.
  - `[low]` `[reject]` (blind) The Phase 2 drift assertion hard-codes `line 25` — the existing `drift` case already pins line 25 the same way; consistent with the file, and a list edit updates both together.
  - `[low]` `[patch]` (blind) No case activates two Phases at once — added a head with both exit files and CODEOWNERS rendered for `{1, 2}`: no drift, both probes requested.
  - `[false]` `[reject]` (intent) Validation lives in `pr()`, not in `evaluatePr` (reading A3) — the sibling checks validate in the CLI the same way, and `PrInput.changedFiles` is typed `number`, so no in-process caller can pass `undefined` under `tsc --strict`.
  - `[false]` `[reject]` (intent) No `changed_files` value-range check (reading A2) — the intent names parity with ownership and escalations, which check `typeof` only.
  - `[false]` `[reject]` (intent) Phases come from head-list markers only, not base or union (reading B2) — the intent is the head mirror; the base list's Phases already come from `activePhases(root)`.
  - `[false]` `[reject]` (intent) `markedPhases` unit assertions sit in XT-conformance-17 — that test already asserts the list "marks contracts after-phase:1", which is what `markedPhases(entries) = [1]` checks; descriptive, no harm named.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/protected-paths.test.ts` -- expected: all pass
- `bun test`, `bun run typecheck`, `bun run lint` -- expected: pass
- `bun run protected-paths:codeowners --check` -- expected: mirrors (if the script exists)

## Auto Run Result

Status: done

**Summary:** `protected-paths pr` now fails closed (`Protected Paths check failed: GET /pulls/<n>: missing head.sha or changed_files`, exit 1) when the pull body lacks a string `head.sha` or a numeric `changed_files`, so the truncation guard can no longer turn off silently. The head CODEOWNERS mirror is now checked against every Phase the head list marks `after-phase:<n>`, each active when `decisions/PHASE-<n>-EXIT.md` exists at the head commit, instead of Phase 1 only (retro finding D10).

**Files changed:**
- `tools/protected-paths/protected-paths.ts` -- pull body validation and typing; new export `markedPhases`; head Phase probing from the head list's markers; header comment.
- `conformance/tests/xaravel/protected-paths.test.ts` -- `FakePr.pull` override; XT-conformance-17 `markedPhases` assertions; XT-conformance-19 cases for three malformed bodies, Phase 2 active/stale/open, Phases 1 and 2 together, a failing exit probe, a malformed head list, and the Phase 1 probe request.

**Review findings:** 21. Patched 6 low entries (5 root causes): malformed head list test, pull body type, failing probe test, string `changed_files` case, two-Phase case. Nothing deferred. Rejected: empty SHA, `null` body, `changed_files` range, padded or huge markers, unbounded probes (each needs an input GitHub or the Maintainer-owned list does not produce, or fails closed already), the header-comment, line-25 and test-placement nits, and the A2/A3/B2 readings (parity with the sibling checks; the head mirror is head-side). Reasons are in the triage log.

**Follow-up review:** false. Patched entries: high 0, medium 0, low 6.

**Verification:** `bun test` 39 pass, 0 fail. `bun run typecheck` and `bun run lint` are clean. `bun run protected-paths:codeowners --check` reports the mirror holds. The implementer confirmed the new assertions fail against the old tool.

**Residual risks:** a PR-authored head list can name many Phases and trigger many parallel probes; at worst its own check fails closed on a rate limit.
