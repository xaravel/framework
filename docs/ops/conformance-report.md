# Conformance report, history and dashboard (`bun run conformance:report`, `conformance:history`, `conformance:site`, `conformance:publish`)

The aggregator is the only place the Conformance Rate and the SM-1 alpha-gate figure are computed (Story 7.1; FR-5, SM-1). The dashboard (Story 7.2) and Boost framework mode's `conformance.rate` (Story 7.3) read its `report.json`; they never derive a number themselves. It reads conformance data only and imports no graded package.

```sh
bun run conformance:report                                   # writes .cache/conformance/report.json
bun --no-env-file tools/conformance-report/report.ts --root <dir> --out <file>
bun run conformance:history                                  # appends to dashboard-data on origin
bun --no-env-file tools/conformance-report/history.ts --root <dir> --report <file> --remote <remote> --branch <branch> [--history-out <file>]
bun run conformance:site                                     # writes .cache/conformance/site/
bun --no-env-file tools/conformance-report/site.ts --root <dir> --report <file> --history <file> --out <dir> --repo <owner/name> --api-surface <file>
bun run conformance:publish                                  # commits the site to gh-pages on origin
bun --no-env-file tools/conformance-report/publish.ts --root <dir> --dir <dir> --remote <remote> --branch <branch>
```

`conformance:report` reads the Inventory (`conformance/inventory/*.jsonl`), the Expectations File (`conformance/expectations/**`), the package table (`tools/scaffold/packages.jsonl`, for phases) and the Baseline Pin (`conformance/baseline-pin`). It writes `report.json`, by default `<root>/.cache/conformance/report.json`, which is gitignored and never committed, and prints:

```
conformance:report: wrote <path> (<p>/<n> pairs passing; alpha <a>/<b>)
```

Exit codes for all four tools: 0 ok, 1 data error, 2 usage error. A data error for the report is an Expectations line whose id is not in the Inventory (`conformance:report: <shard>: unknown Test ID <id>`), an unknown status, a `skip` with an unknown reason kind, a duplicate pair, or an unreadable input.

## `report.json`

Keys are written in this order (two-space JSON, final LF); Components are sorted by UTF-16 code units (`compareUnits`).

```jsonc
{
  "schema": 1,
  "commit": "<full SHA of HEAD at --root, or null outside git>",
  "pin": { "tag": "v13.37.0", "commit": "<the laravel/framework Baseline Pin commit>" },
  "overall": <bucket>,
  "components": { "<component>": <bucket>, … },
  "alpha": {
    "applicable": <Test IDs>, "passing": <Test IDs>, "rate": <number|null>, "target": 0.9,
    "variants": [<alpha variants>], "components": [<phase 1–8 Components>],
    "perVariant": { "<variant>": { "applicable": n, "passing": n }, … },
    "remaining": { "not-ported-yet": <lines>, "blocked-by": <lines> },
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

## History

`conformance:history` appends one record, built from `report.json`, to `history.jsonl` on the `dashboard-data` branch:

```json
{"commit":"<sha>","pin":{"tag":"v13.37.0","commit":"<sha>"},"overall":{"pairs":n,"passing":n},"alpha":{"applicable":n,"passing":n},"components":{"<c>":{"pairs":n,"passing":n}}}
```

The key is (commit, pin). Appending a key that is already present changes nothing, makes no commit and exits 0 (`… already recorded on <remote> <branch>`). The same commit under a new Pin is a new line, so the history chart (Story 7.2) can mark each Pin change and start a new series. A report computed outside git (`commit: null`) is refused.

Mechanics (all in `tools/conformance-report/history.ts`):

- It lists `refs/heads/<branch>` on `--remote` (default `origin`). When present, it fetches it into `refs/xaravel-history/<branch>` and appends to its `history.jsonl`, keeping any other file on the branch. When missing, it creates an orphan commit holding only `history.jsonl`.
- It builds the commit with git plumbing (`hash-object`, a temporary index file, `write-tree`, `commit-tree`) as `github-actions[bot]`, so the caller's HEAD, index and working tree are never touched.
- It pushes the commit as a fast-forward of the branch, never forced. On a non-fast-forward rejection it refetches and re-appends, up to 3 retries.

The branch is separate from `main`, so `main` stays linear and free of bot commits; Story 7.2's Pages build reads `history.jsonl` from it.

`--history-out <file>` writes the branch's full `history.jsonl` after the append (or as it is, when the record is already there). The workflow passes it to `conformance:site --history`; `AppendResult.content` holds the same text.

## Dashboard site (`conformance:site`)

`tools/conformance-report/site.ts` renders a static site into `--out` (default `.cache/conformance/site`), replacing a previous site there; it refuses a non-empty directory without `.nojekyll`. It prints `conformance:site: wrote <n> pages to <dir>`. Every rate, count and alpha figure comes from `report.json`; the site never recomputes one, and every interpolated string is HTML-escaped.

Flags: `--root`; `--report` (default `.cache/conformance/report.json`; a missing one exits 1 naming the path); `--history <file>` (absent means an empty history; a malformed line exits 1 naming its line number); `--out`; `--repo <owner/name>` (default `$GITHUB_REPOSITORY`; when neither is set, record names render as plain text, without links); `--api-surface <file>`, a precomputed `ComponentDiff[]` JSON. Without `--api-surface` the site calls `diffComponents(root, componentsOf(root))`, which runs `tsc -b`.

The output holds `index.html`, `epics/<N>.html` for every Epic with a Story manifest, `api-surface/<component>.html` for every API-surface Component, `.nojekyll`, `report.json` and `history.jsonl`.

`index.html` shows:

- **Conformance Rate.** The full rate with its denominator (`<passing> / <pairs> pairs`) and, in the same section beside it, the alpha figure (`<passing> / <applicable> applicable Test IDs`, the target and `met`). A `null` rate is `n/a`. Then the overall bucket and a per-Component table: pairs, passing, rate, `fail-known`, quarantined, adapted.
- **Skip Reasons.** All seven kinds, and the `reasonsDetail` table.
- **Divergences.** A row for `DIV-1`..`DIV-12`, any other `DIV-<n>` a reason names and any other `decisions/DIV-<n>.md` record, with the pair count whose reason is `intentional-divergence:DIV-<n>`. The row links to `https://github.com/<repo>/blob/<commit>/decisions/DIV-<n>.md` when the record exists, or shows `no record yet` (Epic 8 writes the records).
- **Open Escalations.** Every `conformance/escalations/ESC-*.md` whose `escalationStatus` is `open`, with its trigger, Test IDs and status. One whose status cannot be read (`escalationStatus` throws, e.g. a malformed name) is not decided, so it is listed too, with status `unknown`.
- **Quarantined tests.** Every Expectations line with `status: quarantined`: id, variant, Escalation.
- **API-surface diff.** Per Component, the `countsOf` columns upstream, matched, missing, renamed, extra, unexplained. Each Component's name links to `api-surface/<component>.html`, which lists every item of its diff (the missing, renamed and extra members, and the rest): category, kind, FQCN, member, rename target and explanation (`unexplained` when there is none).
- **History.** An inline SVG chart. `historySeries` splits the records, in file order, into series; a new series starts at every record whose (pin tag, pin commit) differs from the previous record's, even if that Pin was used earlier, and each change is a marker labelled with the new tag. Each series is its own `<polyline>` for overall (`passing / pairs`) and for alpha (`passing / applicable`), so no line joins across a Pin change. With no records, the chart says `no history yet`.
- **Epic review.** A link to each Epic's page.

### Epic review view (`epics/<N>.html`)

`epicReview(root, epic, report)` covers the Epic's Stories: the manifests with `epic: <N>` (`readManifests` + `applySprintStatus`). Its page shows, in this order:

1. **Blocking acceptance.** The `fail-known` count of the Epic's Components, labelled as the Components' count across all Epics (a Component's bucket is shared by every Epic that touches it), and every open Escalation that concerns the Epic, whenever it was added: its Story ID is one of the Epic's (`ESC-<N>.<k>-<n>`), or its `test_ids` intersect the `test_ids`/`xaravel_test_ids` of the Epic's Stories. An Escalation whose status cannot be read counts as open. Both are flagged as blocking acceptance.
2. **Components.** Each Component of its Stories (sorted) with its rate (`<passing> / <pairs> pairs`), `fail-known`, quarantined, adapted and Skip Reason counts by kind; a Component with no bucket in the report shows `no Test IDs in the Inventory`.
3. **Added since the Epic began.** `began` is the parent of the oldest commit reachable from HEAD whose subject starts with `<story-id>: ` for one of its Stories (on `main`, the squash-merge subjects such as `7.1: Conformance aggregator (#209)`). The Divergence Records (`decisions/DIV-*.md`) and Escalations (`conformance/escalations/ESC-*.md`) added in `began..HEAD` (`git log --diff-filter=A`) and still present at HEAD are listed, each Escalation with its Test IDs and status. With no Story commit, `began` is null and both lists are empty.
4. **Stories.** Per Story: id, status, commit count, distinct files changed, and lines added and deleted, summed with `--numstat` over the Story's commits (subject prefix `<story-id>: `; binary files count no lines).

## Publish (`conformance:publish`)

`tools/conformance-report/publish.ts` commits the files of `--dir` (default `.cache/conformance/site`) to `--branch` (default `gh-pages`) of `--remote` (default `origin`) and pushes it. It prints `conformance:publish: <created|updated|unchanged> <remote> <branch> at <tip>`.

- `--dir` must hold an `index.html`; an empty directory or a partial build is refused (exit 1), so it never replaces the published site.
- The commit's tree is exactly the files of `--dir` (mode 100644): a file removed from the directory is gone from the branch. Its parent is the remote tip, or none when the branch is missing (an orphan, `created`).
- When the tip already has the identical tree, nothing is committed (`unchanged`, exit 0).
- It uses the same plumbing as the history tool (exported from `history.ts`: `git`, `gitOk`, `fetchTip`, `BOT`): a temporary index file, `write-tree` and `commit-tree` as `github-actions[bot]`, so the caller's HEAD, index and working tree are never touched. The tip is fetched into `refs/xaravel-history/<branch>`.
- The push is never forced; on a non-fast-forward rejection (`REJECTED`) it refetches and rebuilds, up to `PUSH_RETRIES` (3) retries.

Like `conformance:history`, it is for the dashboard workflow: run locally against `origin`, it would replace the published site.

GitHub Pages serves the `gh-pages` branch ("Deploy from a branch"), so the job's `contents: write` is enough. `actions/deploy-pages` is not used: it needs `id-token: write`, which AD-18 and `release.ts` `authorityViolations` (XT-conformance-38) allow only in `release.yml#release`.

### Maintainer live step: enable Pages

The agent never enables or configures Pages. Once, after the first `dashboard` run on `main` has created `gh-pages`, the Maintainer sets Settings → Pages → Build and deployment → Source: Deploy from a branch, branch `gh-pages`, folder `/`; or:

```sh
gh api -X POST repos/<owner>/<repo>/pages -f 'source[branch]=gh-pages' -f 'source[path]=/'
```

## Workflow

`.github/workflows/dashboard.yml` runs job `dashboard` on every push to `main`, in concurrency group `dashboard` with `cancel-in-progress: false`. That never cancels a running run, but GitHub keeps at most one pending run per group and a newer push cancels the pending one, so with three or more pushes during one run the middle commits get no record. This is rare in practice, because merges reach `main` one at a time through the merge queue. The top level is `permissions: contents: read`; only this job holds `contents: write` (AD-16; `tools/workflow-permissions` allows `dashboard.yml#dashboard`). The checkout sets `persist-credentials: false`; only the history and publish steps get the job token, as a git `http.extraheader` passed through `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0`/`GIT_CONFIG_VALUE_0` for each of those commands only, never written to `.git/config`. The checkout also sets `fetch-depth: 0`, because the Epic review view reads the full history. It installs with `bun install --frozen-lockfile --ignore-scripts`, then runs `conformance:report`, `conformance:history --history-out .cache/conformance/history.jsonl`, `conformance:site --history .cache/conformance/history.jsonl --repo "$GITHUB_REPOSITORY"` (no token) and `conformance:publish --dir .cache/conformance/site`. The job's permissions stay exactly `contents: write`: no `pages` or `id-token` scope.

`conformance:history` is for the dashboard workflow: run locally against `origin`, it would push a record for a local commit to the real `dashboard-data` branch.

## Limits

- The live push from the workflow is unverified until its first run on `main`. The tests drive the history tool against a bare local remote (`conformance/tests/xaravel/conformance-report.test.ts`, XT-conformance-145).
- A push that lands while another run is pending can leave a commit without a record (see Workflow).
- `.github/rulesets/agent-push.json` is disabled now. Before it is re-enabled, `refs/heads/dashboard-data` and `refs/heads/gh-pages` must be added to its `exclude`, or it blocks the history and site pushes ([identities.md](identities.md)).
- The live publish and the served page are unverified until the Maintainer enables Pages (above) and the first run on `main`. The tests drive `publishSite` against a bare local remote (XT-conformance-146).
- Without `--api-surface`, the site build runs `tsc -b` for the API-surface diff; a build failure fails the site step.
- The Epic review view reads only commit subjects. A Story with no merged `<story-id>: ` commit adds no files, lines or `began`; a record added outside the Epic's commits but after `began` is still listed.
- A Divergence Record or Escalation added and then deleted before HEAD is not listed.
- `gh-pages` keeps one full-site commit per push to `main` that changes the site, and grows without bound; nothing prunes it. The `fetch-depth: 0` checkout fetches every branch's history, `gh-pages` and `dashboard-data` included, so the checkout grows with it.

## Tests

`conformance/tests/xaravel/conformance-report.test.ts`: XT-conformance-143 (bucket counts, the CLI, errors, the real repository's pair count; FR-5.1), XT-conformance-144 (the alpha-gate rules; FR-5.2) and XT-conformance-145 (history append, orphan creation, idempotence, a Pin change, `--history-out`, the caller's tree untouched, and `dashboard.yml`; FR-5.4, FR-5.5).

`conformance/tests/xaravel/dashboard.test.ts`: XT-conformance-146 (the index contents, escaping, links with and without a repo, errors, publish created/unchanged/updated with the caller untouched, and the workflow shape; FR-5, FR-5.1, FR-5.2, FR-5.3, FR-5.5), XT-conformance-147 (history series, markers and the SVG; FR-5.4) and XT-conformance-148 (the Epic review view on a fixture git repository and its page; UJ-5).
