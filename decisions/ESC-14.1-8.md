---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "1d540ba50e3a2ccea3234abf3550bb511fade4ca9384d210b14dfa636a6790e2"
---

# ESC-14.1-8: approved, option 1, DIV-12.17 covers every `ArrayAccess` object and is recorded when a test uses reads too

The Maintainer approved the orchestrator's recommended option on 2026-10-25, in the Maintainer's session, with the monitor's agreement. All four of Story 14.1's second-round Escalations were ruled together. The route is in `decisions/MAINT-2026-10-25-story-14-1-second.md`.

`decisions/DIV-12.md`'s **DIV-12.17** is amended. (a) It covers every PHP `ArrayAccess` object, not only Collection, so `$map[$object] = 3` on the runtime's `WeakMap`, `ArrayObject` or `ArrayIterator` becomes `map.offsetSet(object, 3)`. (b) A test that uses DIV-12.6's index reads together with writes, `isset` or `unset` records DIV-12.17 on its Expectations line, because DIV-12.17 includes the reads. Each changed source line keeps its own clause's marker. Option 2 would have changed the Expectations format and its Protected tooling.
