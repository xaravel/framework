---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16, amendment 2026-10-21)
date: 2026-10-21
escalation_sha256: "57b5ddbbf9e61ba2f0c913765b60aa97146b471ba668aec9efe48ecaa4dd97cd"
---

# ESC-9.3-2: approved, option 1 (the prompt lists every declaration and `@asyncRoot` tag of each changed source file)

`tools/fidelity-review/fidelity-review.ts` gains evidence (g). For every `packages/<name>/src/` file the change adds or modifies, the prompt now carries a listing read from the working tree: the line of every `@asyncRoot` tag the file holds, then every top-level declaration and every declaration a docblock precedes (so each documented class member and each private helper), each with its line, its full docblock and its signature, every line numbered (`sourceSurface`, a heuristic line scanner). A removed file gets none. `conformance/tests/xaravel/fidelity-review.test.ts` tests the new case, F-9 in `conformance/review/fidelity.md` says the prompt carries it, and `docs/ops/fidelity-review.md` documents it.

The reject this answers is reviewer 1's F-9 reject at tree `1030dbd363183bdab85c27ca480196950948ad79`: its findings on `packages/runtime/src/scope/interleave.ts` ("Supply the complete retained interleave docblock and helper declarations") and on `packages/runtime/src/scope/scope.ts` ("Supply the complete touched source file or an exhaustive declaration-and-tag listing"). The listing is the second form that finding names. For `interleave.ts` it shows the retained `@asyncRoot callback` tag, its full docblock and the `startUnit` helper.

Story 9.3 re-applies `_bmad-output/implementation-artifacts/9-3-blocked-attempt-2.patch` unchanged and re-runs the Fidelity Review. The tree changes with this ruling, so the standing-reject rule (ESC-8.8-1) lets the review run, and the new review must address the reject's findings.

Rationale:

- **The evidence exists, but the tool never showed it.** Both files are in the reviewed tree. The prompt carried only each file's hunks (`fence(file.patch, "diff")`), so no in-Story change could show the reviewer the regions the diff leaves out. That is the gap the 2026-10-21 amendment lets the orchestrator close.
- **It only adds evidence.** No checklist check (F-1..F-10), verdict rule, verdict schema, standing-reject rule, reviewer choice or `story:check` clause changes, and no evidence is removed or narrowed. No assertion, expected value, skip or `adapted:` marker changes, and no divergence is added.
- **Option 1 over option 2.** The listing has what F-9 judges (tags, docblocks, declarations) and grows with the number of declarations, not with the size of the file. A whole file would grow the prompt toward `PROMPT_CAP` on large sources.

This ruling clears XT-runtime-9, XT-runtime-10 and XT-runtime-11. Story 9.3 is unblocked.
