---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-17
escalation_sha256: "3c46fcbbf51f80a3d597859051cb2d54eed24a7a0f119a49c3dbedc305c6ffaf"
---

# ESC-2.8-1: approved, option 1 (use only existing formats)

`bun run pin:bump <tag>` is built as the Escalation's `proposed` text describes, with no new Expectations fields:

- It refuses while any `epic-<N>` key in `_bmad-output/implementation-artifacts/sprint-status.yaml` is `in-progress`, and lists those Epics.
- It moves only the `laravel/framework` line of `conformance/baseline-pin`. When the tag changes, it resolves the commit and tree as `docs/ops/upstream.md` describes, runs `upstream:sync`, prints the regeneration steps (`oracle:lock`, `oracle:build`, `inventory`, `baseline`) and exits. When the line already names `<tag>`, it diffs the Inventory at `--from <rev>` (default `HEAD`) against the working tree, prints the added, changed (same ID, different `hash`) and removed report, and writes `conformance/pin-bumps/<old>-to-<new>.jsonl`.
- `--apply` resets every Expectations line of a changed ID to `status: skip`, `reason: not-ported-yet`, `adapted: null`, `escalation: null`, in place. The shard path, which AD-15 makes mirror the Ported Test path, is the link to the previous Ported Test.
- A rename is a removed ID and an added ID with the same `hash` and `component` and no other candidate with that hash. Its lines are rewritten in place to the new ID, keeping status, reason, adapted and escalation.
- Retiring an ID deletes its lines from the shards. The bump record keeps the ID, its last status per Variant, its shard path and, for a rename, the new ID; that record is the history.
- Story stubs go to `_bmad-output/implementation-artifacts/pin-bump/<new>/<component>.md`, one per Component. The tool does not write `stories/*.md`.
- Until Story 5.1 creates `conformance/expectations/`, `--apply` edits whatever shards exist, and the tests use fixture shards in the AD-15 format.

Rationale:

- **No planning document changes.** Expectations keep AD-15's six fields, so the spine, the SPEC, `epics.md` and Story 5.1 stay as they are. Option 2 would amend AD-15, and option 3 would reorder `epics.md`; both are the Maintainer's.
- **The grader is not weakened.** The reset of a changed ID to `skip` / `not-ported-yet` is what Story 2.8's AC requires, and it is stricter than the previous status. A retired ID no longer exists Upstream, so deleting its lines removes no assertion, and the bump record keeps its last status. No `adapted:` marker or new skip reason is added.
- **No divergence and no run-time cost.** The tool is maintainer-side tooling that runs only at a freeze point.

This ruling falls within the orchestrator's authority under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. It does not weaken the grader, add a divergence outside DIV-1..12, or move Xaravel away from a faithful port.
