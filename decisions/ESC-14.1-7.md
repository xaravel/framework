---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "02a9180c00f7b4833ce10aa28ff29186c6875db48ae7829e951d55e004e2f9dc"
---

# ESC-14.1-7: approved, option 1, a class-name dataset value used as a value is written `fqcn(c)`

The Maintainer approved the orchestrator's recommended option on 2026-10-25, in the Maintainer's session, with the monitor's agreement. All four of Story 14.1's second-round Escalations were ruled together. The route is in `decisions/MAINT-2026-10-25-story-14-1-second.md`.

`decisions/DIV-12.md` gains **DIV-12.19**. PORTING.md's data-provider rule still turns a row of class names into constructors. Where Upstream uses that parameter as a value rather than as a class, the port writes `fqcn(c)`, the class-name string PHP holds. testEnsureForObjects then expects `'string'`, as Upstream does, and no expected value changes. Option 2 would have changed an expected value. Both rows stay `blocked-by:support` until `class_basename` lands, and port under this clause then.
