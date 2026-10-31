---
decision: approved
decided_by: Maintainer
date: 2026-10-31
escalation_sha256: "7c61efb059f6539cf8bc26b24fd8d3456c25b3b77f04bdbe9e87328143dae199"
---

# ESC-16.2-1: approved, option 1 (no divergence: the one schema Upstream does not round-trip is checked against Upstream's bytes)

The Maintainer approved option 1 on 2026-10-31, in the Maintainer's session, on the orchestrator's and the monitor's recommendation.

The port's round trip equals Upstream's, byte for byte, on all 176 schemas Story 16.1's tests build. For 175 the round trip is the identity. The exception is `{"type":["string"]}`, a one-member union: Upstream's own `Deserializer::resolveType` collapses a one-name `type` array to that name, so the second serialization is `{"type":"string"}`, in Upstream as in the port.

This is no divergence. XT-json-schema-2 checks every schema against Upstream's round-trip bytes (`round-trip.probe.php` on PHP 8.5.11), and checks the identity `serialize(fromArray(serialize(s))) === serialize(s)` for every schema whose Upstream round trip is the identity. The one schema listed here is checked against Upstream's bytes only. That meets Story 16.2's acceptance criterion ("any schema produced in Story 16.1's tests"), because the port behaves exactly as Upstream. The test fails if any other schema stops round-tripping without being listed. No DIV clause, and no change to Story 16.1's tests.
