---
decision: approved
decided_by: monitor
date: 2026-10-27
escalation_sha256: "4736f5e0f422ae9ae903ca69ca7a8bc9ea23eed4906066e6ea2b463a00e82d86"
---

# ESC-14.5-2: approved, option 1, runtime helpers for PHP's numeric `+` and `/`

The monitor approved the orchestrator's recommended option on 2026-10-27 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md` (and its 2026-10-26 amendment for PHP language constructs). It adds PHP builtins or construct helpers to `packages/runtime` only, with PHP 8.5.11 behaviour checked against the Oracle, and no DIV clause, expected value or grader file changes. The Maintainer was told in the Maintainer's session. The route is in `decisions/MAINT-2026-10-27-story-14-5.md`.

`@xaravel/runtime/php` exports `plus(a, b)` for PHP's `+` and `divide(a, b)` for PHP's `/`, and PORTING.md's idiom table names both. Each keeps PHP's behaviour:

- operand coercion, including numeric strings (integer, fractional, exponent and leading-numeric), `null` and booleans;
- an int result versus a float result, with the float marker on an integral float;
- integer overflow to float;
- PHP's `TypeError` for an operand that is not valid;
- `DivisionByZeroError`;
- for `plus` with two arrays, the array union (`arrayUnion`).

`sum` and `avg` then compute as PHP does. Choosing `toInt` or `toFloat` inside collections (option 2) would decide PHP semantics locally. This is action item `epic-14-item-10-runtime-chunk-sort-arith-callables`.
