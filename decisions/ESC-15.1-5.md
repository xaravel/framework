---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16, amendment 2026-10-21)
date: 2026-10-30
escalation_sha256: "0b020324d4ec048050dd07c2be803aa101f5974006dea03fc7109f38fe027d85"
---

# ESC-15.1-5: approved, option 1 ((i) carries the Escalation an added skip line cites, and its decision)

`tools/fidelity-review/fidelity-review.ts` now shows the reviewers the Escalation a held skip line cites:

- **Which lines.** Evidence (i) already groups each added Expectations line that is a `skip` with reason `not-ported-yet` or `blocked-by:<c>` by Component, reason and Escalation, and gives an entry to each group that names another Component (`skipEligibilityEvidence`, ESC-14.2-5). A group whose lines cite an Escalation is now followed by that Escalation (`escalationEvidence`), once per Escalation however many groups cite it.
- **What it carries.** `conformance/escalations/<id>.md` in full, then `decisions/<id>.md` in full. An open Escalation's decision entry is unavailable, saying it has no decision yet. A cited id with no Escalation file is one unavailable entry saying the file does not exist, and an id that is not a plain file name is not read.
- **Where it goes.** In section (i), now headed "The `blocked-by` rule, the Phases and first Epics of the Components added skip lines name, and the Escalations they cite", right after the group's entry.

`conformance/tests/xaravel/fidelity-review.test.ts` (XT-conformance-161) tests each case: a cited Escalation with a decision (ESC-14.2-4 in the repository, both texts in full), an open Escalation with no decision, a decided one, a missing id, an id that is not a file name, one Escalation cited by two groups shown once, and how the entries render in the prompt.

The **Skip Reasons** evidence note in `conformance/review/fidelity.md` now says what the prompt carries; no item's **Check.** changes. `docs/ops/fidelity-review.md` describes the new entries.

The rejects this answers are both reviewers' F-4 fails on `conformance/expectations/config/framework/tests/Config/RepositoryTest.jsonl` at trees `adb46be542fb95e41482d84c7b9c272a80551d44` and `08adfed2e400e233963be7ae78a25ecbe0a463c8` (base `eb40be35`) of Story 15.1: "Supply conformance/escalations/ESC-15.1-1.md and any applicable ruling explaining why testItIsMacroable remains unported" (reviewer 1, codex gpt-6.1-sol, missing-evidence) and "neither conformance/escalations/ESC-15.1-1.md nor a ruling is in the prompt" (reviewer 2, claude-opus-5-5). Run on that change, (i) now shows ESC-15.1-1 in full, with its decision once one exists.

**The re-run.** Story 15.1 stays `blocked` on ESC-15.1-1 and ESC-15.1-4, which wait on the Maintainer. When it resumes, it re-runs its Fidelity Review on a changed tree with its spec's base; this ruling changes the tree, so the standing-reject rule (ESC-8.8-1) lets the review run, and the new review must address the reject's findings.

Rationale:

- **The evidence exists, but the tool never showed it.** `skipEligibilityEvidence` already read the cited Escalation (`escalationText`), but only to find the Components it names. Evidence (f) resolves an `ESC-…` citation only to `decisions/<id>.md`, which an open Escalation does not have. The 2026-10-21 amendment lets the orchestrator close that kind of gap.
- **It only adds evidence.** No checklist check (F-1..F-10), verdict rule, verdict schema, standing-reject rule, reviewer choice or `story:check` clause changes, and no evidence is removed or narrowed. No assertion, expected value, skip, Skip Reason rule or `adapted:` marker changes, and no divergence is added.
- **Option 1 over option 2.** A comment in the Ported Test citing the Escalation reaches only evidence (f), which shows decisions, so it cannot show an open Escalation.
- **It is general.** Every Story that holds a line on an Escalation now shows the reviewers that Escalation, and its ruling once there is one.
