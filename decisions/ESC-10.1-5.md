---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16, amendment 2026-10-21)
date: 2026-10-23
escalation_sha256: "0ccf6a2d625f06422a2f5559457c75426e6e7f1e949e98409b9069459a3efcde"
---

# ESC-10.1-5: approved, option 1 (the review shows the data files a changed test reads), with an excerpt for a file over the one-file limit

`tools/fidelity-review/fidelity-review.ts` adds evidence to (h), the whole files:

- **Data files.** For each test file the change adds or modifies, (h) also lists every repository file it reads as data (`dataFileReads`). That is the path argument of a `readFileSync(…)`, `readFile(…)` or `Bun.file(…)` call that resolves as a dynamic import's path already does (`pathExpression`: `import.meta.dir`, a top-level `const` of the file, `join`/`resolve` and string literals). Each is headed `read by <test path>` and placed with the files changed tests import, the tier no other section shows, ahead of the changed files. A path the tool cannot resolve, a path outside the repository, a changed file and an Oracle fixture are not listed this way.
- **Data files over the one-file limit.** `conformance/api-surface/contracts.jsonl` is 191,542 characters, over `WHOLE_FILE_CAP` (60,000). Option 1 as written would therefore only name it as omitted for size, which would not answer the reject. So a data file over the limit shows the lines the reading test's string literals select (`dataFileExcerpt`): each literal of three or more characters, as written or unescaped, selects the lines that hold it. Literals are taken most selective first, each whole or not at all, while the excerpt stays within the limit, and the lines keep their file order. The heading names the literals and says how many lines of how many it shows. For XT-contracts-4 that is 175 of 765 lines (22,937 characters), including all 28 `Psr\` rows `psrRows()` reads. A literal that matches nearly every line (`"method"`) is left out.

`conformance/tests/xaravel/fidelity-review.test.ts` tests each case:

- resolved reads through `readFileSync`, `readFile` and `Bun.file`, with a `const` path;
- an unresolvable path, a missing file and a path outside the repository left out;
- the real `psr.test.ts` reading `contracts.jsonl`;
- a small data file shown whole, ahead of the changed test;
- a changed non-test file adding none;
- the excerpt's selection, its order and its skipping of a literal that would exceed the limit;
- no excerpt when nothing is selected;
- the real (h) entry for `psr.test.ts` carrying every PSR row within the limit.

The (h) heading now says the section carries "the data files changed tests read". The evidence note "Whole files" in `conformance/review/fidelity.md` (above the checklist items; no Check changes) and the (h) paragraph in `docs/ops/fidelity-review.md` say the same.

The reject this answers is both reviewers' reject of Story 10.1 at tree `94fc9c53db0314d0ebe953c9a2d8f5341020a094` (base `9e1bd6d7ee0e26fbaea859cf05d8d832aab799ba`): reviewer 1 (codex, gpt-6.1-sol) F-7 on `conformance/api-surface/contracts.jsonl`, "Supply the PSR rows consumed by psrRows(), including interface, method and parameter records". The same reject's F-9 (reviewer 2, `CacheInterface` must be async under AD-6) is the Story's own, and the Story has already fixed it.

**The re-run.** Story 10.1 re-runs its Fidelity Review on the changed tree with `--base 9e1bd6d7ee0e26fbaea859cf05d8d832aab799ba`. Its tree changes, so the standing-reject rule (ESC-8.8-1) lets the review run, and the new review must address the reject's findings. ESC-10.1-6 still stops XT-contracts-4 until it is ruled on, so the Story stays `blocked` on it.

Rationale:

- **The evidence exists, but the tool never showed it.** The PSR rows are on `main`, committed by action item `epic-10-item-1-psr-api-surface` under ESC-10.1-4. (h) followed a changed test's imports but not the files it reads. The 2026-10-21 amendment lets the orchestrator close that kind of gap.
- **It only adds evidence.** No checklist check (F-1..F-10), verdict rule, verdict schema, standing-reject rule, reviewer choice or `story:check` clause changes. No evidence is removed or narrowed: a file that (h) showed or named before is shown or named as before. No assertion, expected value, skip or `adapted:` marker changes, and no divergence is added.
- **The excerpt over omission.** Naming `contracts.jsonl` as omitted for size would leave the reviewers where they were. Raising the one-file limit would let one data file crowd out the changed files under the prompt cap. Selecting by the test's own literals shows the rows the test filters on and says which lines it left out.
- **Option 1 over option 2.** Option 2 hard-codes the PSR metadata in the test, against the epic 8 lesson (derive expectations from the source contract) and ESC-10.1-4, and it answers this Story only.
