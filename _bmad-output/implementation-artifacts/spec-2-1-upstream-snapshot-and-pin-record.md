---
title: 'Story 2.1: Upstream snapshot and Pin record'
type: 'feature'
created: '2026-10-17'
baseline_revision: '32a6c159c7215873b01441f7c1c8161d04786cbd'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/stories/2.1.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Make the `upstream` CI job a required check so a wrong pin SHA cannot merge.
    evidence: |-
      `bun test` checks only the SHA format of the real pin; the real commit and tree are verified only by the new `upstream` job, which `.github/rulesets/main.json` does not require. Required checks are a Maintainer ruleset change (Epic 1 retro item 2).
    location: >-
      .github/rulesets/main.json; .github/workflows/ci.yml upstream
    severity: medium
  - summary: >-
      The scaffolder still writes "its Upstream pin is recorded in Epic 2" in the ai, mcp and boost READMEs.
    evidence: |-
      `tools/scaffold/scaffold.ts` readme() and `packages/{ai,mcp,boost}/README.md`; the pin now records those tags. Fixing it regenerates three package READMEs, outside this Story's byte-identical constraint.
    location: >-
      tools/scaffold/scaffold.ts readme()
    severity: low
---

<intent-contract>

## Intent

**Problem:** No tool can read Upstream source today. `conformance/baseline-pin` holds only `v13.37.0`, so nothing fetches `laravel/framework`, `laravel/ai`, `laravel/mcp` or `laravel/boost`, and nothing proves a local copy is unmodified (FR-1, AD-15).

**Approach:** `conformance/baseline-pin` becomes a table: one line per Upstream repository with its tag, the tag's commit and that commit's git tree hash. `bun run upstream:sync` shallow-clones each tag into a gitignored, read-only `conformance/upstream/<name>/`, verifies the commit and the tree hash, and removes `.git`. `bun run upstream:check` recomputes each directory's git tree hash in pure TypeScript, with no git and no network, and fails on any difference. A CI job runs sync and then check.

## Boundaries & Constraints

**Always:**
- The pin has exactly four entries, `laravel/framework`, `laravel/ai`, `laravel/mcp` and `laravel/boost`, at `v13.37.0`, `v1.2.3`, `v1.0.2` and `v2.10.3`. The last three are the versions in the brief's research addendum and the latest tags on 2026-10-17. They are recorded under the MAINT ruling's recommended-option rule, and the Maintainer can change them in the pin.
- Commit and tree values are full 40-hex SHAs taken from git, verbatim.
- The tree hash is git's own: it equals `git rev-parse <tag>^{tree}`, so anyone can verify it against GitHub.
- The check needs neither `git` nor the network. The reader API never fetches.
- Release notes and the scaffolder keep reading the framework tag (`v13.37.0`) through the shared parser.

**Never:**
- Commit the snapshot.
- Lower an existing assertion's expected value. XT-conformance-4 and XT-conformance-37 keep `v13.37.0` and assert it on the parsed framework entry.
- Touch any Story 2.2+ surface: Oracle, Inventory, component map, `pin:bump`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh sync | no `conformance/upstream/` | four read-only dirs, no `.git`; check passes | — |
| Already synced | every tree hash matches | sync fetches nothing and says each is up to date | — |
| Local edit | a file changed, added or removed, or an empty dir added | check exits 1 naming the dir with expected and actual hash; the next sync replaces the dir | — |
| Tag moved | the remote tag resolves to a commit other than the pin's | sync exits 1 naming the repo; the old dir is left as it was | the temp clone is removed |
| Missing snapshot | the dir is absent | check exits 1 with `run bun run upstream:sync`; `readUpstream` throws the same hint | no fetch |
| Bad pin | missing file, no entries, a malformed line, a duplicate, or a repo missing or unknown | exit 1 naming the file and line | — |
| Path escape | `readUpstream(root, "framework", "../x")` | throws | — |

</intent-contract>

## Code Map

- `conformance/baseline-pin` -- currently the single line `v13.37.0`; it becomes the table.
- `tools/release/release.ts:367` `baselinePin()` -- reads the whole file with `.trim()`, with errors `does not exist` and `is empty`. Switch it to the parser and keep both messages.
- `tools/scaffold/scaffold.ts:125` `readme()` -- reads the pin with `.trim()` and falls back to `DEFAULT_PIN` when the file is missing. Switch to the parser so the generated READMEs stay byte-identical.
- `conformance/tests/xaravel/root-baseline.test.ts:142` (XT-4) and `release.test.ts:56,605,616,642` (XT-37 and fixtures) -- assert the raw file content. Assert the parsed framework tag instead, and write the fixtures in the table format.
- `conformance/tests/xaravel/scaffold.test.ts:453` -- the Epic 1 retro probe took `XT-conformance-39`, which `stories/2.1.md` allocates to this Story (story-manifests.md: do not renumber allocated IDs). Rename it to the unallocated `XT-conformance-170`; the manifests' highest ID is 169.
- `tsconfig.json` `include` -- `conformance/**/*.ts` would pick up the snapshot; add `exclude: ["conformance/upstream"]`. The scaffolder rewrites only `references`.
- `.oxlintrc.json` -- the snapshot holds 17 `.js`/`.jsx` files; add `conformance/upstream/**` to `ignorePatterns`.
- `.github/workflows/ci.yml` -- jobs follow the `check` job's pattern: pinned action SHAs, `persist-credentials: false`, top-level `contents: read`.
- Probe at planning time (2026-10-17): the four tags clone to 43M, 7.4M, 2.7M and 3.0M, all with modes 100644/100755 only. framework `685f8d6c2ab4547287500bc80ccdf2ca12635109` / tree `99ed2f8f5d01a3f2f101e3156ad0bdb2a63837a1`; ai `23509ff5c6c5cdc77facd6ce784274c29c76c4db` / `c1e29f0aa61a66ec8d578feab454dc4a189022b4`; mcp `26c7803551028653beab49af0e672ae38607b772` / `8789f20d778811e64d3e07a9e7acefe4ffcd5c70`; boost `75c269a8a53e931c7252e7cd562e1a209356a7c6` / `7abdb1b9a81d29ad7c0135177e5bfa685c4d12a8`.

## Tasks & Acceptance

**Execution:**
- `tools/upstream/upstream.ts` -- exports `UPSTREAM_PIN_FILE`, `UPSTREAM_DIR`, `UPSTREAM_REPOS`, `parsePin(text)`, `readPin(root)`, `frameworkTag(root)`, `treeHash(dir)`, `sync(root, {remoteBase})`, `check(root)`, `upstreamPath(root, name, rel)` and `readUpstream(root, name, rel)`, plus a CLI (`sync [--remote <base>]`, `check`, `--root`). Sync clones into a temp sibling with `core.autocrlf=false`, verifies the commit and tree, removes `.git`, clears write bits, then swaps the clone in.
- `tools/release/release.ts`, `tools/scaffold/scaffold.ts` -- read the pin through `frameworkTag`.
- `conformance/baseline-pin` -- write the table with comments.
- `package.json` -- add the `upstream:sync` and `upstream:check` scripts. `.gitignore` -- add `/conformance/upstream/`. `tsconfig.json` -- add `tools/upstream/**/*.ts` to `include` and the `exclude` above. `.oxlintrc.json` -- add the ignore pattern.
- `.github/workflows/ci.yml` -- add an `upstream` job that runs `upstream:sync` and then `upstream:check`.
- `conformance/tests/xaravel/upstream.test.ts` -- XT-39, XT-40 and XT-41 against hermetic `file://` fixture remotes, covering the matrix and a `treeHash` equal to `git rev-parse HEAD^{tree}` (nested dirs, the `a.b` vs `a/` ordering, the exec bit, a symlink).
- Existing tests -- the XT-4, XT-37 and fixture updates and the XT-39→170 rename above.
- `docs/ops/upstream.md` -- a short operator note covering the format, the commands, offline use and how the Maintainer changes a tag.

**Acceptance Criteria:**
- Given `conformance/baseline-pin`, when `bun run upstream:sync` runs, then it checks out each of the four repos at its pinned tag into `conformance/upstream/{framework,ai,mcp,boost}/` (XT-conformance-39).
- Given a synced snapshot, when the snapshot check runs in CI, then each directory's tree hash matches the pin, and any local modification fails the check (XT-conformance-40).
- Given no network, when a tool reads Upstream source, then it reads only from `conformance/upstream/` and never fetches. The check and the reader run with a fake `git` on `PATH` that records any call, and it records none (XT-conformance-41).

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 30 findings — high 0, medium 6, low 21, false 3, maybe-false 0
- findings:
  - `[false]` `[reject]` blind: ai/mcp/boost tags set without the Maintainer — MAINT-2026-10-16 "Decisions during a Story: choose the recommended or best-case option. Do not wait for the Maintainer"; a tag choice is none of the three reserved Escalation classes. The tags are the researched versions and the latest tags, recorded in the pin comment and reported on the status issue for the Maintainer to confirm.
  - `[low]` `[patch]` blind: a sync after `chmod -R u+w` leaves the snapshot writable — the up-to-date path now clears write bits again; tested.
  - `[low]` `[reject]` blind: a failed rename after `removeTree(target)` loses the old dir — a same-filesystem rename on macOS/Linux practically never fails, and the fix adds a backup/restore branch.
  - `[low]` `[reject]` blind: two concurrent syncs break each other's temp clones — unlikely in everyday use; a lock adds new state.
  - `[medium]` `[patch]` blind: gitEnv strips every GIT_* var (GIT_SSL_CAINFO, GIT_SSH_COMMAND …) — now strips only the repository-location vars.
  - `[medium]` `[patch]` blind: check ignores extra entries in conformance/upstream/ — check now fails naming each unexpected entry; tested.
  - `[low]` `[reject]` blind: tree hash relies on POSIX mode bits (Windows) and gitlinks — the toolchain targets macOS/Linux, and no pinned tree has a gitlink (modes 100644/100755 only, probed).
  - `[low]` `[reject]` blind: XT-41 detects only git calls, not other network paths — the check and reader are pure fs code with no network call; a fetch guard adds test complexity for an unreachable case.
  - `[low]` `[patch]` blind: the XT-39→170 rename is recorded nowhere — noted in story-manifests.md (next free ID 171).
  - `[low]` `[reject]` blind: upstreamPath checks realpath only when the leaf exists — no caller probes or creates paths; reads of a missing leaf fail anyway.
  - `[low]` `[reject]` blind: CI job has no cache — about 56 MB per run is acceptable; a cache adds a workflow surface. Its required-check status is deferred with the verification-gap finding below.
  - `[low]` `[patch]` blind: the operator doc lacks verification and re-run steps for a tag change — added.
  - `[low]` `[reject]` blind: CLI bad-pin cases tested only via parsePin — sync and check reach the same readPin, so the CLI adds nothing but exit-code plumbing that is already tested by the duplicate and missing cases.
  - `[low]` `[reject]` edge: swap failure (= blind rename finding).
  - `[low]` `[patch]` edge: up-to-date path leaves the snapshot writable (= blind chmod finding).
  - `[low]` `[reject]` edge: concurrent syncs (= blind finding).
  - `[low]` `[reject]` edge: clone stall with no timeout — GIT_TERMINAL_PROMPT=0 already prevents prompts, and the CI job has a 15-minute timeout.
  - `[low]` `[reject]` edge: gitlinks and filter attributes (= blind POSIX/gitlink finding).
  - `[low]` `[reject]` edge: check does not verify write bits — write bits are not content; AC2 is about tree hashes, and sync now restores read-only.
  - `[low]` `[patch]` edge: the retro spec's XT-conformance-39 references now point at the Story 2.1 test — appended a rename note.
  - `[medium]` `[patch]` verification-gap: the line-ending guard is untested, and core.eol is unset while Upstream declares `* text=auto` — added `-c core.eol=lf` and an attributes-plus-gitconfig fixture test.
  - `[low]` `[patch]` verification-gap: the stale temp sweep is untested — added a test.
  - `[medium]` `[defer]` verification-gap: the real-pin SHAs are verified only by the advisory `upstream` CI job — making checks required is a Maintainer ruleset change (Epic 1 retro item 2).
  - `[medium]` `[patch]` verification-gap: core.eol unset (same root as the line-ending entry above).
  - `[low]` `[defer]` verification-gap: the scaffolder still writes "its Upstream pin is recorded in Epic 2" for ai/mcp/boost — this regenerates three package READMEs, outside this Story's byte-identical constraint.
  - `[false]` `[reject]` intent: AC1 tag values under the "Maintainer must supply" reading — same refutation as the first blind finding.
  - `[low]` `[defer]` intent: real tags are verified only in CI, not by `bun test` — same root as the advisory-CI deferral; `bun test` stays hermetic and offline by design.
  - `[false]` `[reject]` intent: the CI check only re-confirms what sync just verified — AC2's "any local modification fails" is the check's property and is proven in XT-40; CI also catches a moved tag or a hash disagreement.
  - `[medium]` `[patch]` intent: `tools/scaffold/table.ts` reads Upstream source from `--upstream`/`$XARAVEL_UPSTREAM`, not `conformance/upstream/` (AC3) — the CLI now reads the snapshot through the upstream module.
  - `[low]` `[reject]` intent: "no network" is simulated only for git (= blind XT-41 finding).

## Design Notes

Tree hash: SHA-1 over git objects. For a blob: `blob <len>\0<bytes>`. For a tree: entries `<mode> <name>\0<20-byte sha>` sorted by git's rule, which compares a directory's name as `name/`. Modes are `100755` when the owner exec bit is set and `100644` otherwise; a symlink is `120000` and its blob is the link target. An empty directory is hashed as an empty tree. Git cannot hold one, so it always shows up as a local modification. Any other file type is an error.

## Verification

**Commands:**
- `bun test` -- expected: all pass, including XT-39..41 and XT-170
- `bun run typecheck` and `bun run lint` -- expected: clean
- `bun run scaffold:check` and `bun run graph:check` -- expected: clean, READMEs unchanged
- `bun run upstream:sync` then `bun run upstream:check` (real network) -- expected: four dirs verified

## Auto Run Result

Status: done

**Summary:** `conformance/baseline-pin` is now a table of the four Upstream repositories: tag, commit and git tree hash. `bun run upstream:sync` shallow-clones each tag into a gitignored, read-only `conformance/upstream/<name>/`. It verifies the commit and the tree, and is a no-op when the snapshot is current, except that it restores read-only. `bun run upstream:check` recomputes git tree hashes in pure TypeScript, with no git and no network. It fails on any content, mode or empty-directory change and on any entry the pin does not list. A new CI `upstream` job runs sync and then check. `tools/scaffold/table.ts` now reads only from the snapshot.

**Files changed:**
- `tools/upstream/upstream.ts`: new. Pin parser, tree hash, sync, check, the reader API (`upstreamPath`, `readUpstream`) and a CLI.
- `conformance/baseline-pin`: the four-entry table. ai v1.2.3, mcp v1.0.2 and boost v2.10.3 are recorded under the MAINT recommended-option rule.
- `tools/release/release.ts`, `tools/scaffold/scaffold.ts`: read the framework tag through `frameworkTag`.
- `tools/scaffold/table.ts`: reads `conformance/upstream/framework` only. `--upstream` and `$XARAVEL_UPSTREAM` are removed and `--root` is added.
- `.github/workflows/ci.yml`: new `upstream` job.
- `package.json`, `.gitignore`, `tsconfig.json`, `.oxlintrc.json`: scripts, the ignore entry, and the typecheck and lint exclusions.
- `conformance/tests/xaravel/upstream.test.ts`: new. XT-conformance-39, 40 and 41.
- `root-baseline.test.ts` (XT-4) and `release.test.ts` (XT-37 and fixtures): assert the parsed framework tag (`v13.37.0`, unchanged), and the fixtures use the table format.
- `repository-policy.test.ts` (XT-33): the exact job list gains `upstream`.
- `scaffold.test.ts`: the retro probe is renamed XT-39 → XT-170, and the table check now runs against the snapshot.
- `docs/ops/upstream.md`: new operator note.
- `story-manifests.md`, `spec-retro-1-typecheck-tests-peer-import.md`: notes on the XT-170 rename.
- `epic-2-context.md`: compiled epic context.

**Review:** 30 findings: 0 high, 6 medium, 21 low, 3 false.
- **Patched (4 medium entries, 6 low):** the line-ending isolation (`core.eol=lf`, plus a test); the `gitEnv` scope; the check failing on extra entries; table.ts reading only from the snapshot; read-only restored on the up-to-date path; a test for the stale-temp sweep; the XT-170 record and the retro-spec note; and the doc's tag-change procedure.
- **Deferred (2):** making `upstream` a required check (Maintainer ruleset change), and the stale "recorded in Epic 2" text in the ai, mcp and boost READMEs.
- **Rejected:** each with its reason in the Review Triage Log. The three `false` findings were the "tags need the Maintainer" claim, refuted by the MAINT-2026-10-16 decisions rule, and the claim that CI only re-verifies.

**Follow-up review recommendation:** true. Four medium entries were patched on a first pass. The unverified risk: the patched `table.ts` CLI and the stricter `check` have had no independent review. For example, a stray `.DS_Store` in `conformance/upstream/` now fails the check.

**Verification:**
- `bun test`: 42 pass, 0 fail.
- `bun run typecheck`, `bun run lint`, `scaffold:check`, `graph:check` and `workflows:check`: clean.
- Real network: `bun run upstream:sync` cloned all four tags, and every commit and tree matched the pin. Re-runs report up to date. `bun run upstream:check` verifies 4 directories. `bun tools/scaffold/table.ts --check` matches `packages.jsonl`.

**Residual risks:**
- The Maintainer should confirm the ai, mcp and boost tags.
- The `upstream` CI job is advisory until it is required.
- `table.ts --check` runs in `bun test` only where a snapshot exists, so not in the CI `check` job.
