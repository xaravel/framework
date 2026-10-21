---
test_ids:
  - XT-runtime-9
  - XT-runtime-10
  - XT-runtime-11
trigger: protected-path
proposed: >-
  Option 1 (recommended): change `tools/fidelity-review/fidelity-review.ts`
  (Protected) so that, for each changed `packages/<name>/src/` file, the
  prompt also lists every `@asyncRoot` tag the file holds after the change
  and every exported declaration it has, each with its line and full
  docblock, not only the diff hunks. Add a test for the new case to
  `conformance/tests/xaravel/fidelity-review.test.ts`, and update
  `conformance/review/fidelity.md` and `docs/ops/fidelity-review.md` to say
  what the prompt now carries. This adds an evidence item and supplies
  existing source in more cases, which the 2026-10-21 amendment to
  `decisions/MAINT-2026-10-16-unattended-orchestrator.md` lets the
  orchestrator decide. Story 9.3 then re-applies
  `_bmad-output/implementation-artifacts/9-3-blocked-attempt-2.patch`
  unchanged and re-runs the Fidelity Review. Option 2: supply each changed
  `packages/<name>/src/` file in full. It is simpler, but the prompt grows
  with file size.
evidence: >-
  At tree 1030dbd363183bdab85c27ca480196950948ad79 reviewer 1 (codex,
  gpt-6.1-sol) rejects F-9 and reviewer 2 (claude, claude-opus-5-5) passes
  it. Reviewer 1's note: "The visible runners match ESC-9.3-1's untagged
  generic-T exception, and the new synchronous exports require no tags.
  However, the excerpts omit retained declarations and docblocks needed to
  verify every retained tag in touched source files." Its findings: for
  `packages/runtime/src/scope/interleave.ts`, "Supply the complete
  retained interleave docblock and helper declarations. The diff omits the
  region preceding its Promise-returning declaration"; for
  `packages/runtime/src/scope/scope.ts`, "Supply the complete touched
  source file or an exhaustive declaration-and-tag listing so retained
  @asyncRoot tags and public exports in omitted regions can be reviewed
  under F-9." The evidence exists in the repository: both files are in
  the reviewed tree, and `interleave`'s retained `@asyncRoot callback` tag
  sits outside the diff's context lines. `fidelity-review.ts` puts only
  each file's patch in the prompt (`fence(file.patch, "diff")`), so no
  in-Story change can show the reviewer the omitted regions. Adding
  comments to `scope.ts` that list its own declarations would copy the
  source into itself and go stale. Both reviewers passed F-9 at tree
  5e91e5800d8ccb618bdbac33c292bf7ee305d70a, which had the same source and
  one less test check. `harness --xaravel` 301/301, `tsc -b`, lint,
  `graph:check`, `registration:check` and `async-surface --all --check`
  are clean at tree 1030dbd3, and `async-surface.json` is unchanged.
---

# ESC-9.3-2: the Fidelity Review shows F-9 only diff hunks of a changed source file

Story 9.3 re-applied its saved attempt under ESC-9.3-1 and added one test check after review. On the changed tree, reviewer 1 rejects F-9 for one reason only: it is shown each changed file's diff hunks, so it cannot see tags and declarations in the parts of `scope.ts` and `interleave.ts` the diff leaves out. That includes `interleave`'s retained `@asyncRoot callback` tag. Reviewer 2 passes F-9 on the same tree, and both reviewers passed it on the previous tree.

The source the reviewer asks for is in the repository. Putting it in the prompt is a change to `tools/fidelity-review/` (Protected), which a Story may not edit. Option 1 adds one evidence item: a listing of every tag and export in each changed source file. Option 2 supplies those files whole. Work on XT-runtime-9..11 stops here, and with it the Story, because every XT-runtime test is in one reviewed tree. The full implementation is saved in `_bmad-output/implementation-artifacts/9-3-blocked-attempt-2.patch`.
