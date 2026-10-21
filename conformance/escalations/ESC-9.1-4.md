---
test_ids:
  - XT-runtime-2
trigger: protected-path
proposed: >-
  Option 1 (recommended): amend F-9 in conformance/review/fidelity.md to match
  the spine. A tag is true when it is `@asyncRoot <Contract.method>` on a
  method that reaches that IO root, or `@asyncRoot callback` on a method that
  is async because it accepts a callback DIV-1 allows to be async (AD-6
  Derivation, second clause). Have tools/fidelity-review/fidelity-review.ts
  evidence item (d) include the spine's AD-6 Enforcement bullet and
  decisions/ESC-6.4-1.md beside DIV-1, so reviewers can check a `callback`
  tag. Option 2: rule that a dev-only helper such as `interleave` is outside
  AD-6's public surface, and teach tools/async-surface to skip it (a change to
  the async-surface contract).
evidence: >-
  `interleave(units)` (packages/runtime/src/scope/interleave.ts, in the saved
  patch) returns `Promise.allSettled` of its units' promises and does no IO.
  `bun run async-surface --check` fails any exported Promise-returning
  function with no tag, so it carries `@asyncRoot callback`, as
  `runWithMockery` and `runCounted` do (packages/assert/async-surface.json,
  decisions/ESC-6.4-1.md). The spine, AD-6 Enforcement (ARCHITECTURE-SPINE.md
  line 188), says "`@asyncRoot <Contract.method>` (or `@asyncRoot callback`
  for the callback clause)". But F-9 in conformance/review/fidelity.md says a
  tag must mark "a method that really performs IO behind an async-root Driver
  contract", and evidence item (d) gives reviewers only decisions/DIV-1.md
  (fidelity-review.ts:202, 571). Both reviewers rejected the tag twice
  (trees d29879ca and 9809d91d); a doc comment citing the spine and
  ESC-6.4-1 was "insufficient evidence".
---

# ESC-9.1-4: the Fidelity Review's F-9 rejects the `@asyncRoot callback` tag the spine defines

AD-6 has two kinds of async method: one that reaches an IO root, and one that is async because it accepts an async callback. The spine gives the second kind the tag `@asyncRoot callback`, and the async-surface check requires a tag on every Promise-returning export. The Protected F-9 checklist only knows the first kind, and the reviewers see only DIV-1, so every `callback` tag fails review.

Removing the tag fails `async-surface --check`, and keeping it fails F-9. Changing either the checklist or the tool is a Protected change, so work on XT-runtime-2 stops here. This also affects every later Story whose public function takes an async callback: validation closures, `Cache.remember`, transaction callbacks and middleware (AD-6 Derivation).
