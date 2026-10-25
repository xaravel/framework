---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "4a274773745242a88aad803f2cbd2d46a44108c8cc47c8e32a1f3e9b266529bd"
---

# ESC-13.1-2: approved, option 1, `primitive`, `variadic(...)` and an explicit throw for an undeclared closure

The Maintainer approved the orchestrator's recommended option on 2026-10-25, in the Maintainer's session. All six Story 13.1 Escalations were ruled together. The shared route is in `decisions/MAINT-2026-10-25-story-13-1.md`.

`decisions/DIV-3.md` gains **DIV-3.3**. An untyped parameter is declared `primitive` and a variadic one `variadic(<Spec>)`. A closure with no `inject` throws a `RuntimeException` naming the form, as Story 13.1's XT-reflection-2 criterion asks. `primitive`, `variadic` and `oneOf` are defined in `@xaravel/runtime` now (`epics.md` already lists `primitive` and `oneOf` among its Spec values), and Container re-exports them. Option 2 (reading function source text) is not a stable contract.
