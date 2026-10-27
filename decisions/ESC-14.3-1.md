---
decision: approved
decided_by: monitor
date: 2026-10-26
escalation_sha256: "9c3c5b84a69186edf9ecfeba0d71daf64a44b9a469e9e6acf75e53305a56f475"
---

# ESC-14.3-1: approved, option 1, the runtime exports `round`, `reset`, `end`, `is_bool`, `strtoupper`, `trim` and `chunk_split`

The monitor approved the orchestrator's recommended option on 2026-10-26 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md`. The Escalation meets every condition of that rule:

- its trigger is `contract`;
- it adds PHP builtins to `packages/runtime` only, under their PHP names and with the behaviour of the Oracle's PHP 8.5.11, with XT-runtime cases;
- `reset` and `end` take the `Ref` that DIV-9.2 already gives every by-reference parameter;
- no DIV clause, expected value or grader file changes.

The Maintainer is told in the Maintainer's session.

`@xaravel/runtime/php` exports the following:

- **`round(num, precision = 0, mode = PHP_ROUND_HALF_UP)`.**
  - It takes PHP's full signature.
  - It adds the four `PHP_ROUND_*` constants and PHP 8.4's `RoundingMode` enum as an AD-26 enum. Either is accepted as `mode`, as in PHP 8.5.
  - It follows PHP 8.5's `_php_math_round`, negative `precision` included, and throws PHP's `ValueError` for an invalid int `mode`.
  - It returns a float that carries the float marker when integral.
- **`reset(ref)` and `end(ref)`** over a `Ref<array>`. Each returns the first or last value, or `false` for an empty array.
- **`is_bool`.**
- **`strtoupper`**, ASCII-only as in PHP 8.
- **`trim(string, characters = " \n\r\t\v\0")`**, with PHP's `a..z` range syntax.
- **`chunk_split(string, length = 76, separator = "\r\n")`**, with PHP's `ValueError` for a `length` below 1.

`percentage`, `groupBy`, `whereBetween` and `whereNotBetween` then port in full. So do the three higher-order fixtures, with every method, and the 20 Test IDs port as Upstream wrote them.

Option 2 would have put PHP semantics outside the runtime. This is action item `epic-14-item-8-runtime-round-string-array-pointer`.
