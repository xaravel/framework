---
title: 'Epic 16 retro item 4: settle XT-json-schema-3 flakiness'
type: bugfix
created: '2026-10-31'
status: in-review
baseline_revision: 376d85d1eadddcad03032d734f754404e3d462c0
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /Users/ea/repos/xaravel/AGENTS.md
  - /Users/ea/repos/xaravel/decisions/MAINT-2026-10-16-unattended-orchestrator.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** XT-json-schema-3 failed in one full harness during Epic 16's retrospective and passed on reruns. Its child processes may exceed their limits under concurrent typecheck and lint, but the original failure output was lost.

**Approach:** Execute epic-16-retro-item-4-xt-json-schema-3-flaky from sprint status and finding L1 of the Epic 16 retrospective: retain three loaded full harness runs, then raise a flaky Escalation if results are inconsistent, otherwise bound the child commands, running each check once and in-process where an exported function exists.

## Boundaries & Constraints

**Always:** Preserve every assertion and its meaning. Keep code changes in packages/json-schema and this item's implementation records. Run three full harnesses sequentially, each alongside typecheck and lint; retain output under /Users/ea/.xaravel-orchestrator/tmp/retro16-loaded. A sandbox timeout must be reproduced outside the sandbox before it is classified. On inconsistent results stop work on the Test ID and raise an Escalation on story/16.2; do not quarantine or change Expectations without a ruling. The action item's action, owner and epic stay unchanged.

**Never:** Weaken assertions, increase limits to hide failure, edit Protected Paths or another package, stub a component, change Expectations or decide a contract/protected-path Escalation. No new dependency.

</intent-contract>

## Code Map

- `packages/json-schema/tests/xaravel/epic-close.test.ts`: XT-json-schema-3. `bun` uses spawnSync with a 120-second timeout; the test calls async-surface --check json-schema and api-surface:gate json-schema; its total timeout is 300 seconds.
- `tools/async-surface/async-surface.ts`: read-only exported main, surfaceOf, render, diff, packageDeclarations and thenableTypes can support an in-process check.
- `tools/api-surface/api-surface.ts`: read-only exported diffComponents, unexplained and main; inspect these to preserve the gate's exact result without duplicate compilation.
- `_bmad-output/implementation-artifacts/epic-16-retro-2026-10-31.md`: finding L1 and item 4 are the authoritative requested reproduction and routing.
- `stories/16.2.md`: XT-json-schema-3 is owned by Story 16.2. Existing ESC-16.2-1 concerns another ID; select the next available number if needed.
- `/Users/ea/.xaravel-orchestrator/tmp/retro16-loaded.py`: parent-started investigation driver, already running in the foreground tool session. Do not launch overlapping harnesses; the parent will provide its results. Each numbered run records harness/typecheck/lint output separately.

## Tasks & Acceptance

**Execution:**
- [x] Collect three full harness results with concurrent typecheck and lint, retain all output, and record exact revision and summaries here.
- [x] On inconsistent XT-json-schema-3 results raise the flaky Escalation on story/16.2 and record the pending ruling. Otherwise bound the child checks in packages/json-schema/tests/xaravel/epic-close.test.ts, using existing exported functions where possible while retaining every assertion.
- [ ] Run relevant checks and, for code changes, full harness, typecheck, lint and current item Fidelity Review before merge. The parent handles sprint status, branch routing and PRs.

**Acceptance Criteria:**
- Given the unchanged baseline, when three full harness runs execute each with concurrent typecheck and lint, then all results and failures are retained and XT-json-schema-3's consistency is recorded.
- Given inconsistent results, when reproduction finishes, then a flaky Escalation containing the evidence is raised and this Test ID's implementation stops pending a ruling.
- Given three consistent results, when the test executes, then each required gate runs once, in-process where supported, and every previous assertion still verifies the same repository property; the full harness has no differences and typecheck and lint pass.

## Spec Change Log

## Review Triage Log

### 2026-10-31 — Review pass 1
- verdicts: 12 findings — high 0, medium 5, low 0, false 7, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: in-process parsing loses an enforceable timeout — no reachable parser/resolver hang was identified; the requested action explicitly moves exported checks in-process. The expensive declaration compilation remains in the existing 120-second child and the overall test retains its 300-second limit.
  - `[medium]` `[patch]` Blind: changed implementation lacks a loaded run — run an additional full post-change harness alongside typecheck and lint, retaining logs in `tmp/retro16-item4-postchange-loaded/`.
  - `[false]` `[reject]` Blind: permanent diagnostic artifacts are missing — the requested retention concerns the three reproduction runs; their complete stdout/stderr is retained. The original diagnostic-loss mechanism predates this change and no permanent harness artifact was requested.
  - `[false]` `[reject]` Blind: structural signatures cannot catch future tool API drift — the signatures match current exports, including nullable specifier; no present incompatibility was shown. Runtime execution covers the imported functions and follows the existing composite-project import idiom.
  - `[false]` `[reject]` Alignment: API main is not invoked in-process — its exported main synchronously invokes an unbounded declaration compiler; retaining one bounded CLI child preserves the complete citation validation and enforces the requested child bound while eliminating duplicate compilation.
  - `[false]` `[reject]` Alignment: async CLI argument and exit handling no longer exercised — the Test ID's consequence is current async-surface data, not CLI parsing; existing exported surface/error/drift functions preserve that property. This action explicitly requests in-process exported checks.
  - `[false]` `[reject]` Alignment: no command-count or timeout assertion — the implementation has one literal API child call and reuses its fresh declarations; the command-count property is directly inspectable, and no timeout assertion was requested.
  - `[false]` `[reject]` Alignment: Fidelity pending — the diff was an in-review checkpoint, not a claim of done; current Fidelity remains a required merge gate.
  - `[medium]` `[patch]` Fidelity reviewer 1 F-2: async CLI and resolver source absent — section D Missing evidence route: fix the prompt tool on `planning/retro-16-evidence-dynamic-imports`, preserving checklist checks, then review the changed tree.
  - `[medium]` `[patch]` Fidelity reviewer 1 F-3: absent CLI prevents assertion-preservation comparison — same authorized evidence fix; existing source contains the needed errors and drift checks.
  - `[medium]` `[patch]` Fidelity reviewer 2 F-2: dynamically imported async and resolver tools absent — same evidence fix, with regression coverage for nested resolvable imports.
  - `[medium]` `[patch]` Fidelity reviewer 2 F-7: tool implementations absent for AD-6.13 — same evidence fix, then current item review required.


## Verification

- Three sequential `bun run harness` executions, each with concurrent `bun run typecheck` and `bun run lint`; retained logs and summaries.
- For changed code: `bun run harness`, `bun run typecheck`, `bun run lint` and `bun run fidelity:review status --item epic-16-retro-item-4-xt-json-schema-3-flaky --spec _bmad-output/implementation-artifacts/spec-epic-16-retro-item-4-xt-json-schema-3-flaky.md` (current).

## Loaded reproduction results

At unchanged baseline `376d85d1eadddcad03032d734f754404e3d462c0`, three sequential full harness runs outside the sandbox, each with concurrent typecheck and lint, all exited 0. Every harness reported `XARAVEL tests=546 passed=541 failed=0 skipped=5` and `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`. All six accompanying typecheck/lint commands exited 0. XT-json-schema-3 therefore passed consistently; no flaky Escalation is raised.

Authoritative retained logs: `/Users/ea/.xaravel-orchestrator/tmp/retro16-loaded-elevated/{1,2,3}-{harness,typecheck,lint}.log`. Earlier sandbox and briefly overlapping investigation attempts are excluded from the three-run series; the sandbox attempt passed XT-json-schema-3 but failed unrelated child commands, which the clean elevated series did not reproduce.

The test now runs the complete API surface CLI gate once with the existing 120-second child limit, preserving citation validation and both gate assertions. It reuses that gate's freshly emitted declarations for the in-process async surface check through the existing exported generator, qualified-name resolver, thenable list and byte-level drift check. Generator errors still fail the check; no assertion or limit is weakened.

## Implementation verification

- `bun run harness --xaravel --id XT-json-schema-3`: exit 0, `XARAVEL tests=1 passed=1 failed=0 skipped=0`, `SUMMARY variants=0 run=0 not-run=0 checked=0 differ=0`.
- `bun run typecheck`: exit 0.
- `bun run lint`: exit 0, `lint disables: ok (1065 files)`.
- `git diff --check`: exit 0.
- Final `bun run harness`: exit 0, `XARAVEL tests=546 passed=541 failed=0 skipped=5`; `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`. Full output retained in orchestrator state `tmp/retro16-item4-final-harness.log`.
- Current item Fidelity Review remains pending before merge.

## Fidelity Review

### Reviewer 1: reject at tree 26e7e5574a343a9b5accb4b2c74b26b821b7eef6

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `codex` loop, against base `376d85d1eadddcad03032d734f754404e3d462c0`, on 2026-10-31T23:52:51.322Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed; only an Xaravel Test is touched. |
| F-2: No expected value is weakened | fail | Every assertion is kept with the same expected value, but the 'async-surface.ts --check json-schema' child run is replaced by an in-process reimplementation of the check. Its source is not in the prompt, so I cannot confirm it is exactly as strict as the CLI. |
| F-3: No assertion is removed without a DIV clause | fail | Assertion counts are unchanged (gate exit and message moved earlier; async check kept). The in-process async check cannot be confirmed to cover everything the removed CLI '--check' did, because the tool source is missing. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or changed. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted marker or DIV clause is added. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixture is involved. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The consequence string is unchanged and every clause it lists is still checked in the body. The cited AD-2.1, AD-2.2, AD-2.3, AD-2.7 and AD-6.13 are still the bullets the test verifies. |
| F-8: No stub, fake or partial implementation of another Component | pass | The change is confined to the json-schema package test and adds no stub or fake of another Component. |
| F-9: Every `@asyncRoot` tag is true | n/a | No packages/*/src file is touched and no @​asyncRoot tag is added. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

- **F-2** `tools/async-surface/async-surface.ts`: The '--check' code path is not shown. Cannot confirm that 'surfaceOf', 'diff', 'render' and the 'registeredFqcn' resolver, called in-process, reproduce what the CLI check enforces (missing tags, errors, drift). Supply the file and 'tools/lint-rules/thenables.ts' so the equivalence can be checked. _(missing evidence)_
- **F-3** `tools/async-surface/async-surface.ts`: The CLI '--check' main is not shown, so I cannot confirm that no check it ran (for example a separate error class or a thenable line check) is dropped from the in-process version. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"26e7e5574a343a9b5accb4b2c74b26b821b7eef6","base":"376d85d1eadddcad03032d734f754404e3d462c0","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"codex","fallback":null,"date":"2026-10-31T23:52:51.322Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed; only an Xaravel Test is touched.","findings":[]},{"id":"F-2","result":"fail","note":"Every assertion is kept with the same expected value, but the `async-surface.ts --check json-schema` child run is replaced by an in-process reimplementation of the check. Its source is not in the prompt, so I cannot confirm it is exactly as strict as the CLI.","findings":[{"path":"tools/async-surface/async-surface.ts","detail":"The `--check` code path is not shown. Cannot confirm that `surfaceOf`, `diff`, `render` and the `registeredFqcn` resolver, called in-process, reproduce what the CLI check enforces (missing tags, errors, drift). Supply the file and `tools/lint-rules/thenables.ts` so the equivalence can be checked.","kind":"missing-evidence"}]},{"id":"F-3","result":"fail","note":"Assertion counts are unchanged (gate exit and message moved earlier; async check kept). The in-process async check cannot be confirmed to cover everything the removed CLI `--check` did, because the tool source is missing.","findings":[{"path":"tools/async-surface/async-surface.ts","detail":"The CLI `--check` main is not shown, so I cannot confirm that no check it ran (for example a separate error class or a thenable line check) is dropped from the in-process version.","kind":"missing-evidence"}]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or changed.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted marker or DIV clause is added.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixture is involved.","findings":[]},{"id":"F-7","result":"pass","note":"The consequence string is unchanged and every clause it lists is still checked in the body. The cited AD-2.1, AD-2.2, AD-2.3, AD-2.7 and AD-6.13 are still the bullets the test verifies.","findings":[]},{"id":"F-8","result":"pass","note":"The change is confined to the json-schema package test and adds no stub or fake of another Component.","findings":[]},{"id":"F-9","result":"n/a","note":"No packages/*/src file is touched and no @asyncRoot tag is added.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 26e7e5574a343a9b5accb4b2c74b26b821b7eef6

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `376d85d1eadddcad03032d734f754404e3d462c0`, on 2026-10-31T23:52:51.322Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change modifies one Xaravel Test and no Ported Test; no Upstream assertion mapping applies. |
| F-2: No expected value is weakened | fail | The gate assertions retain their expected values, but equivalence of the replaced async-surface CLI check cannot be confirmed from the supplied sources. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test changes, so there are no Upstream assertions whose removal requires a DIV clause. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or changed to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted assertion marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The action item relies on no Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The supplied test body checks the declared documentation, dependency, license and gate conditions, but the new async-surface verification depends on omitted implementations. |
| F-8: No stub, fake or partial implementation of another Component | pass | The sole changed file is within the assigned json-schema component's tests; it reuses repository tools and introduces no implementation of another component. |
| F-9: Every `@asyncRoot` tag is true | n/a | No framework source file or @​asyncRoot tag changes; the async test callback is outside the framework API check. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-2** `packages/json-schema/tests/xaravel/epic-close.test.ts`: Supply tools/async-surface/async-surface.ts and tools/lint-rules/thenables.ts, including the former CLI check path, so the new in-process check can be compared with the removed command for preserved validation and failure conditions. _(missing evidence)_
- **F-7** `packages/json-schema/tests/xaravel/epic-close.test.ts`: Provide the implementations of packageDeclarations, surfaceOf, thenableTypes, render, diff and registeredFqcn from the dynamically imported tools. Their asserted signatures alone do not establish that the test verifies current emitted async surface and qualified thenable resolution as AD-6.13 requires. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"26e7e5574a343a9b5accb4b2c74b26b821b7eef6","base":"376d85d1eadddcad03032d734f754404e3d462c0","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-10-31T23:52:51.322Z","items":[{"id":"F-1","result":"n/a","note":"The change modifies one Xaravel Test and no Ported Test; no Upstream assertion mapping applies.","findings":[]},{"id":"F-2","result":"fail","note":"The gate assertions retain their expected values, but equivalence of the replaced async-surface CLI check cannot be confirmed from the supplied sources.","findings":[{"path":"packages/json-schema/tests/xaravel/epic-close.test.ts","detail":"Supply tools/async-surface/async-surface.ts and tools/lint-rules/thenables.ts, including the former CLI check path, so the new in-process check can be compared with the removed command for preserved validation and failure conditions.","kind":"missing-evidence"}]},{"id":"F-3","result":"n/a","note":"No Ported Test changes, so there are no Upstream assertions whose removal requires a DIV clause.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or changed to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted assertion marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The action item relies on no Oracle error fixture.","findings":[]},{"id":"F-7","result":"fail","note":"The supplied test body checks the declared documentation, dependency, license and gate conditions, but the new async-surface verification depends on omitted implementations.","findings":[{"path":"packages/json-schema/tests/xaravel/epic-close.test.ts","detail":"Provide the implementations of packageDeclarations, surfaceOf, thenableTypes, render, diff and registeredFqcn from the dynamically imported tools. Their asserted signatures alone do not establish that the test verifies current emitted async surface and qualified thenable resolution as AD-6.13 requires.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"The sole changed file is within the assigned json-schema component's tests; it reuses repository tools and introduces no implementation of another component.","findings":[]},{"id":"F-9","result":"n/a","note":"No framework source file or @asyncRoot tag changes; the async test callback is outside the framework API check.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[]}
```

## Post-change loaded verification

The additional full harness with concurrent typecheck and lint passed: all three commands exited 0; `XARAVEL tests=546 passed=541 failed=0 skipped=5`, `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`. Complete logs are retained in orchestrator state `tmp/retro16-item4-postchange-loaded/{harness,typecheck,lint}.log`. This resolves the review request for direct loaded verification of the changed implementation.

Evidence-only followup PR #605 targets the first Fidelity reject tree `26e7e5574a343a9b5accb4b2c74b26b821b7eef6`; it includes nested dynamic tool imports in prompt evidence without changing checks or verdict rules, under the 2026-10-22 Missing evidence amendment. The item must rerun Fidelity after that PR merges.
