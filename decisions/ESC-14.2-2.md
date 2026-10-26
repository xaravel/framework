---
decision: approved
decided_by: Maintainer
date: 2026-10-26
escalation_sha256: "ce449d8772383049b5fbc4fd58b579207b534faf4e93edd283579228afe14f0f"
---

# ESC-14.2-2: approved, option 1, spreading an integer-keyed PHP array into a call is written `...array_values(a)` (DIV-9.15)

The Maintainer approved the orchestrator's recommended option on 2026-10-26, in the Maintainer's session, with the monitor's agreement. The route is in `decisions/MAINT-2026-10-26-story-14-2.md`.

`decisions/DIV-9.md` gains **DIV-9.15**. PHP spreads an integer-keyed array positionally, by value, and ignores its keys. The ported literal is a `PhpArray`, whose iterator yields `[key, value]` pairs. So a Ported Test writes `...array_values(a)` where `a` is a `PhpArray` with integer keys, marked with this clause, and the expected values are unchanged. A string-keyed spread, which PHP passes as named arguments, stays untranslatable. PORTING.md's spread row says so. Option 2 would have changed `PhpArray` iteration, which every Component since Epic 9 reads.
