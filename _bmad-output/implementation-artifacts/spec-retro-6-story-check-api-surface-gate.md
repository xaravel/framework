---
title: 'Retro 6 item 13: story:check runs api-surface:gate from a manifest field'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_revision: 'e6cdaa8fa348e427e8357ce7dfa58d4ae148d06f'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/decisions/MAINT-2026-10-19-epic-6-items.md'
  - '{project-root}/docs/ops/done-check.md'
  - '{project-root}/docs/ops/api-surface.md'
warnings: []
deferred:
  - summary: >-
      A gate AC whose Story has no manifest (13 deferred Stories) is a note, not a failure, unlike the ruling's wording.
    evidence: |-
      story-manifests.md lists them as sprint-planning deferrals; failing now would turn every PR red. Needs a Maintainer ruling.
    location: >-
      tools/ownership/ownership.ts checkApiSurfaceGates
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Nothing runs `api-surface:gate` (Epic 6 retro S4): 36 Component-closing ACs in `epics.md` say "`api-surface:gate <c>` passes", but `story:check`, the orchestrator and every workflow omit the gate, so such an AC is accepted on the agent's word. The Maintainer ruled (item 8, `epics.md:2624`) that the manifest carries `api_surface_gate: <c>`, `story:check` runs the gate, and a check fails when such an AC has no manifest carrying the field.

**Approach:** Add an optional `api_surface_gate` manifest field (`parseManifest`), a pure `gateCriteria(epicsText)` that finds each `` `api-surface:gate <c>` passes `` AC under its `### Story X.Y:` heading, and a `checkApiSurfaceGates` cross-check run by `ownership.ts manifests` (CI `ownership` job, and the real-repo XT test in `bun run test`). `story:check` gets an `api-surface` clause that checks the Story's AC against its manifest field and runs the gate for `<c>`. Set the field on every existing manifest whose Story has such an AC.

## Boundaries & Constraints

**Always:** One parser of the gate ACs and one field reader, in `tools/ownership/ownership.ts`, reused by `story:check`. Fail closed: an unreadable or missing `epics.md` fails the manifests check and the clause. The gate runs as a subprocess (`bun --no-env-file tools/api-surface/api-surface.ts --gate --root <root> <c>`), injectable in `StoryCheckOptions` for tests like `harness`. Update both tool headers and `docs/ops/done-check.md`.

**Never:** No edit to `epics.md`, the spine, PRD, SPEC, `AGENTS.md`, `packages/**`, `conformance/expectations/**`, any workflow, or a manifest's `component`/`test_ids`. No removed or weakened assertion; existing expected outputs grow by the new clause line only. Do not create manifests for Stories that have none (they need assigned tests: sprint planning's job).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Field matches AC | Story 10.6 AC says gate `contracts`; manifest `api_surface_gate: contracts` | manifests check ok; story:check runs gate `contracts`, `PASS api-surface: api-surface:gate contracts: 0 unexplained` on exit 0 | gate exit 1 → `FAIL api-surface`, items = gate stdout lines that report unexplained items / citation problems; other exit or spawn error → `FAIL … cannot check` with stderr |
| AC, field missing or different | manifest lacks field / says `config` | manifests check violation `api-surface gate: stories/10.6.md must carry api_surface_gate: contracts (epics.md:<n> says \`api-surface:gate contracts\` passes), got …`; story:check `FAIL api-surface` with the same item | exit 1 |
| Field, no AC | manifest has `api_surface_gate: x`, its Story has no such AC | violation `… carries api_surface_gate: x but epics.md has no \`api-surface:gate x\` passes acceptance criterion for Story <id>` | exit 1 |
| No AC, no field | ordinary Story | ok; story:check `PASS api-surface: no api-surface:gate acceptance criterion` | none |
| AC, no manifest | Story 68.3 has an AC, `stories/68.3.md` absent | not a violation; ownership blocks a Story PR with no manifest and story:check's `manifest` clause fails; `ownership manifests` prints `note: …` on stderr | none |
| Two gate ACs in one Story | two different components | violation: the field holds one component | exit 1 |
| Bad field | `api_surface_gate: 7` / `"Contracts"` / `""` | `invalid manifest: … api_surface_gate must be a kebab-case component name when present, got …` | exit 1 |
| epics.md missing | no `_bmad-output/planning-artifacts/epics.md` | violation / `FAIL api-surface: cannot check: … does not exist` | fail closed |

</intent-contract>

## Code Map

- `tools/ownership/ownership.ts:139-148` -- `Manifest` interface: add `apiSurfaceGate: string | null`.
- `tools/ownership/ownership.ts:222-303` -- `parseManifest`: validate optional `api_surface_gate` with `COMPONENT`.
- `tools/ownership/ownership.ts:1089-1099` -- `manifests` CLI: add `checkApiSurfaceGates` violations and stderr notes; add `EPICS` path constant and `gateCriteria`.
- `tools/story-check/story-check.ts:81` -- `CLAUSES`: insert `api-surface` after `fixtures`; new `apiSurfaceClause` (pure) plus gate runner; `runStoryCheck` wiring (`noManifest` case too); header comment.
- `conformance/tests/xaravel/ownership.test.ts:22` (XT-conformance-22) -- real-repo `manifests` run, parse cases; `fixtureRoot` writes a minimal `epics.md`.
- `conformance/tests/xaravel/done-check.test.ts:127` (XT-conformance-127) -- `storyRoot` gains `epics.md`; exact expected outputs gain the `PASS api-surface` line; add clause cases.
- `stories/<id>.md` for 10.6 11.1 12.1 13.1 14.8 15.3 16.2 17.4 24.1 25.2 26.1 27.4 29.3 30.2 39.3 41.3 42.5 44.1 48.5 56.5 57.6 63.1 67.2 -- add `api_surface_gate: <c>` after `component`.
- `docs/ops/done-check.md` -- the only doc of manifest fields beside the `ownership.ts` header: document field, cross-check, clause.

## Tasks & Acceptance

**Execution:**
- `tools/ownership/ownership.ts` -- field, `gateCriteria`, `checkApiSurfaceGates`, manifests CLI wiring -- the cross-check of the ruling.
- `tools/story-check/story-check.ts` -- `api-surface` clause and gate runner -- story:check runs the gate.
- the 23 manifests above -- add the field -- the repo passes its own check.
- tests -- every matrix row (unit for pure functions, CLI for manifests, runStoryCheck with injected gate) plus the real repo: 36 ACs found, every manifest consistent.
- docs -- as above.

**Acceptance Criteria:**
- Given the repository, when `bun tools/ownership/ownership.ts manifests` runs, then it exits 0 and notes the 13 gate Stories with no manifest.
- Given the changes, when `bun test conformance/tests/xaravel`, `bun run typecheck` and `bun run lint` run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 21 findings — high 0, medium 4, low 9, false 4, maybe-false 0 (intent-alignment report counted as 4 observations)
- findings:
  - `[medium]` `[defer]` (blind 1, intent a) a gate AC whose Story has no manifest is a note, while the ruling says the check fails — the 13 Stories are the documented sprint-planning deferrals (`story-manifests.md` Deferred Stories: re-verification or topic-only scopes, manifests written "when each is planned"); failing now turns every PR red with nothing a planning branch may fix. Pre-existing cause; recorded for a Maintainer ruling (retro item stays waiting on the Maintainer).
  - `[medium]` `[patch]` (blind 2, edge 1, edge 6, vgap other) exit 1 after a `0 unexplained` line when `checkCitations` throws reads as a gate verdict and drops stderr — exit 1 is a verdict only with a non-zero count or a citations line; else `cannot check` with stderr.
  - `[low]` `[patch]` (blind 3) the verdict branch drops the gate's stderr — stderr lines appended to items.
  - `[medium]` `[patch]` (blind 4) `resolve.py` writes new manifests without `api_surface_gate` — emits the field from the same exact-phrase rule (it never overwrites existing manifests, so the 23 are safe).
  - `[low]` `[patch]` (blind 5) `story-manifests.md` does not document the field — bullet added.
  - `[low]` `[patch]` (blind 6) `docs/ops/api-surface.md:16` does not say story:check enforces the gate — sentence and link added.
  - `[medium]` `[patch]` (blind 7, vgap 1, intent b) default `runApiSurfaceGate` never executed by a test — a real-subprocess case on an api-surface fixture root added.
  - `[low]` `[reject]` (blind 7, edge 2) no timeout on the gate subprocess — the harness runs story:check uses are unbounded too; a hang is visible to the operator, and a bound adds a tuning parameter with no demonstrated need.
  - `[false]` `[reject]` (blind 7) runner resolves the tool from story-check's own checkout, not `<root>` — the same as every other tool story-check calls (harness, oracle helpers); `--root` points the tool at the tree.
  - `[low]` `[patch]` (blind 8) the `ownership` `manifests` job checks the base commit — pre-existing workflow design; the head is checked by XT-conformance-22 in the required ci test run; caveat sentence added to done-check.md.
  - `[low]` `[reject]` (blind 9, edge 4, edge 5) reworded, line-wrapped or fenced criteria are missed — all 36 criteria today match, and the real-repo test pins 36 criteria in 36 Stories, so an added or reworded AC changes that count and fails the test.
  - `[low]` `[reject]` (blind 10) the field is not checked against a real component — story:check fails loudly (gate exit 2 → `cannot check`); a check needs a root dependency in a pure function.
  - `[low]` `[patch]` (blind 11) XT-conformance-22 title not updated; positional `out[4]` — title clause added; line found by prefix.
  - `[low]` `[reject]` (edge 3) an invalid gate manifest also prints a "no stories/<id>.md" note — the invalid-manifest violation beside it fails the run and names the cause.
  - `[false]` `[reject]` (intent c) extra strictness beyond the intent — stricter checks do not weaken the grader; no AC today trips them.
  - `[false]` `[reject]` (intent d) where the check runs — the auditor finds no divergence there.
  - `[false]` `[reject]` (intent e) scope constraints — respected; no finding.

## Design Notes

A gate AC whose Story has no manifest is a note, not a failure: today 13 such Stories have no manifest because no tests are assigned to them yet, so failing would turn every PR red with nothing a planning branch may fix. That Story still cannot be worked or accepted without a manifest: the `ownership` PR check rejects `story/<id>` with `missing manifest`, and `story:check`'s `manifest` clause fails. Once a manifest exists, the cross-check requires the field. The parser matches only the exact phrase `` `api-surface:gate <name>` passes `` with a kebab-case name, so `epics.md:2623-2624`'s `<component>`/`<c>` placeholders are not ACs.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/ownership.test.ts conformance/tests/xaravel/done-check.test.ts` -- expected: pass
- `bun test conformance/tests/xaravel` -- expected: no new failures
- `bun run typecheck && bun run lint` -- expected: clean
- `bun tools/ownership/ownership.ts manifests` -- expected: exit 0

## Auto Run Result

Status: done

- **Change:** optional manifest field `api_surface_gate: <c>`; `gateCriteria` reads each "`api-surface:gate <c>` passes" AC of `epics.md` under its Story heading; `ownership manifests` cross-checks field and ACs (fails closed without `epics.md`); `story:check` gains an `api-surface` clause that checks the Story's AC against its field and runs `api-surface:gate <c>`; the field is set on the 23 existing gate manifests, and `resolve.py` writes it for manifests planned later.
- **Files:** `tools/ownership/ownership.ts` (field, parser, cross-check); `tools/story-check/story-check.ts` (clause, gate runner); 23 `stories/*.md` (field); `conformance/tests/xaravel/ownership.test.ts` (XT-conformance-22) and `done-check.test.ts` (XT-conformance-127) (matrix, real-repo and real-subprocess cases; existing outputs only gain the new clause line); `sprint-planning/resolve.py`; `story-manifests.md`, `docs/ops/done-check.md`, `docs/ops/api-surface.md`.
- **Review:** 9 entries patched (3 medium, 6 low), 1 deferred to the Maintainer (the 13 manifest-less gate Stories are a note, not a failure), 7 rejected with reasons in the triage log.
- **Follow-up review:** false. Three medium entries were patched; each is pinned by a test (gate exit-1 handling, real subprocess, resolver output rule mirrors `gateCriteria`), and no unverified risk can be named.
- **Verification:** `bun run test` 265 pass, 0 fail; `bun run harness --xaravel` 265 passed; `bun run typecheck` and `bun run lint` clean; `bun tools/ownership/ownership.ts manifests` exit 0 with 13 notes; resolver dry run reports 0 problems.
- **Residual risk:** the 13 deferred gate Stories (28.3 … 68.3) are only noted until planned, which departs from the ruling's wording: waiting on a Maintainer ruling (retro action item 13 stays in progress). `story:check` on a gated Story fails until its Component's gate really passes, which is intended.
