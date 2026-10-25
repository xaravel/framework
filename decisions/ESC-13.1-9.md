---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "093d39e5f4a207a5c3d0521a3e67eef812d0664782f193666443dcd4bfe8a382"
---

# ESC-13.1-9: approved, option 1, `assertInstanceOf` / `assertNotInstanceOf` accept a class-string

The Maintainer gave this ruling on 2026-10-25 in the Maintainer's session. Story 13.1's ESC-13.1-7 to ESC-13.1-10 were ruled together. The shared route is in `decisions/MAINT-2026-10-25-story-13-1-second.md`.

`@xaravel/assert` resolves a class-string `classOrInterface` through the Class Registry (`resolveClass`), and the token table of ESC-13.1-7 for an interface. It throws `UnknownClassOrInterfaceException` only when the name does not resolve, as PHPUnit does for an unknown class. The grader becomes more faithful to PHPUnit, not weaker: no assertion that passed before now fails, and a class-string that named nothing still throws. testItReturnsTheFirstParameterType then ports unchanged.
