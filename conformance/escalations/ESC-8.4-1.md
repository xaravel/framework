---
test_ids:
  - XT-conformance-157
trigger: open-question
proposed: >-
  Rule OQ-4 as: build the Carbon port on Bun's global `Temporal`
  (ZonedDateTime for every Carbon instance, Instant for epoch arithmetic,
  PlainDate/PlainDateTime for wall-clock and calendar arithmetic), with Intl
  only for English names and ordinal rules. The two gaps are the zone
  metadata Temporal does not expose, and both get the same approach:
  `format.I` (the DST flag) and `format.T` (the zone abbreviation) read the
  `isdst` bit and abbreviation of the IANA transition in effect from a
  generated, committed table. The table is never hand-written: it is
  generated from the tzdata release of the pinned Bun's ICU, and checked
  against the Oracle (PHP's `DateTimeZone::getTransitions()`) by a
  Differential Test, so it moves only with a Bun bump. The alternative,
  deriving `I` from the zone's offsets and `T` from Intl, is rejected:
  Intl's CLDR names are locale-dependent and differ from tzdata (IST shows
  as `GMT+5:30` in en-US), and an offset rule gets negative-DST zones such
  as Europe/Dublin wrong. No `deferred:` item, skip or divergence is
  proposed. Three needs only matched once the mapping reproduced Carbon
  exactly, and the port must keep those rules (see the body).
evidence: >-
  `bun run spikes:check` on Bun 1.4.3 (conformance/spikes/spikes.ts,
  conformance/spikes/REPORT.md, Oracle fixtures signed by the oracle.yml
  `story` job): `SPIKES OK: 63 covered, 2 gaps (of 65 needs); 7/7 bcrypt
  cases verify.` The gaps are `format.I` (Oracle `1`, `0`, `0`, `0`;
  Temporal: null, no DST flag in Temporal) and `format.T` (Oracle `EDT`,
  `GMT`, `IST`, `UTC`; Temporal via Intl `EDT`, `GMT`, `GMT+5:30`, `UTC`).
---

# ESC-8.4-1: OQ-4, build the Carbon port on Temporal

Covers PRD OQ-4 (FR-25), Story 8.4, XT-conformance-157.

The spike checks 65 Carbon needs. Each need's PHP expressions run in the Oracle (Carbon 3 at the Pin, PHP 8.5.11). Each need's Temporal mapping runs live on Bun 1.4.3, and may use only `Temporal`, `Intl` and plain arithmetic, with no expected value and no zone table of its own. Result: **63 covered, 2 gaps (of 65 needs)**. `conformance/spikes/REPORT.md` has every row.

| Group | Needs | Covered |
| --- | --- | --- |
| `tz`: timezone and DST (spring-forward gap, ambiguous fall-back, the 23-hour day, `setTimezone` to +05:30, `startOfDay` with no midnight) | 7 | 7 |
| `month`: overflow and clamping (`addMonth`, `subMonth`, `addYear` and their `NoOverflow` forms) | 6 | 6 |
| `bounds`: `startOf*` / `endOf*` from minute to year | 7 | 7 |
| `instant`: `U.u` round-trips, pre-epoch, `getTimestampMs`, `diffInMicroseconds` | 4 | 4 |
| `format`: the 38 PHP `date()` tokens on four samples | 38 | 36 |

## Gaps and the proposed approach

| Need | Oracle | Temporal | Approach |
| --- | --- | --- | --- |
| `format.I` | `1`, `0`, `0`, `0` | null (no DST flag in Temporal) | Read the `isdst` bit of the transition in effect from the generated tzdata table. |
| `format.T` | `EDT`, `GMT`, `IST`, `UTC` | `EDT`, `GMT`, `GMT+5:30`, `UTC` (Intl, en-US) | Read the abbreviation of the transition in effect from the same table. Intl is not used. |

The table holds, per zone, the transitions' instants, `isdst` bits and abbreviations. It is generated from the tzdata release bundled with the pinned Bun's ICU, so its offsets agree with Temporal's. A Differential Test checks it against PHP's `DateTimeZone::getTransitions()` in the Oracle. Neither need has a Temporal API, and neither can be derived from Intl or from offsets without being wrong for some zones. This is the only zone data the port would carry.

## Rules the port must keep

These needs matched the Oracle only after the mapping was corrected to Carbon's exact behaviour:

- `instant.getTimestampMs`: Carbon reads the milliseconds from the digits of `format('Uu')`, so before the epoch it gives `-1250` for -0.75 s, where the instant's own epoch milliseconds would be `-750`.
- `format.p`: PHP prints `Z` only when the zone's abbreviation is UTC, not for every zero offset. Europe/London in winter prints `+00:00`.
- `bounds.week`: Carbon's week starts on its locale's first day. Its `en` locale says Monday, not CLDR en-US's Sunday.

Everything else maps directly onto Temporal: exact-time `add({hours})` across both DST transitions, `compatible` disambiguation for parse and `addDay` into the gap, `until({largestUnit})` for the diffs, `startOfDay()`, and nanosecond `Instant`s. Month overflow (`addMonth` from Jan 31 landing on Mar 3) is expressible as day 1, plus n months, plus (day − 1) days. Temporal's own `add({months})` gives the `NoOverflow` forms.

The ruling belongs to the Maintainer, who writes `decisions/OQ-4.md`. This Escalation stays open until then.
