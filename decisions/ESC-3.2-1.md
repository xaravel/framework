---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-17
escalation_sha256: "0850baf50c5fe34c33eab33aaedcf9dffb3ad469416febfc5c245b8cdeba400b"
---

# ESC-3.2-1: approved, option 1 (findings file of known non-deterministic requests)

Story 3.2 is built as the Escalation's `proposed` text describes:

- Committed requests whose two evaluations differ are listed in `conformance/oracle/nondeterminism.jsonl`, one sorted line per request: `{"sha256","id","reason"}`, where `reason` names the random or time source (for example "Str::uuid() is random"). The first version lists the 23 requests in `_bmad-output/implementation-artifacts/spec-3-2-prototype/nondeterministic-requests.txt`.
- The batch still evaluates every committed request twice. A listed request gets no fixture; its Test ID stays an ordinary Ported Test asserting Upstream's own assertions.
- Any difference in a request that is not listed fails the job and opens an Escalation, as the AC says. A listed `sha256` that is no longer a committed request, or that gives identical outputs in both evaluations, also fails the run, so the file cannot go stale.
- Nothing is seeded or pinned: Upstream runs exactly as Upstream runs.

Rationale:

- **It follows the Maintainer's precedent.** `decisions/ESC-2.6-1.md` ruled the same way on baseline non-determinism: Upstream runs unseeded, only the listed findings are exempt, and any new difference still fails. Option 3 (seeding the Oracle) is the alternative that ruling rejected, because the expected values would no longer be what Laravel produces.
- **The exemption is exact.** It comes from running Upstream, request by request, so it keeps deterministic requests of the same bodies (for example `strlen(Str::random())`). Option 2's hand-written list of random sources could miss one and would drop those requests too.
- **It matches ESC-3.1-1.** That ruling intends a random body to give no usable Differential check. A listed request holds no expected value, so it is treated as non-Differential without reworking Story 3.1's extractor.
- **The grader is not weakened.** No assertion is removed, no expected value weakened, no skip added and no `adapted:` marker introduced. A random output has no stable expected value a fixture could hold, and the Ported Test keeps Upstream's assertions.
- **No planning document changes and no run-time cost.** The spine, the SPEC and `epics.md` stay as they are. Fixtures are generated once per Pin.

This ruling falls within the orchestrator's authority under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. It does not weaken the grader, add a divergence outside DIV-1..12, or move Xaravel away from a faithful port.
