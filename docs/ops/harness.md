# The conformance harness

The harness runs every Ported Test once per Backend Variant and compares the results with the [Expectations File](expectations.md) (Story 5.3; FR-3, FR-9, FR-113, AD-15). Its code is in `conformance/harness/`.

```sh
bun run harness [--root <dir>]
```

The script is `bun --no-env-file conformance/harness/harness.ts`. Report lines go to stdout and diagnostics go to stderr. Exit codes: 0 when no line differs, 1 on any difference or a failed precondition, 2 on a usage error.

Fast mode, seeds and filters (Story 5.4), per-worktree backends (Story 5.5), the Ratchet (Story 5.6) and CI wiring (Story 5.7) come later.

## What it runs

1. **Preconditions.** `<root>/bunfig.toml` must exist, and no other `bunfig.toml` may exist under the root. The scan skips `node_modules`, `.git`, `.cache` and `conformance/upstream`, and the message names every stray file. The vocabulary, the Expectations shards and the Inventory must read cleanly. Nothing runs when a precondition fails.
2. **Variants.** These are the Variants that appear in the Expectations lines, in `conformance/variants` order.
3. **One `bun test` per reachable Variant.** The command is:

   ```
   bun --no-env-file test --preload conformance/harness/preload.ts --reporter=junit --reporter-outfile=<tmp> <every packages/*/tests/ported/**/*.test.ts>
   ```

   It runs with the root as cwd, so the root `bunfig.toml` applies. The env is the parent's, without `BUN_OPTIONS` and `NODE_OPTIONS` (they could add a preload or flags), plus `XARAVEL_VARIANT=<variant>` and `XARAVEL_HARNESS_OUT=<tmp jsonl>`. With no Ported Test file, nothing is spawned and every result is `missing`. A run that leaves no junit file fails the harness and quotes its stderr. Temp files go in the OS temp directory; the harness never writes under the root.

## Backends and NOT-RUN

| Backend | Reachable when |
| --- | --- |
| `none`, `sqlite` | always |
| `pgsql` | a connect to `PGHOST`:`PGPORT` (default `127.0.0.1:5432`) succeeds within 1 s; a `PGHOST` starting with `/` is probed as the unix socket `<PGHOST>/.s.PGSQL.<port>` |
| `redis` | a connect to `REDIS_HOST`:`REDIS_PORT` (default `127.0.0.1:6379`) succeeds within 1 s |
| anything else (`mysql`, `mariadb`, `sqlsrv`, `beanstalkd`) | never: there is no local probe |

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

`conformance/harness/preload.ts` runs before any Ported Test file loads, and it imports nothing graded. It does two things:

1. **Hardens the intrinsics** (`conformance/harness/intrinsics.ts`). It freezes:
   - the constructors and prototypes of the JS built-ins, the native errors, the typed arrays, `AsyncLocalStorage` and the iterator prototypes;
   - `JSON`, `Math` and `Reflect`;
   - `bun:test`'s `test`, `describe`, `it`, `expect` and the hooks.

   Assigning to any of them throws a `TypeError`. `Error.stackTraceLimit` stays writable. Override taming, as in SES, turns `constructor`, `name`, `message`, `toString`, `valueOf` and `toLocaleString` on the hardened prototypes, and every data property of `Object.prototype`, into accessors. Their setters define an own property on any other receiver, so `this.name = …` and `o.toString = …` still work.
2. **Installs two globals**, both non-writable and non-configurable (ESC-4.2-1 item 4). Each appends one JSON line to `XARAVEL_HARNESS_OUT`:
   - `Symbol.for('xaravel.harness.report')` is the ESC-4.2-1 reporter. It writes `{"report":<report>}`.
   - `Symbol.for('xaravel.harness.late')` is the late-assertion hook. It writes `{"late":{"id":…,"kind":…}}`.

**Late assertions.** `@xaravel/assert` ends each test's counts when its body settles. A later assertion, for example from an un-awaited promise or a timer, is not counted. It goes to the late hook with the full Test ID and its kind (`null` for the kind-less count), and the harness reports the test as `late`. The hook call never throws, because a throw there would fail whichever test happened to be running at the time.

Detection is best-effort. An assertion that lands after bun has finished the file's last test, or outside any test's context, is not seen. A late assertion that fails still throws into whatever test is running at that moment.

The grader and the preload capture `Object.freeze`, `JSON.stringify` and `appendFileSync` at load, and the `globalThis` bindings of the hardened constructors and of `JSON`, `Math` and `Reflect` are non-writable and non-configurable, so a test cannot hide a report or a late assertion by replacing a global.

The grader's own fixtures (`packages/assert/tests/xaravel/fixtures`, `packages/mockery/tests/xaravel/fixtures`) run without the preload, so they can still install fake globals.
