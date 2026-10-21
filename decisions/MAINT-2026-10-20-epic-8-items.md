---
decision: approved
decided_by: Maintainer
date: 2026-10-20
scope: Epic 8 retrospective items 1 and 2
---

# Maintainer rulings: Epic 8 items 1 and 2

The Maintainer gave these rulings on 2026-10-20 in the Maintainer's session, accepting each recommendation. Finding codes are those of `_bmad-output/implementation-artifacts/epic-8-retro-2026-10-20.md`.

## Item 1: Phase 0 exit (S1)

`epic-8-retro-item-1-phase-0-exit-signature` is done. `decisions/PHASE-0-EXIT.md` is signed in the same PR as this ruling, so the Phase 1 gate (`tools/ownership/phase-gate.ts`) opens for Epic 9 Story PRs once it is on `main`. The Epic 8 checkpoint still opens only on the Maintainer's `go` on the status issue.

## Item 2: a Story's own bookkeeping passes `ownership` (S2)

`epic-8-retro-item-2-story-bookkeeping-scope` is done, by extending the check rather than the waiver. `allowedPath` in `tools/ownership/ownership.ts` also allows, for a `story/<id>` PR:
- its own manifest `stories/<id>.md`, when the diff changes only the `status:` frontmatter line;
- its own spec under `_bmad-output/implementation-artifacts/` (`spec-<id with dots as dashes>-*.md`).

Any other edit to a manifest, or to another Story's manifest or spec, stays `out of scope:`. The second amendment of `decisions/MAINT-2026-10-16-unattended-orchestrator.md` keeps its waiver for `_bmad-output/implementation-artifacts/` (so `sprint-status.yaml` and `lessons.md` still merge), and its Epics 1–8 limit is unchanged.

This ruling approves the orchestrator changing `tools/ownership/` for exactly this, as Epic 8 action item 11 (owner: orchestrator), with tests for each allowed and each refused case. It is the one exception to that amendment's rule that the orchestrator never edits `tools/ownership/` to make the check pass. Item 11 lands before Story 9.1's PR merges.

## Items waiting for Xarabot

Epic 1 items 9 (the `Agent pushes` ruleset and the merge queue), 12 (the agent identity) and 13 (release setup and version pins), and Epic 5 item 16 (the bot App bypass), stay in `waiting_on_maintainer`. They move to Xaravel's adoption of Xarabot, whose per-person `edanisko-xarabot` bot user is the agent identity these items were waiting for.
