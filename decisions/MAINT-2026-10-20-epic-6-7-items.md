---
decision: approved
decided_by: Maintainer
date: 2026-10-20
scope: Epic 6 retrospective item 13; Epic 7 retrospective items 7 and 8
---

# Maintainer rulings: Epic 6 item 13, Epic 7 items 7 and 8

The Maintainer gave these rulings on 2026-10-20 in the Maintainer's session, accepting each recommendation.

## Epic 6 item 13: a gate Story with no manifest yet is a note

`epic-6-retro-item-13-story-check-api-surface-gate` is done. The 13 gate Stories without a manifest (28.3, 32.3, 33.3, 40.2, 43.6, 45.2, 50.3, 54.6, 62.6, 64.3, 65.3, 66.5 and 68.3) are sprint planning's documented deferrals. For them `ownership manifests` prints a `note:` and does not fail. A Story cannot be worked or accepted without a manifest, `story:check`'s `manifest` clause requires one, and the `api_surface_gate` field is required as soon as the manifest exists, so the intent of `decisions/MAINT-2026-10-19-epic-6-items.md` item 8 holds. Creating 13 placeholder manifests now is not required.

## Epic 7 item 7: SM-1's "none remaining" covers the alpha Variants

`epic-7-retro-item-7-sm1-none-remaining-ruling` is done. PRD SM-1's "no `not-ported-yet` or `blocked-by` entries remain" sits under the alpha gate, which is measured "on every alpha Backend Variant", so it covers those Variants only, as `report.ts` reads it. Engines that arrive after the alpha are measured when their Phase lands. Test IDs that run on no alpha Variant (`alpha.noAlphaLine` in `report.json`, #224) stay outside the gate and keep their own line on the dashboard.

## Epic 7 item 8: SM-1's target gets an orchestrator item, not a Story

`epic-7-retro-item-8-sm1-target-covering-story` is done. The dashboard tooling exists, so the work is a tool change. Epic 7 action item 10 (owner: orchestrator) does three things:
- it records the Phase and a Test Inventory hash in each conformance history line;
- it adds a check that fails when the Conformance Rate decreases between Phase boundaries under the same Baseline Pin;
- it shows the Test Inventory diff between Pin series on the dashboard.

It lands before Story 8.8's Phase 1 gate closes, which is the first Phase boundary where the check applies.
