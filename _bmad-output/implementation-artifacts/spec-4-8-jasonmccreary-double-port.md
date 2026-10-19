---
title: 'Story 4.8: `jasonmccreary/double` port'
type: 'feature'
created: '2026-10-18'
baseline_revision: '6032f8862cee20002f2903e5ee4922a5108ad1c0'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-6-mockery-advanced-and-api-coverage.md'
  - '{project-root}/docs/ops/oracle.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The ai, mcp and boost suites double their collaborators with `JMac\Testing\Double` (`jasonmccreary/double` v1.0.1): 163 `Double::for` calls, with 143 `returns`, 11 `resolves` and 7 `throws`. The grader has no port of it, so `bun run mockery:coverage` lists the three names `pending ESC-4.6-1`, and none of those tests can port as written (ESC-4.6-1 item 6).

**Approach:**
- Port the subset of Double that the Upstream suites use into `@xaravel/mockery`, under `src/JMac/Testing/**`, keeping Double's names and messages.
- Wire its auto-verification into the existing Mockery run protocol.
- Prove each behaviour cell by cell against signed Oracle fixtures that run the real PHP library, as XT-mockery-7.
- Make the coverage tool probe the three names.
- Remove the unused `xaravel.mockery.mock` hook (ESC-4.7-1 item 4).

## Boundaries & Constraints

**Always:**

*API and naming*
- The API follows v1.0.1. Paths below are under `/tmp/xaravel-inv/boost/vendor/jasonmccreary/double/src` (the pinned lock's copy). Read it; never execute it except through the Oracle.
- `Double.for(...targets, options?)`:
  - A target is a class, or a contract token (a symbol).
  - A trailing plain object `{ override: true }` stands for PHP's named `override:`.
  - Several targets must all be tokens (interfaces). A class among several targets throws as `ClassGenerator.php:96` does.
- The double `instanceof` its class target. A token double follows Mockery's token handling.
- Control verbs: `instance`, `expects`, `allows`, `passthru(real?)` and `strict`.
- `OverriddenDouble` is ported, together with the reserved-name collision rule (`ClassGenerator.php:20,139`).

*Expectations*
- `MethodExpectation` provides `with`, `returns(...v)`, `throws(...e)`, `resolves(fn)`, `times(count?, maximum?, minimum?)` and `never()`.
  - The TS `times` takes `{ minimum, maximum }` for PHP's named arguments, or a count.
  - Sequences hold at the last value.
  - The last of `returns`, `throws` and `resolves` wins.
  - `resolves` calls `fn` with the call's arguments.
  - `returns()` with no values throws InvalidArgumentException with Double's message.
- Matchers: implicit Equals (`EqualsMatcher.php`), `Argument.type` and `Argument.satisfies`.
  - Equals compares arrays with identical keys in the same order, then recurses.
  - Objects compare by PHP `==`.
  - Everything else compares by `===`.
  - Equals uses `@xaravel/assert`'s exported PHP-value layer (`phpLooseEquals`, `phpStrictEquals` and the `PhpArray` iterator). Never write a new copy of it (Epic 4 lesson).

*Dispatch*
- Dispatch follows `ProxyBehavior::intercept`: specific matches before generic ones, LIFO within each tier, and an exhausted match as the fallback.
- An `expects` mismatch throws at the call.
- Over the limit throws at the call.
- Modes are Loose, Strict and Passthru.
- Unknown, magic (`__*`) or static methods throw as `assertConfigurable` does, with did-you-mean.

*Safe defaults (`SafeDefaultResolver.php`)*
- The declared return type is read through `globalThis[Symbol.for('xaravel.api.signature')]`: `(fqcn, member) => { returns: string | null, nullable: boolean } | null`. That is the row shape of `conformance/api-surface/*.jsonl`.
- With no lookup, or no row, the method is untyped, so the default is `null`.
- A class or interface type is resolved by:
  - `Symbol.for('xaravel.class.lookup')`, for classes, through `support/classes.ts`;
  - `Symbol.for(fqcn)`, for tokens.
- If neither resolves, the double throws a `LogicException` that names the type. It never returns null silently.
- An enum type resolves to `cases()[0]` of the resolved class.
- The fabrication depth limit is ported.

*Exceptions and messages*
- Each exception has Double's PHPUnit-variant FQCN.
- They extend `@xaravel/assert`'s `AssertionFailedError`, since PHPUnit is present. `ExceptionFactory.php:264` is the reference.
- Messages are byte-identical to the templates in `Exceptions/*Fields.php` and `Diagnostics/*`: ValueFormatter, ArgumentFormatter, CallListFormatter, Pluralizer, DidYouMean and StringDiffer.

*Counting and verification*
- One `recordAssertion("assertTrue")` per pending double that passes (`PhpUnitIntegration::registerPass`), and one before each failure exception is built (`ExceptionFactory`).

*Auto-verify*
- `Double.enableAutoVerify()` is VerifiesDoubles' `#[Before]`.
- Its state lives in the Mockery run's AsyncLocalStorage slot, never in a module variable outside one. Outside a run, the process slot is used, the same as Mockery's.
- When auto-verify was enabled in the run, the run performs VerifiesDoubles' `#[After]` after `Mockery.close()`:
  - when `fn` resolved and Mockery closed cleanly: `Double.verifyAll(false)`;
  - otherwise: `verifyAll(true)` (ambiguities only), and the first error wins.

*Files and records*
- Files are `src/JMac/Testing/<sub-path>/<ClassName>.ts`, one public class per file.
- Each class has a `static readonly [FQCN]` brand.
- New exports and their prototypes are frozen in `src/index.ts`.
- Double's MIT notice is kept verbatim in `packages/mockery/src/JMac/Testing/LICENSE`. The package `LICENSE` is unchanged, because XT-conformance-7 pins it.
- Escalation ESC-4.8-1 (`trigger: contract`, `test_ids: [XT-mockery-7]`) is raised for every contract item in Design Notes.
- AC 1 is recorded as conditional on its ruling (Epic 4 lesson).

**Never:**
- No import from a graded package. No dependency besides `@xaravel/assert` (`mockery.test.ts:232-251`, XT-conformance-14).
- No new copy of PHP comparison, `var_export` or object-id semantics.
- No hand-written PHP truth values: expected cells come only from signed fixtures.
- No edits to `tools/ownership/`, `conformance/protected-paths`, `tools/protected-paths/`, the oracle signing key or `conformance/expectations/**`.
- The `received`/`unused`/`verify`/`ordered`/`listen`/`bypassFinals` API, FinalBypass, AutoVerifySnapshot and the Any/All/Capture/Contains/Pattern/Same/Not/Remaining/None matchers are out of scope: no Upstream use. The reserved-name list still includes `received`, `unused` and `verify`.
- No weakening of an existing assertion. XT-mockery-6 and XT-conformance-183 change only from "3 pending" to "0 pending", which is stricter.

## I/O & Edge-Case Matrix

Every row is an XT-mockery-7 scenario, compared with the Oracle as the cells `[result | thrown short class + message, verify outcome, assertTrue count]`.

| Scenario | Input / State | Expected (from the Oracle) |
|---|---|---|
| returns | `expects('m')->returns(1)`, called once; also `returns(1, 2)` called 3×; a closure value | Value(s), holding at the last; the closure is returned, not called; verify passes, count 1 |
| returns() empty | `allows('m')->returns()` | InvalidArgumentException, with the message |
| throws | `throws(new RuntimeException('x'))` called twice; and a sequence | The same instance each time; held at the last |
| resolves | `resolves(fn ($a, $b) => $a.$b)`; a first-class callable | Called with the actual arguments |
| last verb wins | `returns(1)->throws(e)`; `throws(e)->resolves(fn)` | The last verb's behaviour |
| once exceeded | default `expects`, called twice | ExpectationCallLimitExceeded at the 2nd call |
| never | `expects('m')->never()`, called | Limit exceeded at the call |
| times | `times(2)` called once; `times(minimum: 1)` called 0× | UnsatisfiedExpectation at verify (single, and multi-line for 2 doubles/expectations) |
| allows unmet | `allows('m')`, never called | Verify passes |
| with mismatch | `expects('m')->with('a', ['k' => 1])`, called with `('b', ['k' => 2])`; with 2 candidates; a long string | ExpectationCallMismatch: comparison block, list form, StringDiffer |
| array key order | `with(['a' => 1, 'b' => 2])` vs `['b' => 2, 'a' => 1]` | Mismatch |
| object == | `with(new P(1))` vs another `new P(1)` | Match |
| Argument | `Argument::type(P::class)`, `type('string')`, `satisfies(fn)` | Match or mismatch per arg |
| safe defaults | untyped, `bool`, `int`, `string`, `array`, `?X`, `self`, class `X`, interface, enum, depth > limit | `null`/false/0/''/[]/null/double/child double/first case/FabricationLimitExceeded |
| passthru | `passthru()` unconfigured call; `passthru($real)` state copy; interface `passthru()`; second mode set | Real method result; copied field; the Double exceptions |
| strict | `strict()` unconfigured call | UnexpectedCall message |
| override | `Double::for(P, override: true)` where P has `instance()`; `->instance()`; no override | OverriddenDouble; the double; ReservedNameCollisionException |
| intersection | `Double::for(I1::class, I2::class)` | instanceof both; expectations work |
| unknown method | `expects('nope')` with a near name | UnknownMethodException with did-you-mean |
| ambiguous | two identical finite `expects('m')->with(1)` | AmbiguousExpectation at verify |

</intent-contract>

## Code Map

**Library reference (read only).** Under `/tmp/xaravel-inv/boost/vendor/jasonmccreary/double/src`:
- `Double.php`:
  - `for` 135-193, `fabricate` 201, `create` 231-254
  - `verifyState` 280-331, `verifyAll` 386-411
  - `passthru` 549-561, `assertConfigurable` 617-637
- `Engine/`:
  - `MethodExpectation.php` (bounds 55-61, `with` 81-111, verbs 113-157, `times` 167-199, `matchesArguments` 224-268, `describe` 466)
  - `ProxyBehavior.php` 22-123
  - `DoubleState.php` (mode 156-166, ambiguity 278-312)
  - `SafeDefaultResolver.php`, `ExceptionFactory.php`, `PassthruInitializer.php`, `ClassGenerator.php` (reserved verbs 20, collision 139, method selection 353-381), `DoubleControlMethods.php`, `PhpUnitIntegration.php`
- `OverriddenDouble.php`, `Matching/{Argument,EqualsMatcher,TypeMatcher,PredicateMatcher}.php`, `Exceptions/**`, `Diagnostics/**`, `Integrations/PHPUnit/VerifiesDoubles.php`.

**Upstream call sites.** Under `conformance/upstream/{ai,mcp,boost}/tests`; 41 files use `JMac\Testing`. Examples:
- `ai/tests/Unit/Gateway/TextGenerationLoopTest.php:1373`: `times(minimum: 1)->resolves`
- `boost/tests/Unit/Install/McpWriterTest.php:56`: `with(...)->throws`
- `boost/tests/Pest.php:164`: `OverriddenDouble`
- `boost/tests/Unit/Install/AgentsDetectorTest.php:49-82`: `Argument::type`
- `mcp/tests/Unit/Console/Commands/McpInspectorCommandTest.php:97`: `satisfies`

**Mockery package.**
- `packages/mockery/src/Mockery.ts`:
  - `ContainerSlot` 41-53: add Double's run state.
  - `run` 183-199: add the `#[After]` step.
  - `mockGlobal` 201, header 18-25, `installAll([...])` 224-227: remove the `mock` entry and keep `run`.
- `packages/mockery/src/index.ts`: the header (lines 3-4 are stale), freezes 57-101, exports 103-130. Add `Double`, `OverriddenDouble` and `Argument`, plus their public types.
- Reuse:
  - Token targets: Mockery's handling (`Mockery/Container.ts:194-198`, `Mockery/Mock.ts:60-134`, `Symbol.for('xaravel.contract.methods')`).
  - `support/classes.ts`: the class lookup and `graderExceptionClass`.
  - `support/values.ts`: `FQCN` 26, `classNameOf` 65, `varExport`, `getClass`, `formatArgument`.
  - `php/*`: the SPL exceptions (`InvalidArgumentException`, `LogicException`).
- `@xaravel/assert` (public index only): `recordAssertion`, `AssertionFailedError`, `phpLooseEquals`, `phpStrictEquals`, `phpIsArray`, `phpVarExport`, `phpObjectHandle`.

**Tests.**
- `packages/mockery/tests/xaravel/mockery.test.ts`:
  - `REQUEST_FILES` 43-48 (add `XT-mockery-7` → `4.8.jsonl`), `FIXTURES`/`PUBLIC_KEY` 49-50.
  - `oracleOutput` 105-116, `checkScenarios` 119-124.
  - The hook tests 141-186 (drop the `mock` name, keep `run`; the "mock taken" child case no longer throws, so replace it with a foreign-`run` case if one isn't there already).
  - The export list 189-218, freezing 219-229, imports and dependencies 232-251.
  - `runFixture` 507-545, XT-mockery-6 828-891 (`PENDING_DOUBLE` 835, "3 pending" 844/860/886).
- `packages/mockery/tests/xaravel/scenarios.ts`: `Scenario` 214-224 (add `"XT-mockery-7"` to the id union), `SETUP*` 168-182, `wrapPhp` 226-229, `runScenario` 231-247. `cells.ts` 57-75 has `scenarioMismatches`.
- `packages/mockery/tests/xaravel/fixtures/mockery.fixture.ts`: the child-fixture pattern.
- `packages/assert/tests/xaravel/fixtures/doubles.fixture.ts:12,23` and `doubles.test.ts:231` mention the hook name. Leave them: they assert its absence from assert.

**Coverage tool.** `tools/mockery-coverage/coverage.ts`:
- Header 17-28, `Api` 67-73, `PROBES` 105, `loadApi` 366-379, `works` 382-392, `DOUBLE_NAMES` 40 and the pending branch 401-402.
- `conformance/tests/xaravel/coverage-reports.test.ts:114` (XT-conformance-183) expects the 3 pending lines.

**Oracle.**
- `tools/oracle/evaluate.php:120,168` loads only the framework's autoloader.
- The image has Double at `/oracle/upstream/ai/vendor/jasonmccreary/double/src` (the ai, mcp and boost locks hold `jasonmccreary/double v1.0.1`; the framework lock has none).
- Request kinds: `tools/oracle/request.ts:44-50`. Ids must be in the manifest: `tools/oracle/story-requests.ts:123`.
- `bun run oracle:story check 4.8` / `generate 4.8`. Precedents: 4.6/4.7 (`docs/ops/oracle.md:257`; CI's `oracle.yml#story` signs on the PR).
- **Return types.** `conformance/api-surface/*.jsonl` rows `{fqcn, kind: "method", member, returns, nullable}`, e.g. `ai.jsonl:129`.

## Tasks & Acceptance

**Execution:**
- `packages/mockery/src/JMac/Testing/**`:
  - Port `Double`, `OverriddenDouble`, `DoubleInterface` (as a type) and the `Engine/` classes in the used subset: MethodExpectation, ProxyBehavior, DoubleState, Mode, SafeDefaultResolver, PassthruInitializer, ExceptionFactory, ArgumentLabeler and DoubleIdentity.
  - Port `Matching/{Argument,Matcher,EqualsMatcher,TypeMatcher,PredicateMatcher}`, the `Exceptions/**` classes the subset throws (both variants, with their `*Fields`), and `Diagnostics/**`.
  - The generated double is a cached `class extends Target`, or a token class. Every non-constructor, non-`__*` prototype method of the target chain (up to `Object.prototype`) is overridden to call `intercept`, which records only the arguments actually passed.
  - Instances are made with `Object.create`, so no constructor runs.
  - Passthru calls the target prototype's method. `passthru(real)` copies own enumerable fields and throws `PassthruTypeMismatchException` unless `real instanceof` the target.
  - Add `LICENSE` with Double's MIT text verbatim.
- `packages/mockery/src/Mockery.ts`:
  - Add the Double run state to the slot and the `#[After]` step to `run`.
  - Remove the `xaravel.mockery.mock` hook and `mockGlobal`, and rewrite the header.
- `packages/mockery/src/index.ts`: export and freeze `Double`, `OverriddenDouble` and `Argument`; update the header.
- `packages/mockery/README.md`: one paragraph. It says the package also ports `jasonmccreary/double` v1.0.1's Upstream-used subset (MIT, © Jason McCreary, notice in `src/JMac/Testing/LICENSE`) and how auto-verify is wired.
- `conformance/oracle-requests/4.8.jsonl`: one `php-expr` request, `XT-mockery-7`.
  - Its `setup` registers a PSR-4 autoloader for `JMac\Testing\`, from `/oracle/upstream/ai/vendor/jasonmccreary/double/src`, else `getenv('XARAVEL_DOUBLE_SRC')`, for local cross-checks.
  - It declares the PHP twin classes, interfaces and enum.
  - Its `exprs` hold every matrix scenario. Each is wrapped to return `[outcome, verify outcome, Assert::getCount() delta]` around `Double::enableAutoVerify()` … `Double::verifyAll(false)`.
  - Generate it with a throwaway script outside the repo. `bun run oracle:story check 4.8` passes.
- `packages/mockery/tests/xaravel/double-scenarios.ts` (with `scenarios.ts`' id union): the TS twins.
  - Twin classes carry `[FQCN]` statics.
  - The test installs an `xaravel.api.signature` lookup built from the twins' declared PHP return types, plus a class lookup, and removes both afterwards. They are `configurable` defines in the test only.
- `packages/mockery/tests/xaravel/mockery.test.ts` (+ `fixtures/double.fixture.ts`): XT-mockery-7.
  - It compares every scenario cell by cell with the signed fixture.
  - It also runs a child `bun test` fixture. With `Double.enableAutoVerify()` in a `portedTest`:
    - a met `expects` passes with `assertions: {assertTrue: 1}`;
    - an unmet one fails with Double's UnsatisfiedExpectation message;
    - a body error wins over verification;
    - with no `enableAutoVerify`, nothing is verified.
  - Update the hook tests, the export list and XT-mockery-6 (0 pending).
- `tools/mockery-coverage/coverage.ts`:
  - Delete `DOUBLE_NAMES` and its pending branch.
  - Add `Double` to `Api`/`loadApi`.
  - Add probes for `returns`, `throws` and `resolves` that drive the exported Double in a run.
  - Update the header.
- `conformance/tests/xaravel/coverage-reports.test.ts:114`: expect no pending Double lines.
- `conformance/escalations/ESC-4.8-1.md`: `trigger: contract`, with the items in Design Notes. Check it with `bun run escalations:check`.
- `stories/4.8.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml`: status.

**Acceptance Criteria:**
- **AC 1 (XT-mockery-7).**
  - Given the signed fixture for `4.8.jsonl` and the Upstream-used Double API, when XT-mockery-7 runs every matrix scenario, then every return value, thrown exception (short class and exact message), verify outcome and `assertTrue` count matches the PHP library's.
  - `bun run mockery:coverage` lists none of `returns`, `throws` and `resolves` as pending, and reports 0 missing.
  - `Symbol.for('xaravel.mockery.mock')` is not defined after `@xaravel/mockery` loads.
- AC 1 is met conditionally on ESC-4.8-1's ruling.

## Spec Change Log

- 2026-10-18, implementation: (a) "`Symbol.for(fqcn)`, for tokens" is read as: the class lookup (`xaravel.class.lookup`) answers an interface name with its contract token (`Symbol.for(fqcn)` or an AD-1 token object), so a name nothing resolves can throw the LogicException; recorded in ESC-4.8-1 item 1 (`support/classes.ts` `lookupContract`). (b) The run slot moved from `Mockery.ts` into `support/slots.ts`, shared by `Mockery.ts` and `Double.ts`, to keep `ContainerSlot` in one place without an import cycle; a run adopts the process slot's Double state as it adopts its container. (c) PHP's `Matcher` interface is an abstract class, so `with()` tells a matcher by `instanceof`; `Argument.type` also takes a contract token. (d) `Engine/ClassGenerator.ts`, `Engine/DoubleTarget.ts` (the reflected target) and `Engine/DoubleControlMethods.ts` were added beside the listed Engine classes. (e) The "mock taken" child case now checks that a foreign value at the retired `mock` slot is left alone and the load succeeds; the foreign-`run` cases were already there. (f) The fixture-free test mocks `XtFoo` first, where the removed hook call did, so the outside-run test's `Mockery_0_XtFoo` name is unchanged.

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 43 findings — high 0, medium 9, low 20, false 14, maybe-false 0 (E3/E15 and E5/E16 are the same claim filed twice; each pair shares a row)
- findings:
  - Blind Hunter
    - `[low]` `reject` `double-scenarios.ts` imports `runCounted` from assert's `src/` — test-only coupling; the import rule (`mockery.test.ts:240-251`) covers `src/` imports, and the tests already import assert's `tests/xaravel/oracle-values`.
    - `[low]` `patch` Status `done` before AC 1 is checked against a signed fixture — the signing flow follows the 4.6/4.7 precedent (CI signs on the PR, and a missing fixture fails). The local unsigned cross-check result is now recorded under Auto Run Result.
    - `[medium]` `patch` The LogicException safe-default branch and the no-lookup null are untested — TS-only checks added to XT-mockery-7.
    - `[medium]` `patch` Bare symbol tokens, class-name string targets, the `times({ count })` form and the invalid `override` message are never exercised — the bare-token and string-target tests were added with E1. The remaining forms are low and were left.
    - `[medium]` `patch` Untested run-protocol branches (Mockery close fails, ambiguous plus failing body, process-slot adoption) — grouped with VG1/VG2, fixture cases added.
    - `[low]` `patch` Adopting process-slot state can verify doubles enabled outside a run in the next run — this is the designed behaviour for bare `bun:test` hooks (VerifiesDoubles' `#[Before]` in a hook). It is now recorded in ESC-4.8-1 item 2 and pinned by fixture case (c).
    - `[low]` `patch` The DIV-6 clause omits `#private` under passthru, `passthru(real)`'s enumerable-only copy, accessors and built-in slots — ESC-4.8-1 item 3 extended. Grouped with E4.
    - `[low]` `reject` Passthru on an intersection double throws PassthruAutoInstantiation naming the first interface, where PHP throws a ReflectionException — no Upstream use; unlikely, and a fix needs a new branch.
    - `[low]` `patch` `PredicateMatcher.phpBool` treats NaN as false, but PHP's `(bool) NAN` is true — corrected.
    - `[false]` `reject` `getDebugType` is a new copy of PHP value semantics — `@xaravel/assert` exports no `get_debug_type`, so nothing is duplicated; it lives in mockery's one value layer (`support/values.ts`).
    - `[low]` `reject` `throws('x')`, `resolves(non-callable)` and `times(NaN)` are not type-checked as PHP's signatures would be — unlikely in ported tests, and the fix adds guards.
    - `[medium]` `patch` No negative test shows the new coverage probes catch a broken Double — grouped with VG3.
    - `[low]` `patch` The README overstates when `verifyAll()` runs — corrected.
    - `[medium]` `patch` No multi-byte string checks the strlen threshold or StringDiffer's code-point split against PHP — two non-ASCII scenarios added and the request regenerated.
    - `[low]` `patch` Uneven freezing: plain exceptions and Engine classes are unfrozen though thrown instances expose prototypes — the whole Double graph is now frozen.
    - `[low]` `reject` `Double.for` typings lack token and multi-target overloads, and the options overload drops target methods — compile-time only; ported calls fall back to `any` and work.
  - Edge Case Hunter
    - `[medium]` `patch` E1: `ensureMethod` adds a bare-token interceptor to the shared cached prototype, which makes results order-dependent — fixed with per-double prototypes, and a test was added.
    - `[low]` `reject` E2: an unconfigured method on a bare-symbol double throws TypeError — a bare symbol has no method list (ESC-4.7-1 item 5); the fix is a Proxy, which adds complexity.
    - `[low]` `patch` E3/E15: a token object without an FQCN static gets the name `''`, contrary to its header — falls back to the brand description, else InvalidDoubleTargetException.
    - `[low]` `patch` E4: passthru on a class with `#private` fields throws TypeError — documented in ESC-4.8-1 item 3, grouped with B7.
    - `[low]` `reject` E5/E16: `passthru(real)` on an intersection checks only the first interface — PHP passes the `I1&I2` target, which no Upstream test reaches; unlikely.
    - `[false]` `reject` E6: `strict()` then `passthru(real)` copies fields before throwing — PHP's `Double::passthru` (549-561) also copies state before `configurePassthru()` throws.
    - `[low]` `reject` E7: an unknown options key is ignored — unlikely, and the fix adds a guard.
    - `[low]` `reject` E8: a plain-object real instance is taken as options — PHP has no class-less objects, so a ported target is always a class instance.
    - `[false]` `reject` E9: a second `enableAutoVerify()` drops pending doubles — PHP does the same (`Double.php:350-355` resets `$pending`).
    - `[false]` `reject` E10: the first failing double leaves the rest unverified — PHP's `verifyAll` (386-411) drains and then throws at the first failure too.
    - `[low]` `reject` E11: `times()` accepts negative or NaN bounds — unlikely, and the fix adds guards.
    - `[false]` `reject` E12: `with([1,2])` and `with([3,4])` are reported as ambiguous — PHP keys ambiguity by `describeArguments()` too (`DoubleState.php:278-312`), so this is faithful.
    - `[false]` `reject` E13: a safe default whose class has a reserved verb throws ReservedNameCollision — PHP's `SafeDefaultResolver` calls `Double::fabricate($name, $depth + 1)` without override, so it throws the same.
    - `[low]` `reject` E14: `Argument.type(<bare symbol>)` never matches — no Upstream use (they pass classes); the fix adds a branch.
  - Verification Gap
    - `[medium]` `patch` VG1: the run's "first error wins" and Mockery-close-failure branch are unpinned — fixture cases (a) and (b) added.
    - `[medium]` `patch` VG2: process-slot adoption of Double state is unpinned — fixture case (c) added.
    - `[medium]` `patch` VG3: the coverage probes are never shown to fail on a broken Double — XT-conformance-183's stub now also breaks the three verbs and expects the `missing` lines.
    - `[false]` `reject` VG-other: XT-mockery-7 fails locally for want of the signed fixture — by design (Story 4.6/4.7 precedent): CI's `oracle.yml#story` signs it on the PR, and a missing fixture fails rather than skips.
  - Intent Alignment
    - `[false]` `reject` I1: the twins are tested instead of the Upstream call sites — a grader Story (`test_ids: []`); the Upstream tests are ported by their Components' Stories (Story 4.7 I1 precedent).
    - `[false]` `reject` I2: the scope goes beyond the three verbs — the AC asks that "the Upstream suites' uses" behave as PHP does, and those uses are whole call chains.
    - `[false]` `reject` I3: nothing installs `xaravel.api.signature` outside the test — by design, raised as ESC-4.8-1 item 1 with a proposed owner, and AC 1 is conditional on it.
    - `[false]` `reject` I4: the coverage probes are thin — grouped with VG3, which strengthens them. Parity rests on XT-mockery-7 by design.
    - `[false]` `reject` I5: the Oracle evidence is not in the tree — same as VG-other.
    - `[false]` `reject` I6: the hook removal follows an unruled proposal — the intent names it, and it follows the ruled `decisions/ESC-4.4-2.md` item 6 (`createMock` no longer delegates). The unused hook has no reader.
    - `[false]` `reject` I7: paths outside `packages/mockery/**` — the AC requires the coverage tool change, and the MAINT ruling's second amendment allows any path for Epic 1–8 Stories.

## Design Notes

**ESC-4.8-1 items.** Each item names an owner.
1. **The return-type lookup protocol.** `xaravel.api.signature`, with the row shape of `conformance/api-surface`. The proposed owner is Story 5.3's harness, which installs it from the committed surface. Without it, every safe default is null, which is correct only for untyped methods.
2. **VerifiesDoubles wiring.** A ported TestCase or Pest `use(VerifiesDoubles)` calls `Double.enableAutoVerify()` before `setUp` and `beforeEach`. The `#[After]` half runs inside the Mockery run protocol, after Mockery's close. The proposed owners are Epic 57's testing TestCase and the ai/mcp/boost TestCase ports.
3. **DIV-6 php-only (doubles).** No `final`, visibility or reflection, so every prototype method is configurable. Fields need no initializer (ESC-4.7-1 item 2 applies). FinalBypass is not ported.
4. **Out-of-scope API.** `received`, `unused`, `verify`, `ordered`, `listen`, `bypassFinals` and the unused matchers have no Upstream use. They are ported by the first Story whose tests need them, and a coverage scan of `JMac` names must show it.

**Counting.** `registerPass` is `Assert::assertTrue(true)`, an outermost `Assert` call, so the Inventory records it as an `assertTrue` kind. That is why the port records `assertTrue`, not a kind-less count.

## Verification

**Commands:**
- `bun test packages/mockery conformance/tests/xaravel/coverage-reports.test.ts` -- expected: all pass. XT-mockery-7 needs the signed fixture: CI signs it on the PR. Locally, run the comparison against an unsigned local Oracle run of `4.8.jsonl` (`XARAVEL_DOUBLE_SRC=/tmp/xaravel-inv/ai/vendor/jasonmccreary/double/src`, against `/tmp/xaravel-inv/framework`, in a throwaway copy outside the repo).
- `bun run mockery:coverage` -- expected: 0 missing, 0 pending.
- `bun run oracle:story check 4.8`, `bun run escalations:check`, `bun run typecheck`, `bun run lint`, `bun test` -- expected: success.

## Auto Run Result

Status: done (AC 1 conditional on the ESC-4.8-1 ruling; XT-mockery-7's cell comparison waits for CI to sign `4.8.jsonl`'s fixture on the PR).

**Summary.** `@xaravel/mockery` now ports the Upstream-used subset of `jasonmccreary/double` v1.0.1 under `src/JMac/Testing/**`:
- `Double`, `OverriddenDouble` and `Argument`;
- the Engine, the matchers, the exceptions (both variants) and the diagnostics, with byte-identical messages;
- return-type safe defaults read through the proposed `xaravel.api.signature` lookup;
- VerifiesDoubles' `#[After]` wired into the Mockery run protocol, with the first error winning.

`mockery:coverage` now probes `returns`, `throws` and `resolves` (45/45 implemented, 0 pending). The unused `xaravel.mockery.mock` hook is removed (ESC-4.7-1 item 4).

**Files changed.**
- `packages/mockery/src/JMac/Testing/**`: the port, plus Double's MIT `LICENSE` copied verbatim.
- `packages/mockery/src/Mockery.ts`: the hook is removed, and the run gains the Double `#[After]` step.
- `src/support/slots.ts`: the shared run slot.
- `src/support/{classes,values}.ts`: `lookupContract` and `getDebugType`.
- `src/index.ts`: the exports and the freeze list.
- `README.md`: the Double paragraph.
- `tests/xaravel/{mockery.test.ts,scenarios.ts,double-scenarios.ts,fixtures/double.fixture.ts}`: XT-mockery-7 (68 Oracle scenarios, TS-only checks and a child fixture), the hook checks, the export list, and XT-mockery-6 at 0 pending.
- `tools/mockery-coverage/coverage.ts`: Double probes.
- `conformance/tests/xaravel/coverage-reports.test.ts`: 0 pending, and broken Double verbs are reported missing.
- `conformance/oracle-requests/4.8.jsonl`: one `php-expr` request.
- `conformance/escalations/ESC-4.8-1.md`: four contract items.
- `stories/4.8.md` and `sprint-status.yaml`: status.

**Review findings.** 43 findings: 9 medium, 20 low, 14 false.
- Patched: 9 medium entries (VG1-3, B3, B4/E1, B5, B11, B13) and 8 low ones (B2, B6, B7/E4, phpBool NaN, README, freezing, E3/E15).
- Deferred: none.
- Rejected: the lows that are unlikely and need new guards (B1, B8, B10, B15, E2, E5/E16, E7, E8, E11, E14), and every `false` row, each refuted in the triage log. E6, E9, E10, E12 and E13 were refuted against the PHP source.

**Follow-up review: recommended.** 9 medium entries were patched. The specific unverified risk is the patched run-protocol error ordering and the per-double prototypes for bare tokens, which no reviewer has re-read since the patch.

**Verification.**
- `typecheck`, `lint`, `graph:check`, `oracle:story check 4.8`, `escalations:check` and `mockery:coverage` (45/45, 0 pending, 0 missing) all pass.
- Full `bun test`: 157 pass, 1 fail. The failure is XT-mockery-7's `missing signed fixture`, which is expected until CI signs it.
- Local cross-check, in a throwaway copy outside the repo with the PHP 8.5 framework snapshot plus Double from `/tmp/xaravel-inv/ai/vendor`, unsigned output signed with a throwaway key:
  - 68 scenarios, 0 mismatches.
  - Two identical evaluation runs.
  - A deliberately broken message template was caught.
  - `conformance/oracle/oracle.pub` was never touched.

**Residual risks.**
- In the image, the Oracle loads Double from `/oracle/upstream/ai/vendor/jasonmccreary/double/src`. That path has only been checked through the Dockerfile layout, not in a live run.
- Safe defaults depend on ESC-4.8-1 item 1's lookup, which nothing installs yet.
- An unconfigured call to a bare-symbol double throws a TypeError.
