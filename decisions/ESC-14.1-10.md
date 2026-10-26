---
decision: approved
decided_by: Maintainer
date: 2026-10-26
escalation_sha256: "de4f844fc47c9695fdb7989cb9a7c8f839f6b34a5f8d0fbf1d146ec4f3bd08ff"
---

# ESC-14.1-10: approved, option 1, the runtime's `ReflectionMethod` gains `invoke`, `invokeArgs` and `setAccessible`

The Maintainer approved the orchestrator's recommended option on 2026-10-26, in the Maintainer's session, with the monitor's agreement. Both of Story 14.1's third-round Escalations were ruled together. The route is in `decisions/MAINT-2026-10-26-story-14-1-third.md`.

`ReflectionMethod` gains PHP's `invoke($object, ...$args)` and `invokeArgs($object, $args)`. Both call the method whatever its visibility, as PHP 8.1 and later do, on the object, or on the class for a static method. When the object is not an instance of the declaring class, they throw PHP's `ReflectionException`. `setAccessible()` is added as the no-op it has been since PHP 8.1. testGetArrayableItems then ports with no adaptation. Option 2 would have added a divergence that every later reflection test would need. This goes in action item `epic-14-item-3-runtime-type-tests-functions`.
