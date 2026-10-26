---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "1cc9f763e0dd5cc5f7ee566b23d49f3833adbe97db82920e526169d743976e99"
---

# ESC-14.1-5: approved, option 1, keyed generators and PHP's `Generator` come from the runtime

The Maintainer approved the orchestrator's recommended option on 2026-10-25, in the Maintainer's session, with the monitor's agreement. All four of Story 14.1's second-round Escalations were ruled together. The route is in `decisions/MAINT-2026-10-25-story-14-1-second.md`.

`decisions/DIV-12.md` gains **DIV-12.18**. `yield $v` stays `yield v`, with PHP's automatic integer keys. `yield $k => $v` becomes `yield keyed(k, v)`, and `yield from $iterable` becomes `yield* yieldFrom(iterable)`, which keeps the source's keys. The runtime adds PHP's `Generator` over a JS generator object. Its `[Symbol.iterator]` yields values and `entries()` yields pairs, as the 2026-10-25 iteration amendment rules. LazyCollection then ports line for line, and a user's generator function gives keys as in PHP. Option 2 would make `function* () { yield 1 }` an error, and option 3 would lose Upstream's keyed sources. The runtime half is action item `epic-14-item-2-runtime-generators-functions`.
