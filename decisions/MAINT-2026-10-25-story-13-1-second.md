---
decision: approved
decided_by: Maintainer
date: 2026-10-25
scope: Story 13.1 (Reflector and ReflectsClosures), ESC-13.1-7 to ESC-13.1-10
---

# Maintainer ruling: Story 13.1, second set

The Maintainer gave this ruling on 2026-10-25 in the Maintainer's session, on the four gaps that #436 raised after the first set (`decisions/MAINT-2026-10-25-story-13-1.md`). The orchestrator's monitor agreed with the orchestrator's recommendation on ESC-13.1-7, -8 and -9. On ESC-13.1-10 it recommended option 2, a standing fix, and the Maintainer took it.

| Escalation | Option | What changes |
|---|---|---|
| ESC-13.1-7 | 1 | The runtime keeps a table from a contract token's FQCN to the token, written by `contract(...)`; reflection resolves interface names through it |
| ESC-13.1-8 | 1 | Spine AD-26: a backed enum declares `static backingType`; the runtime gains `ReflectionEnum` and `enum_exists` |
| ESC-13.1-9 | 1 | `@xaravel/assert`'s `assertInstanceOf` / `assertNotInstanceOf` accept a class-string |
| ESC-13.1-10 | 2 | PRD and `tools/expectations/reasons.ts`: `blocked-by:<c>` may name a same-Phase Component built in a later Epic |

None of these adds a DIV clause. Each brings Xaravel closer to PHP or PHPUnit, or fixes a grader rule, rather than diverging.

## The route

1. **Infrastructure first.** Action item `epic-13-item-2-reflection-contracts` builds all four as one Maintainer-approved Infrastructure change:
   - the token table in `@xaravel/runtime`;
   - `ReflectionEnum` and `enum_exists` in `@xaravel/runtime/php`;
   - class-string support in `@xaravel/assert`;
   - the later-Epic rule in `tools/expectations/reasons.ts`. A Component's Epic is the Epic of its first Story, and the rule's comment and `docs/` follow.

   Each part gets a Xaravel Test. No assertion is removed or weakened. The loop takes it before the Story.
2. **Then Story 13.1.** It resumes from `story/13.1-impl` (`differ=0` there), ports the four held Test IDs, and runs its review layers and Fidelity Review.

### Amendment 2026-10-25: the item's scope

#438 found two gaps in how step 1 was written:
- `contract(...)` lives in `packages/contracts`, which the item did not name.
- The `--item` Fidelity Review cannot see `tools/expectations/reasons.ts`.

The Maintainer's session settled both, within this ruling:
- **The item's scope is `packages/runtime`, `packages/contracts` and `packages/assert`.** `contract(...)` records each token through a new runtime export, because the runtime may not import contracts (AD-2).
- **The `reasons.ts` part (ESC-13.1-10) landed in the Maintainer's PR**, with its XT-conformance-92 cases, and is no longer part of the item. A Component's first Epic is the lowest `epic` among the `stories/` manifests for that Component. With no manifest, the old Phase-only rule applies, which fails closed.

The item leaves epic 13's `waiting_on_maintainer` and stays `in-progress`. Its planning notes are in `bmad-build-auto-result-retro-13-reflection-contracts.md`.

The six `blocked-by` lines for later Phases (mail, bus, database) need no AC of their own. The global rule and the Phase sweep Stories re-verify them, as `decisions/MAINT-2026-10-25-epic-12-items.md` item 4 settled.
