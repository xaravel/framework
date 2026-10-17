---
test_ids:
  - XT-conformance-62
  - XT-conformance-63
  - XT-conformance-64
  - XT-conformance-65
  - XT-conformance-66
  - XT-conformance-67
trigger: open-question
proposed: >-
  Build `bun run pin:bump <tag>` using only formats that already exist, with no
  new Expectations fields. (1) It refuses while any `epic-<N>` key in
  sprint-status.yaml is `in-progress`, and lists those Epics. (2) It moves only
  the `laravel/framework` line of conformance/baseline-pin. When that line's tag
  differs from <tag>, it resolves the commit and tree as docs/ops/upstream.md
  describes, rewrites the line, runs `upstream:sync`, prints the regeneration
  steps (`oracle:lock`, `oracle:build`, `inventory`, `baseline`) and exits. When
  the line already names <tag>, it diffs the Inventory at `--from <rev>`
  (default HEAD) against the regenerated working-tree Inventory, prints the
  added, changed (same id, different `hash`) and removed report, and writes
  conformance/pin-bumps/<old>-to-<new>.jsonl. `--apply` also edits
  Expectations and writes stubs. (3) A changed ID: every (id, variant) line is
  set to `status: skip`, `reason: not-ported-yet`, `adapted: null` and
  `escalation: null`. The line stays in its shard, and since AD-15 shards mirror
  Ported Test file paths, the shard path is the link to the previous Ported
  Test. (4) A rename is a removed ID and an added ID with the same `hash` and
  the same `component`, and no other candidate with that hash. The old
  lines are rewritten in place to the new ID, keeping status, reason, adapted
  and escalation, and the old ID is retired. (5) Retiring an ID deletes its
  lines from the shards, so no (id, variant) is left without an Inventory
  entry. The bump record keeps the ID, its last status per Variant, its shard
  path and, for a rename, the new ID. That record is the history. (6) Stubs go
  to _bmad-output/implementation-artifacts/pin-bump/<new>/<component>.md: one
  file per Component, listing the added IDs and the changed IDs with their
  shard paths, for sprint planning to turn into Stories. The tool does not
  write stories/*.md. Until Story 5.1 creates conformance/expectations/,
  `--apply` edits whatever shards exist, which is none, and the tests use
  fixture shards in the AD-15 format.
evidence: >-
  Story 2.8's ACs (epics.md:1840-1863) and FR-7 (prd.md:273-281) say that a
  removed ID is "retired" from the Expectations File, that a changed entry
  "keeps a link to the previous Ported Test file", that a rename carries
  "status and history", and that added and changed IDs become "backlog Story
  stubs, grouped by Component". No planning document defines a format for any
  of these. AD-15 (ARCHITECTURE-SPINE.md:340) fixes the Expectations fields as
  `id`, `variant`, `status`, `reason`, `adapted` and `escalation`, with no
  retired, history or link field. Story 5.1 (Epic 5) owns the file, and
  conformance/expectations/ does not exist yet; epic-2-context.md notes that
  Story 2.8 edits Expectations that exist only once Epic 5 lands. The docs also
  do not say how "an Epic is in progress" is detected, whether
  `pin:bump <tag>` moves the ai, mcp and boost lines too, or how the tool gets
  the new Pin's Inventory, which needs a new snapshot, new Oracle locks, a new
  image and a regenerated Inventory. Each reading gives different files on disk,
  so the spec cannot choose one.
---

# ESC-2.8-1: formats for the Pin bump's retirements, history, Ported Test links and Story stubs

Story 2.8 must retire Expectations entries, keep a link to the previous Ported Test, carry "history" across a rename, and write "backlog Story stubs". The PRD, the spine and the epics give no on-disk form for any of these. Story 5.1, which comes later, owns the Expectations File itself.

The options:

1. **Use only existing formats (proposed).** Expectations keep the six AD-15 fields. The shard path is the Ported Test link. Retirement deletes the lines, and a committed bump record under `conformance/pin-bumps/` keeps the history. Stubs are per-Component Markdown lists under `_bmad-output/implementation-artifacts/pin-bump/<tag>/`, which sprint planning consumes. Sprint status is the authority for "in progress", and the bump moves the framework line only. Nothing in the spine, the SPEC or `epics.md` changes, and the grader is not weakened: a changed test goes back to `not-ported-yet`, which is stricter, and a retired ID no longer exists Upstream.
2. **Add Expectations fields** (`retired`, `previous`, `history`). This changes AD-15's record and Story 5.1's `expectations:init`, so the Maintainer would have to amend the spine.
3. **Reorder Story 2.8 after Story 5.1.** This needs an `epics.md` change by the Maintainer, and Epic 2 stays open until then.

Option 1 adds no divergence and no skip, needs no `adapted:` marker, and costs nothing at run time. Story 2.8's spec is `_bmad-output/implementation-artifacts/spec-2-8-baseline-pin-bump-tool.md`.
