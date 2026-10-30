---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportLazyCollectionIsLazyTest::testFlatMapIsLazy"
trigger: protected-path
proposed: >-
  Option 1 (recommended): change `tools/fidelity-review/fidelity-review.ts`
  (Protected) so that, when a changed file adds an import of named bindings
  from another workspace package (`@xaravel/<component>` or one of its
  `exports` subpaths), the whole-file evidence also carries the repository
  source file that declares each imported name, resolved through that
  package's `exports` map and its barrel re-exports, within the existing
  whole-file budget and labelled with the import that brought it in. Add
  tests in `conformance/tests/xaravel/fidelity-review.test.ts` for each new
  case (a direct export, a barrel re-export with `as`, a name the package
  does not export, which stays unavailable and says why), and the matching
  evidence-note wording in `conformance/review/fidelity.md` and
  `docs/ops/fidelity-review.md`. This only supplies existing repository
  evidence in more cases, which the 2026-10-21 amendment to
  `decisions/MAINT-2026-10-16-unattended-orchestrator.md` lets the
  orchestrator rule on; no checklist item, verdict rule or schema changes.
  Story 14.8 then re-runs its Fidelity Review on the changed tree.
  Option 2: cite the runtime source in a comment in the Ported Test; a
  comment does not show reviewers the implementation, so it cannot answer
  the finding.
evidence: >-
  At tree 92950b0dd8f5c8d205c904cfb4685c8306647232 (base 7ac1bdfd) reviewer
  1 (codex, gpt-6.1-sol) rejects F-8 with one finding of kind
  missing-evidence on
  packages/collections/tests/ported/framework/tests/Support/SupportLazyCollectionIsLazyTest.test.ts:
  "Supply the Runtime array_sum export and implementation, with evidence of
  its separately landed Oracle-verified contract. The import and comments
  alone cannot establish that this is neither a declaration-only export nor
  a partial substitute; the non-enumerating callback never executes it."
  Reviewer 2 (claude, claude-opus-5-5) passes every item. F-8 is a core
  item, so a missing-evidence finding there blocks
  (decisions/MAINT-2026-10-24-evidence-gaps.md). The evidence exists:
  `array_sum` is implemented at packages/runtime/src/php/arithmetic.ts:65 and
  re-exported from packages/runtime/src/php/index.ts:203, landed by action
  item epic-14-item-17-runtime-array-sum (#527) under
  decisions/ESC-14.8-2.md and decisions/MAINT-2026-10-29-story-14-8.md. But
  `fileImports` in tools/fidelity-review/fidelity-review.ts resolves only
  relative specifiers ("Package imports (`@xaravel/…`) are left out"), so the
  prompt never shows another Component's source a Ported Test imports.
---

# ESC-14.8-3: the Fidelity Review cannot see the runtime `array_sum` the FlatMap port imports

ESC-14.8-2 held `testFlatMapIsLazy` until the runtime published PHP's `array_sum`, and item 17 landed it. The port now imports the real export, and every local check passes. But the reviewers see only the import line: the tool leaves `@xaravel/…` imports out of the evidence, so F-8 ("no stub, fake or partial implementation of another Component") cannot be confirmed. A missing-evidence finding on F-8 blocks.

The gap is general, not specific to this test. Every Ported Test that imports a runtime helper whose callback never runs, and every Story that relies on another Component's newly landed export, meets the same wall. Option 1 widens the general mechanism, as the Epic 9 lesson on evidence gaps asks, and changes only what the prompt carries.

Work on `testFlatMapIsLazy` stops here; the Story's other Test IDs and XT-collections-15/16 are unaffected.
