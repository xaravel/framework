---
decision: approved
decided_by: Maintainer
date: 2026-10-24
scope: Fidelity Review, rejects for missing evidence only, and WHOLE_FILE_CAP
---

# Maintainer ruling: a reject for missing evidence alone is noted, not blocking

The Maintainer gave this ruling on 2026-10-24, in the Maintainer's session.

## Why

In one evening, a Fidelity Review reject stopped the loop five times for evidence the prompt could not carry: ESC-10.2-7, -8, -9, -10, and `epic-10-item-6`'s review.
- Each finding said "I cannot see enough to confirm this". None said the change was wrong.
- Each one cost a Maintainer ruling, a tool change or a waiver, and a full re-review.

The Maintainer wants such a gap noted and the loop to move on. He also wants the gaps that matter caught, without the loop judging its own work.

## The rule

1. **The reviewers label each finding.** A finding carries `kind`:
   - `defect`: the change is wrong, or the reviewer found a problem in it;
   - `missing-evidence`: the change may be right, but the prompt lacks what the reviewer needs to confirm it.

   The reviewer labels it, not the orchestrator. The verdict schema requires the label, and the prompt asks for it to be truthful. A recorded finding with no `kind` (from before this ruling) is a defect.
2. **Missing evidence alone does not block.** A reject counts as a pass when both hold:
   - every item it fails is outside the core items;
   - every finding on those items is `missing-evidence`.

   Either reviewer, or both, may be such a reject, beside a `pass` or a waived reject. The cross-model rule (ESC-8.5-1) still applies, and so do the standing-reject rule (ESC-8.8-1) and its carried findings.
3. **The core items are never auto-accepted.** F-2 (no expected value is weakened), F-3 (no assertion is removed without a DIV clause) and F-8 (no stub, fake or partial implementation) are the grader's core protections. A fail on any of them blocks, whatever its findings' kind. Only the Maintainer's waiver (`decisions/MAINT-2026-10-23-fidelity-waivers.md`) can accept one.
4. **Note it and move on.** The gap is visible in three places:
   - The spec's verdict record keeps each finding with its kind, and its rendered line ends in _(missing evidence)_.
   - `review` prints `evidence gap noted: reviewer <n> F-<m> <path>: <detail>` and exits 0.
   - The count's detail says `… reject noted as an evidence gap (F-<m>: missing evidence only)`, in `status` and on `story:check`'s `approvals` line.

   The orchestrator copies each noted gap to the Maintainer inbox, under "Evidence gaps noted", and raises no Escalation for it (`tools/orchestrator/iteration.md`, step G). The next retrospective reviews the list and decides which gaps are worth closing at the source.
5. **Shrink the gap too.** `WHOLE_FILE_CAP` goes from 60,000 to 200,000 characters. So a data file a changed test reads, such as `conformance/api-surface/contracts.jsonl` (191,542 characters), is shown whole, not as an excerpt. `PROMPT_CAP` stays 1,000,000. Section (h) still fills only what the cap leaves, files a changed test reads first.

## What does not change

The checklist, the "Fail when unsure" rule, how reviewers are chosen, Maintainer waivers, and the rule that the orchestrator first widens (h) for a gap it can close itself (`decisions/MAINT-2026-10-22-fidelity-whole-files.md`, "Future evidence gaps"). A gap that is noted can still be closed later by widening (h).
