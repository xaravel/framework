---
decision: approved
decided_by: Maintainer
date: 2026-10-22
scope: action item epic-9-item-1-consequence-rows (the rule for a Component's consequence row)
---

# Maintainer ruling: a Component's consequence row is what its Epic declares, plus AD-2 and AD-6

The Maintainer gave this ruling on 2026-10-22, in the Maintainer's session.

## Why

`decisions/ESC-9.1-3.md` asked every Phase 1 Component to get a `CONSEQUENCE_SOURCES` row in `tools/xt-coverage/consequences.ts` before its first Story with Xaravel Tests. It gave a mechanical rule:
- the FRs and ADs of each spine Capability Map row whose "Lives in" names the Component;
- plus every AD whose Rule names the package.

Applied to `contracts`, that reading pulled in passing mentions. AD-16's conformance rules are one example: no contracts test can cover them. The same reading also did not reproduce the `runtime` row the Maintainer had set. `spec-retro-9-consequence-rows.md` records both problems. Story 10.1, the first contracts Story with Xaravel Tests, stopped on the question (#319).

## The rule

From `contracts` on, a Component's row is built like this.

1. **Start from the Epic.** Take the Component's Epic's `**Covers:**` line in `_bmad-output/planning-artifacts/epics.md`:
   - every `AD-<n>` it covers or implements, keeping only those whose spine Rule is a bullet list;
   - every `FR-<n>` it covers or supports, keeping only those with a `**Consequences (testable):**` list in the PRD.
2. **Add AD-2 and AD-6** for every package Component. AD-2 makes package edges mirror Upstream `composer.json` and stay acyclic. AD-6 is the DIV-1 async surface. Every package must keep both.
3. **Ignore everything else.** A passing mention of the package in another AD's Rule does not add that AD. The Epic says what the Component owns.

Unchanged:
- The `conformance` row and the Maintainer-set `runtime` row (ESC-9.1-3) stay as they are.
- An AD whose Rule is a table (AD-22, AD-26) still has no consequence ids. Its coverage stays with its Stories' acceptance criteria.

## This ruling's change

- **`contracts` row:** `{ frs: [10, 19, 21], ads: [1, 2, 6, 27] }`. Epic 10 declares "Covers: AD-1, AD-27; supports FR-10, FR-19 and FR-21".
- **Generated file:** `conformance/xaravel-consequences/contracts.jsonl`, 38 consequences, from `bun run xt:consequences`.
- **Test:** XT-conformance-126 expects the third file. It derives the `contracts` row from Epic 10's Covers line and the PRD and spine lists, rather than from a copy, and checks that every listed FR and AD appears in the file.
- **Bookkeeping:**
  - Action item `epic-9-item-1-consequence-rows` is `done`, and the Epic 9 retro gate no longer waits on it.
  - Story 10.1 is back to `in-progress`.

Later Components get their rows the same way, each in an Infrastructure change before the Component's first Story with Xaravel Tests.
