---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "2b5a37dea13f27facf9969f07e0174d2058501e000d42dc7d8127ab310f6b316"
---

# ESC-14.1-2: approved, option 1, the runtime adds the PHP built-in types Collections uses

The Maintainer approved the orchestrator's recommended option on 2026-10-25, in the Maintainer's session, with the monitor's agreement. All four Story 14.1 Escalations were ruled together. The route is in `decisions/MAINT-2026-10-25-story-14-1.md`.

`@xaravel/runtime` adds the following, registered under their PHP names as Story 9.10's SPL exceptions are:

- the interfaces `Traversable`, `Iterator`, `IteratorAggregate`, `JsonSerializable`, `Stringable` and `Throwable`, as contract tokens, so `instanceof`, `hasBrand` and the class lookup resolve them;
- `jsonEncode`'s `Symbol.for('JsonSerializable')` hook, as the `JsonSerializable` token's brand;
- the classes `ArrayIterator` (with `getArrayCopy()`), `ArrayObject` and `CachingIterator` (with `CALL_TOSTRING` and `hasNext()`);
- a PHP `WeakMap` with object keys that iterates in insertion order.

The runtime's `Error` and `Exception` then satisfy `Throwable`. PORTING.md already says `ArrayObject` and `JsonSerializable` come from the runtime. This is action item `epic-14-item-1-runtime-php-types`.
