# Conformance report and history (`bun run conformance:report`, `conformance:history`)

The aggregator is the only place the Conformance Rate and the SM-1 alpha-gate figure are computed (Story 7.1; FR-5, SM-1). The dashboard (Story 7.2) and Boost framework mode's `conformance.rate` (Story 7.3) read its `report.json`; they never derive a number themselves. It reads conformance data only and imports no graded package.

```sh
bun run conformance:report                                   # writes .cache/conformance/report.json
bun --no-env-file tools/conformance-report/report.ts --root <dir> --out <file>
bun run conformance:history                                  # appends to dashboard-data on origin
bun --no-env-file tools/conformance-report/history.ts --root <dir> --report <file> --remote <remote> --branch <branch>
```

`conformance:report` reads the Inventory (`conformance/inventory/*.jsonl`), the Expectations File (`conformance/expectations/**`), the package table (`tools/scaffold/packages.jsonl`, for phases) and the Baseline Pin (`conformance/baseline-pin`). It writes `report.json`, by default `<root>/.cache/conformance/report.json`, which is gitignored and never committed, and prints:

```
conformance:report: wrote <path> (<p>/<n> pairs passing; alpha <a>/<b>)
```

Exit codes for both tools: 0 ok, 1 data error, 2 usage error. A data error for the report is an Expectations line whose id is not in the Inventory (`conformance:report: <shard>: unknown Test ID <id>`), an unknown status, a `skip` with an unknown reason kind, a duplicate pair, or an unreadable input.

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

## Workflow

`.github/workflows/dashboard.yml` runs job `dashboard` on every push to `main`, in concurrency group `dashboard` with `cancel-in-progress: false`. That never cancels a running run, but GitHub keeps at most one pending run per group and a newer push cancels the pending one, so with three or more pushes during one run the middle commits get no record. This is rare in practice, because merges reach `main` one at a time through the merge queue. The top level is `permissions: contents: read`; only this job holds `contents: write` (AD-16; `tools/workflow-permissions` allows `dashboard.yml#dashboard`). The checkout sets `persist-credentials: false`; only the history step gets the job token, as a git `http.extraheader` passed through `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0`/`GIT_CONFIG_VALUE_0` for that one command, never written to `.git/config`. It installs with `bun install --frozen-lockfile --ignore-scripts`, then runs `conformance:report` and `conformance:history`. Story 7.2 adds the Pages publish to the same job.

`conformance:history` is for the dashboard workflow: run locally against `origin`, it would push a record for a local commit to the real `dashboard-data` branch.

## Limits

- The live push from the workflow is unverified until its first run on `main`. The tests drive the history tool against a bare local remote (`conformance/tests/xaravel/conformance-report.test.ts`, XT-conformance-145).
- A push that lands while another run is pending can leave a commit without a record (see Workflow).
- `.github/rulesets/agent-push.json` is disabled now. Before it is re-enabled, `refs/heads/dashboard-data` must be added to its `exclude`, or it blocks the history push ([identities.md](identities.md)).

## Tests

`conformance/tests/xaravel/conformance-report.test.ts`: XT-conformance-143 (bucket counts, the CLI, errors, the real repository's pair count; FR-5.1), XT-conformance-144 (the alpha-gate rules; FR-5.2) and XT-conformance-145 (history append, orphan creation, idempotence, a Pin change, the caller's tree untouched, and `dashboard.yml`; FR-5.4, FR-5.5).
