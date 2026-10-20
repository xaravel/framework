---
title: 'Story 8.8: Phase 1 gate'
type: 'feature'
created: '2026-10-20'
status: 'in-review'
baseline_revision: 'd1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** FR-8 says `PORTING.md`, DIV-1..12 and the pilot must be on `main` before any Phase 1 Story starts, but nothing enforces it: the required `ownership` check judges a `story/<id>` PR by path only.

**Approach:** Extend `ownership pr` with a Phase 1 gate. When the PR's base manifest has `epic` in Phase 1 or later (any epic above 8), the check reads the base checkout (`main`) and fails unless it holds `PORTING.md` passing `checkPorting`, `decisions/DIV-1.md`..`DIV-12.md`, `docs/porting/pilot-report.md` and a Maintainer-signed `decisions/PHASE-0-EXIT.md`. The gate has no state: it passes for every later Phase 1 PR while `main` keeps those files, and the required `check` job's `porting:check` and `divergence:check` stop a merged PR from breaking them.

## Boundaries & Constraints

**Always:**
- The gate reads only the base checkout (`--root`), never the PR head. It runs inside the existing required `ownership` job and adds `phase gate:` violations to its report (exit 1).
- Phase 0 is epics 1..8 (`PHASE_0_LAST_EPIC = 8` in `tools/ownership/phase-gate.ts`). An XT test derives the set from `epics.md`'s Epic List (`#### Epic N` under `### Phase 0`) and asserts it equals `1..PHASE_0_LAST_EPIC`.
- Signed means frontmatter `decision: approved`, `decided_by: Maintainer` and `date: YYYY-MM-DD`, plus a non-blank body line that is not a heading. This is the form used by `MAINT-*` and the Maintainer's `ESC-*` rulings.
- `checkPorting` is loaded with a dynamic `import()` only when a Phase 1 manifest is judged. The tools that import `ownership.ts` (escalations, manifests, ratchet) therefore never need `oxc-parser`. The `ownership` job gains a `bun install --frozen-lockfile --ignore-scripts` step on the base checkout before the check step.
- Each violation names the Story, its epic, the missing input and its problem, and ends with `(FR-8, Story 8.8)`. Report every unmet condition, not just the first. For a failing `PORTING.md`, include the first 3 `porting:check` violations and the count.
- Existing CLI tests whose fixture roots judge `story/9.x`, `story/11.1` PRs get a satisfied gate in their setup, by copying the real gate inputs and writing a signed fixture exit file. Their assertions do not change.

**Never:** Write `decisions/PHASE-0-EXIT.md` (only the Maintainer signs it). Gate `planning/*`, `bot/*` or Phase 0 Story PRs. Read the PR head for the gate. Change `evaluatePr`'s synchronous signature. Edit the Protected list or the ruleset.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gate open | `story/9.1` PR, base has all four inputs valid | no `phase gate:` violation; exit per other rules | — |
| Phase 0 Story | `story/8.8` PR, base has none of them | no `phase gate:` violation | — |
| PORTING fails | base `PORTING.md` missing, or present and failing `checkPorting` (a required section removed) | `phase gate: … PORTING.md …` | exit 1 |
| DIV missing | base lacks `decisions/DIV-7.md` | violation names `decisions/DIV-7.md` | exit 1 |
| No pilot report | base lacks `docs/porting/pilot-report.md`, or it is blank | violation names the report | exit 1 |
| Exit unsigned | `PHASE-0-EXIT.md` missing; no frontmatter; `decided_by: orchestrator (…)`; `decision: rejected`; bad date; empty body | violation names the file and the failed field | exit 1 |
| All missing | Phase 1 manifest, empty base | one violation per unmet condition (4 kinds, 12 DIVs collapsed to one line listing them) | exit 1 |
| Head differs | gate open on base; PR head deletes `PORTING.md` | no `phase gate:` violation (the path rule reports the out-of-scope file) | exit 1 from scope only |

</intent-contract>

## Code Map

- `tools/ownership/ownership.ts:1132` `evaluatePr` -- sync; returns `{storyId, outOfScope, violations}`. Add `epic: number | null` (the parsed base manifest's epic, null when there is no valid manifest) to `OwnershipPrResult` (`grep interface OwnershipPrResult`).
- `tools/ownership/ownership.ts:1253` `pr()` -- async CLI path; after `evaluatePr`, when `result.epic !== null && result.epic > PHASE_0_LAST_EPIC`, append `await phaseGateViolations(options.root, storyId, epic)`. Header comment (lines 1–140): add the `phase gate:` violation kind and a paragraph on the gate.
- `tools/porting/porting.ts:402` `checkPorting(root): PortingReport` -- `{violations,…}`; reads `PORTING.md`, the spine, `conformance/scans/div12-pairs.jsonl`, `conformance/porting/expressions.jsonl`. Imports `oxc-parser`, hence the dynamic import.
- `tools/boost-framework/src/data.ts:189` `parseFrontmatter(text)` -- returns `{fields, body}`, an error string, or null. Reuse it for `PHASE-0-EXIT.md`. It imports only `node:` modules and `./scope`.
- `.github/workflows/ownership.yml` -- `ownership` job: checkout base, setup-bun, find PR, check. Insert the install step before `Check edit ownership`.
- `conformance/tests/xaravel/ownership.test.ts:537-600` -- asserts the job's steps exactly (`toHaveLength(4)`, indexes 2/3). Update it to 5 steps, with the install step asserted exactly. `fixtureRoot` (line 60) and the CLI roots at lines 386 and 464 get the gate inputs.
- `conformance/tests/xaravel/ownership-lines.test.ts:~170-200` -- one CLI run on `story/11.1` with `baseRoot`; give that root the gate inputs.
- `conformance/tests/xaravel/porting-pilot.test.ts` -- pattern for XT tests on real files plus mutated copies.
- `stories/8.8.md` -- `xaravel_test_ids: [XT-conformance-168, XT-conformance-169]`, `component: conformance`.
- `docs/ops/ci.md:13` -- the edit ownership row; `docs/ops/porting.md` -- add a "Phase 1 gate" section with the Maintainer's `PHASE-0-EXIT.md` form.

## Tasks & Acceptance

**Execution:**
- `tools/ownership/phase-gate.ts` -- export `PHASE_0_LAST_EPIC`, `PHASE_0_EXIT`, `PILOT_REPORT`, `phase0Epics(epicsText): number[]`, `exitSignatureProblems(text): string[]` and `async phaseGateViolations(root, storyId, epic): Promise<string[]>` -- the gate, separate so `ownership.ts` stays parser-free.
- `tools/ownership/ownership.ts` -- `epic` in the result, the call in `pr()`, header docs.
- `.github/workflows/ownership.yml` -- the install step, and a header comment line on the gate.
- `conformance/tests/xaravel/phase-gate.test.ts` -- a shared `gateRoot()` helper (copies the real inputs plus a signed exit) exported for the other two test files. XT-conformance-168 (AC1): every matrix fail row through `phaseGateViolations`, plus a CLI run (fake GitHub API) on `story/9.1` exiting 1 with the `phase gate:` lines. It also covers the workflow install step and the Phase 0 derivation from the real `epics.md`. XT-conformance-169 (AC2): with the gate open, epics 9, 14 and 71 pass, and a sequence of CLI PRs on `story/9.1` exits 0. A head that deletes the inputs adds no gate violation, a Phase 0 Story is never gated, and `ci.yml`'s `check` job runs `porting:check` and `divergence:check`.
- `conformance/tests/xaravel/ownership.test.ts`, `ownership-lines.test.ts` -- fixture setup only, plus the 5-step workflow assertion.
- `docs/ops/ci.md`, `docs/ops/porting.md` -- document the gate and how the Maintainer signs `PHASE-0-EXIT.md`.

**Acceptance Criteria:**
- Given a Story manifest with an `epic` in Phase 1 or later, when its PR is checked by `ownership pr`, then it exits 1 with a `phase gate:` line for each unmet condition, unless `main` (the base checkout) has `PORTING.md` passing `checkPorting`, DIV-1..12, the pilot report and a Maintainer-signed `decisions/PHASE-0-EXIT.md`.
- Given the gate passes, when any later Phase 1 Story PR is checked, then no `phase gate:` violation appears, whatever the PR's head holds.

## Spec Change Log

## Review Triage Log

## Design Notes

A latch was rejected. "Passes from then on" holds because the inputs are Protected, and CI keeps `PORTING.md` and the DIV records valid on every PR into `main`. A latch would need state outside git.

The exit file has the same identity limit as every orchestrator ruling (lesson, epic 1): the orchestrator commits as the Maintainer, so the check verifies the form of the signature, not who wrote it. Only the Maintainer writes `PHASE-0-EXIT.md`. The Auto Run Result names this as a Maintainer step at the Epic 8 checkpoint.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-conformance-1[67]*'` and `bun run harness --xaravel --id 'XT-conformance-2[2-5]'` -- expected: no differences
- `bun test conformance/tests/xaravel/ownership-lines.test.ts conformance/tests/xaravel/ci-pipeline.test.ts` -- expected: pass
- `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `bun run ownership:check` -- expected: exit 0
- `bun run story:check 8.8` -- expected: every clause except `full-run` passes locally
