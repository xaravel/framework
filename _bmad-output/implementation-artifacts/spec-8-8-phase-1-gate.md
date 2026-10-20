---
title: 'Story 8.8: Phase 1 gate'
type: 'feature'
created: '2026-10-20'
status: 'blocked'
baseline_revision: 'd1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f'
review_loop_iteration: 5
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Only the Maintainer can open the gate: decisions/PHASE-0-EXIT.md must be written and signed at the Epic 8 checkpoint, separately from the orchestrator's MAINT-checkpoint-epic-8.md.
    evidence: |-
      Until it exists on main, every Epic 9+ Story PR fails the required ownership check with a phase gate: line. The orchestrator's step E writes only MAINT-checkpoint-epic-<N>.md.
    location: >-
      decisions/PHASE-0-EXIT.md
    severity: low
  - summary: >-
      Branches outside story/, planning/ and bot/ pass the ownership check whatever they touch, so they are never gated either.
    evidence: |-
      Pre-existing evaluatePr rule ("Any other branch passes"); a feature/x PR could change packages/** before Phase 1 opens.
    location: >-
      tools/ownership/ownership.ts evaluatePr
    severity: medium
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

- `tools/ownership/ownership.ts:1132` `evaluatePr` -- sync; returns `{storyId, outOfScope, violations}`. Left unchanged (see Spec Change Log).
- `tools/ownership/ownership.ts:1253` `pr()` -- async CLI path; after `evaluatePr`, re-read the base manifest's `epic` (`baseManifestEpic`, via `parseManifest`) and, when it is above `PHASE_0_LAST_EPIC`, append `await phaseGateViolations(options.root, storyId, epic)`. Header comment (lines 1–140): add the `phase gate:` violation kind and a paragraph on the gate.
- `tools/porting/porting.ts:402` `checkPorting(root): PortingReport` -- `{violations,…}`; reads `PORTING.md`, the spine, `conformance/scans/div12-pairs.jsonl`, `conformance/porting/expressions.jsonl`. Imports `oxc-parser`, hence the dynamic import.
- `tools/boost-framework/src/data.ts:189` `parseFrontmatter(text)` -- returns `{fields, body}`, an error string, or null. Reuse it for `PHASE-0-EXIT.md`. It imports only `node:` modules and `./scope`.
- `.github/workflows/ownership.yml` -- `ownership` job: checkout base, setup-bun, find PR, check. Insert the install step before `Check edit ownership`.
- `conformance/tests/xaravel/ownership.test.ts:537-600` -- asserts the job's steps exactly (`toHaveLength(4)`, indexes 2/3). Update it to 5 steps, with the install step asserted exactly. `fixtureRoot` (line 60) always writes the gate inputs.
- `conformance/tests/xaravel/ownership-lines.test.ts:~170-200` -- one CLI run on `story/11.1` with `baseRoot`; `baseRoot` always writes the gate inputs.
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

- 2026-10-20, Fidelity re-check (iteration 2). Trigger: reviewer 1 (codex) rejected twice because the diff changed the bodies of other Stories' tests (XT-23, XT-180, XT-181, XT-245), whose cited consequences the tool supplies no evidence for. Amended: `OwnershipPrResult` no longer gains `epic` (`pr()` re-reads the base manifest instead), so the `epic: null` edits are gone, and the gate inputs are written by the shared `fixtureRoot`/`baseRoot` helpers rather than in test bodies. Avoids: edits to pre-existing test bodies that a reviewer cannot verify. KEEP: the gate module, its dynamic import, the base-only reading, the install step and XT-168/169 as they are.

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 29 findings — high 0, medium 7, low 14, false 8, maybe-false 0
- findings:
  - (verification-gap) `[medium]` `[patch]` the fail-closed `cannot run it:` branch is never exercised — XT-168 now makes `checkPorting` throw on a gate root and asserts the single line.
  - (edge) `[low]` `[reject]` the install step fails every ownership run on a registry outage — the required `check` job installs from the same registry, so an outage already blocks every PR; a conditional install adds a branch for no gain.
  - (edge) `[low]` `[reject]` a placeholder body (an HTML comment) passes the signature — `decisions/` is Protected and only the Maintainer writes the file; the check verifies form by design (Design Notes).
  - (edge) `[false]` `[reject]` hard-coded `PHASE_0_LAST_EPIC` drifts from epics.md — XT-168 derives the Phase 0 set from the real `epics.md` and fails on any drift.
  - (edge) `[low]` `[patch]` the truncation test splits on `; ` — grouped with the blind truncation finding; the test now also asserts the count exceeds 3.
  - (edge) `[low]` `[reject]` messages say "on main" for the base checkout — `ownership.yml` runs only for PRs into `main` and the queue's base is `main`.
  - (edge) `[false]` `[reject]` fixture copies only `conformance/oracle/requests/` sources — every current source is under that prefix; a new one fails the gate-open tests loudly, never silently.
  - (edge claim) `[low]` `[reject]` the helpers live in `phase-gate-fixtures.ts`, not the test file — moved deliberately so importing them registers no tests; spec-text only.
  - (intent a) `[false]` `[reject]` the gate enforces at merge, not at Story start — the AC says "when its PR is checked"; the orchestrator already holds Epic 9 behind the Epic 8 checkpoint.
  - (intent b) `[low]` `[defer]` `PHASE-0-EXIT.md` is a separate signal from the orchestrator's `MAINT-checkpoint-epic-8.md` — the AC names the file; the Maintainer must write it at the checkpoint (frontmatter deferred item; reported on the status issue).
  - (intent c) `[false]` `[reject]` the signature checks form, not identity — the stated limit (Design Notes, lesson epic 1); identity separation is unavailable while the orchestrator acts as the Maintainer.
  - (intent d) `[false]` `[reject]` the boundary is a constant — same as edge 3.
  - (intent e) `[medium]` `[patch]` AC2's forward guarantee rests on a string check — grouped with F-7 (reviewer 1).
  - (intent f) `[false]` `[reject]` tests use hermetic roots, not real `main` — intended; `main` has no exit file until the Maintainer signs.
  - (intent g) `[false]` `[reject]` Protected Path edits by a Story — Epic 8 Stories are Maintainer-approved Infrastructure Stories (MAINT-2026-10-16).
  - (blind) `[medium]` `[patch]` docs claim the pilot report is Protected — corrected in `phase-gate.ts` and `docs/ops/porting.md`: only `PORTING.md` and `decisions/` are; removing the report re-closes the gate loudly.
  - (blind) `[low]` `[reject]` DIV records checked only for existence — the AC asks that they exist; `divergence:check` validates them in the required `check` job on every PR.
  - (blind) `[low]` `[reject]` `DIV_RECORDS` repeats 12 instead of `DIV_COUNT` — importing `divergence.ts` would pull the harness and pin-bump into every importer of `ownership.ts`; DIV-1..12 is fixed by the PRD.
  - (blind) `[low]` `[reject]` `activePhases` treats an unsigned `PHASE-0-EXIT.md` as exited — no `after-phase:0` entry exists, so nothing differs.
  - (blind) `[medium]` `[defer]` branches outside `story/`, `planning/`, `bot/` are never gated — pre-existing ownership rule (other branches pass whatever they touch), not caused by this Story.
  - (blind) `[medium]` `[patch]` fail-closed branch untested — same as verification-gap 1.
  - (blind) `[low]` `[patch]` truncation test does not prove truncation — count > 3 asserted.
  - (blind) `[medium]` `[patch]` XT-169's title overstates — grouped with F-7 (reviewer 1).
  - (blind) `[low]` `[reject]` install on every PR / supply-chain in `pull_request_target` — base lockfile only, `--ignore-scripts`, no token in the install step; the check step's token is `contents`/`pull-requests: read`. The test filter exempts the one install step by position, which its comment names.
  - (blind) `[false]` `[reject]` `evaluatePr` callers skip the gate — the header states that only `pr` runs the gate and `evaluatePr` returns `epic`; the only caller that judges PRs is `pr`.
  - (blind) `[low]` `[reject]` "on main" wording — same as edge 5.
  - (blind) `[low]` `[reject]` constant boundary — same as edge 3 (verdict there `false`; kept low here for the second-source point, which the XT cross-check covers).
  - (fidelity) `[medium]` `[patch]` F-7 reviewer 1 (codex): XT-169 only finds two command strings in `ci.yml` — now asserts the `check` job and steps are unconditional and fail-hard and run on `pull_request` and `merge_group`; description narrowed.
  - (fidelity) `[low]` `[patch]` F-7 reviewer 2 (claude): "non-Story branches" shows only `planning/*` and `bot/*` — added a `feature/x` run on the closed base.

### 2026-10-20 — Review pass (Finalize re-check, iteration 1)
- verdicts: 2 findings — high 0, medium 0, low 0, false 2, maybe-false 0
- findings:
  - (fidelity) `[false]` `[reject]` F-7 reviewer 1 (codex): asks for FR-4.3/AD-16.5 and the full XT-conformance-245 body to compare its retained citations — no defect claimed; the diff changes only that test's fixture setup (`writeGateInputs(dir)`), not its title, consequence or assertions, and the tool's evidence covers citations on added lines only. Reviewer 2 (claude) passed the same tree.
  - (fidelity) `[false]` `[reject]` F-7 reviewer 1 (codex): asks for AD-16.5/AD-21.1 and the full XT-conformance-23 body — same: only the fixture root gains `gate = true` and `epic: null` joins an exact-equality result, which tightens it; the consequence is unchanged.

### 2026-10-20 — Review pass (Finalize re-check, iteration 2)
- verdicts: 2 findings — high 0, medium 0, low 2, false 0, maybe-false 0
- findings:
  - (fidelity) `[low]` `[patch]` F-7 reviewer 1 (codex): the changed XT-conformance-23 body cannot be checked against AD-16.5/AD-21.1 — the diff no longer edits it: `evaluatePr`'s result is unchanged and `fixtureRoot` writes the gate inputs (Spec Change Log).
  - (fidelity) `[low]` `[patch]` F-7 reviewer 1 (codex): the XT-conformance-245 fixture hunk cannot establish its consequence — the gate inputs moved into `baseRoot`, so its body is untouched.

### 2026-10-20 — Review pass (Finalize re-check, iteration 3)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. Reviewer 1 codex `gpt-6.1-sol` pass, reviewer 2 claude `claude-opus-5-5` pass, on tree `a3cfaa918e4cbacab7348ec34b491df8b8b3a7fc`.

### 2026-10-20 — Review pass (Finalize re-check, iteration 4)
- verdicts: 2 findings — high 0, medium 0, low 0, false 0, maybe-false 2
- findings:
  - (fidelity) `[maybe-false]` `[reject]` F-7 reviewer 1 (codex): asks for XT-conformance-24's full body — an evidence request with no defect claimed; the code is identical to the tree both reviewers passed in iteration 3 (only `stories/8.8.md`'s status changed). It would settle if the tool supplied whole changed test bodies; if true it would be low.
  - (fidelity) `[maybe-false]` `[reject]` F-7 reviewer 1 (codex): asks for every test using `baseRoot` — same; the shared fixture only adds files under paths those tests never read (`decisions/DIV-*`, `PORTING.md`, the spine, the pilot report); all pass in `harness --xaravel`.

### 2026-10-20 — Review pass (Finalize re-check, iteration 5)
- verdicts: 3 findings — high 0, medium 0, low 1, false 0, maybe-false 2
- findings:
  - (fidelity) `[low]` `[patch]` F-7 reviewer 1 (codex): XT-conformance-169 would not notice a `paths`/`paths-ignore` filter on `ci.yml`'s `pull_request` or `merge_group` — it now asserts neither event has `paths`, `paths-ignore` or `branches-ignore`.
  - (fidelity) `[maybe-false]` `[reject]` F-7 reviewer 1 (codex): XT-conformance-24's full body — same evidence request as iteration 4.
  - (fidelity) `[maybe-false]` `[reject]` F-7 reviewer 1 (codex): tests using the shared fixture — same evidence request as iteration 4.
- A sixth re-check would exceed the 5-iteration limit: HALT blocked (non-convergence), raised as `conformance/escalations/ESC-8.8-1.md`.

## Design Notes

A latch was rejected. "Passes from then on" holds because the inputs are Protected, and CI keeps `PORTING.md` and the DIV records valid on every PR into `main`. A latch would need state outside git.

The exit file has the same identity limit as every orchestrator ruling (lesson, epic 1): the orchestrator commits as the Maintainer, so the check verifies the form of the signature, not who wrote it. Only the Maintainer writes `PHASE-0-EXIT.md`. The Auto Run Result names this as a Maintainer step at the Epic 8 checkpoint.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-conformance-1[67]*'` and `bun run harness --xaravel --id 'XT-conformance-2[2-5]'` -- expected: no differences
- `bun test conformance/tests/xaravel/ownership-lines.test.ts conformance/tests/xaravel/ci-pipeline.test.ts` -- expected: pass
- `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `bun run ownership:check` -- expected: exit 0
- `bun run story:check 8.8` -- expected: every clause except `full-run` passes locally

## Fidelity Review

### Reviewer 1: reject at tree 7c183e35a0bf51884cd1469cca2dd6a87f1da32a

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f`, on 2026-10-20T21:22:27.577Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff changes none. |
| F-2: No expected value is weakened | n/a | No Upstream expected values or Ported Test assertions are changed. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests are changed, so no Upstream assertions are removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The diff adds no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared the changed Xaravel Tests with their declared consequences. XT-conformance-169 does not establish its claim that CI keeps the gate inputs valid. |
| F-8: No stub, fake or partial implementation of another Component | pass | The changes implement conformance ownership gating and its tests; they add no implementation of another Component's behavior. |
| F-9: Every `@asyncRoot` tag is true | n/a | No async-root Driver methods or @​asyncRoot tags are changed; the asynchronous gate is conformance tooling. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests/ file is changed. |

Findings:

- **F-7** `conformance/tests/xaravel/phase-gate.test.ts`: XT-conformance-169 only checks that two command strings appear in ci.jobs.check.steps. This would pass if the job were conditional, allowed failures, or did not run on every PR into main. Verify the workflow conditions and failure enforcement supporting the declared CI guarantee, or narrow the consequence string.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"7c183e35a0bf51884cd1469cca2dd6a87f1da32a","base":"d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-20T21:22:27.577Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff changes none.","findings":[]},{"id":"F-2","result":"n/a","note":"No Upstream expected values or Ported Test assertions are changed.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests are changed, so no Upstream assertions are removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The diff adds no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle error fixtures.","findings":[]},{"id":"F-7","result":"fail","note":"Compared the changed Xaravel Tests with their declared consequences. XT-conformance-169 does not establish its claim that CI keeps the gate inputs valid.","findings":[{"path":"conformance/tests/xaravel/phase-gate.test.ts","detail":"XT-conformance-169 only checks that two command strings appear in ci.jobs.check.steps. This would pass if the job were conditional, allowed failures, or did not run on every PR into main. Verify the workflow conditions and failure enforcement supporting the declared CI guarantee, or narrow the consequence string."}]},{"id":"F-8","result":"pass","note":"The changes implement conformance ownership gating and its tests; they add no implementation of another Component's behavior.","findings":[]},{"id":"F-9","result":"n/a","note":"No async-root Driver methods or @asyncRoot tags are changed; the asynchronous gate is conformance tooling.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests/ file is changed.","findings":[]}]}
```

### Reviewer 2: reject at tree 7c183e35a0bf51884cd1469cca2dd6a87f1da32a

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f`, on 2026-10-20T21:22:27.577Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and the diff adds or changes no Ported Test, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test is added or changed, so there is no expected value to compare with Upstream's. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, and the evidence lists no adapted:DIV marker. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff changes no Expectations line, so there is no new Skip Reason to check. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV-<n>.<k> marker, and no Expectations adapted field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): the Story relies on no error fixture, and the change adds or modifies none. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | I compared the bodies of XT-conformance-168 and XT-conformance-169 with their descriptions. Neither cites an FR-<n>.<k> or AD-<n>.<k> token; both cite only FR-8. XT-168 checks every unmet condition (PORTING.md missing or failing, a DIV record missing, the pilot report missing or blank, each unsigned exit form, everything missing at once) and the CLI's exit 1 with the expected stderr, so it covers its description. XT-169 checks the open gate across several epics, a series of passing PRs, a head that deletes the inputs, Phase 0 Stories, planning/* and bot/*, and ci.yml's check steps. But its description claims non-Story branches in general are never gated, and only planning/* and bot/* are run. Other non-Story branches go through a separate evaluatePr path that is not run here. The body checks less than the description claims. |
| F-8: No stub, fake or partial implementation of another Component | pass | The changes sit in the conformance tooling: tools/ownership (the new phase-gate.ts and the ownership.ts wiring), its workflow, its Xaravel Tests and its ops docs. The gate reuses the existing checkPorting and parseFrontmatter rather than stubbing them. The test fixtures copy the real gate inputs and write a fixture PHASE-0-EXIT.md in temp roots. No hard-coded return or partial implementation of another Component was added. |
| F-9: Every `@asyncRoot` tag is true | n/a | Evidence (d): no added line contains @​asyncRoot. phaseGateViolations is async only for a dynamic import in tooling, not behind a Driver contract, and carries no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `conformance/tests/xaravel/phase-gate.test.ts`: XT-conformance-169's description says "non-Story branches are never gated", but the body runs only planning/* and bot/* on the closed base. Add a run of 'ownership pr' with another branch (e.g. 'feature/x') against 'base(false)', then assert exit 0 and no 'phase gate:' lines. Otherwise narrow the description to planning/* and bot/*.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"7c183e35a0bf51884cd1469cca2dd6a87f1da32a","base":"d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-20T21:22:27.577Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and the diff adds or changes no Ported Test, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is added or changed, so there is no expected value to compare with Upstream's.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, and the evidence lists no adapted:DIV marker.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff changes no Expectations line, so there is no new Skip Reason to check.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV-<n>.<k> marker, and no Expectations adapted field changes.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): the Story relies on no error fixture, and the change adds or modifies none.","findings":[]},{"id":"F-7","result":"fail","note":"I compared the bodies of XT-conformance-168 and XT-conformance-169 with their descriptions. Neither cites an FR-<n>.<k> or AD-<n>.<k> token; both cite only FR-8. XT-168 checks every unmet condition (PORTING.md missing or failing, a DIV record missing, the pilot report missing or blank, each unsigned exit form, everything missing at once) and the CLI's exit 1 with the expected stderr, so it covers its description. XT-169 checks the open gate across several epics, a series of passing PRs, a head that deletes the inputs, Phase 0 Stories, planning/* and bot/*, and ci.yml's check steps. But its description claims non-Story branches in general are never gated, and only planning/* and bot/* are run. Other non-Story branches go through a separate evaluatePr path that is not run here. The body checks less than the description claims.","findings":[{"path":"conformance/tests/xaravel/phase-gate.test.ts","detail":"XT-conformance-169's description says \"non-Story branches are never gated\", but the body runs only planning/* and bot/* on the closed base. Add a run of `ownership pr` with another branch (e.g. `feature/x`) against `base(false)`, then assert exit 0 and no `phase gate:` lines. Otherwise narrow the description to planning/* and bot/*."}]},{"id":"F-8","result":"pass","note":"The changes sit in the conformance tooling: tools/ownership (the new phase-gate.ts and the ownership.ts wiring), its workflow, its Xaravel Tests and its ops docs. The gate reuses the existing checkPorting and parseFrontmatter rather than stubbing them. The test fixtures copy the real gate inputs and write a fixture PHASE-0-EXIT.md in temp roots. No hard-coded return or partial implementation of another Component was added.","findings":[]},{"id":"F-9","result":"n/a","note":"Evidence (d): no added line contains @asyncRoot. phaseGateViolations is async only for a dynamic import in tooling, not behind a Driver contract, and carries no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}]}
```

### Reviewer 1: reject at tree ae3435b5e407e1051402e8cf4da32ae2d4d9398d

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f`, on 2026-10-20T21:28:07.681Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are added or changed; the manifest assigns no Ported Test IDs. |
| F-2: No expected value is weakened | n/a | No Upstream expected values are changed; the changed assertions belong to Xaravel Tests. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are removed or changed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted assertion markers or Expectations adapted fields are changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The new gate tests exercise their declared gate behavior, but the supplied material does not establish whether the bullet citations retained by changed Xaravel Tests identify the requirements actually tested. Under the uncertainty rule, this cannot pass. |
| F-8: No stub, fake or partial implementation of another Component | pass | The implementation changes conformance ownership tooling and calls the existing porting checker. The temporary gate inputs and GitHub API fake are test fixtures, with no implementation of another Component added. |
| F-9: Every `@asyncRoot` tag is true | n/a | No asyncRoot tags are added or retained in the supplied change, and no async-root Driver implementation is introduced. The gate reads files synchronously and dynamically imports the existing checker. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file is changed. |

Findings:

- **F-7** `conformance/tests/xaravel/ownership-lines.test.ts`: Provide the definitions of FR-4.3 and AD-16.5 and the complete XT-conformance-245 body so its retained consequence citations can be compared with its assertions.
- **F-7** `conformance/tests/xaravel/ownership.test.ts`: Provide the definitions of AD-16.5 and AD-21.1 and the complete changed XT-conformance-23 body so its retained consequence citations can be verified.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"ae3435b5e407e1051402e8cf4da32ae2d4d9398d","base":"d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-20T21:28:07.681Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are added or changed; the manifest assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"n/a","note":"No Upstream expected values are changed; the changed assertions belong to Xaravel Tests.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are removed or changed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted assertion markers or Expectations adapted fields are changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle error fixtures.","findings":[]},{"id":"F-7","result":"fail","note":"The new gate tests exercise their declared gate behavior, but the supplied material does not establish whether the bullet citations retained by changed Xaravel Tests identify the requirements actually tested. Under the uncertainty rule, this cannot pass.","findings":[{"path":"conformance/tests/xaravel/ownership-lines.test.ts","detail":"Provide the definitions of FR-4.3 and AD-16.5 and the complete XT-conformance-245 body so its retained consequence citations can be compared with its assertions."},{"path":"conformance/tests/xaravel/ownership.test.ts","detail":"Provide the definitions of AD-16.5 and AD-21.1 and the complete changed XT-conformance-23 body so its retained consequence citations can be verified."}]},{"id":"F-8","result":"pass","note":"The implementation changes conformance ownership tooling and calls the existing porting checker. The temporary gate inputs and GitHub API fake are test fixtures, with no implementation of another Component added.","findings":[]},{"id":"F-9","result":"n/a","note":"No asyncRoot tags are added or retained in the supplied change, and no async-root Driver implementation is introduced. The gate reads files synchronously and dynamically imports the existing checker.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file is changed.","findings":[]}]}
```

### Reviewer 2: pass at tree ae3435b5e407e1051402e8cf4da32ae2d4d9398d

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f`, on 2026-10-20T21:28:07.681Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty, and the change adds or changes no Ported Test. It only changes Xaravel Tests and tooling, so there are no Upstream assertions to compare against. |
| F-2: No expected value is weakened | n/a | No Ported Test is added or changed, so there is no Upstream expected value that could have been weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there are no Upstream assertions to count. Evidence (a): no added line has an adapted marker. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff changes no Expectations line under conformance/expectations/, so no Skip Reason is added. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line has an '// adapted:DIV-<n>.<k>' marker, and no Expectations 'adapted' field is changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): the Story relies on no Oracle fixture, base or changed, whose output is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-conformance-168: the body checks that Phase 0 is epics 1..8 against epics.md. It checks the open gate and each unmet condition: PORTING.md missing, failing checkPorting (first 3 violations quoted, with the count) or throwing; a DIV record missing; the pilot report missing or blank; PHASE-0-EXIT.md missing or with each kind of bad signature. It checks one line per unmet condition, the CLI exit code 1 with the 'phase gate:' lines, and the workflow's install step. That covers what its consequence string claims. XT-conformance-169 checks: an open gate passes for epics 9, 14 and 71; a series of Phase 1 PRs pass; a head that deletes every gate input gets only out-of-scope lines and no contents fetch; Phase 0 Stories, planning/*, bot/* and other branches are not gated on a closed base; and ci.yml's check job runs porting:check and divergence:check with no if or continue-on-error, on pull_request and merge_group. The word 'required' is backed only by what is in the repository. The changed XT-conformance-23, 24, 180, 181 and 245 only add the new 'epic: null' field, the gate fixture and the new workflow step. XT-24 leaves the install step out of its 'no install' loop, but asserts that step exactly (base checkout, frozen lockfile, --ignore-scripts). The only consequence tokens cited are FR-8 and the existing AD tokens, and none is an FR-<n>.<k> or AD-<n>.<k> token pointing at the wrong bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | The change is limited to conformance tooling (tools/ownership, its workflow and docs) and Xaravel Tests, which matches the conformance Component of this Phase 1 gate Story. It imports parseFrontmatter and checkPorting from existing tools without changing them. It adds no stub, fake or hard-coded return for another Component's behaviour. The fixture module copies the real gate inputs into temporary directories, which is test setup, not a fake implementation. |
| F-9: Every `@asyncRoot` tag is true | n/a | Evidence (d): no added line has '@​asyncRoot'. phaseGateViolations is async only because of a dynamic import in CI tooling, which is not an async-root Driver contract. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"ae3435b5e407e1051402e8cf4da32ae2d4d9398d","base":"d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-20T21:28:07.681Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty, and the change adds or changes no Ported Test. It only changes Xaravel Tests and tooling, so there are no Upstream assertions to compare against.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream expected value that could have been weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there are no Upstream assertions to count. Evidence (a): no added line has an adapted marker.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff changes no Expectations line under conformance/expectations/, so no Skip Reason is added.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line has an `// adapted:DIV-<n>.<k>` marker, and no Expectations `adapted` field is changed.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): the Story relies on no Oracle fixture, base or changed, whose output is an error.","findings":[]},{"id":"F-7","result":"pass","note":"XT-conformance-168: the body checks that Phase 0 is epics 1..8 against epics.md. It checks the open gate and each unmet condition: PORTING.md missing, failing checkPorting (first 3 violations quoted, with the count) or throwing; a DIV record missing; the pilot report missing or blank; PHASE-0-EXIT.md missing or with each kind of bad signature. It checks one line per unmet condition, the CLI exit code 1 with the `phase gate:` lines, and the workflow's install step. That covers what its consequence string claims. XT-conformance-169 checks: an open gate passes for epics 9, 14 and 71; a series of Phase 1 PRs pass; a head that deletes every gate input gets only out-of-scope lines and no contents fetch; Phase 0 Stories, planning/*, bot/* and other branches are not gated on a closed base; and ci.yml's check job runs porting:check and divergence:check with no if or continue-on-error, on pull_request and merge_group. The word 'required' is backed only by what is in the repository. The changed XT-conformance-23, 24, 180, 181 and 245 only add the new `epic: null` field, the gate fixture and the new workflow step. XT-24 leaves the install step out of its 'no install' loop, but asserts that step exactly (base checkout, frozen lockfile, --ignore-scripts). The only consequence tokens cited are FR-8 and the existing AD tokens, and none is an FR-<n>.<k> or AD-<n>.<k> token pointing at the wrong bullet.","findings":[]},{"id":"F-8","result":"pass","note":"The change is limited to conformance tooling (tools/ownership, its workflow and docs) and Xaravel Tests, which matches the conformance Component of this Phase 1 gate Story. It imports parseFrontmatter and checkPorting from existing tools without changing them. It adds no stub, fake or hard-coded return for another Component's behaviour. The fixture module copies the real gate inputs into temporary directories, which is test setup, not a fake implementation.","findings":[]},{"id":"F-9","result":"n/a","note":"Evidence (d): no added line has `@asyncRoot`. phaseGateViolations is async only because of a dynamic import in CI tooling, which is not an async-root Driver contract.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}]}
```

### Reviewer 1: reject at tree ae3435b5e407e1051402e8cf4da32ae2d4d9398d

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f`, on 2026-10-20T21:29:09.127Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff changes only Xaravel Tests. |
| F-2: No expected value is weakened | n/a | No Ported Test expected values are added or changed for comparison with Upstream. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests are changed, so there are no Upstream assertions to count. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The diff adds no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on or changed Oracle fixture with an error output. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The new phase-gate test bodies exercise their declared gate behavior. However, changed existing Xaravel Tests cite requirement bullets whose contents are not supplied, so their citation fidelity cannot be confirmed. |
| F-8: No stub, fake or partial implementation of another Component | pass | The implementation adds conformance ownership gating and reuses existing porting checks; it introduces no stub or partial implementation of another Component. |
| F-9: Every `@asyncRoot` tag is true | n/a | No asyncRoot tags are added or shown as retained, and the asynchronous tooling shown is not an async-root Driver implementation. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file is changed. |

Findings:

- **F-7** `conformance/tests/xaravel/ownership.test.ts`: Provide the cited AD-16.5, AD-21.1 and other requirement bullet texts, together with complete changed test bodies, so each changed test's consequence and citations can be verified.
- **F-7** `conformance/tests/xaravel/ownership-lines.test.ts`: Provide the complete XT-conformance-245 body and the FR-4.3 and AD-16.5 bullet texts; the supplied fixture-only hunk cannot establish that the test verifies its entire declared consequence and the cited bullets.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"ae3435b5e407e1051402e8cf4da32ae2d4d9398d","base":"d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-20T21:29:09.127Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff changes only Xaravel Tests.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test expected values are added or changed for comparison with Upstream.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests are changed, so there are no Upstream assertions to count.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The diff adds no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on or changed Oracle fixture with an error output.","findings":[]},{"id":"F-7","result":"fail","note":"The new phase-gate test bodies exercise their declared gate behavior. However, changed existing Xaravel Tests cite requirement bullets whose contents are not supplied, so their citation fidelity cannot be confirmed.","findings":[{"path":"conformance/tests/xaravel/ownership.test.ts","detail":"Provide the cited AD-16.5, AD-21.1 and other requirement bullet texts, together with complete changed test bodies, so each changed test's consequence and citations can be verified."},{"path":"conformance/tests/xaravel/ownership-lines.test.ts","detail":"Provide the complete XT-conformance-245 body and the FR-4.3 and AD-16.5 bullet texts; the supplied fixture-only hunk cannot establish that the test verifies its entire declared consequence and the cited bullets."}]},{"id":"F-8","result":"pass","note":"The implementation adds conformance ownership gating and reuses existing porting checks; it introduces no stub or partial implementation of another Component.","findings":[]},{"id":"F-9","result":"n/a","note":"No asyncRoot tags are added or shown as retained, and the asynchronous tooling shown is not an async-root Driver implementation.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file is changed.","findings":[]}]}
```

### Reviewer 2: pass at tree ae3435b5e407e1051402e8cf4da32ae2d4d9398d

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f`, on 2026-10-20T21:29:09.127Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and the diff adds or changes no Ported Test. Every changed test is an xaravelTest, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test is added or changed, so there are no Upstream expected values that could be weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there are no Upstream assertions to count. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff touches no Expectations shard and sets no line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field is changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): the Story relies on no Oracle error fixture, and none is added or modified. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-conformance-168 checks everything its consequence claims. With the gate open there are no violations. Each unmet condition gives exactly one 'phase gate:' line: PORTING.md missing, failing or throwing; a DIV record missing; the pilot report missing or blank; the exit file missing or with each signature defect. With every input missing there are four lines, and the CLI exits 1 with those lines. XT-conformance-169 checks that, once the gate is open, a run of Phase 1 PRs passes. A head that deletes the gate inputs produces no gate line and no contents fetch, which shows the gate reads only the base. Phase 0, planning/*, bot/* and feature/* PRs are never gated. ci.yml's check job runs porting:check and divergence:check unconditionally on pull_request and merge_group. Both tests cite only FR-8, with no FR-<n>.<k> or AD-<n>.<k> token (evidence (b)). In XT-conformance-24 and its neighbours, the edits add epic: null to the expected results and shift the step indexes. The 'no install' loop now leaves out the new install step, but a new assertion pins that step exactly to 'bun install --frozen-lockfile --ignore-scripts' on the base checkout. Caveat: the diff truncates XT-conformance-24's consequence string, so I could not confirm its full wording still matches the edited body. |
| F-8: No stub, fake or partial implementation of another Component | pass | The changes are to conformance tooling (tools/ownership), the ownership workflow, docs/ops and conformance Xaravel Tests, all within the conformance Component's tooling. The gate calls the real checkPorting and the real parseFrontmatter instead of stubbing them. The signed PHASE-0-EXIT text exists only in the test fixture; it is never written to the real repository and is not a hard-coded production return. |
| F-9: Every `@asyncRoot` tag is true | n/a | Evidence (d): no @​asyncRoot tag is added. The async phaseGateViolations is conformance tooling that awaits a dynamic import, not framework code behind an async-root Driver contract, so the item has nothing to apply to. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"ae3435b5e407e1051402e8cf4da32ae2d4d9398d","base":"d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-20T21:29:09.127Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and the diff adds or changes no Ported Test. Every changed test is an xaravelTest, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is added or changed, so there are no Upstream expected values that could be weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there are no Upstream assertions to count.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff touches no Expectations shard and sets no line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field is changed.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): the Story relies on no Oracle error fixture, and none is added or modified.","findings":[]},{"id":"F-7","result":"pass","note":"XT-conformance-168 checks everything its consequence claims. With the gate open there are no violations. Each unmet condition gives exactly one 'phase gate:' line: PORTING.md missing, failing or throwing; a DIV record missing; the pilot report missing or blank; the exit file missing or with each signature defect. With every input missing there are four lines, and the CLI exits 1 with those lines. XT-conformance-169 checks that, once the gate is open, a run of Phase 1 PRs passes. A head that deletes the gate inputs produces no gate line and no contents fetch, which shows the gate reads only the base. Phase 0, planning/*, bot/* and feature/* PRs are never gated. ci.yml's check job runs porting:check and divergence:check unconditionally on pull_request and merge_group. Both tests cite only FR-8, with no FR-<n>.<k> or AD-<n>.<k> token (evidence (b)). In XT-conformance-24 and its neighbours, the edits add epic: null to the expected results and shift the step indexes. The 'no install' loop now leaves out the new install step, but a new assertion pins that step exactly to `bun install --frozen-lockfile --ignore-scripts` on the base checkout. Caveat: the diff truncates XT-conformance-24's consequence string, so I could not confirm its full wording still matches the edited body.","findings":[]},{"id":"F-8","result":"pass","note":"The changes are to conformance tooling (tools/ownership), the ownership workflow, docs/ops and conformance Xaravel Tests, all within the conformance Component's tooling. The gate calls the real checkPorting and the real parseFrontmatter instead of stubbing them. The signed PHASE-0-EXIT text exists only in the test fixture; it is never written to the real repository and is not a hard-coded production return.","findings":[]},{"id":"F-9","result":"n/a","note":"Evidence (d): no @asyncRoot tag is added. The async phaseGateViolations is conformance tooling that awaits a dynamic import, not framework code behind an async-root Driver contract, so the item has nothing to apply to.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}]}
```

### Reviewer 1: pass at tree a3cfaa918e4cbacab7348ec34b491df8b8b3a7fc

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f`, on 2026-10-20T21:32:58.885Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff changes none. |
| F-2: No expected value is weakened | n/a | No Upstream expected values are changed; the workflow assertions belong to Xaravel Tests. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are removed or changed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-conformance-168 checks gate prerequisites, failure diagnostics and CLI enforcement. XT-conformance-169 checks passing bases, head independence, branch exemptions and CI commands. The changed ownership test checks the updated workflow. No cited FR or AD bullet tokens require additional matching. |
| F-8: No stub, fake or partial implementation of another Component | pass | The implementation stays within conformance tooling and calls the existing porting checker. Temporary gate files and the GitHub API fake are test fixtures, not implementations of another Component. |
| F-9: Every `@asyncRoot` tag is true | n/a | No asyncRoot tags or async-root Driver implementations are added or changed; the asynchronous additions are conformance tooling. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"a3cfaa918e4cbacab7348ec34b491df8b8b3a7fc","base":"d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-20T21:32:58.885Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff changes none.","findings":[]},{"id":"F-2","result":"n/a","note":"No Upstream expected values are changed; the workflow assertions belong to Xaravel Tests.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are removed or changed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle error fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"XT-conformance-168 checks gate prerequisites, failure diagnostics and CLI enforcement. XT-conformance-169 checks passing bases, head independence, branch exemptions and CI commands. The changed ownership test checks the updated workflow. No cited FR or AD bullet tokens require additional matching.","findings":[]},{"id":"F-8","result":"pass","note":"The implementation stays within conformance tooling and calls the existing porting checker. Temporary gate files and the GitHub API fake are test fixtures, not implementations of another Component.","findings":[]},{"id":"F-9","result":"n/a","note":"No asyncRoot tags or async-root Driver implementations are added or changed; the asynchronous additions are conformance tooling.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}]}
```

### Reviewer 2: pass at tree a3cfaa918e4cbacab7348ec34b491df8b8b3a7fc

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f`, on 2026-10-20T21:32:58.885Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | Manifest test_ids is empty and the diff adds or changes no Ported Test; there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test is added or changed, so no Upstream expected value can be weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there are no Upstream assertions to count. Evidence (a) shows no adapted markers. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip; it touches no Expectations file. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field is changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no base or changed Oracle fixture the Story relies on has an error output, and the Story assigns no Ported Tests. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-conformance-168: the body checks that the gate is open with all inputs (empty violations), then each unmet condition. Those are PORTING.md missing, failing porting:check (count plus at most 3 quoted) and checkPorting throwing; a missing DIV record; the pilot report missing or blank; the exit file missing or unsigned (each field). It checks one line per condition when everything is missing. Through the CLI it checks exit 1 with the phase gate: lines on stderr, both alone and beside other violations. It also checks the Phase 0 epic range against epics.md and the workflow install step. That covers the consequence string. XT-conformance-169: the body checks that an open base passes several Phase 1 PRs through the CLI. A head that deletes the gate inputs gets only path violations, and no contents API is called. Phase 0 Stories and planning/, bot/ and feature/ branches get no gate lines. ci.yml's check job runs porting:check and divergence:check unconditionally, on pull_request and merge_group. That matches the declared consequence. Both cite only FR-8, the requirement the gate implements; no FR-n.k or AD-n.k bullet is cited (evidence b). |
| F-8: No stub, fake or partial implementation of another Component | pass | Story component is conformance. The changes are to the conformance tooling (tools/ownership/ownership.ts and the new phase-gate.ts), the ownership workflow, ops docs and conformance Xaravel Tests. phase-gate.ts reuses the existing parseFrontmatter and loads the real checkPorting dynamically. There is no stub, fake or hard-coded return of another Component's behaviour. The test fixtures copy the real gate inputs and write a stand-in PHASE-0-EXIT.md only in temporary folders, never the real file. |
| F-9: Every `@asyncRoot` tag is true | n/a | Evidence (d): no added line contains @​asyncRoot, and the change is to tooling, not a Driver contract. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"a3cfaa918e4cbacab7348ec34b491df8b8b3a7fc","base":"d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-20T21:32:58.885Z","items":[{"id":"F-1","result":"n/a","note":"Manifest test_ids is empty and the diff adds or changes no Ported Test; there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is added or changed, so no Upstream expected value can be weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there are no Upstream assertions to count. Evidence (a) shows no adapted markers.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip; it touches no Expectations file.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field is changed.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no base or changed Oracle fixture the Story relies on has an error output, and the Story assigns no Ported Tests.","findings":[]},{"id":"F-7","result":"pass","note":"XT-conformance-168: the body checks that the gate is open with all inputs (empty violations), then each unmet condition. Those are PORTING.md missing, failing porting:check (count plus at most 3 quoted) and checkPorting throwing; a missing DIV record; the pilot report missing or blank; the exit file missing or unsigned (each field). It checks one line per condition when everything is missing. Through the CLI it checks exit 1 with the phase gate: lines on stderr, both alone and beside other violations. It also checks the Phase 0 epic range against epics.md and the workflow install step. That covers the consequence string. XT-conformance-169: the body checks that an open base passes several Phase 1 PRs through the CLI. A head that deletes the gate inputs gets only path violations, and no contents API is called. Phase 0 Stories and planning/, bot/ and feature/ branches get no gate lines. ci.yml's check job runs porting:check and divergence:check unconditionally, on pull_request and merge_group. That matches the declared consequence. Both cite only FR-8, the requirement the gate implements; no FR-n.k or AD-n.k bullet is cited (evidence b).","findings":[]},{"id":"F-8","result":"pass","note":"Story component is conformance. The changes are to the conformance tooling (tools/ownership/ownership.ts and the new phase-gate.ts), the ownership workflow, ops docs and conformance Xaravel Tests. phase-gate.ts reuses the existing parseFrontmatter and loads the real checkPorting dynamically. There is no stub, fake or hard-coded return of another Component's behaviour. The test fixtures copy the real gate inputs and write a stand-in PHASE-0-EXIT.md only in temporary folders, never the real file.","findings":[]},{"id":"F-9","result":"n/a","note":"Evidence (d): no added line contains @asyncRoot, and the change is to tooling, not a Driver contract.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}]}
```

### Reviewer 1: reject at tree 7e9dfde1882226239fa1554e4f9f33e5d2be3393

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f`, on 2026-10-20T21:34:02.867Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff changes none. |
| F-2: No expected value is weakened | n/a | No Ported Test expected values are added or changed. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests are changed, so no Upstream assertion counterparts are removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The diff adds no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The new phase-gate tests exercise their declared conditions, but the supplied diff omits enough of the changed existing Xaravel Tests to prevent confirming every changed body's full consequence. |
| F-8: No stub, fake or partial implementation of another Component | pass | The changes implement conformance ownership gating and its tests; no other Component's behavior is stubbed or partially implemented. |
| F-9: Every `@asyncRoot` tag is true | n/a | No async-root Driver methods or @​asyncRoot tags are shown; the asynchronous gate and test helpers are not Driver contracts. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

- **F-7** `conformance/tests/xaravel/ownership.test.ts`: Provide the complete consequence and body of changed XT-conformance-24 so its assertions can be compared with its entire declaration.
- **F-7** `conformance/tests/xaravel/ownership-lines.test.ts`: Provide the declarations and bodies of Xaravel Tests affected by the changed shared baseRoot fixture so their declared consequences can be verified.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"7e9dfde1882226239fa1554e4f9f33e5d2be3393","base":"d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-20T21:34:02.867Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff changes none.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test expected values are added or changed.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests are changed, so no Upstream assertion counterparts are removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The diff adds no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle error fixtures.","findings":[]},{"id":"F-7","result":"fail","note":"The new phase-gate tests exercise their declared conditions, but the supplied diff omits enough of the changed existing Xaravel Tests to prevent confirming every changed body's full consequence.","findings":[{"path":"conformance/tests/xaravel/ownership.test.ts","detail":"Provide the complete consequence and body of changed XT-conformance-24 so its assertions can be compared with its entire declaration."},{"path":"conformance/tests/xaravel/ownership-lines.test.ts","detail":"Provide the declarations and bodies of Xaravel Tests affected by the changed shared baseRoot fixture so their declared consequences can be verified."}]},{"id":"F-8","result":"pass","note":"The changes implement conformance ownership gating and its tests; no other Component's behavior is stubbed or partially implemented.","findings":[]},{"id":"F-9","result":"n/a","note":"No async-root Driver methods or @asyncRoot tags are shown; the asynchronous gate and test helpers are not Driver contracts.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}]}
```

### Reviewer 2: pass at tree 7e9dfde1882226239fa1554e4f9f33e5d2be3393

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f`, on 2026-10-20T21:34:02.867Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and no Ported Test is added or changed, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test is added or changed, so there are no Upstream expected values to compare. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, and no adapted marker is added (evidence a). |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff changes no Expectations line and sets nothing to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an adapted:DIV marker and no Expectations adapted field changes (evidence a). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The Story has no Oracle fixtures. Evidence (c) lists no error fixture in the base or in the change. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-conformance-168: the body tests each unmet condition of the gate against phaseGateViolations, and checks the open gate, the throwing checkPorting case, every exit-signature case, the all-missing case and the CLI exit code 1 with phase gate: lines. That covers its consequence. XT-conformance-169: the body checks that the open gate passes for epics 9, 14 and 71 and for a sequence of PRs, and that the gate reads the base, not a head that deletes the inputs (no contents fetches). It checks that the Phase 0 Story and the planning/, bot/ and feature/ branches are not gated, and that ci.yml has pull_request and merge_group triggers and an unconditional check job running porting:check and divergence:check. That matches the string. The tests cite only FR-8, with no FR-<n>.<k> or AD-<n>.<k> token (evidence b). The XT-conformance-24 edit swaps one weakened check for an exact match on the new install step. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changes are to conformance tooling (tools/ownership, conformance tests, docs, the ownership workflow, and the 8.8 manifest). The signed PHASE-0-EXIT.md is a temporary-directory test fixture, not a stand-in for another Component's behaviour. No hard-coded return or partial implementation of another Component was found. |
| F-9: Every `@asyncRoot` tag is true | n/a | No @​asyncRoot tag is added (evidence d). The new async phaseGateViolations is CI tooling and is async only for a dynamic import(), not IO behind an async-root Driver contract. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"7e9dfde1882226239fa1554e4f9f33e5d2be3393","base":"d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-20T21:34:02.867Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and no Ported Test is added or changed, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is added or changed, so there are no Upstream expected values to compare.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, and no adapted marker is added (evidence a).","findings":[]},{"id":"F-4","result":"n/a","note":"The diff changes no Expectations line and sets nothing to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an adapted:DIV marker and no Expectations adapted field changes (evidence a).","findings":[]},{"id":"F-6","result":"n/a","note":"The Story has no Oracle fixtures. Evidence (c) lists no error fixture in the base or in the change.","findings":[]},{"id":"F-7","result":"pass","note":"XT-conformance-168: the body tests each unmet condition of the gate against phaseGateViolations, and checks the open gate, the throwing checkPorting case, every exit-signature case, the all-missing case and the CLI exit code 1 with phase gate: lines. That covers its consequence. XT-conformance-169: the body checks that the open gate passes for epics 9, 14 and 71 and for a sequence of PRs, and that the gate reads the base, not a head that deletes the inputs (no contents fetches). It checks that the Phase 0 Story and the planning/, bot/ and feature/ branches are not gated, and that ci.yml has pull_request and merge_group triggers and an unconditional check job running porting:check and divergence:check. That matches the string. The tests cite only FR-8, with no FR-<n>.<k> or AD-<n>.<k> token (evidence b). The XT-conformance-24 edit swaps one weakened check for an exact match on the new install step.","findings":[]},{"id":"F-8","result":"pass","note":"All changes are to conformance tooling (tools/ownership, conformance tests, docs, the ownership workflow, and the 8.8 manifest). The signed PHASE-0-EXIT.md is a temporary-directory test fixture, not a stand-in for another Component's behaviour. No hard-coded return or partial implementation of another Component was found.","findings":[]},{"id":"F-9","result":"n/a","note":"No @asyncRoot tag is added (evidence d). The new async phaseGateViolations is CI tooling and is async only for a dynamic import(), not IO behind an async-root Driver contract.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}]}
```

### Reviewer 1: reject at tree 7e9dfde1882226239fa1554e4f9f33e5d2be3393

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f`, on 2026-10-20T21:34:33.405Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff changes none. |
| F-2: No expected value is weakened | n/a | No Ported Test expected values are added or changed. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are removed or changed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The diff adds no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on or changed Oracle fixture with an error output. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared the new consequence strings with their bodies. XT-conformance-169 does not fully establish its claim that the required check runs on every PR and in the queue; the consequences of other modified Xaravel Tests are not fully supplied. |
| F-8: No stub, fake or partial implementation of another Component | pass | The production changes implement conformance ownership gating. Shared fixtures and the test GitHub server do not implement another Component's production behavior. |
| F-9: Every `@asyncRoot` tag is true | n/a | No async-root Driver implementation or @​asyncRoot tag is changed; the new async gate is conformance tooling. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file is changed. |

Findings:

- **F-7** `conformance/tests/xaravel/phase-gate.test.ts`: XT-conformance-169 checks event presence and selected job/step conditions, but does not reject event filters such as paths or paths-ignore that could prevent execution on some PRs. Assert the relevant event configuration permits every claimed PR and queue event, or narrow the consequence.
- **F-7** `conformance/tests/xaravel/ownership.test.ts`: Supply the complete consequence and relevant body of modified XT-conformance-24 so its changed assertions can be checked against its declared consequence.
- **F-7** `conformance/tests/xaravel/ownership-lines.test.ts`: Supply the consequences and relevant bodies of Xaravel Tests affected by the changed shared fixture setup so their declared consequences can be verified.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"7e9dfde1882226239fa1554e4f9f33e5d2be3393","base":"d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-20T21:34:33.405Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff changes none.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test expected values are added or changed.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are removed or changed.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The diff adds no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on or changed Oracle fixture with an error output.","findings":[]},{"id":"F-7","result":"fail","note":"Compared the new consequence strings with their bodies. XT-conformance-169 does not fully establish its claim that the required check runs on every PR and in the queue; the consequences of other modified Xaravel Tests are not fully supplied.","findings":[{"path":"conformance/tests/xaravel/phase-gate.test.ts","detail":"XT-conformance-169 checks event presence and selected job/step conditions, but does not reject event filters such as paths or paths-ignore that could prevent execution on some PRs. Assert the relevant event configuration permits every claimed PR and queue event, or narrow the consequence."},{"path":"conformance/tests/xaravel/ownership.test.ts","detail":"Supply the complete consequence and relevant body of modified XT-conformance-24 so its changed assertions can be checked against its declared consequence."},{"path":"conformance/tests/xaravel/ownership-lines.test.ts","detail":"Supply the consequences and relevant bodies of Xaravel Tests affected by the changed shared fixture setup so their declared consequences can be verified."}]},{"id":"F-8","result":"pass","note":"The production changes implement conformance ownership gating. Shared fixtures and the test GitHub server do not implement another Component's production behavior.","findings":[]},{"id":"F-9","result":"n/a","note":"No async-root Driver implementation or @asyncRoot tag is changed; the new async gate is conformance tooling.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file is changed.","findings":[]}]}
```

### Reviewer 2: pass at tree 7e9dfde1882226239fa1554e4f9f33e5d2be3393

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f`, on 2026-10-20T21:34:33.405Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and no Ported Test is added or changed. The changed tests are all Xaravel Tests, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test is added or changed, so there is no Upstream expected value that could be weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, and no line adds an adapted:DIV marker, so there are no assertion counts to compare. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff changes no Expectations line, so there is no skip reason or precedence to judge. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a) shows no added adapted:DIV marker, and the diff has no Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows no error fixture, either in the base fixtures or in the changed ones, and no Oracle request is assigned. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-conformance-168 declares that a Phase 1+ Story fails ownership pr with one phase gate: line per unmet condition (PORTING.md passing checkPorting, DIV-1..12, the pilot report, a Maintainer-signed PHASE-0-EXIT.md). The body checks each condition through phaseGateViolations: PORTING.md missing, failing or throwing; a DIV record missing; the pilot report missing or blank; the exit file missing, plus each signature field problem. It checks the all-missing case gives one line per condition, the CLI exits 1 with exact stderr, other violations are reported alongside, and the workflow install step comes right before the check. XT-conformance-169 declares that an open gate never gates later Phase 1 PRs whatever the head holds, that Phase 0 Stories and non-Story branches are never gated, and that the required check job runs porting:check and divergence:check on PRs and in the merge queue. The body covers epics 9, 14 and 71, a sequence of PRs, a head deleting the gate inputs with no /contents/ fetch, Phase 0 Stories, planning/*, bot/* and feature/* branches on a closed base, and the ci.yml pull_request and merge_group triggers with unconditional steps. Both cite only FR-8, which is the requirement tested (evidence (b): no FR-n.k or AD-n.k tokens). The XT-conformance-24 edit adds an exact assertion on the new install step and excludes only that step from the no-install loop, so it is not a weakening. |
| F-8: No stub, fake or partial implementation of another Component | pass | The changes are conformance tooling: tools/ownership, the ownership workflow, conformance Xaravel Tests and their fixtures, and ops docs. phase-gate.ts reuses the existing parseFrontmatter and checkPorting without stubbing them. The exit-file fixture is written only into temp test roots, and no hard-coded return or partial implementation of another Component's behaviour is added. |
| F-9: Every `@asyncRoot` tag is true | n/a | Evidence (d) shows no @​asyncRoot tag is added. phaseGateViolations is async only because of a dynamic import in CI tooling, not behind an async-root Driver contract, so the tag rule does not apply. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"7e9dfde1882226239fa1554e4f9f33e5d2be3393","base":"d1dac4b8e6576dd2e5db51fb2dde0fa3e0a9820f","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-20T21:34:33.405Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and no Ported Test is added or changed. The changed tests are all Xaravel Tests, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream expected value that could be weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, and no line adds an adapted:DIV marker, so there are no assertion counts to compare.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff changes no Expectations line, so there is no skip reason or precedence to judge.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a) shows no added adapted:DIV marker, and the diff has no Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows no error fixture, either in the base fixtures or in the changed ones, and no Oracle request is assigned.","findings":[]},{"id":"F-7","result":"pass","note":"XT-conformance-168 declares that a Phase 1+ Story fails ownership pr with one phase gate: line per unmet condition (PORTING.md passing checkPorting, DIV-1..12, the pilot report, a Maintainer-signed PHASE-0-EXIT.md). The body checks each condition through phaseGateViolations: PORTING.md missing, failing or throwing; a DIV record missing; the pilot report missing or blank; the exit file missing, plus each signature field problem. It checks the all-missing case gives one line per condition, the CLI exits 1 with exact stderr, other violations are reported alongside, and the workflow install step comes right before the check. XT-conformance-169 declares that an open gate never gates later Phase 1 PRs whatever the head holds, that Phase 0 Stories and non-Story branches are never gated, and that the required check job runs porting:check and divergence:check on PRs and in the merge queue. The body covers epics 9, 14 and 71, a sequence of PRs, a head deleting the gate inputs with no /contents/ fetch, Phase 0 Stories, planning/*, bot/* and feature/* branches on a closed base, and the ci.yml pull_request and merge_group triggers with unconditional steps. Both cite only FR-8, which is the requirement tested (evidence (b): no FR-n.k or AD-n.k tokens). The XT-conformance-24 edit adds an exact assertion on the new install step and excludes only that step from the no-install loop, so it is not a weakening.","findings":[]},{"id":"F-8","result":"pass","note":"The changes are conformance tooling: tools/ownership, the ownership workflow, conformance Xaravel Tests and their fixtures, and ops docs. phase-gate.ts reuses the existing parseFrontmatter and checkPorting without stubbing them. The exit-file fixture is written only into temp test roots, and no hard-coded return or partial implementation of another Component's behaviour is added.","findings":[]},{"id":"F-9","result":"n/a","note":"Evidence (d) shows no @asyncRoot tag is added. phaseGateViolations is async only because of a dynamic import in CI tooling, not behind an async-root Driver contract, so the tag rule does not apply.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}]}
```

## Auto Run Result

Status: blocked
Blocking condition: review repair loop exceeded 5 iterations (non-convergence). The Fidelity Review's codex reviewer passed once (iteration 3, tree `a3cfaa9…`), then rejected again with evidence requests the tool's prompt cannot meet, plus one real gap, now patched (event filters on `ci.yml`). Raised as `conformance/escalations/ESC-8.8-1.md` (open-question) for a Maintainer ruling. The implementation and every other check are complete; the summary below describes them.

**Summary.** The required `ownership` check now enforces FR-8's Phase 1 gate. For a `story/<id>` PR whose base manifest's `epic` is above 8, `ownership pr` re-reads the manifest on the base checkout (`main`). It then fails with one `phase gate:` line per unmet condition unless that checkout holds all four inputs:
- `PORTING.md` passing `checkPorting`;
- `decisions/DIV-1.md`..`DIV-12.md`;
- a non-blank `docs/porting/pilot-report.md`;
- a Maintainer-signed `decisions/PHASE-0-EXIT.md` (`decision: approved`, `decided_by: Maintainer`, a real date, a body).

The gate holds no state and never reads the PR head. `checkPorting` is imported lazily. The `ownership` job installs the base lockfile (`--ignore-scripts`) before the check.

**Files changed.**
- `tools/ownership/phase-gate.ts`: the gate, the signature check and the Phase 0 derivation from `epics.md`.
- `tools/ownership/ownership.ts`: `pr()` runs the gate, and the header documents the `phase gate:` kind.
- `.github/workflows/ownership.yml`: the install step.
- `conformance/tests/xaravel/phase-gate.test.ts`: XT-conformance-168 (AC1) and XT-conformance-169 (AC2).
- `conformance/tests/xaravel/phase-gate-fixtures.ts`: the shared gate-open fixture.
- `conformance/tests/xaravel/ownership.test.ts`: the shared fixture writes the gate inputs, and the workflow assertion expects 5 steps.
- `conformance/tests/xaravel/ownership-lines.test.ts`: the shared fixture writes the gate inputs.
- `docs/ops/ci.md` and `docs/ops/porting.md`: the gate, and the form the Maintainer signs.

**Review.**
- Pass 1 had 29 findings. 7 were patched: the fail-closed test, the truncation count, the CI guarantee and the narrowed XT-169 title, the `feature/x` run, and the Protected wording. 2 were deferred: the Maintainer must sign `PHASE-0-EXIT.md`, and branches outside `story/`, `planning/` and `bot/` are ungated, which predates this Story. The other 20 were rejected, each with its reason in the triage log.
- The Fidelity re-checks found nothing wrong in the code. Reviewer 1 (codex) twice rejected the diff's edits to other Stories' test bodies, because it had no evidence for their consequences. The design changed so that the diff no longer edits those bodies: `evaluatePr`'s result is unchanged, and the shared fixtures write the gate inputs. Both reviewers then passed on tree `a3cfaa9…`.
- `followup_review_recommended: true`. Pass 1 patched 3 medium entries (and 2 low). The named unverified risk: the install step and the gate run only under `pull_request_target` on GitHub, and no test exercises them live. The first Epic 9 PR is their first real run.

**Verification.**
- `harness --xaravel`: 286/286.
- `typecheck`, `lint`, `workflows:check`, `ownership:check` and `porting:check` all pass.
- `story:check 8.8` passes every clause except `full-run`, which cannot run without `GH_TOKEN` locally. `approvals` shows 2 pass verdicts.

**Residual risks.**
- Phase 1 is closed until the Maintainer merges a signed `decisions/PHASE-0-EXIT.md`. The orchestrator's checkpoint `go` writes only `MAINT-checkpoint-epic-8.md`. Until the exit file exists, the Story 9.1 PR fails `ownership` with `phase gate:` lines.
- The signature check verifies the file's form, not who wrote it (lesson, epic 1).
