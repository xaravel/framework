---
title: 'Runtime argument unpacking error order'
type: bugfix
created: '2026-10-31'
status: blocked
baseline_revision: d18562f5180d5f52e20c886b7a65d7422ef4a818
review_loop_iteration: 0
followup_review_recommended: false
context:
  - decisions/MAINT-2026-10-31-epic-16-item-5.md
  - decisions/DIV-9.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The shared unpacker delays rejecting named arguments for targets without an options form until after consuming all entries. A later positional key masks the DIV-9.15 TypeError that must occur at the first string key, contrary to PHP's argument order.

**Approach:** Reject an unsupported named argument when encountered, preserving all existing handling for options-form targets. Verify both public entry points against PHP 8.5.11 records and the approved DIV-9.15 adaptation.

## Boundaries & Constraints

**Always:** Implement epic-16-retro-item-5-runtime-callunpacked-order under decisions/MAINT-2026-10-31-epic-16-item-5.md, scoped to packages/runtime and its records. Preserve exact existing diagnostics, value copying, null normalization, callable resolution and options-form support. Keep integer order in PhpArray. Mark adapted checks DIV-9.15. Keep every existing assertion at least as strong.

**Never:** Change other components, Expectations, grader, DIV records or public signatures. Do not implement PHP named parameter binding or change options-form handling.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| unsupported name first | target without options; ordered a:1, 0:2 | first name rejected before positional key | existing ESC-14.5-3 JS TypeError, adapted DIV-9.15 beside recorded PHP unknown-name error |
| unsupported name second | same target; ordered 0:1, a:2 | name rejected | same TypeError beside PHP unknown-name error |
| supported options | options target; positional then named | target receives positional values and final options object | none |
| options ordering | options target; named then positional | existing ordering diagnostic | PHP Error with entry-point-specific message |
| repeated name | options target; Traversable with repeated string key | existing duplicate-name diagnostic | PHP Error |
| bad key | options target; Traversable with non int/string key | existing key-type diagnostic | PHP Error |
| positional only | integer keys, both entry points | values delivered in insertion order | none |
| lazy traversal | unsupported name followed by further yields | traversal stops at first unsupported name | no later yield side effect, iterator cleanup retained |

</intent-contract>

## Code Map

- `packages/runtime/src/php/callables.ts` -- `unpack` serves callUnpacked and call_user_func_array; OPTIONS brand is retained by callable resolution. Current unsupported-name check is after the loop.
- `packages/runtime/tests/xaravel/php-chunk-sort-arith-callables.test.ts` -- existing unpack and options assertions must survive; read alongside its PHP probe and record.
- `packages/runtime/tests/xaravel/php-callunpacked-order.{test.ts,probe.php,probe.txt}` -- new regression tests and PHP 8.5.11 evidence; use the existing runtime probe label checking pattern and next unused XT-runtime id.
- `decisions/DIV-9.md` and `decisions/MAINT-2026-10-31-epic-16-item-5.md` -- read-only binding evidence.
- Architecture spine AD-1/4/5/9/10/19/26 -- preserve runtime zero dependencies, shared value and construct rules and synchronous callable semantics.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/callables.ts` -- move unsupported-name detection into the string-key branch; cite the ruling.
- `packages/runtime/tests/xaravel/php-callunpacked-order.{test.ts,probe.php,probe.txt}` -- cover every matrix row, both entry points where applicable, PHP-recorded evidence and explicit adapted assertions for the approved difference.

**Acceptance Criteria:**
- Given the PHP-recorded regression inputs, when both public unpacking entry points run, then unsupported names report DIV-9.15 TypeError in argument order and options targets retain PHP diagnostics and results.
- Given existing runtime tests and the complete workspace checks, when verification runs, then no assertion or expectation is weakened and no new differences occur.

## Spec Change Log

## Review Triage Log

## Verification

- `php -v` and the new PHP probe -- PHP 8.5.11; record the exact outputs.
- `bun test packages/runtime/tests/xaravel/php-callunpacked-order.test.ts packages/runtime/tests/xaravel/php-chunk-sort-arith-callables.test.ts` -- all cases pass.
- `bun run harness` -- differ=0 (run alone, retain output).
- `bun run typecheck` and `bun run lint` -- pass.
- `bun run fidelity:review status --item epic-16-retro-item-5-runtime-callunpacked-order --spec _bmad-output/implementation-artifacts/spec-epic-16-retro-item-5-runtime-callunpacked-order.md` -- current before merging.


## Auto Run Result

Status: blocked.
Blocking condition: implementation verification failed; required Collections test updates exceed this item's packages/runtime scope and fail the standing stale-test rule's no-expected-value-change condition.

The attempted change moves unsupported-name rejection into the string-key branch of the shared unpacker. XT-runtime-152 covers all eight matrix rows, both entry points where applicable, exact adapted TypeError class/message and lazy cleanup beside 13 PHP 8.5.11 records. The two targeted runtime files passed 6/6; parent regenerated the PHP probe and compared the record exactly, with no difference. Existing runtime ordering fixtures were mapped to options-form targets without changing their expected diagnostics.

Full harness inside the sandbox: 547 tests, 535 passed, 7 failed, 5 skipped; differ=7, including infrastructure timeouts. Required elevated rerun: 547 tests, 540 passed, 2 failed, 5 skipped; 21817 checked, differ=2. Remaining failures: XT-collections-11 and XT-collections-12, both asserting an instance of PHP Error but receiving the approved JS TypeError. Logs: orchestrator state tmp/retro-16-item-5-harness.log and tmp/retro-16-item-5-harness-elevated.log.

The affected assertions are packages/collections/tests/xaravel/collections.test.ts:1380 (reduceSpread) and packages/collections/tests/xaravel/arr.test.ts:962 (mapSpread). Their callbacks have no options form, so the corrected runtime necessarily rejects the first string key before encountering the later positional key. They currently pin PHP's positional-after-named Error and message. They need explicit authorization to assert DIV-9.15 TypeError, including adapted markers, or an approved equivalent fixture mapping that retains their intended coverage. The action's scope names only packages/runtime. MAINT-2026-10-24-stale-cross-scope-tests permits neither changed expected values nor new adapted markers; therefore this iteration edits neither Collections file.

Saved complete runtime attempt: retro-16-item-5-callunpacked-attempt.patch in this directory. All package edits reverted. Item 5 remains in-progress and joins epic 16 waiting_on_maintainer; item 1 remains waiting until item 5 actually lands. No result note to remove. Typecheck, lint and four text/Fidelity review layers were not run because implementation verification halted on this scope blocker. Review patches applied: none; deferred findings: none; rejected findings: none. Follow-up review recommendation: false while blocked. No code or test changes are proposed on main.
