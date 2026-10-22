---
test_ids:
  - XT-runtime-35
  - XT-runtime-36
  - XT-runtime-37
trigger: protected-path
proposed: >-
  Option 1 (recommended): extend ESC-9.10-3's Story scope from evidence (e)
  to the per-file patches in `tools/fidelity-review/fidelity-review.ts`
  (Protected). A changed file outside the Story's `allowedPath` scope that
  no assigned Test ID declares would be named in one line, as left out and
  why, instead of shown as a patch. Here that is #303's and #306's
  `tools/fidelity-review/fidelity-review.ts`, `conformance/tests/xaravel/fidelity-review.test.ts`,
  `conformance/review/fidelity.md` and `docs/ops/fidelity-review.md`:
  68,633 characters of patch that the Story did not write and those PRs'
  own reviews covered. The test in `conformance/tests/xaravel/fidelity-review.test.ts`
  and `docs/ops/fidelity-review.md` would be updated to match. Option 2:
  raise `PROMPT_CAP` from 600,000 to 700,000, ESC-9.10-3's option 1, which
  the Maintainer did not take then because the range grows with each PR
  that merges while a Story waits. Option 3: re-run the review with a base
  after #306 (`386080cd6f915701f6ed4d6d2f810e1683274f64`). The prompt then
  shows only the ESC-9.10-2 follow-up, and the earlier Story work keeps its
  two reviewer passes at trees `731e2f1` and `a1d5553` (rejected only for
  the ESC-9.10-1 tool gaps). The verdict rule binds one tree, so this
  changes what a pass covers, which is the Maintainer's.
evidence: >-
  After the ESC-9.10-2 follow-up (#307, head `da37f2e` with the bot's signed
  fixture), `bun run fidelity:review review --story 9.10 --base
  c870bc261d2bcea7b12296896c8650f52e124573 --loop-cli claude` stops with
  "the prompt is 619174 characters, over the 600000 cap, of which section
  (e), the touched Xaravel Tests, is 205191; the diff and its evidence are
  too large to review; nothing recorded". ESC-9.10-3 measured 585,409
  characters on the tree before the follow-up. The follow-up adds 25,345
  characters of diff against `c870bc2` (244,683 to 270,028: the coercion
  in `throwableArguments.ts`, the 32 new XT-runtime-36 rows in
  `exceptions.test.ts` and `9.10.jsonl`, `formatFloat` and `stringPort`
  moved to `scalarString.ts`, the docs) and about 8,000 characters to (e).
  Of the 270,028-character diff, 68,633 are the out-of-scope tool, test,
  checklist and docs changes of #303 and #306. Shrinking the Story's own
  change would mean dropping Oracle rows that `decisions/ESC-9.10-2.md`
  orders, or keeping the `scalarString.ts` move out, which saves about
  7,000 characters and is not enough. The Story's spec forbids editing
  `tools/**`, and no reviewer ran, so no verdict is recorded. Every other
  check passes: `bun test packages/runtime` 37/37, `bun run harness
  --xaravel --id 'XT-runtime-*'` 37/37, `oracle:verify-fixtures` (1955).
---

# ESC-9.10-4: Story 9.10's Fidelity Review prompt is over the cap again after the ESC-9.10-2 follow-up

ESC-9.10-3 scoped evidence (e) to the Story's own tests and measured the Story's prompt at 585,409 characters. The ESC-9.10-2 follow-up adds the coercions, their 32 Oracle rows and their tests. That puts the prompt at 619,174 characters, over `PROMPT_CAP` (600,000). The tool refuses to run and records nothing, so `story:check 9.10` cannot pass.

The diff from the ruled base `c870bc2` still carries 68,633 characters of #303's and #306's Fidelity Review tool changes. Those PRs were reviewed on their own. Option 1 (recommended) scopes the per-file patches as ESC-9.10-3 scoped (e). That narrows what a review shows, and changing a Protected Path is the Maintainer's.

This stops XT-runtime-35, 36 and 37: every Test ID of the Story waits on a review that cannot run.
