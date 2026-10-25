---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "3aad4e7d62717a57851c6924634ca39fd51f76d93416029cca5292f6749cae94"
---

# ESC-13.1-8: approved, option 1, a backed enum records its backing type, and the runtime gains `ReflectionEnum`

The Maintainer gave this ruling on 2026-10-25 in the Maintainer's session. Story 13.1's ESC-13.1-7 to ESC-13.1-10 were ruled together. The shared route is in `decisions/MAINT-2026-10-25-story-13-1-second.md`.

The spine's AD-26 enum row now says a backed enum also declares `static backingType`, `'string'` or `'int'`, and generators emit it from Upstream. `@xaravel/runtime/php` gains `ReflectionEnum` (`isBacked()`, and `getBackingType()` as a `ReflectionNamedType`) and `enum_exists`. `isParameterBackedEnumWithStringBackingType` then ports line for line, which routing's implicit enum binding needs.
