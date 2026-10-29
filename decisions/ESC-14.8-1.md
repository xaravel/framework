---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-28
escalation_sha256: "efb3233aadcfece4367609e8d73a4d03112cb15986d8fb77786705298ac3b2bb"
---

# ESC-14.8-1: approve scoped repairs, preserving the Epic-close gates

Under the standing ruling's "Decisions during a Story", approve the proposed
repair direction. Resolving inherited methods, mixin members and aliases in API
analysis must measure the actual public surface against the unchanged Upstream
surface. Genuine missing exports and mismatched signatures must still fail.
No assertion, expected value, skip, checklist check or gate may be weakened.
No new divergence, blanket citation, duplicate forwarding methods merely to
satisfy syntactic analysis, or Fidelity waiver is authorized.

The implementation is separate Infrastructure work, not an expansion of Story
14.8's component ownership. Its bounded scope is API-surface analysis and its
regression tests, genuine Collections signature/export repairs, and Reflection's
existing Collection dependency implementation and re-verification. Each component
must retain its own ownership and Expectations. Any citation must identify an
already applicable decision, and unresolved genuine findings remain failures.
The existing failing gate and pending XT-collections-16 acceptance are retained.
Source-installation evidence must continue to be described as such; published
package installation remains unproven until verified independently.

This decision resolves the protected-path question only. It creates no action
item and changes no manifest, architecture decision or implementation. The
Maintainer must provide the separate tracked Infrastructure route before these
cross-component changes can enter the unattended Story/action-item loop.

Story 14.8 remains blocked: ESC-14.8-2 still needs its Runtime contract and the
approved close-gate repairs have not been implemented. It must not be marked
done, nor may later epics start, on the strength of this approval alone.
