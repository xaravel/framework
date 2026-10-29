---
decision: approved
decided_by: Maintainer
date: 2026-10-29
scope: Collections' API-surface gate (ESC-14.8-1, epic-14-item-18, epic-14-item-19)
---

# Ruling: Collections' API-surface gate, the last lines

After #531 and #533, `api-surface:gate collections` had 45 unexplained lines, and item 18's #529 waited on the Maintainer. The Maintainer ruled on all four on 2026-10-29, in the Maintainer's session, on the monitor's recommendations.

| Question | Ruling |
|---|---|
| Extra members (E1, E2: 27 lines) | Spine AD-15 lets an extra member be cited in `additions.jsonl` with an FR or a DIV. XT-conformance-82, which still required that file to be empty, now holds it to the same rule as `exceptions.jsonl`: lines only from Maintainer rulings, and each DIV clause cited must be declared. The 27 lines cite DIV-1.2 (the eight async companions on `Collection`, `LazyCollection` and `Enumerable`) and DIV-12.18 (`entries()`). |
| U1: `func_get_args()` rest parameters (17 lines) | New clause DIV-12.21 and a PORTING.md rule: arguments Upstream reads with `func_get_args()` become a trailing rest parameter after the declared ones. The 17 lines in `exceptions.jsonl` cite DIV-12.21. |
| U2: `Enumerable::reduceWithKeys` (1 line) | Removed from the `Enumerable` interface to match Upstream. XT-collections-11 calls it through `Collection`. This is part of `epic-14-item-19-collections-api-surface-findings`, which leaves `waiting_on_maintainer`, in scope `packages/collections`. |
| #529, item 18 (Reflection `getClassAttributes`) | Merged with `--admin` despite its expected `ownership` failure on Reflection's own Expectations line. Item 18 leaves `waiting_on_maintainer`. |

With U2 done, Collections' gate is expected to report zero unexplained lines, and Story 14.8 can activate XT-collections-16.
