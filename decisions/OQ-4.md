---
decision: temporal
decided_by: Maintainer
date: 2026-10-20
source: conformance/escalations/ESC-8.4-1.md
---

# OQ-4: the Carbon port is built on Temporal

The spike (Story 8.4) covered 63 of Carbon's 65 measured needs on Bun 1.4.3's `Temporal`. The port uses `ZonedDateTime` for every Carbon instance, `Instant` for epoch arithmetic, and `PlainDate` / `PlainDateTime` for wall-clock and calendar arithmetic, with `Intl` only for English names and ordinal rules.

**The two gaps.** `format.I` (the DST flag) and `format.T` (the zone abbreviation), and `format.p`'s UTC test, read the `isdst` bit and abbreviation of the transition in effect from a generated, committed tzdata table. The table is generated from the IANA tzdata release that matches the pinned Bun's ICU data, so it agrees with Temporal's offsets; the release is recorded beside it. It is never hand-written, a Differential Test checks it against PHP's `DateTimeZone::getTransitions()` in the Oracle, and it moves only with a Bun or Pin bump. Deriving the abbreviation from `Intl` is rejected: its CLDR names differ from tzdata (IST shows as `GMT+5:30` in en-US).

**Rules the port keeps,** because the spike matched Carbon only with them:
- `getTimestampMs` reads the milliseconds from the digits of `format('Uu')`, so before the epoch -0.75 s gives `-1250`.
- `format.p` prints `Z` only when the zone's abbreviation is UTC, not for every zero offset.
- Carbon's week starts on its `en` locale's first day, Monday.

**Not covered by the spike,** so the port's own Differential Tests must cover them: float `diffIn*` results, `diffInDays` / `diffInMonths` across DST transitions and month ends, `createFromTimestamp` with a zone, `now()` and `setTestNow`, years outside 1969–2027 for `X`, `x`, `Y` and `y`, and ordinal suffixes beyond the sampled days.
