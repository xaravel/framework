---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "0c0b7f892d24deec59a4dfe4f148d62bfc681aafacb3e35a272fa0af18acca03"
---

# ESC-13.1-1: approved, option 1, PHP reflection classes over `inject` metadata, with `self` / `parent` markers

The Maintainer approved the orchestrator's recommended option on 2026-10-25, in the Maintainer's session. All six Story 13.1 Escalations were ruled together. The shared route is in `decisions/MAINT-2026-10-25-story-13-1.md`.

`decisions/DIV-3.md` gains **DIV-3.2**. `@xaravel/runtime/php` defines the minimal reflection classes that `Reflector`, `ReflectsClosures` and their tests call. They read parameters from `inject` metadata, and the `self` / `parent` Spec markers stand for PHP's relative hints. Option 2 would have made every later Component build parameter descriptors by hand.
