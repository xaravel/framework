---
decision: approved
decided_by: monitor
date: 2026-10-31
scope: Epic 16 retrospective items 1 and 5 (`callUnpacked` argument order)
---

# Ruling: `callUnpacked` reports DIV-9.15's `TypeError` in PHP's argument order

Item 1 resumed after `decisions/MAINT-2026-10-31-epic-16-item-1.md` and stopped again (#603). For `args` holding a string key followed by an integer key (`{a: 1, 0: 2}`), PHP 8.5.11 handles the arguments left to right and reports `Error: Unknown named parameter $a` first. The runtime's `unpack` (`packages/runtime/src/php/callables.ts`, shared by `callUnpacked` and `call_user_func_array`) checks ordering first and throws PHP's other error, `Cannot use positional argument after named argument during unpacking`. The fix is in `packages/runtime`, outside item 1's scope.

The recommendation keeps the DIV-9.15 `TypeError` in place of PHP's `Unknown named parameter` error, so the Maintainer's TypeError standing rule (2026-10-25) lets the monitor approve it, with this decision and the clause written and the Maintainer told:

- **DIV-9.15** is amended: the `TypeError` is thrown at the first string key the target cannot take, in argument order, before any later positional argument is checked.
- **Action item `epic-16-retro-item-5-runtime-callunpacked-order`** (scope `packages/runtime`): in `unpack`, a string key whose target has no options form throws the ESC-14.5-3 `TypeError` as soon as it is reached, in argument order. A target with an options form keeps today's handling, including PHP's `Cannot use positional argument after named argument` errors, its duplicate-name error and its key-type error. XT-runtime cases cover `{a: 1, 0: 2}`, `{0: 1, a: 2}` and an options-form target, against PHP's recorded results. When it lands, its PR takes item 1 out of epic 16's `waiting_on_maintainer`.
