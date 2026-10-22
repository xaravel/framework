---
test_ids:
  - XT-runtime-35
  - XT-runtime-36
  - XT-runtime-37
trigger: protected-path
proposed: >-
  Option 1 (recommended): raise `PROMPT_CAP` in
  `tools/fidelity-review/fidelity-review.ts` (Protected) from 600,000 to
  700,000 characters, with the test in
  `conformance/tests/xaravel/fidelity-review.test.ts` and the figure in
  `docs/ops/fidelity-review.md` (its exit-code table, Cost and Limits)
  updated to match. That is about 175,000 to 235,000 tokens per reviewer
  call. It must still fit both reviewer CLIs' context windows, and it
  raises each review's cost by up to a sixth, which is why it is the
  Maintainer's (ESC-8.5-1 holds the reviewer cost question). Option 2:
  evidence (e) leaves out touched Xaravel Tests that the Story's ownership
  scope does not cover (here `conformance/tests/xaravel/fidelity-review.test.ts`,
  touched by the ruling PR #303, not by the Story). That narrows evidence,
  which the 2026-10-21 amendment reserves to the Maintainer. Option 3:
  split the Story's review across two runs. The tool has no such mode, and
  the verdict rule counts one tree. Whichever option is chosen, the
  re-run's base is `c870bc261d2bcea7b12296896c8650f52e124573`, the `main`
  commit #302 was squashed onto: `c870bc2..c343592` is exactly the Story,
  where ESC-9.10-1's `6837b06` also pulls in #301's unrelated CI tests.
evidence: >-
  After ESC-9.10-1 (#303) the tool shows more evidence, and Story 9.10's
  review no longer fits the cap. On branch `story/9.10` (tree = `main`
  9b030f1 plus a spec status edit), `bun run fidelity:review review --story
  9.10 --base 6837b0675db1977c0917e3e0ade582fb1b9d7b2e --loop-cli claude`
  stops with "the prompt is 649360 characters, over the 600000 cap, of which
  section (e), the touched Xaravel Tests, is 303089; the diff and its
  evidence are too large to review; nothing recorded". With `--base
  c870bc261d2bcea7b12296896c8650f52e124573`, which drops #301's
  `ci-pipeline.test.ts` and `repository-policy.test.ts`, it is 609566
  characters, (e) 277874, still 9,566 over. The touched tests that remain
  are the Story's eight runtime test files and #303's
  `fidelity-review.test.ts` (117,975 bytes). The Story's earlier reviews
  fitted under the cap (trees 731e2f1 and a1d5553, before #303). The
  Story's spec forbids editing `tools/**`, and no reviewer ran, so no
  verdict is recorded.
---

# ESC-9.10-3: Story 9.10's Fidelity Review prompt is over the 600,000-character cap

ESC-9.10-1 made the Fidelity Review show imported test helpers and more decision records. Story 9.10's diff, plus that ruling's own tests (which the squash merge leaves in any base-to-tree diff), now builds a 609,566-character prompt, over `PROMPT_CAP` (600,000). The tool refuses to run and records nothing, so `story:check 9.10` cannot pass.

Option 1 (recommended) raises the cap to 700,000. It changes review cost and must fit the reviewers' context windows, so it is the Maintainer's. Option 2 narrows evidence (e), which is also the Maintainer's under the 2026-10-21 amendment.

This stops XT-runtime-35, 36 and 37: every Test ID of the Story waits on a review that cannot run.
