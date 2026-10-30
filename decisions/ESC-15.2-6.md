---
decision: approved
decided_by: monitor
date: 2026-10-30
escalation_sha256: "8ac862794ff0aae56e86db55e680ae3abeff1b07d6d498b73a5ba5f54c655ae0"
---

# ESC-15.2-6: approved, option 1 (the runtime exports `DIRECTORY_SEPARATOR`, `array_reduce` and `EmptyIterator`)

The monitor approved the orchestrator's recommended option on 2026-10-30 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md`, as the 2026-10-30 amendment to `decisions/MAINT-2026-10-16-unattended-orchestrator.md` requires for a `contract` Escalation. It adds PHP builtins to `packages/runtime` only, under their PHP names and with PHP 8.5.11 behaviour checked against PHP, with no DIV clause, expected value or grader change. The Maintainer was told in the Maintainer's session.

`@xaravel/runtime/php` exports:

- the constant `DIRECTORY_SEPARATOR`, `"/"` on the Oracle image's Linux and on macOS;
- `array_reduce($array, $callback, $initial = null)`, with every PHP callable form through the runtime's shared resolver (DIV-9.13);
- the class `EmptyIterator`, registered under its PHP name: an `Iterator` with no elements, whose `valid()` is `false`, and whose `current()` and `key()` throw PHP's `BadMethodCallException` with "Accessing the value of an EmptyIterator" and "Accessing the key of an EmptyIterator".

XT-runtime cases compare each with PHP. Story 15.2 then replaces its three `BlockedByComponentError(runtime)` throws with Upstream's code (`Paths::filePaths`, `Option::lift`, `None::getIterator`). This is action item `epic-15-item-4-runtime-directory-separator-array-reduce-empty-iterator`.
