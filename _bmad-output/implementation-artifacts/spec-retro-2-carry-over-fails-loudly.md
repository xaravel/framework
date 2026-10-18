---
title: 'Retro epic 2 item 5: Inventory carry-over fails loudly on a malformed committed line'
type: 'bugfix'
created: '2026-10-17'
status: 'done'
baseline_revision: '65b790f014b8b32165dbfdbedb0989875d43fe66'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/ops/inventory.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `inventory generate` carries `assertions` and `oracle` over from the committed Inventory, but `previousEntries` swallows any parse error (`tools/inventory/inventory.ts:624-635`). One bad line, such as a merge-conflict marker or a hand edit, silently resets every entry in that file to `assertions: null, oracle: {}`, and the regenerated file then drops the recorded baseline data (Epic 2 retro finding R6, action item `epic-2-retro-item-5-carry-over-fails-loudly`).

**Approach:** Carry-over reads the committed files with the same fail-closed parser as `readSuiteInventory`. A committed file of the selected suite that does not parse makes `generate` (and `generate --check`) throw before anything is written. The error names the file and line, and says that carry-over needs a valid file.

## Boundaries & Constraints

**Always:** The error message keeps `parseInventory`'s `<file>:<line>: <reason>` and adds the carry-over context, so the operator knows to fix the line or delete the file deliberately. Nothing is written or deleted when it throws. An absent Inventory file still carries nothing, as before.

**Never:** No change to `parseInventory`'s rules, `carryOver`'s matching, the record format or the committed Inventory. No reading of other suites' files: `ai`, `mcp`, `boost` and `oracle-nondeterminism.jsonl` stay unread when generating the framework, as before. No weakened or removed assertion; a fixture that relied on a malformed stale file gets a valid stale file instead.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid committed files | Every selected-suite file parses | Carry-over as before; output unchanged | No error expected |
| Malformed line | `support.jsonl` line 2 is not JSON | `generate` throws naming `conformance/inventory/support.jsonl:2`; CLI exits 1 with `Inventory generate failed: …`; files unchanged | Error, exit 1 |
| Malformed under `--check` | Same, with `--check` | Exits 1 with the same error, not a drift report | Error, exit 1 |
| Other suite malformed | `ai.jsonl` is junk, generating framework | Ignored, as before | No error expected |
| Stale valid file | `routing.jsonl` valid, no longer generated | Read for carry-over, then deleted as before | No error expected |

</intent-contract>

## Code Map

- `tools/inventory/inventory.ts:614-621` -- `readSuiteInventory(root, suite)` parses every file of a suite, fail-closed. Reuse it.
- `tools/inventory/inventory.ts:623-635` -- `previousEntries`, the swallowing `try/catch`. Replace it with a fail-loud read that wraps the error with the carry-over context.
- `tools/inventory/inventory.ts:742` -- the only caller, inside `generate`, before any write. `main` (:850-880) turns a thrown error into `Inventory generate failed: <message>` and exit 1.
- `tools/inventory/inventory.ts:1-40` -- the header comment describes `generate`; add one line on carry-over failing closed.
- `conformance/tests/xaravel/inventory.test.ts:180-316` -- XT-conformance-49 ("… and fails closed"). Its fixture writes `routing.jsonl: "stale\n"`, which the new rule would reject; make it a valid stale line. Add the malformed-line scenario here.
- `conformance/tests/xaravel/pest-inventory.test.ts:219` -- writes junk to `routing.jsonl`/`ai.jsonl`/`boost.jsonl` while generating `mcp`; these are other suites' files and stay unread.
- `docs/ops/inventory.md:152-160` -- documents carry-over; add the fail-closed rule.

## Tasks & Acceptance

**Execution:**
- `tools/inventory/inventory.ts` -- make `previousEntries` fail closed via `readSuiteInventory`, wrapping the message as `carry-over needs a valid committed Inventory: <parse error>`; update its doc comment and the header -- R6.
- `conformance/tests/xaravel/inventory.test.ts` -- in XT-conformance-49, give `routing.jsonl` a valid line; add a malformed committed `support.jsonl` case, run through the CLI with and without `--check`, asserting exit 1, the file:line in stderr, and that the file is byte-unchanged -- covers the matrix.
- `docs/ops/inventory.md` -- state that a committed file which does not parse stops `generate` and `--check`, and what to do -- operator guidance.

**Acceptance Criteria:**
- Given a committed framework Inventory file with a malformed line, when `bun tools/inventory/inventory.ts generate` runs, then it exits 1 naming the file and line, and no Inventory file changes.
- Given valid committed files, when `generate` runs, then output is byte-identical to before (the existing XT-conformance-49..52 and baseline tests pass unchanged in their assertions).

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 17 findings — high 0, medium 0, low 9, false 5, maybe-false 0 (3 rejected as spec edits)
- findings:
  - `[low]` `[patch]` (blind) Carry-over is read after `listSuite`, so a bad file fails only after the slow lister runs — hoisted `previousEntries` for every selected suite before `readMap` and the listing loop.
  - `[false]` `[reject]` (blind) A malformed stray framework file blocks `generate` while the drift row says "regenerate, which deletes it" — the operator sees the carry-over error, not the drift row, and the new Failures row says to fix the line or delete the file deliberately.
  - `[low]` `[patch]` (blind) Documented message promises `<file>:<line>` but whole-file errors carry no line — docs now say `<file>[:<line>]` in both places.
  - `[false]` `[reject]` (blind) Pest test lost proof that other suites' files are ignored — under `--suite mcp`, reading a valid `routing`/`ai`/`boost` file would still throw on `parseInventory`'s suite id/component check, so the passing generate still proves they are unread (confirmed by the verification-gap layer).
  - `[low]` `[reject]` (blind) Only malformed JSON is tested, not schema-invalid lines — every `parseInventory` rejection takes the same wrapper path; extra cases add test bulk for a defect unlikely to diverge.
  - `[false]` `[reject]` (blind) Pest test comment "generating all" misleads — the comment explains why the fixture is valid, and the same test does run `--suite all` later.
  - `[low]` `[reject]` (blind) Spec Code Map/Tasks omit the forced fixture edits — the fix is a spec edit; the edits follow the Never clause (fixture made valid, no assertion weakened).
  - `[low]` `[patch]` (blind) Wrapped error drops the original — added `{ cause: error }`.
  - `[low]` `[reject]` (blind) Only the first bad file is reported — gathering all errors adds branches; a multi-file conflict is rare and the failure is now fast.
  - `[low]` `[patch]` (blind) Appended XT-59 fixture id sorts last only because `bus.jsonl` has one line — id now derives from the last line.
  - `[low]` `[reject]` (blind) Hand-built JSON entries repeated in three tests — test-only duplication, no named harm beyond style.
  - `[low]` `[patch]` (edge) Late failure after the lister — same root cause as the first row; fixed there.
  - `[low]` `[reject]` (edge) IO errors such as EISDIR may lack the path — a directory named `*.jsonl` in the Inventory is not a reachable everyday state; fix adds a per-file wrapper.
  - `[low]` `[patch]` (edge) Fragile appended-id fixture — same as the XT-59 row; fixed there.
  - `[false]` `[reject]` (edge, claim) Code Map says the Pest fixture stays unread — fix is a spec edit; the fixture change is test input, not an assertion.
  - `[false]` `[reject]` (edge, claim) AC "assertions unchanged" understated — the changed expected values compare against the fixture's own new bytes; no expectation was weakened. Fix would be a spec edit.
  - `[false]` `[reject]` (intent) The diff implements fail-closed rather than warn-and-continue or per-line salvage — "fail loudly … instead of silently resetting" selects refusal; salvage would still silently drop the bad line.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/inventory.test.ts conformance/tests/xaravel/pest-inventory.test.ts conformance/tests/xaravel/baseline.test.ts conformance/tests/xaravel/inventory-checks.test.ts conformance/tests/xaravel/pin-bump.test.ts` then `bun test` -- expected: all pass
- `bun run typecheck` -- expected: no errors
- `bun run lint` -- expected: no errors
- `bun tools/inventory/inventory.ts generate --check --suite framework` is not runnable offline (needs the Oracle image); covered by tests.

## Auto Run Result

Status: done

**Summary.** `inventory generate` and `generate --check` now fail closed when a committed Inventory file of a selected suite does not parse. They exit 1 with `Inventory generate failed: carry-over needs a valid committed Inventory: <file>[:<line>]: <reason>`, before any lister runs and before anything is written. Before, `previousEntries` swallowed the error and reset that file's `assertions`/`oracle` (retro finding R6).

**Files changed.**
- `tools/inventory/inventory.ts` -- `previousEntries` uses the fail-closed `readSuiteInventory` and wraps its error (with `cause`); `generate` reads carry-over for all selected suites before listing; comments updated.
- `conformance/tests/xaravel/inventory.test.ts` -- XT-49: valid stale `routing.jsonl`, plus a new malformed-line case through the CLI with and without `--check`.
- `conformance/tests/xaravel/inventory-checks.test.ts` -- XT-59: the appended line and the stray `ghost.jsonl` are now valid entries; the drift assertions are unchanged.
- `conformance/tests/xaravel/pest-inventory.test.ts` -- XT-53: the other suites' fixture files are now valid entries, because `--suite all` reads them.
- `docs/ops/inventory.md` -- the Preservation rule, a Failures row, and a `--check` note.

**Review.** 17 findings: 6 rows patched (4 distinct fixes, all low), 0 deferred, 11 rejected (reasons in the Review Triage Log).

**Follow-up review:** false. Only low entries were patched (low 4, medium 0, high 0).

**Verification.** `bun test` gives 76 pass and 0 fail. `bun run typecheck` and `bun run lint` are clean. The matrix audit passes: each row is covered by XT-49, XT-53 or XT-59.

**Residual risk.** I did not run `generate --check` against the real Oracle image, because it needs Docker and the image. The CLI tests use a stand-in PHP.
