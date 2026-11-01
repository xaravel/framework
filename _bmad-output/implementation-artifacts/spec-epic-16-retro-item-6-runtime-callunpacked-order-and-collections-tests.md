---
title: 'Runtime argument unpacking error order'
type: bugfix
created: '2026-10-31'
status: blocked
baseline_revision: 5e89aeaee639147cf4406cb40b17dd9f0ea25eaf
review_loop_iteration: 0
followup_review_recommended: false
context:
  - decisions/MAINT-2026-10-31-epic-16-item-5.md
  - decisions/MAINT-2026-10-31-epic-16-item-6.md
  - decisions/DIV-9.md
warnings: []
deferred:
  - summary: >-
      Fidelity F-7 prior callable probe output is absent from reviewer evidence.
    evidence: |-
      Reviewer 2 requested php-chunk-sort-arith-callables.probe.txt unpack and unpack.custom-traversable rows; existing repository record was not in prompt. Tool counts this missing-evidence-only finding under MAINT-2026-10-24-evidence-gaps; copy to Maintainer inbox for next retrospective.
    location: >-
      packages/runtime/tests/xaravel/php-chunk-sort-arith-callables.probe.txt
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The shared unpacker delays rejecting named arguments for targets without an options form until after consuming all entries. A later positional key masks the DIV-9.15 TypeError that must occur at the first string key, contrary to PHP's argument order.

**Approach:** Reject an unsupported named argument when encountered, preserving all existing handling for options-form targets. Verify both public entry points against PHP 8.5.11 records and the approved DIV-9.15 adaptation.

## Boundaries & Constraints

**Always:** Implement epic-16-retro-item-6-runtime-callunpacked-order-and-collections-tests under decisions/MAINT-2026-10-31-epic-16-item-5.md, scoped to packages/runtime, the two authorized Collections assertion pairs, and its records. Preserve exact existing diagnostics, value copying, null normalization, callable resolution and options-form support. Keep integer order in PhpArray. Mark adapted checks DIV-9.15. Keep every existing assertion at least as strong.

**Never:** Change other components or any other Collections assertion, Expectations, grader, DIV records or public signatures. Do not implement PHP named parameter binding or change options-form handling.

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

- `packages/collections/tests/xaravel/collections.test.ts:1380` and `packages/collections/tests/xaravel/arr.test.ts:962` -- change only the named-first error class/message assertions to exact DIV-9.15 TypeError, each marked `// adapted:DIV-9.15`. Preserve callback observations.
- `_bmad-output/implementation-artifacts/retro-16-item-5-callunpacked-attempt.patch` -- saved complete implementation to apply, then delete upon successful completion.


- `packages/runtime/src/php/callables.ts` -- `unpack` serves callUnpacked and call_user_func_array; OPTIONS brand is retained by callable resolution. Current unsupported-name check is after the loop.
- `packages/runtime/tests/xaravel/php-chunk-sort-arith-callables.test.ts` -- existing unpack and options assertions must survive; read alongside its PHP probe and record.
- `packages/runtime/tests/xaravel/php-callunpacked-order.{test.ts,probe.php,probe.txt}` -- new regression tests and PHP 8.5.11 evidence; use the existing runtime probe label checking pattern and next unused XT-runtime id.
- `decisions/DIV-9.md` and `decisions/MAINT-2026-10-31-epic-16-item-5.md` -- read-only binding evidence.
- Architecture spine AD-1/4/5/9/10/19/26 -- preserve runtime zero dependencies, shared value and construct rules and synchronous callable semantics.

## Tasks & Acceptance

**Execution:**
- Apply the saved item 5 patch with `git apply`; implement the two authorized Collections assertion updates. No other changes to Collections.
- Delete the saved attempt patch after success. Parent handles item status and unblocking item 1 in gates.
- `packages/runtime/src/php/callables.ts` -- move unsupported-name detection into the string-key branch; cite the ruling.
- `packages/runtime/tests/xaravel/php-callunpacked-order.{test.ts,probe.php,probe.txt}` -- cover every matrix row, both entry points where applicable, PHP-recorded evidence and explicit adapted assertions for the approved difference.

**Acceptance Criteria:**
- Given the PHP-recorded regression inputs, when both public unpacking entry points run, then unsupported names report DIV-9.15 TypeError in argument order and options targets retain PHP diagnostics and results.
- Given existing runtime tests and the complete workspace checks, when verification runs, then no assertion or expectation is weakened and no new differences occur.

## Spec Change Log

- 2026-10-31: New item 6 resumes the saved item 5 attempt under monitor ruling MAINT-2026-10-31-epic-16-item-6; scope adds only the two Collections assertion pairs. Existing item 5 spec remains historical.

## Review Triage Log

### 2026-10-31 — Review pass
- verdicts: 11 findings — high 0, medium 1, low 4, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: literal PHP unknown-name evidence could map explicitly from captured error — the approved divergence deliberately has different PHP and JS diagnostics; adjacent assertions require exact runtime TypeError/message and compare the independent executed PHP record. Extra mapping adds no behavioral verification.
  - `[low]` `[reject]` Blind: add a held-generator regression — foreachIterator always invokes TRAVERSAL_EXIT; Generator's hook explicitly leaves held sources resumable, while XT-runtime-89 already verifies held ownership and XT-runtime-152 verifies this early exit. No defect demonstrated; no new ownership contract needed.
  - `[low]` `[reject]` Blind: add later duplicate/bad-key precedence cases — first-string rejection is unconditional before loop continuation, and current rows prove first-string rejection, duplicate and invalid key diagnostics. More combinations are redundant for this fix.
  - `[false]` `[reject]` Blind: callable-resolution options coverage missing — existing lines 257–267 exercise object, static, class-string and invokable options forms through both entry points; targeted and full harness runs pass them.
  - `[false]` `[reject]` Blind: repeated options accessor/proxy reads change behavior — resolution snapshots the original brand through withOptions into an own immutable value on the resolved wrapper before unpacking; named entries read that stable value. Builtin registry wrappers contain no accessor brand. No mutable user getter reaches this loop.
  - `[false]` `[reject]` Blind: value copying/null normalization require new cases — existing lines 268–273 assert positional/named array isolation and retained object identity for both entry points. Unchanged return expression normalizes null, outside the moved guard; no changed successful-return path exists.
  - `[false]` `[reject]` Intent: options wrappers change exercised targets — the saved attempt explicitly maps PHP named-capable targets to options-branded equivalents while retaining every expected diagnostic; unsupported targets are independently asserted by XT-runtime-152. This implements the authorized saved attempt.
  - `[false]` `[reject]` Intent: literal PHP evidence is separate from adapted TypeError — that is the approved DIV-9.15 mapping, with exact TypeError class/message asserted and lazy traversal log directly compared to PHP. No equality between differing diagnostics is claimed.
  - `[low]` `[reject]` Intent: item 1 gate/status change absent from review diff — PR bookkeeping is explicitly assigned to the parent, which must apply it before the first push; no package change is missing.
  - `[false]` `[reject]` Intent: diff alone does not establish verification/provenance — verification is executed by workflow and recorded below; exact PHP probe cmp, 27 targeted tests, full harness, typecheck and lint passed. A diff alone cannot encode execution history.
  - `[medium]` `[defer]` Fidelity reviewer 2 F-7: prior callable probe record omitted from prompt — existing `php-chunk-sort-arith-callables.probe.txt` contains unpack and custom-Traversable expected diagnostics. Marked missing-evidence by reviewer, outside F-2/F-3/F-8; tool exits 0 and counts review under MAINT-2026-10-24-evidence-gaps. Parent copies gap to INBOX for next retrospective.
- Edge Case Hunter: no findings. Verification Gap Reviewer: no gaps. No review patches applied.


## Verification

- `php -v` and the new PHP probe -- PHP 8.5.11; record the exact outputs.
- `bun test packages/runtime/tests/xaravel/php-callunpacked-order.test.ts packages/runtime/tests/xaravel/php-chunk-sort-arith-callables.test.ts packages/collections/tests/xaravel/arr.test.ts packages/collections/tests/xaravel/collections.test.ts` -- all cases pass.
- `bun run harness` -- differ=0 (run alone, retain output).
- `bun run typecheck` and `bun run lint` -- pass.
- `bun run fidelity:review status --item epic-16-retro-item-6-runtime-callunpacked-order-and-collections-tests --spec _bmad-output/implementation-artifacts/spec-epic-16-retro-item-6-runtime-callunpacked-order-and-collections-tests.md` -- current before merging.

## Fidelity Review

### Reviewer 1: pass at tree 990a7b10c53ca03fc91e60601d2653929335c905

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `codex` loop, against base `5e89aeaee639147cf4406cb40b17dd9f0ea25eaf`, on 2026-11-01T01:46:55.424Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test changed; only Xaravel Tests touched. |
| F-2: No expected value is weakened | pass | Changed expectations (XT-collections-11/12) swap PhpError for the DIV-9.15 TypeError, each marked adapted:DIV-9.15; clause covers exactly this TypeError at first string key for targets without options form. Messages match the runtime's. Other expected values unchanged. |
| F-3: No assertion is removed without a DIV clause | pass | No assertion removed; assertions replaced one-for-one with adapted markers. New test only adds assertions. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations lines changed. |
| F-5: Every `adapted` marker matches its clause | pass | DIV-9.15 as amended 2026-10-31 describes TypeError at first string key in argument order for targets lacking options form, with an Xaravel Test asserting it beside PHP's recorded result. Markers appear exactly on those assertions. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixtures involved. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-152's body checks both entrypoints, string-key first/second order, options form, ordering error, positional, duplicate, bad key, lazy cleanup, against recorded PHP probe labels; it cites no FR/AD tokens. Edits to XT-runtime-86..90 cases only add the options brand to keep the recorded PHP behaviour. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes are in runtime (callables.ts) and collections tests, both in the item's declared scope; no stub of another component. |
| F-9: Every `@asyncRoot` tag is true | pass | callables.ts has no @​asyncRoot tags and the change adds no async functions or Promise returns. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No oracle request files changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"990a7b10c53ca03fc91e60601d2653929335c905","base":"5e89aeaee639147cf4406cb40b17dd9f0ea25eaf","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"codex","fallback":null,"date":"2026-11-01T01:46:55.424Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test changed; only Xaravel Tests touched.","findings":[]},{"id":"F-2","result":"pass","note":"Changed expectations (XT-collections-11/12) swap PhpError for the DIV-9.15 TypeError, each marked adapted:DIV-9.15; clause covers exactly this TypeError at first string key for targets without options form. Messages match the runtime's. Other expected values unchanged.","findings":[]},{"id":"F-3","result":"pass","note":"No assertion removed; assertions replaced one-for-one with adapted markers. New test only adds assertions.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations lines changed.","findings":[]},{"id":"F-5","result":"pass","note":"DIV-9.15 as amended 2026-10-31 describes TypeError at first string key in argument order for targets lacking options form, with an Xaravel Test asserting it beside PHP's recorded result. Markers appear exactly on those assertions.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixtures involved.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-152's body checks both entrypoints, string-key first/second order, options form, ordering error, positional, duplicate, bad key, lazy cleanup, against recorded PHP probe labels; it cites no FR/AD tokens. Edits to XT-runtime-86..90 cases only add the options brand to keep the recorded PHP behaviour.","findings":[]},{"id":"F-8","result":"pass","note":"Changes are in runtime (callables.ts) and collections tests, both in the item's declared scope; no stub of another component.","findings":[]},{"id":"F-9","result":"pass","note":"callables.ts has no @asyncRoot tags and the change adds no async functions or Promise returns.","findings":[]},{"id":"F-10","result":"n/a","note":"No oracle request files changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 990a7b10c53ca03fc91e60601d2653929335c905

Reviewed by `codex` (model `gpt-6.1-sol`) for a `codex` loop, against base `5e89aeaee639147cf4406cb40b17dd9f0ea25eaf`, on 2026-11-01T01:46:55.424Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed, and no Ported Test IDs are assigned. |
| F-2: No expected value is weakened | pass | The changed exception assertions remain exact; their TypeError classes and messages are expressly permitted by DIV-9.15. Other expected values are unchanged. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | pass | The added DIV-9.15 markers cover precisely the documented TypeError for named arguments without an options form. Retained DIV-9.16 markers cover competing cleanup exceptions. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixtures relied upon by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-runtime-152 checks the supplied PHP results and adapted errors, and the Collections bodies support their declared consequences. The existing runtime suite's PHP comparisons cannot be fully confirmed without its recorded data. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes stay within the authorized runtime and collections components. The shared unpack fix implements runtime behavior and introduces no substitute implementation of another component. |
| F-9: Every `@asyncRoot` tag is true | pass | The complete changed callables.ts has no async roots or tags; its synchronous callable resolution and unpacking require none under AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-chunk-sort-arith-callables.probe.txt`: Supply the probe output read by check(), particularly the unpack and unpack.custom-traversable rows. These expected results are absent from the prompt, preventing confirmation that the changed target wrappers preserve the PHP diagnostics claimed by XT-runtime-88 and XT-runtime-90. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"990a7b10c53ca03fc91e60601d2653929335c905","base":"5e89aeaee639147cf4406cb40b17dd9f0ea25eaf","cli":"codex","model":"gpt-6.1-sol","loop_cli":"codex","fallback":null,"date":"2026-11-01T01:46:55.424Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed, and no Ported Test IDs are assigned.","findings":[]},{"id":"F-2","result":"pass","note":"The changed exception assertions remain exact; their TypeError classes and messages are expressly permitted by DIV-9.15. Other expected values are unchanged.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"pass","note":"The added DIV-9.15 markers cover precisely the documented TypeError for named arguments without an options form. Retained DIV-9.16 markers cover competing cleanup exceptions.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixtures relied upon by this item.","findings":[]},{"id":"F-7","result":"fail","note":"XT-runtime-152 checks the supplied PHP results and adapted errors, and the Collections bodies support their declared consequences. The existing runtime suite's PHP comparisons cannot be fully confirmed without its recorded data.","findings":[{"path":"packages/runtime/tests/xaravel/php-chunk-sort-arith-callables.probe.txt","detail":"Supply the probe output read by check(), particularly the unpack and unpack.custom-traversable rows. These expected results are absent from the prompt, preventing confirmation that the changed target wrappers preserve the PHP diagnostics claimed by XT-runtime-88 and XT-runtime-90.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"Changes stay within the authorized runtime and collections components. The shared unpack fix implements runtime behavior and introduces no substitute implementation of another component.","findings":[]},{"id":"F-9","result":"pass","note":"The complete changed callables.ts has no async roots or tags; its synchronous callable resolution and unpacking require none under AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: blocked.

Blocking condition: permission denied: elevated final-tree Fidelity Review. After updating retro-gates.yaml to release item 1, the bound tree changed and the prior review became stale. The sandboxed rerun timed out after 15 minutes and began a retry; those iteration-owned processes were stopped before requesting the same command outside the sandbox. Automatic approval review rejected the elevated command: repository diff/spec content might be sent to external CLI services, and it treated the transcript as insufficient authorization. No retry or workaround was attempted after denial.

The verified implementation is preserved in `retro-16-item-6-callunpacked-attempt.patch`; package changes were reverted in place. Item 6 remains in-progress and waiting_on_maintainer; item 1 remains waiting. Maintainer action: resolve authorization for the required final-tree Fidelity Review, then resume this spec and saved patch. Earlier successful verification below applies to that saved implementation, not the documentation-only blocked record.

Implemented the saved item 5 runtime change: both entry points reject unsupported named arguments immediately in iteration order. Added XT-runtime-152 and 13 executed PHP 8.5.11 evidence rows, preserving options diagnostics, positional order and lazy cleanup. Updated exactly the XT-collections-11/12 class/message assertion pairs to DIV-9.15 native TypeError. Existing runtime fixtures map PHP named-capable callbacks to options wrappers without changing expected results. Deleted the now-applied saved attempt patch.

Files: `packages/runtime/src/php/callables.ts` (early guard); runtime `php-callunpacked-order.test.ts` and `.probe.php`/`.probe.txt` (regression and independent PHP evidence); `php-chunk-sort-arith-callables.test.ts` (options mappings); the two Collections Xaravel test files (authorized assertion pairs); this spec (execution/review records).

Verification: PHP CLI 8.5.11; regenerated probe matches committed record exactly with cmp. Four targeted test files: 27 passed. Elevated isolated full `bun run harness`: 547 tests, 542 passed, 0 failed, 5 skipped; SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0. `bun run typecheck` passed. `bun run lint` passed, disables check ok (1066 files). Logs retained in orchestrator state tmp as retro-16-item-6-{harness,typecheck,lint,fidelity}.log. All eight matrix rows are covered by executed XT-runtime-152.

Reviews: blind hunter, edge case hunter, verification-gap reviewer and intent alignment auditor completed; findings triaged individually above. Patches applied: 0 (high 0, medium 0, low 0). Deferred: 1 existing Fidelity evidence prompt gap. Rejected: 10, with individual reasons above. Fidelity: Claude passed; Codex rejected solely on F-7 missing evidence, counted by standing ruling. Follow-up review recommendation: false. Residual risk: noted evidence omission; PR parent must set item 6 done and remove item 1 from waiting_on_maintainer before pushing.
