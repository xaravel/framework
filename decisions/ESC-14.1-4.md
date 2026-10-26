---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "b7dd9b008bf5c180ed15bb64fe5e0e84d072bf9efceeb5f7910d313ba1d66de5"
---

# ESC-14.1-4: approved, option 1, collection index writes, `isset` and `unset` become the `offset*` calls

The Maintainer approved the orchestrator's recommended option on 2026-10-25, in the Maintainer's session, with the monitor's agreement. All four Story 14.1 Escalations were ruled together. The route is in `decisions/MAINT-2026-10-25-story-14-1.md`.

`decisions/DIV-12.md` gains **DIV-12.17**, beside DIV-12.6's reads. `$c[k] = v` becomes `offsetSet(k, v)`, `$c[] = v` becomes `offsetSet(null, v)`, `isset($c[k])` becomes `offsetExists(k)`, and `unset($c[k])` becomes `offsetUnset(k)`, each marked, with assertions unchanged. Option 2 would have removed assertions.
