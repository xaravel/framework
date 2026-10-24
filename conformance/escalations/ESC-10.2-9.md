---
test_ids:
  - XT-contracts-5
trigger: protected-path
proposed: >-
  Option 1 (recommended): the Maintainer lets a data file a changed
  Xaravel Test reads exceed `WHOLE_FILE_CAP` (60,000 characters) in
  `tools/fidelity-review/fidelity-review.ts` (Protected), for example by
  raising it to 100,000 characters, so `dataFileExcerpt` keeps every
  `conformance/api-surface/contracts.jsonl` row of the 19 namespaces
  (96,895 characters over 411 lines). Raising `WHOLE_FILE_CAP` is the
  Maintainer's call (`decisions/MAINT-2026-10-22-fidelity-whole-files.md`,
  "Future evidence gaps"). The prompt was 943,702 characters with the
  current 60,000-character excerpt, so about 37,000 more characters
  stay under the 1,000,000 `PROMPT_CAP`. Option 2: `dataFileExcerpt`
  also selects the lines a test's template-literal prefixes match
  (`Illuminate\\Contracts\\${ns}\\` over the `NAMESPACES` keys), still
  under `WHOLE_FILE_CAP`. That widens (h) without a cap change, but the
  19 namespaces' rows alone are over 60,000 characters, so it does not
  show them all unless the cap is raised too. Option 3: the Maintainer
  accepts reviewer 2's pass and reviewer 1's reject as a split verdict
  for this tree; the story:check approval rule (two `pass` verdicts)
  has no such exception, so this needs a ruling too.
evidence: >-
  Story 10.2's fourth Fidelity Review (tree
  8e9e2330dc2b97408c7ad3e2d71911aa9f3e69d6, base
  1c2f48aab75c7badad6de7729bba4471ae1dff16), the first under ESC-10.2-8's
  1,000,000-character cap and with XT-contracts-5 and -6 honouring
  `XARAVEL_UPSTREAM=require`. Reviewer 2 (claude) passes every item.
  Reviewer 1 (codex) passes F-8 and F-9 and rejects F-7 on two findings.
  First: "Supply all rows consumed by rowsOf() for the 19 namespaces. The
  251-line literal-selected excerpt omits relevant declarations and
  methods, including Config Repository and Support Arrayable rows;
  XT-contracts-5 reads these through computed namespace filters." That is
  true: `contracts.jsonl` is 191,542 characters, over `WHOLE_FILE_CAP`,
  so (h) shows the 251 lines the test's string literals select, while
  `rowsOf()` reads the 411 rows whose FQCN starts with
  `Illuminate\Contracts\<Ns>\`, 96,895 characters, itself over the cap.
  Second: "the diff exports ShouldBeUniqueUntilProcessing, while sections
  (g), (h) and Upstream name ShouldBeUniqueUntilProcessing". The two
  names are the same, byte for byte, in `src/queue/index.ts`,
  `src/queue/ShouldBeUniqueUntilProcessing.ts`, the Upstream file name
  and the `contracts.jsonl` row, so this finding names no difference
  and needs no change. Every P-n finding of the earlier rejects is marked
  fixed by both reviewers, except P-1 and P-8 (the same rows gap) by
  reviewer 1.
---

# ESC-10.2-9: Story 10.2's Fidelity Review shows only an excerpt of the API-surface rows XT-contracts-5 reads

ESC-10.2-8 raised the prompt cap, and the Fidelity Review now shows each Upstream contract source and `tsconfig.base.json`. One reviewer passes. The other still rejects F-7, because `conformance/api-surface/contracts.jsonl` is shown only as an excerpt of the lines the test's string literals select. XT-contracts-5 reads its rows through a computed namespace prefix, so the excerpt leaves out rows it checks, such as `Config\Repository`'s and `Support\Arrayable`'s.

The 19 namespaces' rows come to 96,895 characters, over the 60,000-character `WHOLE_FILE_CAP` on any one file. No change inside the Story's paths can show them, and raising the cap is the Maintainer's call. The reviewer's second finding compares two identical names and needs no change.

Everything else in the Story passes: `bun run harness` has no differences, XT-contracts-1..7 and -18 pass, and under `XARAVEL_UPSTREAM=require` without the snapshot XT-contracts-5 and -6 fail as ESC-10.2-8 directs. This Escalation stops XT-contracts-5 until the Fidelity Review passes on a tree whose rows it can see.
