---
decision: approved
decided_by: Maintainer
date: 2026-10-31
escalation_sha256: "68d0e04c0ad3f5fe698d0a7e7608b7514c0a4692d18697dd994d15cb75dfdc09"
---

# ESC-16.1-5: approved, option 1 (ajv's `multipleOfPrecision` is validator configuration, not an adaptation)

The Maintainer approved option 1 on 2026-10-31, in the Maintainer's session, on the orchestrator's and the monitor's recommendation.

Row #37 of `TypeTest::validSchemasProvider` (`multipleOf(0.1)` with `0.3`) is valid in the Oracle's Opis 2.6.0 and invalid in exact-division ajv, because `0.3 / 0.1` is `2.9999999999999996` in IEEE-754. The Ported `TypeTest`'s `makeValidator` builds ajv with its documented `multipleOfPrecision: 12` option, and with `strict: false` as it already does. With those settings, all 172 dataset rows match the Oracle's Opis verdicts, and no invalid row becomes valid.

How the test's validator is configured is a setting of the validator that ESC-16.1-1 chose, not an adaptation of any row: the row, its assertion and its expected value stay as Upstream wrote them, with no `adapted` marker and no DIV clause. A future validator option needs the same proof: every dataset row still matches the Oracle. A row that still disagrees raises its own Escalation, as ESC-16.1-1 says.
