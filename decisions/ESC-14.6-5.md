---
decision: approved
decided_by: monitor
date: 2026-10-27
escalation_sha256: "371ea8dcac7ad35870cf044f6d171ab71b98739418457b1fbdf7f42b447f80fd"
---

# ESC-14.6-5: approved, the runtime binder accepts ArrayAccess|array declarations

The monitor approved the orchestrator's recommended option on 2026-10-27 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md` (and its amendment for PHP language constructs). It extends a construct helper in `packages/runtime` only, the argument binder that `decisions/ESC-14.6-3.md` published under the same rule, with PHP 8.5.11 behaviour checked against PHP, and no DIV clause, expected value or grader change. The Maintainer was told in the Maintainer's session. The route is in `decisions/MAINT-2026-10-27-story-14-6-binder.md`.

`bindPhpArguments` in `@xaravel/runtime/php` binds a parameter declared `ArrayAccess|array` the way PHP's coercive typing mode does:

- an object that implements the runtime's `ArrayAccess` (for example `ArrayObject`) is accepted, and keeps its object handle: it is not copied;
- a PHP array, in any of the runtime's array forms, is accepted as before;
- any other value throws PHP's `TypeError`, whose text names the whole declaration, for example `must be of type ArrayAccess|array, null given`;
- every supplied argument is validated before the body runs, and an unused invalid default is handled as PHP handles it.

XT-runtime cases compare each with PHP. Collections implements no declaration check of its own. This is action item `epic-14-item-12-runtime-binder-arrayaccess-union`.
