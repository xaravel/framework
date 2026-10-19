---
title: 'Freeze the Oracle clock to one recorded instant (retro epic-5 item 13, ruling ESC-5.7-1)'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: '3d47209de2582b8b39a6b4c1acf105484829aa70'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/decisions/ESC-5.7-1.md'
  - '{project-root}/conformance/escalations/ESC-5.7-1.md'
  - '{project-root}/docs/ops/oracle.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `tools/oracle/evaluate.php` evaluates each request with the real clock. A request whose code calls `Carbon::now()` or `Carbon::today()` without its own `setTestNow` therefore records the signing date. Four `DatabaseQueryBuilderTest::testWhereBetweens` fixtures go stale every day, and the nightly `oracle:recheck` is always red on them (ESC-5.7-1).

**Approach:** Record one fixed instant in `conformance/oracle/clock`. `evaluateOnce` reads and validates it, then passes it to evaluate.php as a new required argument. evaluate.php freezes Carbon to that instant, shown in the evaluation's default timezone, before each request's test case runs. The test's own `setUp()` / `setup` and a date-format request's `input.now` still override it. The batch that the merge to `main` triggers regenerates the fixtures, and a follow-up `planning/` PR commits them (outside this build; see Design Notes).

## Boundaries & Constraints

**Always:** There is one source of truth for the instant, `conformance/oracle/clock`: one line `YYYY-MM-DDTHH:MM:SSZ` and LF, set to `2026-10-18T12:34:56Z`. Every evaluate.php caller (`generateFixtures`, `recheck`, `story`) gets the instant only through `evaluateOnce`. The freeze happens in the forked child before `withTestCase`, so `setUpBeforeClass()`, `setUp()`, `setup` and `input.now` can still override it. If the clock file is missing or malformed, the run fails closed before anything is evaluated, and evaluate.php refuses a malformed `<now>`. Existing test assertions keep their meaning: only command shapes gain the new argument, and new cases are added.

**Never:** Do not list requests in `nondeterminism.jsonl`. Do not touch `conformance/expectations/**`, `conformance/fixtures/**` (they are regenerated only by the signed batch), `packages/**`, `AGENTS.md`, `.github/workflows/**`, `tools/ownership/` or `conformance/protected-paths`. Do not change the request hash, the fixture format or the image tag inputs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Request reads now | php-expr `\Illuminate\Support\Carbon::now()->toIso8601String()` | `2026-10-18T12:34:56+00:00` (default tz UTC) | — |
| Immutable now | `\Carbon\CarbonImmutable::now()->toIso8601String()` | same instant | — |
| Request sets its own clock | setup `\Illuminate\Support\Carbon::setTestNow('2001-02-03 04:05:06');` then `now()` | 2001-02-03 instant | — |
| Bare date-format with `now` | XT date-format request, `input.now` = `'2020-01-01 00:00:00'` | input.now wins | — |
| Clock file missing | no `conformance/oracle/clock` | `evaluateOnce` throws `conformance/oracle/clock is missing` | run exits 1, nothing evaluated |
| Clock file malformed | `2026-10-18 12:34:56\n`, `2026-13-40T00:00:00Z`, two lines | throws `conformance/oracle/clock: … not an instant YYYY-MM-DDTHH:MM:SSZ` | exit 1 |
| evaluate.php bad `<now>` | argv `<dir> <php> bogus <file>` | stderr `evaluate: <now> bogus is not an instant YYYY-MM-DDTHH:MM:SSZ` | exit 1 |

</intent-contract>

## Code Map

- `tools/oracle/evaluate.php` -- usage check at line 86 (`$argc < 4`) and `$requestFiles = array_slice($argv, 3)` at line 127. These become `<framework-dir> <php-version> <now> <requests-file>...`, with `<now>` validated by regex and a `DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s\Z', …, UTC)` round trip before the framework check. `evaluate()` at ~line 395 has two `withTestCase` calls (the blade-render early return and the eval kinds after the `switch`, after date-format's `date_default_timezone_set`). Freeze immediately before each one through a new `freezeClock(string $now)`: `\Carbon\CarbonImmutable::setTestNow(...)`, then `\Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse($now)->setTimezone(date_default_timezone_get()))`. The instant reaches `evaluate()` as a global or a parameter threaded through `runChild`. Update the header comment (usage, step list) and the date-format comment at line 432.
- `tools/oracle/fixtures.ts` -- add `CLOCK_FILE = \`${ORACLE_DIR}/clock\`` beside `NONDETERMINISM_FILE` (line 63) and an exported `readOracleClock(root): string`. `evaluateOnce` (line 406) calls it first and passes the value as argv[3] in both modes (local: after `PHP_VERSION`; image: after `PHP_VERSION`). Header comment.
- `conformance/oracle/clock` -- new, `2026-10-18T12:34:56Z\n`.
- `conformance/tests/xaravel/oracle-fixtures.test.ts` -- `fixtureRoot` (line 77) writes the clock. The `standIn` loop (line 115) reads `command.slice(5)`. The exact command at line 221 and the XT-223 `expected` at line 619 gain the instant. The XT-223 fake php must skip the extra arg. The real-PHP spawns at lines 407 and 707 pass the instant. Add cases: missing clock, malformed clock (each matrix value), and a phpTest for the now / immutable / own-setTestNow / bad-`<now>` rows.
- `conformance/tests/xaravel/oracle-recheck.test.ts` -- fixture root (line 83) writes the clock; the stand-in (line 124) reads `slice(5)`; line 206 gains the instant.
- `conformance/tests/xaravel/oracle-story.test.ts` -- fixture root (line 81) writes the clock; the stand-in (line 127) reads `slice(5)`; line 236 gains the instant; the spawn at line 403 passes it. Add the bare date-format `input.now` override row here if XT requests are built here, else in oracle-fixtures.
- `docs/ops/oracle.md` -- Evaluation (line 171): the frozen clock and its overrides, plus the new argument. Recheck (line 253): replace "is the Maintainer's ruling on ESC-5.7-1" with the ruling's outcome. Add a note that changing `clock` stales every fixture that reads the clock and needs a batch regeneration, and that a Ported Test comparing against such a fixture freezes Xaravel's clock to the same instant.
- Read-only: `tools/oracle/recheck.ts:147` and `tools/oracle/story.ts:160` already go through `evaluateOnce`. The local install `/tmp/xaravel-inv/framework` has `date.timezone` UTC and Carbon 3, whose `setTestNow` writes one shared `FactoryImmutable` default.

## Tasks & Acceptance

**Execution:**
- `conformance/oracle/clock` -- create -- the single recorded instant.
- `tools/oracle/fixtures.ts` -- `CLOCK_FILE`, `readOracleClock`, and `evaluateOnce` passes the instant -- one choke point for every caller.
- `tools/oracle/evaluate.php` -- the new argument, its validation and `freezeClock` before each `withTestCase` -- the freeze.
- `conformance/tests/xaravel/oracle-{fixtures,recheck,story}.test.ts` -- adapt the stand-ins, fixture roots and exact commands; add every matrix row -- pins the behaviour.
- `docs/ops/oracle.md` -- document it.

**Acceptance Criteria:**
- Given the local install and PHP 8.5.11, when evaluate.php evaluates a request that reads `Carbon::now()` twice on different days, then both outputs equal the recorded instant.
- Given the repository, when `bun test conformance/tests/xaravel/oracle*.test.ts`, `bun test`, `bun run typecheck` and `bun run lint` run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 21 findings — high 0, medium 3, low 13, false 3, maybe-false 0, plus 2 descriptive intent notes
- findings:
  - `[medium]` `[patch]` (verification-gap) No test pins the CLOCK_RESERVE handle guarantee; two passes shift alike. Patched: XT-220 asserts `spl_object_id(new \stdClass)` = 91, the baseline 3d47209 evaluator's value (101 with the placeholder loop removed).
  - `[medium]` `[patch]` (verification-gap) No test shows an Upstream `setUp()` overriding the freeze. Patched: XT-220 evaluates a `SupportCarbonTest::testCarbonCanSerializeToJson` date-format request and expects `2017-06-27T13:14:15+00:00`.
  - `[low]` `[reject]` (verification-gap other) The matrix message differs from the thrown message's tail. The fix is a spec edit, and the test matches the shared prefix.
  - `[low]` `[patch]` (blind) The Recheck docs said a date-dependent request "no longer goes stale", but only Carbon is frozen. Narrowed to Carbon's now/today; `time()`, `date()` and `DateTime('now')` are named as still live.
  - `[low]` `[reject]` (blind) Nothing says how a Ported Test gets the instant. The ruling gives that to the Story that ports the test, and the docs point it to `conformance/oracle/clock`.
  - `[low]` `[patch]` (blind) The regeneration trigger list omitted the clock. Added `conformance/oracle/clock`.
  - `[medium]` `[patch]` (blind) CLOCK_RESERVE is untested and unspecified. Grouped with the verification-gap handle finding and patched the same way. The cost (1m43s for a full local recheck) is acceptable.
  - `[low]` `[reject]` (blind) Tests hard-code the instant (the XT-222 pin, the Berlin row). The clock is under `/conformance/` (Protected), so changing it is a deliberate reviewed change, and the pin makes a silent change fail loudly.
  - `[low]` `[reject]` (blind) Test files read `NOW` three ways. Cosmetic; each reads the same committed file.
  - `[low]` `[reject]` (blind) The clock cases ride on existing Test IDs. A new ID needs a manifest edit outside this item. XT-220, 222 and 197 already own evaluate.php's evaluation, pass shape and date-format.
  - `[low]` `[reject]` (blind) Fail-closed is tested only through the batch. Recheck and story reach evaluate.php only through `evaluateOnce`, which the batch case covers.
  - `[low]` `[reject]` (blind) The spec's message differs from the implementation's, and the change logs are empty. The fix is a spec edit, and this log now records both.
  - `[false]` `[reject]` (blind) Fixtures don't record which clock signed them. That is the existing design: the signature binds neither the Pin nor the image, and the nightly recheck exists for exactly that (docs Recheck).
  - `[low]` `[patch]` (blind) Stale `finally` comment and an unwrapped header line. Reworded and re-wrapped.
  - `[low]` `[patch]` (blind) The docs repeated the instant. Replaced with a pointer to `conformance/oracle/clock`.
  - `[medium]` `[patch]` (edge) A request that uses Carbon without `now()` (e.g. `Carbon::create`) finds the factory already built, so its later object ids shift. Those are batch fixtures, which the post-merge batch re-signs; no per-Story fixture changed in the local recheck. Patched: the docs and `freezeClock`'s comment narrow the handle claim to requests that do not use Carbon.
  - `[low]` `[reject]` (edge) A clock year 0000-0099 is misread by `Date.UTC`. No such clock would ever be recorded, and the fix adds code.
  - `[low]` `[reject]` (edge) A clock path that is a directory throws a raw EISDIR. It still fails closed before evaluation.
  - `[false]` `[reject]` (edge) The clock changing between passes. Both passes run in one process over one checkout within seconds, and nothing writes the file during a run.
  - `[false]` `[reject]` (edge claim) XT-197's `hasTestNow() === false` was inverted against the spec's claim. The ruling makes every request frozen, so `false` is no longer Upstream-at-the-Oracle truth. The row now checks the recorded instant, which is stronger, not weaker.
  - `[low]` `[reject]` (intent) The overrides are wider than `input.now` (`setUp`, `setup`). That is faithful to Upstream: a test's own clock always wins, and the ruling's `input.now` override is the same principle.
  - (intent, descriptive) Regeneration is absent from the diff. As planned (Design Notes): the signed batch on `main` regenerates, then a `planning/retro-5-oracle-fixtures` PR commits the fixtures.
  - (intent, descriptive) The 4 committed testWhereBetweens fixtures hold midnight values from 2026-10-18, so under the frozen instant they may re-sign unchanged. The batch diff will show it.

## Design Notes

Showing the instant in the default timezone matches what a real `Carbon::now()` returns: a named zone (`UTC`, timezone_type 3), not a `+00:00` or `Z` offset zone. That keeps the encoded Carbon objects in the regenerated fixtures shaped like the unfrozen ones. In Carbon 3 both `setTestNow` calls write one shared factory, so the `Illuminate\Support\Carbon` call is the one that sticks; the immutable call keeps the ruling's wording true on any Carbon version.

Fixture regeneration is a step for after the merge, not part of this build. Fixtures are signed only by `oracle.yml#oracle` from `main`, which runs on a push that touches `tools/oracle/**` and uploads the `oracle-fixtures` artifact. The orchestrator then commits that artifact on `planning/retro-5-oracle-fixtures` (`oracle:verify-fixtures` checks the signatures), and only after that PR merges does the action item become `done`.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/oracle-fixtures.test.ts conformance/tests/xaravel/oracle-recheck.test.ts conformance/tests/xaravel/oracle-story.test.ts` -- expected: pass, phpTests not skipped locally
- `bun test` / `bun run typecheck` / `bun run lint` -- expected: pass
- `bun run oracle:verify-fixtures` -- expected: unchanged pass

## Auto Run Result

Status: done

**Summary.** `conformance/oracle/clock` records `2026-10-18T12:34:56Z`. `evaluateOnce` reads it (fail closed) and passes it as evaluate.php's new `<now>` argument. evaluate.php validates it and freezes Carbon and CarbonImmutable to it in the default timezone before each `withTestCase`, so `setUpBeforeClass()`, `setUp()`, `setup` and `input.now` still win. A placeholder reserve keeps object handles unchanged for requests that do not use Carbon.

**Files changed.**
- `conformance/oracle/clock`: new, the recorded instant.
- `tools/oracle/fixtures.ts`: `CLOCK_FILE`, `readOracleClock`, and `evaluateOnce` passes `<now>`.
- `tools/oracle/evaluate.php`: the `<now>` argument and its validation, `freezeClock` with `CLOCK_RESERVE`, comments.
- `conformance/tests/xaravel/oracle-{fixtures,recheck,story,merge-order}.test.ts`: clock in the fixture roots, stand-ins `slice(5)`, commands with `<now>`; new cases cover every matrix row, handle preservation and the Upstream `setUp()` override.
- `docs/ops/oracle.md`: the frozen clock, its limits and overrides, and the regeneration trigger.

**Review.** 21 findings. Patched 6 entries (3 medium, 3 low; two medium findings grouped). Deferred none. Rejected 15, each with its reason in the Review Triage Log.

**Follow-up review:** recommended (3 medium entries patched). Unverified risk: handle preservation and the freeze are proven only against the local install, not in the Oracle image. The post-merge batch diff is the check, and it should change only Carbon-using batch fixtures.

**Verification.** `bun test`: 242 pass, 0 fail, with the PHP tests run against `/tmp/xaravel-inv/framework`. `bun run typecheck` and `bun run lint` are clean. `bun run oracle:verify-fixtures`: 1862 OK.

**Residual risks.** Until the follow-up fixtures PR merges, the nightly recheck stays red on the Carbon-using batch fixtures, about 21 by the local recheck.
