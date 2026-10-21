---
title: 'Ownership check allows a Story its own status line and its own spec (epic-8-retro-item-11)'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_revision: '6b39c49937472b8930da05d07e45f5fc81b64cd0'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/decisions/MAINT-2026-10-20-epic-8-items.md'
warnings: []
deferred:
  - summary: >-
      AGENTS.md, spine AD-16 and the XT-conformance-24 title still list only the four original Story paths.
    evidence: |-
      The ownership check now also allows a Story's own spec and its own manifest status line (MAINT-2026-10-20 item 2); those texts are Protected or agent-context files, so they change only through the Maintainer.
    location: >-
      AGENTS.md Policy; ARCHITECTURE-SPINE.md AD-16; conformance/tests/xaravel/ownership.test.ts XT-conformance-24
    severity: low
---

<intent-contract>

## Intent

**Problem:** Every orchestrator Story records its own bookkeeping (the `status:` line of `stories/<id>.md` and its build spec `_bmad-output/implementation-artifacts/spec-<id>-*.md`), but the `ownership` check reports both as `out of scope:`, so from Epic 9 on these edits pass only through a waiver (Epic 8 retro S2).

**Approach:** Implement the Maintainer's ruling (`decisions/MAINT-2026-10-20-epic-8-items.md` item 2) exactly: `allowedPath` also accepts the Story's own spec path; `evaluatePr` accepts the Story's own manifest only when the PR modifies it in place and the diff between merge base and head changes only the `status:` frontmatter line to a valid Story status.

**Always:** Fail closed: a manifest whose content cannot be read stays out of scope and adds the existing `unreadable content:` violation. The manifest is judged on content read at the merge base and the head (the `pr` command prefetches it through `contentReads`). The id-to-spec mapping replaces every `.` with `-`: Story `9.1` owns `spec-9-1-<anything without />.md` directly under `_bmad-output/implementation-artifacts/`.

**Never:** Widen beyond the ruling: no other manifest, no other field or body line of the own manifest, no added, removed, renamed or copied manifest, no other Story's spec (`spec-9-10-*` is not `9.1`'s), no spec in a subdirectory. Do not edit `.github/workflows/ownership.yml`, `AGENTS.md`, `conformance/expectations/**`, or any existing assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| own status line | `story/9.1` modifies `stories/9.1.md`, only `status: backlog` → `status: done` | not out of scope; no violation | none |
| own spec | `story/9.1` adds or modifies `_bmad-output/implementation-artifacts/spec-9-1-scope-frame.md` | allowed | none |
| other field | own manifest diff changes `test_ids`, `component`, title or body (with or without the status line) | `out of scope: stories/9.1.md …` | violation |
| invalid status | own manifest status changes to `finished` | out of scope | violation |
| added/removed/renamed manifest | `stories/9.1.md` with status `added`, `removed`, `renamed` or `copied` | out of scope | violation |
| other Story | `stories/9.2.md` status-only change; `spec-9-2-x.md`; `spec-9-10-x.md`; `spec-9-1.md`; `…/sub/spec-9-1-x.md`; `spec-9-1-x.txt` | out of scope | violation |
| unreadable | no `content`, or reading either side throws or returns null | out of scope plus `unreadable content:` | fail closed |

</intent-contract>

## Code Map

- `tools/ownership/ownership.ts:592` `allowedPath` -- path-only rule; add the own-spec regex (reuse `escapeRegex`, `hasBadSegment`).
- `tools/ownership/ownership.ts:678` `contentReads` -- prefetch list for the `pr` CLI; on `story/<valid id>` add base and head reads of `stories/<id>.md` when the PR file list holds it with status `modified`.
- `tools/ownership/ownership.ts:1156` `evaluatePr` -- story branch: after `disallowed(...)`, drop the own manifest from `outOfScope` when the status-only rule holds; use `reader(pr, violations)` (`:772`) for content (throws `Unreadable` after recording).
- `tools/ownership/ownership.ts:258` `frontmatter`, `:268` `parseManifest`, `:175` `STATUSES` -- reuse to locate the fence and validate the head's status.
- `tools/ownership/ownership.ts:1-160` header comment -- documents allowed paths; add the two new allowances.
- `conformance/tests/xaravel/ownership.test.ts:440` XT-conformance-24 (`allowedPath` lists; `stories/9.1.md` stays `false` there: the path rule alone never allows a manifest) and `runPr`/`fixtureRoot` helpers for CLI runs.
- `_bmad-output/implementation-artifacts/story-manifests.md:19` -- off-manifest XT registry; next free is `XT-conformance-259`.

## Tasks & Acceptance

**Execution:**
- `tools/ownership/ownership.ts` -- add own-spec path to `allowedPath`; add a status-only own-manifest rule used by `evaluatePr`; extend `contentReads`; update the header comment -- the ruling's two allowances.
- `conformance/tests/xaravel/ownership.test.ts` -- add `XT-conformance-259` covering every matrix row through `evaluatePr`, the `contentReads` entries, and one `runPr` CLI run that passes with an own status-only manifest change and spec -- proves both allowances and every refusal.
- `_bmad-output/implementation-artifacts/story-manifests.md` -- register `XT-conformance-259` (Epic 8 retro item 11) and move the next free ID to `-260`.

**Acceptance Criteria:**
- Given a `story/9.1` PR whose only changes are its own manifest's status line and its own spec, when `bun tools/ownership/ownership.ts pr` judges it, then it prints `Ownership OK` and exits 0.
- Given any refused case in the matrix, when judged, then the violation line starts `out of scope: <path> is outside Story 9.1's allowed paths`, so the existing waiver text is unchanged.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 14 findings — high 0, medium 1, low 9, false 4, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) `stories/` stays a Protected Path, so `protected-paths` still flags a manifest status edit — the intent and ruling scope this item to the `ownership` check only; the MAINT 2026-10-17 amendment already covers `protected-paths` on orchestrator PRs.
  - `[low]` `[defer]` (blind) AGENTS.md, spine AD-16 and the XT-conformance-24 title still list the four original allowed paths — all Protected or agent-context files; deferred for a Maintainer-approved update.
  - `[low]` `[reject]` (blind) a lone `\r` on the changed status line passes — `frontmatter()` folds `\r\n`, so the parsed status is still a valid Story status and only the status line changed; no widening.
  - `[false]` `[reject]` (blind) the freed `status:` line can disagree with sprint status for manifests with a `sprint_key` — pre-existing design: sprint status is already the authority (`applySprintStatus`); the ruling allows the status line as is.
  - `[low]` `[patch]` (blind) `withStatus` could silently no-op if the fixture format changed — added a guard assertion.
  - `[low]` `[patch]` (blind, intent) removing or renaming the own spec is allowed but untested — pinned removal of the own spec as allowed.
  - `[low]` `[reject]` (blind) three bounds in `statusOnlyChange` cannot fail after earlier checks — harmless belt-and-braces; removing them adds risk for no gain.
  - `[low]` `[reject]` (blind) `^status:` is weaker than the YAML top-level key (flow continuation, duplicate keys) — contrived manifest shapes; the head must still parse as a valid manifest.
  - `[false]` `[reject]` (blind) spec Code Map line numbers and Verification wording are stale — fix would edit this build's spec.
  - `[low]` `[reject]` (blind) some fail-closed combinations (both sides unreadable, truncated list plus manifest) are untested — existing `unreadable content:` and `truncated` rules are covered by their own tests; the new code reuses them unchanged.
  - `[medium]` `[patch]` (verification-gap) the frontmatter bound and `^status:` anchor are never exercised — added refused cases for a body `status:` line and an indented frontmatter `  status:` line.
  - `[low]` `[reject]` (edge) a CRLF manifest is always refused — fails closed; every manifest in `stories/` is LF.
  - `[false]` `[reject]` (edge) a missing `base.sha` makes the CLI throw — the CLI already exits 1 on that error (fail closed), the same as for Expectations reads before this change.
  - `[false]` `[reject]` (intent) the manifest half lives in `evaluatePr`, not `allowedPath` — `allowedPath` sees only a path and cannot judge a diff; the ruling's behaviour is met at the check's outer surface (`pr` CLI), which the tests exercise.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/ownership.test.ts conformance/tests/xaravel/ownership-lines.test.ts conformance/tests/xaravel/oracle-story.test.ts` -- expected: all pass.
- `bunx tsc -b` (or the repo's `typecheck` script) and `bun run lint` -- expected: clean.
- `bun run harness --xaravel` -- expected: no difference lines.

## Auto Run Result

Status: done

- **Change:** the `ownership` check lets a `story/<id>` PR change its own build spec (`_bmad-output/implementation-artifacts/spec-<id with . as ->-*.md`, path rule in `allowedPath`) and its own manifest's top-level `status:` line when the manifest is modified in place and exactly that line differs between merge base and head, leaving a valid Story status (`statusOnlyChange`, judged in `evaluatePr`; `contentReads` prefetches both sides). Every other manifest or spec edit stays `out of scope:`; an unreadable side fails closed.
- **Files:** `tools/ownership/ownership.ts` (rule, prefetch, header docs); `conformance/tests/xaravel/ownership.test.ts` (XT-conformance-259: every matrix row, `contentReads`, CLI runs); `_bmad-output/implementation-artifacts/story-manifests.md` (registers XT-conformance-259; next free -260).
- **Review:** 14 findings; 3 patched (1 medium, 2 low: tests for a body/indented `status:` line, a `withStatus` guard, own-spec removal pinned); 1 deferred (stale Protected docs); 10 rejected with reasons in the triage log.
- **Follow-up review recommended:** false (one medium patch, test-only).
- **Verification:** `bun test` ownership, ownership-lines, oracle-story: 23 pass; `bun run typecheck` and `bun run lint` clean; `bun run harness --xaravel`: 290/290, differ=0.
- **Residual risks:** `stories/` remains a Protected Path, so a Story's status edit still trips `protected-paths` (outside this ruling); the rule takes effect only once on `main`, as `ownership.yml` runs main's copy.
