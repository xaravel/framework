# CI pipeline

The CI pipeline is AD-28's three tiers: checks on every PR, the merge queue, and a nightly run (Story 5.7; FR-3, FR-9, AD-2, AD-16, AD-17, AD-28). Every workflow has top-level `permissions: contents: read`, pins each action to a commit SHA, and checks out with `persist-credentials: false`. History on `main` is linear and squash-only. No CI step passes `--fast` or `--seed`: CI runs are never samples.

## Per PR (linux-x64)

| Check | Workflow and job | What it runs |
| --- | --- | --- |
| lint, typecheck, dependency graph | `ci.yml#check` (required) | `upstream:sync` and `upstream:check`, then `harness --xaravel` (every test file, once, under the harness; XT-conformance-119 fails on a test file the harness does not run; with `XARAVEL_UPSTREAM=require`, so a test that reads the Upstream snapshot fails rather than skips without it, [ESC-10.2-8](../../decisions/ESC-10.2-8.md)), `expectations:check`, `expectations:reasons`, `divergence:check` ([divergence.md](divergence.md)), `porting:check` ([porting.md](porting.md)), `probes:check --require-backends` against the job's Postgres, MySQL, Redis and S3Mock services ([probes.md](probes.md)), `typecheck`, `async-surface --all --check`, `lint`, `entry-scripts:check`, `scaffold:check`, `registration:check`, `graph:check`, the coverage reports |
| `bun audit` | `ci.yml#audit` (required) | `bun install --frozen-lockfile --ignore-scripts`, then `bun audit --audit-level=high` |
| fixture signatures | `ci.yml#fixtures` (required) | `oracle:verify-fixtures` ([oracle.md](oracle.md)) |
| Protected Paths | `protected-paths.yml` (required, `pull_request_target`) | `tools/protected-paths/` against the base's list |
| edit ownership | `ownership.yml` (required, `pull_request_target`) | path and line ownership ([ratchet.md](ratchet.md#line-ownership)), and the Phase 1 gate for Stories in epic 9 or later ([porting.md](porting.md#phase-1-gate)); it installs the base checkout's locked dependencies (`--ignore-scripts`) for the gate's `porting:check` |
| Ratchet | `ratchet.yml#ratchet` (required, `pull_request_target`) | `scope`, `overlay`, `run --scope`, `story`, same-repository PRs only; a fork PR fails ([ratchet.md](ratchet.md)) |
| API-surface report | `api-surface.yml#report` (not required; never fails) | `api-surface --all --markdown`, the per-Component table in the job summary ([api-surface.md](api-surface.md)) |

`lint` is `bun --no-env-file --bun oxlint --type-aware && bun --no-env-file run lint:disables`: the type-aware async-safety rules, and a check that no comment or config switches a spine rule off (AD-16.4; [lint.md](lint.md)).

`registration:check` is the duplicate-FQCN and registration scan: each FQCN registered once, every framework class file ending with `registerClass('<FQCN>', X)`, and no package `package.json` setting `"sideEffects": false` (Story 6.6, AD-10, AD-22; [registration.md](registration.md)).

`entry-scripts:check` (`tools/entry-scripts/entry-scripts.ts`) reads the `scripts` of the root, `skeleton/` and every `packages/*` `package.json`, and of every `package.json` a root `workspaces` glob names, except one under `node_modules/` or a `fixtures/` segment (ESC-15.3-1, FR-20.2; XT-conformance-272, XT-conformance-273). Each script value is read as a quote-aware shell script: it splits on unquoted `&&`, `||`, `;`, `|`, `&`, newlines and `(`/`)`, reads `'…'`, `"…"` and `\`, and reads `$( … )`, backtick and `<( … )` substitutions, including those inside `${ … }` and `$(( … ))`, as nested scripts; it drops a line continuation and a redirection with its target. Per command it skips `NAME=value` prefixes (quoted values too), reserved words such as `{` and `function NAME`, and the wrappers `env`, `exec`, `time`, `command` and `nohup`; it reads `sh|bash|zsh|dash -c <string>`, `env -S <string>` and `bun exec <string>` as nested scripts. Other wrappers are not looked through: `nice`, `timeout`, `xargs`, `sudo`, `stdbuf`, `cross-env`, `concurrently`, and a script file run by `sh <file>` hide the `bun` they start; a word whose basename is `bun` or `bunx` is Bun. It fails a `bun` command that lacks `--no-env-file` before its subcommand or entry file; only the package-manager subcommands (`install`, `add`, `remove`, `update`, `pm`, `link`, `unlink`, `outdated`, `patch`, `publish`) are exempt. A bin launch (`bunx`, `bun x`, or a `bun`/`bun run` target that is not a builtin subcommand, a file path or a script of the same `package.json`) cannot pass the flag on: Bun's `.env` autoload reaches the bin's child process. So outside the root `package.json` it fails. In the root it passes only when the check, reading `<root>/bunfig.toml`, finds `env = false` at its top level (before any `[section]`): Bun reads that file from the cwd, which is the root for a root script. A root script that changes directory (a `cd` or `pushd` command, or a `bun` call with `--cwd`) loses the exemption, as does a root with no such `bunfig.toml`. A workspace package's script runs in the package directory, where the root file is not read. XT-conformance-273 runs both cases on Bun. The check fails closed on a script it cannot read: an unterminated quote, substitution or `(`, an unmatched `)`, a redirection with no target, a here-document, or a command name built from an expansion (`$BUN`, `$(which bun)`). It also fails closed on a `workspaces` that is not an array of globs, or an object whose `packages` is one.

`ci.yml` also runs `workflow-permissions`, `upstream` and `php-fixtures`, which are advisory.

`api-surface.yml#report` (not required) runs on `pull_request` and `merge_group` with `contents: read` only: `bun run api-surface --all --markdown …` diffs every package's `.d.ts` against the Upstream export and appends the per-Component table to the job summary. A tool failure becomes a `::warning` and the step ends with `exit 0`, so it never fails a PR. Only `bun run api-surface:gate <component>`, run when a Component's last Epic is accepted, fails on unexplained members (Story 6.5, AD-15; [api-surface.md](api-surface.md)).

The Ratchet's PR run grades the AD-2 reverse-dependency closure of the packages the PR changed (all of it when a non-package path such as `tools/` changed, nothing for a docs-only PR), then runs the Story's own `test_ids` in full on every Variant. Both run with `CI=true`, so every alpha Variant must run: SQLite in `.cache/`, and the `postgres:18` and `redis:8.10.2` services. `protected-paths` and `ratchet` run from `pull_request_target` workflows, so a PR is judged by the base branch's copy of the check and cannot change it. The Ratchet checks out and runs a PR's code only when the PR's head repository is this repository (`head.repo.full_name == github.repository`). A fork PR fails closed: since a skipped required check counts as passing, the job does not skip but fails with an `::error::` before fetching any PR code.

## Merge queue

The queue is required on `main` (`merge_queue` in `.github/rulesets/main.json`: squash, `ALLGREEN`, at most 5 entries). Every required check also runs on `merge_group`, or the queue would stall. The Ratchet's queue run is the full Ratchet on every alpha Variant, for the queued PR's head ref ([ratchet.md](ratchet.md#ci-githubworkflowsratchetyml)).

`ci.yml#check` regenerates every package's `async-surface.json` and fails on any difference from the committed file, printing the diff (`bun run async-surface --all --check`, Story 6.4, AD-6; [async-surface.md](async-surface.md)). It runs on PRs too, which is cheap and catches drift before queueing; the queue run is what catches two PRs that are each green but disagree about a seam's async-ness. That queue path is verified by the workflow's text (XT-conformance-136) until a real queued merge exercises it. The API-surface diff also runs in the queue, as a report that never fails (below).

## Nightly (`nightly.yml`)

`schedule` (daily) and `workflow_dispatch`.

| Job | Runners | What it runs |
| --- | --- | --- |
| `linux` | `ubuntu-24.04` (x64), `ubuntu-24.04-arm` (arm64) | the full Ratchet on `main`, with the `postgres:18` and `redis:8.10.2` services |
| `macos` | `macos-15-intel` (x64), `macos-15` (arm64) | the full Ratchet on `main`, with Postgres 18 and Redis installed natively with Homebrew (`postgresql@18`, `redis`), started with `brew services`, and a `postgres` role with password `postgres` |
| `bench` | `ubuntu-latest` | `bun run bench`, with its report appended to the job summary; the step and the job are `continue-on-error` |

The matrix jobs set `CI=true` and the same `PG*` and `REDIS_*` variables as `ratchet.yml`, and run `bun tools/ratchet/ratchet.ts run --root . --ref "$REF"` with `REF` the checked-out ref (`github.ref_name`: `main` on the schedule, the dispatched branch on `workflow_dispatch`). The macOS job prints the installed `postgres` and `redis-server` versions, since Homebrew's are not pinned. `fail-fast` is off, so one platform's failure never hides another's.

The Oracle re-evaluation runs in `oracle.yml#determinism`, also nightly: after it builds the image at the current Pin, `bun run oracle:recheck` re-evaluates every committed request and fails naming each fixture whose output differs ([oracle.md](oracle.md#recheck-bun-run-oraclerecheck)).

## Devcontainer (`devcontainer.yml`, Story 5.10)

| Job | Runner | Triggers | What it runs |
| --- | --- | --- | --- |
| `devcontainer` | `ubuntu-24.04` (x64) | `pull_request` on `.devcontainer/**`, `tools/devcontainer/**`, `conformance/harness/**`, `package.json`, `bun.lock`, `.bun-version` and the workflow; nightly `schedule`; `workflow_dispatch` | builds `.devcontainer/`, `docker compose up --wait`, then inside the workspace `bun run devcontainer:pins`, `bun run devcontainer:pins runtime` and the Ratchet over a full harness run, `bun run ratchet run --ref <ref>` (`<ref>` is the PR's head branch on a PR, else `github.ref_name`; used only for Story ownership, the tree graded is the checkout); fails when the Ratchet exits non-zero (a warned unexpected pass does not) or `bun run devcontainer:alpha` finds an alpha Variant `NOT-RUN` in the merged report |

It is advisory, not a required check, and does not duplicate the nightly matrix. See [devcontainer.md](devcontainer.md).

## Benchmarks (`bun run bench`)

```sh
bun run bench [--root <dir>] [--iterations <n>]
```

The script is `bun --no-env-file tools/bench/bench.ts`. It discovers `packages/*/bench/**/*.bench.ts` and `conformance/bench/**/*.bench.ts`, in sorted order. Each file default-exports `{ name: string, fn: () => unknown }[]`. Each benchmark gets one warm-up call, then timed calls: `--iterations <n>` of them, or by default as many as fit in about 250 ms (at least 5, at most 10,000). It prints:

```
BENCH <file> <name> median_ns=<n> iterations=<k>
BENCH-ERROR <file> <name|-> <first message line>
BENCH-SUMMARY ran=<n> errors=<e>
```

A `fn` that returns a promise is awaited, so it is timed to completion. A benchmark that throws or rejects, or a file that fails to load or exports the wrong shape (name `-`), is a `BENCH-ERROR`; the others still run. Benchmarks are information only: the runner always exits 0, except 2 on a usage error. The starter benchmark, `conformance/bench/expectations.bench.ts`, times reading the committed Expectations File and comparing it with itself through the harness's own comparison.

## Live-only paths and the Maintainer's steps

Workflow-shape tests (XT-conformance-119..122, 188) check the YAML, not a live run. `pull_request_target` runs the base's workflow and tools, so nothing Story 5.7 added to `ratchet.yml` ran on its own PR. The first live runs are:

- the push to `main` after Story 5.7 merges (full Ratchet);
- the next PR (scope, `run --scope`, `story`);
- the first merge-queue entry (the queue's full Ratchet, `merge-group-pr` and `gh pr view`);
- the first nightly (`nightly.yml`, and `oracle:recheck` in `oracle.yml#determinism`).

The Maintainer:

1. Runs `GH_TOKEN="$(gh auth token)" bun run ruleset:apply` from `main` after the merge, so the live ruleset requires `ratchet` ([identities.md](identities.md)). Until then `ratchet` is required only in the committed ruleset, and `bun run ruleset:verify` reports the drift.
2. Supervises the first nightly run. The macOS Homebrew service setup has never run live, and neither have the arm64 service containers.
3. Triages the first `oracle:recheck` failures. A stale fixture is regenerated. How to handle a request whose output depends on the date is the Maintainer's ruling on `conformance/escalations/ESC-5.7-1.md`, which proposes freezing the Oracle's clock. Listing such a request in `conformance/oracle/nondeterminism.jsonl` drops its fixture and so removes a Differential check; it needs that ruling.

## Bots (`bots.yml`, Story 5.8)

`bots.yml` runs after the `ratchet` (push to `main`), `nightly` and `oracle` workflows complete on `main`, and on a manual dispatch. Its `detect` job quarantines flaky tests and promotes unowned unexpected passes; its `collect` job commits the Oracle's `ESC-bot-<n>.md` artifacts; its `open` job opens the `bot/*` PRs as the `xaravel-bot` App. `open` runs only when the plan has at least one proposal, and fails with an error naming `vars.XARAVEL_BOT_APP_ID`, `secrets.XARAVEL_BOT_APP_KEY` and [bots.md](bots.md) when the App is not configured. Only `open` holds a secret, and it runs no test. Bot PRs are never merged automatically: they go through review and the merge queue like any PR. See [bots.md](bots.md).

`workflow_run` chaining, App-token PR creation and the job itself have never run live; the first run needs the Maintainer's App setup ([identities.md](identities.md#the-xaravel-bot-github-app)). Until then a `bots` run whose plan has a proposal fails `open` at "Check the xaravel-bot App is configured" on `main`; that red run is expected ([bots.md](bots.md#live-only-paths-and-the-maintainers-steps)).
