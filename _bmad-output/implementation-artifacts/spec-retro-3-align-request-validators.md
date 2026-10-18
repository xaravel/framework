---
title: 'Retro 3 item 6: align the Oracle request validators'
type: 'bugfix'
created: '2026-10-18'
status: 'done'
baseline_revision: '4143304d436447db069d33811cbe6d3fadcb7f17'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      The Component-name regex still has two more copies, tools/ownership/ownership.ts:120 (COMPONENT, which gates Story manifests and so the story job's fixture paths) and tools/inventory/inventory.ts:500, and no test ties them to COMPONENT_NAME.
    evidence: |-
      Loosening ownership.ts:120 to digit-first would let a Story manifest name 1abc; oracle:story would sign conformance/fixtures/1abc/ and the commit step would refuse it, with no test failing. tools/ownership/ is a Protected Path outside this item; inventory.ts cannot import fixtures.ts (fixtures.ts imports inventory.ts). Needs an Infrastructure change exporting or sharing the constant plus an assertion.
    location: >-
      tools/ownership/ownership.ts:120, tools/inventory/inventory.ts:500
    severity: medium
  - summary: >-
      A request nested 512 or more levels deep passes validateRequest but makes evaluate.php's json_decode (depth 512) fail the whole run.
    evidence: |-
      evaluate.php:562 decodes with depth 512 and fail()s; validateRequest has no depth limit. Pre-existing and outside R7, which names lone surrogates; no extractor produces such nesting today.
    location: >-
      tools/oracle/request.ts validateRequest, tools/oracle/evaluate.php:562
    severity: low
---

<intent-contract>

## Intent

**Problem:** Epic 3 retrospective finding R7 (action item `epic-3-retro-item-6-align-request-validators`). (1) `validateRequest` in `tools/oracle/request.ts` accepts a string or key holding a lone UTF-16 surrogate (for example `"\ud800"`), but `tools/oracle/evaluate.php` decodes each line with `json_decode(..., JSON_THROW_ON_ERROR)`, which rejects it ("Single unpaired UTF-16 surrogate"), and `fail()`s the whole Oracle run. (2) `readCommittedRequests` in `tools/oracle/fixtures.ts` accepts Component names matching `^[a-z0-9][a-z0-9-]*$`, while the `story` job's commit step in `.github/workflows/oracle.yml` (and `tools/ownership/ownership.ts`, `tools/inventory/inventory.ts`) use `^[a-z][a-z0-9-]*$`, so a batch can sign fixtures for a Component name the commit step refuses.

**Approach:** Reject lone surrogates in `validateRequest`, after the schema check, so every entry point (extraction, committed batch files, Story request files) fails early with a `$.<path>` error. Export one `COMPONENT_NAME = /^[a-z][a-z0-9-]*$/` from `tools/oracle/fixtures.ts`, use it in `readCommittedRequests`, and make the workflow-shape test derive the commit-step pattern from it, so the two can no longer drift.

## Boundaries & Constraints

**Always:** Error messages name the JSON path and say why (PHP's `json_decode` rejects it). Paired surrogates (astral characters such as 😀) stay valid. Existing assertions stay; tests only gain cases or derive an expected literal from the shared constant.

**Never:** Change `evaluate.php`, `conformance/oracle/schema.json`, the committed request files, the hash format, or `conformance/protected-paths`, `tools/protected-paths/`, `tools/ownership/`. Do not change the commit-step regex text (it is already the target form).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Astral char | `template: "ü😀"` | valid, `[]` | none |
| Lone high surrogate in a string | `exprs: ["'\ud800'"]` | `$.input.exprs[0]: holds a lone UTF-16 surrogate, which PHP's json_decode rejects` | validateRequest error; parseRequests throws `<file>:<n>: …` |
| Lone low surrogate in a key | `data: {"\udc00": 1}` | error at `$.input.data key "\udc00"` | as above |
| Reversed pair | `"\udc00\ud800"` | error | as above |
| Component file `1abc.jsonl` | committed requests dir | throws `… is not a Component's request file` | readCommittedRequests throws |

</intent-contract>

## Code Map

- `tools/oracle/request.ts` -- header comment (lines 8-13) says lone surrogates are escaped as `\uXXXX`; `validateRequest` (~line 349) runs `schemaErrors` then the hash check; `writeJson` uses `JSON.stringify` for strings and keys. Add a walker for strings and keys after the schema errors.
- `tools/oracle/evaluate.php:562` -- `json_decode($line, true, 512, JSON_THROW_ON_ERROR)` then `fail()`: read-only evidence.
- `tools/oracle/fixtures.ts:229` -- `readCommittedRequests` Component check, `GENERATORS` export at line 55.
- `.github/workflows/oracle.yml:351` -- commit step regex `^[a-z][a-z0-9-]*/[0-9a-f]{64}\.json$`: read-only.
- `tools/ownership/ownership.ts:120`, `tools/inventory/inventory.ts:500` -- the same `^[a-z][a-z0-9-]*$`, confirming the target form.
- `tools/oracle/extract.ts:210`, `tools/oracle/story-requests.ts:111` -- other callers of `validateRequest`; they get the check for free.
- `conformance/tests/xaravel/oracle-extract.test.ts:86-170` -- XT-conformance-68 schema/hash/canonical test; add surrogate cases here.
- `conformance/tests/xaravel/oracle-story.test.ts:482` -- XT-conformance-77 asserts the commit regex literal; derive it from `COMPONENT_NAME`.
- `conformance/tests/xaravel/oracle-fixtures.test.ts:262` -- `readCommittedRequests` on the fixture root; add a bad-name case.

## Tasks & Acceptance

**Execution:**
- `tools/oracle/request.ts` -- add lone-surrogate errors to `validateRequest` for every string and object key in `id`, `kind` and `input`; update the header comment -- PHP parity, fail early.
- `tools/oracle/fixtures.ts` -- export `COMPONENT_NAME` with a doc comment naming the commit step and ownership check; use it at line 229 -- one regex.
- `conformance/tests/xaravel/oracle-extract.test.ts` -- cover the matrix rows for surrogates via `validateRequest` and `parseRequests`.
- `conformance/tests/xaravel/oracle-story.test.ts` -- build the expected commit pattern from `COMPONENT_NAME.source`.
- `conformance/tests/xaravel/oracle-fixtures.test.ts` -- a `1abc.jsonl` (digit-first) request file makes `readCommittedRequests` throw.

**Acceptance Criteria:**
- Given a request whose input holds a lone surrogate, when `bun run oracle:extract`, a batch or a Story request read validates it, then it fails with a path-naming error before any PHP runs.
- Given the commit-step regex and `COMPONENT_NAME`, when the test suite runs, then a change to either without the other fails XT-conformance-77.

## Spec Change Log

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 14 findings — high 0, medium 1, low 9, false 2, maybe-false 0 (2 rejected as spec edits, not graded)
- findings:
  - `[low]` `[defer]` (blind) json_decode depth 512 is another rejection the TS validator misses — real but pre-existing and outside R7; deferred.
  - `[medium]` `[defer]` (blind) Component regex still copied in ownership.ts and inventory.ts, untested — pre-existing copies, ownership.ts is Protected; grouped with the verification-gap finding; deferred.
  - `[low]` `[reject]` (blind) AC1 not tested through extract/story/batch entry points — all three call `validateRequest` directly (extract.ts:210, story-requests.ts:111, parseRequests), which is tested exactly; extra end-to-end tests add complexity for a path unlikely to regress.
  - `[low]` `[patch]` (blind) `1abc.jsonl` cleanup not in finally — wrapped the assertion in try/finally.
  - `[low]` `[patch]` (blind) derived pattern assumes `^…$` and no flags — added assertions on `COMPONENT_NAME.flags` and its anchors.
  - `[false]` `[reject]` (blind) missing value-under-fine-key and `kind` cases — the `${at}.${key}` branch is exercised by `$.input.exprs[0]` and `$.input.template`; `kind` is an enum, so a surrogate there is already a schema error.
  - `[low]` `[reject]` (blind) the parseRequests loop checks only a prefix — the exact message is pinned via validateRequest for each case and via parseRequests for one; tightening adds nothing users meet.
  - `[—]` `[reject]` (blind) spec details loose (verification wording, stale line numbers, empty logs) — fix edits this build's spec.
  - `[low]` `[reject]` (edge) error path for children of a lone-surrogate key holds the raw surrogate — the key error itself is reported first; fixing needs a new path-formatting branch for a case no request reaches.
  - `[low]` `[patch]` (edge) same as blind try/finally finding — patched with it.
  - `[low]` `[patch]` (edge) flags/anchor assumption in derived assertion — patched with the blind finding.
  - `[medium]` `[defer]` (verification-gap) ownership.ts COMPONENT not tied to COMPONENT_NAME — grouped with the blind regex-copies finding; deferred (Protected Path).
  - `[false]` `[reject]` (intent) the batch still aborts the whole run on a bad line — the intent asks to reject lone surrogates in request.ts; it now fails early in TS with a path, before any PHP runs, which is the R7 fix.
  - `[low]` `[reject]` (intent) no real-PHP test confirms json_decode rejects lone surrogates — documented PHP behaviour (JSON_ERROR_UTF16); adding a PHP-executing test is more than a direct correction for a fixed, well-known rule.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/oracle-extract.test.ts conformance/tests/xaravel/oracle-story.test.ts conformance/tests/xaravel/oracle-fixtures.test.ts` -- expected: all pass
- `bun run oracle:extract --check` (or its local equivalent) -- expected: committed requests still validate
- `bunx tsc --noEmit -p .` and `bunx oxlint` per repo scripts -- expected: clean

## Auto Run Result

Status: done

**Summary:** `validateRequest` now rejects any string or key in `id`, `kind` or `input` that holds a lone UTF-16 surrogate, at its JSON path, so extraction, the batch and Story request reads all fail early in TS instead of `evaluate.php`'s `json_decode` aborting the run. `tools/oracle/fixtures.ts` exports `COMPONENT_NAME = /^[a-z][a-z0-9-]*$/`, used by `readCommittedRequests` (was digit-first `^[a-z0-9]…`); XT-conformance-77 derives the commit-step pattern in `oracle.yml` from it.

**Files changed:**
- `tools/oracle/request.ts` -- lone-surrogate walker in `validateRequest`; header comment corrected.
- `tools/oracle/fixtures.ts` -- `COMPONENT_NAME` export, used in `readCommittedRequests`.
- `conformance/tests/xaravel/oracle-extract.test.ts` -- XT-conformance-68 surrogate cases (astral ok; high in string, low in key, reversed pair, `id`; parseRequests).
- `conformance/tests/xaravel/oracle-story.test.ts` -- XT-conformance-77 derives the commit pattern from `COMPONENT_NAME` and pins its flags and anchors (literal assertion kept).
- `conformance/tests/xaravel/oracle-fixtures.test.ts` -- digit-first `1abc.jsonl` is refused.

**Review:** 14 findings. Patched 2 (both low: try/finally cleanup, flags/anchor check). Deferred 2 (medium: ownership.ts/inventory.ts regex copies untied; low: json_decode depth 512). Rejected 10, reasons in the triage log.

**Follow-up review recommended:** false (patched: high 0, medium 0, low 2).

**Verification:** `bun test` full suite 128 pass, 0 fail; `bun run typecheck` and `bun run lint` clean; mutation checks by the implementer (old regex fails XT-77 and the fixtures test; disabling the walker fails XT-68). `readCommittedRequests(".")` validates every committed request (database 1214, support 375, validation 8, view 260). `bun run oracle:extract --check` was not run locally (no Docker); CI's Oracle `build` job runs it.

**Residual risks:** the deferred ownership/inventory regex copies; error paths below a lone-surrogate key contain the raw key.
