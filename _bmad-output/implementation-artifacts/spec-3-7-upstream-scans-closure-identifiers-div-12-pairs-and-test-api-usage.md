---
title: 'Story 3.7: Upstream scans: closure identifiers, DIV-12 pairs and test-API usage'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: '7cdba750773158ca0781d5e335abd9b11bd7124d'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
  - 'stories/3.7.md'
  - 'docs/ops/scans.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The closure codec (AD-14) needs the facade and helper names it may allow. `PORTING.md` (AD-7, AD-26) needs every Upstream property/method name pair. The grader coverage reports (Stories 4.4 and 4.6, FR-116, FR-100) need every PHPUnit assertion and Mockery method the Upstream suites use. None of this is committed data yet.

**Approach:** Three static TypeScript scans, built on Story 3.6's lexer and index in `tools/scans/php.ts` and its shared CLI (`runScan`). They read only `conformance/upstream/`, plus the committed Inventory for assertion execution counts. No PHP, no Docker. `bun run scan:closures`, `scan:div12` and `scan:test-api` write their files under `conformance/scans/`. Each has `--check`, which CI runs after the snapshot sync.

## Boundaries & Constraints

**Always:**
- **Sources.** "The four repositories" means `UPSTREAM_REPOS` under `conformance/upstream/`. Their `src/` trees are indexed with `buildIndex`. The suites are every `.php` file (not `.blade.php`) under each repository's `tests/`, parsed with `parseFile`, and walked in sorted order.
- **Closures** write `conformance/scans/allowed-identifiers.json`:
  - `facades`: the class short name (the last `\` segment) of every non-abstract indexed class whose `extends` chain reaches `Illuminate\Support\Facades\Facade`, excluding `Facade` itself. Two facades with the same short name fail the run, naming both FQCNs.
  - `helpers`: every global helper function name. That is each `function <name>(` declared in a `src/` file with no `namespace` statement, outside any class, interface, trait or enum body. Anonymous `function (`, `fn` and method declarations are not helpers. The names are deduplicated.
  - The file is `{"comment","facades","helpers"}`, in that key order, with 2-space indentation and one name per line. Both lists are sorted with `compareUnits`, and the file is LF-terminated.
- **DIV-12** writes `conformance/scans/div12-pairs.jsonl`:
  - For every indexed class, trait or enum D (not interfaces), its member set is its own methods and properties together with those of its indexed ancestors and of the traits they use, transitively. Promoted constructor properties count as properties.
  - A pair is a name N (case-sensitive) that is both a property and a method in D's member set. Each pair gives one line: `{"class","name","classification","property","method"}`. `property` and `method` are each `{"declaredIn","static"}`, where `declaredIn` is the FQCN of the declaration that declares the member, nearest first: D, then its traits, then its ancestors in order.
  - `classification`, first match wins (ESC-3.7-1):
    - **Model hierarchy.** D is `Illuminate\Database\Eloquent\Model`, a class whose chain reaches it, or a trait in Model's transitive trait set (its own and its ancestors'). Then N = `casts` is `option-pair` (AD-7), and every other N is `model-config`.
    - `option-pair`: N is an option name and D is an option holder.
      - An option name is one of AD-26's named option pairs (`casts`, `middleware`, `backoff`, `tries`, `timeout`, `uniqueId`, `uniqueFor`, `retryUntil`, `attachments`, `envelope`, `content`, `via`, `broadcastOn`), or a name read somewhere in the `src/` trees as `method_exists($v, 'N')` together with a property read `$v->N` (not followed by `(` or an assignment operator) on the same plain, non-`$this` variable `$v` in the same method body.
      - An option holder is a class or trait whose hierarchy (D, its indexed ancestors and the traits they use, transitively; for a trait, the trait and the traits it uses) implements `Illuminate\Contracts\Queue\ShouldQueue` or `Illuminate\Contracts\Broadcasting\ShouldBroadcast` (directly, or through an indexed interface that extends one), uses `Illuminate\Bus\Queueable`, or whose `extends` chain reaches `Illuminate\Mail\Mailable` or `Illuminate\Notifications\Notification`.
    - `method-plus-state`: otherwise.
  - Lines are sorted by `class`, then `name`, rendered with `renderJson` in that key order, LF-terminated.
- **Test API** writes two files.
  - `conformance/scans/phpunit-assertions.jsonl`, with one `{"name","calls","executions"}` line per name, sorted by name:
    - `calls` counts the PHPUnit call sites in the suites (ESC-3.7-1). N must match `assert[A-Z]…` or `expect[A-Z]…`, or be `fail`, `markTestSkipped` or `markTestIncomplete`. A call site is either:
      - `$this->N(`, `self::N(`, `static::N(` or `parent::N(` inside a suite class C, unless N is declared as a method, case-insensitively, in C's own indexed hierarchy: C, its ancestors and the traits they use, transitively, among the indexed declarations of the four repositories' `src/` and `tests/` trees. A declaration of N in an unrelated class does not exclude it.
      - `X::N(` where X resolves to `PHPUnit\Framework\Assert`, `PHPUnit\Framework\TestCase`, or an indexed class whose `extends` chain reaches `PHPUnit\Framework\Assert` (for example `Illuminate\Testing\Assert`).
    - Names are grouped case-insensitively. A name is written in the case of the Inventory kind that matches it case-insensitively; otherwise in the case of its first call site in walk order.
    - `executions` is the sum, over every `conformance/inventory/<component>.jsonl` (not `oracle-nondeterminism.jsonl`), of each line's `assertions[N]`. These are the PHPUnit `Assert` kinds that the Story 2.6 baseline recorded (FR-1).
    - A name is listed when either count is above 0. Names with `calls > 0` and `executions == 0` stay listed with `executions: 0` and are printed for review. Story 4.4's coverage report may exclude such a name only through an approved Escalation.
  - `conformance/scans/mockery-api.jsonl`, with one `{"name","static","count"}` line per Mockery method, sorted by name with `false` before `true`. `count` is the number of call sites in the suites:
    - Static: `X::N(` where X resolves to `Mockery`. Gives `static: true`.
    - Chain starters are E in {`shouldReceive`, `shouldNotReceive`, `shouldHaveReceived`, `shouldNotHaveReceived`, `shouldHaveBeenCalled`, `shouldNotHaveBeenCalled`, `shouldIgnoreMissing`, `shouldAllowMockingProtectedMethods`, `shouldAllowMockingMethod`, `shouldDeferMissing`, `makePartial`, `allows`, `expects`}.
    - A chain starts at `->E(`, or at a facade's `X::E(` where X resolves to an indexed class whose `extends` chain reaches `Illuminate\Support\Facades\Facade` (ESC-3.7-1). `allows` and `expects` with arguments start a chain only when their first argument token is a string literal or `[`. E itself counts, as `static: false`.
    - After an argument-less `shouldReceive()`, `shouldHaveReceived()`, `shouldNotHaveReceived()`, `allows()` or `expects()`, the next `->M(` is the mocked method: it is not counted, and the chain continues after its `)`.
    - After a static Mockery call's `)`, only a `->E(` with E a chain starter continues (and starts) a chain; any other `->M(` is not counted.
    - Every other `->M(` in a chain counts as `static: false`; argument lists are skipped with `matching`. The chain ends at the first token after a `)` that is not `->`.
- **CLI.** `tools/scans/closures.ts`, `div12.ts` and `test-api.ts` each export a `build…(root)` that returns the file texts, plus a `main(argv)` that uses `runScan` from `facades.ts` (`--root`, `--check`, `UsageError` exiting 2, exit 1 on failure, nothing written on failure, drift lines). `package.json` gains `scan:closures`, `scan:div12` and `scan:test-api`.
- **Determinism.** The output depends only on file contents: sorted walks, no timestamps, and no filesystem-order iteration.

**Never:** Do not edit the spine, SPEC, PRD, `epics.md`, `AGENTS.md`, `conformance/protected-paths`, `tools/protected-paths/` or `tools/ownership/`. Do not change the Story 3.6 outputs. Add no npm dependency. Do not run PHP or Docker. Do not build the closure codec, `PORTING.md` or the coverage reports (Epics 4, 8 and the closure Epic).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | snapshot at the Pin, committed Inventory | four files written | exit 0, counts printed |
| Duplicate facade short name | two facades named `Cache` in different namespaces | nothing written | exit 1, both FQCNs |
| Namespaced function | `namespace Foo; function bar()` | not a helper | none |
| Inherited pair | property in a parent, same-named method in a trait of the child | child listed with each `declaredIn` | none |
| Hierarchy-declared helper | `$this->assertFoo(` in a class whose indexed hierarchy (an ancestor or trait) declares `assertFoo` | not counted | none |
| Unrelated declaration | `$this->assertCount(` where only an unrelated `src/` class declares `assertCount` | counted | none |
| PHPUnit `Assert` subclass | `Assert::assertArraySubset(` with `Assert` resolving to an indexed class extending `PHPUnit\Framework\Assert` | counted | none |
| Never-executed name | `$this->assertFileContains(` with no Inventory kind | listed, `executions: 0`, printed | none |
| Lower-case call | `$this->assertequals(` with Inventory kind `assertEquals` | counted under `assertEquals` | none |
| Facade mock | `File::shouldReceive('x')->once()` | `shouldReceive`, `once` counted, `static: false` | none |
| Argument-less starter | `$spy->shouldHaveReceived()->foo()->once()` | `shouldHaveReceived`, `once` counted; `foo` not | none |
| Static Mockery call then method | `Mockery::mock(X::class)->foo()` | `mock` (static) counted; `foo` not | none |
| Helper-only assertion | kind only in the Inventory | listed, `calls: 0` | none |
| PHPUnit mock builder | `->expects($this->once())->method('x')` | not counted | none |
| `m` aliasing a non-Mockery class | `use Foo as m; m::create(` | not counted | none |
| Drift | committed file differs or is missing | drift lines | `--check` exits 1 |

</intent-contract>

## Code Map

- `tools/scans/php.ts:79,319,397,646,805,824,841` -- `tokenize`, `resolveName`, `matching`, `parseFile` (it gives tokens and declarations for any file, including tests), `buildIndex` (`src/` only), `ancestors` and `extendsChainReaches`. `Declaration` has `methods`/`properties` with `static`, plus `traits`, `extends`, `scope` and `tokens`. `phpFiles` (private, line 787) is the sorted walk; export it or mirror it.
- `tools/scans/facades.ts:223-333` -- `UsageError`, `parseScanOptions`, `driftLines`, `writeFiles` and `runScan(scan, argv, usage, build)`, where `build` returns `{files, summary, notes}`. Reuse these. `FACADE_BASE` is at line 33.
- `tools/scans/singletons.ts:1058` -- `renderSingletons`, the hand-rendered JSON model for `allowed-identifiers.json`.
- `tools/oracle/request.ts:94,137` -- `compareUnits` and `renderJson`.
- `tools/inventory/inventory.ts:64` -- `NONDETERMINISM_FILE`. Inventory lines carry `assertions: {assert*: n}`.
- Upstream facts at the Pin (probed):
  - The helpers are in the global-namespace files `Foundation/helpers.php`, `Support/helpers.php`, `Collections/helpers.php` and `Reflection/helpers.php`, each wrapped in `if (! function_exists(…))`.
  - The facades outside `Support/Facades` are `ai/src/Ai.php`, `boost/src/Boost.php` and `mcp/src/Facades/Mcp.php`.
  - The Inventory has 57 assertion kinds. Static `$this->`/`self::`/`static::` `assert*` calls give about 116 names before the `src`/`tests` exclusion. `assertEqualsIgnoringCase`, `assertNotTrue` and `assertSameSize` are executed only through helpers.
  - About 230 test files import Mockery (epics.md says 226). `->expects('` appears 3195 times and `->expects($` 436 times (mostly PHPUnit). `m::create(` and `m::isFirstPartyPackage(` come from an `m` alias of another class.
  - `method_exists(…, 'N')` names include `backoff`, `retryUntil`, `middleware`, `uniqueId`, `uniqueFor`, `tries`, `timeout` and `envelope`.
- `.github/workflows/ci.yml:109-114` -- the `upstream` job's scan steps. Append the three `--check` steps, then make the existing test step run both `scans.test.ts` and the new test file.
- `conformance/tests/xaravel/upstream.test.ts:181-187` -- the exact step list. Update it.
- `conformance/tests/xaravel/scans.test.ts` -- the test model: temp root with a mini snapshot (`writeFile` helpers), the real snapshot guarded by `existsSync`, and protected-paths/CODEOWNERS assertions (XT-85).

## Tasks & Acceptance

**Execution:**
- `tools/scans/closures.ts` -- `buildClosures(root)` and the CLI.
- `tools/scans/div12.ts` -- `buildDiv12(root)` and the CLI.
- `tools/scans/test-api.ts` -- `buildTestApi(root)`, which returns both files, and the CLI.
- `tools/scans/php.ts` -- export `phpFiles` if it is needed. No behaviour change.
- `package.json` -- the three `scan:*` scripts (`bun tools/scans/<name>.ts`).
- `conformance/scans/allowed-identifiers.json`, `div12-pairs.jsonl`, `phpunit-assertions.jsonl`, `mockery-api.jsonl` -- generated from the local snapshot.
- `.github/workflows/ci.yml` and `conformance/tests/xaravel/upstream.test.ts` -- the CI steps described in the Code Map.
- `conformance/tests/xaravel/usage-scans.test.ts`:
  - XT-conformance-86: a mini snapshot with two facades (one outside `Support/Facades`), an abstract facade subclass, a global helpers file holding a guarded function and a method-bearing class, and a namespaced function file. It asserts the exact file and the duplicate-short-name failure. On the real snapshot, the committed file equals `buildClosures`, and its lists include `Cache`, `Route`, `Ai`, `Mcp`, `app`, `collect` and `str`.
  - XT-conformance-87: a mini snapshot with an own pair, a trait pair, an inherited pair, a static pair, a Model subclass and trait (with a `casts` pair and another pair), an option holder (a `ShouldQueue` job with an AD-26 name pair and a `method_exists` option-name pair), the same names on a non-holder class, and a `method_exists` read on `$this` (which does not make an option name). It asserts the exact lines and that two runs are byte-identical. On the real snapshot, the committed file equals `buildDiv12`, and the spine's anchors hold: `Illuminate\Database\Eloquent\Model`/`casts` is option-pair, `Model`/`connection` is model-config, and `Illuminate\Database\Query\Builder`/`timeout` is method-plus-state.
  - XT-conformance-88: a mini snapshot with test files covering `$this->assertSame(`, `self::assertTrue(`, `PHPUnit::assertArraySubset(` via a `use` alias, `static::` and `parent::` calls, `Assert::assertX(` on an indexed `PHPUnit\Framework\Assert` subclass, an `assertCount` declared only by an unrelated `src/` class (counted), a helper `assertFoo` declared in the calling class's indexed parent or trait (not counted), a never-executed name (listed with `executions: 0`), a lower-case call grouped under its Inventory kind's case, `fail(`, `markTestSkipped(`, `expectException(`, a Mockery chain with closure arguments, `m::mock`/`Mockery::on`, `Mockery::mock(X::class)->foo()` (`foo` not counted), `->expects('x')->once()`, `->expects($this->once())`, an argument-less `shouldHaveReceived()->foo()->once()` and `allows()->foo()->andReturn(`, a facade `File::shouldReceive(` chain, and an `m` alias of a non-Mockery class. A temp Inventory supplies one kind found only there. It asserts both files exactly. On the real snapshot, the committed files equal `buildTestApi`, every Inventory kind is listed, `assertCount` has at least 1000 calls, `fail` is listed, and `shouldReceive`, `once`, `andReturn` and static `mock` are present.
  - The three outputs are Protected and owned by `@edanisko` (same matcher as XT-85).
- `docs/ops/scans.md` -- document the three scans: commands, formats, rules, CI and regeneration.
- `stories/3.7.md` -- set `status: done` at completion.

**Acceptance Criteria:**
- Given the snapshot, when `bun run scan:closures` runs, then it writes `allowed-identifiers.json`, listing every facade short name and global helper function name at the Pin.
- Given the snapshot, when `bun run scan:div12` runs, then it writes `conformance/scans/div12-pairs.jsonl`, listing every class where a property and a method share a name, classified as model-config, option-pair or method-plus-state.
- Given the snapshot, when `bun run scan:test-api` runs, then it writes `conformance/scans/phpunit-assertions.jsonl` and `conformance/scans/mockery-api.jsonl`, listing every assertion and every Mockery method used by the Upstream suites, each with a usage count.

## Spec Change Log

### 2026-10-18 — ESC-3.7-1 ruling (approved, option 1)
- trigger: the first run halted as an intent gap on three rules (review groups A, B and C below); `decisions/ESC-3.7-1.md` approved option 1.
- amended: the Boundaries' DIV-12 classification, PHPUnit call-site rule and Mockery chain rule, exactly as the ruling states; I/O matrix rows for the new cases; the XT-87 and XT-88 task descriptions (spine anchors, `assertCount`/`fail` replace "`assertDatabaseHas` is absent", which the hierarchy rule no longer guarantees); the Design Notes' option-pair note.
- known-bad state avoided: `assertCount` with 0 calls; `count`/`user` as option pairs while `timeout`/`uniqueFor` are not; facade mocks missing and mocked methods counted as Mockery API.
- KEEP: AC 1 (`allowed-identifiers.json`) and the CLI, determinism and file formats are unchanged. The rebuild starts from the saved attempt patch, which this run applies and deletes.

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 32 findings — high 4, medium 9, low 11, false 4, maybe-false 4
- note: the review diff left out the generated `conformance/scans/div12-pairs.jsonl` (1516 lines) for size. The intent-alignment layer read it from the working tree.
- outcome: three groups are rooted in rules inside the `<intent-contract>`, so they route to **intent_gap** and every lower entry is moot. (A) is the PHPUnit call-site exclusion, (B) the DIV-12 option-pair rule, and (C) the Mockery chain rule. The attempted change is saved as [spec-3-7-attempt.patch](spec-3-7-attempt.patch). It excludes the four generated outputs; regenerate them with the three `scan:*` commands. The code was reverted. The questions are filed as `conformance/escalations/ESC-3.7-1.md`.
- findings (blind layer):
  - `[high]` `[intent_gap]` (A) `calls` drops any name a `src/` class declares, so `assertCount` has 0 calls against 1741 `$this->assertCount(` sites. `assertEmpty` and `assertJson` are the same. Verified by grep. The root cause is the exclusion rule in the contract.
  - `[medium]` `[intent_gap]` (A) Names that are not PHPUnit's (`assertFileContains`, 103 calls; `assertFilenameExists` and others, from Testbench) are committed with 0 executions, and nothing can act on the review print. Same rule; ESC-3.7-1 routes them to Story 4.4's Escalation path.
  - `[medium]` `[intent_gap]` (C) The chain counts the mocked method after an argument-less `shouldHaveReceived()` (`getQueueableId`, verified in mockery-api.jsonl). Chain rule.
  - `[medium]` `[intent_gap]` (C) An argument-less `allows()`/`expects()` is rejected, and its chain is lost. Chain rule.
  - `[high]` `[intent_gap]` (B) `option-pair` matches by name across `src/`. Verified: `count`, `user`, `from`, `locale`, `view` and `as` are option-pair. (`Model`/`casts` as option-pair is correct per AD-7.) Option-pair rule.
  - `[medium]` `[intent_gap]` (B) The real-snapshot DIV-12 check asserts only that the three classifications occur, with no spine anchors. Part of B's fix (ESC-3.7-1 adds anchors).
  - `[low]` `[reject]` div12-pairs.jsonl is missing from the diff. It was omitted on purpose for size; `--check` pins it.
  - `[medium]` `[intent_gap]` (A) `fail` (312 sites) and `markTestSkipped` (56), which are PHPUnit `Assert` methods, are not listed. The `assert|expect` name rule is in the contract. `createMock` is Story 4.4's delegation, not an assertion.
  - `[low]` `[intent_gap]` (A/C) XT-88 lacks `static::`, `parent::`, `TestCase::`, argument-less chain and case cases. Moot under the rebuild.
  - `[false]` `[reject]` `stories/3.7.md` is `done` while the spec is in review. That is the build's normal order: the manifest is set at finalization, and this run reverted it.
  - `[low]` `[reject]` `inventoryExecutions` re-parses the Inventory with weaker validation. Inventory `check` already validates the committed files; reusing its reader is a refactor.
  - `[false]` `[reject]` `new readonly class` in a helpers file. Verified at Story 3.6: there is no `new readonly|final class` in the four `src/` trees, and the helpers files hold none.
  - `[low]` `[reject]` Docs grammar ("tell" → "tells"). Moot: the docs are reverted with the attempt.
- findings (edge-case layer):
  - `[medium]` `[intent_gap]` (A) `Illuminate\Testing\Assert::assertX(` (a PHPUnit `Assert` subclass) is not counted (about 21 sites). Contract rule.
  - `[maybe-false]` `[intent_gap]` (A) Case variants such as `assertequals(` would split lines. Settle by grepping the suites for lowercase `assert` calls; ESC-3.7-1 canonicalizes the case.
  - `[medium]` `[intent_gap]` (C) Mocked-class methods are counted after a static `Mockery::` call or `shouldHaveReceived()`. Same as the blind row.
  - `[low]` `[intent_gap]` (B) `$this->N[] = x`, `++` or `unset` are taken as reads in the option test. Moot under B's new rule (non-`$this` receiver with `method_exists`).
  - `[maybe-false]` `[intent_gap]` (B) `?->` reads are missed. Settle by grepping `src/` for `?->N ??`. Moot under B.
  - `[false]` `[reject]` `new readonly class` in a helpers file. Same as the blind row.
  - `[maybe-false]` `[reject]` `namespace { … }` global blocks hide helpers. Settle by grepping `src/` for `namespace {`; at the Pin all four helper files have no namespace statement and the counts matched (99 = 64+23+10+2). Low if true.
  - `[low]` `[reject]` An Inventory line without `assertions`, or a JSON `null`, gives an unclear error. The Inventory schema always writes the key, and the run still exits 1.
  - `[false]` `[reject]` A kind with 0 executions and no calls fails the real-snapshot test. The Inventory check rejects counts below 1, so a listed kind always has executions above 0.
  - `[high]` `[intent_gap]` (A, claim) The usage count is wrong for re-declared names, and a never-executed one would be missing entirely. Same as the first blind row.
  - `[medium]` `[intent_gap]` (C, claim) `getQueueableId` is not Mockery API. Same group.
- findings (verification-gap layer):
  - (no gaps)
  - `[medium]` `[intent_gap]` (C) Facade chains such as `File::shouldReceive(` (86 sites) and `DB::shouldReceive(` (43) are not counted. Verified by grep. Chain rule.
  - `[low]` `[reject]` The CI header comment is stale. Moot: ci.yml is reverted with the attempt; the rebuild updates it.
  - `[low]` `[reject]` div12-pairs.jsonl is not in the diff. Same as the blind row.
- findings (intent-alignment layer):
  - `[maybe-false]` `[reject]` `Str`, `Arr` and other non-facade aliases, and namespaced functions, are not allowed identifiers. AD-14 and the AC say "facade or helper"; spine line 115 puts Support helpers in `@xaravel/<component>/helpers`. If the closure Epic needs aliases, that is its ruling. Low if true.
  - `[high]` `[intent_gap]` (B) The classification diverges from AD-26/AD-7 (`timeout`, `uniqueFor` method-plus-state; model-config by class, not by AD-7's list). Group B.
  - `[low]` `[intent_gap]` (A) Assertion `calls` and non-PHPUnit names. Group A.
  - `[low]` `[intent_gap]` (C) The Mockery list drifts toward "any method in a Mockery context". Group C.
  - `[low]` `[reject]` The real-snapshot tests are mostly self-consistency. Each Story's anchors are part of the rebuild; the Inventory cross-check is the independent oracle for A.

### 2026-10-18 — Review pass (rebuild after ESC-3.7-1)
- verdicts: 31 findings — high 0, medium 8, low 19, false 3, maybe-false 1
- note: the review diff again left out `conformance/scans/div12-pairs.jsonl` (1516 lines) for size; the intent-alignment layer read it from the working tree, and `scan:div12 --check` pins it.
- findings (blind layer):
  - `[false]` `[reject]` `stories/3.7.md` is `done` while the spec is in review. That is the build's normal order: the manifest is set with the Story's completion in the same PR.
  - `[medium]` `[reject]` Testbench and Laravel helpers (`assertDatabaseHas`, `assertFileContains`, `assertFilenameExists`, …) are listed as PHPUnit assertions, because suite hierarchies leave the index through the unindexed `Orchestra\Testbench\TestCase`. Real, but it is the outcome ESC-3.7-1 chose: such names stay listed with `executions: 0`, are printed, and Story 4.4 may exclude them only through an Escalation. Changing it means editing the ruled contract.
  - `[low]` `[reject]` The review print is mostly `expect*`, `fail` and `markTest*`, which are never Inventory kinds. ESC-3.7-1 includes these names and requires the print; changing it edits the contract.
  - `[low]` `[patch]` `calls` and `executions` measure different things (`assertThat` 1 call, 3103 executions), and nothing says so. Patched: `docs/ops/scans.md` now explains that executions include indirect `Assert` calls.
  - `[low]` `[reject]` `ASSERTION` is case-sensitive, so a mis-cased call with no Inventory kind is missed. A grep of the suites finds only `->assertempty(`, which matches the `assertEmpty` kind and is counted; the doc's naming rule is fixed under the verification-gap row below.
  - `[medium]` `[patch]` Mockery names were case-sensitive: `andreturn` (2) was a separate line from `andReturn` (2646), one method split in two. That contradicts "one line per Mockery method", since PHP method names are case-insensitive. Patched: `fileUsage` keys Mockery by lowercased name and spells each one as its first call site, as the PHPUnit fallback does. Now `andReturn` has 2648 and there are 45 methods. XT-88 covers it with `->andreturn(2)`.
  - `[low]` `[reject]` Facade names (`Date`, `URL`, `Request`, `Event`, `File`) collide with ECMAScript/Bun globals. The AC lists facade and helper names only. How the codec resolves a collision is the closure Epic's decision (the Never list excludes the codec).
  - `[low]` `[reject]` `Mailable`, `Notification` and the `Queueable` trait are not option holders themselves. At the Pin none of their pairs is an option name (`bcc`, `locale`, `delay`, …), so the output is unaffected. Whether "reaches" includes the base is a rule reading that the ruling leaves open.
  - `[medium]` `[patch]` XT-87 lacked the `Queueable`, `Mailable`, `Notification` and `ShouldBroadcast` holder routes. Patched: fixtures `QueueableJob`, `QueuedTrait` (trait-level), `Welcome`, `Invoice` and `Shipped`, each with an AD-26 pair expected as `option-pair`. Deleting the trait route or `ShouldBroadcast` now fails the test (mutation checked).
  - `[low]` `[reject]` `combinedIndex` keeps the first declaration of a duplicate FQCN. Checked: switching to last-wins gives byte-identical output at the Pin. Detecting duplicates adds a branch for a case not met in practice.
  - `[low]` `[reject]` Untested edges: `--check` on a missing closures/test-api file, empty-list rendering, `markTestIncomplete`, `shouldNotReceive`, `expects([…])`, and `new readonly class`. The div12 missing-file path shares `runScan`. No `new readonly|final class` exists in the four `src/` trees (verified at Story 3.6). Adding tests here is not a defect fix.
  - `[low]` `[reject]` `phpunit-assertions.jsonl` can drift after an Inventory regeneration until the `upstream` job runs. That job runs `scan:test-api --check` on every PR, and the regeneration note in `docs/ops/scans.md` covers it.
- findings (edge-case layer):
  - `[medium]` `[patch]` Mockery case variants split lines. Same root cause and fix as the blind row.
  - `[low]` `[reject]` `X::assertY(` where X is an indexed subclass of the unindexed `PHPUnit\Framework\TestCase` is not counted. A grep of the suites finds no `…TestCase::assert…(` site at the Pin.
  - `[maybe-false]` `[reject]` `$this->assertX(` inside an anonymous class in a test class is judged against the outer class. Settle it by grepping the suites for `new class` bodies that call `$this->assert`. Low if true.
  - `[low]` `[reject]` `combinedIndex` first-wins. Same as the blind row: output identical at the Pin.
  - `[low]` `[reject]` A non-object Inventory line gives a raw TypeError. Inventory `check` validates the committed files, and the run still exits 1. (carried from the first review)
  - `[low]` `[reject]` `namespace { … }` global blocks hide helpers. At the Pin the helper files have no namespace statement, and the counts match (99). (carried)
  - `[low]` `[reject]` Mailable/Notification base not a holder. Same as the blind row.
  - `[false]` `[reject]` `\mockery::` in another case skips static calls. The suites have no lower-case `mockery::` reference (grep).
  - `[medium]` `[patch]` (claim) `mockery-api.jsonl` lists `andreturn` apart from `andReturn`. Same root cause and fix as the blind row.
- findings (verification-gap layer):
  - `[medium]` `[patch]` Three option-holder routes were unverified (mutation-demonstrated). Same fix as the blind XT-87 row.
  - `[medium]` `[patch]` Spelling a name as its Inventory kind was unverified, because `parent::assertEquals` came before `$this->assertequals` in the fixture. Patched: the lower-case call site now comes first. Replacing `kinds.get(lower) ?? site.name` with `site.name` now fails XT-88 (mutation checked).
  - `[low]` `[patch]` The `kinds.has(lower)` naming clause was undocumented. Patched: the ops doc's **Names** bullet states it. It is what makes the matrix's lower-case row work.
  - `[low]` `[patch]` The `ci.yml` header comment listed only Story 3.6's scan outputs. Patched: it now names Story 3.7's four outputs and `usage-scans.test.ts`.
  - `[low]` `[reject]` `div12-pairs.jsonl` is not in the diff. It was omitted for size; `--check` pins it byte for byte.
- findings (intent-alignment layer):
  - `[low]` `[reject]` Non-PHPUnit helpers in the assertion file (descriptive). Same as the blind Testbench row: ruled by ESC-3.7-1.
  - `[low]` `[reject]` Only 13 option pairs at the Pin (descriptive). This is the ruled holder × name rule: framework `src/` rarely declares both members of an AD-26 name on one holder class.
  - `[low]` `[patch]` `isAssertionName` accepts Inventory-kind matches beyond the rule text. It is needed for the matrix's lower-case row, and it is now documented (same patch as the verification-gap row).
  - `[false]` `[reject]` Nested Mockery chains inside argument lists are counted on their own. That is reading (a) of "argument lists are skipped with `matching`", and it is documented. A chain inside `with(…)` is real Mockery usage.
  - `[medium]` `[patch]` Mockery names are case-sensitive. Same root cause and fix as the blind row.

## Design Notes

- **Path.** The epic names only `allowed-identifiers.json`. It goes in `conformance/scans/` beside the other scan outputs, which are Protected under `/conformance/`, as AD-14 requires.
- **Facades, not aliases.** `Str`, `Arr` and the other non-facade default aliases are not facades, so they are not listed. The AC lists facades and helpers only.
- **Two counts for assertions.** FR-116 says the assertion list comes from "a scan run with FR-1". The Inventory's baseline kinds are exactly PHPUnit `Assert` methods, including those reached through `TestResponse` and Pest `expect()`, but they miss tests skipped at the baseline and `expectException*`. Static call sites cover those. Static names that never ran are printed, because a suite-vendor helper (for example Testbench) could pass the `src`/`tests` exclusion.
- **Option pair.** AD-26 defines an option pair as one the framework reads with "call if function, else value". ESC-3.7-1 limits it to option names on option holders (queued, broadcast, mailable and notification classes), with AD-26's named pairs plus names Upstream reads with `method_exists($v, 'N')` and `$v->N` on one non-`$this` variable. In the Model hierarchy only `casts` is an option pair (AD-7).

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/usage-scans.test.ts conformance/tests/xaravel/scans.test.ts conformance/tests/xaravel/upstream.test.ts` -- pass, with the real-snapshot parts running.
- `bun run scan:closures && bun run scan:div12 && bun run scan:test-api`, then each with `--check` -- exit 0.
- `bun test`, `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `bun run ownership:check`, `bun run protected-paths:codeowners` -- clean.

## Auto Run Result

Run 2026-10-18. Status: blocked.

Blocking condition: intent gap. Three rules in the `<intent-contract>` give outputs that contradict the Story's AC and AD-26/AD-7. The questions are filed as `conformance/escalations/ESC-3.7-1.md`.

1. **PHPUnit call sites.** Should a name be excluded only when the calling test class's own hierarchy declares it, rather than when any `src/` class does? Under the current rule `assertCount` shows 0 calls against 1741 sites. Should `Illuminate\Testing\Assert::` calls and `fail`/`markTestSkipped` count?
2. **DIV-12 option pairs.** Which classes and names are option pairs? The name-wide rule makes `count`, `user` and `from` option pairs and misses AD-26's `timeout` and `uniqueFor`.
3. **Mockery chains.** Should facade `X::shouldReceive(` chains count, and how are argument-less starters (`shouldHaveReceived()->foo()`) handled?

- **Attempt.** The three scans were built and verified as the contract specifies:
  - `tools/scans/closures.ts`, `div12.ts` and `test-api.ts`;
  - `phpFiles`, `parseUse` and `codeIndexes` exported from `php.ts`;
  - the `scan:*` scripts;
  - the CI `--check` steps;
  - XT-conformance-86..88 in `usage-scans.test.ts`;
  - `docs/ops/scans.md`.

  At the Pin they produced 49 facades and 99 helpers; 1516 DIV-12 pairs (55 option-pair, 96 model-config, 1365 method-plus-state); 73 assertion names (all 57 Inventory kinds listed); and 46 Mockery methods. Before the revert, `bun test` gave 128 pass, and typecheck, lint, `workflows:check`, `ownership:check`, CODEOWNERS and the three `--check` runs were clean.
- **Saved patch.** [spec-3-7-attempt.patch](spec-3-7-attempt.patch) holds the source changes, without the four generated outputs. It applies to `ad304dc3510f2fb13bdffbf1c21fcb9f6fbb7c13` with `git apply`. The code was then reverted.
- **Review.** 32 findings: high 4, medium 9, low 11, false 4 and maybe-false 4. The intent_gap groups A (PHPUnit exclusion), B (option-pair rule) and C (Mockery chain rule) made every lower route moot, so nothing was patched or deferred. Rejected findings and their reasons are in the triage log.
- **Implementation notes for the rebuild.** 294 Inventory lines have `assertions: null` (tests the baseline did not run), and these add nothing. `Queue::getJobBackoff` now reads backoff through `getAttributeValue`, so the Design Notes' `backoff` example is stale.
- **AC 1.** `allowed-identifiers.json` had no review finding that needs a ruling, and it is rebuilt unchanged from the patch.


### Run 2026-10-18 (rebuild after ESC-3.7-1). Status: done.

- **Summary.** The three scans were rebuilt from the saved attempt (applied, then the patch deleted) with the rules ESC-3.7-1 approved: hierarchy-scoped PHPUnit exclusion, `Assert`-subclass calls, `fail`/`markTest*`, case-insensitive names; option names × option holders for DIV-12; facade-started Mockery chains, skipped mocked methods and the static-call rule. At the Pin the outputs are 49 facades and 99 helpers; 1516 DIV-12 pairs (13 option-pair, 96 model-config, 1407 method-plus-state); 82 assertion names (all 57 Inventory kinds, `assertCount` 1741 calls); and 45 Mockery methods.
- **Files.**
  - `tools/scans/closures.ts`, `div12.ts`, `test-api.ts`: the scans and their CLIs.
  - `tools/scans/php.ts`: exports `phpFiles`, `parseUse`, `codeIndexes`, with no behaviour change.
  - `package.json`: the `scan:closures`, `scan:div12` and `scan:test-api` scripts.
  - `conformance/scans/allowed-identifiers.json`, `div12-pairs.jsonl`, `phpunit-assertions.jsonl`, `mockery-api.jsonl`: the generated outputs.
  - `conformance/tests/xaravel/usage-scans.test.ts`: XT-conformance-86..88.
  - `.github/workflows/ci.yml`, `conformance/tests/xaravel/upstream.test.ts`: the `upstream` job's three `--check` steps and the test step.
  - `docs/ops/scans.md`: the three scans documented.
  - `stories/3.7.md`: `done`.
- **Review.** 31 findings: medium 8, low 19, false 3, maybe-false 1.
  - Patched: Mockery names are now grouped case-insensitively (medium), XT-87 has fixtures for the four missing option-holder routes (medium), and XT-88 now covers spelling a name as its Inventory kind (medium). Three doc and comment fixes (low): calls vs executions, the Inventory-kind naming clause, and the `ci.yml` header.
  - Nothing deferred. The rejected findings and their reasons are in the triage log.
- **Follow-up review: recommended.** Three medium entries were patched (Mockery case grouping; the holder-route and Inventory-spelling test gaps). The unverified risk is the new Mockery grouping. Its spelling rule (first call site in walk order) is not stated in the contract and was chosen to match the PHPUnit fallback.
- **Verification.** All clean:
  - `bun test` on `usage-scans`, `scans` and `upstream`: 11 pass, with the real snapshot present.
  - The five `scan:* --check` runs: exit 0.
  - Full `bun test`: 128 pass, 0 fail.
  - `typecheck`, `lint`, `workflows:check`, `ownership:check` and `protected-paths:codeowners`: clean.
  - Mutation checks confirm that the Queueable and ShouldBroadcast holder routes and the Inventory-kind spelling are pinned.
- **Residual risks.**
  - **The `Model`/`connection` anchor.** It is not a pair at the Pin: `Model` has `$connection` but no `connection()` method. The test checks it through `classifier()` instead.
  - **Pest closures.** `$this->assert*` calls in Pest closures (about 105, in mcp and boost) are not call sites by rule, so only the Inventory counts them.
  - **Testbench helpers.** Helpers reached through the unindexed Testbench `TestCase` are listed with `executions: 0`, so Story 4.4 must handle them through Escalations, as ESC-3.7-1 states.
