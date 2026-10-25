---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportReflectorTest::testGetClassAttributes"
trigger: contract
proposed: >-
  Option 1 (recommended): keep `Reflector::getClassAttributes` throwing
  `BlockedByComponentError("collections")` until Collections (Epic 14)
  lands, and let testGetClassAttributes stay `skip` / `not-ported-yet`
  under this Escalation. Epic 14's Collections Story (or its
  re-verification Story) then names testGetClassAttributes with
  `component: reflection`, replaces the throw with Upstream's
  `new Collection(...)` code, and ports the test, whose body is
  Upstream's line for line. Option 2: add `collections` as a valid
  `blocked-by` blocker for a Phase 1 Component whose Upstream test needs a
  Phase 1 Component built in a later Epic (a change to
  `tools/expectations/reasons.ts`, a Protected Path, so it needs a
  Maintainer-approved Infrastructure change). The test is then ported
  now, with a case whose `setUp` throws `BlockedByComponentError
  ("collections")`, as the spec planned. Option 3: reorder the Epics so
  Collections is built before Reflection; Upstream's
  `illuminate/reflection` `require`s `illuminate/collections`, so the
  dependency already points that way.
evidence: >-
  The Story's spec (Design Notes, Classification) classifies
  testGetClassAttributes as `skip` / `blocked-by:collections`, since
  `getClassAttributes` returns a `Collection` (Upstream
  framework/src/Illuminate/Reflection/Reflector.php:83-98) and the test
  reads it through `toArray()`, `->map->string`, `flatten()`, `->sum`,
  `keys()` and `all()`
  (framework/tests/Support/SupportReflectorTest.php:75-118).
  `bun run expectations:reasons` rejects that line: "blocked-by:
  collections is in Phase 1, not later than reflection's Phase 1".
  tools/expectations/reasons.ts:17-18 and 250-258 accept `blocked-by:<c>`
  only when `<c>`'s `phase` in tools/scaffold/packages.jsonl is greater
  than the line's Component's; both `collections` and `reflection` are
  Phase 1. A ported test whose case throws `BlockedByComponentError`
  under a `not-ported-yet` line is a harness difference
  (`expected=skip:not-ported-yet actual=blocked-by:collections`), so the
  test is left undeclared. `packages/collections/src/index.ts` is still
  `export {}`, and a Collection stand-in is ruled out (F-8).
---

# ESC-13.1-10: `blocked-by:collections` is not a valid Skip Reason inside Phase 1

testGetClassAttributes needs a real `Collection`, which Epic 14 builds. The spec planned it as `blocked-by:collections`, but Collections and Reflection are both Phase 1 Components, and the Skip Reason rules accept a `blocked-by` blocker only from a later Phase. Option 1 keeps the test `not-ported-yet` until Epic 14 ports it. Option 2 widens the `blocked-by` rule. Option 3 builds Collections first. Work on testGetClassAttributes stops here; `getClassAttribute`, which builds the same lists as plain arrays, is ported and passes.
