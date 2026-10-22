---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16, amendment 2026-10-21)
date: 2026-10-21
escalation_sha256: "6e2162af647532f0a9863471f6650f80fd511e4bbb7e16eb64e14a0aa2df2277"
---

# ESC-9.9-5: approved, option 1 (a bare `AD-<n>` with no consequence line carries its spine Rule)

`tools/fidelity-review/fidelity-review.ts` supplies an existing evidence item in more cases:

- **Evidence (e), cited consequences.** When an Xaravel Test cites a bare `AD-<n>` and no line in `conformance/xaravel-consequences/*.jsonl` has it, the entry now carries AD-`n`'s Rule from the architecture spine instead of `unknown consequence id AD-<n>`. A bullet Rule is shown as `AD-<n>.<k>: <bullet>` lines, numbered as `consequencesFor` numbers them (read with the existing `spineRules`, as evidence (d) already does for AD-6). A Rule that is not a bullet list, such as AD-26's table, is shown as its `- **Rule:**` line and everything up to the next top-level bullet. The entry is labelled as coming from the spine and fenced as markdown. A consequence line, when one exists, still wins, and the spine is not read for it. An AD the spine lacks, or one without a Rule, stays `unavailable` and says why.

`conformance/tests/xaravel/fidelity-review.test.ts` tests each new case: a bullet Rule, a table Rule, an AD with no Rule, an AD the spine lacks, a dotted `AD-<n>.<k>` and an `FR-<n>` (both unchanged), a consequence line winning without reading the spine, an unreadable consequences directory and spine, the real spine's AD-4 and AD-26, and the markdown fence in the prompt. `docs/ops/fidelity-review.md` says what (e) now carries. `conformance/review/fidelity.md` is left as it is: the prompt labels the evidence itself, and the open Maintainer PR #297 moves evidence wording out of each item's Check.

The reject this answers is reviewer 1's (codex, gpt-6.1-sol) F-7 reject at tree `fc6cb97928c8441c840f969d6e66665c218e9ba6` (base `a5ecf39`) of Story 9.9: "Supply the relevant AD-4 architecture bullets for XT-runtime-33 and XT-runtime-34. Evidence currently reports AD-4 as unknown, so the cited requirement cannot be compared with the tests." and "Supply the relevant AD-26 Traits architecture bullet for XT-runtime-31 and XT-runtime-32." Both Rules are in `_bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md` on `main`. Run against that base, the tool now gives XT-runtime-33 and 34 AD-4's bullets, and XT-runtime-31 and 32 AD-26's table, Traits row included.

**The re-run's base.** As decisions/ESC-9.9-4.md set, Story 9.9 re-runs its Fidelity Review on the changed tree with `--base a5ecf3905763930a6d18c518924c7e12afa3e303`. The tree changes with this ruling, so the standing-reject rule (ESC-8.8-1) lets the review run, and the new review must address the reject's findings.

Rationale:

- **The evidence exists, but the tool never showed it.** The tool looked up a cited AD only in the consequence files, and `runtime`'s row lists only some ADs, while AD-26 has no consequence ids at all because its Rule is a table. The 2026-10-21 amendment lets the orchestrator close that kind of gap.
- **It only adds evidence.** No checklist check (F-1..F-10), verdict rule, verdict schema, standing-reject rule, reviewer choice or `story:check` clause changes, and no evidence is removed or narrowed. No consequence row, `xt:coverage` or `CONSEQUENCE_SOURCES` changes, so `epic-9-item-1-consequence-rows` stays the Maintainer's. No assertion, expected value, skip or `adapted:` marker changes, and no divergence is added.
- **Option 1 over option 2.** Option 2 adds consequence rows, which is `epic-9-item-1-consequence-rows` (questions 1 and 5) and waits on the Maintainer.

This ruling clears XT-runtime-31, 32, 33 and 34, the Test IDs ESC-9.9-5 stops. Story 9.9 is unblocked.
