# The conformance harness

The harness runs every Ported Test once per Backend Variant and compares the results with the [Expectations File](expectations.md) (Stories 5.3, 5.4 and 5.5; FR-3, FR-9, FR-113, AD-15, AD-17). Its code is in `conformance/harness/`.

```sh
bun run harness [--root <dir>] [--fast] [--seed <s>] [--component <c>]... [--id <glob>]... [--story <story-id>]
```

The script is `bun --no-env-file conformance/harness/harness.ts`. Report lines go to stdout and diagnostics go to stderr. Exit codes: 0 when no line differs, 1 on any difference or a failed precondition, 2 on a usage error. The usage errors are an unknown flag, a missing value, a second `--seed` or `--story`, a `--story` value not of the form `<epic>.<story>`, and a seed that doesn't match `^[A-Za-z0-9._-]{1,64}$`.

The [Ratchet](ratchet.md) (Story 5.6) turns the harness's differences into a CI verdict. In CI (Story 5.7, [CI pipeline](ci.md)) a PR's Ratchet runs the harness with `--component` over its reverse-dependency closure and then with `--story` over its Story's `test_ids`; the merge queue, `main` and the nightly matrix run it in full. CI never passes `--fast`. `runHarness` returns each counted difference with its kind (`HarnessResult.differences`): `unexpected-pass` for an `UNEXPECTED-PASS` line, `unexpected-failure` for every other one, including `UNKNOWN`, and each `ERROR` line and CI `NOT-RUN` of an alpha Variant (with id `-`). The printed report is the same either way.

## What it runs

1. **Preconditions.** `<root>/bunfig.toml` must exist, and no other `bunfig.toml` may exist under the root. The scan skips `node_modules`, `.git`, `.cache` and `conformance/upstream`, and the message names every stray file. The root must be the top level of a git worktree, and `.cache/harness.lock` must be free (see [Backend isolation](#backend-isolation)). The vocabulary, the Expectations shards and the Inventory must read cleanly. Nothing runs when a precondition fails.
2. **Variants.** These are the Variants that appear in the Expectations lines, in `conformance/variants` order. Each backend is prepared once, the first time a Variant needs it (see [Backend isolation](#backend-isolation)).
3. **One `bun test` per reachable Variant.** The command is:

   ```
   bun --no-env-file test --preload conformance/harness/preload.ts --reporter=junit --reporter-outfile=<tmp> <every packages/*/tests/ported/**/*.test.ts>
   ```

   It runs with the root as cwd, so the root `bunfig.toml` applies. The env is the parent's, without `BUN_OPTIONS` and `NODE_OPTIONS` (they could add a preload or flags), plus `XARAVEL_VARIANT=<variant>`, `XARAVEL_HARNESS_OUT=<tmp jsonl>`, `XARAVEL_API_SURFACE=<root>/conformance/api-surface` and the isolation variables listed under [Backend isolation](#backend-isolation). With no Ported Test file, nothing is spawned and every result is `missing`. A run that leaves no junit file fails the harness and quotes its stderr. Temp files go in the OS temp directory. Under the root, the harness writes only in `.cache/`; outside it, only the worktree's creation id file in its git dir.

## Filters and fast mode

With no filter and no `--fast`, every Expectations line is checked. Otherwise the harness first picks Test IDs from the Expectations File (`conformance/harness/select.ts`). Each Test ID's Component is the first path segment of its shard under `conformance/expectations/`.

| Filter | Selects |
| --- | --- |
| `--component <c>` | the Test IDs of Component `c` |
| `--id <glob>` | the Test IDs the glob matches as a whole: `*` matches any run of characters, `?` matches one, and everything else is literal, including `\` |
| `--story <story-id>` | the `test_ids` of `stories/<story-id>.md`. A value not of the form `<epic>.<story>` is a usage error. A missing or invalid manifest fails a precondition, and so does one with no `test_ids` (`stories/<s>.md lists no test_ids`). Listed Test IDs with no Expectations line go to stderr as one diagnostic with their count and at most the first 10 of them |

A repeated filter takes the union of its values, and different filters intersect. An empty selection fails a precondition with `harness: no Test ID matches <the filters>`.

**Fast mode.** `--fast` samples the selection. `--seed <s>` implies `--fast`; without it, the seed is 8 random hex characters. The sample is the first 100 selected Test IDs (or all of them, when fewer are selected), ranked by the hex SHA-256 of `<seed>\n<id>`, with ties broken by Test ID. It depends only on the seed and the selected set, so the same seed on the same commit runs the same sample. The first stdout line is

```
FAST seed=<s> sample=<k>/<n>
```

and the SUMMARY line ends ` mode=fast seed=<s>`. Rerun a fast run with `--seed <s>` to reproduce it. Filters alone don't make a run a sample: a filtered run's SUMMARY has no `mode=`.

**The done check.** `isFullRun(summaryLine)` in `conformance/harness/harness.ts` is true only for a `SUMMARY ` line without ` mode=fast`, and `runHarness` returns `sample: {seed, size, of}` in fast mode and `null` otherwise. Story 5.9's done check must use `isFullRun`, so a fast run never satisfies it.

**Running a selection.** Only the Variants with selected lines are listed and probed, and each checks only its selected lines; `checked` counts those. Each Variant's run gets only the Ported Test files under `packages/<c>/tests/ported/` of its selected Components, plus `-t ^(?:<escaped ids>)$`, so bun runs only the selected tests. The `-t` is left out when every Expectations line of those Components on that Variant is selected, or when the pattern would be longer than 65,536 characters; the comparison is restricted either way. When a run with `-t` exits with bun's `matched 0 tests` error, the run counts as empty and every selected line is `missing`. The `UNKNOWN` check still knows every Expectations Test ID.

## Backend isolation

Parallel agents on one machine each run the harness in their own git worktree, and never share a database or a Redis server (Story 5.5, AD-17). The code is in `conformance/harness/isolation.ts`.

**Worktree key.** The root must be the top level of a git worktree (`git rev-parse --show-toplevel` equals the root's realpath); otherwise the harness exits 1 with `<root> is not the top level of a git worktree (AD-17)`, followed by `: <git's last stderr line>` when git printed one. Git records no creation id, so the harness keeps one: 32 lowercase hex characters in `<git-dir>/xaravel-worktree-id`, created from 16 random bytes on the first run. The key is the first 8 hex characters of SHA-256 over `<realpath of the top level>\n<creation id>`. Deleting `.cache/` keeps the key. `git worktree remove` deletes the worktree's git dir, so a new worktree at the same path gets a new key and never inherits stale databases. `runHarness` returns `worktree: {path, key}` once the key is known.

**Lock.** Right after the bunfig checks, the harness creates `.cache/harness.lock` exclusively. It holds one JSON line, `{pid, host, started, command}`, and is removed when the harness ends, including on Ctrl-C (SIGINT, exit 130) or SIGTERM (exit 143), when the CLI first stops the Redis server it started. While it exists, a second harness in the same worktree exits 1 with

```
harness: .cache/harness.lock is held by pid <pid> on <host> since <started>: <command>
```

A lock naming a pid on this host that is no longer alive is stale: the harness removes it and takes the lock. A lock from another host is always held, and an unreadable one is held with `unknown` for each field. Delete a lock by hand only when you know its holder is gone.

**Child env.** Every `bun test` run also gets:

| Variable | Value |
| --- | --- |
| `XARAVEL_WORKTREE_KEY` | the key |
| `XARAVEL_CACHE_DIR` | `<root>/.cache` |
| `XARAVEL_SQLITE_DIR` | `<root>/.cache/sqlite`; SQLite database files go here |
| `XARAVEL_PG_DATABASE` | `xaravel_test_<key>` |
| `XARAVEL_REDIS_SOCKET` | the socket of the `redis-server` the harness started, on Redis Variants only. A value inherited from the parent env is always dropped. In CI no server is started, so Redis Variants get no socket and tests use `REDIS_HOST`/`REDIS_PORT` (the job's service) |

**SQLite.** A full run removes and recreates `.cache/sqlite/`. A fast run only creates it.

**Postgres.** After a successful probe, the harness connects (`Bun.SQL`) to the maintenance database `PGDATABASE` (default `postgres`) with `PGHOST` (a `/` path is a socket directory), `PGPORT`, `PGUSER` (default `USER`, else `postgres`) and `PGPASSWORD`. The worktree owns `xaravel_test_<key>` and every `xaravel_test_<key>_<suffix>` whose suffix matches `^[a-z0-9_]+$`. A full run drops all of them in sorted order with `DROP DATABASE … WITH (FORCE)`, which needs Postgres 13 or later (AD-28's CI runs 18), and creates `xaravel_test_<key>`. A fast run only creates `xaravel_test_<key>` when it is missing. No other database is ever dropped: the admin refuses to quote any name that isn't an `xaravel_test_<key>` name. Tests that create more databases must name them `xaravel_test_<key>_<suffix>`, and drop only names of that form. A failure makes the Variant NOT-RUN with `Postgres database reset failed: <message>`.

**Redis.** Locally, the harness starts its own server:

```
redis-server --port 0 --unixsocket <root>/.cache/redis.sock --unixsocketperm 700 --save "" --appendonly no --dir <root>/.cache/redis
```

The binary is `XARAVEL_REDIS_SERVER` if set, else `redis-server` on `PATH`. The server listens on no TCP port and persists nothing. Tests may `FLUSHDB` it, and no key prefix is injected. The harness removes a leftover socket first (safe, because it holds the lock), waits up to 5 s for the socket to accept a connection, and stops the server with SIGTERM when it ends, or when the harness itself gets SIGINT or SIGTERM. Only a SIGKILLed harness leaves the server running and its socket and lock behind; the next run removes the socket and takes over the stale lock (stop the orphaned `redis-server` by hand). With `CI=true`, nothing is started: each CI job's Redis service is its server, probed at `REDIS_HOST`:`REDIS_PORT`.

## Backends and NOT-RUN

| Backend | Reachable when |
| --- | --- |
| `none`, `sqlite` | always |
| `pgsql` | a connect to `PGHOST`:`PGPORT` (default `127.0.0.1:5432`) succeeds within 1 s, and the worktree's databases were reset; a `PGHOST` starting with `/` is probed as the unix socket `<PGHOST>/.s.PGSQL.<port>` |
| `redis`, locally | the harness's own `redis-server` listens on `.cache/redis.sock` within 5 s |
| `redis`, with `CI=true` | a connect to `REDIS_HOST`:`REDIS_PORT` (default `127.0.0.1:6379`) succeeds within 1 s |
| anything else (`mysql`, `mariadb`, `sqlsrv`, `beanstalkd`) | never: there is no local probe |

A local Redis Variant is NOT-RUN with one of: `redis-server not found on PATH (AD-17)`, `redis-server not found at <path> (AD-17)`, `redis-server exited <code>: <its last stderr or stdout line>`, `redis-server did not listen on <socket> within 5000 ms`, or `socket path <socket> is longer than 103 bytes` (move the worktree to a shorter path).

A `<driver>@<backend>` Variant needs what its backend needs. An unreachable Variant is not spawned and prints:

```
NOT-RUN [<variant>] <n> line(s): <why>
```

Locally, that is not a difference and nothing is recorded. With `CI=true`, an unreachable alpha Variant (`ALPHA_VARIANTS` in `tools/inventory/inventory.ts`) counts as one difference, and its line ends `; CI runs every alpha variant (FR-9)`.

## Outcomes

For each Expectations line on a run Variant, the harness takes the junit testcase named by the Test ID and the Ported Test report with that `id`:

| Outcome | When |
| --- | --- |
| `blocked-by:<c>` | the failure has `type="BlockedByComponentError"` and a message starting `BlockedByComponentError(<c>)` ([ESC-5.3-1](../../conformance/escalations/ESC-5.3-1.md)) |
| `fail` | any other failure |
| `late` | the test recorded an assertion after it ended |
| `skip` | a junit `<skipped>`, or a report with a `skipped` key |
| `no-report` | bun passed it but there is no report |
| `pass` | otherwise |
| `missing` | there is no testcase |

An id with more than one Ported Test report (another test forged one) is `fail`. `fail`, `late`, `no-report` and `blocked-by:*` are failures.

**Assertion floor (FR-113).** A `pass` is below the floor when, for some kind, its report records fewer assertions than the Inventory's `assertions`. `null` Inventory assertions never fail the floor. A below-floor pass counts as a failure. The floor is waived when the line's `adapted` is `DIV-<n>.<clause>`, `decisions/DIV-<n>.md` exists, and its frontmatter `fewer_assertions` list contains `<clause>` ([ESC-5.3-2](../../conformance/escalations/ESC-5.3-2.md)).

**Matching.**

| Status | Matches |
| --- | --- |
| `pass` | `pass` within the floor |
| `fail-known` | any failure, or a below-floor pass |
| `quarantined` | anything |
| `skip` with `blocked-by:<c>` | exactly `blocked-by:<c>` |
| any other `skip` | `skip` or `missing` |

## The report

There is one line per differing pair, grouped by Variant in Variant order and sorted by Test ID (UTF-16 code units) within each Variant:

```
<STATUS> <id> [<variant>] expected=<e> actual=<a> asserts=<n>/<u>
```

- **STATUS** comes from the actual outcome: `FLOOR` for a below-floor pass, `UNEXPECTED-PASS` for a pass, `FAIL` for a failure, `SKIPPED` for a skip and `MISSING` for missing.
- **`e`** is the line's status, or `skip:<reason>`.
- **`n`** is the sum of the report's assertion counts, or `-` with no report.
- **`u`** is the sum of the Inventory's, or `-` when they are `null`.

A Ported Test report whose Test ID has no Expectations line on any Variant prints `UNKNOWN <id> [<variant>] expected=- actual=<a> asserts=<n>/-`. Reports from `xaravelTest`, and testcases with no report, are not Ported Test results.

When `bun test` exits non-zero although no junit testcase failed (a Ported Test file that throws on import, or an unhandled error between tests), the run prints `ERROR [<variant>] bun test exited <n> with no failing testcase` before that Variant's difference lines. It counts as one difference, and the tail of the run's stderr goes to the diagnostics.

The diagnostics on stderr also give a reason for each FAIL with a junit failure, `harness: <id> [<variant>]: <type>: <first line of message>`, and for each FLOOR, the kinds that fell short: `harness: <id> [<variant>]: below the floor: assertSame 1<2`.

The NOT-RUN lines come first, then, per run Variant, its ERROR line and its difference lines. The last line is:

```
SUMMARY variants=<v> run=<r> not-run=<nr> checked=<c> differ=<d>
```

`checked` counts the Expectations lines on run Variants. To list failures, run `bun run harness | grep -E '^(FAIL|FLOOR|MISSING)'`.

## The preload and its protocols

`conformance/harness/preload.ts` runs before any Ported Test file loads, and it imports nothing graded. It does three things:

1. **Hardens the intrinsics** (`conformance/harness/intrinsics.ts`). It freezes:
   - the constructors and prototypes of the JS built-ins, the native errors, the typed arrays, `AsyncLocalStorage` and the iterator prototypes;
   - `JSON`, `Math` and `Reflect`;
   - `bun:test`'s `test`, `describe`, `it`, `expect` and the hooks.

   Assigning to any of them throws a `TypeError`. `Error.stackTraceLimit` stays writable. Override taming, as in SES, turns `constructor`, `name`, `message`, `toString`, `valueOf` and `toLocaleString` on the hardened prototypes, and every data property of `Object.prototype`, into accessors. Their setters define an own property on any other receiver, so `this.name = …` and `o.toString = …` still work.
2. **Installs two globals**, both non-writable and non-configurable (ESC-4.2-1 item 4). Each appends one JSON line to `XARAVEL_HARNESS_OUT`:
   - `Symbol.for('xaravel.harness.report')` is the ESC-4.2-1 reporter. It writes `{"report":<report>}`.
   - `Symbol.for('xaravel.harness.late')` is the late-assertion hook. It writes `{"late":{"id":…,"kind":…}}`.
3. **Installs the API signature lookup** (`conformance/harness/signatures.ts`, ESC-4.8-1 item 1) at `Symbol.for('xaravel.api.signature')`. It is non-writable and non-enumerable but, unlike the two hooks, **configurable**, so a test that saves and restores the descriptor (Mockery's `double-scenarios.ts`) keeps working. The lookup is `(fqcn, member) => row | null`, where `row` is the member's `kind: "method"` line of `conformance/api-surface/*.jsonl` as committed: `fqcn`, `member`, `static`, `parameters` (each with `name`, `type`, `nullable`, `default`, `optional`, `variadic` and `byRef`), `returns` and `nullable`. The index is built on the first call and keyed exactly on `fqcn` and `member`. Rows are deep-frozen and each call for a key returns the same object. A missing member, a missing directory or a non-string argument gives null; a malformed line throws an `Error` naming `file:line`. It reads the directory in `XARAVEL_API_SURFACE`, which the harness sets to the root's `conformance/api-surface`; the default is the preload's sibling `../api-surface`. Mockery's Double reads `returns` and `nullable` from it.

**Late assertions.** `@xaravel/assert` ends each test's counts when its body settles. A later assertion, for example from an un-awaited promise or a timer, is not counted. It goes to the late hook with the full Test ID and its kind (`null` for the kind-less count), and the harness reports the test as `late`. The hook call never throws, because a throw there would fail whichever test happened to be running at the time.

Detection is best-effort. An assertion that lands after bun has finished the file's last test, or outside any test's context, is not seen. A late assertion that fails still throws into whatever test is running at that moment.

The grader and the preload capture `Object.freeze`, `JSON.stringify` and `appendFileSync` at load, and the `globalThis` bindings of the hardened constructors and of `JSON`, `Math` and `Reflect` are non-writable and non-configurable, so a test cannot hide a report or a late assertion by replacing a global.

The grader's own fixtures (`packages/assert/tests/xaravel/fixtures`, `packages/mockery/tests/xaravel/fixtures`) run without the preload, so they can still install fake globals.
