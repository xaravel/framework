---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-28
escalation_sha256: "df8024f27ae79c1492015ed328634035b78045927f197dcc292556713b8b81f0"
---

# ESC-14.8-2: approve the faithful Runtime array_sum contract

Under the standing ruling's "Decisions during a Story", approve the proposed
direction: publish PHP's `array_sum` through a separate scoped Runtime
Infrastructure unit, with PHP behavior verified against the pinned Oracle.
The implementation belongs in `packages/runtime`, under its PHP name and the
existing runtime value model. Existing exports and unrelated behavior stay intact.
No assertion, expected value, skip, divergence or grader rule changes are authorized.

After that implementation lands, Story 14.8 may import the real export and
register the complete retained `testFlatMapIsLazy` port, preserving both canonical
assertions and their zero and three enumeration counts. A callback that should
not execute still requires a real contract: no local substitute, declaration-only
export or partial port is authorized.

This decision resolves the contract direction only. It creates no action item
and does not expand Story 14.8's component ownership. The Maintainer must provide
the separate tracked Runtime Infrastructure route before that implementation
can enter the unattended Story/action-item loop.

Story 14.8 remains blocked until the Runtime contract exists and the independent
Epic-close repairs approved in `decisions/ESC-14.8-1.md` are implemented through
their own tracked Infrastructure route. Its sprint status and retained tests
remain unchanged; later epics must not start on the strength of this approval.
