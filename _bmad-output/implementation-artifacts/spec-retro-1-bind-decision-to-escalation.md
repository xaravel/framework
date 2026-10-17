---
title: 'Epic 1 retro item 3: bind each Escalation decision to the Escalation content it rules on'
type: 'bugfix'
created: '2026-10-17'
status: 'done'
baseline_revision: '550883a7cc5ac4a4c92e77cb9dce303e19e6b5e9'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-escalation-and-decision-records.md'
warnings: []
deferred:
  - summary: >-
      `pr` skips removed or renamed Escalation files, so deleting a decided Escalation leaves an orphan decision that only `check` on main reports.
    evidence: |-
      prPaths skips status removed (pre-existing since Story 1.6) and ignores previous_filename; XT-conformance-26 pins `gone.refs == []`. Fix by fetching decisions/<id>.md for removed/renamed Escalations and reporting orphan decision.
    location: >-
      tools/escalations/escalations.ts prPaths / evaluatePr
    severity: medium
  - summary: >-
      The spine (line 379) and the MAINT ruling still describe a decision file as `decision:` (+ `decided_by`) only; nothing outside the tool header tells a decision author to add `escalation_sha256` (from `digest <id>`).
    evidence: |-
      ARCHITECTURE-SPINE.md:379 and decisions/MAINT-2026-10-16-unattended-orchestrator.md are Protected / Maintainer-owned and out of this item's allowed edits. The parse error names the field and the `digest <id>` command, so the first author is told at check time.
    location: >-
      _bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md:379
    severity: medium
---

<intent-contract>

## Intent

**Problem:** A decision file records only `decision:`, so after `decisions/ESC-9.1-1.md` approves an Escalation, a later commit can widen `conformance/escalations/ESC-9.1-1.md` (not a Protected Path, editable by its Story) and `escalationStatus` still answers `approved` (retro finding D1).

**Approach:** Every Escalation decision file carries a required `escalation_sha256:` field, the SHA-256 of the Escalation file it rules on. `check`, `pr` and `escalationStatus` compare it with the Escalation's current content; a mismatch is a `stale decision:` violation and the Escalation counts as `open`. A `digest <id>` CLI command prints the value to write.

## Boundaries & Constraints

**Always:** keep the spine's contract (`decision: approved | rejected`; approved only when a valid decision file exists) — the binding is an extra field and an extra check; digest = lowercase hex SHA-256 of the Escalation text with CRLF normalised to LF; `escalationStatus` stays fail-closed (mismatch → `open`, never `approved`); `pr` reads all content from the API as data; new violation kind documented in the file header; every existing XT-conformance-26..29 assertion keeps its expected value except where it pins the exact set of fetched refs, which grows to include the decision lookup.

**Never:** edit AGENTS.md, the PRD, spine, SPEC or `epics.md`; edit `conformance/protected-paths`, `tools/protected-paths/`, `tools/ownership/` or workflows; remove or loosen any assertion; add orphan detection for removed Escalations (separate gap, defer).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bound decision | decision digest == sha256(escalation) | `check` OK; status approved/rejected | none |
| Escalation edited after ruling | digest != sha256(current escalation) | `check`/`pr` report `stale decision: decisions/<id>.md ...`; status `open` | exit 1 |
| Missing / malformed digest | no `escalation_sha256`, or not 64 lowercase hex | `invalid decision: <file>: escalation_sha256 must be ...` | exit 1; status `open` |
| PR edits only a decided Escalation | escalation changed, decision unchanged at head | `pr` fetches `decisions/<id>.md` at head and reports stale | exit 1 |
| PR edits undecided Escalation | decision 404 at head | passes (no decision, no binding) | none |
| `digest` CLI | `digest ESC-9.1-1` | prints hex digest + newline, exit 0 | unknown/malformed id → exit 1 / 2 |

</intent-contract>

## Code Map

- `tools/escalations/escalations.ts` -- header comment lists commands and violation kinds (add `digest`, `stale decision`, field doc); `parseDecision` (~line 229) validates fields → add `escalation_sha256` format check and `digest` on `DecisionRecord`; `escalationStatus` (~258) → compare digest; `checkRecords` (~285) → compare for each decision whose Escalation exists; `pathsToFetch` (~330) → for each changed valid Escalation also fetch `decisions/<stem>.md`; `evaluatePr` (~350) → compare digests for changed decisions and for changed Escalations whose decision exists at head (decision absence is not `missing head file`); `main`/`USAGE` → add `digest`.
- `conformance/tests/xaravel/escalations.test.ts` -- `decision()` helper (line 49) must emit a matching `escalation_sha256` by default; XT-conformance-27 `own.refs` (line 217) becomes `[SHA, SHA]`; add stale/missing-digest/digest-CLI coverage to XT-conformance-27 and -28.
- `tools/protected-paths/protected-paths.ts:388` -- `GitHub.contents` returns null on 404 (read-only reuse).

## Tasks & Acceptance

**Execution:**
- `tools/escalations/escalations.ts` -- add `escalationDigest(text)`, required `escalation_sha256` in `parseDecision`, `stale decision:` checks in `checkRecords`, `escalationStatus` and `evaluatePr`, decision fetch in `pathsToFetch`, `digest` CLI command; update header -- closes D1.
- `conformance/tests/xaravel/escalations.test.ts` -- default the `decision()` helper to the digest of `escalation()`; add cases for each I/O row -- pins the binding.

**Acceptance Criteria:**
- Given an approved Escalation in a fixture root, when its `proposed:` is widened, then `check --root` exits 1 with `stale decision:` and `escalationStatus` returns `open`.
- Given a PR that changes only a decided Escalation file, when `pr` runs against the fake API, then it exits 1 with `stale decision:`.
- Given the repository root, when `bun run escalations:check` (or `check`) runs, then it still passes.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 14 findings — high 0, medium 3, low 8, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) Escalation-only PR with an invalid decision at head: the decision-validation branch in `evaluatePr` is untested — added a `judge` assertion in XT-conformance-27 expecting one `invalid decision: … escalation_sha256` line.
  - `[low]` `[reject]` (blind) `pr` success count includes the head-only decision — the decision was read and validated, so counting it as judged is accurate; cosmetic.
  - `[medium]` `[defer]` (blind) removed Escalation leaves its decision unchecked in `pr` — pre-existing (`prPaths` skips removed since Story 1.6); deferred.
  - `[medium]` `[defer]` (blind) decision contract documented only in the tool header — spine and MAINT ruling are out of this item's allowed edits; deferred for the Maintainer.
  - `[low]` `[patch]` (blind) `decision()` helper doc comment names the wrong argument shape — comment corrected.
  - `[low]` `[reject]` (blind) `digest` takes the ID only as first argument — usage line shows that order; adding flexible parsing adds branches for a rare call style.
  - `[low]` `[reject]` (blind) invalid-name `pathsToFetch` and CRLF through `check`/`pr` untested — behaviour unchanged for invalid names; CRLF goes through the same `escalationDigest` already pinned.
  - `[low]` `[reject]` (blind) stale rejected decisions tested only in `escalationStatus` — `staleDecision` ignores the decision value, so `check`/`pr` share the tested path.
  - `[low]` `[reject]` (blind) "as a quoted string" advice not enforced — numeric YAML parse already fails closed with the field named; rare.
  - `[medium]` `[defer]` (edge-case) removed/renamed decided Escalation leaves orphan decision past `pr` — same root cause as the blind removal finding; deferred with it.
  - `[false]` `[reject]` (intent) R3 literal reading: re-binding in the same PR passes the escalations check — intended: the re-bind edits `decisions/`, a Protected Path that needs Maintainer review; the stale case without re-bind fails.
  - `[false]` `[reject]` (intent) CI wiring untested; new rule applies only once on main — inherent to `pull_request_target`; the tool surfaces the workflow runs are tested via CLI and fake API.
  - `[low]` `[reject]` (intent) `epic-1-context.md`/`spec-1-6` still describe the old format — historical/cached artifacts, regenerated from planning docs; editing them would not reach authors.
  - `[false]` `[reject]` (intent) "approved only when the decision file exists" narrowed — stricter and additive, as the intent asked.

## Design Notes

A content hash (not a commit SHA) is used because `check` runs on a plain checkout and `pr` reads contents at the head commit; both can hash text, neither can cheaply resolve history. Re-approving a changed Escalation means editing `decisions/ESC-*.md`, which is a Protected Path, so re-binding needs Maintainer review.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/escalations.test.ts` -- all pass
- `bun run test` / `bun run typecheck` / `bun run lint` -- clean
- `bun tools/escalations/escalations.ts check` -- `Escalations OK`

## Auto Run Result

Status: done

**Summary:** Every Escalation decision file now carries a required `escalation_sha256`, the SHA-256 (CRLF→LF) of the Escalation text it rules on. `check`, `pr` and `escalationStatus` compare it with the Escalation's current content: a mismatch is a `stale decision:` violation and the Escalation counts as `open`. `pr` also reads the decision at head for each changed Escalation. A new `digest <id>` command prints the value to write. Closes retro finding D1.

**Files changed:**
- `tools/escalations/escalations.ts` -- `escalationDigest`, required `escalation_sha256`, stale checks in `checkRecords`/`escalationStatus`/`evaluatePr`, decision fetch in `pathsToFetch`, `digest` CLI, header docs.
- `conformance/tests/xaravel/escalations.test.ts` -- `decision()` helper binds by default; new XT-conformance-27/28 cases for every I/O row; `own.refs` in XT-conformance-26 grows to `[SHA, SHA]` (one extra fetch, the decision lookup).

**Review:** 14 findings. Patched 2 (1 medium: test for an invalid decision in the Escalation-only PR branch; 1 low: helper comment). Deferred 2 (removed/renamed Escalation orphan detection in `pr`, pre-existing; spine/MAINT doc note for `escalation_sha256`, Maintainer-owned). Rejected 10, reasons in the triage log.

**Follow-up review recommended:** false (patched: high 0, medium 1, low 1).

**Verification:** `bun run test` 38 pass / 0 fail (5352 expects); `bun run typecheck`, `bun run lint` clean; `bun run escalations:check` OK (0/0); `scaffold:check` and `graph:check` OK.

**Residual risks:** a digest that YAML reads as a number (all digits or `<d>e<d>`) fails as invalid unless quoted; the error names the field and says to quote it. The rule takes effect in the `pr` job only once this tool is on `main` (`pull_request_target`).
