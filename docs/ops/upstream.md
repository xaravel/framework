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

`tools/scaffold/table.ts` builds the package table from `conformance/upstream/framework` only. Without a snapshot it fails, telling you to run `bun run upstream:sync`. Each row's `require` and `suggest` are its `composer.json` lists. A row may also carry `uses`: a package its Upstream source uses directly but reaches only through its `require` graph, with the reason (`UPSTREAM_USES` in `table.ts`; `config` uses `illuminate/macroable`, [ESC-15.1-1](../../conformance/escalations/ESC-15.1-1.md)). The scaffold makes each `uses` edge a workspace dependency, and the table build, `bun run scaffold` and `scaffold:check` reject one that names no package row, is not reachable through `require`, is already a dependency, would close a cycle or has an empty reason.

## Offline use

Only `upstream:sync` touches the network. The check and the reader API (`readUpstream(root, name, rel)` and `upstreamPath(root, name, rel)`) only read files under `conformance/upstream/`. Once you have synced, you can work fully offline. The snapshot is read-only, so to edit it while debugging, run `chmod -R u+w` first. Afterwards, run `upstream:sync`: it re-fetches a modified directory, and makes an unmodified one read-only again.

## Changing a tag (Maintainer)

`conformance/baseline-pin` is a Protected Path, so a tag changes only through a Maintainer-approved change.

### The `laravel/framework` Pin: `bun run pin:bump <tag>`

The framework Pin moves only at a freeze point, and only through `bun run pin:bump <tag> [--from <rev>] [--apply] [--remote <base>] [--root <dir>] [--security-override <decision-file>]` (`tools/pin-bump/pin-bump.ts`, Story 2.8, `decisions/ESC-2.8-1.md`). Do not edit its line by hand. The tool refuses (exit 1, nothing written) while any `epic-<N>` key under `development_status` in `_bmad-output/implementation-artifacts/sprint-status.yaml` is `in-progress`, and lists those Epics; only a security release may lift that refusal ([below](#security-releases---security-override-maintainer-only)). It never touches the `laravel/ai`, `laravel/mcp` or `laravel/boost` lines. The flow has four steps. The commands that step 1 prints are step 2, and their last line is step 3:

1. **Move.** Run `bun run pin:bump <tag>` while the framework line still names the old tag. The tool resolves the commit and the tree exactly as steps 1 and 2 below describe (the `^{}` line wins; the clone's commit must match), from `--remote <base>` (default `https://github.com`). Before it writes, it records the pre-move revision, `git rev-parse HEAD` (a full 40-hex SHA). It rewrites only the framework line as `laravel/framework <tag> <commit> <tree>`, runs `upstream:sync` and prints the regeneration steps. A missing tag or a commit mismatch exits 1 and leaves the Pin unchanged. This step writes no record, stubs or Expectations, even with `--apply`.
2. **Regenerate.** Run the printed lines in order, in one POSIX shell at the repository root, on a branch other than `main`. They are exact commands: the tool substitutes `<tag>` and the pre-move SHA, so nothing is left to fill in. They need Docker, Composer, the network and an authenticated `gh`, so the tool never runs them itself. For a move to `v13.38.0` they are as below, except that the tool prints the full pre-move SHA in the last line:

   ```sh
   bun run oracle:lock
   tag="$(bun run --silent oracle:tag)" && bun run oracle:build "xaravel-oracle:$tag"
   bun run inventory
   b="$(git branch --show-current)" && test -n "$b" && test "$b" != main && git add conformance/baseline-pin conformance/oracle/locks conformance/inventory && git commit -m "pin bump: laravel/framework v13.38.0, regenerated locks and Inventory" && git push -u origin HEAD && gh workflow run baseline.yml --ref "$b"
   sleep 15 && run="$(gh run list --workflow baseline.yml --event workflow_dispatch --commit "$(git rev-parse HEAD)" --limit 1 --json databaseId --jq '.[0].databaseId')" && test -n "$run" && gh run watch "$run"
   test -n "$run" && dl="$(mktemp -d)" && gh run download "$run" --name inventory --dir "$dl" && rm -rf conformance/inventory && mv "$dl" conformance/inventory
   git add conformance/inventory && git commit -m "pin bump: laravel/framework v13.38.0, baselined Inventory" && git push
   bun run pin:bump v13.38.0 --from <the full pre-move SHA>
   ```

   - `oracle:lock` regenerates the four locks for the new framework tag ([oracle.md](oracle.md#regenerating-the-locks)).
   - `oracle:build` builds the image, tagged as `oracle:tag` prints; if `oracle:tag` fails, nothing is built. Its root-version list comes from the Pin, so the Dockerfile needs no edit ([oracle.md](oracle.md#the-root-version-list)).
   - `inventory` regenerates the Inventory in that image.
   - The baseline run needs CI's Postgres and Redis services, so it runs only in CI. One chained line commits and pushes the branch, then dispatches `baseline.yml` on it; it stops on `main` or a detached HEAD, before anything is committed or dispatched. The `merge` job's `inventory` artifact then replaces `conformance/inventory/`. That job uploads the artifact before its committed-equals-output check, so the artifact exists even though that check fails on the not-yet-baselined commit. `gh run watch` waits for the run without failing on that check.
   - The download goes into a temp directory, and `conformance/inventory/` is replaced only after it succeeds. If no run was found, or a leg failed so there is no artifact, the Inventory is left as it was.
   - The baselined Inventory is committed and pushed, so the PR's next `baseline.yml` run passes its committed-equals-output check.
   - The last line is step 3, with `--from` set to the pre-move SHA, because `HEAD` now pins `<tag>`.
3. **Report.** Run `bun run pin:bump <tag>` again, now that the line names `<tag>`. The tool diffs the Inventory at `--from <rev>` (default `HEAD`, read with `git show`) against the working tree, and never touches the network. It prints the `Added`, `Changed` (same Test ID, different `hash`), `Removed` and `Renamed` IDs. A rename is a removed and an added ID with the same `hash` and `component`, where no other removed or added ID shares that hash. It writes the bump record `conformance/pin-bumps/<old>-to-<new>.jsonl`: a header line `{"from","to","from_rev","applied"}`, then one line per ID with the Expectations lines found for it (shard, variant, status, reason). The record is the history of every reset, rename and retirement. If `--from` already pins `<tag>`, the tool exits 1; pass the revision before the move (move mode prints it).

   `Changed` sees only the `hash`, which covers a test's own method or closure and its dataset, not `setUp`/`tearDown`, helper methods, class properties or traits ([inventory.md](inventory.md#the-hash)). An Upstream edit that only touches those is not reported, and the test's Expectations are not reset. Review the Upstream diff for such edits by hand.
4. **Apply.** Run `bun run pin:bump <tag> --from <the pre-move SHA> --apply`. The tool also edits every shard under `conformance/expectations/` in place:
   - a changed ID's lines become `skip` / `not-ported-yet`, with `adapted` and `escalation` set to null (the shard path is the link to the previous Ported Test);
   - a renamed ID's lines get the new ID and keep everything else;
   - a removed ID's lines are deleted, and so is a shard left empty.

   It writes one backlog stub per Component with added, changed or renamed IDs, at `_bmad-output/implementation-artifacts/pin-bump/<new>/<component>.md`, and the record with `applied:true`. It never writes `stories/*.md` or sprint status. An applied record is never overwritten: a second `--apply` exits 1.

Then open a PR with the Pin, the regenerated files, the record, the shard edits and the stubs.

Until the baseline artifact is committed, the Inventory still holds `assertions` and `oracle` carried over from the old Pin's baseline for every entry whose `id`, `hash` and `backends` did not change ([inventory.md](inventory.md), Preservation). Those values were recorded against the old Pin. The guard is `baseline.yml`'s `merge` job, which fails when the committed Inventory differs from its output. It is not yet a required check (Epic 1 item 2), so confirm it passes on the PR before merging.

#### Security releases: `--security-override` (Maintainer only)

A security-relevant Upstream release may move the Pin mid-Phase (`decisions/OQ-12.md`): one whose release notes, or a GitHub Security Advisory for `laravel/framework` or a package the Oracle locks, name a security fix. It runs the four steps above with nothing skipped. The only change is that the freeze-point refusal is lifted for that tag. Only the Maintainer decides that a release is security-relevant and authorises the override. Agents never write a `decisions/PIN-SECURITY-*.md` decision, and an ordinary minor still waits for a Phase boundary.

1. **Write and commit the decision.** The Maintainer writes `decisions/PIN-SECURITY-<name>.md` (`<name>` starts with a letter or digit, then letters, digits, `.`, `_` or `-`) and commits it on the pin-bump branch. Create that branch and commit the decision before step 1, because the move already needs the decision committed at `HEAD`. `decisions/` is a Protected Path, so it reaches `main` only through the Maintainer-reviewed PR. The tool checks the signature's form, not who wrote or committed the file, so that Protected-Path review at merge is what keeps the override Maintainer-only. The frontmatter is signed like a Phase exit (`decision: approved`, `decided_by: Maintainer`, a `YYYY-MM-DD` `date`) and names the `tag` being moved to and the `advisory`: a GitHub Security Advisory ID (`GHSA-xxxx-xxxx-xxxx`, lowercase), a CVE ID (`CVE-YYYY-NNNN`, four or more digits) or an `https://` URL (printable ASCII, no spaces, `!` or `"`). A decision names one advisory: put the primary one in `advisory`, and list any others in the body and the PR. The body says why, in at least one line that is not a heading:

   ```markdown
   ---
   decision: approved
   decided_by: Maintainer
   date: 2026-11-02
   tag: v13.38.1
   advisory: GHSA-abcd-1234-wxyz
   ---

   v13.38.1 fixes the advisory above; move the Pin mid-Phase per decisions/OQ-12.md.
   ```

2. **Pass the flag to every run.** Pass `--security-override decisions/PIN-SECURITY-<name>.md` to every `pin:bump` run of the flow. Add it to the move (step 1), for example `bun run pin:bump v13.38.1 --security-override decisions/PIN-SECURITY-v13.38.1.md`; move mode then carries it into the last printed line, so the report (step 3) gets it from the printed steps. Add it yourself to the `--apply` run (step 4). The tool validates the decision before it reads or writes anything else, whether or not an Epic is in progress, and refuses (exit 1, nothing written) and lists every problem when:
   - the path is not `decisions/PIN-SECURITY-<name>.md`, relative to the repository root;
   - the file is not committed at `HEAD`, is missing from the working tree, or differs from its committed copy;
   - the signature is incomplete (`decision`, `decided_by`, `date` or the body);
   - `tag` is not exactly `<tag>`, so a decision cannot be reused for another release;
   - `advisory` is not one of the three forms above.

   With a valid decision and Epics in progress, the tool prints `pin:bump: freeze point overridden for a security release, <advisory> (<decision>); in progress: epic-…` on stderr and carries on. Both printed `git commit -m` messages end with `, security override <advisory> (<decision>)`. The report's second line is `Security override: <advisory> (<decision>)`, and the bump record's header gains `"security_override":{"advisory":…,"decision":…}` after `applied`. Once a record holds an override, a later report or `--apply` run with no override, or with another one, exits 1 and writes nothing. Without the flag, output and record are exactly as above.
3. **Name it in the PR.** The PR includes the decision file, and its body names the advisory and the decision path next to the usual pin-bump contents.

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
