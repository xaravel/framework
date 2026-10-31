---
decision: approved
decided_by: monitor
date: 2026-10-30
escalation_sha256: "d817dd2b654abc87cec1eaf1bf1a564888c5d02961022f2233d0adf0838dbd7b"
---

# ESC-16.1-2: approved, option 1 (the runtime exports `array_column` and `rawurldecode`)

The monitor approved the orchestrator's recommended option on 2026-10-30 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md`, as the 2026-10-30 amendment to `decisions/MAINT-2026-10-16-unattended-orchestrator.md` requires for a `contract` Escalation. It adds PHP builtins to `packages/runtime` only, under their PHP names and with PHP 8.5.11 behaviour checked against PHP, with no DIV clause, expected value or grader change. The Maintainer was told in the Maintainer's session.

`@xaravel/runtime/php` exports `array_column`, with its `$column_key` and `$index_key` forms over lists of arrays and of objects (public properties), and `rawurldecode`, which Story 16.2's Deserializer calls. XT-runtime cases compare each with PHP. Not requested, and not part of this ruling: `get_object_vars`, which Story 16.1 ports as a package-internal accessor under DIV-12.2, and `get_class`, which is `fqcn()` (AD-10). Story 16.1 then ports `Type::enum` over `array_column`. Action item `epic-16-item-1-runtime-array-column-rawurldecode`.
