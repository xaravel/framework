---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16, amendment 2026-10-21)
date: 2026-10-23
escalation_sha256: "d3ebe557f51bded2e8c16a3bdb6246c3e7e203080cad7401153f4f363f3c60be"
---

# ESC-10.2-7: approved, option 1 (the review shows the Upstream sources a changed test reads, the AD Rule bullet a citation names, and the files a test copies into a fixture)

`tools/fidelity-review/fidelity-review.ts` adds evidence in three cases:

- **(a) Upstream sources, in (h).** A changed test file that reads Upstream sources through a computed path now gets them. `upstreamReadDirs` takes, for each `readFileSync`, `readFile`, `Bun.file`, `readdirSync` or `readdir` call, the longest constant directory its path starts with. It resolves through the file's `const`s at any depth, as an import's path resolves, and stops at the first computed part: a variable file name, `...name.split("\\")` or `+ ".php"`. The directory is kept when it lies in `conformance/upstream/`. `upstreamSourcesNamed` then lists the snapshot file (`<package>/src/<class as a path>.php`) of each class a changed file names in a string literal under that directory. A port names the class it ports that way (`contract("…")`, `registerClass('…', …)`), and a name only in a comment is left out. Each file is headed with the reading test, the directory, the class and the file that names it, and is placed with the data files changed tests read.
  - A source that does not fit shows its declaration lines (`phpDeclarationLines`: `namespace`, top-level `use`, and the class or interface line up to its `{`, with `extends` and `implements`). Room for every source's declaration lines is reserved first when it all fits, and handed back as each whole file fits.
  - For Story 10.2 this is the 90 files of `Illuminate/Contracts/<Ns>/` across the 19 namespaces (70,168 characters). It holds both for `structural.test.ts` (a directory walk under `…/Illuminate/Contracts`) and for the saved XT-contracts-5 test, `namespaces.test.ts`, which builds the path from a class name under `…/framework/src`.
- **(b) A Rule bullet cited by name.** In (b), a bare `AD-<n>` on an added line or in a changed source file's docblock carries the Rule bullet its clause names by its bold lead (`namedRuleCitations`). The clause runs up to a `)`, `;` or the end of the line, and the match ignores case and backticks. So "AD-5, the spine's Lifecycle" in `packages/contracts/src/foundation/Application.ts` carries AD-5.2, the **Lifecycle.** bullet, which says "Deferred providers have a sync `boot()`." The entry is labelled `AD-<n>.<k>`, numbered as `consequencesFor` numbers it, and fenced as markdown. A bullet the same text also cites by its dotted id is shown once, as its consequence line. The (b) heading now names these bullets and F-9.
- **(c) Files copied into a fixture, in (h).** `dataFileReads` also takes the source of each `copyFileSync(…)` call, so the `tsconfig.base.json` that `structural.test.ts` (XT-contracts-6) copies into its compiler project is shown whole.

`conformance/tests/xaravel/fidelity-review.test.ts` tests each case:

- for (a), against a hermetic snapshot: a directory walk and a class-built path resolved to their directories; a read outside the snapshot, an unresolved one and an exact file path left out; sources selected only by a string literal, not by a comment; a class outside the read's directory left out; no snapshot and no directories giving nothing; the declaration lines; the (h) entries, their headings and their order; a changed non-test file reading none; and the declaration fallback under a tight budget;
- for (b): a lead named without case or backticks, a clause naming none, a bare id with no clause, an AD the spine lacks, a dotted id, the spine not read when no citation has a clause, an unreadable spine, the real spine's AD-5 Lifecycle bullet, and (b) through `gatherEvidence`;
- for (c): `copyFileSync`'s source resolved and its destination not, and the real `structural.test.ts` reading `tsconfig.base.json`.

In `conformance/review/fidelity.md`, a new evidence note, "Cited rules", and the "Whole files" note say what the prompt now carries. Both sit above the checklist items, and no Check changes. The (b) and (h) entries in `docs/ops/fidelity-review.md` say the same.

The reject this answers is both reviewers' reject of Story 10.2, at tree `6d6c0b6bcfb46be659fe91f0583a7b87b8b36210` and again at tree `70d1c9a929e5a71c857684270e6c910bf63a20ab` (base `1c2f48aab75c7badad6de7729bba4471ae1dff16`). Reviewer 1 (codex, gpt-6.1-sol) found, under F-7, "XT-contracts-5 reads Upstream PHP declarations to establish parents and exception bases, but those PHP files are not supplied" and "Supply the Upstream PHP inputs read across the 19 namespaces and tsconfig.base.json". Under F-9 it found "the cited AD-5 lifecycle evidence is not supplied" for `packages/contracts/src/foundation/Application.ts`.

**The re-run.** Story 10.2 re-runs its Fidelity Review on a changed tree with `--base 1c2f48aab75c7badad6de7729bba4471ae1dff16`. Its tree changes, so the standing-reject rule (ESC-8.8-1) lets the review run, and the new review must address the reject's findings. ESC-10.2-1..6 still wait on the Maintainer, so the Story stays `blocked` on them.

Rationale:

- **The evidence exists, but the tool never showed it.** The Upstream snapshot is what `bun run upstream:sync` puts in `conformance/upstream/` on every machine that runs the review, and the spine and `tsconfig.base.json` are on `main`. (h) followed only reads whose path resolves to one file, so it missed a directory walk, a class-built path and a copy. (b) carried an AD's text only for a dotted `AD-<n>.<k>` id. The 2026-10-21 amendment lets the orchestrator close that kind of gap.
- **It only adds evidence.** No checklist check (F-1..F-10), verdict rule, verdict schema, standing-reject rule, reviewer choice or `story:check` clause changes. No evidence is removed or narrowed: every file (h) showed or named before is still shown or named, and every (b) entry is unchanged. No assertion, expected value, skip or `adapted:` marker changes, and no divergence is added.
- **Selecting by the classes the change names.** A computed path can reach the whole snapshot: `namespaces.test.ts` reads under `framework/src`. Showing every file there would crowd out the change itself. The classes a changed file names in a string literal are the ones the change ports, which are the files these tests read: exactly the 90 for Story 10.2. Classes named only in comments would add 21 more files (148,408 characters, such as `Collection.php` and `Validator.php`) that neither test reads.

This ruling clears XT-contracts-5 and XT-contracts-6 of ESC-10.2-7. XT-contracts-5 is still stopped by ESC-10.2-1, -4 and -5, and the Story stays `blocked` on ESC-10.2-1..6.
