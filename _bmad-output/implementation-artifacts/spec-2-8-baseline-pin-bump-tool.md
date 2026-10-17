---
title: 'Story 2.8: Baseline Pin bump tool'
type: 'feature'
created: '2026-10-17'
status: 'done'
baseline_revision: '9b7d71cd6f4d328756ade07e991b31a40ea971e5'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/stories/2.8.md'
  - '{project-root}/decisions/ESC-2.8-1.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Move mode's commit-mismatch and upstream:sync-failure paths have no test.
    evidence: |-
      XT-62 covers a missing tag and a successful annotated-tag move only. A sync-failure fixture (one ai/mcp/boost remote missing from the file:// base) is cheap; a mismatch needs the tag to move between ls-remote and the clone.
    location: >-
      tools/pin-bump/pin-bump.ts resolveTag / moveMode
    severity: low
---

# Story 2.8: Baseline Pin bump tool

<intent-contract>

## Intent

**Problem:** The Maintainer has no mechanical way to move the `laravel/framework` Baseline Pin at a freeze point and turn the Inventory diff into Expectations changes and backlog (FR-7, UJ-7; `epics.md:1832-1863`). ESC-2.8-1 was approved with option 1 (`decisions/ESC-2.8-1.md`), which fixes every on-disk form.

**Approach:** Add `bun run pin:bump <tag> [--from <rev>] [--apply] [--remote <base>] [--root <dir>]` in a new `tools/pin-bump/pin-bump.ts`. It works in two modes, picked by comparing `<tag>` with the working tree's framework Pin line. XT-conformance-62..67 verify the six ACs in order (`stories/2.8.md`).

## Boundaries & Constraints

**Always:**
- Refuse first, in every mode, when any `epic-<N>` key under `development_status` in `_bmad-output/implementation-artifacts/sprint-status.yaml` is `in-progress`. Exit 1 and list those Epics. Nothing is written.
- **Move mode** (the working-tree framework line names a different tag): resolve the commit with `git ls-remote <base>/laravel/framework.git refs/tags/<tag> refs/tags/<tag>^{}` (the `^{}` line wins), and the tree with a shallow clone (`git rev-parse HEAD HEAD^{tree}`, commit must match), as `docs/ops/upstream.md` describes. Rewrite only the `laravel/framework` line as `laravel/framework <tag> <commit> <tree>`, keeping every other byte of the file. Then run `sync(root, {remoteBase})`, print the regeneration steps (`bun run oracle:lock`, `bun run oracle:build`, `bun run inventory`, `bun run baseline`, then `bun run pin:bump <tag>`), and exit 0. Move mode writes no record, stubs or Expectations, even with `--apply`.
- **Diff mode** (the line already names `<tag>`): the old Pin and Inventory are read with `git show <rev>:<path>` at `--from` (default `HEAD`, resolved to its full SHA). The new ones come from the working tree. Every `.jsonl` under `conformance/inventory/` except `oracle-nondeterminism.jsonl` is parsed with `parseInventory`. If the old framework tag equals `<tag>`, exit 1: `--from <rev> already pins <tag>`.
- Classification is by Test ID across all suites. **added**: the ID is only new. **removed**: the ID is only old. **changed**: the same ID with a different `hash`. **renamed**: a removed R and an added A with the same `hash` and `component`, where no other removed or added ID has that hash. Renames count as neither added nor removed.
- The report goes to stdout, with sections `Added`, `Changed`, `Removed` and `Renamed`, each with a count and one ID per line. The Renamed lines read `old -> new`.
- The record is `conformance/pin-bumps/<old>-to-<new>.jsonl`. Line 1 is a header: `{"from":<old tag>,"to":<new tag>,"from_rev":<full sha>,"applied":<bool>}`. Then one line per ID, sorted by `change` (added, changed, removed, renamed), then `component`, then `id`, with code-unit compare:
  - `{"change","id","component","hash"}`;
  - changed also has `previous_hash`;
  - renamed has `id` as the old ID and `to` as the new one;
  - changed, removed and renamed have `expectations`: `[{"shard","variant","status","reason"}]`, the lines found before applying, sorted by shard then variant.
- Diff mode always writes the record, with `applied:false` unless `--apply` is set. It refuses (exit 1, nothing written) when an existing record already has `applied:true`.
- `--apply` edits every `.jsonl` shard under `conformance/expectations/` in place, keeping line order:
  - a changed ID's lines are set to `status:"skip", reason:"not-ported-yet", adapted:null, escalation:null`;
  - a renamed ID's lines get the new `id`, with every other field kept;
  - a removed, non-renamed ID's lines are deleted, and a shard left empty is deleted.
  - Lines are re-serialised in the AD-15 field order `id, variant, status, reason, adapted, escalation`. A line that is not valid JSON fails the run before anything is written.
- `--apply` writes one stub per Component that has added, changed or renamed IDs, at `_bmad-output/implementation-artifacts/pin-bump/<new>/<component>.md`. Each stub has the heading `# Pin bump <old> → <new>: <component>`, then `## Added`, `## Changed` (each ID with its shard paths, or `(no Expectations)`), and `## Renamed` (`old -> new`; update the `portedTest` ID). Empty sections are omitted.
- All output is LF, UTF-8 and deterministic. Exit codes: 0 success, 1 failure, 2 usage error.

**Never:** never edit the ai, mcp or boost Pin lines; never write `stories/*.md` or sprint status; never add Expectations fields beyond AD-15's six; never run `oracle:*`, `inventory` or `baseline` itself; never touch the network in diff mode.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| In-flight Epic | `epic-3: in-progress` | Lists `epic-3` on stderr; no file changes | exit 1 |
| Move | Pin `v1.0.0`, `pin:bump v1.1.0`, local remote | framework line rewritten, snapshot synced, steps printed | bad tag or commit mismatch → exit 1, pin unchanged |
| Diff, no shards | Pin already `v1.1.0` in tree, `--from` rev at `v1.0.0` | Report and record (`applied:false`) | — |
| Same tag | `--from` rev also `v1.1.0` | Message naming the rev | exit 1 |
| Ambiguous hash | Two removed IDs share a hash with one added ID | No rename: all reported as added/removed | — |
| Re-apply | Record has `applied:true` | Refuses | exit 1 |
| Missing tag arg | `pin:bump` | Usage | exit 2 |

</intent-contract>

## Code Map

- `tools/inventory/inventory.ts` -- reuse `parseInventory` (:475), `INVENTORY_DIR` (:54), `NONDETERMINISM_FILE` (:63), `FOREIGN_COMPONENTS` (:58), `compareUnits` (:166), `UsageError` (:797), `InventoryEntry` (:117). Parse with the right `suite` (foreign component files are their own suite).
- `tools/upstream/upstream.ts` -- reuse `parsePin` (:61), `readPin` (:104), `UPSTREAM_PIN_FILE` (:30), `sync(root, {remoteBase})` (:302). The `git`/`gitEnv` helpers (:221-238) are private; copy that pattern (strip `GIT_DIR` etc., `GIT_TERMINAL_PROMPT=0`) rather than exporting them.
- `tools/ownership/ownership.ts` -- `SPRINT_STATUS` (:46); parse it with `Bun.YAML.parse` as `applySprintStatus` does (:226-237).
- `tools/upstream/upstream.ts:439-490` -- the CLI shape to follow: a `main(argv)` returning an exit code, `UsageError` → 2, and `import.meta.main`.
- `conformance/tests/xaravel/upstream.test.ts:36-140` -- the fixture pattern for a local git remote with a hermetic `HOME`/git env, reused for move-mode tests.
- `conformance/tests/xaravel/inventory-checks.test.ts` -- XT test header and naming (`test("XT-conformance-NN: …")`, plain `bun:test` `expect` until the harness lands).
- `docs/ops/upstream.md:35-50` -- the tag-resolution steps the tool automates; its "Changing a tag" section names this tool.
- `package.json` scripts, `tsconfig.json` include list -- register the new tool.
- Read-only: `conformance/protected-paths` already covers `/tools/` and `/conformance/` (so `conformance/pin-bumps/` is Protected). Do not edit it.

## Tasks & Acceptance

**Execution:**
- `tools/pin-bump/pin-bump.ts` -- implement the CLI and exported functions (`inFlightEpics`, `resolveTag`, `rewriteFrameworkLine`, `diffInventories`, `applyBump`, `renderReport`, `renderRecord`, `renderStubs`, `main`), with a header comment in the style of the other tools -- the single entry point FR-7 needs.
- `package.json` -- add `"pin:bump": "bun tools/pin-bump/pin-bump.ts"` -- AC command name.
- `tsconfig.json` -- add `"tools/pin-bump/**/*.ts"` to `include` -- covered by `tsc --strict`.
- `conformance/tests/xaravel/pin-bump.test.ts` -- XT-conformance-62..67, one per AC in order, against hermetic temp roots: a git repo with two commits of `conformance/baseline-pin` and `conformance/inventory/*.jsonl`, fixture AD-15 shards, a fixture sprint status, and a local bare remote for move mode. Cover the matrix rows across them -- the ACs are the grader.
- `docs/ops/upstream.md` -- in "Changing a tag", document the framework-line flow (move, regenerate, report, `--apply`) and the record and stub paths -- operator docs.

**Acceptance Criteria:**
- XT-62: Given two Pins, when `pin:bump <tag>` runs in diff mode, then it prints added, changed (same ID, different hash) and removed IDs, and writes the record.
- XT-63: Given a changed ID with fixture shard lines, when the bump runs with `--apply`, then it resets them to `skip` / `not-ported-yet` / `null` / `null` in their original shard (the shard path is the Ported Test link), and the record keeps the prior status.
- XT-64: Given a rename, when the bump runs with `--apply`, then it rewrites the lines to the new ID with status, reason, adapted and escalation kept, the old ID is gone from every shard, and the record's renamed line keeps the old ID, the new ID and the prior expectations.
- XT-65: Given a removed ID, when the bump runs with `--apply`, then it deletes its lines (and an emptied shard), and the record keeps the ID, shard, variant and last status.
- XT-66: Given added and changed IDs in two Components, when the bump runs with `--apply`, then it writes one stub per Component listing them.
- XT-67: Given `epic-<N>: in-progress`, when the tool runs, then it exits 1, lists the in-flight Epics and changes no file, in both move and diff mode.

## Spec Change Log

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 28 findings — high 0, medium 2, low 17, false 9, maybe-false 0 (blind 13, edge 9, verification-gap 5, intent-alignment 1)
- findings:
  - `[medium]` `[patch]` (blind) Diff mode does not check that the Inventory was regenerated; `--apply` on an empty diff writes an `applied:true` record that locks out the real apply. — Patched: `--apply` with an empty diff exits 1, writes nothing and says to regenerate; test added.
  - `[low]` `[reject]` (blind) A crash midway through `--apply` leaves partial state. — Needs a disk-write failure between local writes, which is rare. Staging or journalling adds real complexity.
  - `[false]` `[reject]` (blind) The record drops `adapted`/`escalation`. — The record fields are `{shard, variant, status, reason}`, fixed by the intent contract and the ESC-2.8-1 ruling ("last status per Variant"). Changing them means editing the spec.
  - `[low]` `[reject]` (blind) A rename can duplicate `(id, variant)` when the new ID already has lines. — An added ID did not exist before, so it has lines only after a hand edit. The CI uniqueness check (AD-15) catches duplicates.
  - `[false]` `[reject]` (blind) A rename across classes leaves the line in the wrong shard. — AD-15 shards mirror the Ported Test file, which is still at its old path until a Story moves it. The stub's Renamed section flags the portedTest update.
  - `[false]` `[reject]` (blind) The rewritten framework line loses its comment and alignment. — The contract says the line becomes exactly `laravel/framework <tag> <commit> <tree>`. The real Pin's framework line has no comment and is already single-spaced.
  - `[low]` `[reject]` (blind) A tag containing `/` gives nested record and stub paths. — Laravel tags are `vX.Y.Z`. Not met in everyday use.
  - `[low]` `[defer]` (blind) Move mode writes the Pin before sync succeeds, and that path is untested. — The write order is per spec, and the tool tells the Maintainer to re-run sync. The test gap is merged into the deferred move-mode failure-path item.
  - `[low]` `[reject]` (blind) Several error paths are untested (bad YAML, duplicate ID, flags, bad `--from`, CRLF). — Each one is a direct throw to exit 1 or 2. The missing sprint status case was patched (verification-gap 1).
  - `[low]` `[patch]` (blind) The no-network rule in diff mode is untested. — Patched: the XT-62 diff run passes `--remote file:///nonexistent`.
  - `[false]` `[reject]` (blind) Downgrading the Pin is allowed. — The intent puts no ordering on tags. Only the freeze point gates a move.
  - `[false]` `[reject]` (blind) Story bookkeeping is incomplete. — The orchestrator updates sprint status at merge. Editing `package.json`/`tsconfig.json` is allowed for an Epic 1–8 Infrastructure Story (MAINT ruling, amendment 2).
  - `[false]` `[reject]` (blind) The record and the stubs can drift after a hand edit between report and apply. — By design, each run reflects the shards as they are at that run. The applied record is what was applied.
  - `[medium]` `[patch]` (edge) An empty diff on apply locks out the real apply. — Same root cause as blind 1, and patched with it.
  - `[low]` `[patch]` (edge) A `--from` revision with no Inventory reports every ID as added. — Patched: `readInventoryAt` throws, naming the revision; test added.
  - `[low]` `[reject]` (edge) Partial writes on a crash. — Same as blind 2.
  - `[low]` `[reject]` (edge) The rename target already has lines. — Same as blind 4.
  - `[false]` `[reject]` (edge) A cross-class rename goes to the wrong shard. — Same refutation as blind 5.
  - `[low]` `[reject]` (edge) A `/` in a tag. — Same as blind 7.
  - `[false]` `[reject]` (edge) Unrelated lines in a touched shard are re-serialised. — The contract says "Lines are re-serialised in the AD-15 field order". Untouched shards stay byte-identical.
  - `[low]` `[reject]` (edge) Stale stubs can be left behind. — A second `--apply` is refused, so stubs are rewritten only after someone deletes the record by hand.
  - `[low]` `[reject]` (edge) A symlink cycle under `conformance/expectations` recurses forever. — Not a realistic repository state.
  - `[low]` `[patch]` (verification-gap) The fail-closed path for a missing sprint status is untested. — Patched: XT-67 adds a missing-file case.
  - `[low]` `[patch]` (verification-gap) Numeric Epic ordering is untested. — Patched: the fixture has `epic-10: in-progress`, and the test expects epic-3, epic-5, epic-10.
  - `[low]` `[patch]` (verification-gap) The default `--from HEAD` is untested. — Patched: XT-62 runs without `--from`.
  - `[low]` `[defer]` (verification-gap) Commit-mismatch and sync-failure paths in move mode are untested. — Deferred as filed. A mismatch needs the remote to change between `ls-remote` and the clone.
  - `[low]` `[reject]` (verification-gap, other) The mismatch check is nearly unreachable. — It is a defensive check, as in `upstream.ts` `syncOne`. No change.
  - `[false]` `[reject]` (intent-alignment) The tests use only hermetic roots, not the real repository. — `--root` is part of the contract, and verification ran `bun run pin:bump v13.37.0` in the real repository: it refuses and lists `epic-2`. The remaining divergences (d(i), e(i), f(i)) match the contract.

## Design Notes

Two modes exist because a new Pin's Inventory needs a new snapshot, new Oracle locks, a new image and a regeneration. All four need a container and the network, so the Maintainer runs them between the move and the diff (ESC-2.8-1 ruling, bullet 2). Using `--from <rev>` means the old Inventory is whatever git holds. No copy is kept.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/pin-bump.test.ts` -- expected: 6 pass.
- `bun test` -- expected: no new failures.
- `bun run typecheck` and `bun run lint` -- expected: clean.
- `bun run pin:bump v13.37.0` in the real repo -- expected: refuses, listing `epic-2` (in progress).

## Auto Run Result

Status: blocked
Blocking condition: intent gap. Escalation `conformance/escalations/ESC-2.8-1.md` is open.

The ACs require on-disk forms that no planning document defines:
- what a retired Expectations entry is;
- where the "link to the previous Ported Test file" and the rename "history" live, given AD-15's six fixed fields;
- where backlog Story stubs are written, and in what format;
- how "an Epic is in progress" is detected;
- whether `<tag>` moves only the framework line of `conformance/baseline-pin`;
- how the tool gets the new Pin's Inventory, which needs a new snapshot, Oracle locks, an image and a regeneration.

Each reading gives observably different files, so step 2 halted instead of picking one. ESC-2.8-1 proposes option 1, which uses only existing formats. Once a decision file approves it, re-run Story 2.8: plan from the ruling and fill in this spec's intent contract, Code Map and tasks.

Unanswered questions:
1. Is a retired entry deleted from its shard and recorded elsewhere, or kept with a new field?
2. Is the shard path, which mirrors the Ported Test path under AD-15, enough as the "link to the previous Ported Test file"?
3. What does "history" carry across a rename, and where is it stored?
4. Where do Story stubs go: `stories/`, sprint status, or an implementation-artifacts list?
5. Is sprint-status.yaml's `epic-<N>: in-progress` the "in progress" test?
6. Does `pin:bump <tag>` also move ai, mcp and boost?
7. Does the tool run the regeneration chain (sync, locks, image, Inventory), or diff against an Inventory the Maintainer has already regenerated?

### Run 2 (2026-10-17, after ESC-2.8-1 was approved)

Status: done

**Summary.** `bun run pin:bump <tag>` is built as the ESC-2.8-1 ruling (option 1) describes.
- It refuses while any `epic-<N>` is `in-progress`, and fails closed when sprint status is missing.
- **Move mode** resolves the tag (ls-remote, with the `^{}` line winning, then a shallow clone), rewrites only the framework Pin line, runs `upstream:sync` and prints the regeneration steps.
- **Diff mode** diffs the Inventory at `--from` (default `HEAD`) against the working tree. It reports added, changed, removed and renamed IDs, and writes `conformance/pin-bumps/<old>-to-<new>.jsonl`.
- **`--apply`** resets, renames or retires Expectations lines in place, and writes one backlog stub per Component under `_bmad-output/implementation-artifacts/pin-bump/<new>/`.

**Files changed**
- `tools/pin-bump/pin-bump.ts`: the new tool.
- `conformance/tests/xaravel/pin-bump.test.ts`: XT-conformance-62..67, run against hermetic git roots and `file://` remotes.
- `package.json`: the `pin:bump` script.
- `tsconfig.json`: includes `tools/pin-bump/**/*.ts`.
- `docs/ops/upstream.md`: the framework-line flow (move, regenerate, report, apply).

**Review findings.** 28 findings: high 0, medium 2, low 17, false 9.
- **Patched (5 entries):**
  - medium: `--apply` on an empty diff locked out the real apply. It now refuses.
  - low: a `--from` revision with no Inventory now fails.
  - low: added a test for a missing sprint status.
  - low: added a test for numeric Epic order.
  - low: the default `--from HEAD` is now tested, and the no-network rule is now checked.
- **Deferred (1):** move mode's commit-mismatch and sync-failure paths have no test.
- **Rejected:** every other finding, with its reason in the Review Triage Log.

**Follow-up review recommended:** false. One medium entry and four low entries were patched, and none was high.

**Verification**
- `bun test conformance/tests/xaravel/pin-bump.test.ts`: 6 pass.
- `bun test`: 69 pass, 0 fail.
- `bun run typecheck` and `bun run lint`: clean.
- `bun run pin:bump v13.37.0` in the real repo exits 1 and lists `epic-2`.

**Residual risks**
- `conformance/expectations/` does not exist until Story 5.1, so `--apply` has run only against fixture shards.
- Move mode has run only against local remotes, never against GitHub.
