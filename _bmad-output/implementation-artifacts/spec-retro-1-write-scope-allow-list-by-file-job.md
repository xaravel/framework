---
title: 'Key the workflow write-scope allow-list by file#job (retro epic-1 item 6)'
type: 'bugfix'
created: '2026-10-17'
status: 'done'
baseline_revision: 'bb051df4b0abd74581b6dae8c4b166252dfdf3a4'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md'
warnings: []
deferred:
  - summary: >-
      A write-scoped allow-listed job that is a reusable-workflow call (`uses:`) passes its token to jobs in another workflow file, which inherit it without declaring write scopes.
    evidence: |-
      Pre-existing: the check only inspects declared `permissions` per job and never looks at `uses:`. No workflow in the repo uses a reusable workflow today, and release.yml#release runs steps, so it is not reachable now. Edge Case Hunter, review pass 2026-10-17.
    location: >-
      tools/workflow-permissions/workflow-permissions.ts:85
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `checkWorkflow` lets a job hold a write scope when its job id alone is `oracle`, `dashboard` or `release` (`tools/workflow-permissions/workflow-permissions.ts:82`, retro finding D6). Any new workflow can name a job `release` and take `contents: write` or `id-token: write` without the check noticing.

**Approach:** Key the allow-list by `<workflow file name>#<job id>`. The entries are `release.yml#release` (the existing job), and `oracle.yml#oracle` and `dashboard.yml#dashboard`, reserved for the Oracle (Epic 3) and dashboard (Epic 7) workflows that the spine (§ Permissions) lets hold write scopes. A job is allowed write scopes only when its file's base name and its id together match an entry.

## Boundaries & Constraints

**Always:** Keep the exported name `ALLOWED_WRITE_JOBS`, `checkWorkflow(file, text)` and `checkWorkflows(root)` signatures, the CLI, exit codes and every other violation text. `file` is a repo-relative path such as `.github/workflows/release.yml`; match on its last path segment. A `.yaml` file never matches a `.yml` entry (exact match). The violation line names the job by its `file#job` key and lists the allowed keys. XT-conformance-31 keeps every existing case; cases whose meaning the stricter rule changes are moved to the matching file (so they still test an allowed job) and new cases cover the rejection.

**Never:** Do not touch `.github/workflows/*`, `tools/release/` (the release authority check already keys `release` by `release.yml`), `AGENTS.md`, the spine, SPEC, PRD or `epics.md`. Do not add allow-list entries beyond the three.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Allowed | `.github/workflows/release.yml`, job `release`, `id-token: write` | no violation | — |
| Wrong file | `.github/workflows/x.yml`, job `release`, `contents: write` | `workflow permissions: .github/workflows/x.yml job release holds contents: write; write scopes are allowed only in oracle.yml#oracle, dashboard.yml#dashboard, release.yml#release (AD-16)` | exit 1 via CLI |
| Wrong job | `release.yml`, job `gate`, `contents: write` | violation naming job `gate` | exit 1 |
| Extension | `.github/workflows/release.yaml`, job `release`, write | violation | exit 1 |
| Read only | any file, any job, only read scopes | no violation | — |

</intent-contract>

## Code Map

- `tools/workflow-permissions/workflow-permissions.ts` -- header comment (lines 6-8) describes the rule; `ALLOWED_WRITE_JOBS` (line 17); the allow test in `checkWorkflow` (lines 82-84) uses `id` only. Use `basename` from `node:path` (or split on `/`) on `file`.
- `conformance/tests/xaravel/repository-policy.test.ts` -- XT-conformance-31 (line 503): asserts the list (504), the `build` violation text (518), the allowed-ids loop (526-528, uses `x.yml`), and a fixture `b.yaml` with job `release` holding `id-token: write` that must pass (532-534). Repo root must still pass (572).
- `_bmad-output/implementation-artifacts/spec-1-7-repository-ruleset-workflow-permissions-and-dependency-audit.md` -- line 80 documents the old rule; read-only history, not edited.
- `docs/ops/release.md:11` -- read-only; the release authority rule already keys by file.

## Tasks & Acceptance

**Execution:**
- `tools/workflow-permissions/workflow-permissions.ts` -- change `ALLOWED_WRITE_JOBS` to `["oracle.yml#oracle", "dashboard.yml#dashboard", "release.yml#release"]`, match on `<basename(file)>#<id>`, update the header comment -- closes D6.
- `conformance/tests/xaravel/repository-policy.test.ts` -- update XT-conformance-31: new list assertion and violation text; the allowed loop builds each entry's own file; rename fixture `b.yaml` to `release.yml` (keeps the `.yml`/`.yaml` coverage via `a.yml` + a new read-only `c.yaml`); add every matrix row.

**Acceptance Criteria:**
- Given the repository root, when `bun run workflows:check` runs, then it exits 0.
- Given a workflow `x.yml` with a job `release` holding `contents: write`, when the check runs, then it reports exactly one violation for that job.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 14 findings — high 0, medium 1, low 6, false 7, maybe-false 0
- findings:
  - `[medium]` `[defer]` (edge) An allowed job that is a `uses:` reusable-workflow call passes write scopes to a non-allow-listed file — real but pre-existing (the old id-only check had the same gap) and unreachable today: no workflow uses `uses:` at job level. Deferred.
  - `[low]` `[reject]` (edge) `basename(file)` is not anchored to `.github/workflows`, so `checkWorkflow("other/release.yml", …)` matches — the CLI and `checkWorkflows` only ever pass `.github/workflows/<name>`; only a direct caller of the exported function with a wrong path meets it, and the fix adds a guard.
  - `[false]` `[reject]` (blind) Violation text does not use the `file#job` key the Boundaries sentence asks for — the I/O matrix fixes the exact text and the code matches it; the only fix is editing this build's spec.
  - `[false]` `[reject]` (blind) XT-conformance-31 title is inaccurate — the title says write scopes appear only in the oracle, dashboard and release jobs, which is still true; the file binding narrows it without contradicting it.
  - `[false]` `[reject]` (blind) epics.md:1620 and spec-1-7 describe the old id-only rule — both name the jobs (oracle, dashboard, release), which remain the allowed jobs; spec-1-7 is a historical record of Story 1.7.
  - `[false]` `[reject]` (blind) Reserving `oracle.yml#oracle` / `dashboard.yml#dashboard` leaves a hole — the spine (§ Permissions) grants write scopes to the Oracle and dashboard jobs, so a job there holding them is the policy, not a bypass; any new workflow file is also under the Protected Path `/.github/`.
  - `[low]` `[reject]` (blind) Matching not anchored to the workflows directory — same as the edge finding above; same reason.
  - `[low]` `[reject]` (blind) Violation suffix copy-pasted across six assertions — test style only; a future allow-list change fails loudly at every copy, not silently.
  - `[low]` `[reject]` (blind) No case with an allowed and a disallowed write job in one file — the check is a per-job loop with no per-file state (workflow-permissions.ts:75-87); the gap would only matter after a rewrite, and the fix adds a test, not a correction.
  - `[false]` `[reject]` (blind) Verification commands unconfirmed — run after implementation: `bun test` 38 pass / 0 fail, `bun run workflows:check` exit 0 (6 workflows), `bun run typecheck` and `bun run lint` exit 0.
  - `[false]` `[reject]` (intent) Invented file names `oracle.yml` / `dashboard.yml` bind Epics 3 and 7 — descriptive; the spec states the reservation deliberately; a Story that picks another name changes the list through the same Protected-Path review it already needs for a new workflow.
  - `[low]` `[reject]` (intent) Message format diverges from the spec sentence — same as the blind finding; spec-only fix.
  - `[low]` `[reject]` (intent) Stale test title — same as the blind finding; the title remains true.
  - `[low]` `[reject]` (intent) Tests exercise synthetic fixtures rather than the real tree — XT-conformance-31 also runs `checkWorkflows(root)` and the CLI on the repo root and expects no violations; the real tree has one write job and it passes.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/repository-policy.test.ts` -- expected: all pass
- `bun test` -- expected: all pass
- `bun run workflows:check` -- expected: exit 0
- `bun run typecheck` and `bun run lint` (whatever `package.json` names them) -- expected: clean

## Auto Run Result

Status: done

- **Change:** `ALLOWED_WRITE_JOBS` is now keyed `<workflow file name>#<job id>` (`oracle.yml#oracle`, `dashboard.yml#dashboard`, `release.yml#release`), matched exactly against the file's base name and the job id. A job named `release`, `oracle` or `dashboard` in any other workflow file can no longer hold write scopes (closes retro finding D6).
- **Files:**
  - `tools/workflow-permissions/workflow-permissions.ts` -- the new key, match and header comment.
  - `conformance/tests/xaravel/repository-policy.test.ts` -- XT-conformance-31 gains the matrix cases (wrong file, wrong job, `.yaml` twin, read-only anywhere, CLI misplaced job); the passing fixture moved to `release.yml`, with `c.yaml` keeping `.yaml` discovery covered. No assertion removed.
- **Review:** 14 findings. 0 patched, 1 deferred (reusable-workflow `uses:` inheritance, pre-existing), 13 rejected with reasons in the triage log.
- **Follow-up review recommended:** false (no patched entries).
- **Verification:** `bun test` 38 pass, 0 fail; `bun run workflows:check` exit 0, 6 workflows; `bun run typecheck` exit 0; `bun run lint` exit 0. With the old checker restored, XT-conformance-31 fails.
- **Residual risk:** the reserved `oracle.yml` and `dashboard.yml` names bind Epics 3 and 7 unless those Stories update the list.

