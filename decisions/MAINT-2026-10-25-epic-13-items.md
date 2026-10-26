---
decision: approved
decided_by: Maintainer
date: 2026-10-25
scope: Epic 13 retrospective items 2, 3, 4 and 6
---

# Maintainer ruling: Epic 13 items 2, 3, 4 and 6

The Maintainer gave this ruling on 2026-10-25 in the Maintainer's session, on `epic-13-retro-2026-10-25.md` (#444). The orchestrator's monitor recommended each answer.

## Item 3: no per-test AC, and a standing answer

Story 13.1's new `blocked-by:collections` and `blocked-by:mail` lines get no named re-verification AC. The `epics.md` global rule for `blocked-by` makes the Epic that delivers the blocking Component re-verify its lines (Epic 14 for collections, Phase 7's sweep for mail). Epic 12 item 4 settled the same question (`decisions/MAINT-2026-10-25-epic-12-items.md`).

This is now a **standing answer**. `tools/orchestrator/iteration.md` step C no longer routes such an item to the Maintainer: the retrospective sets it `done` in its own PR, citing this ruling.

## Item 4: a check for stale result notes

The clean-up lesson failed four times, so it becomes a check rather than another instruction:

- `tools/orchestrator/iteration.md` section 3: when the loop commits a `bmad-build-auto-result-*.md` note, its frontmatter gets `unit: <action item id or sprint key>`. The note is deleted in the PR that sets that unit `done`.
- **XT-conformance-1000** (`conformance/tests/xaravel/scratch-notes.test.ts`) fails on a note with no `unit:`, a unit sprint status doesn't know, or a unit that is `done`.

## Item 2: done here

The check fails on the one note on `main`, `bmad-build-auto-result-retro-13-reflection-contracts.md`, because its item is done (#442). This PR deletes it, which is item 2. Its mentions in the retrospective and in `MAINT-2026-10-25-story-13-1-second.md` stay, as history.

## Item 6: PHP edges of reflection

- **(a) A closure's `self` / `parent`.** A JavaScript closure has no declaring class, so its marker resolves to `null`. This is recorded as a sentence in DIV-3.2. `inject` gains no scope argument, because the case is rare in Laravel code.
- **(b) `isCallable('Class::instanceMethod')`.** This matches PHP 8, where `is_callable` gives `false` for a non-static method named statically.
  - XT-reflection-1's pin of `true` is re-pinned to `false`. That is more faithful to PHP, not weaker.
  - The change is folded into the orchestrator's item 5, which already edits `packages/reflection`.

## Bookkeeping

Items 2, 3, 4 and 6 are `done`, and epic 13's `waiting_on_maintainer` is empty. Items 1 and 5 stay with the orchestrator, with item 5's `action` extended.

## Amendment: item 5's scope

#447 parked the orchestrator's item 5. Its L1 fix, testing a parameter's own token, needs the runtime's `ReflectionNamedType` to carry the parameter's Spec value. Today it holds only the FQCN string, and the Spec sits in `ReflectionParameter`'s private `#spec`.

The Maintainer approved widening the item:
- **Scope:** `packages/runtime`, limited to letting `ReflectionNamedType`, and the parameter reflection that builds it, carry the Spec's class or token beside its FQCN name, with an XT-runtime case.
- **The rest:** `Reflector.isParameterSubclassOf` then tests that value. Everything else in item 5 stands as written.

The item leaves epic 13's `waiting_on_maintainer` and stays `in-progress`.
