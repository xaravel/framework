---
decision: approved
decided_by: monitor
date: 2026-10-29
scope: epic-14-retro-item-7-lazy-range-php-arithmetic
---

# Ruling: the runtime's `minus`, for Epic 14 retro item 7

`epic-14-retro-item-7-lazy-range-php-arithmetic` waited on the Maintainer (#547). Upstream's descending `LazyCollection::range` runs `$from -= abs($step)`, and a non-numeric bound throws PHP's `TypeError` `Unsupported operand types: string - int`. The runtime has `plus` and `divide` for `+` and `/` (ESC-14.5-2) but no helper for `-`, and the item's scope names only `packages/collections`.

The monitor approved the route on 2026-10-29 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md` and its amendment for PHP language constructs. It adds a helper for a PHP operator to `packages/runtime` only, with PHP 8.5.11 behaviour checked against PHP, and widens PORTING.md's existing idiom row for `+` and `/`. There is no DIV clause, expected-value or grader change. The Maintainer was told in the Maintainer's session.

## The route

1. Action item `epic-14-retro-item-8-runtime-minus`: `@xaravel/runtime/php` exports `minus(a, b)`, PHP's `$a - $b`, as `plus` does `+`: PHP's numeric-string coercion, an int or float result (int overflow to float as PHP does), and PHP's `TypeError` `Unsupported operand types: <a> - <b>` for an array or other unsupported operand. XT-runtime cases compare it with PHP. Scope `packages/runtime`. When it lands, its PR takes item 7 out of epic 14's `waiting_on_maintainer`.
2. Item 7 then resumes in `packages/collections` and uses `minus` for `range`'s descending step.
