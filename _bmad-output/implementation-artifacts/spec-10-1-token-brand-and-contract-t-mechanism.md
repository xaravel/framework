---
title: 'Story 10.1: Token, brand and contract<T>() mechanism'
type: 'feature'
created: '2026-10-23'
status: 'in-progress'
baseline_revision: '16df6f3df445b28f55a1f31aa096f538232a92b2'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/decisions/ESC-10.1-1.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
  - '{project-root}/AGENTS.md'
warnings: []
deferred: []
---

# Story 10.1: Token, brand and `contract<T>()` mechanism

<intent-contract>

## Intent

**Problem:** `@xaravel/contracts` is empty. Stories 10.2–10.5 and every later package need one mechanism to declare a contract: a TypeScript interface plus a same-named runtime token, so that `instanceof`, brands and test doubles work as in PHP (AD-1, AD-9, DIV-3, ESC-10.1-1).

**Approach:** Add `contract<T, B>(fqcn, members?)` and the token type to the package root. Cover XT-contracts-1, -2 and -18 with Xaravel Tests. XT-contracts-3 (`fqcn()` on a token) waits on `conformance/escalations/ESC-10.1-3.md`, and XT-contracts-4 (`@xaravel/contracts/psr`) waits on `conformance/escalations/ESC-10.1-4.md`. Both were raised during planning, so this Story ends `blocked` on them, with the rest of its work merged.

## Boundaries & Constraints

**Always:**
- The token is a frozen, non-function object. Its own keys are:
  - `brand`: `Symbol.for('<FQCN>')`.
  - `[Symbol.for('xaravel.class.fqcn')]`: the FQCN string without a leading `\`.
  - `[Symbol.for('xaravel.contract.methods')]`: a frozen array of method names.
  - `[Symbol.for('xaravel.contract.parameters')]`: a frozen `{ <method>: frozen [<param>, …] }` record.
  - `[Symbol.hasInstance](v)`: true exactly when `v` is a non-null object or function and `v[brand] === true`, read through the prototype chain.
  - `[Symbol.toPrimitive]()`: returns `brand` for every hint.
- Typing: `brand` is typed as the phantom `B extends symbol`, so `declare const XBrand: unique symbol` plus `contract<X, typeof XBrand>(…)` gives the interface `readonly [X.brand]: true`. A class that `implements X` without the getter then fails TS2420. `x instanceof X` narrows to `X`.
- `members` defaults to `{}`. The method names are its keys, in insertion order.
- `@xaravel/runtime/php`'s `hasBrand(C, X)` and `jsonEncode`'s brand detection work on these tokens unchanged.
- Named exports only. No `undefined` returns. `null` is the only absent value. Runtime is the only dependency.
- Tests use `xaravelTest` and `Assert` from `@xaravel/assert`. The double rows build real doubles through `@xaravel/mockery` and through `@xaravel/assert`'s mock API, both added as `devDependencies` (`workspace:*`).
- Each consequence string cites the consequence ids it covers: AD-1.1 for XT-contracts-1, -2 and -18.

**Never:**
- Edit outside `packages/contracts/**`, this spec, and this Story's own Escalations.
- Add the `./psr` export, or any `src/<namespace>/` contract port. Those belong to ESC-10.1-4 and Stories 10.2–10.5.
- Make `contract()` call `registerClass`, or patch `fqcn()`. That is ESC-10.1-3.
- Write a test for XT-contracts-3 or XT-contracts-4.
- Edit `packages/contracts/tsconfig.json` or README `## Dependencies` by hand for a devDependency; runtime has neither.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| brand present | `class A { get [Arrayable.brand]() { return true as const } }` | `new A() instanceof Arrayable` is true, a subclass instance too, `hasBrand(A, Arrayable)` is true | none |
| computed via token | `get [Arrayable]()` on a class | same property as `[Arrayable.brand]` at runtime, so `instanceof` is true | none |
| brand absent | `{}`, `null`, `42`, `"x"`, class without getter, getter returning `1` | `instanceof` is false | never throws |
| missing brand compile | fixture `class B implements Arrayable { toArray() {…} }` | `tsc -b` exits non-zero with TS2420 naming `[Arrayable.brand]` | none |
| complete brand compile | fixture class with both brands and `[Symbol.iterator]` | `tsc -b` exits 0 | none |
| metadata | `contract('X\\Y', { a: ['p', 'q'], b: [] })` | methods `['a','b']` frozen; parameters `{a:['p','q'], b:[]}` frozen, lists frozen; caller's later mutation of its input does not change them | none |
| no members | `contract('App\\Contracts\\Billing')` | methods `[]`, parameters `{}`, both frozen | none |
| doubles | Mockery `DoubleTarget.of(token)` / assert `Generator` | name is the FQCN, methods are the token's | none |
| bad FQCN | `''`, `'\\'`, `'a\\\\b'`, non-string | throws `TypeError` naming `contract()` | thrown at call |
| leading `\` | `contract('\\App\\Foo')` | FQCN `App\\Foo`, brand `Symbol.for('App\\Foo')` | none |

</intent-contract>

## Code Map

- `packages/contracts/src/index.ts`: currently `export {};`. Re-export `contract` and the token types from here.
- `packages/contracts/package.json`: `exports` `{".": "./src/index.ts"}` and dependency `@xaravel/runtime` only (XT-conformance-8 checks this exact map). Add `devDependencies` `{"@xaravel/assert": "workspace:*", "@xaravel/mockery": "workspace:*"}` (grader packages, AD-2.8; `packages/runtime/package.json` has the assert one), then run `bun install`. Check XT-conformance-8 still passes.
- `packages/runtime/src/php/hasBrand.ts:7-28`: `brandKey` calls `token[Symbol.toPrimitive]("string")` and expects a symbol. A class is checked as `prototype[key] === true`, an object through its chain. Read-only.
- `packages/runtime/src/php/jsonEncode.ts:63-98`: bare `Symbol.for('Illuminate\\Contracts\\Support\\Arrayable' | 'Jsonable')` brands. A token-branded class must encode through `toArray()`.
- `packages/runtime/src/registry/registry.ts:49`: `CLASS_FQCN = Symbol.for("xaravel.class.fqcn")`; reuse the same key. `FQCN_SHAPE` at :52 is the FQCN grammar to mirror; it is not exported.
- `packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts:23-39,129-153` and `packages/assert/src/Framework/MockObject/Generator/Generator.ts:59-67,218-254`: these read a token. It must be an object (any function counts as a class) with `Symbol.hasInstance`, an own FQCN key, and an iterable of string methods. Read-only.
- `packages/mockery/tests/xaravel/double-scenarios.ts:52-61` and `packages/assert/tests/xaravel/typed-doubles.test.ts:165-170`: today's hand-made token shape, which the real one must satisfy.
- `tools/api-surface/api-surface.ts:451-481,522-546`: recognises `export const X = contract<…>('<FQCN literal>', …)`. The callee must be named `contract` and the first argument must be a string literal, so keep that name and shape.
- `conformance/tests/xaravel/scaffold.test.ts:481-578`: the pattern for spawning tsc on a temp project. It runs `process.execPath --bun node_modules/typescript/bin/tsc -b --pretty false` in a temp dir with a copied `tsconfig.base.json`, a symlinked `node_modules`, and the workspace packages. Copy it for XT-contracts-2.
- `packages/runtime/tests/xaravel/registry.test.ts:119-127`: the `xaravelTest(id, consequence, fn)` style.
- `conformance/harness/xaravel.ts`: the harness finds `packages/*/tests/xaravel/**/*.test.ts`. A bare `test()` there is reported as UNDECLARED.

## Tasks & Acceptance

**Execution:**
- `packages/contracts/src/Contract.ts`:
  - Export `contract<T extends object, B extends symbol = symbol>(fqcn: string, members?: Readonly<Record<string, readonly string[]>>): ContractToken<T, B>`.
  - Export `type ContractToken<T, B>`: `{ readonly brand: B; [Symbol.hasInstance](v: unknown): v is T; [Symbol.toPrimitive](hint: string): B }` plus the three metadata keys.
  - Export the three metadata key constants: `CONTRACT_METHODS`, `CONTRACT_PARAMETERS` and `CLASS_FQCN`.
  - Implement the Always rules, and validate the FQCN.
  - Rationale: the AD-1 mechanism. This is not a class, so it needs no `registerClass`.
- `packages/contracts/src/index.ts`: named re-exports.
- `packages/contracts/package.json`: add the two devDependencies.
- `packages/contracts/tests/xaravel/contract.test.ts`: write XT-contracts-1 and XT-contracts-18, covering the matrix's runtime rows, the double rows and the bad-FQCN rows. Declare a test-local `Arrayable` with `declare const ArrayableBrand: unique symbol`, using the real FQCN. Use `Assert` only.
- `packages/contracts/tests/xaravel/brand-compile.test.ts`: write XT-contracts-2, covering both compile rows through a spawned `tsc -b` on a temp project that imports `@xaravel/contracts`. Assert the exit code, and assert that a line containing `TS2420` and `Arrayable.brand` is present or absent as each row requires. Clean up the temp dir.
- `packages/contracts/README.md`: under a usage heading, add a short section that shows how to declare a contract. Keep the existing required lines.

**Acceptance Criteria:**
- Given the token mechanism, when `bun run harness --xaravel --id 'XT-contracts-*'` runs, then XT-contracts-1, -2 and -18 pass, and none is UNDECLARED.
- Given the package, when `bun run typecheck`, `bun run lint`, `bun run registration:check`, `bun run escalations:check` and the full `bun run harness --xaravel` run, then each one passes.

## Spec Change Log

- 2026-10-23, implementation: under `--pretty false`, tsc 7.0.2 writes TS2420 on one line and `Property '[Arrayable.brand]' is missing …` on the next, indented line. XT-contracts-2 therefore checks the TS2420 diagnostic block (its line plus the indented elaboration lines) for `[Arrayable.brand]`, not a single line. The intent (TS2420 naming the brand) is unchanged.

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 26 findings — high 0, medium 4, low 11, false 9, maybe-false 2
- findings:
  - `[low]` `[patch]` (verification-gap) `hasInstance`'s function branch is never shown true — added a branded-function positive case to XT-contracts-1.
  - `[false]` `[reject]` (edge) `bun.lock` lacks the new devDependencies, so a frozen install fails — `bun install --frozen-lockfile --ignore-scripts` on the tree without a lock change reports "no changes" and exits 0; main already has runtime's workspace devDependency absent from the lock and CI passes.
  - `[low]` `[patch]` (edge) a sparse parameter list passes `every()` and freezes `undefined` — validated every index; added the sparse case to the bad-members loop.
  - `[low]` `[reject]` (edge) method names are not validated as PHP identifiers — metadata comes from the committed API surface, whose names are already PHP's; a guard adds a branch for input no caller produces.
  - `[low]` `[reject]` (edge) a throwing brand getter or Proxy trap makes `instanceof` throw — the matrix's never-throws rows list plain values; brands are generated `return true` getters, and a try/catch guard adds complexity for an input nothing produces.
  - `[maybe-false]` `[reject]` (intent) doubles row is tested through public `Double.for` / `createMock`, not `DoubleTarget.of` / `Generator` — the Always rule asks for real doubles through the public APIs; the error message and mock class name show the FQCN; would only be low.
  - `[low]` `[patch]` (intent) `get [Arrayable]()` needs a cast to type-check — README now says that form names the key at runtime only; the typed form is `get [Token.brand]()`, as ESC-10.1-1 rules.
  - `[false]` `[reject]` (intent) TS2420 is matched across its continuation lines — tsc 7.0.2 `--pretty false` prints the property on the indented next line; logged in the Spec Change Log, same diagnostic.
  - `[false]` `[reject]` (intent) Escalations are authored by this change, not pre-existing — they were written during this run's planning, which is what the intent says; the Never list allows them.
  - `[false]` `[reject]` (intent) root exports three key constants and validates more than the matrix — the Tasks list asks for the constants; stricter FQCN and members validation matches the Registry grammar and throws loudly.
  - `[low]` `[patch]` (intent) the token's exact own-key set is not asserted — added a `Reflect.ownKeys` assertion.
  - `[medium]` `[patch]` (intent, blind) Jsonable brand detection by `jsonEncode` is never exercised — added a Jsonable token and a class encoding through `toJson()`.
  - `[false]` `[reject]` (intent, blind) spec frontmatter `in-review` disagrees with the body's `Status: blocked` — the body section is the earlier runs' history; Finalize writes this run's result.
  - `[false]` `[reject]` (blind) `bun.lock` is not in the change set — same refutation as the edge finding above.
  - `[low]` `[patch]` (blind) ESC-10.1-3 Option 1 suggests Story 10.1's PR edit `@xaravel/runtime` — reworded to route the change to a runtime Story or action item.
  - `[false]` `[reject]` (blind) ESC-10.1-4's `trigger: contract` is wrong — ESC-10.1-1, raised by this Story on the same footing, used `contract` and was ruled; the gap is a missing contract input for a Story still in Phase 1.
  - `[medium]` `[patch]` (blind) `FQCN_SHAPE` is a copy of the Registry grammar with nothing keeping them equal (lesson, epic 4/7) — added an equivalence check to XT-contracts-1 against the Registry grammar as `loadClassmap` applies it (`registerClass` checks only for an empty name), and wrote the range with an escape.
  - `[false]` `[reject]` (blind) the new root exports will be flagged by the API-surface gate — `bun run api-surface contracts` reported 0 extra, 0 mismatched.
  - `[low]` `[patch]` (blind) README presents `get [Arrayable]()` as equivalent — same fix as the intent finding above.
  - `[low]` `[reject]` (blind) XT-contracts-2's temp project links only `contracts`, so it will break when contracts imports runtime — that failure would be loud (module resolution), which is correct behaviour; no current import.
  - `[low]` `[patch]` (blind) the missing-brand compile row passes with unrelated errors — it now asserts every error code is TS2420.
  - `[low]` `[reject]` (blind) a throwing getter breaks never-throws — same as the edge finding above.
  - `[low]` `[reject]` (blind) two `contract()` calls with one FQCN give distinct tokens — AD-3's one declaration per contract file means one token per FQCN; canonical tokens are Story 10.4's alias table.
  - `[low]` `[reject]` (blind) integer-like method keys reorder — PHP method names cannot be integer-like and metadata comes from the API surface.
  - `[maybe-false]` `[reject]` (blind) mocks built outside a lifecycle leave Mockery state behind — the full `bun run harness --xaravel` showed no differences after the change; if real it would be low (test-only state).
  - `[medium]` `[patch]` (fidelity F-7) XT-contracts-1's consequence says prototype-chain getter while the test accepts an own true property — reworded to an own or inherited true brand property.
  - `[medium]` `[patch]` (fidelity F-7) XT-contracts-18 claims doubles read parameter metadata and cites AD-1.1 — reworded to metadata storage plus method discovery, citing ESC-10.1-1 (b) and ESC-4.5-1 item 3, with no AD-1.1 token (no consequence row states the metadata).

### 2026-10-23 — Review pass (Finalize re-check: Fidelity Review on the patched tree)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. Both reviewers recorded `pass` at tree `1791224ea8d690e2c9a69fa73b245165f21b0d2d`.

## Design Notes

Declaration shape that Story 10.2's generators will emit:

```ts
declare const ArrayableBrand: unique symbol;
export interface Arrayable { readonly [Arrayable.brand]: true; toArray(): unknown }
export const Arrayable = contract<Arrayable, typeof ArrayableBrand>("Illuminate\\Contracts\\Support\\Arrayable", { toArray: [] });
class Post implements Arrayable { get [Arrayable.brand]() { return true as const } toArray() { return [] } }
```

ESC-10.1-1's probe confirmed this resolves under TS 7.0.2 `--strict`. If the circular reference between the interface and the const does not compile, stop and report it: do not change the ruled shape.

## Verification

**Commands:**
- `bun install`: the lockfile changes only for the new devDependencies.
- `bun run harness --xaravel --id 'XT-contracts-*'`: XT-contracts-1, -2 and -18 pass.
- `bun run harness --xaravel`: no differences.
- `bun run typecheck`, `bun run lint`, `bun run registration:check`, `bun run escalations:check`: each exits 0.
- `bun run api-surface contracts` (or the tool's documented form): no new unexplained member is reported for the root entry.

## Auto Run Result

Status: blocked
Blocking condition: prerequisite not landed. `decisions/ESC-9.1-3.md` (Maintainer, 2026-10-21) requires a `CONSEQUENCE_SOURCES` row and a generated `conformance/xaravel-consequences/contracts.jsonl` "before that Component's first Story with Xaravel Tests" (action item `epic-9-item-1-consequence-rows`). Story 10.1 is the first `contracts` Story and its manifest lists XT-contracts-1..4, so it cannot start until that row lands. The row itself waits on the Maintainer's reading of the ESC-9.1-3 rule: see the five questions in `spec-retro-9-consequence-rows.md` (the saved literal-reading attempt is `retro-9-consequence-rows-attempt.patch`).

Stopped at step 1, before planning: no spec, code or tests were written. The compiled `epic-10-context.md` is kept for the resumed run.

Also noted for the resumed run: `epics.md` lists five acceptance criteria for Story 10.1, including "a test double reads a contract token's method names at `Symbol.for('xaravel.contract.methods')`" (ESC-4.5-1 item 3, ESC-4.7-1 item 5). The manifest `stories/10.1.md` maps only four (XT-contracts-1..4) and has no row for that criterion. Every new contracts subpath also needs an approved `SUBPATH_EXPORTS` entry in `conformance/tests/xaravel/scaffold.test.ts` (ESC-9.1-1).

### Resumed run, 2026-10-22

Status: blocked
Blocking condition: two Escalations, both waiting on the Maintainer. Together they cover all four of this Story's Test IDs.

- `conformance/escalations/ESC-10.1-1.md` (XT-contracts-1, -2, -3, trigger `contract`). AD-1's `readonly [Token]: true` brand key and `x instanceof Token` cannot type-check on one binding under TypeScript 7.0.2. A `unique symbol` token enforces the brand but fails TS2359 as an `instanceof` operand. A `unique symbol & { [Symbol.hasInstance] }` token compiles for `instanceof` but degrades the key to a `symbol` index signature, so a missing brand is not caught. The recommended fix types the compile-time key as `Token.brand`, which changes AD-1's wording. The same Escalation asks which test covers the method-metadata criterion (it has no XT row in `stories/10.1.md`) and where the parameter names live.
- `conformance/escalations/ESC-10.1-2.md` (XT-contracts-4, trigger `protected-path`). `./psr` needs a `SUBPATH_EXPORTS` entry in the Protected `conformance/tests/xaravel/scaffold.test.ts` (ESC-9.1-1).

The resumed run stopped at step 2, before the plan was written: no code or tests were written. The probes were run outside the repository, under `/tmp`. The ruling decides the token's type shape, and every task in the plan depends on it. The compiled `epic-10-context.md` is still valid for the next run.

### Maintainer rulings, 2026-10-22

- `decisions/ESC-10.1-1.md`: option 1. The compile-time brand key is `Token.brand`, a per-contract `unique symbol` whose value is `Symbol.for('<FQCN>')`. The interface requires `readonly [Token.brand]: true`. The token's `Symbol.hasInstance` reads the brand, and its `Symbol.toPrimitive` returns the key. Generators emit `get [Token.brand]()`. The fourth criterion is XT-contracts-18, now in the manifest. Parameter names go at `Symbol.for('xaravel.contract.parameters')`, a frozen `{ <method>: [<param>, …] }` record.
- `decisions/ESC-10.1-2.md`: option 1. `SUBPATH_EXPORTS` lists every `@xaravel/contracts` subpath Epic 10 builds, `psr` included.

Resume at step 2 (plan) for XT-contracts-1..4 and XT-contracts-18. `epic-10-context.md` is updated to the ruling.

### Run of 2026-10-23

Status: blocked
Blocking condition: two Escalations raised while planning, both waiting on the Maintainer. Everything else in the Story is built, reviewed and verified.
- `conformance/escalations/ESC-10.1-3.md` (XT-contracts-3): `fqcn()` cannot resolve a contract token without a `@xaravel/runtime` change.
- `conformance/escalations/ESC-10.1-4.md` (XT-contracts-4): the PSR interfaces have no rows in the committed API surface, so the `psr` tokens have no ruled source for their metadata.

**What changed**
- `packages/contracts/src/Contract.ts`: adds `contract<T, B>(fqcn, members)`, the `ContractToken<T, B>` type, and the `CLASS_FQCN`, `CONTRACT_METHODS` and `CONTRACT_PARAMETERS` keys. The token is a frozen object. It carries its brand, its FQCN, and frozen method and parameter metadata, plus `Symbol.hasInstance` and `Symbol.toPrimitive`.
- `packages/contracts/src/index.ts`: named re-exports of the above.
- `packages/contracts/package.json`: adds `@xaravel/assert` and `@xaravel/mockery` as `workspace:*` devDependencies. `bun.lock` is left unchanged: `bun install --frozen-lockfile` passes without it, as it already does for runtime's devDependency.
- `packages/contracts/tests/xaravel/contract.test.ts`: XT-contracts-1 (brand and `instanceof`, `hasBrand`, `jsonEncode` for Arrayable and Jsonable, FQCN grammar against the Registry's) and XT-contracts-18 (metadata, plus real Mockery and PHPUnit doubles).
- `packages/contracts/tests/xaravel/brand-compile.test.ts`: XT-contracts-2. A spawned `tsc -b` fails with only TS2420 naming `[Arrayable.brand]`, and the complete class compiles.
- `packages/contracts/README.md`: adds a usage section.
- `conformance/escalations/ESC-10.1-3.md` and `ESC-10.1-4.md`: new.

**Review**
- 26 findings: 13 patched (4 medium, 9 low) and 13 rejected (9 false, 2 low, 2 maybe-false); each rejection's reason is in the Review Triage Log. None deferred.
- Fidelity Review: the first pass rejected on three F-7 consequence-wording findings, all patched. The second pass recorded two `pass` verdicts at tree `1791224ea8d690e2c9a69fa73b245165f21b0d2d`, and `fidelity:review status` prints `current`.
- Follow-up review recommended: no. No high finding was patched. The four medium patches were test and wording fixes, and the second Fidelity pass reviewed them.

**Verification**
- `bun run harness --xaravel`: 337 tests, 332 passed, 0 failed, 5 skipped, no differences. `--id 'XT-contracts-*'`: 3 of 3 passed.
- `bun run typecheck`, `bun run lint` (with `lint:disables`), `bun run registration:check` and `bun run escalations:check` all exit 0.
- `bun run api-surface contracts`: 0 extra and 0 mismatched. The 156 missing members are Stories 10.2–10.5's ports.

**Residual risks**
- XT-contracts-1's grammar check loads an empty classmap at the end, which resets the process-wide classmap. Runtime's registry tests do the same.
- The `get [Token]()` form is equivalent at runtime only; the typed form is `get [Token.brand]()`.

## Fidelity Review

### Reviewer 1: reject at tree a23fa9619da313984a46ecc2d4ba2313e51bd8f2

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `16df6f3df445b28f55a1f31aa096f538232a92b2`, on 2026-10-23T08:19:56.406Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and none are added or changed. |
| F-2: No expected value is weakened | n/a | No existing expected values or Upstream-derived assertions are changed; the added tests are Xaravel Tests. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests are changed, so no Upstream assertion count is reduced. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no assertion adaptation markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no relied-on Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared all three added Xaravel Tests with their consequence strings, AD-1.1 and ESC-10.1-1. The compile-time test supports its claim, but the runtime tests overstate what they verify. |
| F-8: No stub, fake or partial implementation of another Component | pass | Framework changes are confined to contracts. Tests call existing runtime and grader APIs; the proposed runtime and PSR infrastructure changes remain escalation proposals rather than cross-component implementations. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the full changed source and declaration inventory with AD-6 and DIV-1. All source operations are synchronous, accept no async callbacks and retain no asyncRoot tags; no tag is required. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/contract.test.ts`: XT-contracts-18 claims both doubles read parameter metadata, but its assertions only demonstrate method discovery and configured return values. ESC-10.1-1(b) explicitly says this ruling adds no parameter reader. Narrow the consequence to metadata storage and method discovery, or supply authorized reader behavior and assertions that distinguish parameter names.
- **F-7** `packages/contracts/tests/xaravel/contract.test.ts`: XT-contracts-1 says instanceof is true exactly when the prototype chain carries a brand getter, yet the test explicitly accepts an own data property containing true. Reword the consequence to describe reading a true brand property, including own and inherited properties, consistent with the implementation and ruling.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"a23fa9619da313984a46ecc2d4ba2313e51bd8f2","base":"16df6f3df445b28f55a1f31aa096f538232a92b2","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-23T08:19:56.406Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and none are added or changed.","findings":[]},{"id":"F-2","result":"n/a","note":"No existing expected values or Upstream-derived assertions are changed; the added tests are Xaravel Tests.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests are changed, so no Upstream assertion count is reduced.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no assertion adaptation markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no relied-on Oracle error fixtures.","findings":[]},{"id":"F-7","result":"fail","note":"Compared all three added Xaravel Tests with their consequence strings, AD-1.1 and ESC-10.1-1. The compile-time test supports its claim, but the runtime tests overstate what they verify.","findings":[{"path":"packages/contracts/tests/xaravel/contract.test.ts","detail":"XT-contracts-18 claims both doubles read parameter metadata, but its assertions only demonstrate method discovery and configured return values. ESC-10.1-1(b) explicitly says this ruling adds no parameter reader. Narrow the consequence to metadata storage and method discovery, or supply authorized reader behavior and assertions that distinguish parameter names."},{"path":"packages/contracts/tests/xaravel/contract.test.ts","detail":"XT-contracts-1 says instanceof is true exactly when the prototype chain carries a brand getter, yet the test explicitly accepts an own data property containing true. Reword the consequence to describe reading a true brand property, including own and inherited properties, consistent with the implementation and ruling."}]},{"id":"F-8","result":"pass","note":"Framework changes are confined to contracts. Tests call existing runtime and grader APIs; the proposed runtime and PSR infrastructure changes remain escalation proposals rather than cross-component implementations.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the full changed source and declaration inventory with AD-6 and DIV-1. All source operations are synchronous, accept no async callbacks and retain no asyncRoot tags; no tag is required.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree a23fa9619da313984a46ecc2d4ba2313e51bd8f2

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `16df6f3df445b28f55a1f31aa096f538232a92b2`, on 2026-10-23T08:19:56.406Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and the change adds or changes no Ported Test, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test is added or changed, so no expected value can be weakened against Upstream. The Xaravel Tests use exact assertSame comparisons for their own values. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so no Upstream assertion can be dropped. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. XT-contracts-3 and -4 are stopped by escalations, not by Skip Reasons. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker or cites a DIV clause. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed Oracle fixture is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | I compared each consequence string with its test body. XT-contracts-2: the missing-brand build exits non-zero and reports TS2420 naming [Arrayable.brand]; the complete class with both brands and [Symbol.iterator] builds with exit 0; encode()'s 'value instanceof Jsonable ? value.toJson()' on an unknown value builds only if instanceof narrows. That matches its string. XT-contracts-1: it checks the brand, toPrimitive for each hint, instanceof true for Post, Draft and ViaToken and false for the unbranded values, hasBrand, and jsonEncode. That matches its string, and AD-1.1 covers it. XT-contracts-18: the body checks the methods and parameters keys, that the copies are frozen and detached from the caller's input, and that Mockery's and PHPUnit's doubles read them. But it cites AD-1.1, and AD-1.1's text (shown in evidence (b)) covers only the contents, the brand key, Token.brand, implements, Symbol.hasInstance and Symbol.toPrimitive. It says nothing about Symbol.for('xaravel.contract.methods') or Symbol.for('xaravel.contract.parameters'). So the cited bullet is not the one this test verifies. |
| F-8: No stub, fake or partial implementation of another Component | pass | Only the contracts package and its own escalations change. The tokens use the existing Symbol.for keys and do not stub runtime's fqcn()/registerClass or the doubles. The fqcn() and PSR gaps were escalated (ESC-10.1-3, ESC-10.1-4) rather than faked. The new devDependencies are grader packages, used only in tests. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in Contract.ts or index.ts. Every exported declaration (the constants, ContractToken and contract()) is sync and does no IO behind a Driver contract method, so none needs a tag. The only async functions are test helpers outside src. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/contract.test.ts`: XT-contracts-18's consequence string cites AD-1.1, but AD-1.1 does not mention the token's method-name or parameter-name metadata the test verifies; that comes from ESC-10.1-1 (b) and ESC-4.5-1 item 3. Cite the consequence bullet that states the methods and parameters keys and their frozen { <method>: [<param>, …] } shape, if one exists in conformance/xaravel-consequences/contracts.jsonl. Otherwise remove the AD-1.1 token, or have the consequences regenerated so that a bullet carries that text.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"a23fa9619da313984a46ecc2d4ba2313e51bd8f2","base":"16df6f3df445b28f55a1f31aa096f538232a92b2","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-23T08:19:56.406Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and the change adds or changes no Ported Test, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is added or changed, so no expected value can be weakened against Upstream. The Xaravel Tests use exact assertSame comparisons for their own values.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so no Upstream assertion can be dropped.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip. XT-contracts-3 and -4 are stopped by escalations, not by Skip Reasons.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker or cites a DIV clause.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed Oracle fixture is an error.","findings":[]},{"id":"F-7","result":"fail","note":"I compared each consequence string with its test body. XT-contracts-2: the missing-brand build exits non-zero and reports TS2420 naming [Arrayable.brand]; the complete class with both brands and [Symbol.iterator] builds with exit 0; encode()'s `value instanceof Jsonable ? value.toJson()` on an unknown value builds only if instanceof narrows. That matches its string. XT-contracts-1: it checks the brand, toPrimitive for each hint, instanceof true for Post, Draft and ViaToken and false for the unbranded values, hasBrand, and jsonEncode. That matches its string, and AD-1.1 covers it. XT-contracts-18: the body checks the methods and parameters keys, that the copies are frozen and detached from the caller's input, and that Mockery's and PHPUnit's doubles read them. But it cites AD-1.1, and AD-1.1's text (shown in evidence (b)) covers only the contents, the brand key, Token.brand, implements, Symbol.hasInstance and Symbol.toPrimitive. It says nothing about Symbol.for('xaravel.contract.methods') or Symbol.for('xaravel.contract.parameters'). So the cited bullet is not the one this test verifies.","findings":[{"path":"packages/contracts/tests/xaravel/contract.test.ts","detail":"XT-contracts-18's consequence string cites AD-1.1, but AD-1.1 does not mention the token's method-name or parameter-name metadata the test verifies; that comes from ESC-10.1-1 (b) and ESC-4.5-1 item 3. Cite the consequence bullet that states the methods and parameters keys and their frozen { <method>: [<param>, …] } shape, if one exists in conformance/xaravel-consequences/contracts.jsonl. Otherwise remove the AD-1.1 token, or have the consequences regenerated so that a bullet carries that text."}]},{"id":"F-8","result":"pass","note":"Only the contracts package and its own escalations change. The tokens use the existing Symbol.for keys and do not stub runtime's fqcn()/registerClass or the doubles. The fqcn() and PSR gaps were escalated (ESC-10.1-3, ESC-10.1-4) rather than faked. The new devDependencies are grader packages, used only in tests.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in Contract.ts or index.ts. Every exported declaration (the constants, ContractToken and contract()) is sync and does no IO behind a Driver contract method, so none needs a tag. The only async functions are test helpers outside src.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 1791224ea8d690e2c9a69fa73b245165f21b0d2d

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `16df6f3df445b28f55a1f31aa096f538232a92b2`, on 2026-10-23T08:26:22.872Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and none are added or changed. |
| F-2: No expected value is weakened | n/a | No Upstream-derived expected values or expected exceptions are changed. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are added, changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no Oracle error fixtures relied on by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-contracts-1 checks true brand properties, inheritance, token coercion and runtime compatibility; XT-contracts-2 checks missing-brand diagnostics, successful branded compilation and narrowing. Their AD-1.1 citations match. XT-contracts-18 checks frozen metadata storage and method discovery by both doubles, matching its corrected consequence and cited rulings. |
| F-8: No stub, fake or partial implementation of another Component | pass | Implementation changes remain in contracts. Tests exercise existing runtime and grader APIs without implementing their behavior; the proposed cross-component changes appear only in escalations. |
| F-9: Every `@asyncRoot` tag is true | pass | The complete changed framework source contains synchronous token construction and property operations, with no IO roots, async callbacks or async declarations requiring tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/contracts/tests/xaravel/contract.test.ts`: XT-contracts-18 claims both doubles read parameter metadata, but its assertions only demonstrate method discovery and configured return values. ESC-10.1-1(b) explicitly says this ruling adds no parameter reader. Narrow the consequence to metadata storage and method discovery, or supply authorized reader behavior and assertions that distinguish parameter names. **fixed**: XT-contracts-18 now claims parameter metadata storage and method-list discovery, without claiming that doubles read parameter names.
- **P-2** (reviewer 1, F-7) `packages/contracts/tests/xaravel/contract.test.ts`: XT-contracts-1 says instanceof is true exactly when the prototype chain carries a brand getter, yet the test explicitly accepts an own data property containing true. Reword the consequence to describe reading a true brand property, including own and inherited properties, consistent with the implementation and ruling. **fixed**: XT-contracts-1 now describes a true brand property, own or inherited, matching its assertions and implementation.
- **P-3** (reviewer 2, F-7) `packages/contracts/tests/xaravel/contract.test.ts`: XT-contracts-18's consequence string cites AD-1.1, but AD-1.1 does not mention the token's method-name or parameter-name metadata the test verifies; that comes from ESC-10.1-1 (b) and ESC-4.5-1 item 3. Cite the consequence bullet that states the methods and parameters keys and their frozen { <method>: [<param>, …] } shape, if one exists in conformance/xaravel-consequences/contracts.jsonl. Otherwise remove the AD-1.1 token, or have the consequences regenerated so that a bullet carries that text. **fixed**: XT-contracts-18 removes AD-1.1 and cites ESC-10.1-1(b) and ESC-4.5-1 item 3 for its metadata claims.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"1791224ea8d690e2c9a69fa73b245165f21b0d2d","base":"16df6f3df445b28f55a1f31aa096f538232a92b2","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-23T08:26:22.872Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and none are added or changed.","findings":[]},{"id":"F-2","result":"n/a","note":"No Upstream-derived expected values or expected exceptions are changed.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are added, changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no Oracle error fixtures relied on by this Story.","findings":[]},{"id":"F-7","result":"pass","note":"XT-contracts-1 checks true brand properties, inheritance, token coercion and runtime compatibility; XT-contracts-2 checks missing-brand diagnostics, successful branded compilation and narrowing. Their AD-1.1 citations match. XT-contracts-18 checks frozen metadata storage and method discovery by both doubles, matching its corrected consequence and cited rulings.","findings":[]},{"id":"F-8","result":"pass","note":"Implementation changes remain in contracts. Tests exercise existing runtime and grader APIs without implementing their behavior; the proposed cross-component changes appear only in escalations.","findings":[]},{"id":"F-9","result":"pass","note":"The complete changed framework source contains synchronous token construction and property operations, with no IO roots, async callbacks or async declarations requiring tags.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/contract.test.ts","detail":"XT-contracts-18 claims both doubles read parameter metadata, but its assertions only demonstrate method discovery and configured return values. ESC-10.1-1(b) explicitly says this ruling adds no parameter reader. Narrow the consequence to metadata storage and method discovery, or supply authorized reader behavior and assertions that distinguish parameter names.","fixed":true,"note":"XT-contracts-18 now claims parameter metadata storage and method-list discovery, without claiming that doubles read parameter names."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/contract.test.ts","detail":"XT-contracts-1 says instanceof is true exactly when the prototype chain carries a brand getter, yet the test explicitly accepts an own data property containing true. Reword the consequence to describe reading a true brand property, including own and inherited properties, consistent with the implementation and ruling.","fixed":true,"note":"XT-contracts-1 now describes a true brand property, own or inherited, matching its assertions and implementation."},{"id":"P-3","reviewer":2,"item":"F-7","path":"packages/contracts/tests/xaravel/contract.test.ts","detail":"XT-contracts-18's consequence string cites AD-1.1, but AD-1.1 does not mention the token's method-name or parameter-name metadata the test verifies; that comes from ESC-10.1-1 (b) and ESC-4.5-1 item 3. Cite the consequence bullet that states the methods and parameters keys and their frozen { <method>: [<param>, …] } shape, if one exists in conformance/xaravel-consequences/contracts.jsonl. Otherwise remove the AD-1.1 token, or have the consequences regenerated so that a bullet carries that text.","fixed":true,"note":"XT-contracts-18 removes AD-1.1 and cites ESC-10.1-1(b) and ESC-4.5-1 item 3 for its metadata claims."}]}
```

### Reviewer 2: pass at tree 1791224ea8d690e2c9a69fa73b245165f21b0d2d

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `16df6f3df445b28f55a1f31aa096f538232a92b2`, on 2026-10-23T08:26:22.872Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and the change adds or changes no Ported Test, so there is no Upstream assertion to match. |
| F-2: No expected value is weakened | pass | No Ported Tests. I checked the expected values in the touched Xaravel Tests (XT-contracts-1, -2, -18). They are exact assertSame/assertTrue/assertFalse comparisons of brand keys, FQCN strings, JSON encodings, TS2420 codes and exit codes, and none is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so no Upstream assertion count applies. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. XT-contracts-3 and -4 are held by escalations ESC-10.1-3 and ESC-10.1-4, not by Skip Reasons. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker and no Expectations adapted field is set. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed Oracle fixture is an error, and there are no Ported Tests. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-contracts-1 checks every part of its consequence string against AD-1.1. Its brand key is Symbol.for(FQCN). instanceof is true for own and inherited true brand properties: Post, Draft, Object.create(new Post()), a plain object and a function. It is false for missing or non-true brands and never throws. toPrimitive returns the key, and ViaToken shows it is the same property. hasBrand and jsonEncode read it. XT-contracts-2 builds with tsc and checks four things: TS2420 naming [Arrayable.brand] is the only error code when the brand is missing, a class with both brands and [Symbol.iterator] compiles, and encode() compiling shows instanceof narrows to the interface. Together these verify AD-1.1's compile-time brand. XT-contracts-18 checks its narrowed consequence: the metadata keys, the frozen, copied {method:[params]} record, and Mockery's and PHPUnit's doubles taking their method list from the token. It cites no AD/FR token. |
| F-8: No stub, fake or partial implementation of another Component | pass | The only code change is in packages/contracts. The new devDependencies (@​xaravel/assert, @​xaravel/mockery) are grader packages used only by tests. There is no stub or fake of runtime/registry behaviour: the fqcn() and PSR gaps are escalated (ESC-10.1-3, ESC-10.1-4) instead of worked around. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g): Contract.ts and index.ts hold no @​asyncRoot tags, and every declaration is sync (constants, a type, normaliseFqcn, copyMembers, contract). None performs IO or takes a callback, so no tag is missing. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/contracts/tests/xaravel/contract.test.ts`: XT-contracts-18 claims both doubles read parameter metadata, but its assertions only demonstrate method discovery and configured return values. ESC-10.1-1(b) explicitly says this ruling adds no parameter reader. Narrow the consequence to metadata storage and method discovery, or supply authorized reader behavior and assertions that distinguish parameter names. **fixed**: XT-contracts-18's consequence now ends with 'doubles take their method list from the token'. It no longer claims the doubles read parameter names, and the Double/createMock assertions check method discovery, which matches the narrowed claim.
- **P-2** (reviewer 1, F-7) `packages/contracts/tests/xaravel/contract.test.ts`: XT-contracts-1 says instanceof is true exactly when the prototype chain carries a brand getter, yet the test explicitly accepts an own data property containing true. Reword the consequence to describe reading a true brand property, including own and inherited properties, consistent with the implementation and ruling. **fixed**: XT-contracts-1's consequence now reads 'true exactly when x (an object or function) has a property at the brand key, own or inherited, whose value is true'. This matches the implementation and the own-data-property and inherited cases the test asserts.
- **P-3** (reviewer 2, F-7) `packages/contracts/tests/xaravel/contract.test.ts`: XT-contracts-18's consequence string cites AD-1.1, but AD-1.1 does not mention the token's method-name or parameter-name metadata the test verifies; that comes from ESC-10.1-1 (b) and ESC-4.5-1 item 3. Cite the consequence bullet that states the methods and parameters keys and their frozen { <method>: [<param>, …] } shape, if one exists in conformance/xaravel-consequences/contracts.jsonl. Otherwise remove the AD-1.1 token, or have the consequences regenerated so that a bullet carries that text. **fixed**: XT-contracts-18's consequence string no longer cites AD-1.1. It cites ESC-10.1-1 (b) and ESC-4.5-1 item 3, which state the metadata keys and shape (evidence (e) notes it cites no FR/AD id).

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"1791224ea8d690e2c9a69fa73b245165f21b0d2d","base":"16df6f3df445b28f55a1f31aa096f538232a92b2","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-23T08:26:22.872Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and the change adds or changes no Ported Test, so there is no Upstream assertion to match.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Tests. I checked the expected values in the touched Xaravel Tests (XT-contracts-1, -2, -18). They are exact assertSame/assertTrue/assertFalse comparisons of brand keys, FQCN strings, JSON encodings, TS2420 codes and exit codes, and none is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so no Upstream assertion count applies.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip. XT-contracts-3 and -4 are held by escalations ESC-10.1-3 and ESC-10.1-4, not by Skip Reasons.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker and no Expectations adapted field is set.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed Oracle fixture is an error, and there are no Ported Tests.","findings":[]},{"id":"F-7","result":"pass","note":"XT-contracts-1 checks every part of its consequence string against AD-1.1. Its brand key is Symbol.for(FQCN). instanceof is true for own and inherited true brand properties: Post, Draft, Object.create(new Post()), a plain object and a function. It is false for missing or non-true brands and never throws. toPrimitive returns the key, and ViaToken shows it is the same property. hasBrand and jsonEncode read it. XT-contracts-2 builds with tsc and checks four things: TS2420 naming [Arrayable.brand] is the only error code when the brand is missing, a class with both brands and [Symbol.iterator] compiles, and encode() compiling shows instanceof narrows to the interface. Together these verify AD-1.1's compile-time brand. XT-contracts-18 checks its narrowed consequence: the metadata keys, the frozen, copied {method:[params]} record, and Mockery's and PHPUnit's doubles taking their method list from the token. It cites no AD/FR token.","findings":[]},{"id":"F-8","result":"pass","note":"The only code change is in packages/contracts. The new devDependencies (@xaravel/assert, @xaravel/mockery) are grader packages used only by tests. There is no stub or fake of runtime/registry behaviour: the fqcn() and PSR gaps are escalated (ESC-10.1-3, ESC-10.1-4) instead of worked around.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g): Contract.ts and index.ts hold no @asyncRoot tags, and every declaration is sync (constants, a type, normaliseFqcn, copyMembers, contract). None performs IO or takes a callback, so no tag is missing.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/contract.test.ts","detail":"XT-contracts-18 claims both doubles read parameter metadata, but its assertions only demonstrate method discovery and configured return values. ESC-10.1-1(b) explicitly says this ruling adds no parameter reader. Narrow the consequence to metadata storage and method discovery, or supply authorized reader behavior and assertions that distinguish parameter names.","fixed":true,"note":"XT-contracts-18's consequence now ends with 'doubles take their method list from the token'. It no longer claims the doubles read parameter names, and the Double/createMock assertions check method discovery, which matches the narrowed claim."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/contract.test.ts","detail":"XT-contracts-1 says instanceof is true exactly when the prototype chain carries a brand getter, yet the test explicitly accepts an own data property containing true. Reword the consequence to describe reading a true brand property, including own and inherited properties, consistent with the implementation and ruling.","fixed":true,"note":"XT-contracts-1's consequence now reads 'true exactly when x (an object or function) has a property at the brand key, own or inherited, whose value is true'. This matches the implementation and the own-data-property and inherited cases the test asserts."},{"id":"P-3","reviewer":2,"item":"F-7","path":"packages/contracts/tests/xaravel/contract.test.ts","detail":"XT-contracts-18's consequence string cites AD-1.1, but AD-1.1 does not mention the token's method-name or parameter-name metadata the test verifies; that comes from ESC-10.1-1 (b) and ESC-4.5-1 item 3. Cite the consequence bullet that states the methods and parameters keys and their frozen { <method>: [<param>, …] } shape, if one exists in conformance/xaravel-consequences/contracts.jsonl. Otherwise remove the AD-1.1 token, or have the consequences regenerated so that a bullet carries that text.","fixed":true,"note":"XT-contracts-18's consequence string no longer cites AD-1.1. It cites ESC-10.1-1 (b) and ESC-4.5-1 item 3, which state the metadata keys and shape (evidence (e) notes it cites no FR/AD id)."}]}
```

### Maintainer rulings, 2026-10-23

- `decisions/ESC-10.1-3.md`: option 1. `fqcn()` reads a frozen token's own `Symbol.for('xaravel.class.fqcn')` key, built by new Story 9.14 (`runtime`). XT-contracts-3 resumes once 9.14 is `done`.
- `decisions/ESC-10.1-4.md`: option 1. The PSR interfaces join `conformance/api-surface/contracts.jsonl` through action item `epic-10-item-1-psr-api-surface`. XT-contracts-4 resumes once that item is `done`, taking the PSR tokens' metadata from those rows.
