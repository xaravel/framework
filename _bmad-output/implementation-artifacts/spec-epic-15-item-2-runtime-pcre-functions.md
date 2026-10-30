---
title: 'Runtime PCRE functions phpdotenv calls: preg_match, preg_match_all, preg_split, preg_replace_callback, preg_last_error, preg_last_error_msg'
type: feature
created: '2026-10-30'
status: blocked
baseline_revision: 0c19e19c39a62d780362690cdc84fa040fb83acc
review_loop_iteration: 0
followup_review_recommended: false
context:
  - decisions/ESC-15.2-1.md
  - decisions/MAINT-2026-10-30-story-15-2.md
  - conformance/escalations/ESC-15.2-5.md
  - PORTING.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 15.2 ports vlucas/phpdotenv v5.7.0, which calls `preg_match`, `preg_match_all`, `preg_split`, `preg_replace_callback` (with `$limit`), `preg_last_error` and `preg_last_error_msg` (ESC-15.2-1 part f). `@xaravel/runtime/php` exports none of them.

**Approach:** Export them from `@xaravel/runtime/php` under their PHP names with PHP 8.5.11 behaviour, taking a PHP pattern string converted by PORTING.md § PCRE conversion (DIV-10.1), with XT-runtime cases against a PHP probe. A pattern form the rule does not cover raises a new Escalation, not an invented conversion.

## Boundaries & Constraints

**Always:** scope `packages/runtime/**` and this item's records; PHP's results for every phpdotenv pattern; sync only (AD-6); `preg_last_error` state in a Scope Frame slot (AD-5).

**Never:** convert a pattern form PORTING.md does not list; change PORTING.md, a DIV, the grader or Expectations; implement item 1's builtins.

</intent-contract>

## Spec Change Log

- 2026-10-30, planning, blocker (divergence). Before building, every pattern phpdotenv v5.7.0 passes to `preg_*` was checked against PORTING.md § PCRE conversion, with PHP 8.5.11 and Bun 1.4.3. Four forms are not covered, and each gives a result different from PHP's if converted literally: the `A` modifier (Lexer.php:43), the branch-reset group `(?|…)` (EntryParser.php:218, which `RegExp` rejects), byte matching without `u` (the Lexer's `{1,1000}` and byte `$offset`), and `\s`/`\S` (ASCII in PCRE without `u`, without U+FEFF with `u`; Unicode with U+00A0 and U+FEFF in JS). The evidence is in `conformance/escalations/ESC-15.2-5.md`. Extending the rule changes DIV-10.1's conversion in a Protected Path, so the orchestrator may not rule on it.

## Auto Run Result

Status: blocked
Blocking condition: ESC-15.2-5 (`divergence`): PORTING.md § PCRE conversion does not cover the `A` modifier, the branch-reset group, byte matching without `u`, or PCRE's `\s`, which phpdotenv v5.7.0's patterns rely on. The item waits on the Maintainer's ruling and was not built. Nothing under `packages/runtime` changed. Once the ruling lands, the item resumes from this spec's Intent, with the ruling's conversions in its Boundaries.
