# The Upstream snapshot

Xaravel's tools read Upstream source (`laravel/framework`, `laravel/ai`, `laravel/mcp`, `laravel/boost`) only from a local, read-only snapshot in `conformance/upstream/`. The snapshot is gitignored and never committed. `conformance/baseline-pin` records what it must contain (FR-1, AD-15). The tool is `tools/upstream/upstream.ts`.

## The pin

`conformance/baseline-pin` has one line per Upstream repository. `#` comments and blank lines are ignored:

```
<repo> <tag> <commit> <tree>
laravel/framework v13.37.0 685f8d6c2ab4547287500bc80ccdf2ca12635109 99ed2f8f5d01a3f2f101e3156ad0bdb2a63837a1
```

- `<commit>` is the commit the tag resolves to.
- `<tree>` is that commit's git tree hash, the value of `git rev-parse <tag>^{tree}`. Anyone can check it against GitHub.
- Both are full 40-hex SHAs.
- There is exactly one entry for each of the four repositories.
- The `laravel/framework` tag is the Baseline Pin that release notes and package READMEs name.

## Commands

| Command | What it does |
| --- | --- |
| `bun run upstream:sync` | For each entry, shallow-clones the tag into a temp sibling of `conformance/upstream/<name>/` and checks that the commit and the tree match the pin. It then removes `.git`, clears the write bits and swaps the clone in. If a directory already matches, nothing is fetched for it. If a repository fails (for example, its tag now points at a different commit), its old directory is left as it was and the command exits 1. `--remote <base>` changes the clone base from `https://github.com`. |
| `bun run upstream:check` | Recomputes each directory's git tree hash in TypeScript and fails on a missing directory or any difference. A changed, added or removed file, a changed exec bit, or an added empty directory all count as differences. It runs no `git` and needs no network. CI runs sync and then check in the `upstream` job of `ci.yml`. |

To repair a modified or missing directory, run `bun run upstream:sync`. The check also fails on anything else in `conformance/upstream/`: a stale `.<name>.tmp-*` clone left by a killed sync (the next sync removes it) or a directory the pin does not name (remove it yourself).

`tools/scaffold/table.ts` builds the package table from `conformance/upstream/framework` only. Without a snapshot it fails, telling you to run `bun run upstream:sync`.

## Offline use

Only `upstream:sync` touches the network. The check and the reader API (`readUpstream(root, name, rel)` and `upstreamPath(root, name, rel)`) only read files under `conformance/upstream/`. Once you have synced, you can work fully offline. The snapshot is read-only, so to edit it while debugging, run `chmod -R u+w` first. Afterwards, run `upstream:sync`: it re-fetches a modified directory, and makes an unmodified one read-only again.

## Changing a tag (Maintainer)

`conformance/baseline-pin` is a Protected Path, so a tag changes only through a Maintainer-approved change.

### The `laravel/framework` Pin: `bun run pin:bump <tag>`

The framework Pin moves only at a freeze point, and only through `bun run pin:bump <tag> [--from <rev>] [--apply] [--remote <base>] [--root <dir>]` (`tools/pin-bump/pin-bump.ts`, Story 2.8, `decisions/ESC-2.8-1.md`). Do not edit its line by hand. The tool refuses (exit 1, nothing written) while any `epic-<N>` key under `development_status` in `_bmad-output/implementation-artifacts/sprint-status.yaml` is `in-progress`, and lists those Epics. It never touches the `laravel/ai`, `laravel/mcp` or `laravel/boost` lines. The flow has four steps:

1. **Move.** Run `bun run pin:bump <tag>` while the framework line still names the old tag. The tool resolves the commit and the tree exactly as steps 1 and 2 below describe (the `^{}` line wins; the clone's commit must match), from `--remote <base>` (default `https://github.com`). It rewrites only the framework line as `laravel/framework <tag> <commit> <tree>`, runs `upstream:sync` and prints the regeneration steps. A missing tag or a commit mismatch exits 1 and leaves the Pin unchanged. This step writes no record, stubs or Expectations, even with `--apply`.
2. **Regenerate.** Run `bun run oracle:lock`, `bun run oracle:build`, `bun run inventory` and `bun run baseline`. They need a container runtime and the network, so the tool never runs them itself.
3. **Report.** Run `bun run pin:bump <tag>` again, now that the line names `<tag>`. The tool diffs the Inventory at `--from <rev>` (default `HEAD`, read with `git show`) against the working tree, and never touches the network. It prints the `Added`, `Changed` (same Test ID, different `hash`), `Removed` and `Renamed` IDs. A rename is a removed and an added ID with the same `hash` and `component`, where no other removed or added ID shares that hash. It writes the bump record `conformance/pin-bumps/<old>-to-<new>.jsonl`: a header line `{"from","to","from_rev","applied"}`, then one line per ID with the Expectations lines found for it (shard, variant, status, reason). The record is the history of every reset, rename and retirement. If `--from` already pins `<tag>`, the tool exits 1; pass the revision before the move.
4. **Apply.** Run `bun run pin:bump <tag> --apply`. The tool also edits every shard under `conformance/expectations/` in place:
   - a changed ID's lines become `skip` / `not-ported-yet`, with `adapted` and `escalation` set to null (the shard path is the link to the previous Ported Test);
   - a renamed ID's lines get the new ID and keep everything else;
   - a removed ID's lines are deleted, and so is a shard left empty.

   It writes one backlog stub per Component with added, changed or renamed IDs, at `_bmad-output/implementation-artifacts/pin-bump/<new>/<component>.md`, and the record with `applied:true`. It never writes `stories/*.md` or sprint status. An applied record is never overwritten: a second `--apply` exits 1.

Then open a PR with the Pin, the regenerated files, the record, the shard edits and the stubs.

### `laravel/ai`, `laravel/mcp` and `laravel/boost`

To change the tag for `laravel/ai`, `laravel/mcp` or `laravel/boost`:

1. Get the commit the new tag resolves to. For an annotated tag, use the `^{}` line:

   ```sh
   git ls-remote https://github.com/laravel/<name>.git 'refs/tags/<tag>' 'refs/tags/<tag>^{}'
   ```

2. Get its tree with a shallow clone, and check that the commit matches step 1:

   ```sh
   git clone --depth 1 --branch <tag> https://github.com/laravel/<name>.git /tmp/<name>
   git -C /tmp/<name> rev-parse HEAD '<tag>^{tree}'
   ```

3. Replace that repository's line in `conformance/baseline-pin` with the new tag, the commit and the tree, all copied verbatim.
4. Re-run, in order: `bun run upstream:sync`, `bun run upstream:check`, `bun test` and `bun run scaffold:check`. The sync verifies the commit and the tree against the remote and fails if either differs. Then open a PR.
