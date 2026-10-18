---
title: 'Story 3.6: Upstream scans: facades, singletons and boot-only state'
type: 'feature'
created: '2026-10-18'
status: 'blocked'
baseline_revision: '876a610856e3a71035636392b7b86bb8ab670caf'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
  - 'stories/3.6.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The facade generator (Story 28.x, `epics.md:3992`), the singleton lint (Story 6.3) and AD-5's sealed-write guard need Upstream facts: each facade's accessor, root class and `@method` lines, the classes Upstream providers bind with `singleton()`, and the properties written only during `register`/`boot`. None of this is committed data yet.

**Approach:** Two static TypeScript scans read only `conformance/upstream/` (no PHP, no Docker). They share a small PHP lexer in `tools/scans/php.ts`. `bun run scan:facades` writes `conformance/scans/facades.jsonl`. `bun run scan:singletons` writes `tools/lint-rules/singletons.json` and `conformance/boot-only-state`. Each scan has `--check`, which reports drift, and CI runs that check after the snapshot sync.

## Boundaries & Constraints

**Always:**
- **Lexer** (`tools/scans/php.ts`). It covers what the rules below need:
  - comments (a docblock is kept as a token) and `#[…]` attributes;
  - single- and double-quoted strings, heredoc and nowdoc (opaque except for literal value);
  - variables, names (with `\`), numbers, and punctuation including `->`, `?->`, `::`, `=>` and compound assignments.
  - Each token records its line.
  - On top of the tokens it parses the namespace and `use` imports (aliases and groups; `use function`/`use const` are skipped), resolves names PHP's way, and indexes every class, interface, trait and enum in the four repositories' `src/` (`.php`, not `.blade.php`). The index records each declaration's FQCN, kind, `abstract`, resolved `extends`, used traits, file, and its methods and properties with their token ranges.
- **Facades.**
  - Every class declared in `framework/src/Illuminate/Support/Facades/*.php` that extends `Illuminate\Support\Facades\Facade`, except `Facade` itself, gives one line: `{"facade","accessor","root","methods"}`.
  - `accessor` is what `getFacadeAccessor()` returns. That is the string for `'key'`, or the resolved FQCN, without a leading `\`, for `X::class`. Any other return shape fails the run.
  - `root`:
    - the accessor itself, when it is a non-abstract class in the index;
    - otherwise the first `@see \X` tag in the class docblock whose X is outside `Illuminate\Support\Testing\Fakes\` and is a class in the index.
    - If neither applies, the run fails.
  - `methods` lists every `@method` line in docblock order as `{"name","static","returns","parameters","signature"}`:
    - `signature` is the verbatim text after `@method `, whitespace-trimmed;
    - `returns` is the return type text, or null;
    - `parameters` is the raw text inside the outer parentheses.
    - A `@method` line that does not parse fails the run, naming the file and line.
  - Lines are sorted by `facade` with `compareUnits` and rendered with `renderJson` in that key order, LF-terminated.
- **Singletons.**
  - A provider is any indexed class whose `extends` chain reaches `Illuminate\Support\ServiceProvider`.
  - A binding comes from one of these sources in a provider:
    - (a) a call `->singleton(` or `->singletonIf(` anywhere in the provider's methods, including closures;
    - (b) an entry of a `$singletons` property array.
  - Each binding is `{"provider","abstract","class"}`:
    - `abstract` is the first argument: a string literal, or the resolved FQCN of `X::class`.
    - `class` is the class the binding builds:
      - the second argument's FQCN when it is `X::class`;
      - the abstract, when there is no second argument (or the `$singletons` value is `X::class`) and the abstract is a FQCN;
      - for a closure, its declared return type when that is a single class name; otherwise the class of `new X` when every `return` / `fn` body expression at the closure's own depth is `new X` of one class;
      - otherwise null.
  - A first argument that is a variable is resolved only in this case:
    - it is the value variable of an enclosing `foreach ($param as … => $var)`, and `$param` is a parameter of the enclosing method M;
    - every call of M in the class (`$this->M(`) passes `$this->prop` or `array_merge($this->p1, …)`;
    - each such property's array values are `X::class`;
    - each X then yields a binding with abstract = class = X.
  - Any other argument shape, unresolved call, or unindexed FQCN fails the run, naming file:line.
  - `tools/lint-rules/singletons.json` is:
    - `{"comment", "bindings": [...], "classes": [...]}`, in that key order, 2-space indented, one binding object per line;
    - bindings are deduplicated and sorted by provider, abstract, then class (null first);
    - `classes` is the sorted unique non-null `class` values.
- **Boot-only state.**
  - For each class C in `classes`, take C's own methods together with those of its indexed ancestors and of the traits they use, transitively.
  - A write to property P is any of these, where the property name is literal:
    - `$this->P` or `static::$P` / `self::$P` followed (after any `[…]` / `->x` chain) by `=`, a compound assignment, `++` or `--`;
    - an `unset(` of such a target.
  - Constructor (`__construct`) writes are excluded.
  - A method is boot-reachable if either of these holds:
    - its name is called as `->name(` or `::name(` anywhere inside a provider;
    - every caller of it within C's analysed methods (`$this->name(`, `static::name(`, `self::name(`) is boot-reachable, and it has at least one such caller. This is computed to a fixed point.
  - P is boot-only when it has at least one non-constructor write, and every method writing it is boot-reachable.
  - `conformance/boot-only-state` holds a `#` comment header naming the generator, then one line per entry, `<FQCN of C>::$<P>`, sorted and unique.
- **CLI.** `tools/scans/facades.ts` and `tools/scans/singletons.ts` follow `tools/oracle/api-surface.ts`:
  - `main(argv)`, with `UsageError` exiting 2, and `--root` and `--check`;
  - exit 1 on any failure, and nothing is written when the build fails;
  - `--check` prints one `<scan> drift: <file> …` line per differing or missing file and exits 1.
- **Determinism.** The output depends only on the file contents: files are walked in sorted order, there are no timestamps, and there is no Map-iteration order from the filesystem.

**Never:** Do not edit the spine, SPEC, PRD, `epics.md`, `AGENTS.md`, `conformance/protected-paths`, `tools/protected-paths/` or `tools/ownership/`. Add no npm dependency. Do not run PHP or Docker. Do not build the facade generator or the lint rule (Stories 28.x and 6.3). Do not add `scan:closures`, `scan:div12` or `scan:test-api` (Story 3.7).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | snapshot at the Pin | 45 facade lines; singletons.json; boot-only-state | exit 0, counts printed |
| Bad accessor | `getFacadeAccessor` returns `$x` | nothing written | exit 1, file:line |
| No root | string accessor, no qualifying `@see` | nothing written | exit 1, facade named |
| Bad @method | unparseable line | nothing written | exit 1, file:line |
| Dynamic abstract | `singleton($x)` outside the foreach rule | nothing written | exit 1, file:line |
| Closure building another class's instance | `fn () => $app->make(X)` | binding with `class: null` | none |
| Drift | committed file differs or is missing | drift lines | `--check` exits 1 |

</intent-contract>

## Code Map

- `tools/oracle/api-surface.ts:420-540` -- CLI model: `UsageError`, `parseOptions`, `main`, drift output and `firstDifference`.
- `tools/oracle/request.ts:94,137` -- `compareUnits`, `renderJson`.
- `tools/upstream/upstream.ts:31,33,381` -- `UPSTREAM_DIR`, `UPSTREAM_REPOS`, `upstreamPath`. A missing snapshot fails with its path named.
- `tools/component-map/component-map.ts:400-470` -- the existing line-regex declaration scan. Do not reuse it; the lexer index replaces it for these scans.
- Upstream facts at the Pin:
  - 45 facades (46 files with the base `Facade`). 29 accessors are string keys and 16 are `X::class`. `Date`'s first `@see` lines are URLs, so they are skipped. `Process` lists `@see PendingProcess` first, but its accessor `Factory::class` is concrete, so it wins.
  - Provider bindings: 146 are `$this->app->singleton(`, some spanning several lines, for example `PipelineServiceProvider.php:18`. `FoundationServiceProvider::$singletons` has two. `ArtisanServiceProvider.php:290` calls `singleton($command)` in `registerCommands(array $commands)`, which `register()` calls with `array_merge($this->commands, $this->devCommands)`.
- `.github/workflows/ci.yml` `upstream` job -- the snapshot exists only after `upstream:sync` (it is gitignored), so the two `--check` steps go after `upstream:check`.
- `conformance/tests/xaravel/upstream.test.ts:181` -- asserts the `upstream` job's run steps; extend the list.
- `conformance/tests/xaravel/api-surface.test.ts` -- test model: temp roots with a written mini snapshot, and real-snapshot parts guarded by `existsSync`.
- `conformance/protected-paths` -- `/conformance/` and `/tools/` already protect all three outputs. `tools/protected-paths/protected-paths.ts` exports the matcher the XT-85 test uses (see `protected-paths.test.ts`).

## Tasks & Acceptance

**Execution:**
- `tools/scans/php.ts` -- the lexer, name resolution and declaration index described above.
- `tools/scans/facades.ts` -- `buildFacades(root)`, the CLI, and `parseMethodTag(text)` (exported for tests).
- `tools/scans/singletons.ts` -- `buildSingletons(root)` returning both file texts, and the CLI.
- `package.json` -- add the scripts `scan:facades` (`bun tools/scans/facades.ts`) and `scan:singletons` (`bun tools/scans/singletons.ts`).
- `conformance/scans/facades.jsonl`, `tools/lint-rules/singletons.json`, `conformance/boot-only-state` -- generated from the local snapshot.
- `.github/workflows/ci.yml` -- in the `upstream` job, after `upstream:check`, add the steps `bun run scan:facades --check` and `bun run scan:singletons --check`, and update the header comment. Update `upstream.test.ts:181` to match.
- `conformance/tests/xaravel/scans.test.ts`:
  - XT-conformance-83: a mini snapshot in a temp root, holding:
    - two facades, one with a string accessor and `@see`, one with a concrete `X::class` accessor and multi-word generic return types;
    - the base `Facade`;
    - the bad-accessor and no-root failures.
    It asserts exact lines, and that `--check` reports drift on an edited file. When the real snapshot exists, it checks the committed file's bytes against `buildFacades` and asserts 45 lines.
  - XT-conformance-84: a mini snapshot holding:
    - a provider subclass via an intermediate parent;
    - each binding form: string key with `new X` closure, `X::class` alone, two-argument, `$singletons`, the foreach rule, and an unresolved closure giving null;
    - a dynamic-abstract failure;
    - a singleton class whose trait property is written by a provider-called method (boot-only), and one written by a runtime method (not boot-only).
    It asserts both files exactly, and that two runs are byte-identical. When the real snapshot exists, the committed files match `buildSingletons`, and `classes` includes `Illuminate\Cache\CacheManager`.
  - XT-conformance-85: `conformance/scans/facades.jsonl`, `tools/lint-rules/singletons.json` and `conformance/boot-only-state` are Protected under the protected-paths matcher, and CODEOWNERS assigns them to `@edanisko`.
- `docs/ops/scans.md` -- a new page covering the commands, the output formats, each rule above, the CI check, and how to regenerate after a Pin move.
- `stories/3.6.md` -- set `status: done` at completion.

**Acceptance Criteria:**
- Given the snapshot, when `bun run scan:facades` runs, then it writes `conformance/scans/facades.jsonl`, listing for each `Illuminate\Support\Facades\*` class its accessor, its root class and every `@method` signature.
- Given the snapshot, when `bun run scan:singletons` runs, then it writes `tools/lint-rules/singletons.json` listing every class bound with `singleton()` by an Upstream provider at the Pin, and seeds `conformance/boot-only-state` from the Upstream properties written only during `register`/`boot`.
- Given the scan outputs, when they are proposed, then they land only through Maintainer review, because they are Protected.

## Spec Change Log

- 2026-10-18 (implementation): the snapshot at the Pin (verified by `upstream:check`) has 47 files in `Support/Facades`, so there are 46 facades, 29 with string accessors and 17 with `X::class` accessors, not 45/16. The scan and XT-conformance-83 use 46.
- 2026-10-18 (implementation): "unindexed FQCN fails the run" applies to the foreach rule's X values. A closure's `new X` or return type may name a vendor class, for example `cache.psr6` → `Symfony\Component\Cache\Adapter\Psr16Adapter`. The scan keeps that class rather than failing, because failing would break the happy path at the Pin.

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 42 findings — high 5, medium 9, low 14, false 8, maybe-false 6
- note: the review diff left out the generated `conformance/scans/facades.jsonl` (475 kB), whose content the committed-file test and `--check` pin.
- outcome: two groups are rooted in rules inside the `<intent-contract>` (the closure class rule and the boot-reachability/write rules). They route to **intent_gap**, so the lower entries are moot. The attempted change is saved as [spec-3-6-attempt.patch](spec-3-6-attempt.patch). It excludes the three generated outputs; regenerate them with `bun run scan:facades` and `bun run scan:singletons`. The code was reverted. The questions are filed as `conformance/escalations/ESC-3.6-1.md`.
- findings (intent-alignment layer):
  - `[high]` `[intent_gap]` (A) Closure-built singletons get `class: null`, so `classes` omits Translator, Redirector, CookieJar, the Event Dispatcher, View Factory and others that AD-5 names. Verified: 23 null bindings; translator is `$trans = new Translator(...); return $trans;` (TranslationServiceProvider.php:19-31). Root cause is the class rule in the intent contract.
  - `[high]` `[intent_gap]` (B) boot-only-state lists per-request `UrlGenerator::$request`. Verified: setRequest runs in requestRebinder's closure (RoutingServiceProvider.php:101-105), and AD-5 makes it frame state. Root cause is the "anywhere inside a provider" rule in the intent contract.
  - `[low]` `[reject]` (C) Xaravel's own singletons are not included. The Story's AC is Upstream-only; the spine's Xaravel half has no Xaravel singletons to list yet, and docs/ops/scans.md says the generator is to be extended.
  - `[maybe-false]` `[reject]` (D) Facade roots are not cross-checked with the singleton bindings. They would agree once A is fixed; if true it is low. Settle by comparing facade roots with binding classes after the rebuild.
  - `[false]` `[reject]` (E) The Protected criterion is only configuration. The AC is that the outputs land through Maintainer review because they are Protected, and XT-85 asserts exactly that coverage and the CODEOWNERS owner.
  - `[medium]` `[intent_gap]` (F) The tests check the tool against its own output, not the outputs against Upstream facts. Same root as A/B: the rules define the facts. Group A/B.
  - `[false]` `[reject]` (housekeeping) The status mismatch (`stories/3.6.md` done while the spec is in-review) is the build's normal order; the manifest is set at finalization, and this run reverted it.
- findings (verification-gap layer):
  - `[medium]` `[intent_gap]` (gap) The real-snapshot assertions in scans.test.ts never run in CI: `check` has no snapshot, and `upstream` runs only `--check`. Verified in ci.yml. The fix is trivial, but it is moot under the intent gap; it is carried into ESC-3.6-1's proposal.
  - `[high]` `[intent_gap]` (other) The boot-only rule counts provider-closure calls and first-class callables, listing `Renderer\Listener::$queries` and `UrlGenerator::$request`. Verified for UrlGenerator. Group B.
- findings (blind layer):
  - `[high]` `[intent_gap]` UrlGenerator::$request contradicts AD-5. Group B.
  - `[medium]` `[intent_gap]` Provider callbacks (rebinding, resolving, booted, listeners) are treated as boot-time. Group B.
  - `[low]` `[reject]` Runtime callers outside the class (route files calling `Router::group`) are ignored. AD-5 makes route registration base-only after `sealed`, so `$groupStack` being boot-only is consistent with the spine.
  - `[low]` `[intent_gap]` The fixed point drops recursive methods. It is real by inspection of `bootOnlyOf`, and part of the reachability rule. Group B.
  - `[low]` `[intent_gap]` Helpers called only from the constructor count as runtime writers. Part of the same rule. Group B.
  - `[medium]` `[intent_gap]` Write detection misses by-reference built-ins, destructuring and `ClassName::$P`. Verified: `array_pop($this->groupStack)` at Router.php:494 is not seen. Group B.
  - `[low]` `[reject]` `Application::registerBaseBindings` singletons are skipped. The AC says "by an Upstream provider", and Application is not a provider.
  - `[high]` `[intent_gap]` Many key per-request services get `class: null`. Group A.
  - `[low]` `[reject]` "Unindexed FQCN fails" is weakened further than the change log says (plain `X::class` of `Laravel\Roster\ProjectManager`). This is true; under the intent gap the rule is re-ruled, and ESC-3.6-1's proposal keeps vendor classes listed.
  - `[maybe-false]` `[reject]` Duplicate FQCNs are dropped silently. Settle by counting duplicate declarations in the index; tools/component-map's check already reports cross-Component duplicates. If true it is low.
  - `[low]` `[reject]` XT-84 lacks several failure-path cases. Each path fails loudly with file:line; adding cases is test surface for unlikely shapes.
  - `[low]` `[reject]` Real-snapshot tests pass silently without the snapshot. This duplicates the verification-gap entry, which covers it.
  - `[low]` `[reject]` `decodeDouble` lacks `\x`, `\u{}` and octal escapes, and `parseMethodTag` lacks escaped quotes. Upstream uses none of these in accessors, abstracts or `@method` lines, and any such line fails loudly.
  - `[false]` `[reject]` The spec's numbers are stale (45 vs 46). The Spec Change Log records the correction, and the intent contract is read-only to the build.
  - `[low]` `[reject]` Two files are written non-atomically. Both are built in memory before any write; a disk error mid-write is rare and a rerun fixes it (same ruling as Story 3.5).
  - `[maybe-false]` `[reject]` The docs give no review procedure for the seed. Moot once B's rule is fixed; if true it is low.
- findings (edge-case layer):
  - `[medium]` `[intent_gap]` Pre-increment `++$this->P` is missed. Write rule. Group B.
  - `[medium]` `[intent_gap]` Destructuring writes are missed. Group B.
  - `[medium]` `[intent_gap]` By-reference writes are missed (Router::$groupStack). Group B.
  - `[medium]` `[intent_gap]` Writes inside closures defined in boot-reachable methods are credited as boot writes. Group B.
  - `[low]` `[intent_gap]` `ClassName::$P` / `parent::$P` static writes are missed. Group B.
  - `[maybe-false]` `[intent_gap]` Methods also called from outside C count as boot-reachable. Group B.
  - `[low]` `[intent_gap]` Self-recursive methods never become reachable. Group B (duplicate of the blind finding).
  - `[low]` `[intent_gap]` Method names are compared case-sensitively. Group B.
  - `[low]` `[reject]` Partial write of the two outputs. Same as the blind non-atomic finding.
  - `[false]` `[reject]` A comment holding a bracket inside an attribute throws. Upstream has no such attribute, and the failure is loud (a fail-closed run), not a wrong output.
  - `[false]` `[reject]` A truncated declaration header raises a TypeError. That is a malformed snapshot, which `upstream:check` rejects first; the run still exits 1.
  - `[false]` `[reject]` A missing `src/` gives a raw ENOENT. `upstream:check` rejects a partial sync; the exit is still 1.
  - `[false]` `[reject]` `@method` with a trailing description fails the scan. Laravel's facade documenter writes no descriptions, and the failure is loud by design.
  - `[maybe-false]` `[reject]` An interface or abstract class from one-argument `singleton(X::class)` lands in `classes`. Settle by checking the 1-argument bindings' kinds; ESC-3.6-1 proposes restricting this. If true it is low.
  - `[medium]` `[intent_gap]` (claim) boot-only-state seals runtime-written properties. Group B.
  - `[false]` `[reject]` (claim) The lexer's attribute coverage. Same as the attribute finding above.
  - `[maybe-false]` `[reject]` (claim) "A missing snapshot fails with its path named" holds only for a missing repo directory. Low if true; a partial sync fails `upstream:check`.

## Design Notes

- **Static, not Reflection.** Both scans need source facts that Reflection does not expose: docblocks are available, but `singleton()` call sites and property writes are not. Running providers' `register()` would also miss branches it does not take, such as `runningInConsole()`. Static scans need no image, so CI can check them after a plain snapshot sync.
- **Seed semantics.** The boot-only rule matches by method name, so a common name called in a provider can over-include. The file is a reviewed seed. Xaravel's own entries arrive later by extending the generator, not by hand edits, because `--check` would flag a hand edit.
- **Root from `@see`.** Laravel's facade documenter writes the `@see` tags from the resolved facade root, so the first non-fake `@see` class is Upstream's own record of the root.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/scans.test.ts conformance/tests/xaravel/upstream.test.ts` -- pass, with the real-snapshot parts running.
- `bun run scan:facades && bun run scan:singletons`, then both with `--check` -- exit 0, byte-identical.
- `bun test`, `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `bun run ownership:check`, `bun run protected-paths:codeowners` (no diff) -- clean.

## Auto Run Result

Run 2026-10-18. Status: blocked.

Blocking condition: intent gap. Two rules in the `<intent-contract>` give outputs that contradict the Story's AC and AD-5. The questions are filed as `conformance/escalations/ESC-3.6-1.md`.

1. **The closure class rule.** Should a closure that builds its instance through `$v = new X; … return $v;`, `(new X)->setter(...)` or `tap(new X, …)` give X? Under the current rule, 23 of 202 bindings are `class: null`, including translator, redirect, cookie, events, view and queue. As a result, `classes` leaves out the services AD-5 names for the singleton lint.
2. **The boot-reachability and write rules.** Which provider calls count as boot-time? A call inside a rebinding or listener closure runs per request. Which mutations count as writes: `array_pop`, destructuring, pre-increment? With the current rules, `conformance/boot-only-state` lists `UrlGenerator::$request`, which AD-5 makes per-unit frame state, and it misses the `array_pop` writes.

- **Attempt.** The scans were built and verified as the contract specifies:
  - `tools/scans/php.ts`, `facades.ts` and `singletons.ts`;
  - the `scan:*` scripts;
  - CI `--check` steps in the `upstream` job;
  - XT-conformance-83..85 in `scans.test.ts`;
  - `docs/ops/scans.md`.

  At the Pin they produced 46 facades, 202 bindings, 179 classes and 37 boot-only entries. Before the revert, `bun test` gave 125 pass, and typecheck, lint, `workflows:check`, `ownership:check`, CODEOWNERS and both `--check` runs were clean.
- **Saved patch.** [spec-3-6-attempt.patch](spec-3-6-attempt.patch) holds the source changes, without the three generated outputs. It applies to `876a610856e3a71035636392b7b86bb8ab670caf` with `git apply`. The code was then reverted.
- **Review.** 42 findings: high 5, medium 9, low 14, false 8 and maybe-false 6. The intent_gap groups A (class rule) and B (boot-only rules) made every lower route moot, so nothing was patched or deferred. Rejected findings and their reasons are in the triage log.
- **Spec facts.** The facade count is 46 (17 `X::class` accessors), as the Spec Change Log records.
- **Residual risk.** Even after ESC-3.6-1, the boot-only rule matches by method name, so its output stays a seed for review.
