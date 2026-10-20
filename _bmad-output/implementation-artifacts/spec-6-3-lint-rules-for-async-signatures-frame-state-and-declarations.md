---
title: 'Story 6.3: Lint rules for async signatures, frame state and declarations'
type: 'feature'
created: '2026-10-19'
baseline_revision: '236723d06f3b7bffb1699b3262e4a48ee857f9d9'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false  # follow-up review: _bmad-output/implementation-artifacts/epic-6-retro-2026-10-19.md (P5)
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/AGENTS.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The spine names seven more conventions as lint errors (AD-4 inject keys, AD-5 singleton and boot-only writes, AD-6 `T | Promise<T>` and thenable returns, AD-7 column defaults, AD-25 arrow test bodies), but no rule enforces them; and `conformance/boot-only-state` holds 21 false entries (e.g. `QueueManager::$connectors`, `Gate::$afterCallbacks`) because the scan's boot-reachability ignores the call's receiver (Epic 3 retro S5).

**Approach:** Add seven rules to the existing `xaravel` oxlint JS plugin (`tools/lint-rules/plugin.ts`), enable them as errors in `.oxlintrc.json` and append them to `SPINE_RULES`. Make the scan's boot entry calls receiver-aware, add each boot-only property's writer methods to `singletons.json` so the lint knows the register/boot path, and regenerate both files with `bun run scan:singletons`. Prove it with XT-conformance-133 over committed fail/pass fixtures linted by the real oxlint with the real config.

## Boundaries & Constraints

**Always:**
- New rules, all `"error"`, keyed `xaravel/<name>`; each message names its AD. Rule scope is every linted file unless stated.
  - `no-maybe-promise-return` (AD-6) -- the declared return type of a public function is a union with at least one `Promise<…>` / `PromiseLike<…>` member and at least one other member. Public: a class method, getter or abstract method that is not `private`/`protected`/`#`; an interface/type-literal method signature; an exported function declaration. An overload implementation (a body preceded by bodyless overloads of the same name) is not public. Callback parameter types are never checked.
  - `no-async-thenable-return` (AD-6) -- in an `async` function, method or arrow: a declared return type `Promise<X>` where X (or a union member of X) names a thenable type; or a `return` (or arrow expression body) that is `new X(…)`, `<expr> as X`, or an identifier whose same-function `const`/`let` declaration is annotated `X` or initialised `new X(…)`. Thenable types: the exported `THENABLE_TYPES` list in `tools/lint-rules/thenables.ts` (Builder, Eloquent `Builder`, the Relation classes, `PendingRequest`, `PendingDispatch`, `PendingChain`, `PendingBatch`, `PendingBroadcast`, `PendingCommand`, `PendingTestResponse`), plus any class in the same file that `implements PromiseLike`/`Thenable` or declares a `then` method.
  - `no-singleton-field-write` (AD-5) -- a class whose file has `registerClass('<FQCN>', X)` with the FQCN in `singletons.json` `classes`: a direct `this.<field>` assignment, compound assignment, `++`/`--` or `delete` anywhere but the constructor body proper and field initialisers. Writes inside a function or arrow nested in the constructor are after construction. A boot-only property of the class is left to the next rule.
  - `no-boot-only-write` (AD-5) -- a class whose file registers an FQCN with entries in `singletons.json` `bootOnly`: a write to a listed property (`this.p` assignment/update/delete, an assignment to `this.p[…]` / `this.p.x`, or a mutating call `push`/`unshift`/`splice`/`pop`/`shift`/`set`/`add`/`delete`/`clear` on `this.p`) outside the constructor and the property's `writers` (compared case-insensitively), or inside a function nested in a writer.
  - `no-arrow-test-body` (AD-25) -- in a file with a call to the bare identifier `uses`, an arrow function passed as an argument to `test`, `it`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll`, or their `.only`/`.skip`/`.todo`/`.each(…)` forms.
  - `no-inject-param-mismatch` (AD-4) -- `inject({…})` as a class decorator (own constructor's parameters; a class with no constructor and no `extends` has none; one that `extends` without its own constructor is skipped), as a method decorator (that method's parameters), or `inject(map, fn)` with a function/arrow literal `fn`: the key list must equal the parameter-name list exactly, in order. Names come from identifiers, defaulted parameters, TS parameter properties and rest elements; a TS `this` parameter is ignored; a destructured parameter, a spread or a non-static key is a mismatch. The message lists both lists.
  - `no-dynamic-column-default` (AD-7) -- in a class extending `Model`, `Pivot`, `MorphPivot`, `Authenticatable` or `mixin(<one of them>, …)`: a non-static, non-`declare` field initialiser that is not a constant expression, except Model config fields (`table`, `connection`, `primaryKey`, `keyType`, `incrementing`, `timestamps`, `attributes`, `fillable`, `guarded`, `casts`, `hidden`, `visible`, `appends`, `with`, `withCount`, `perPage`, `dateFormat`, `touches`). Constant: a literal, `null`, a template literal with no expressions, unary `-`/`+`/`!` on a constant, an array or object literal of constants with static keys, or a constant wrapped in `as`/`satisfies`/`!`/parentheses.
- Scan (`tools/scans/singletons.ts`): a top-level boot entry call seeds method `m` of class C only when its receiver resolves to C: `F::m(` where F (through `use`) is a facade in `conformance/scans/facades.jsonl` whose accessor is bound to C or is C; `X::m(` with X resolving to C; `$this->app->make(K)->m(`, `$this->app[K]->m(`, `app(K)->m(`, `resolve(K)->m(` with K an abstract string or `Y::class` bound to C or equal to C. Any other receiver seeds nothing. Propagation inside C is unchanged. `singletons.json` gains `bootOnly: [{ "property": "<FQCN>::$<p>", "writers": [<lower-case method names>] }]`, sorted. Both outputs are regenerated by `bun run scan:singletons`, never edited by hand; the scan header comment and `docs/ops/scans.md` state the new rule.
- The 6.2 rules, fixtures and assertions keep working; `RULE_NAMES` grows to thirteen and its pins in XT-conformance-132 and `lint.test.ts` are extended (no assertion removed).
- Fixtures in `tools/lint-rules/fixtures/signatures-state/`: one failing fixture per rule and passing fixtures with the near-misses. Tests copy them into temp roots (with a temp `singletons.json` where needed, via a rule option or the root-relative path) and run the real oxlint with the real config.

**Never:**
- No `async-surface.json`, API-surface diff or registration scan (Stories 6.4-6.6); no type-aware (tsgolint) custom rule.
- No hand edits to `conformance/boot-only-state` or `singletons.json`; no `oxlint-disable`; no ignore patterns hiding real `packages/`, `installer/`, `skeleton/` files.
- No edits to `conformance/expectations/**`; no writes into tracked paths while testing.
- Never weaken an existing scan assertion: XT-conformance-249's `CacheManager::$customCreators` expectation is replaced by a stronger one (the false entries absent, the genuine ones present), recorded in the Spec Change Log.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| maybe-promise | `get(): T \| Promise<T>` public method | `xaravel(no-maybe-promise-return)` | exit 1 |
| overloads | two bodyless overloads + `T \| Promise<T>` implementation | clean | exit 0 |
| callback param | `run(fn: () => T \| Promise<T>): void` | clean | exit 0 |
| thenable | `async find() { return new Builder(); }` | `xaravel(no-async-thenable-return)` | exit 1 |
| awaited | `async find() { return await new Builder().get(); }` | clean | exit 0 |
| singleton | `this.current = r` in a method of a class registered as `Illuminate\Routing\Router` | `xaravel(no-singleton-field-write)` | exit 1 |
| boot-only | `this.groupStack.push(a)` in `group()` of Router | clean | exit 0 |
| boot-only runtime | same in `dispatch()` | `xaravel(no-boot-only-write)` | exit 1 |
| arrow test | `uses(TestCase); test('x', async () => {})` | `xaravel(no-arrow-test-body)` | exit 1 |
| no uses | `test('x', () => {})` | clean | exit 0 |
| inject order | `@inject({ b: B, a: A })` on `constructor(a, b)` | `xaravel(no-inject-param-mismatch)` | exit 1 |
| column | `class Post extends Model { createdAt = new Date(); }` | `xaravel(no-dynamic-column-default)` | exit 1 |
| scan | real Upstream snapshot | 5 boot-only entries; `QueueManager::$connectors`, `Gate::$afterCallbacks`, `Translator::$handleMissingTranslationKeys` absent | `--check` OK |

</intent-contract>

## Code Map

- `tools/lint-rules/plugin.ts` -- 6.2's plugin: `rule(description, (context, path) => Visitor)`, minimal `Node` interface (extend with `returnType`, `params`, `value`, `async`, `accessibility`, `decorators`, `superClass`, `kind`, `static`, `declare`), helpers `unwrap`, `staticString`, `memberName`, `keyName`, `isInjectCallee`, `scopePath`; exports `RULE_NAMES` (same order as `plugin.rules`), `MESSAGES` (each ends `(AD-n)`). AST probe: `MethodDefinition.value.returnType.typeAnnotation` is `TSUnionType`; `TSMethodSignature.returnType`; `TSParameterProperty.parameter`; `Decorator.expression` is the `inject(...)` call; `context.sourceCode.parserServices` is empty (no types).
- `tools/lint-rules/singletons.json` -- `{comment, bindings[202], classes[188]}`, FQCNs with `\\`; generated by `renderSingletons` (`tools/scans/singletons.ts:~1057`). Read it from the plugin by resolving `tools/lint-rules/singletons.json` beside `plugin.ts` (allow a rule option path for tests).
- `tools/scans/singletons.ts` -- rule header lines 33-53; `bootEntryCalls` ~947 (collects bare names; make it collect `{receiver, name}` and resolve to classes), `bootOnlyOf` ~1003 (the `runtime` writer list is the `writers` output), `buildSingletons` ~1086; facades from `conformance/scans/facades.jsonl` (Story 3.6 scan, accessor field). Input `conformance/upstream/` is present locally (gitignored, 46 MB); scan is pure Bun, ~0.5 s.
- `conformance/boot-only-state` -- 26 entries now; expected 5 after the fix: `Illuminate\Testing\ParallelTesting::$setUpProcessCallbacks`, `::$setUpTestCaseCallbacks`, `::$tearDownProcessCallbacks`, `Illuminate\Routing\Router::$groupStack`, `Laravel\Mcp\Server\Registrar::$localServers` (implementer verifies on the real run).
- `conformance/tests/xaravel/scans.test.ts` -- XT-conformance-84 (line ~652, synthetic snapshot, exact `BOOT_ONLY` text line ~617 and singletons output; every fixture call is `$this->app->make(Registry::class)->m(`, so it should survive; extend expected singletons text with `bootOnly` and add receiver cases), XT-conformance-249 (line ~689, real snapshot; line ~705 asserts `CacheManager::$customCreators` present -- replace as stated), XT-conformance-85 (Protected ownership).
- `tools/lint-rules/disables.ts:50` -- `SPINE_RULES`; append the seven names. Names compare by last `/` segment; avoid oxlint built-in names.
- `conformance/tests/xaravel/lint-rules.test.ts` -- XT-conformance-132 (helpers `tempDir`, `write`, `place`, `oxlint`, `byFile`); its `RULE_NAMES` / "all six" pins must be extended; 6.2 fixture `passing.ts` / `type-import-injection.ts` use `@inject({ mailer: Mailer })` -- make sure their classes satisfy the new key rule (adjust the fixture's constructor if needed, not the assertion).
- `conformance/tests/xaravel/lint.test.ts:171` -- exact `SPINE_RULES` pin; append the seven.
- `.oxlintrc.json` -- add the seven rules.
- `docs/ops/lint.md` (rule table, "Adding a spine rule" section), `docs/ops/scans.md` -- document.
- Current tree has no hits for any new rule (probe: no `Promise` union returns, no `uses(`, no `registerClass`, no Model subclasses).
- `stories/6.3.md` -- manifest; `xaravel_test_ids: [XT-conformance-133]`; set `status: done` at the end.

## Tasks & Acceptance

**Execution:**
- `tools/scans/singletons.ts` -- receiver-aware boot entry calls; `bootOnly` writers in `singletons.json`; header comment.
- `tools/lint-rules/singletons.json`, `conformance/boot-only-state` -- regenerate with `bun run scan:singletons`.
- `conformance/tests/xaravel/scans.test.ts` -- receiver cases in XT-84's fixture, `bootOnly` in the expected output, XT-249's stronger expectation.
- `tools/lint-rules/thenables.ts` -- `THENABLE_TYPES`.
- `tools/lint-rules/plugin.ts` -- the seven rules; `RULE_NAMES`, `MESSAGES`.
- `.oxlintrc.json`, `tools/lint-rules/disables.ts` -- enable and protect them.
- `tools/lint-rules/fixtures/signatures-state/` -- failing fixture per rule, passing fixtures.
- `conformance/tests/xaravel/lint-signatures.test.ts` -- XT-conformance-133 plus the matrix edge cases.
- `conformance/tests/xaravel/lint-rules.test.ts`, `conformance/tests/xaravel/lint.test.ts` -- extend the pins.
- `docs/ops/lint.md`, `docs/ops/scans.md` -- document.

**Acceptance Criteria:**
- Given the committed fixtures placed at their scoped paths, when `bun --bun oxlint --type-aware -c .oxlintrc.json --format unix` runs from the repo root, then each failing fixture fails naming exactly its rule and each passing fixture passes; and the root config holds all seven as errors (XT-conformance-133).
- Given `conformance/boot-only-state` and `singletons.json` regenerated from the real snapshot, when `bun run scan:singletons --check` runs, then it is byte-identical, and a fixture write to a listed property outside its writers fails `no-boot-only-write` (XT-conformance-133), and the known false entries are gone (XT-conformance-249).
- Given the real repository, when `bun run lint` runs, then it exits 0, and `lint:disables` rejects a disable of any of the seven.

## Spec Change Log

- XT-conformance-249: the assertion that `Illuminate\Cache\CacheManager::$customCreators` is in `bootOnly` is replaced by a stronger one, as Boundaries require: six known false entries (`QueueManager::$connectors`, `Gate::$afterCallbacks`, `Translator::$handleMissingTranslationKeys`, `CacheManager::$customCreators`, `Router::$binders`, `Validation\Factory::$extensions`) are absent; `writers` equals the five genuine entries with their writers exactly; `bootOnly` matches `writers`; and the `bootOnly` in `singletons.json` matches it too.
- Facade receivers: `F::m(` resolves F against the lines of `conformance/scans/facades.jsonl` and also against any other non-abstract indexed class whose `extends` chain reaches `Facade` and whose `getFacadeAccessor()` is a literal. `facades.jsonl` covers only `Support/Facades`, so without this `Mcp::local(...)` in `BoostServiceProvider::boot` (facade `Laravel\Mcp\Facades\Mcp`) would seed nothing, and the expected genuine entry `Laravel\Mcp\Server\Registrar::$localServers` would drop out. `accessorOf` is now exported from `tools/scans/facades.ts`; the facade scan's output does not change. Recorded in the scan header and `docs/ops/scans.md`.
- 6.2 fixtures: `identity-values/passing.ts` and `identity-values/type-import-injection.ts`, and XT-132's inline `InjectDecorator.ts` source, each gain a constructor with a `mailer` parameter. Their `@inject({ mailer: … })` sat on classes that had no constructor and no `extends`, which `no-inject-param-mismatch` now reports. No assertion changed.
- XT-conformance-84: the fixture provider gains receiver cases, a facade class and a `facades.jsonl` line, and `DatabaseStore`, `Hub`, `WidgetManager`, `CookieJar` (`setSecure`), `QueueManager` (`addRoute`) and `Translator` (`setLocale`) gain writer methods. The new receiver calls target those new methods, so the existing closure-only setters (`setFallback`, `setDefaultPathAndDomain`, `addConnector`) stay unlisted. The expected output gains `bootOnly` and six newly seeded properties. The review line numbers move by 2 for the two new `use` lines, the summary count goes from 6 to 12, and the drift line goes from 10 to 16. No expectation was weakened: every earlier entry and non-entry still holds.

- Review follow-up (beyond the spec text):
  - `no-maybe-promise-return` also checks function-valued public class fields, exported `const` functions, function-typed property signatures and functions exported by a later `export { f }`.
  - The AD-5 rules treat a `static {}` block as construction time and skip `this` under a nested non-arrow function.
  - `no-arrow-test-body` also covers `.failing`, `.concurrent` and the curried `.if` / `.skipIf` / `.todoIf`.
  - `no-inject-param-mismatch` reports a map that is not an object literal.
  - A regex literal is not a constant column default.
  - A malformed or incomplete `singletons.json` throws, naming its path.
  - The `no-boot-only-write` message says the writers are compared case-insensitively.
  - `PendingClosureDispatch` is added to `THENABLE_TYPES`.

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 37 findings — high 0, medium 7, low 25, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) no case covers a bodyless `T | Promise<T>` overload or `declare function` signature — edge cases added for exported overload, `export declare function` and class overload signatures.
  - `[low]` `[reject]` (verification-gap, other) empty `classes` / `bootOnly` render branches untested — only a snapshot with no `singleton()` bindings reaches them; Upstream always has bindings.
  - `[low]` `[patch]` (edge) no-singleton-field-write misses `this.cache[k] = v` and mutating calls — spec scopes the rule to direct `this.<field>` writes (AD-5's "`this.<field>` assignment"); the limit is now documented in `docs/ops/lint.md` and the Writes.ts comment corrected.
  - `[low]` `[reject]` (edge) boot-only mutating call on a nested chain (`this.p[0].push`) not reported — a write into an element of a boot-only list, not to the list; unlikely, adds branches.
  - `[low]` `[reject]` (edge) `sort`/`reverse`/`fill`/`Object.assign` not in MUTATORS — the scan's writers are appends and keyed sets; unlikely on boot-only callback lists.
  - `[low]` `[patch]` (edge) `static { this.x = … }` reported as a post-construction write — fixed: a StaticBlock counts as class-definition time; edge case added.
  - `[low]` `[patch]` (edge) `this` under a nested non-arrow function treated as the instance — fixed: matching stops at a nested non-arrow function; edge case added.
  - `[low]` `[patch]` (edge) writes in a base class or mixin in another file escape both AD-5 rules — needs cross-file resolution; documented as a limit in `docs/ops/lint.md`.
  - `[false]` `[reject]` (edge) `Promise<T> | null` flagged — correct: a method returning null synchronously or a Promise is async on some paths only, which AD-6 forbids ("async on any path is async on all paths").
  - `[medium]` `[patch]` (edge) exported arrow consts, class-field arrows, property signatures with a function type and `export { f }` escape no-maybe-promise-return — fixed: each form is checked; edge cases added.
  - `[medium]` `[patch]` (edge) a function exported through `export { f }` goes unreported — same fix as the previous row.
  - `[low]` `[reject]` (edge) a thenable-typed parameter or `var` declarator returned unawaited — unlikely spelling; adds parameter type tracking.
  - `[low]` `[reject]` (edge) shadowed declarations pick the wrong declarator — needs scope analysis; unlikely in one async function.
  - `[low]` `[patch]` (edge) malformed `singletons.json` crashes or silently disables rules — fixed: the plugin throws an Error naming the path when JSON is malformed or `classes` / `bootOnly` is not an array.
  - `[low]` `[reject]` (edge) ROOT_MARKER first match picks a wrong root above the repo — only off the CI path (repo-root runs use relative paths); same reasoning as 6.2's cwd row.
  - `[low]` `[patch]` (edge) indirect Model subclasses escape no-dynamic-column-default — needs cross-file class resolution; documented as a limit.
  - `[false]` `[reject]` (edge) helper arrow fields on models reported as column defaults — under AD-7 every initialised instance field on a Model is a column; a helper belongs on the prototype.
  - `[false]` `[reject]` (edge) `accessor x = now()` not checked — AD-7 accessors are `@attribute(...) accessor` attribute casts, not column defaults.
  - `[low]` `[reject]` (edge) a missing `facades.jsonl` silently seeds no facades — the file is committed and Protected; only a hand-built temp root lacks it.
  - `[low]` `[reject]` (edge) malformed `facades.jsonl` line throws a bare SyntaxError — the file is generated by `scan:facades --check`-guarded tooling; adds a wrapper for an unseen case.
  - `[false]` `[reject]` (edge) `app()->make(K)->m(` / `$app->make(K)->m(` miss genuine boot writers — the planning investigation traced the seeding call of all 26 earlier entries; none was seeded by such a receiver, and any-receiver seeding would have listed any such entry.
  - `[low]` `[patch]` (blind) singleton rule misses element writes — same as the edge row; documented.
  - `[low]` `[patch]` (blind) parent-class / mixin writes escape — same as the edge row; documented.
  - `[low]` `[patch]` (blind) static block false positive; `Class.prop` static writes unseen — StaticBlock fixed; `Class.prop` writes documented as a limit.
  - `[medium]` `[patch]` (blind) no-maybe-promise-return misses exported arrows, field arrows, property signatures — same fix as the edge row; the `inCallback` return-type-literal case is rejected (rare spelling).
  - `[low]` `[patch]` (blind) thenable list misses `PendingClosureDispatch`; short-name matching flags `Schema\Builder`; cross-file subclasses unseen — `PendingClosureDispatch` added; short-name matching and subclasses documented as limits (resolving imports adds module resolution).
  - `[low]` `[patch]` (blind) no-async-thenable-return does not follow call chains (`return this.query()`) — needs return-type inference across methods; documented as a limit beside the alias one.
  - `[low]` `[patch]` (blind) `test.if(c)(…)`, `skipIf`, `todoIf`, `failing`, `concurrent` escape no-arrow-test-body — fixed: these forms are covered; edge cases added. Aliased `uses` import rejected (unlikely).
  - `[medium]` `[patch]` (blind) a non-literal inject map passes silently — fixed: reported as a mismatch (keys cannot be checked); edge case added. `@inject` on a field rejected: the decorator's TC39 context type rejects it at tsc.
  - `[low]` `[patch]` (blind) a regex literal counts as a constant column default — fixed: regex literals are non-constant; edge case added. Indirect bases documented.
  - `[medium]` `[patch]` (blind) 19 of the 21 dropped boot-only entries have no recorded reason — `docs/ops/scans.md` now lists each dropped entry with the boot call that seeded it and why its receiver does not resolve; app-level `extend` / `bind` / `Blade.directive` writes are covered by AD-5's base-only API guard. The exact five-entry `writers` assertion in XT-249 already pins every other entry absent.
  - `[low]` `[patch]` (blind) boot-only message prints lower-cased writer names — message now says the writers compare case-insensitively.
  - `[low]` `[reject]` (blind) singletons cache never invalidated in a long-running oxlint — oxlint runs per invocation in CI and `bun run lint`; editor servers are out of scope.
  - `[false]` `[reject]` (blind) AD-6's Skeleton lint config not addressed and owned by no Story — Story 61.2's AC ("the Skeleton's … lint config … the thenable-return and floating-promise rules are on") owns it.
  - `[low]` `[reject]` (blind) bookkeeping: manifest `done` while spec `in-review`; `bun run lint` AC unautomated; XT-132 title says six — the spec status is mid-run by design; CI's `check` job runs `bun run lint`; XT-132's title describes Story 6.2's six rules, which it still verifies.
  - `[low]` `[reject]` (intent) descriptive divergences: syntactic reading of AD-6/AD-7, a writer-method reading of AD-5's time-based "register/boot path", the lint reading `bootOnly` from `singletons.json` rather than `conformance/boot-only-state`, 21 entries dropped rather than the two named, `attributes` exempt, hooks covered — the syntactic reading is the only one a JS plugin can implement (Design Notes); both files come from one scan run, `--check` and XT-133 assert their property lists are equal; the AC asks for the scan rule to be corrected, not for a list of removals; AD-7 lists `attributes` as a configuration property, not a column field.
  - `[medium]` `[patch]` (orchestrator, diff read) XT-84's new receiver calls made the Translator, CookieJar and QueueManager setters top-level calls, dropping coverage of ESC-3.6-1's closure exclusion for boot entry calls — fixed: the receiver cases target new methods, and the three setters stay called only in closures and unlisted.

## Design Notes

oxlint JS plugins get no type information, so AD-6's two rules decide from declared types and returned-expression shape. `T | Promise<T>` hidden behind an alias (`MaybePromise<T>`) is invisible here; Story 6.4's `.d.ts` walk is the backstop for emitted signatures. The thenable list lives in `tools/lint-rules/thenables.ts` so Story 6.4's fixture list can import it.

"Register/boot path" has no syntactic definition in the spine (AD-5 judges by time: before `sealed`). The scan already computes, per boot-only property, the non-construction methods that write it, all boot-reachable (ESC-3.6-1); those writers are the class's register/boot path for that property. Publishing them in `singletons.json` keeps `conformance/boot-only-state`'s line format, which AD-5's runtime guard reads, unchanged.

The receiver rule narrows ESC-3.6-1's "any receiver" reading, which the AC asks for ("correcting the scan rule"). Dropping `*Manager::$customCreators` is safe: AD-5 makes `extend` base-only after `sealed` independently of this file.

## Verification

**Commands:**
- `bun run scan:singletons --check` -- expected: byte-identical, 5 boot-only properties
- `bun test conformance/tests/xaravel/lint-signatures.test.ts conformance/tests/xaravel/lint-rules.test.ts conformance/tests/xaravel/lint.test.ts conformance/tests/xaravel/scans.test.ts` -- expected: all pass
- `bun run lint`, `bun run typecheck` -- expected: exit 0
- `bun run test`, `bun run harness --xaravel` -- expected: no new failures
- `bun run ownership:check`, `bun run escalations:check` -- expected: exit 0

## Auto Run Result

Status: done

**Summary.** The `xaravel` oxlint plugin gains seven rules, all errors in the root `.oxlintrc.json` and protected through `SPINE_RULES`:
- `no-maybe-promise-return` (AD-6)
- `no-async-thenable-return` (AD-6)
- `no-singleton-field-write` (AD-5)
- `no-boot-only-write` (AD-5)
- `no-arrow-test-body` (AD-25)
- `no-inject-param-mismatch` (AD-4)
- `no-dynamic-column-default` (AD-7)

`scan:singletons` now checks the receiver of each boot entry call: a call counts for class C only when its receiver resolves to C (a facade, `X::`, `app(K)`, `$this->app[K]`, `$this->app->make(K)`, `resolve(K)`). It also publishes each boot-only property's writer methods in `singletons.json` `bootOnly`. Both files were regenerated by the scan. `conformance/boot-only-state` drops from 26 entries to 5, and the known false entries (`QueueManager::$connectors`, `Gate::$afterCallbacks` and the 19 others listed in `docs/ops/scans.md`) are gone. XT-conformance-133 proves the rules against committed fixtures, using the real oxlint and the real config.

**Files changed.**
- `tools/lint-rules/plugin.ts`: the seven rules and the loader for `singletons.json`.
- `tools/lint-rules/thenables.ts` (new): `THENABLE_TYPES`.
- `.oxlintrc.json` and `tools/lint-rules/disables.ts`: the rules are enabled and protected.
- `tools/scans/singletons.ts`: the receiver-aware boot entry calls and the `bootOnly` output. `tools/scans/facades.ts` now exports `accessorOf`.
- `tools/lint-rules/singletons.json` and `conformance/boot-only-state`: regenerated.
- `tools/lint-rules/fixtures/signatures-state/` (new): the fixtures. Two 6.2 fixtures each gained a constructor.
- `conformance/tests/xaravel/lint-signatures.test.ts` (new): XT-conformance-133.
- `lint-rules.test.ts` and `lint.test.ts`: the pins are extended.
- `scans.test.ts`: XT-84 gains receiver cases, and XT-249 gets the stronger expectation.
- `docs/ops/lint.md` and `docs/ops/scans.md`: the rules, their limits, and the dropped entries with the reason for each.
- `stories/6.3.md`: `status: done`.

**Review.**
- 37 findings: 7 medium, 25 low, 5 false.
- 7 medium entries were patched:
  - the bodyless-signature cases;
  - the extra public signature forms (two rows);
  - the non-literal inject map;
  - the record of the dropped entries;
  - the closure-exclusion coverage in XT-84;
  - the blind maybe-promise row.
- About 13 low entries were patched or documented: static blocks, `this` inside nested functions, test forms, regex literals, a malformed `singletons.json`, the message wording, `PendingClosureDispatch`, and the documented limits.
- Nothing was deferred. The rejected findings and the reason for each are in the Review Triage Log.

**Follow-up review recommended: true.** Seven medium entries were patched in one pass. The unverified risk is the AD-5 rules: no framework code calls `registerClass` yet, so the singleton and boot-only rules have run only on fixtures.

**Verification.**
- `scan:singletons --check`: byte-identical, 5 boot-only properties.
- `bun run lint`: exit 0 (366 files).
- `bun run typecheck`: exit 0.
- `bun run test`: 242 pass, 0 fail.
- `bun run harness --xaravel`: 242 passed, differ=0.
- `ownership:check` and `escalations:check`: exit 0.

**Residual risks.**
- The rules see no types. `T | Promise<T>` behind an alias, thenables reached through call chains, and indirect Model bases are not caught.
- Thenables are matched by short name, so a `Schema\Builder` could be a false positive.
- The receiver rule narrows ESC-3.6-1's "any receiver" reading. The AC asks for this, but the Maintainer may want to review the 21 entries it drops.
- The boot-only rule matches PHP property names, so TypeScript ports must keep those names.
- `scan:singletons` reads `facades.jsonl`, so regenerate facades first when both change.
