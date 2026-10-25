---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "e9dcf2817e38049d8f02a65889ccf115898b8b88fa17a04103cb8de1f917833c"
---

# ESC-13.1-5: approved, option 1, `lazy()` and `proxy()` are not ported

The Maintainer approved the orchestrator's recommended option on 2026-10-25, in the Maintainer's session. All six Story 13.1 Escalations were ruled together. The shared route is in `decisions/MAINT-2026-10-25-story-13-1.md`.

`decisions/DIV-12.md` gains **DIV-12.14**. PHP 8.4 lazy objects need a `Proxy`, which AD-7 allows only on `Model`, and Laravel's own source never calls the two helpers. `conformance/api-surface/exceptions.jsonl` lists both for the `reflection` component, citing DIV-12.14.
