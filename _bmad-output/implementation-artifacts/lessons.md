# Lessons

Durable, cross-epic process lessons from epic retrospectives. Every `bmad-build-auto` run loads this file as a persistent fact (`_bmad/custom/bmad-build-auto.toml`).

The orchestrator appends to it after each retrospective (`tools/orchestrator/iteration.md`, step C), one or two lines per lesson, each citing its retrospective document. It stays under 150 lines; older entries are consolidated, not dropped. The Maintainer may promote entries into `AGENTS.md`.

## Lessons

- (epic 1) A deferral must name the Story or Epic that takes it, and that target's ACs must actually cover it; check the chain when you defer. Epic 1 deferred CI gating from Stories 1.1, 1.3, 1.5 and 1.6 to Story 1.7, whose ACs never asked for it, so no CI job runs `bun test`, `tsc` or the graph check. Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md`
- (epic 1) Separate agent-run steps from Maintainer-run live steps in the spec up front: ruleset apply, token scopes, environments, merges. Three of eight Epic 1 Stories stopped on a permission the spec did not anticipate (1.2 merge, 1.4 `workflow` scope, 1.7 live ruleset apply). Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md`
- (epic 1) The orchestrator runs as the Maintainer (org admin) and merges with `--admin`, so a check or ruleset that relies on identity separation is not verified by passing; report it as unverifiable, never as met. Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md`
- (epic 1) When a Story is done, update both its sprint-status key and its `stories/<id>.md` manifest `status`; Epic 1 left every manifest at `backlog`, so the ownership check still counts finished Stories as open. Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md`
- (epic 1) A contract between two Stories' tools (Escalation names vs manifests, write-scope allow-list vs release job, scaffolder references vs graph peers) has no owner in either Story's review; name the other side and test it from both ends. Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md`
- (epic 1) A live check (`ruleset:verify`, release `gate`) must fail loudly with no credentials rather than report drift or pass; run it with the token set when you record it as verified. Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md`
- (epic 1) Every orchestrator comment on the status issue starts with the robot-emoji prefix; Epic 1's first six lacked it, which makes them look like Maintainer comments to the checkpoint `go` scan. Source: `_bmad-output/implementation-artifacts/epic-1-retro-2026-10-17.md`
