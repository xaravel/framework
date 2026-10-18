---
title: 'Retro 3 item 2: run oracle:extract --check in the Oracle workflow'
type: 'chore'
created: '2026-10-18'
status: 'done'
baseline_revision: '130a65a803ef0b8b46738b107e2b8439148d4e96'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      In the nightly determinism job a failing drift check (API surface or, now, requests) stops the job before the fixture determinism pass, hiding that night's determinism signal.
    evidence: |-
      Steps run in order with no if: on oracle:fixtures --determinism; the API-surface check already had this effect before this change. Drift on main needs a red build PR merged, since build is not a required check.
    location: >-
      .github/workflows/oracle.yml determinism job
    severity: low
  - summary: >-
      oracle.yml build (and so the new requests drift check) is not a required check, so a red build can still merge.
    evidence: |-
      .github/rulesets/main.json requires only audit, ownership and protected-paths. Same gap as retro finding S2, Maintainer action item epic-3-retro-item-8-fixture-verify-blocks-merge.
    location: >-
      .github/rulesets/main.json
    severity: medium
---

<intent-contract>

## Intent

**Problem:** No workflow runs `bun run oracle:extract --check`, so a change to the extractor (`tools/oracle/extract.ts`, `tools/oracle/extract/**` including `tokens.php`), to the lister it runs (`tools/inventory/lister.php`) or a hand edit to `conformance/oracle/requests/` merges without detection (Epic 3 retrospective, finding S3; action item `epic-3-retro-item-2-extract-check-in-ci`). The scans and the API surface already have this kind of drift check.

**Approach:** In `.github/workflows/oracle.yml`, add a `bun run oracle:extract --check` step to the `build` job after the image is built, so it runs in that image (`xaravel-oracle:<oracle tag>`, the extractor's default). Keep `determinism` running exactly `build`'s steps plus its fixture pass, as it does today, so the nightly catches drift too. Widen the `pull_request` path filter with `tools/inventory/**`, the one extractor input it does not cover yet. Keep the workflow header and `docs/ops/oracle.md` accurate, and pin the new step in the existing workflow-shape test XT-conformance-43.

## Boundaries & Constraints

**Always:** The new step gets no token, secret or write scope, and no `continue-on-error`. `push` paths stay unchanged (inventory code does not change the published image). Existing assertions stay; XT-conformance-43 changes only to expect the new step and path.

**Never:** Change `tools/oracle/extract.ts`, any family module, `conformance/oracle/requests/**`, `oracle:api-surface`, or the `oracle`/`story` jobs. Do not touch `conformance/protected-paths`, `tools/protected-paths/` or `.github/workflows/protected-paths.yml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No drift | PR touching an Oracle input, committed requests current | `build` passes; the step prints `Oracle requests check OK: …` | none |
| Drift | PR changes an extractor input or hand-edits a request file | the step exits 1 with `oracle requests drift: <file> …`, failing `build` | fail closed |
| Inventory-only PR | PR changes only `tools/inventory/**` | `build` runs (path filter matches) | none |

</intent-contract>

## Code Map

- `.github/workflows/oracle.yml:1-50` -- header comment; the `build` paragraph lists its checks; `determinism` paragraph says it "checks the API surface as build does".
- `.github/workflows/oracle.yml:52-66` -- `on.pull_request.paths`; add `tools/inventory/**` (after `tools/component-map/**`, before `tools/oracle/**` keeps the list readable; order is pinned by the test).
- `.github/workflows/oracle.yml` `build` job (last step `Check the API surface against the image`) -- append `Check the Oracle requests against the image` running `bun run oracle:extract --check`.
- `.github/workflows/oracle.yml` `determinism` job -- the same step after its API-surface check, before `oracle:fixtures --determinism`.
- `tools/oracle/extract.ts:162-178,233-275` -- inputs (snapshot, lister, component map, schema) and `--check` semantics; read-only. Default image is `oracleImage(root)` = the tag `oracle:build` just built.
- `conformance/tests/xaravel/oracle.test.ts:665-725` -- XT-conformance-43: `pull_request` paths expectation (line 679), `runs(build)` list (line 690), `determinism == [...runs(build), fixtures]` (line 711), `build.steps.at(-2)!.env` token check (line 754) which must still point at the build step.
- `docs/ops/oracle.md:64,67` -- Publishing bullets for `build` and `determinism`.

## Tasks & Acceptance

**Execution:**
- `.github/workflows/oracle.yml` -- add the `pull_request` path, the step in `build` and `determinism`, and update the header comment -- closes S3.
- `conformance/tests/xaravel/oracle.test.ts` -- in XT-conformance-43 expect `tools/inventory/**` in `pull_request` paths and `bun run oracle:extract --check` as the last `build` run; make the token-env assertions find the build step by its run text rather than by position, and assert the new step has no `env` -- pins the gate.
- `docs/ops/oracle.md` -- `build` bullet: lists the extract check and the `tools/inventory/**`, `conformance/api-surface/**`, component-map paths; `determinism` bullet: checks the requests too.

**Acceptance Criteria:**
- Given the updated workflow, when XT-conformance-43 runs, then it passes and asserts the `build` job ends with `bun run oracle:extract --check`.
- Given the committed requests, when `bun run oracle:extract --check --local /tmp/xaravel-inv/framework` runs locally, then it reports `Oracle requests check OK`, so the new CI step passes on this PR.

## Spec Change Log

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 17 findings — high 0, medium 2, low 8, false 4, maybe-false 0 (3 rejected as spec edits or out of scope)
- findings:
  - (blind) `[low]` `[patch]` Header and docs say `oracle` "does the same" as `build`, which now lists two drift checks the `oracle` job does not run — patched: both now say it syncs, checks and builds as `build` does but runs neither drift check.
  - (blind) `[low]` `[patch]` The docs `oracle` bullet says "the same paths", now wrong against the widened `build` list — patched: names the exception (API-surface, component-map, scaffold, inventory) and dropped the stopgap sentence in the `build` bullet.
  - (blind) `[low]` `[patch]` The Requests section has no CI note, unlike the API surface's "The drift check in CI" — patched: added the matching subsection.
  - (blind) `[low]` `[patch]` `determinism`'s copy of the new step is not pinned env-free — patched: the no-env, after-the-build-step loop covers both `build` and `determinism`.
  - (blind) `[low]` `[patch]` `find(...)!` turns a missing step into a TypeError, and the `at(-1)` check duplicates the `runs(build)` equality — patched: `expect(step).toBeDefined()` before each read; `at(-1)` removed.
  - (blind) `[low]` `[reject]` Verification uses `--local` mode, not the image mode CI runs — XT-conformance-70 asserts image mode gives the same bytes; this PR's own `oracle.yml#build` run (triggered by the workflow change) is the image-mode run.
  - (blind) `[false]` `[reject]` The Drift matrix row is never tested — `oracle-extract.test.ts:950-970` asserts exit 1 and the drift lines for a changed, missing and stray file.
  - (blind) `[low]` `[reject]` Code Map line numbers are stale — the fix is a spec edit.
  - (blind) `[false]` `[reject]` Extra build time was not weighed — `build` runs only on PRs touching Oracle inputs; the extractor run takes about 8 s locally next to an image build of minutes; no named harm.
  - (edge) `[medium]` `[patch]` `readMap` reads `tools/scaffold/packages.jsonl` through `tools/scaffold/table.ts` (`tools/component-map/component-map.ts:27,31`); a scaffold-only PR changes extracted components without running `build` — patched: both paths added to `pull_request` paths, XT-conformance-43, header and docs (the intent-contract's "the one extractor input it does not cover yet" undercounted; the invocation intent asks that the filter cover the extractor's inputs).
  - (edge) `[low]` `[defer]` A nightly drift failure stops `determinism` before the fixture pass — pre-existing with the API-surface check; deferred.
  - (edge) `[low]` `[patch]` TypeError instead of an assertion on a missing step — duplicate of the blind finding; same patch.
  - (edge) `[medium]` `[patch]` Claim "the one extractor input it does not cover yet" is false (scaffold paths) — same root as the scaffold finding; same patch.
  - (edge) `[low]` `[patch]` Claim that the header/docs stay accurate fails on "`oracle` does the same" — duplicate of the blind finding; same patch.
  - (verification-gap) no gaps reported (0 findings).
  - (intent) `[false]` `[reject]` CI behaviour on the runner is inferred, not observed — this PR's `build` run observes it before merge; the orchestrator waits for it.
  - (intent) `[medium]` `[defer]` `build` is not a required check, so "caught" does not mean "blocked" — pre-existing, the Maintainer's action item `epic-3-retro-item-8-fixture-verify-blocks-merge` (finding S2); deferred.
  - (intent) `[false]` `[reject]` Scope beyond the literal intent (`determinism`, docs, test rewrite) — no conflict with the intent; `determinism` is forced by the existing `[...runs(build), fixtures]` invariant.

## Design Notes

The step goes after `oracle:build` because the extractor's default image mode needs the locally built `xaravel-oracle:<tag>`; Docker is present on the runner, PHP is not.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/oracle.test.ts` -- expected: all pass.
- `bun run oracle:extract --check --local /tmp/xaravel-inv/framework` -- expected: `Oracle requests check OK`.
- `bun test` -- expected: all pass.
- `bun run typecheck && bun run lint && bun run workflows:check` -- expected: clean.

## Auto Run Result

Status: done

**Summary:** `oracle.yml#build` (PRs) and `#determinism` (nightly) now run `bun run oracle:extract --check` in the image they just built, so extractor, lister, component-map or package-table changes and hand edits to `conformance/oracle/requests/` that drift fail the job. The `pull_request` filter gains `tools/inventory/**`, `tools/scaffold/packages.jsonl` and `tools/scaffold/table.ts`; `push` paths are unchanged. Closes retro finding S3.

**Files changed:**
- `.github/workflows/oracle.yml` -- new step in `build` and `determinism`, three `pull_request` paths, header comment.
- `conformance/tests/xaravel/oracle.test.ts` -- XT-conformance-43 pins the paths, the new step and its env-free placement after the build step in both jobs.
- `docs/ops/oracle.md` -- Publishing bullets corrected; Requests gains "The drift check in CI".

**Review:** 17 findings. Patched 2 medium (scaffold paths, one root) and 6 low (docs accuracy, CI note, test robustness). Deferred 2 (determinism masking, low; `build` not required, medium, Maintainer item 8). Rejected 7 with reasons in the triage log.

**Follow-up review recommended:** false (one medium root patched, a two-line path addition, re-verified).

**Verification:** `bun test conformance/tests/xaravel/oracle.test.ts` 3 pass; `bun test` 128 pass, 0 fail; `bun run typecheck`, `bun run lint` clean; `bun run workflows:check` OK; `bun run oracle:extract --check --local /tmp/xaravel-inv/framework` "1857 requests in 4 files are byte-identical".

**Residual risks:** image mode was not run locally (no Docker); this PR's `oracle.yml#build` run is the first image-mode run of the step.
