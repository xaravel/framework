---
title: 'ESC-14.6-4: include Upstream PHP test traits in Fidelity evidence'
type: 'bugfix'
created: '2026-10-27'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Story 14.6's review at tree 19fcf0359703dc9d0b974ee200f18d78f01d0acf rejects core F-2/F-3 because the prompt omits the committed CountsEnumerations trait used by its Upstream test. Under MAINT-2026-10-16 amendment 2026-10-21 and MAINT-2026-10-22-fidelity-whole-files, widen evidence (h) to follow PHP test trait dependencies generally. Carry the complete trait files and their helper bodies, including relative namespace references and transitive traits, through the existing size and omission rules. Preserve all checklist checks, caps, verdict rules, reviewer selection and grader behavior. Record the orchestrator decision; Story 14.6 remains blocked by separate unresolved runtime contracts and must rerun review after the tooling fix.

</frozen-after-approval>

## Implementation Notes

- No intent gaps or irreversible local changes. Small footprint: evidence collector, existing conformance tests, evidence documentation, decision and this spec.
- Reuse wholeFileEvidence's tier 1 and budget accounting; withWholeFiles supplies Inventory source paths because Inventory displays only method fragments. Read complete source files to resolve class trait uses. Follow local snapshot traits with cycle protection; do not import runtime classes or alter sections (a)..(g).

- Implementation: added upstreamTraitPaths, seeded whole-file traversal from Inventory and existing PHP evidence, preserved tier/budget behavior, and documented the supplied evidence. Runtime blockers remain unchanged.
- Verification initially caught a missing dirname import; changed to the existing posix.dirname helper before final verification.

## Review Triage Log

Blind Hunter review (six findings; floor arithmetic supplied by reviewer):

- medium, patch: namespace-root inference missed traits under framework/src; resolution now also checks the same snapshot package's src tree, covered by an imported Shared trait.
- medium, patch: aliases leaked across multiple namespace blocks; namespace transitions now reset aliases and mapping, covered by two braced namespaces reusing Selected.
- medium, patch: anonymous classes were skipped at deeper brace levels; class trait-use syntax is now followed below namespace depth, while closure use(...) stays excluded; covered by a nested anonymous class.
- medium, patch: heredoc/nowdoc contents could corrupt brace depth; both literal forms are masked before scanning, with regression coverage.
- medium, patch: unavailable local dependencies vanished; inferred trait paths now enter normal unavailable-file evidence, with a missing-file regression.
- low, patch: synthetic fixtures alone did not demonstrate the original reject; the actual Inventory row and snapshot now verify that the prompt contains the complete recorder and final assertion bodies.

- Final verification: Fidelity tool tests passed (3 tests, 1,074 expectations); bun run typecheck, bun run lint, bun run escalations:check and git diff --check passed. Blind Hunter findings were patched; no findings deferred.
