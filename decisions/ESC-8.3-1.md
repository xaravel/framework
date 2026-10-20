---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-20
escalation_sha256: "b2a6a7cd31325119def30f72f199416ecf8f8f24723c69a151c05a63b5fd4c59"
---

# ESC-8.3-1: approved, the AD-5 bind/snapshot workaround

`@xaravel/runtime/scope` wraps async-generator response bodies and `type: "direct"` stream bodies created inside a frame with `AsyncLocalStorage.snapshot()` / `AsyncLocalStorage.bind`. For an async generator the snapshot wraps each `next()` and `return()` of the iterator; for a direct stream, `pull` is bound. The probes `als.async-generator` and `als.direct-stream` stay recorded `unsupported`, so a Bun bump that fixes them fails `probes:check` and reopens the question.

Rationale:

- **AD-5 already decides this workaround.** Its Primitive rule wraps stream bodies, async-generator bodies, `type: "direct"` streams and timers with `AsyncLocalStorage.bind` / `snapshot` "because Bun 1.4.3 drops the store in those cases". The probes confirm the two cases PRD OQ-11 names, and that the workaround restores the frame on Bun 1.4.3.
- **The grader is not weakened.** No assertion, expected value, skip or `adapted:` marker changes.
- **No new divergence and no planning change.** Nothing outside DIV-1..12 is added; the spine and PRD stay as they are.
- **No run-time cost beyond what AD-5 fixes.** The wrapping is the one AD-5 already requires on these bodies.

This ruling falls within the orchestrator's authority under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. The Maintainer may overrule it; the status issue reports it.
