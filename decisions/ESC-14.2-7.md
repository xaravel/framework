---
decision: approved
decided_by: Maintainer
date: 2026-10-26
escalation_sha256: "e674544a4aec2ef8be0e541dd75dadb000b26e23384db4391be1ae433f255593"
---

# ESC-14.2-7: approved, option 1, the runtime gives PHP's dynamic method call as `callMethod`

The Maintainer approved the orchestrator's recommended option on 2026-10-26, in the Maintainer's session, with the monitor's agreement.

`@xaravel/runtime/php` exports `callMethod(object, name, ...args)`, PHP's `$object->$name(...$args)`:

- It resolves `name` as PHP does: exactly first, then case-insensitively over the object's methods. That is the lookup the runtime's `method_exists` already makes.
- If no method matches, it falls back to the object's `__call` port.
- Otherwise it throws PHP's `Error`, `Call to undefined method <class>::<name>()`.

PORTING.md's idiom table gains the row for `$o->$name(...)`. The fixture `TestAccessorEloquentTestStub` then calls `$this->$accessor()` through the helper, as Upstream wrote it.

Options 2 and 3 would have rewritten Upstream's fixture code, with no PORTING.md row or DIV clause to cover it.

The same day, the Maintainer widened the runtime-builtins standing rule to helpers of this kind (`decisions/MAINT-2026-10-26-runtime-builtins.md`, amendment 2026-10-26). This ruling goes in action item `epic-14-item-7-runtime-match-error-dynamic-call`.
