---
decision: approved
decided_by: monitor
date: 2026-10-26
escalation_sha256: "3eb6e700bea71d63468784964b452ae5df99c530a03d689da64985dfb7097925"
---

# ESC-14.4-1: approved, option 1, the runtime exports fourteen array builtins and a helper for PHP's array `+`

The monitor approved the orchestrator's recommended option on 2026-10-26 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md` and its 2026-10-26 amendment for PHP language constructs. The Escalation qualifies:

- its trigger is `contract`;
- it adds PHP builtins to `packages/runtime` only, under their PHP names and with the Oracle's PHP 8.5.11 behaviour, with XT-runtime cases and a PHP probe;
- the array-union helper has no PHP function name, and its only other change is a PORTING.md idiom-table row;
- no DIV clause, expected value or grader file changes.

The Maintainer was told in the Maintainer's session.

`@xaravel/runtime/php` exports:

- `array_merge_recursive`, `array_replace` and `array_replace_recursive`;
- `array_diff`, `array_diff_assoc` and `array_diff_key`, which compare values as strings;
- `array_intersect`;
- the callback forms `array_udiff`, `array_diff_uassoc`, `array_diff_ukey`, `array_uintersect` and `array_intersect_uassoc`;
- `array_pad`, with PHP's `ValueError` beyond its length limit;
- `is_int`;
- `arrayUnion(a, b)`, PHP's `$a + $b` for arrays.

The Collection set members then port in full on Collection and LazyCollection, and the 50 Test IDs port as Upstream wrote them. Private copies in `packages/collections` (option 2) would put PHP semantics outside the runtime. This is action item `epic-14-item-9-runtime-set-functions-callable-names`.
