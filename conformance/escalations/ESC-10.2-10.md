---
test_ids:
  - XT-contracts-5
trigger: protected-path
proposed: >-
  Option 1 (recommended): the Maintainer raises `WHOLE_FILE_CAP` in
  `tools/fidelity-review/fidelity-review.ts` (Protected) from 60,000 to
  100,000 characters, or lets a data file a changed Xaravel Test reads
  through a computed prefix exceed it, so `dataFileExcerpt` shows every
  `conformance/api-surface/contracts.jsonl` row of the 19 namespaces
  (96,895 characters over 411 lines). ESC-10.2-9 measured the prompt at
  943,702 characters with the 60,000-character excerpt, so about 37,000
  more characters stay under the 1,000,000 `PROMPT_CAP`. The cap is the
  Maintainer's call (`decisions/MAINT-2026-10-22-fidelity-whole-files.md`,
  "Future evidence gaps"). Option 2: `dataFileExcerpt` also selects the
  lines a test's template-literal prefixes match
  (`Illuminate\\Contracts\\${ns}\\` over the `NAMESPACES` keys). On its own
  this still stops at `WHOLE_FILE_CAP`, so it shows all 411 rows only with
  option 1's cap change. Option 3 (not recommended, and the Maintainer's
  alone): change the waiver rule in
  `decisions/MAINT-2026-10-23-fidelity-waivers.md` so that two rejects
  that fail only waived items count. The ruling's item 3 says that never
  happens today.
evidence: >-
  Story 10.2's fifth Fidelity Review, on tree
  5cb66834081584c974a225aa9becede718f2c5d9 (base
  1c2f48aab75c7badad6de7729bba4471ae1dff16), on 2026-10-24, the first
  after ESC-10.2-9's F-7 waiver. Both reviewers reject, and each fails F-7
  only. Reviewer 1 (codex, gpt-6.1-sol): "Supply all rows consumed by
  rowsOf() across the 19 namespaces. The 251-line excerpt still omits
  relevant declarations and methods, including Config Repository and
  Support Arrayable rows". Reviewer 2 (claude, claude-opus-5-5), which
  passed on the previous tree: "XT-contracts-5's rowsOf() reads every row
  whose FQCN starts with Illuminate\Contracts\<Ns>\ for the 19 namespaces
  (411 rows). The evidence still shows only a 251-line literal-selected
  excerpt". It adds: "ESC-10.2-9's waiver changes only how story:check
  counts the verdict, not this answer." The waiver needs a `pass` beside
  the waived reject, and "Two rejects never pass on a waiver"
  (MAINT-2026-10-23-fidelity-waivers, item 3), so `review` exits 1 and
  `status` is not `current`. Both rejects stand on this tree (ESC-8.8-1).
  Re-running the review on an unchanged tree to get another verdict is not
  allowed, and no change inside `packages/contracts/**` can show the rows:
  even a test that names each namespace prefix as a literal hits the same
  60,000-character cap.
---

# ESC-10.2-10: both Fidelity reviewers now reject F-7, so the F-7 waiver does not count

ESC-10.2-9's waiver lets a reject that fails only F-7 count beside the other reviewer's `pass`. On Story 10.2's current tree, both reviewers reject, and each fails F-7 only, for the same evidence gap as before. The prompt shows a 251-line excerpt of `conformance/api-surface/contracts.jsonl`, but XT-contracts-5 reads 411 rows of it through a computed namespace prefix. Under the waiver rule, two rejects never pass, so the Story still has no `current` Fidelity Review.

The rows come to 96,895 characters, over the 60,000-character `WHOLE_FILE_CAP`. Only the Maintainer can raise that cap or change the waiver rule. The orchestrator therefore cannot close this gap under the 2026-10-21 amendment.

Everything else is unchanged since ESC-10.2-9. `bun run harness` shows no differences, and XT-contracts-1..7 and -18 pass. F-1..F-6, F-8, F-9 and F-10 pass or are `n/a` for both reviewers. This Escalation stops XT-contracts-5 until the Fidelity Review counts on a tree whose rows the reviewers can see.
