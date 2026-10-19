---
decision: approved
decided_by: Maintainer
date: 2026-10-19
scope: Epic 5 retrospective items 3, 7, 8, 9 and 10
---

# Maintainer rulings: Epic 5 items 3, 7, 8, 9 and 10

The Maintainer gave these rulings on 2026-10-19 in the Maintainer's session, accepting each recommendation.

## Item 3: sprint status stays the only authority

`epic-5-retro-item-3-full-run-conclusion-and-manifest-sync` is done. Its built half (the done check requires the `ratchet` job's success, and `stories/5.7.md` to `5.10.md` say `done`) merged in #168. The proposed check that fails when a sprint-status `done` Story's manifest is not `done` is not built. `story-manifests.md` makes sprint status the only authority, a Story PR from Epic 9 on cannot edit `stories/`, and every tool already reads the effective status through `applySprintStatus`. A manifest's `status` field is informational: the orchestrator refreshes it in bulk, on a `planning/*` branch, when it runs each epic's retrospective.

## Item 7: rulings done; the citation refinement goes to the orchestrator

ESC-5.7-1, ESC-5.8-1 and ESC-5.9-1 are ruled (#181, #182). ESC-5.7-1's `test_ids` stays XT-conformance-121, as its ruling says. The remaining part, refining each Xaravel Test's `FR-n` / `AD-n` citations to the `FR-<n>.<k>` / `AD-<n>.<k>` bullets it verifies (ESC-5.9-1 part 2), is now owned by the orchestrator. The Fidelity Review checks each mapping.

## Item 8: the Maintainer's live steps

Done, except `ruleset:apply`, which moves to the Epic 8 checkpoint with Epic 1 items 9 and 12 (the agent identity and the `Agent pushes` redesign).

- The `xaravel-bot` App (ID 5386144), the `bot` environment restricted to `main`, `XARAVEL_BOT_APP_ID` and `XARAVEL_BOT_APP_KEY` were set up, and the first supervised `bots` run (39314110858) passed with an empty plan.
- The 59 off-manifest Xaravel Test IDs are attached: each renumbered ID (XT-conformance-198..253) joins the Story that owns the ID it was renumbered from, with that Story's acceptance-criterion label; XT-conformance-188, -189, -196 and -197 join Stories 5.7, 5.8 and 5.9.
- `.devcontainer/` becomes a Protected Path (`conformance/protected-paths`, `CODEOWNERS`, and the spine's AD-16 list), because it defines the reference environment's pins.
- `AGENTS.md`'s harness and devcontainer lines landed in #183.

## Item 9: part (a) rejected, part (b) goes to the Fidelity Review

- **(a)** Not built. `decisions/ESC-3.1-1.md` defines a Test ID as Differential exactly when a request captures its input, so "a Differential Test with no request" cannot exist. That definition stands.
- **(b)** The Inventory records only `pass`/`fail` per Variant, not Upstream's error, so `story:check` cannot compare a fixture's `output.error` with it. Until grader data records it, Story 8.5's reviewers' checklist checks that every Oracle fixture whose output is an error is the error Upstream's test expects.

## Item 10: covering targets for the Epic 5 deferrals

- **5.1** `pin-bump` `applyBump` keeps line order on rename: Epic 5 action item 17 (orchestrator) re-sorts the shard. The `ai` ID reset to `not-ported-yet` is stricter, not weaker, and is accepted.
- **5.9** The renumbered IDs are attached (item 8). Paging past 100 runs per sha is accepted as low and unverified.
- **5.10** The PR paths filter: Epic 5 action item 18 (orchestrator) adds `conformance/harness/**`, `bun.lock`, `package.json` and `.bun-version`. The devcontainer CLI path and linux/arm64 stay live-only, as `docs/ops/devcontainer.md` says. `.devcontainer/` protection is item 8. Tag-pinned images are accepted, as CI's own services are tag-pinned.
