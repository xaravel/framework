---
test_ids:
  - XT-runtime-31
trigger: protected-path
proposed: >-
  Option 1 (recommended): change `tools/fidelity-review/fidelity-review.ts`
  (Protected) so evidence (e) also carries, for each Xaravel Test it
  includes, the full declaration of every test helper that test calls in
  its own file (directly or through another helper, to a fixed point), and
  of every class or trait fixture those helpers or the test reference by
  name in that file, with tests in
  `conformance/tests/xaravel/fidelity-review.test.ts` for each new case;
  update the (e) wording in `conformance/review/fidelity.md` and
  `docs/ops/fidelity-review.md` to match. This only supplies existing
  repository evidence in more cases, which the 2026-10-21 amendment to
  `decisions/MAINT-2026-10-16-unattended-orchestrator.md` lets the
  orchestrator rule on. Story 9.9 then re-runs its Fidelity Review on the
  changed tree, passing `--base a5ecf3905763930a6d18c518924c7e12afa3e303`
  (the parent of the Story's first PR, #290), so the review covers the
  whole Story: #290 and #293 merged its code while it was blocked, before
  any Fidelity Review ran, and the spec's `baseline_revision` now points
  after them. Option 2: rule that F-7 judges only the lines (e) shows, and
  record that in `conformance/review/fidelity.md`.
evidence: >-
  At tree fc517f78e9585cd0072af8c3353a9c463810b181 (base 4a3cd9f) reviewer 1
  (codex, gpt-6.1-sol) rejects F-7: "Supply the complete checkComposition
  and checkDefaultLimits helpers and their relevant fixture definitions,
  including SetsName, so the trait composition, default handling and
  private-property setup claimed by XT-runtime-31 can be verified."
  Reviewer 2 (claude, claude-opus-5-5) passes every item, but notes for
  F-7: "The prompt does not show `SetsName`, so I could not confirm that
  its default for `name` differs from \"parent\"". XT-runtime-31's body is
  `() => { checkComposition(); checkDefaultLimits(); … }`, and evidence (e)
  (`xaravelTestEvidence`, `buildPrompt` lines 371-395) prints only the
  `xaravelTest(...)` unit's text, never the helpers it calls or the
  fixtures they use, even when the change edits one of those helpers
  (here `checkDefaultLimits`). All of that evidence is in
  `packages/runtime/tests/xaravel/traits.test.ts`. No in-Story change can
  supply it without inlining the helpers into the test call, which would
  restructure a passing test only to fit the prompt. `bun test
  packages/runtime` 34/34, `harness --xaravel --id 'XT-runtime-*'` 34/34,
  `tsc -b`, lint, `graph:check`, `registration:check`, `async-surface
  --all --check`, `escalations:check` and `oracle:story check 9.9` are
  clean.
---

# ESC-9.9-4: the Fidelity Review shows an Xaravel Test's body but not the helpers it calls

Story 9.9's last follow-up (ESC-9.9-3, DIV-12.9) adds the private-slot row to `checkDefaultLimits` in `packages/runtime/tests/xaravel/traits.test.ts`. XT-runtime-31 calls that helper, and `checkComposition`. The Fidelity Review prompt's evidence (e) gives the reviewers the `xaravelTest(...)` call in full, but not the helpers it calls or the fixtures those helpers use (`SetsName`, `Secret`). Reviewer 1 cannot check the consequence XT-runtime-31 declares, and rejects F-7. Reviewer 2 passes, but says it could not see `SetsName` either.

Supplying those declarations is a change to `tools/fidelity-review/` (Protected), which a Story may not edit. Option 1 adds them to (e). Option 2 narrows F-7 to the lines (e) shows. The ruling should also fix the base of the re-run review, so it covers the whole Story, not only this follow-up. Work on XT-runtime-31 stops here, and with it the Story, because every XT-runtime test sits in one reviewed tree.
