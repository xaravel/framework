---
title: 'Read Story status from sprint status in the ownership check, and set Epic 1 manifests to done (retro epic-1 item 5)'
type: 'bugfix'
created: '2026-10-17'
status: 'done'
baseline_revision: '3fb5b7f80fbd38febcccbc2cf14566895cd7c48d'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Every `stories/1.1.md`…`1.8.md` says `status: backlog` while sprint status says `done` (retro finding D5). `ownership manifests` reads only the manifest `status`, so it reports "56 open" and treats finished Stories as owning their Test IDs. Nothing updates the manifest field, so there are two sources of truth.

**Approach:** Make `_bmad-output/implementation-artifacts/sprint-status.yaml` the authority for whether a Story is open. When the root has that file, `ownership manifests` takes each manifest's effective status from `development_status[<sprint_key>]`, and a manifest whose `sprint_key` is missing from sprint status is a violation. Without the file (hermetic fixtures), the manifest `status` is used as before. Then set the eight Epic 1 manifests to `status: done` so the two agree today, and document the rule.

## Boundaries & Constraints

**Always:** `checkDuplicates` keeps its signature and its behaviour on `Manifest.status`. The effective status is resolved before it runs, by setting each manifest's `status` from sprint status. New violation lines follow the `<kind>: <path>: … (AD-16)` shape and appear in the header comment. An unreadable, unparseable or non-mapping sprint status, or one with no `development_status` mapping, fails closed with a violation. Existing XT assertions keep their expected values; tests only gain cases.

**Never:** Do not require Story PRs to edit `stories/*.md`: it is a Protected Path, and from Epic 9 on the ownership check forbids it on `story/*` branches. Do not change `evaluatePr` or `allowedPath`, any manifest's `component` or `test_ids`, `.github/workflows/*`, `AGENTS.md`, the spine, or `epics.md`. Do not make `sprint_key` a required manifest field.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sprint says done | manifest `backlog`, sprint key `done`, another open Story lists the same ID | no duplicate violation | — |
| Sprint says open | manifest `done`, sprint key `in-progress`, another open Story lists the same ID | `duplicate test id: … listed by open Story …` | exit 1 |
| Unknown key | manifest `sprint_key: x` not in `development_status` | `unknown sprint key: stories/9.1.md: sprint_key "x" is not in _bmad-output/implementation-artifacts/sprint-status.yaml development_status (AD-16)` | exit 1 |
| Bad sprint value | key maps to a value outside `STATUSES` | `invalid sprint status: <file>: development_status.<key> must be one of …, got … (AD-16)` | exit 1 |
| Bad file | sprint status not YAML / no `development_status` mapping | `invalid sprint status: <file>: …` | exit 1 |
| No sprint status | fixture root without the file | manifest `status` used, as today | — |
| No sprint_key | manifest without `sprint_key`, sprint status present | manifest `status` used | — |

</intent-contract>

## Code Map

- `tools/ownership/ownership.ts` -- `Manifest` (add `sprintKey: string | null`), `parseManifest` (read optional `sprint_key`; a present non-string or empty value is an `invalid manifest:` line), `readManifests`, `manifests()` CLI (apply sprint status before `checkDuplicates`, so the "open" count uses it too), header comment violation list. Add an exported `SPRINT_STATUS` path constant and `applySprintStatus(root, manifests)` returning `{ manifests, violations }`. YAML via `Bun.YAML.parse`, as `parseManifest` does.
- `tools/escalations/escalations.ts` -- read-only: it consumes `parseManifest` and only reads `testIds`/`xaravelTestIds`; adding a field must not break it.
- `conformance/tests/xaravel/ownership.test.ts` -- `fixtureRoot`, `story()`, `runCli`; XT-conformance-25 (line ~446) covers "done Stories no longer hold their IDs"; add the matrix cases there. XT-conformance-22 asserts that the live `manifests` run passes on the repo root.
- `stories/1.1.md`…`stories/1.8.md` -- set `status: done` (sprint status says done).
- `_bmad-output/implementation-artifacts/story-manifests.md` -- add a bullet: sprint status is the authority for a Story's status, and the check reads it through `sprint_key`.

## Tasks & Acceptance

**Execution:**
- `tools/ownership/ownership.ts` -- add `sprintKey`, `SPRINT_STATUS` and `applySprintStatus`; call it in `manifests()`; document the `unknown sprint key:` and `invalid sprint status:` kinds -- one source of truth for open/done.
- `stories/1.1.md`…`1.8.md` -- `status: done` -- closes the current drift.
- `_bmad-output/implementation-artifacts/story-manifests.md` -- document the rule.
- `conformance/tests/xaravel/ownership.test.ts` -- add every matrix row to XT-conformance-25, both through `applySprintStatus` and through the CLI with a fixture root that has a sprint status file. Add a parse case for a malformed `sprint_key` to XT-conformance-22.

**Acceptance Criteria:**
- Given the repository root, when `bun run ownership:check` runs, then it exits 0 and reports 48 open (56 manifests, minus the 8 done in Epic 1).
- Given a fixture where sprint status says `done` but the manifest says `backlog`, when `ownership manifests --root <fixture>` runs, then that Story does not count as open.
- Given the repository, when `bun test`, `bun run typecheck`, `bun run lint` and `bun run escalations:check` run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 20 findings — high 0, medium 1, low 13, false 6, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) A missing sprint status file on the real root silently falls back to manifest status. Patched with the verification-gap fix below: the live test now asserts the file exists and is applied.
  - `[low]` `[reject]` (blind) The CI `manifests` job sees a Story PR's sprint status only after merge. This is pre-existing: the job judged manifest edits the same way before this change, and the `push` to `main` run still catches a regression.
  - `[medium]` `[patch]` (blind) The live-repo test never shows that sprint status is applied. XT-conformance-22 now resolves through `applySprintStatus`, asserts no violations, and matches the exact live stdout with a derived open count.
  - `[low]` `[reject]` (blind) Nothing detects two manifests sharing a `sprint_key`. Sprint planning derives each key from the Story title, so this is unlikely, and the fix adds a new violation kind and branch.
  - `[low]` `[reject]` (blind) The manifest `status` drifts again by design from Epic 2 on. This is the chosen single-authority design (Design Notes): `story-manifests.md` says the field is a snapshot, and no code reads it raw except as the documented fallback. Keeping the files in sync would need a new sync tool, and Story PRs from Epic 9 on may not edit `stories/`.
  - `[low]` `[patch]` (blind) `sprint_key` accepts surrounding whitespace. It is now rejected the way `test_ids` are, with a parse case.
  - `[low]` `[reject]` (blind) `sprint_key: null` is rejected while a null `test_ids` counts as absent. The rejection is deliberate: an empty key is a sprint-planning slip.
  - `[low]` `[reject]` (blind) The CLI tests skip two of the bad-file shapes. `applySprintStatus` covers all four, and the CLI calls the same function.
  - `[low]` `[reject]` (blind) The `invalid sprint status:` line does not quote the key. This is cosmetic: keys are kebab-case.
  - `[low]` `[patch]` (blind) The doc bullet does not list the accepted values or say which counts as closed. Both are added to `story-manifests.md`.
  - `[low]` `[patch]` (edge) `sprint_key` with surrounding whitespace. Same patch as the blind finding.
  - `[low]` `[reject]` (edge) Duplicate `sprint_key`. Same reason as the blind finding.
  - `[low]` `[reject]` (edge) A repeated `development_status` key in sprint status takes the last value. Sprint planning and SPS generate that file, and guarding against it needs a raw-text scan.
  - `[medium]` `[patch]` (verification-gap) Nothing asserts that the live sprint status file is found and consumed. The live-root asserts were added (file exists, no violations, `checkDuplicates` on the resolved manifests, exact stdout).
  - `[low]` `[reject]` (intent) "Keep in sync" is met by redefinition. Same as the blind drift finding: the intent asks to fix the cause, two sources of truth, and the check now reads one of them.
  - `[false]` `[reject]` (intent) "Truth is only resolved in the CLI." No other code reads `Manifest.status`: `evaluatePr` and `escalations.ts` read only Test IDs and the component.
  - `[false]` `[reject]` (intent) "Tests don't pin the real repo count." This is now pinned by the patched XT-conformance-22 live stdout assertion.
  - `[false]` `[reject]` (intent) "New strictness beyond D5." Failing closed on an unknown key or a malformed file is what an authority check needs, and it is stated in the spec.
  - `[false]` `[reject]` (intent) "Third clause is met only through the inputs." That is correct behaviour, not a defect.
  - `[false]` `[reject]` (intent) "Protected Paths edited." Editing `stories/` and `tools/` is what the intent requires, on a `planning/` branch under the MAINT ruling.

## Auto Run Result

Status: done

- **Change:** `ownership manifests` now takes each Story's status from `sprint-status.yaml` through the manifest's `sprint_key`. It fails closed on an unknown key, a bad value or a bad file, and falls back to the manifest `status` only when a root has no sprint status. Epic 1 manifests are set to `done`. The live check reports 48 open, down from 56.
- **Files:**
  - `tools/ownership/ownership.ts`: `sprintKey`, `SPRINT_STATUS`, `applySprintStatus`, and the CLI wiring.
  - `stories/1.1.md`…`1.8.md`: `status: done`.
  - `_bmad-output/implementation-artifacts/story-manifests.md`: the Status rule.
  - `conformance/tests/xaravel/ownership.test.ts`: the matrix cases, and the live-root asserts in XT-conformance-22 and XT-conformance-25.
- **Review:** 5 patch rows (3 entries: 2 medium, 1 low), 0 deferred, 15 rejected, with reasons in the triage log.
- **Follow-up review recommended:** `true`. Two medium entries were patched. The unverified risk is that the patched live-root asserts were not themselves reviewed by a fresh layer.
- **Verification:**
  - `bun test`: 38 pass, 0 fail.
  - `bun run typecheck`, `bun run lint`: clean.
  - `bun run ownership:check`: `Ownership OK: 56 manifest(s) valid, 48 open, no duplicate Test IDs.`
  - `bun run escalations:check`: OK.
- **Residual risk:** from Epic 2 on, the manifest `status` field goes stale by design. The Maintainer may prefer dropping the field, which changes AD-16 and XT-conformance-22.

## Design Notes

Why not a drift check that forces Story PRs to update the manifest: from Epic 9 on, the ownership amendment rejects a `story/*` PR that touches anything outside `packages/<c>/**` and `_bmad-output/implementation-artifacts/`, and `stories/` is a Protected Path. Sprint status is the file every Story already updates, so the check reads it. The manifest `status` remains sprint planning's snapshot and the fallback for roots without sprint status.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/ownership.test.ts conformance/tests/xaravel/escalations.test.ts` -- expected: pass
- `bun run ownership:check` -- expected: `Ownership OK: 56 manifest(s) valid, 48 open, no duplicate Test IDs.`
- `bun test`, `bun run typecheck`, `bun run lint` -- expected: pass
