---
decision: approved
decided_by: Maintainer
date: 2026-10-26
scope: Story 14.1 (Enumerable core), ESC-14.1-9 and ESC-14.1-10
---

# Maintainer ruling: Story 14.1, third round

The Maintainer gave this ruling on 2026-10-26 in the Maintainer's session. It approves the orchestrator's recommended option on both of Story 14.1's third-round Escalations (#460), with the monitor's agreement. The earlier rounds are `decisions/MAINT-2026-10-25-story-14-1.md` and `decisions/MAINT-2026-10-25-story-14-1-second.md`.

| Escalation | Option | What it adds |
|---|---|---|
| ESC-14.1-9 | 1 | The runtime exports PHP's type tests, the `UnitEnum` / `BackedEnum` / `Closure` / `ArrayAccess` / `Generator` `instanceof` targets, the array and string functions Collections still calls, and the `get_debug_type` / `json_last_error` names |
| ESC-14.1-10 | 1 | The runtime's `ReflectionMethod` gains `invoke`, `invokeArgs` and the no-op `setAccessible` |

## The route

1. **Infrastructure first.** Action item `epic-14-item-3-runtime-type-tests-functions` builds both, as one Maintainer-approved Infrastructure change.
   - **Scope:** `packages/runtime` and `packages/contracts`, as for `epic-14-item-1` and `epic-14-item-2`. `packages/contracts` is touched only if a token needs it.
   - **What it builds:** every export named in `decisions/ESC-14.1-9.md` and `decisions/ESC-14.1-10.md`, under its PHP name and with PHP's behaviour.
   - **Tests:** XT-runtime cases for each export, against PHP's results, as the item-2 probe does.
   - **Limits:** no other runtime behaviour changes. The existing `getDebugType` and `jsonLastError` exports stay. The runtime does not import contracts (AD-2).
   - The loop takes action items before Stories, so this lands first.
2. **Then Story 14.1.** It resumes and ports its Test IDs, including `data_get` in full. No assertion is removed or weakened.

## Next time

The Maintainer also made a standing rule for this class of Escalation, `decisions/MAINT-2026-10-26-runtime-builtins.md`. A later "the runtime lacks a PHP builtin" Escalation is approved by the monitor and does not wait on the Maintainer.
