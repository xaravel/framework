---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "1c787b0305c1d465816eb4c4d5d73ac647ea9eaf4a669a136c39246d91f97919"
---

# ESC-12.1-2: approved, option 1, `BlockedByComponentError` lands in `@xaravel/runtime` now

The Maintainer gave this ruling on 2026-10-25 in the Maintainer's session. Every Story whose tests touch a Component from a later Phase needs a `blocked-by:<c>` line. That line can match only a `BlockedByComponentError`, so the class is added now, not left for Story 17.2.

## The change

- **The class.** `BlockedByComponentError` is defined in `@xaravel/runtime`, in the form `decisions/ESC-5.3-1.md` fixes:
  - it is registered as a framework class;
  - its `name` is `BlockedByComponentError`;
  - its message starts `BlockedByComponentError(<c>)`, where `<c>` is the owning Component's package name from the component map.
- **Who builds it.** This ruling approves it as an Infrastructure change. The orchestrator builds it as action item `epic-12-item-1-blocked-by-component-error` (in `sprint-status.yaml`), with an XT-runtime test of the class's name, registration and message form. No other runtime behaviour changes.
- **Story 17.2.** It no longer defines the class. It raises it, for descriptors whose service belongs to a Component that isn't installed. `epics.md` Story 17.2 is updated to say so.

## The route

Once the action item is on `main`, Story 12.1 ports `ConditionableTest::testWhen` and `::testUnless` throwing `BlockedByComponentError(database)` from `setUp`, and their Expectations lines become `skip` / `blocked-by:database`. The action item comes first, because the loop takes action items before Stories.
