---
decision: approved
decided_by: monitor
date: 2026-10-31
scope: Epic 16 retrospective items 5 and 6
---

# Amendment: item 5's runtime fix may update the two Collections tests that pin the old error

Item 5 (`decisions/MAINT-2026-10-31-epic-16-item-5.md`) built the runtime fix, but the full harness then failed XT-collections-11 and XT-collections-12 (#607). Those Xaravel Tests assert PHP's `Cannot use positional argument after named argument during unpacking` for a string key before a positional one, where the approved behaviour now throws the DIV-9.15 `TypeError` first. Updating them is outside item 5's `packages/runtime` scope.

This is a mechanical scope fix to a ruling the monitor made under the Maintainer's TypeError standing rule, so no new question goes to the Maintainer. The Maintainer is told.

- New action item `epic-16-retro-item-6-runtime-callunpacked-order-and-collections-tests` replaces item 5, which is closed as superseded. Its scope is `packages/runtime` and `packages/collections`: item 5's runtime change, from item 5's saved attempt, plus XT-collections-11 and XT-collections-12 asserting the DIV-9.15 `TypeError` for those rows, each changed assertion marked `// adapted:DIV-9.15`, with no other assertion removed or weakened.
- Its PR takes item 1 out of epic 16's `waiting_on_maintainer`, as item 5's would have.
