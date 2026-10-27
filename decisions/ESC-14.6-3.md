---
decision: approved
decided_by: monitor
date: 2026-10-27
escalation_sha256: "800384f8c386e59f74be0be41aa76c6b8efc12a04e30858fa588bc86af8dec02"
---

# ESC-14.6-3: approved, the runtime publishes its coercive PHP argument binder

The monitor approved the orchestrator's recommended option on 2026-10-27 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md` (and its amendment for PHP language constructs). It adds PHP builtins or a construct helper to `packages/runtime` only, with PHP 8.5.11 behaviour checked against PHP, and no DIV clause, expected value or grader change. The Maintainer was told in the Maintainer's session. The route is in `decisions/MAINT-2026-10-27-story-14-6.md`.

**The binder.** `@xaravel/runtime/php` publishes the runtime's PHP argument binder, which today is internal (`phpArguments`), as a reusable seam. It binds arguments to a userland method the way PHP's coercive typing mode does:

- array, string, bool, int and float parameters;
- nullable defaults;
- union types;
- every supplied argument validated before the method runs, with PHP's `TypeError`;
- scalar returns normalized: `number` or `bigint` for int, `number` or the float marker for float, and a normalized string for string-like class tokens.

XT-runtime cases compare it with PHP. This is action item `epic-14-item-11-runtime-arr-builtins-argument-binder`.
