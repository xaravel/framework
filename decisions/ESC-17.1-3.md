---
decision: approved
decided_by: monitor
date: 2026-10-31
escalation_sha256: "4617eef33cc3fe62199ec0484ca75b9347d000bd284ddcb02fef85ae28399534"
---

# ESC-17.1-3: approved, option 1 (the runtime supplies the PHP reflection surface the Container needs)

The monitor approved option 1 on 2026-10-31 as the second key, under the Maintainer's standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md`: PHP builtin classes and functions in `packages/runtime`, under PHP's names and with PHP 8.5.11 behaviour checked against PHP, with no DIV clause, expected value or grader change. The Maintainer was told in the Maintainer's session.

Action item `epic-17-item-1-runtime-container-reflection` (scope `packages/runtime`) adds:

- `ReflectionParameter`'s PHP constructor forms (a callable or `[class, method]` and a name or index), keeping its existing internal construction, with `isDefaultValueAvailable`, `getDefaultValue`, `isOptional`, `hasType`, `allowsNull` and its attribute readers;
- `ReflectionClass::getConstructor` and `isInstantiable`;
- `ReflectionProperty` with `getValue` for the properties the port represents;
- `call_user_func` and `spl_object_id`, sharing the runtime's callable resolution and object identity.

Each has XT-runtime cases against PHP, and existing exports and readers stay. The parameter readers for defaults and nullability read the declaration form ESC-17.1-2 settles, so the item waits in epic 17's `waiting_on_maintainer` until that ruling, whose PR takes it out.
