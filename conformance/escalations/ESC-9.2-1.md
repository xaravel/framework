---
test_ids:
  - XT-runtime-7
trigger: protected-path
proposed: >-
  Option 1 (recommended): rule that the grader's `run('test', inner)`, which
  is `runInFrame`, may return a promise other than `inner`'s own, settling
  with `inner`'s value only after the test frame's defer list drains
  (AD-5.9), as ESC-4.2-1 item (2) ("`portedTest` calls it as `run('test',
  inner)` and awaits its result") already allows. Record it where the
  Fidelity Review sees it: add the citation (`decisions/ESC-4.2-1.md` item
  (2), AD-5.9) to `stories/9.2.md` (Protected), or have
  `tools/fidelity-review/fidelity-review.ts` pass the reviewers the decision
  files a changed test cites. Story 9.2 then replaces XT-runtime-1's
  identity check with the settle-after-drain check in the saved patch, and
  the private `drain` helper stays untagged and non-`async` (AD-6.13 tags
  public methods only), or keeps `@asyncRoot callback` if the ruling says
  so. Option 2: keep the 9.1 identity contract. `runInFrame` and
  `runInRootFrame` return the body's result unchanged and never drain; a
  separate draining entry (for example `runUnit(kind, fn): Promise<T>`,
  `@asyncRoot callback`) ends a unit after its defer list drains, and the
  grader's test frame does not drain. Story 57's TestCase (AD-25) then
  decides how a test drains what it deferred.
evidence: >-
  AD-5.9: "A unit ends only after ... the frame's `defer` list has drained".
  Story 9.2's AC (XT-runtime-7): "Given a unit whose `defer` list holds
  pending Promises, when the unit's body returns, then the unit ends only
  after every deferred Promise settles." The grader opens every Ported
  Test's unit with `run('test', inner)` (packages/assert/src/declarations/
  portedTest.ts:121, `await`ed), and `run` is `runInFrame` (AD-5.1,
  XT-runtime-1). A drain after an async body cannot keep the body's own
  promise object, so Story 9.1's XT-runtime-1 assertion
  `assertSame(innerPromise, returned)` must change. ESC-4.2-1 item (2),
  adopted by decisions/ESC-4.2-1.md, requires only that the result is
  awaited. The Fidelity Review rejected this three times (trees 995a1a47,
  433974df, 64e180a4), both reviewers each time, under F-2: the test now
  quotes both records verbatim and asserts the quotations against the
  files, but the reviewers require the citation in the Story spec they are
  given, which is the `stories/9.2.md` manifest (Protected, outside a
  Story's allowed paths), and they are not given the decision text. The
  third review also rejected `@asyncRoot callback` on the private `drain`
  helper under F-9. XT-runtime-5, 6 and 8 have no open finding.
---

# ESC-9.2-1: the defer drain changes what the grader's `run('test', inner)` returns

AD-5.9 ends a unit only after its `defer` list drains. The test frame the grader opens is a unit, and its opener is `runInFrame`, the installed global. Draining after an async body means `run` returns a new promise that settles after `inner` and its deferred work, not `inner`'s own promise, which Story 9.1's XT-runtime-1 asserts by identity.

ESC-4.2-1 item (2) asks only that `portedTest` awaits the result, so the change looks allowed. But the Fidelity Review accepts the loosened check only with a citation in the Story manifest, and a Story may not edit its manifest's body. Either the Maintainer records the ruling where the reviewers see it (Option 1), or the drain moves to a separate entry and the grader's test frame keeps 9.1's identity contract (Option 2). Work on XT-runtime-7, and the XT-runtime-1 change it forces, stops here. The rest of Story 9.2 (narrow and child frames, propagation) is in the saved patch.
