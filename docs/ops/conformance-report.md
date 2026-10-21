# Conformance report, history and dashboard (`bun run conformance:report`, `conformance:history`, `conformance:site`, `conformance:publish`, `conformance:target`)

The aggregator is the only place the SM-1 alpha-gate figure is computed, and the reference computation of the Conformance Rate buckets (Story 7.1; FR-5, SM-1). Boost framework mode's `conformance.rate` (Story 7.3) does not read `report.json`: it mirrors the bucket code in `tools/boost-framework/src/tools.ts`, and XT-boost-1 holds its buckets byte-equal to `computeReport`'s; it never computes the alpha gate. The dashboard (Story 7.2) reads `report.json` and the history records, and derives two figures itself: the history chart divides each history record (overall `passing / pairs`, alpha `passing / applicable`), and the Epic review view sums `failKnown` across the Epic's Components. It reads conformance data only and imports no graded package.

```sh
bun run conformance:report                                   # writes .cache/conformance/report.json
bun --no-env-file tools/conformance-report/report.ts --root <dir> --out <file>
bun run conformance:history                                  # appends to dashboard-data on origin
bun --no-env-file tools/conformance-report/history.ts --root <dir> --report <file> --remote <remote> --branch <branch> [--history-out <file>]
bun run conformance:site                                     # writes .cache/conformance/site/
bun --no-env-file tools/conformance-report/site.ts --root <dir> --report <file> --history <file> --out <dir> --repo <owner/name> --api-surface <file>
bun run conformance:publish                                  # commits the site to gh-pages on origin
bun --no-env-file tools/conformance-report/publish.ts --root <dir> --dir <dir> --remote <remote> --branch <branch>
bun run conformance:target --history <file>                  # checks SM-1's target on a history.jsonl
bun --no-env-file tools/conformance-report/target.ts --history <file>
```

`conformance:report` reads the Inventory (`conformance/inventory/*.jsonl`), the Expectations File (`conformance/expectations/**`), the package table (`tools/scaffold/packages.jsonl`, for phases) and the Baseline Pin (`conformance/baseline-pin`). It writes `report.json`, by default `<root>/.cache/conformance/report.json`, which is gitignored and never committed, and prints:

```
conformance:report: wrote <path> (<p>/<n> pairs passing; alpha <a>/<b>)
```

Exit codes for all five tools: 0 ok, 1 data error, 2 usage error. A data error for the report is an Expectations line whose id is not in the Inventory (`conformance:report: <shard>: unknown Test ID <id>`), an unknown status, a `skip` with an unknown reason kind, a duplicate pair, or an unreadable input.

## `report.json`

Keys are written in this order (two-space JSON, final LF); Components are sorted by UTF-16 code units (`compareUnits`).

```jsonc
{
  "schema": 1,
  "commit": "<full SHA of HEAD at --root, or null outside git>",
  "pin": { "tag": "v13.37.0", "commit": "<the laravel/framework Baseline Pin commit>" },
  "phase": <the current Phase>,
  "inventory": { "ids": <Test IDs>, "sha256": "<64 lowercase hex>" },
  "overall": <bucket>,
  "components": { "<component>": <bucket>, … },
  "alpha": {
    "applicable": <Test IDs>, "passing": <Test IDs>, "rate": <number|null>, "target": 0.9,
    "variants": [<alpha variants>], "components": [<phase 1–8 Components>],
    "perVariant": { "<variant>": { "applicable": n, "passing": n }, … },
    "remaining": { "not-ported-yet": <lines>, "blocked-by": <lines> },
    "noAlphaLine": <Test IDs>,
    "met": <boolean>
  }
}
```

A bucket is:

```jsonc
{
  "pairs": n, "passing": n, "rate": <number|null>,
  "statuses": { "pass": n, "fail-known": n, "skip": n, "quarantined": n },
  "failKnown": n,
  "reasons": { "not-ported-yet": n, "blocked-by": n, "intentional-divergence": n, "php-only": n, "upstream-skip": n, "deferred": n, "out-of-scope": n },
  "reasonsDetail": { "<full reason>": n, … },
  "adapted": n
}
```

## Definitions

- **Phase.** The smallest `n ≥ 0` with no `decisions/PHASE-<n>-EXIT.md` (`currentPhase`; the exit decision files that `conformance/protected-paths`' `after-phase:<n>` markers read, via `activePhases`, which checks only that the file exists, not its contents; `decisions/` is a Protected Path). With no exit decision it is `0`.
- **Inventory hash.** `inventory.sha256` is the lowercase hex sha256 of the Inventory's Test IDs, de-duplicated, sorted by UTF-16 code units (`compareUnits`), each followed by LF (`inventoryHash`); `inventory.ids` is their count. Equal hashes mean the same Test Inventory.
- **Pair.** One Expectations line, `id` × `variant`. Its Component is the Inventory entry's `component` for `id`.
- **Conformance Rate.** `rate = passing / pairs` over every pair. `not-ported-yet` stays in the denominator, which is never shrunk. Only `status: "pass"` passes. `rate` is `null` when `pairs` is 0.
- **`statuses`.** All four statuses, zeros included; they sum to `pairs`.
- **`reasons`.** Skip Reasons of `skip` lines, keyed by kind (the reason's text before the first `:`), all seven kinds present. They sum to `statuses.skip`.
- **`reasonsDetail`.** The same lines keyed by the full reason string (`deferred:mysql-driver`, `intentional-divergence:DIV-3`, …), sorted.
- **`adapted`.** Lines whose `adapted` is non-null.
- **`failKnown`.** The same number as `statuses["fail-known"]`, as its own field. It is never part of any skip count (FR-3.5).
- **Alpha gate (SM-1).** Only lines on a variant in `ALPHA_VARIANTS` (`tools/inventory/inventory.ts`: `none`, `pgsql`, `queue-database@sqlite`, `queue-redis@redis`, `queue-sync@none`, `redis`, `sqlite`) of a Component whose package-table phase is 1–8 count.
  - A line is *applicable* unless it is a `skip` whose reason kind is `php-only`, `upstream-skip`, `deferred` or `out-of-scope`.
  - A Test ID is applicable when it has at least one applicable alpha line, and passes when **every** applicable alpha line is `pass`. `quarantined`, `fail-known`, `intentional-divergence`, `not-ported-yet` and `blocked-by` are all not passing: divergences cost conformance.
  - `alpha.rate = passing / applicable`, `null` when nothing is applicable. `perVariant` gives the same count per alpha variant (a Test ID counted on each variant it is applicable on), so the dashboard can show either view.
  - `remaining` counts the in-scope `not-ported-yet` and `blocked-by` lines. `met` is `rate >= 0.9` and both `remaining` counts are 0.
  - `components` lists every package-table name with phase 1–8, whether or not it has Expectations yet.
  - `noAlphaLine` counts the Test IDs of a phase 1–8 Component that have at least one Expectations line and none on an alpha variant (MySQL-, MariaDB-, SQL Server- or Beanstalkd-only tests). They are outside the alpha denominator, because SM-1 measures the alpha variants only; the field makes that exclusion visible instead of silent. It changes no other alpha field. The dashboard shows it in the alpha paragraph.

## History

`conformance:history` appends one record, built from `report.json`, to `history.jsonl` on the `dashboard-data` branch:

```json
{"commit":"<sha>","pin":{"tag":"v13.37.0","commit":"<sha>"},"phase":n,"inventory":{"ids":n,"sha256":"<hex>"},"overall":{"pairs":n,"passing":n},"alpha":{"applicable":n,"passing":n},"components":{"<c>":{"pairs":n,"passing":n}}}
```

`phase` and `inventory` are copied from `report.json`; `history.ts`'s `readReport` refuses a report without an integer `phase ≥ 0` and an `inventory` with a numeric `ids` and a 64-hex `sha256`. Lines written before they were recorded lack both: they stay valid when read (`readHistory`, `conformance:target`), are never backfilled, and are written back byte-for-byte unchanged (the site's `history.jsonl` copy).

The key is (commit, pin). Appending a key that is already present changes nothing, makes no commit and exits 0 (`… already recorded on <remote> <branch>`). The same commit under a new Pin is a new line, so the history chart (Story 7.2) can mark each Pin change and start a new series. A report computed outside git (`commit: null`) is refused.

Mechanics (all in `tools/conformance-report/history.ts`):

- It lists `refs/heads/<branch>` on `--remote` (default `origin`). When present, it fetches it into `refs/xaravel-history/<branch>` and appends to its `history.jsonl`, keeping any other file on the branch. When missing, it creates an orphan commit holding only `history.jsonl`.
- It builds the commit with git plumbing (`hash-object`, a temporary index file, `write-tree`, `commit-tree`) as `github-actions[bot]`, so the caller's HEAD, index and working tree are never touched.
- It pushes the commit as a fast-forward of the branch, never forced. On a non-fast-forward rejection it refetches and re-appends, up to 3 retries.
- The source guard (`checkSource`, shared with `conformance:publish`) runs on every attempt, after the fetch and before any commit is built. The report's `commit` is accepted only when it is the `commit` of the last non-empty line of `history.jsonl`, a descendant of it (`git merge-base --is-ancestor`; a last commit missing from the local object store is not an ancestor, and one that is not a full hex commit id counts as `unknown`; a source that is not one is refused as `not a commit id`), or the current tip of `--main-branch` (default `main`) on the remote (`git ls-remote`, looked up only when the ancestry test fails). Otherwise it exits 1 with `refusing <source>: it is not a descendant of the last recorded or published source <last|unknown>, nor the <remote> <main-branch> tip <sha|missing> …` and pushes nothing. An empty or missing history accepts any commit. This stops a re-run of an older dashboard run from appending a stale record after newer ones (which drew false Pin-change markers). The check applies even when the key is already recorded.

The branch is separate from `main`, so `main` stays linear and free of bot commits; Story 7.2's Pages build reads `history.jsonl` from it.

`--history-out <file>` writes the branch's full `history.jsonl` after the append (or as it is, when the record is already there). The workflow passes it to `conformance:site --history`; `AppendResult.content` holds the same text.

## Dashboard site (`conformance:site`)

`tools/conformance-report/site.ts` renders a static site into `--out` (default `.cache/conformance/site`), replacing a previous site there; it refuses a non-empty directory without `.nojekyll`. It prints `conformance:site: wrote <n> pages to <dir>`. Every rate, count and alpha figure comes from `report.json`, except the history chart's ratios (each history record's overall `passing / pairs` and alpha `passing / applicable`) and the Epic review view's fail-known (the sum of `failKnown` across the Epic's Components), which the site derives itself. Every interpolated string is HTML-escaped.

Flags: `--root`; `--report` (default `.cache/conformance/report.json`; a missing one exits 1 naming the path); `--history <file>` (absent means an empty history; a malformed line exits 1 naming its line number); `--out`; `--repo <owner/name>` (default `$GITHUB_REPOSITORY`; when neither is set, record names render as plain text, without links); `--api-surface <file>`, a precomputed `ComponentDiff[]` JSON. Without `--api-surface` the site calls `diffComponents(root, componentsOf(root))`, which runs `tsc -b`.

The output holds `index.html`, `epics/<N>.html` for every Epic with a Story manifest, `api-surface/<component>.html` for every API-surface Component, `.nojekyll`, `report.json` and `history.jsonl`.

`index.html` shows:

- **Conformance Rate.** The full rate with its denominator (`<passing> / <pairs> pairs`) and, in the same section beside it, the alpha figure (`<passing> / <applicable> applicable Test IDs`, the target, `met`, the `remaining` counts and the `noAlphaLine` Test IDs outside the denominator). A `null` rate is `n/a`. Then the overall bucket and a per-Component table: pairs, passing, rate, `fail-known`, quarantined, adapted.
- **Skip Reasons.** All seven kinds, and the `reasonsDetail` table.
- **Divergences.** A row for `DIV-1`..`DIV-12`, any other `DIV-<n>` a reason names and any other `decisions/DIV-<n>.md` record, with the pair count whose reason is `intentional-divergence:DIV-<n>`. The row links to `https://github.com/<repo>/blob/<commit>/decisions/DIV-<n>.md` when the record exists, or shows `no record yet` (Epic 8 writes the records).
- **Open Escalations.** Every `conformance/escalations/ESC-*.md` whose `escalationStatus` is `open`, with its trigger, Test IDs and status. One whose status cannot be read (`escalationStatus` throws, e.g. a malformed name) is not decided, so it is listed too, with status `unknown`.
- **Quarantined tests.** Every Expectations line with `status: quarantined`: id, variant, Escalation.
- **API-surface diff.** Per Component, the `countsOf` columns upstream, matched, missing, renamed, extra, unexplained. Each Component's name links to `api-surface/<component>.html`, which lists every item of its diff (the missing, renamed and extra members, and the rest): category, kind, FQCN, member, rename target and explanation (`unexplained` when there is none).
- **History.** An inline SVG chart. `historySeries` splits the records, in file order, into series; a new series starts at every record whose (pin tag, pin commit) differs from the previous record's, even if that Pin was used earlier, and each change is a marker labelled with the new tag. Each series is its own `<polyline>` for overall (`passing / pairs`) and for alpha (`passing / applicable`), so no line joins across a Pin change. With no records, the chart says `no history yet`.
- **SM-1 target.** After History (`#target`): the verdict of the target check (below) on the history, `Target held (<k> Phase boundaries checked across <s> Pin series).` (`boundary` when `<k>` is 1) or `Target violated (…):` with every violation line; a table of the reference points (Pin, commit, phase, overall `passing / pairs` with its rate, and whether the point is the series start or a Phase boundary); and, for each Pin change, the **Test Inventory diff** `<from tag> → <to tag>` between the last record of the earlier series and the first record of the later one. When both records carry `inventory.sha256` and they are equal it shows `no change`; otherwise `collectSiteInput` reads both Inventories with `readInventoryAt(root, commit)` (`inventoryDiffs`) and the entry shows added and removed counts per Component and in total, with the IDs in a `<details>` per Component and side, capped at 200 (`… and N more`). A commit or Inventory that cannot be read shows `unavailable (<reason>)`. A violation never fails the site build.
- **Epic review.** A link to each Epic's page.

### Epic review view (`epics/<N>.html`)

`epicReview(root, epic, report)` covers the Epic's Stories: the manifests with `epic: <N>` (`readManifests` + `applySprintStatus`). Its page shows, in this order:

1. **Blocking acceptance.** The `fail-known` count of the Epic's Components, labelled as the Components' count across all Epics (a Component's bucket is shared by every Epic that touches it), and every open Escalation that concerns the Epic, whenever it was added: its Story ID is one of the Epic's (`ESC-<N>.<k>-<n>`), or its `test_ids` intersect the `test_ids`/`xaravel_test_ids` of the Epic's Stories. An Escalation whose status cannot be read counts as open. Both are flagged as blocking acceptance.
2. **Components.** Each Component of its Stories (sorted) with its rate (`<passing> / <pairs> pairs`), `fail-known`, quarantined, adapted and Skip Reason counts by kind; a Component with no bucket in the report shows `no Test IDs in the Inventory`.
3. **Added since the Epic began.** `began` is the parent of the oldest commit reachable from HEAD whose subject starts with `<story-id>: ` for one of its Stories (on `main`, the squash-merge subjects such as `7.1: Conformance aggregator (#209)`). `began` ignores planning commits made just before the Epic's first Story commit: a record they add is not listed. `ended` bounds the range so a finished Epic's page does not also list what later Epics added: it is the later, in the `--topo-order` list, of the Epic's newest Story commit and the newest commit that added the Epic's retrospective document, `_bmad-output/implementation-artifacts/epic-<N>-retro-*.md` directly in that directory. The retrospective only ever extends the range, so a Story commit made after the retrospective still counts. The retrospective lookup is add-only (`git log -M --diff-filter=A`), and `epic-1-` never matches `epic-10-`. A later edit of the retrospective does not move `ended`, and neither does a rename within that directory. Three things do move it to the newer add: a move into the directory from elsewhere, a rename git does not detect as one (for example, heavy edits in the same commit), and a retrospective deleted and re-added or a second retrospective. The page shows `Ended at: <sha> (retrospective)` or `(last Story commit)`. The Divergence Records (`decisions/DIV-*.md`) and Escalations (`conformance/escalations/ESC-*.md`) added in `began..ended` (`git log --diff-filter=A`) and still present at HEAD are listed, each Escalation with its Test IDs and status. With no Story commit, `began` and `ended` are null and both lists are empty.
4. **Stories.** Per Story: id, status, commit count, distinct files changed, and lines added and deleted, summed with `--numstat` over the Story's commits (binary files count no lines). A Story's commits are matched by subject prefix only: every commit reachable from HEAD whose subject starts `<story-id>: ` counts, so blocked attempts and follow-up commits that use that subject count too. The log runs with `--no-renames`, so a renamed file counts as an add of the new path plus a delete of the old one: both paths count as files, and all its lines count as added and deleted.

## SM-1 target check (`conformance:target`)

PRD SM-1's target is that the Conformance Rate "never decreases between Phase boundaries under the same Baseline Pin" (Epic 7 retro item 10, `decisions/MAINT-2026-10-20-epic-6-7-items.md`). `tools/conformance-report/target.ts` checks it on a `history.jsonl`:

- The records split into Pin series as the history chart splits them (`pinSeries`).
- In a series the **reference points** are its first record and every **boundary record**: a record whose `phase` is higher than the `phase` of the nearest earlier record in the series that has one. A legacy line (no `phase`) never makes the next record a boundary. The first record counts so the check applies from the first Phase boundary under a Pin (the Phase 0 exit).
- For each scope (overall, and each Component), a reference point with `pairs > 0` must not be lower than the last earlier reference point in the series with `pairs > 0` for that scope, compared exactly (`p2·n1 ≥ p1·n2`); the violation names that earlier point. A point with no pair for a scope, or without the Component, is skipped for that scope, so it never breaks the chain. A record whose `phase` is lower than an earlier record's in the series is a violation, `phase went back`.
- A violation line reads `<pin tag>: <commit 12> (phase <p|unknown>) → <commit 12> (phase <p>): overall <p>/<n> → <p>/<n>` (or `component <c> …`, or `phase went back`).

It prints `conformance:target: ok (<k> Phase boundaries checked across <s> Pin series)` (`boundary` when `<k>` is 1) and exits 0, or prints each violation on stderr (`conformance:target: <line>`) and exits 1. A missing or malformed history exits 1; bad usage (no `--history`, an unknown flag) exits 2. `targetViolations` and `referencePoints` are pure, and the dashboard renders the same verdict.

## Publish (`conformance:publish`)

`tools/conformance-report/publish.ts` commits the files of `--dir` (default `.cache/conformance/site`) to `--branch` (default `gh-pages`) of `--remote` (default `origin`) and pushes it. It prints `conformance:publish: <created|updated|unchanged> <remote> <branch> at <tip>`.

- `--dir` must hold an `index.html`; an empty directory or a partial build is refused (exit 1), so it never replaces the published site.
- The commit's tree is exactly the files of `--dir` (mode 100644): a file removed from the directory is gone from the branch. Its parent is the remote tip, or none when the branch is missing (an orphan, `created`).
- When the tip already has the identical tree, nothing is committed (`unchanged`, exit 0).
- It uses the same plumbing as the history tool (exported from `history.ts`: `git`, `gitOk`, `fetchTip`, `BOT`): a temporary index file, `write-tree` and `commit-tree` as `github-actions[bot]`, so the caller's HEAD, index and working tree are never touched. The tip is fetched into `refs/xaravel-history/<branch>`.
- The push is never forced; on a non-fast-forward rejection (`REJECTED`) it refetches and rebuilds, up to `PUSH_RETRIES` (3) retries.
- The source commit is the caller's full `HEAD` (a repository without one is refused). Each commit's message is the subject `conformance site: <12-hex>` and a `Source-Commit: <40-hex>` trailer. On every attempt, after the fetch and before the tree compare, `publishedSource` reads the tip's source (the trailer; for a tip made before the trailer, the commit its subject's 12-hex resolves to) and the history tool's source guard runs with `--main-branch` (default `main`): HEAD must be that commit, a descendant of it, or the remote `main` tip, else it exits 1 with `refusing …` and `gh-pages` is unchanged. A tip whose source cannot be read accepts only the `main` tip; a missing branch accepts any HEAD.

Like `conformance:history`, it is for the dashboard workflow: run locally against `origin`, it would replace the published site.

GitHub Pages serves the `gh-pages` branch ("Deploy from a branch"), so the job's `contents: write` is enough. `actions/deploy-pages` is not used: it needs `id-token: write`, which AD-18 and `release.ts` `authorityViolations` (XT-conformance-38) allow only in `release.yml#release`.

### Maintainer live step: enable Pages

The agent never enables or configures Pages. Once, after the first `dashboard` run on `main` has created `gh-pages`, the Maintainer sets Settings → Pages → Build and deployment → Source: Deploy from a branch, branch `gh-pages`, folder `/`; or:

```sh
gh api -X POST repos/<owner>/<repo>/pages -f 'source[branch]=gh-pages' -f 'source[path]=/'
```

## Workflow

`.github/workflows/dashboard.yml` runs job `dashboard` on every push to `main`, in concurrency group `dashboard` with `cancel-in-progress: false`. That never cancels a running run, but GitHub keeps at most one pending run per group and a newer push cancels the pending one, so with three or more pushes during one run the middle commits get no record. This is rare in practice, because merges reach `main` one at a time through the merge queue. The top level is `permissions: contents: read`; only this job holds `contents: write` (AD-16; `tools/workflow-permissions` allows `dashboard.yml#dashboard`). The checkout sets `persist-credentials: false`; only the history and publish steps get the job token, as a git `http.extraheader` passed through `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0`/`GIT_CONFIG_VALUE_0` for each of those commands only, never written to `.git/config`. The checkout also sets `fetch-depth: 0`, because the Epic review view reads the full history. It installs with `bun install --frozen-lockfile --ignore-scripts`, then runs `expectations:check` (step `Check the Expectations File`: an Inventory ID with no Expectations line would otherwise silently leave the report's denominator and publish a shrunken rate, so a failing check stops the job before anything is pushed), `conformance:report`, `conformance:history --history-out .cache/conformance/history.jsonl`, `conformance:site --history .cache/conformance/history.jsonl --repo "$GITHUB_REPOSITORY"` (no token), `conformance:publish --dir .cache/conformance/site` and, last, `conformance:target --history .cache/conformance/history.jsonl` (step `Check the SM-1 target`). The target check runs after publish, so on a violation the site (which shows it) is still published and the run goes red. The job's permissions stay exactly `contents: write`: no `pages` or `id-token` scope. A run whose commit is older than the last record (a re-run of an older run, say) fails at the history step's source guard unless that commit is still the `main` tip, so it neither appends a stale record nor republishes the site; a run whose commit descends from the last record is accepted. The guard is a second reason for `fetch-depth: 0`: the ancestry test needs the last recorded commit in the local object store, and without full history every run whose commit is not the `main` tip would be refused. The dashboard's `expectations:check` is a second line of defence beside `ci.yml`'s: an admin merge that bypasses the merge queue reaches `main` without CI's check.

`conformance:history` is for the dashboard workflow: run locally against `origin`, it would push a record for a local commit to the real `dashboard-data` branch.

## Limits

- The live push from the workflow is unverified until its first run on `main`. The tests drive the history tool against a bare local remote (`conformance/tests/xaravel/conformance-report.test.ts`, XT-conformance-145).
- A push that lands while another run is pending can leave a commit without a record (see Workflow).
- `.github/rulesets/agent-push.json` is disabled now. Before it is re-enabled, `refs/heads/dashboard-data` and `refs/heads/gh-pages` must be added to its `exclude`, or it blocks the history and site pushes ([identities.md](identities.md)).
- The live publish and the served page are unverified until the Maintainer enables Pages (above) and the first run on `main`. The tests drive `publishSite` against a bare local remote (XT-conformance-146).
- Without `--api-surface`, the site build runs `tsc -b` for the API-surface diff; a build failure fails the site step.
- The Epic review view reads only commit subjects. A Story with no merged `<story-id>: ` commit adds no files, lines, `began` or `ended`; a record added outside the Epic's commits but in `began..ended` is still listed. Before its retrospective is committed, an Epic's range ends at its newest Story commit, so a record added after that commit but before the retrospective appears only once the retrospective lands. An Epic whose Story commits interleave with another Epic's lists what the other Epic added in that span.
- Records raised after `ended` are not listed under "Added since the Epic began". For example, Escalations from retrospective action items, such as ESC-5.3-4, are not listed there; open ones still show under Blocking acceptance.
- The range assumes `main`'s linear squash-merge history: `began..ended` is git reachability, and "newest" and "after" use the `--topo-order` commit list.
- A Divergence Record or Escalation added and then deleted before HEAD is not listed.
- `gh-pages` keeps one full-site commit per push to `main` that changes the site, and grows without bound; nothing prunes it. The `fetch-depth: 0` checkout fetches every branch's history, `gh-pages` and `dashboard-data` included, so the checkout grows with it.

## Tests

`conformance/tests/xaravel/conformance-report.test.ts`: XT-conformance-143 (bucket counts, the CLI, errors, the real repository's pair count; FR-5.1), XT-conformance-144 (the alpha-gate rules; FR-5.2) and XT-conformance-145 (history append, orphan creation, idempotence, a Pin change, `--history-out`, the caller's tree untouched, the source guard (a descendant appends; an older re-run is refused with the branch unchanged unless it is the `main` tip; `--main-branch`; an unknown last commit is refused), and `dashboard.yml` with `expectations:check` before the report; FR-5.4, FR-5.5).

`conformance/tests/xaravel/dashboard.test.ts`: XT-conformance-146 (the index contents, escaping, links with and without a repo, errors, publish created/unchanged/updated with the caller untouched, the `Source-Commit` trailer and source guard (a newer commit publishes, the older one is refused with `gh-pages` unchanged, an old-format tip resolves via its subject, an unresolvable one accepts only the `main` tip), and the workflow shape; FR-5, FR-5.1, FR-5.2, FR-5.3, FR-5.5), XT-conformance-147 (history series, markers and the SVG; FR-5.4), XT-conformance-148 (the Epic review view on a fixture git repository and its page; UJ-5), XT-conformance-257 (the SM-1 target check: held, a decrease at a boundary, a Component decrease, a Pin change, legacy lines, a phase going back, the exact comparison, the CLI's exit codes and the workflow's last step) and XT-conformance-258 (`phase` and the Inventory hash in the report and record, `readReport`'s checks, a legacy line round-tripping unchanged, and the `#target` section with the Test Inventory diff on a fixture git repository with several Pin series).
