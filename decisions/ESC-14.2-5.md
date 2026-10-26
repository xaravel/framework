---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16, amendment 2026-10-21)
date: 2026-10-26
escalation_sha256: "77ff2800a0b79b1547e0a2a980bbe735cc384d0e14ed156c12e0bbb1b7a91b49"
---

# ESC-14.2-5: approved, option 1 (F-4's evidence carries the Skip Reasons table and the `blocked-by` rule)

`tools/fidelity-review/fidelity-review.ts` now gives the reviewers the existing evidence F-4 needs to judge a held line's Skip Reason:

- **The Skip Reasons table.** The system text carries the `## Skip Reasons and their rules` section of `conformance/README.md`, verbatim, after the `## Precedence` section it already carried (`skipReasonsSection`). A README without that section is shown as `unavailable`.
- **Evidence (i), `blocked-by` eligibility.** When an added Expectations line is a `skip` with reason `not-ported-yet` or `blocked-by:<c>`, the tool groups those lines by their test's Component, reason and Escalation (`skipEligibilityEvidence`). A group is shown only when it names another Component, in its `blocked-by:<c>` or in its Escalation's text (`packages/<c>`, `@xaravel/<c>` or `blocked-by:<c>`). The section starts with the `blocked-by` branch of `reasonProblem` in `tools/expectations/reasons.ts`, verbatim with its line range. That rule also accepts the same Phase with a later first Epic, which the README table does not say. Each group then lists its Test IDs, and the Phase and first Epic of the test's Component and of each named one. These are read as `expectations:reasons` reads them (`contextFor`): the Phase from `tools/scaffold/packages.jsonl`, and the first Epic as the lowest `epic` of a `stories/` manifest. The Escalation said "from sprint status", but the check reads the manifests, so the evidence does too. Last, each group gives what `checkLine` says of its first line with `blocked-by:<c>`.

`conformance/tests/xaravel/fidelity-review.test.ts` (XT-conformance-161) tests each new case:

- the README section, and its place in the system text after Precedence;
- the `unavailable` text;
- the empty (i) text;
- a `not-ported-yet` line held by ESC-14.2-4: the rule, then `runtime` shown as invalid, Phase 1 and Epic 9 against collections' Phase 1 and Epic 14;
- a `blocked-by:auth` line, shown as valid;
- 25 lines folded into one group with a count;
- lines that give nothing: one naming no other Component, a `pass` line, an `upstream-skip` line, a non-Expectations file and a malformed line;
- `gatherEvidence` carrying (i).

`conformance/review/fidelity.md` gains a **Skip Reasons** evidence note above the checklist items; no item's **Check.** changes. `docs/ops/fidelity-review.md` describes (i) and the system text.

The reject this answers is both reviewers' F-4 reject at tree `1d028ca58e3c65eacd3c022e2578aff607425a4a` (base `b5938e16`) of Story 14.2, on the twelve ESC-14.2-4 lines. Reviewer 1 (codex, gpt-6.1-sol): "supply the actual tools/expectations/reasons.ts eligibility rule and applicable component ordering as review evidence or a decision record". Reviewer 2 (claude, claude-opus-5-5): "The precedence exception relies on the blocked-by eligibility rule at lines 270-282 and on its Phase/Epic ordering of components. Neither is in the prompt". Run on those twelve lines, (i) now shows that rule, `collections` as Phase 1, first Epic 14, and `runtime` as Phase 1, first Epic 9. It also shows `expectations:reasons`' verdict on `blocked-by:runtime`: invalid, "not built in a later Epic (runtime: 9, collections: 14)".

**The re-run.** Story 14.2 re-runs its Fidelity Review on a changed tree with its spec's base. This ruling changes the tree, so the standing-reject rule (ESC-8.8-1) lets the review run, and the new review must address the reject's findings.

Rationale:

- **The evidence exists, but the tool never showed it.** The README table and the `blocked-by` rule are on `main`, in `conformance/README.md` and `tools/expectations/reasons.ts`, and the Phases and Epics are in `tools/scaffold/packages.jsonl` and `stories/`. The prompt carried only README's Precedence section. The 2026-10-21 amendment lets the orchestrator close that kind of gap.
- **It only adds evidence.** No checklist check (F-1..F-10), verdict rule, verdict schema, standing-reject rule, reviewer choice or `story:check` clause changes. No evidence is removed or narrowed: Precedence is still carried verbatim. No assertion, expected value, skip, Skip Reason rule or `adapted:` marker changes, and no divergence is added. `conformance/README.md` and `tools/expectations/reasons.ts` are read, not changed.
- **Option 1 over option 2.** Option 2, `blocked-by:runtime`, fails `bun run expectations:check`, as (i) now shows the reviewers.

This ruling clears only the F-4 reject. The twelve Test IDs stay `not-ported-yet` and held by ESC-14.2-4, a `contract` Escalation that the monitor rules on under `decisions/MAINT-2026-10-26-runtime-builtins.md`. Story 14.2 stays `blocked` until that ruling.
