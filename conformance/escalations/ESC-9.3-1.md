---
test_ids:
  - XT-runtime-9
  - XT-runtime-10
  - XT-runtime-11
trigger: contract
proposed: >-
  Option 1 (recommended): record a ruling (`decisions/ESC-9.3-1.md`) that
  a generic Scope Frame runner, a public function that returns its body's
  own type `T` and never a declared Promise or thenable type
  (`runInFrame`, `runInRootFrame`, `runInNarrowFrame`), is AD-6.5's
  dual-helper shape ("return `T` for a sync callback and `Promise<T>` for
  an async one") and carries no `@asyncRoot` tag. Story 9.3 re-applies
  `_bmad-output/implementation-artifacts/9-3-blocked-attempt.patch`, cites
  `decisions/ESC-9.3-1.md` in the three docblocks, and re-runs the
  Fidelity Review, which shows cited decision records as evidence (f).
  Option 2: tag the three runners `@asyncRoot callback`, and change
  `tools/async-surface/async-surface.ts` (Protected) so a tag on a
  generic-`T` method is accepted and listed, regenerating every
  `async-surface.json` that changes.
evidence: >-
  Story 9.3 adds an optional `app` parameter to `runInFrame` and
  `runInRootFrame` (AD-5.3: a frame carries `currentFrame()?.app`). Both
  Fidelity reviewers reject F-9 at tree 4430b4f3, reviewer 1 also at
  d95f938e: the three runners "accept callbacks DIV-1 allows to be async
  ... but they carry no `@asyncRoot callback` tag. The code comment is not
  a recorded ruling. Either add the tags (and adjust the return types or
  the async-surface tool so the check passes ...), or get an approved
  decision record that exempts these generic dual-shape frame-runners".
  The tag cannot be added in-Story: `tools/async-surface/async-surface.ts`
  reports "has an @asyncRoot tag but returns neither a Promise nor a
  thenable" (AD-6) for a method returning `T`, and making the runners
  return a Promise would make sync bodies async, breaking XT-runtime-1..8
  and the grader's `Symbol.for('xaravel.scope.run')`. The same untagged
  runners passed F-9 from both reviewers at Story 9.2's tree 02121f3a and
  from reviewer 2 at d95f938e. With the patch applied, `harness --xaravel`
  301/301, `tsc -b`, lint, `graph:check`, `registration:check` and
  `async-surface --all --check` are clean.
---

# ESC-9.3-1: do generic Scope Frame runners need an `@asyncRoot callback` tag?

Story 9.3 gives `runInFrame` and `runInRootFrame` an optional `app` argument, which puts the three frame runners back in front of the Fidelity Review. Both reviewers now reject F-9: the runners accept async bodies, carry no `@asyncRoot callback` tag, and no decision record exempts them. A code comment quoting AD-6.5 and the async-surface tool did not satisfy them; they ask for a recorded ruling.

The tag cannot be added: the runners return their body's own type `T`, and the async-surface tool rejects a tag on a method that returns neither a Promise nor a thenable. Returning a Promise always would break the sync contract every XT-runtime test and the grader rely on. Option 1 records that these runners are AD-6.5 dual helpers and need no tag. Option 2 changes the Protected async-surface tool to accept and list the tag. Work on XT-runtime-9..11 stops here, and with it the Story. The full implementation is saved in `_bmad-output/implementation-artifacts/9-3-blocked-attempt.patch`.
