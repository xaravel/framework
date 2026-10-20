---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-20
escalation_sha256: "1bbdfb9797328e49b79b2823de0db5c1da128acc8df7e11b3e7274a9ee5324b5"
---

# ESC-8.3-1: approved, the AD-5 bind/snapshot workaround

`@xaravel/runtime/scope` wraps async-generator response bodies and `type: "direct"` stream bodies created inside a frame with `AsyncLocalStorage.snapshot()` / `AsyncLocalStorage.bind`. For an async generator the snapshot wraps each `next()`, `return()` and `throw()` of the iterator; for a direct stream, `pull` is bound. The probes `als.async-generator` and `als.direct-stream` stay recorded `unsupported`, so a Bun bump that fixes them fails `probes:check` and reopens the question.

Rationale:

- **AD-5 already decides this workaround.** Its Primitive rule wraps stream bodies, async-generator bodies, `type: "direct"` streams and timers with `AsyncLocalStorage.bind` / `snapshot` "because Bun 1.4.3 drops the store in those cases". The probes confirm the two cases PRD OQ-11 names, and that the workaround restores the frame on Bun 1.4.3.
- **The grader is not weakened.** No assertion, expected value, skip or `adapted:` marker changes.
- **No new divergence and no planning change.** Nothing outside DIV-1..12 is added; the spine and PRD stay as they are.
- **No run-time cost beyond what AD-5 fixes.** The wrapping is the one AD-5 already requires on these bodies.

This ruling falls within the orchestrator's authority under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. The Maintainer may overrule it; the status issue reports it.
