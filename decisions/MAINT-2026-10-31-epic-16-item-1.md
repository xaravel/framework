---
decision: approved
decided_by: monitor
date: 2026-10-31
scope: Epic 16 retrospective item 1 (`epic-16-retro-item-1-callstatic-and-ref-utf8`)
---

# Ruling: Epic 16 retrospective item 1, string-keyed `__callStatic` arguments

The item (#599) asks that `JsonSchema.__callStatic` with a non-list `args` behave as PHP. The PHP 8.5.11 probe shows a string-keyed `args` is PHP's named arguments: `{a: 1}` throws `Error: Unknown named parameter $a`, and `{properties: …}` binds `object()`'s parameter. A JS parameter cannot be bound by name, so the runtime's `callUnpacked` throws its documented `TypeError` (ESC-14.5-3).

The orchestrator recommended amending DIV-9.15 so the Xaravel Test may assert that `TypeError` beside PHP's record. That is a recommendation to throw a JS `TypeError` in place of PHP's behaviour, which the Maintainer's standing rule of 2026-10-25 lets the monitor take without asking: the clause and this decision are still written, and the Maintainer is told. The monitor approved it on 2026-10-31.

- **DIV-9.15** is amended: at a runtime call site that spreads a PHP array into a call (such as a `__callStatic` delegator whose target has no options form), a string key throws `callUnpacked`'s `TypeError` where PHP binds a named argument or throws `Error: Unknown named parameter`; an Xaravel Test asserts that `TypeError` beside PHP's recorded result, marked DIV-9.15. Integer-keyed arguments behave as PHP's.
- Item 1 leaves epic 16's `waiting_on_maintainer` and resumes from its saved patch (`retro-16-item-1-callstatic-attempt.patch`), with XT-json-schema-4's two string-keyed rows asserting the `TypeError` under DIV-9.15, and its Fidelity Review re-run.
