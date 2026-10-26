---
decision: approved
decided_by: monitor
date: 2026-10-26
escalation_sha256: "2f469995bac94f6cf256246fc0c58c0f47f18673ccabd68e0e1e0859985e2f1c"
---

# ESC-14.2-4: approved, option 1, the runtime exports `is_null`, `uasort` and PHP's string comparisons

The monitor approved the orchestrator's recommended option on 2026-10-26 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md`. The Escalation meets every condition of that rule:

- it is a `contract` Escalation;
- it adds PHP builtins to `packages/runtime` only, under their PHP names and with PHP's behaviour, with XT-runtime cases;
- it adds no DIV clause, changes no expected value, and touches no grader file.

The Maintainer was told in the Maintainer's session.

`@xaravel/runtime/php` exports the following:

- `is_null`;
- `uasort` over a `Ref<T>` (AD-9, DIV-9.2), which keeps keys and reads the user comparator's result as PHP reads it;
- the string comparisons `strcmp`, `strcasecmp`, `strnatcmp`, `strnatcasecmp` and `strcoll`, the last in the C locale. The runtime already implements these privately for `asort` / `arsort`, so the exports reuse those implementations, and no second copy is written.

The twelve Test IDs then port as Upstream wrote them. `Collection::sortBy` / `sortByMany` and `LazyCollection::sortBy` port in full, and the fixture `TestAccessorEloquentTestStub` keeps Upstream's `! is_null(...)`.

Option 2 would have rewritten test bodies with no PORTING.md row or DIV clause to cover it, and it would have moved a Test ID to another Story's manifest.

This is action item `epic-14-item-6-runtime-sort-string-functions`. ESC-14.2-5, the Fidelity Review's F-4 evidence, is not part of this ruling. The orchestrator rules on it itself, under the 2026-10-21 amendment to `decisions/MAINT-2026-10-16-unattended-orchestrator.md`.
