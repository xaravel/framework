---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-29
escalation_sha256: "b4a62b7e622b64cf2eeb83488435fd7840d9281f904a5f2138395a8519f7622f"
---

# ESC-15.1-3: approved, option 1 (`config` gets its consequence row before Story 15.1)

Option 1 is approved and built in this ruling's PR, as `decisions/MAINT-2026-10-22-consequence-rows.md` requires ("Later Components get their rows the same way, each in an Infrastructure change before the Component's first Story with Xaravel Tests").

## The change

- **Row.** `CONSEQUENCE_SOURCES` in `tools/xt-coverage/consequences.ts` gains `config: { frs: [20], ads: [2, 6] }`. Epic 15 declares "Covers: FR-20, through the Repository and the env parser". FR-20 has a `**Consequences (testable):**` list, and every package takes AD-2 and AD-6.
- **Generated file.** `conformance/xaravel-consequences/config.jsonl`, 26 consequences (FR-20.1..3, AD-2.1..10, AD-6.1..13), from `bun run xt:consequences`.
- **Test.** XT-conformance-126 derives the `config` row from Epic 15's Covers line, as #446 did for collections, and expects the eighth file.
- **Docs.** `docs/ops/done-check.md` names the row.

## Citing another Component's ids

The Escalation asks whether an XT in `packages/config` may cite consequence ids that are another Component's, such as runtime's AD-5.5 and AD-10.7. It may. `tools/xt-coverage/coverage.ts` counts a consequence as covered when any passing Xaravel Test, in any Component's directory, declares it. So XT-config-1 citing `AD-5.5` counts toward `runtime.jsonl`. Under `bun run xt:coverage config` the same citation prints a `declares <id>, which is not in conformance/xaravel-consequences/config.jsonl` warning and leaves the exit code unchanged. An XT should also declare the `config.jsonl` ids it does test, when there are any.

## Rationale

- **It is the Maintainer's rule, applied mechanically.** The row is what the Epic declares plus AD-2 and AD-6, the same derivation XT-conformance-126 checks for Epics 10 to 14.
- **It is outside the classes the orchestrator may not rule on.** It adds assertions to XT-conformance-126 and removes none. It weakens no expected value, adds no skip, `adapted:` marker or divergence, and changes nothing at run time. The precedent for a Protected tool change ruled and built by the orchestrator in its planning PR is ESC-10.5-2.

This ruling clears XT-config-1 and XT-config-2 of ESC-15.1-3.
