---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16, amendment 2026-10-21)
date: 2026-10-27
escalation_sha256: "d82efd502e6474337eb534cc5c2ae795e1dcb5ca9fd3a16fe031f31506b5b3cd"
---

# ESC-14.6-4: supply Upstream test trait dependencies as whole-file evidence

Approve the recommended evidence-only tooling route. Story 14.6's Fidelity Review at tree `19fcf0359703dc9d0b974ee200f18d78f01d0acf` failed F-1/F-2/F-3 because its prompt omitted the committed `conformance/upstream/framework/tests/Support/Concerns/CountsEnumerations.php`. The source is 97 lines and fits the existing file cap. This is repository evidence the tool did not supply, covered by the 2026-10-21 amendment and the whole-file ruling's instruction to widen (h) generally.

Evidence (h) follows PHP trait dependencies from the complete Upstream test sources named by the Inventory, and from snapshot PHP files already collected in (h). It resolves namespace-relative trait names, imported namespace aliases and absolute names, follows local trait dependencies transitively, and includes each complete trait only once. This carries the assertion helper bodies, including the CountsEnumerations recorder and its final comparison. Existing whole-file size limits and explicit omission notes still apply. Inventory method fragments remain fragments and are not marked as files already shown in full.

The change is limited to `tools/fidelity-review/fidelity-review.ts`, regression cases in `conformance/tests/xaravel/fidelity-review.test.ts`, and matching evidence notes in `conformance/review/fidelity.md` and `docs/ops/fidelity-review.md`, with its own implementation records. No checklist Check, verdict rule or schema, standing-reject rule, reviewer selection, story:check clause, cap, assertion, expected value, skip or divergence changes. No evidence is removed or narrowed, and this is no Fidelity waiver.

Story 14.6 remains blocked by ESC-14.6-1/2/3, which this ruling does not decide. After those contracts land, resume its existing spec and rerun Fidelity Review on the changed tree, addressing the recorded reject. The former core missing-evidence reject is not itself an approval.
