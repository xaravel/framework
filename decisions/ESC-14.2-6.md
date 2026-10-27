---
decision: approved
decided_by: monitor
date: 2026-10-26
escalation_sha256: "625abd45f96f40bf889c60c1a9bb7270243fcccd14363df11597fa7847e646ba"
---

# ESC-14.2-6: approved, option 1, the runtime exports PHP's `UnhandledMatchError`

The monitor approved the orchestrator's recommended option on 2026-10-26 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md`. The Escalation meets every condition of that rule:

- it is a `contract` Escalation;
- it adds a PHP builtin class to `packages/runtime` only, under its PHP name and with PHP's behaviour, with XT-runtime cases;
- it adds no DIV clause, changes no expected value, and touches no grader file.

The Maintainer was told in the Maintainer's session.

`@xaravel/runtime/php` exports `UnhandledMatchError`. It extends `Error`, is registered under its PHP name, and has PHP's message: `Unhandled match case ` followed by the subject as PHP renders it, or `Unhandled match case of type <type>` for an array or object. `Collection::sortBy` / `sortByMany` and `LazyCollection::sortBy` then port in full, and `match ($descending)` throws for a value that is neither a boolean nor a `SortDirection` case, as PHP's does. Option 2 would have been a silent divergence and a partial implementation. This goes in action item `epic-14-item-7-runtime-match-error-dynamic-call`.
