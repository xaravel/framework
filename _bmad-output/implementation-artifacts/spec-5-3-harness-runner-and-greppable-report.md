---
title: 'Story 5.3: Harness runner and greppable report'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: 'ddc86956a16db6f7e3103fc3c5b184030c29c2b0'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-skip-reason-rule-checks.md'
  - '{project-root}/decisions/ESC-4.2-1.md'
warnings: [oversized]
deferred:
  - summary: >-
      A failing late assertion (e.g. assertTrue(false) in a timer the body left behind) still throws, and bun fails whichever test is running then instead of the late one.
    evidence: |-
      Edge-case review E2, checked in bun junit. Story 4.2's assertions throw on failure wherever they run. The late hook marks the right test late, but the throw still lands on the running test. Fixing it needs every assertion path to check for ended counts and swallow its own failure, which is grader work (packages/assert) beyond the late-hook protocol.
    location: >-
      packages/assert/src/declarations/AssertionCounter.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Nothing runs Ported Tests and compares their results with the Expectations File. There is no `bun run harness`, no per-variant run, no assertion floor, no `blocked-by` matching and no NOT-RUN handling. The Epic 4 deferrals are also still open: concurrent count separation is untested, late assertions go uncounted, and code under test can patch intrinsics (FR-9, FR-113, AD-15; Epic 4 retro S4).

**Approach:** Add `conformance/harness/` (spine Structural Seed :617). `harness.ts` is the CLI behind `bun run harness`. For each variant it spawns `bun test` once, with the root `bunfig.toml`, `XARAVEL_VARIANT`, a harness preload and the junit reporter, over every `packages/*/tests/ported/**/*.test.ts`. It joins the junit outcomes with the ESC-4.2-1 reports on Test ID and prints one greppable line per mismatch, then a summary. The preload freezes intrinsics and installs the reporter and a late-assertion hook. `@xaravel/assert` reports late assertions through that hook.

## Boundaries & Constraints

**Always:**
- **CLI.** `bun --no-env-file conformance/harness/harness.ts [--root <dir>]` is the `harness` script in the root `package.json`.
  - Exit codes: 0 when no line differs, 1 on any difference or a failed precondition, 2 on usage errors.
  - Report lines go to stdout; diagnostics go to stderr.
- **Preconditions** (AC 1). Before anything runs, any `bunfig.toml` under the root other than `<root>/bunfig.toml` fails the run. The scan skips `node_modules`, `.git`, `.cache` and `conformance/upstream`, and the message names each path. A missing root `bunfig.toml` also fails the run.
- **Per-variant run.** The variants are those that appear in the Expectations lines, in `conformance/variants` order.
  - Each reachable variant spawns `process.execPath --no-env-file test --preload <abs preload> --reporter=junit --reporter-outfile=<tmp> <files>`.
  - cwd is the root. The env is the parent's plus `XARAVEL_VARIANT=<variant>` and `XARAVEL_HARNESS_OUT=<tmp jsonl>`.
  - When no Ported Test file exists, nothing is spawned and every result is `missing`.
  - A run that leaves no junit file is a precondition failure (exit 1) that quotes the run's stderr.
  - Readers are reused, not forked: `readExpectations`, `readWorkingInventory` (pin-bump), `readVariants` (expectations) and `compareUnits`.
- **Backends** (AC 5).
  - `none` and `sqlite` need nothing.
  - `pgsql` needs Postgres at `PGHOST`/`PGPORT` (default `127.0.0.1:5432`; a `PGHOST` starting with `/` means the unix socket `<PGHOST>/.s.PGSQL.<port>`).
  - `redis` needs Redis at `REDIS_HOST`/`REDIS_PORT` (default `127.0.0.1:6379`).
  - A `<driver>@<backend>` variant needs what its backend needs. Any other backend (`mysql`, `mariadb`, `sqlsrv`, `beanstalkd`) has no local probe.
  - A backend counts as reachable when a TCP or unix connect succeeds within 1 s.
  - An unreachable variant prints `NOT-RUN [<variant>] <n> line(s): <why>` and is neither counted as a difference nor spawned.
  - When `CI` is `true`, an unreachable *alpha* variant (`ALPHA_VARIANTS`) is a difference instead (FR-9).
  - The harness never writes any file under `conformance/`.
- **Actual outcome** per `(id, variant)` on a run variant. A junit testcase whose name is the Test ID, and the report whose `id` matches it:
  - `blocked-by:<c>`: the failure has `type="BlockedByComponentError"` and a message that starts `BlockedByComponentError(<c>)`.
  - `fail`: any other failure.
  - `late`: the test recorded an assertion after it ended.
  - `no-report`: bun passed it but there is no report.
  - `skip`: a junit `<skipped>`, or a report with a `skipped` key (ESC-4.4-2 item 1).
  - `pass`: otherwise.
  - `missing`: there is no testcase.
  - The failing outcomes are `fail`, `late`, `no-report` and `blocked-by:*`. A `type: "xaravel"` report and a testcase with no report are not Ported Test results.
- **Assertion floor** (AC 3). A `pass` fails the floor when, for some kind `k`, its report's `assertions[k]` is below the Inventory's `assertions[k]`; `null` Inventory assertions never fail it.
  - The floor is waived only when the line's `adapted` is `DIV-<n>.<k>`, `decisions/DIV-<n>.md` exists, and its frontmatter `fewer_assertions` list contains `<k>` (proposed in ESC-5.3-2).
  - A below-floor pass counts as a failure.
- **Matching:**
  - `pass` expects `pass` within the floor.
  - `fail-known` expects any failure or a below-floor pass.
  - `quarantined` matches anything.
  - `skip` with `blocked-by:<c>` expects exactly `blocked-by:<c>` (AC 4).
  - Any other `skip` expects `skip` or `missing`.
- **Report** (AC 2). One line per differing pair, sorted by variant order and then `compareUnits` on the id: `<STATUS> <id> [<variant>] expected=<e> actual=<a> asserts=<n>/<u>`.
  - STATUS by actual outcome: below-floor pass → `FLOOR`; `pass` → `UNEXPECTED-PASS`; a failure → `FAIL`; `skip` → `SKIPPED`; `missing` → `MISSING`.
  - `e` is the status, or `skip:<reason>`.
  - `n` is the sum of the report's assertions, or `-` when there is no report. `u` is the sum of the Inventory's assertions, or `-` when they are `null`.
  - A Ported Test report whose id has no Expectations line at all prints `UNKNOWN <id> [<variant>] expected=- actual=<a> asserts=<n>/-`.
  - NOT-RUN lines come before the difference lines.
  - The last line is `SUMMARY variants=<v> run=<r> not-run=<nr> checked=<c> differ=<d>`, where `checked` counts the lines on run variants.
- **Preload** (AC 6), `conformance/harness/preload.ts`. It imports nothing graded. Before any test file loads, it:
  1. Hardens the intrinsics.
     - Prototypes and constructors: `Object`, `Function`, `Array`, `String`, `Number`, `Boolean`, `Symbol`, `BigInt`, `Error` and every native error, `Promise`, `RegExp`, `Date`, `Map`, `Set`, `WeakMap`, `WeakSet`, `ArrayBuffer`, the typed arrays, `AsyncLocalStorage` (`node:async_hooks`), and the iterator prototypes.
     - Namespaces: `JSON`, `Math` and `Reflect`.
     - From `bun:test`: `test`, `describe`, `it`, `expect` and the hooks.
     - The method is freeze, except that `Error.stackTraceLimit` stays writable.
     - Override taming: the data properties `constructor`, `name`, `message`, `toString`, `valueOf` and `toLocaleString` on the hardened prototypes, and every data property of `Object.prototype` except `__proto__`, become accessors. Their setter defines an own property on any receiver other than the prototype, so `this.name = …` and `o.toString = …` still work.
  2. Installs `Symbol.for('xaravel.harness.report')` (the ESC-4.2-1 reporter) and `Symbol.for('xaravel.harness.late')` on `globalThis`, both non-writable and non-configurable. Each appends one JSON line (`{"report":…}` or `{"late":{"id","kind"}}`) to `XARAVEL_HARNESS_OUT`.
- **Late assertions** (AC 6), in `packages/assert`. `runCounted` marks its counts ended after the body settles, and `registerTests` hands it the Test ID.
  - A `recordAssertion` or `addToAssertionCount` that lands in ended counts calls the late hook, when it is a function, with a frozen `{id, kind}`. `kind` is `null` for the kind-less count.
  - Without the hook, it does nothing.
  - It never throws: a throw would fail whichever test is running at the time.
  - The `Declarations.ts` header documents the protocol.
- **Escalations** (`trigger: contract`):
  - `conformance/escalations/ESC-5.3-1.md` (`test_ids: [XT-conformance-104]`): no Story owns `BlockedByComponentError`. It proposes that the Story that first raises it (17.2) defines it in `@xaravel/runtime` with `name` set to `BlockedByComponentError` and a message that starts `BlockedByComponentError(<c>)`, which is the form the harness matches. AC 4 ships conditional on it.
  - `conformance/escalations/ESC-5.3-2.md` (`test_ids: [XT-conformance-103]`): FR-113's "a DIV clause allows fewer" has no machine-readable form, and Story 8.1 owns the DIV records. It proposes the `fewer_assertions: [<k>…]` frontmatter. The waiver half of AC 3 ships conditional on it.
- **Xaravel Tests.** `conformance/tests/xaravel/harness.test.ts` holds XT-conformance-101..105 (manifest order) and XT-conformance-185 (AC 6, added to `stories/5.3.md`).
  - Tests use `bun:test` and hermetic `mkdtemp` roots (a `bunfig.toml`, the Inventory, Expectations, `conformance/variants`, and Ported Test files that import `portedTest` from the real `packages/assert` by absolute path).
  - The real repo is only read.

**Never:**
- No `--fast`, seeds, filters (5.4), worktree keys, locks or per-worktree Redis (5.5), Ratchet or ownership (5.6), CI wiring (5.7), Expectations writes or promotion (5.8), `xt:coverage` or `story:check` (5.9).
- No change to `tools/expectations/`, `tools/pin-bump/`, the Inventory, any shard, the four-key report shape (ESC-4.7-1), or `AGENTS.md`. The AGENTS TODO line is left for the Maintainer.
- No definition of `BlockedByComponentError` in a graded package, and no frame protocol implementation (Story 9.1).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Real repo | no Ported Tests; pgsql/redis down | NOT-RUN lines; `SUMMARY … differ=0`; no spawn | exit 0 |
| Package bunfig | `packages/x/bunfig.toml` | names it; nothing spawned | exit 1 |
| Variants | expectations on `none`, `sqlite` | one spawn each, `XARAVEL_VARIANT` seen by the test | — |
| Mismatch | `pass` line, test fails | `FAIL <id> [none] expected=pass actual=fail asserts=1/1` | exit 1 |
| Unexpected pass | `skip:not-ported-yet`, test passes | `UNEXPECTED-PASS …` | exit 1 |
| Floor | inventory `{assertSame:2}`, report `{assertSame:1}` | `FLOOR … asserts=1/2`; waived with DIV `fewer_assertions` | exit 1 / 0 |
| blocked-by | `skip:blocked-by:database` + BlockedByComponentError(database) / (cache) / Error | match / FAIL / FAIL | — |
| NOT-RUN | pgsql at a closed port | `NOT-RUN [pgsql] …`; not in differ; files unchanged | exit 0; `CI=true` → exit 1 |
| Concurrent | two interleaving tests, `--concurrent` | each report has only its own counts | — |
| Late | assertion in an un-awaited `then` | actual `late` | exit 1 |
| Intrinsic patch | test assigns `Object.prototype.x` / `AsyncLocalStorage.prototype.run` / `test.each` | throws `TypeError`; `this.name =` still works | — |

</intent-contract>

## Code Map

- `packages/assert/src/declarations/AssertionCounter.ts:22-72` -- `Counts`, `recordAssertion`, `addToAssertionCount`, `runCounted`; add `ended`, the id and the late hook.
- `packages/assert/src/declarations/Declarations.ts:1-24,50-105` -- the protocol header, `registerTests` (pass the id to `runCounted`), `TestReport` (unchanged).
- `tools/assert-coverage/coverage.ts:186-262` -- the existing spawn, reporter and junit-parse pattern (`passedTests` unescape); copy its approach, not its code path.
- `tools/pin-bump/pin-bump.ts:316,365` -- `readWorkingInventory`, `readExpectations` (`Shard{path,lines}`).
- `tools/expectations/expectations.ts:64-82,158` -- `VARIANTS_FILE`, `UsageError`, `readVariants`, and the CLI and exit-code style.
- `tools/inventory/inventory.ts:93,118,167` -- `ALPHA_VARIANTS`, `InventoryEntry.assertions` (a kind multiset, or `null`), `compareUnits`.
- `tools/escalations/escalations.ts` -- the frontmatter parsing approach for DIV `fewer_assertions`.
- `conformance/tests/xaravel/skip-reasons.test.ts:1-60` -- the fixture-root helper and header style.
- `packages/mockery/tests/xaravel/fixtures/mockery.fixture.ts` -- a portedTest fixture example.
- `stories/5.3.md` -- add XT-conformance-185 (AC 6) to `xaravel_test_ids` and the table.
- `package.json` -- the `harness` script. `tsconfig.json:9` already includes `conformance/**/*.ts`.
- `ARCHITECTURE-SPINE.md:331-358,504,570,617` -- AD-15, AD-25, `--no-env-file`, layout.

## Tasks & Acceptance

**Execution:**
- `packages/assert/src/declarations/AssertionCounter.ts`, `Declarations.ts` -- the late-assertion hook.
- `conformance/harness/intrinsics.ts` -- `hardenIntrinsics()`.
- `conformance/harness/preload.ts` -- harden, then install the two non-writable globals.
- `conformance/harness/junit.ts` -- `parseJunit(xml) → Map<name, {outcome, type, message}>`.
- `conformance/harness/backends.ts` -- `backendFor(variant)`, `probe(backend, env)`.
- `conformance/harness/compare.ts` -- a pure `compare(...)` that produces the actual outcome, the matching, the floor and the lines.
- `conformance/harness/harness.ts` -- the preconditions, the spawn per variant, `runHarness(root, opts)` (internal `bunArgs`, `env`), and `main`.
- `package.json` -- `"harness": "bun --no-env-file conformance/harness/harness.ts"`.
- `conformance/escalations/ESC-5.3-1.md`, `ESC-5.3-2.md` -- as specified above.
- `stories/5.3.md` -- XT-conformance-185.
- `conformance/tests/xaravel/harness.test.ts` -- XT-101..105 and 185, covering the matrix.
- `docs/ops/harness.md` -- usage, the line format, statuses, backends and the protocols.

**Acceptance Criteria:**
- Given `bun run harness`, when it runs, then it runs `bun test` with the root `bunfig.toml` once per variant, setting `XARAVEL_VARIANT`, and it fails immediately if a package-level `bunfig.toml` exists (XT-conformance-101).
- Given results that differ from expectations, then there is one line per differing pair in the AC format, closed by a summary line (XT-102).
- Given a Ported Test whose kind multiset is smaller than the Inventory's, then it is a floor failure unless a DIV clause allows fewer. The waiver is conditional on ESC-5.3-2 (XT-103).
- Given `BlockedByComponentError(<c>)` under `blocked-by:<c>`, it matches, and any other failure mismatches. This is conditional on ESC-5.3-1 for the class (XT-104).
- Given Postgres or Redis not running locally, those variants are `NOT-RUN`, not failures and never written (XT-105).
- Given concurrent tests, a late assertion and intrinsic patching, then counts never mix, the late assertion fails its test, and the intrinsics are frozen before any Ported Test loads (XT-185).

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 38 findings — high 0, medium 12, low 16, false 10, maybe-false 0
- findings:
  - (verification-gap) `[medium]` `[patch]` `ownConstructor`'s tamed-accessor branch never runs under the preload: added preload-run Date and Map `assertEquals` failures to XT-185.
  - (verification-gap) `[low]` `[patch]` nothing tests that the two harness globals can't be replaced: added assign and `defineProperty` attempts to XT-185.
  - (blind) `[medium]` `[patch]` a test can call the reporter with another test's id, and the last report wins (forged counts get past the floor): a duplicate report now makes the outcome `fail`. Grouped with edge E5.
  - (blind) `[medium]` `[patch]` the grader looks up `Object.freeze`/`JSON.stringify` at call time, and global bindings stay writable, so reassigning `globalThis.Object`/`JSON` hides late assertions: functions are captured at module load and the hardened globals' bindings made non-writable. Grouped with edge E3, E4.
  - (blind) `[low]` `[patch]` `BUN_OPTIONS`/`NODE_OPTIONS` reach the child: stripped. The global `~/.bunfig.toml` is not checked (not "package-level"; harness hosts are clean CI or dev machines).
  - (blind) `[medium]` `[patch]` a Ported Test file that throws at import is invisible, and `missing` matches skip lines: a non-zero exit with no failing testcase is now an `ERROR [<variant>]` difference. Grouped with edge E6.
  - (blind) `[low]` `[patch]` FAIL lines give no reason: the junit type/message for each FAIL and the short kinds for each FLOOR go to stderr. Grouped with intent I8.
  - (blind) `[low]` `[reject]` no child timeout: bun's per-test timeout (5 s default) bounds each test, and bun exits after the last test even with open handles.
  - (blind) `[medium]` `[patch]` late detection is best-effort and undocumented: the limits are now in `docs/ops/harness.md` and the counter header. Grouped with edge E1, E12. The throw into the running test is deferred (edge E2).
  - (blind) `[low]` `[reject]` override taming is narrower than every method (`promise.then = f` throws under the harness only): the contract chose SES-moderate-style taming on purpose. Tameing every method turns all intrinsic methods into accessors, which breaks descriptor reads in the grader (E8 shows the cost). Documented as a harness constraint. Grouped with edge E7.
  - (blind) `[low]` `[reject]` `ownConstructor` can run a user getter on a user-frozen prototype: that needs a class that freezes its own prototype with a non-configurable `constructor` getter, and branding tame getters would add a protocol.
  - (blind) `[low]` `[reject]` the Story edits its own manifest: AC 6 (added by the Epic 4 retro) had no Xaravel Test. Phase 0 Stories may edit `stories/` under the MAINT amendment, and only `test_ids` (unchanged, empty) are read from the base branch.
  - (blind) `[low]` `[patch]` the off-manifest ID registry still says next free is XT-conformance-185: `story-manifests.md` updated (185 taken, next is 186).
  - (blind) `[low]` `[patch]` the real-repo check is weak and hard-codes three NOT-RUN lines: it now digests `conformance/expectations` and `conformance/inventory`, and checks pgsql/redis NOT-RUN without a count.
  - (blind) `[low]` `[patch]` several harness paths were untested: added a no-junit run, an unknown Variant and a `test.skip` junit skip. The rest (malformed JSONL, xaravel report, reachable unix socket, junit ranking) are rejected as low with direct code.
  - (blind) `[low]` `[reject]` raw `test()` testcases, and reports on variants without lines, go unflagged: they earn no conformance credit, since only Expectations lines are compared.
  - (blind) `[low]` `[patch]` XT-101 pinned exact stderr text: now a regex.
  - (edge) `[medium]` `[patch]` E1: a timer that fires after bun exits is never seen. Documented (grouped with blind late finding).
  - (edge) `[medium]` `[defer]` E2: a *failing* late assertion still throws into whichever test is running. This is pre-existing (Story 4.2's assertions throw on failure wherever they run); fixing it needs every assertion path to check ended counts.
  - (edge) `[medium]` `[patch]` E3: `globalThis.JSON` is reassignable in the preload. Grouped above.
  - (edge) `[medium]` `[patch]` E4: global bindings are replaceable. Grouped above.
  - (edge) `[medium]` `[patch]` E5: duplicate reports, last wins. Grouped above.
  - (edge) `[medium]` `[patch]` E6: a non-zero exit outside any testcase is ignored. Grouped above.
  - (edge) `[low]` `[reject]` E7: untamed inherited method overrides. Grouped with the blind taming row.
  - (edge) `[low]` `[reject]` E8: mockery's `_mockery_parentMethod`/`DoubleTarget` read `descriptor.value`, so a partial mock of an Error/Date/Map subclass loses the parent `toString`/`valueOf`/`name`/`message` under the preload only. That case is rare (`constructor` is skipped by both). The fix (teaching mockery the tamed accessor, ideally through one shared helper) adds surface. Recorded as a residual risk.
  - (edge) `[low]` `[patch]` E9: `addToAssertionCount(0)` after the end marked the test late. Now ignored.
  - (edge) `[false]` `[reject]` E10: numeric YAML clause `2.10`. DIV clauses are integers `DIV-<n>.<k>` (Story 8.1 AC), so `2.10` is not a clause.
  - (edge) `[false]` `[reject]` E11: the setter throws on a primitive receiver. Every module is strict, where assigning to a primitive throws anyway.
  - (edge) `[medium]` `[patch]` E12: late detection limits. Grouped and documented.
  - (intent) `[false]` `[reject]` I1: the real repo never spawns `bun test`. No Ported Test exists yet; spawning is exercised on fixture roots and the CLI.
  - (intent) `[false]` `[reject]` I2: concurrency is only via the internal `--concurrent`. The AC is about counts never mixing when tests do run concurrently; portedTest has no concurrent form, and bun's flag is the only way to run them so.
  - (intent) `[false]` `[reject]` I3: the late assertion fails at the harness verdict, not in bun. The harness is the grader, and bun's result is one of its inputs.
  - (intent) `[false]` `[reject]` I4: preload order against a root-bunfig preload is unasserted. The root `bunfig.toml` is Protected and has no preload.
  - (intent) `[false]` `[reject]` I5: the floor waiver is conditional. That is by design (ESC-5.3-2).
  - (intent) `[false]` `[reject]` I6: blocked-by is tested against a stand-in class. That is by design (ESC-5.3-1); the harness matches the junit form.
  - (intent) `[false]` `[reject]` I7: NOT-RUN is per variant. The AC says "those variants are printed as NOT-RUN".
  - (intent) `[low]` `[patch]` I8: `asserts=` sums hide which kind fell short. Grouped with the FAIL-reason stderr patch.
  - (intent) `[false]` `[reject]` I9: additions outside the literal ACs. Descriptive only; each addition follows the contract.

## Design Notes

Bun's junit output records `type` and `message` for each failure (checked on 1.4.3), so `blocked-by` matching needs no change to the report. The report keeps its four keys (ESC-4.7-1).

The late hook never throws: an unhandled throw from a timer fails whichever test happens to be running at the time.

Override taming follows SES's approach. Without it, a frozen `Error.prototype` breaks every `this.name = …` in strict code.

## Verification

**Commands:**
- `bun run harness` -- expected: NOT-RUN for pgsql, redis and the queue/backends that are down, `SUMMARY … differ=0`, exit 0.
- `bun test conformance/tests/xaravel/harness.test.ts packages/assert` -- all pass.
- `bun test --preload ./conformance/harness/preload.ts packages/assert packages/mockery` -- still passes with intrinsics hardened.
- `bun run test`, `bun run typecheck`, `bun run lint`, `bun run escalations:check`, `bun run expectations:check`, `bun run protected-paths:codeowners` (no drift) -- all pass.

## Auto Run Result

Status: done

**Summary.** Added the conformance harness in `conformance/harness/`, run as `bun run harness`.
- **Checks before running.** The root `bunfig.toml` must exist. Any other `bunfig.toml` fails the run before anything is spawned.
- **Runs.** One `bun test` run per Variant that appears in the Expectations. Each run uses the root `bunfig.toml`, `XARAVEL_VARIANT`, the harness preload and the junit reporter, over every `packages/*/tests/ported/**/*.test.ts`.
- **Matching.** Junit outcomes are joined with the ESC-4.2-1 reports on Test ID, then compared with the Expectations File. The floor is checked per kind. `blocked-by:<c>` matches only a `BlockedByComponentError(<c>)` failure.
- **Report.** One line per differing pair: `<STATUS> <id> [<variant>] expected=… actual=… asserts=<n>/<u>`. Also `UNKNOWN` and `ERROR` lines, then `SUMMARY`.
- **Backends.** A Variant whose backend is down prints `NOT-RUN` and is never a failure. Under `CI=true`, a down alpha Variant is a failure.
- **Preload.** Before any Ported Test loads, it hardens the intrinsics (freeze with SES-style override taming, and locked global bindings). It also installs the report hook and the late-assertion hook, both non-writable.
- **Late assertions.** `@xaravel/assert` now ends each test's counts when its body settles. A later assertion goes to the late hook, and the harness fails that test as `late`.

**Files changed.**
- `conformance/harness/{harness,compare,junit,backends,preload,intrinsics}.ts`: the runner, comparison, junit reader, backend probes, preload and hardening.
- `packages/assert/src/declarations/AssertionCounter.ts`, `Declarations.ts`: the late-assertion protocol, with functions captured at load.
- `packages/assert/src/comparison/PhpComparison.ts`: reads a tamed `constructor` accessor on a hardened prototype, so built-in detection still works under the preload.
- `conformance/tests/xaravel/harness.test.ts`: XT-conformance-101..105 and 185.
- `conformance/escalations/ESC-5.3-1.md`, `ESC-5.3-2.md`, `ESC-5.3-3.md`: the `BlockedByComponentError` contract, the DIV `fewer_assertions` form, and a failing late assertion throwing into the running test.
- `stories/5.3.md`: XT-conformance-185 for AC 6. `_bmad-output/implementation-artifacts/story-manifests.md`: the ID registry, where the next free ID is now 186.
- `package.json` (the `harness` script) and `docs/ops/harness.md`.

**Review.** 38 findings: 12 medium, 16 low and 10 false.
- **Patched: 13 fixes**, covering 5 medium entries and 8 low ones:
  - duplicate reports now fail;
  - grader functions are captured at load, and global bindings are locked;
  - an `ERROR` line for a non-zero exit with no failing testcase;
  - `BUN_OPTIONS`/`NODE_OPTIONS` are stripped from the child;
  - stderr diagnostics for FAIL and FLOOR;
  - the late-detection limits are documented;
  - new tests: the preload `ownConstructor` path, the hooks being non-writable, a no-junit run, an unknown Variant, `test.skip`, a stronger real-repo no-write check, and a regex in place of a pinned diagnostic;
  - `addToAssertionCount(0)` after the end is no longer late;
  - the ID registry.
- **Deferred: 1.** E2: a failing late assertion throws into the running test. ESC-5.3-3 (proposed for Story 9.11) is raised in a planning PR after this one merges: the `escalations` check reads its Test ID, XT-conformance-185, from the base-branch manifest, which gains it only with this PR.
- **Rejected:** each with its reason in the triage log. These cover:
  - the narrow taming list, on purpose (SES-moderate);
  - mockery partial mocks of intrinsic subclasses under the preload;
  - `ownConstructor` running user getters;
  - the child timeout;
  - the manifest edit;
  - raw `test()` cases;
  - numeric YAML clauses;
  - the primitive setter;
  - and the intent auditor's descriptive divergences, which are mostly the escalated contracts.

**Follow-up review recommended: true.** The patch pass added code paths no reviewer has seen: the `ERROR` line from the exit code, duplicate-report failure, locked `globalThis` bindings, and the captured functions in `packages/assert`. Bun or library code that reassigns a hardened global binding at test time would now throw under the harness only. Patched entries by verdict: 5 medium, 8 low.

**Verification.**
- `bun run harness`: NOT-RUN for mariadb, mysql, pgsql, queue-beanstalkd@beanstalkd, queue-redis@redis, redis and sqlsrv; then `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`, exit 0.
- `bun test --preload ./conformance/harness/preload.ts packages`: 27 pass, 0 fail.
- `bun run test`: 190 pass, 0 fail.
- `typecheck`, `lint`, `escalations:check`, `expectations:check` and `expectations:reasons` all pass.
- `protected-paths:codeowners` causes no CODEOWNERS drift.

**Residual risks.**
- **Conditional ACs.** AC 4 depends on ESC-5.3-1 (no Story owns `BlockedByComponentError`; 17.2 is proposed). The waiver half of AC 3 depends on ESC-5.3-2 (the DIV `fewer_assertions` form; Story 8.1 is proposed).
- **Late assertions.** Detection is best-effort: one that fires after bun has finished is not seen, and a failing one blames the running test (ESC-5.3-3).
- **Harness-only failures.** Hardening can make a Ported Test fail only under the harness: instance overrides of untamed intrinsic methods (`promise.then = …`), `Error.prepareStackTrace` assignment, reassigning hardened globals, and mockery parent-method lookup for `toString`/`valueOf` on intrinsic subclasses.
- **No Ported Tests yet.** None exist, so the spawn path runs only on fixture roots.
- **`AGENTS.md`.** Its harness TODO line still needs the Maintainer. `--fast` and `--story` are Story 5.4.
