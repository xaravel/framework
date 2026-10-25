---
title: 'A contract token is its FQCN class-string as a PHP value; a lint rule refuses string-coercing one (epic-10-retro-item-10)'
type: 'feature'
created: '2026-10-24'
status: 'in-progress'
baseline_revision: '1b036b9ad99750db5d2038e3dc23b9761f8804e4'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/decisions/MAINT-2026-10-24-epic-10-items.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-retro-2026-10-24.md'
  - '{project-root}/conformance/xaravel-consequences/runtime.jsonl'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** A contract token reads as a PHP array everywhere a PHP value is read (retro L1, L2): `jsonEncode(Arrayable)` writes `{}` or `[]`, `phpSerialize` an `a:0:{}`, assert's exporter an `Array &0 []`, and `assertSame(Arrayable, 'Illuminate\\Contracts\\Support\\Arrayable')` fails. PHP's `Arrayable::class` is a string. Mockery's `with(Arrayable)` matches only the token object itself, while Mockery 1.6.15's `_matchArg` matches `with(Arrayable::class)` against the string and any instance.

**Approach:** AD-9.8 (`conformance/xaravel-consequences/runtime.jsonl:41`) and the Maintainer's ruling (item 2 and "Item 10's route"). Runtime's encoders use runtime's `isContractToken`; assert reads a token through its grader-side copy, with one helper `classString(value)` (a token as its own FQCN string, any other value as it is) applied where assert reads a PHP value for `==`, `===`, its exporter and `varExport`. Mockery prints and matches a token as that string. A new syntactic `xaravel/no-token-string-coercion` rule refuses string-coercing a token in `packages/*/src`. XT-contracts-11 and XT-contracts-19 re-pin to JS identity.

## Boundaries & Constraints

**Always:** Change only `packages/runtime`, `packages/assert`, `packages/mockery`, `tools/lint-rules` and the lint tests in `conformance/tests/xaravel/lint*.test.ts` (the rule's tests), the `"rules"` block of `.oxlintrc.json` (one line, enabling the rule), and in `packages/contracts` only XT-contracts-11 (`aliases.test.ts`) and XT-contracts-19 (`hardening.test.ts`), plus this item's records. Grader isolation (AD-15): assert and Mockery import nothing from `@xaravel/runtime` or `@xaravel/contracts`. JS coercion is unchanged: `Symbol.toPrimitive` still gives the brand. `phpType` is unchanged (callers cast `as string`). Every re-pin keeps or tightens its check.

**Never:** Change `conformance/expectations/**`, an item's `action`, any other `packages/contracts` file, any other Protected Path, or any other `.oxlintrc.json` line. Never remove or weaken an assertion. Never let assert or Mockery read a token as a string anywhere but the listed paths (no `gettype`, `isScalar` or `assertIsString` change).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| jsonEncode | `jsonEncode(Arrayable)`, `jsonEncode([Arrayable])`, `{a: Arrayable}` | `"Illuminate\\/Contracts\\/Support\\/Arrayable"` as json_encode writes the string (flags honoured, e.g. UNESCAPED_SLASHES) | none |
| phpSerialize | `phpSerialize(Arrayable)`, in an array, an object property | `s:<len>:"Illuminate\\Contracts\\Support\\Arrayable";`, one slot each | none |
| varExport | `phpVarExport(Arrayable)`, nested | `'Illuminate\\Contracts\\Support\\Arrayable'` | none |
| Exporter | failure text of `assertSame(Arrayable, 1)`, a token in an array | the token exported as the quoted string | none |
| assertSame / assertEquals | `(Arrayable, its FQCN)`, `([Arrayable], [FQCN])`, `(Arrayable, Arrayable)` | pass; `(Arrayable, Jsonable)` fails with the two-string message and diff | AssertionFailedError |
| Mockery with(token) | `with(Arrayable)` vs the token, the FQCN string, an Arrayable double, an unrelated object, another string | match, match, match, no match, no match | NoMatchingExpectationException |
| Mockery display | a token argument in a no-match message | `'Illuminate\\Contracts\\Support\\Arrayable'` | — |
| Lint | `` `${Arrayable}` ``, `String(support.Arrayable)`, `"x" + Arrayable`, `Arrayable.toString()`, a `contract(...)` const in a template, in `packages/*/src` | each fails `xaravel/no-token-string-coercion` | lint error |
| Lint passing | `fqcn(Arrayable)` in a template; the same coercions in `tests/` or `tools/`; a camelCase import from contracts | clean | — |

</intent-contract>

## Code Map

- `packages/runtime/src/registry/registry.ts:139-150` -- `isContractToken`, private `tokenFqcn`. Export a `contractTokenFqcn(value): string | null` (or reuse `fqcn`) for the encoders.
- `packages/runtime/src/php/jsonEncode.ts:179-184` -- after the `null` case, before `phpType`: a token encodes as its FQCN through `encodeString`.
- `packages/runtime/src/php/phpSerialize.ts:120-121` -- in `serializeValue`, after `state.slots++`: a token is `serializeString(fqcn)`.
- `packages/assert/src/Framework/MockObject/Generator/ContractParents.ts:58-75` -- the grader's `isContractToken`, `contractTokenName` (no imports, so no cycle).
- `packages/assert/src/comparison/PhpValues.ts:33` -- beside `unmarkFloat`: add `classString(value)`.
- `packages/assert/src/comparison/PhpComparison.ts:402-406,488-496` -- `loose`/`strict`: read both sides through `classString` first.
- `packages/assert/src/exporter/Exporter.ts:108,193` and `exporter/VarExport.ts:28,87` -- the value read: `classString` before `unmarkFloat`.
- `packages/assert/src/Framework/Constraints.ts:42-131` -- `IsIdentical`/`IsEqual`: hold `classString(value)`, read `classString(other)`, so a token against a string gets the string message and diff.
- `packages/assert/src/comparator/ArrayComparator.ts:58,117` -- elements through `classString` before `getComparatorFor`.
- `packages/assert/src/index.ts` -- export `classString` for Mockery.
- `packages/mockery/src/Mockery/Expectation.ts:410-430` -- `_matchArg`: a token expected matches an `instanceof` object, else `phpLooseEquals(fqcn, actual)` (Expectation.php 949-980, 1.6.15 `967a801b`).
- `packages/mockery/src/support/values.ts:112-180,212-245,275` -- `phpString`, `formatArgument`, `cleanupArray`/`cleanupNesting`, `getDebugType`: a token as its string.
- `packages/mockery/src/JMac/Testing/Diagnostics/ValueFormatter.ts:9-17` -- `describe`: a token as `varExport` of its string.
- `tools/lint-rules/plugin.ts:127-166` -- `RULE_NAMES`, `MESSAGES`; add the rule (`isPackageSource` scope). `tools/lint-rules/disables.ts:72` `SPINE_RULES` gains it (spine AD-9 calls it a lint error). Fixtures under `tools/lint-rules/fixtures/identity-values/`.
- `conformance/tests/xaravel/lint-rules.test.ts:116-130` (XT-conformance-132 `RULE_NAMES`), `lint-signatures.test.ts:128-131` (`toHaveLength(13)`), `lint.test.ts:174-191` (XT-conformance-131 `SPINE_RULES`) -- the rule-list pins extend by one.
- `packages/contracts/tests/xaravel/aliases.test.ts:233-299`, `hardening.test.ts:55-101` -- resolver-result `assertSame` calls become an identity helper (`===` and `typeof` not string for a token).

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/registry/registry.ts`, `src/php/jsonEncode.ts`, `src/php/phpSerialize.ts` -- encode a token as its FQCN string -- AD-9.8.
- `packages/assert/src/comparison/PhpValues.ts`, `PhpComparison.ts`, `exporter/Exporter.ts`, `exporter/VarExport.ts`, `Framework/Constraints.ts`, `comparator/ArrayComparator.ts`, `src/index.ts` -- `classString` at each listed read -- AD-9.8.
- `packages/mockery/src/Mockery/Expectation.ts`, `support/values.ts`, `JMac/Testing/Diagnostics/ValueFormatter.ts` -- `_matchArg` and display -- route item 3.
- `tools/lint-rules/plugin.ts`, `disables.ts`, fixtures; `.oxlintrc.json` one rule line; the three lint tests' pins and XT-conformance-267 (failing and passing fixtures per matrix row) -- the approved tools change.
- `packages/contracts/tests/xaravel/aliases.test.ts`, `hardening.test.ts` -- identity re-pins -- route item 1.
- `packages/contracts/tests/xaravel/psr.test.ts`, `namespaces.test.ts`, `web.test.ts`, `contract.test.ts`, `token-predicate.test.ts`, and any other non-Protected XT check whose expected value is a token -- identity re-pins under the general rule (Change Log, resume after #401).
- The `[patch]` rows held at the last HALT (Change Log, resume after #401) -- Mockery `_matchArg` and `EqualsMatcher`, `classString` via `contractTokenName`, the added tests, the rule's Limits, XT-runtime-41's Scope Frame.
- New XT tests declaring AD-9.8: XT-runtime-41 (both encoders), XT-assert-101 (exporter, varExport, assertSame/assertEquals/assertNotSame incl. nested and failure text), XT-mockery-16 (matrix rows).

**Acceptance Criteria:**
- Given `assertSame(Arrayable, 'Illuminate\\Contracts\\Support\\Arrayable')`, when it runs, then it passes; and `` `${Arrayable}` `` still gives the brand key (JS coercion unchanged).
- Given XT-contracts-11 and XT-contracts-19, when a resolver returns the FQCN string instead of the token, then they fail.
- Given the full `bun run harness`, `bun run typecheck` and `bun run lint`, when run, then there are no differences and no errors.

## Spec Change Log

### 2026-10-24 — resume after #397

- **Trigger:** the build stopped (#396) because XT-contracts-12 (`packages/contracts/tests/xaravel/aliases.test.ts:369`) had the same token-not-string `assertSame` check as XT-contracts-11/19. The Maintainer approved the same identity re-pin for it ("Item 10's route", item 1, *Added after #396*, PR #397).
- **Amended:** the scope in Boundaries reads with XT-contracts-12 beside XT-contracts-11 and XT-contracts-19 (all three in `aliases.test.ts` / `hardening.test.ts`). Line 369 now calls the file's `assertSameAbstract` helper. No other `packages/contracts` line changes. The I/O matrix's jsonEncode row reads `"Illuminate\\Contracts\\Support\\Arrayable"`: an FQCN has no `/`, so the token encodes exactly as `json_encode` writes its FQCN string under every flag (XT-runtime-41), and `JSON_UNESCAPED_SLASHES` changes nothing.
- **Known-bad state avoided:** merging the item with XT-contracts-12 left as an `assertSame`, which a resolver returning the FQCN string would pass.
- **KEEP:** the whole built change on this branch; only the one re-pin is added.

### 2026-10-24 — resume after #401

- **Trigger:** the review found five more token-identity checks in `packages/contracts` (XT-contracts-4, -5, -8, -18, -20, rows below), and the build stopped a third time (#399). The Maintainer replaced the line-by-line list with one general rule ("Item 10's route", item 1, *Added after #399, as a general rule*, PR #401).
- **Amended:** the `packages/contracts` scope in Boundaries now reads as that rule: in any Xaravel Test (`xaravelTest`, an `XT-*` id) under `packages/<c>/tests/**` that is not a Protected Path, an `assertSame` or `assertEquals` whose expected value is a contract token re-pins to JS identity with the `assertSameAbstract` pattern (the PHP check, then the same `typeof`, then `===`). Ported Tests (`portedTest`) and Protected test files (`conformance/**`, `packages/assert/**`, `packages/mockery/**`) are not covered; a check of this kind in one of them stops the item. Known sites: `psr.test.ts:147`, `namespaces.test.ts:274`, `web.test.ts:308`, `contract.test.ts:215-216,221-222`, `token-predicate.test.ts:59` (its `bareParent` is a frozen object with a non-writable `CLASS_FQCN`, so a token to both predicates). The implementer sweeps every non-Protected `packages/*/tests/**` file again for any other such check, and the PR lists every check re-pinned under this rule. No assertion is removed.
- **Also applied this pass** (the triage rows marked `[patch]`, held at the last HALT):
  - Mockery `_matchArg` must not throw on a token without `Symbol.hasInstance`: a token expected that cannot answer `instanceof` falls through to `==` on its FQCN string.
  - JMac `EqualsMatcher` compares a token expected strictly, as a class-string (`===` on the FQCN), as Upstream JMac does.
  - `classString` reads the name through `contractTokenName`, not a second token-name rule.
  - Tests for nested canonicalizing in `varExport`/the exporter, an `InvokedCount` message naming a token, `with(FQCN)` against a token argument, and a nested `with([token])`.
  - The lint rule's Limits list the uncaught forms: `+` with a non-literal operand, unary `+`, `Number(token)`.
  - XT-runtime-41's `jsonLastError()` checks run inside a Scope Frame and first record a non-zero error, so the `0` after encoding a token is meaningful (reviewer 2's first F-7 finding).
- **Recorded, no code:** `packages/runtime` has no `var_export` port (`packages/runtime/src/php/` has none). The ruling's "`phpVarExport` (`packages/runtime`)" is assert's `exporter/VarExport.ts`, exported as `phpVarExport`, which XT-assert-101 covers (reviewer 2's second F-7 finding).
- **Baseline:** `baseline_revision` moved to `1b036b9a`, the `origin/main` this branch last merged, so the review diff is exactly the item's change.
- **KEEP:** the whole built change on this branch.

## Review Triage Log

### 2026-10-24 — Review pass
- verdicts: 27 findings — high 2, medium 4, low 12, false 2, maybe-false 7
- findings:
  - `[low]` `[reject]` (blind) Spec Change Log names edits that are not made in Boundaries or the matrix — the fix is a spec edit, and `<intent-contract>` is read-only at review; the Change Log entry is the amendment record.
  - `[low]` `[reject]` (blind) AC and Verification omit XT-contracts-12 — spec edit; recorded in the Change Log.
  - `[low]` `[reject]` (blind) Auto Run Result is stale — spec edit; rewritten at this HALT.
  - `[low]` `[reject]` (blind) the lint rule also covers `installer/src` — it reuses the plugin's existing `isPackageSource` scope, which AD-16.4 package source includes; widening to spec wording would add a branch for no user harm.
  - `[low]` `[reject]` (blind) Code Map lists a `registry.ts` change not made — spec edit; the encoders reuse `fqcn`, as the Code Map allows ("or reuse `fqcn`").
  - `[low]` `[patch]` (blind, edge) the rule skips `+` with a non-literal or token operand, unary `+` and `Number(token)` — real (they throw at runtime, loudly); smallest fix is listing them under the rule's Limits. Not applied: the pass halts on an intent gap.
  - `[low]` `[reject]` (blind) a shadowing local cannot be disabled — documented limit; a rename fixes it, and nothing in `src/` shadows a token name today.
  - `[low]` `[patch]` (blind) `classString` re-reads the FQCN instead of `contractTokenName` — duplicate token-name rule (epic 4/10 lesson). Not applied: halt.
  - `[maybe-false]` `[defer]` (blind) assert's `phpToString` and runtime's `looseEquals` still treat a token as an object — medium if true; settle by asking whether the ruling's "as a PHP value" reaches runtime `==`, which the action does not list. Not applied: halt.
  - `[maybe-false]` `[defer]` (blind) `assertIsString(token)` prints a quoted string and fails — low/medium if true; the ruling keeps `gettype` unchanged, so the message follows from the approved exporter change.
  - `[low]` `[patch]` (blind) XT-mockery-16 lacks `with(FQCN)` vs a token argument and a nested `with([token])` — test gap. Not applied: halt.
  - `[low]` `[reject]` (blind) `assertSameAbstract` fails with "false is true" and is copied in two files — the `typeof` line before it already names the string case; cosmetic.
  - `[low]` `[reject]` (blind) XT-runtime-41 compares flags against `jsonEncode(FQCN, flags)` — the string path is pinned by the existing jsonEncode tests; cosmetic.
  - `[false]` `[reject]` (blind) Code Map line numbers for `ArrayComparator.ts` and the `oversized` warning — not a defect in the change.
  - `[medium]` `[patch]` (edge) Mockery `_matchArg` runs `instanceof` on a token without `Symbol.hasInstance` (a genuine token, XT-contracts-20's `bareParent`) and throws TypeError instead of no-match. Not applied: halt.
  - `[low]` `[reject]` (edge) an empty-FQCN token compares equal to `""` — `contract()` refuses an empty name; only a hand-built object reaches it.
  - `[high]` `[intent_gap]` (edge, verification) XT-contracts-4 (`psr.test.ts:147`), XT-contracts-5 (`namespaces.test.ts:274`), XT-contracts-8 (`web.test.ts:308`), XT-contracts-18 (`contract.test.ts:215-216,221-222`) and XT-contracts-20 (`token-predicate.test.ts:59`) check `assertSame(parentToken, parents[i])`. Under AD-9.8 they also pass when a parent is stored as its FQCN string, so merging as built weakens them. Verified at each line: no `===` or `typeof` check beside them. "Item 10's route" lets only XT-contracts-11, 12 and 19 change, and says any other such check stops the item.
  - `[high]` `[intent_gap]` (verification) same root cause as the row above (grouped).
  - `[medium]` `[patch]` (verification) JMac `EqualsMatcher` now loosely matches `with(token)` against `true`, where Upstream JMac compares a class-string with `===`. Not applied: halt.
  - `[medium]` `[patch]` (verification) `classString` in `VarExport.serialize` and `Exporter.shortenedExport` is not observed by a test (nested canonicalizing, an `InvokedCount` message). Not applied: halt.
  - `[medium]` `[patch]` (verification, other) the `EqualsMatcher` defect (grouped with the row above it).
  - `[maybe-false]` `[defer]` (intent) the new tests use stand-in tokens, not `@xaravel/contracts` exports — would be low; both predicates are structural and XT-contracts-20 pins them equal.
  - `[maybe-false]` `[defer]` (intent) Mockery `getDebugType` gives `string` for a token — follows from "prints as that string"; settle at the ruling.
  - `[false]` `[reject]` (intent) `with(Arrayable)` matches anything PHP-`==` to the FQCN — that is Mockery 1.6.15's `_matchArg` (`$expected == $actual`), which the route approves.
  - `[maybe-false]` `[defer]` (intent) the literal deviations (jsonEncode row, XT-contracts-12, `installer/src`) — recorded in the Change Log and rows above.
  - `[maybe-false]` `[defer]` (fidelity, reviewer 2, evidence gap noted) `jsonLastError()` may read 0 outside a Scope Frame — settle by checking whether the harness preload opens a frame.
  - `[maybe-false]` `[defer]` (fidelity, reviewer 2, evidence gap noted) runtime `phpVarExport` — there is no runtime var_export port (`packages/runtime/src/php/` has none); it is assert's `exporter/VarExport.ts`, as the retro finding records.

Cascade: an intent_gap exists, so lower entries are moot this pass. The attempted change stays on branch `planning/retro-10-token-class-string` (pushed) instead of a patch file, as the run before did.

## Design Notes

The lint rule is syntactic, as the plugin's rules are: a token is a value imported by name, PascalCase, from `@xaravel/contracts` or a subpath, a PascalCase member of a namespace import of one, or a `const` bound to a `contract(...)` call in the file. Coercions: a template-literal expression, `String(x)`, `x.toString()`, `+`/`+=` with a string or template operand. Its limits (a token passed through a variable or function, `[x].join()`) go in the rule's doc comment (epic 6 lesson).

Mockery `_matchArg` order for a token, following Upstream with `$expected` the class-string: identity; not a matcher; `is_object($actual) && $actual instanceof $expected`; else `$expected == $actual`.

## Verification

**Commands:**
- `bun run harness --xaravel` -- expected: no differences; XT-runtime-41, XT-assert-101, XT-mockery-16, XT-conformance-267, XT-contracts-11 and XT-contracts-19 pass.
- `bun run harness` -- expected: no differences, `SUMMARY` line clean (NOT-RUN Variants are fine).
- `bun run typecheck` -- expected: no errors.
- `bun run lint` -- expected: no errors; the new rule reports nothing on the repository.

## Auto Run Result

Status: in-progress (built after #401; resume at step 4, review). The Fidelity Review runs again, as the tree changed.

Applied this pass, on the general rule and the held `[patch]` rows (Change Log, resume after #401):
- Identity re-pins, every one through the one shared helper `assertSameAbstract` (`packages/contracts/tests/xaravel/support/contract-namespaces.ts`; the local copies in `aliases.test.ts` and `hardening.test.ts` now import it):
  - XT-contracts-4: `psr.test.ts:148`, each parent of each PSR contract.
  - XT-contracts-5: `namespaces.test.ts:275`, each Upstream `extends` parent.
  - XT-contracts-8: `web.test.ts:309`, each Upstream `extends` parent.
  - XT-contracts-18: `contract.test.ts:216-217,222-223`, `P` and `Q` before and after mutating `given`.
  - XT-contracts-20: `token-predicate.test.ts:59`, `bareParent`.
  - Kept from earlier passes: XT-contracts-11, -12 (`aliases.test.ts`) and XT-contracts-19 (`hardening.test.ts`).
- Sweep: a temporary probe in `IsIdentical` / `IsEqual` logged every `assertSame` / `assertEquals` family call whose expected value is a contract token, over `bun test packages` and the five `conformance/tests/xaravel` files that touch contracts. After the re-pins, every hit in a non-Protected file goes through `assertSameAbstract`. The other hits are `packages/assert/tests/xaravel/operands.ts` (the Oracle matrix's `'Countable'` / `'Traversable'` operands, which stand for PHP strings, so not a JS-identity check) and XT-assert-101's own cases. No hit in `conformance/tests`. The probe was removed.
- Mockery `_matchArg`: a token expected without a function `Symbol.hasInstance` skips the `instanceof` step and falls through to `==` on its FQCN.
- JMac `EqualsMatcher`: reads both sides through `classString` first, so a token compares strictly as its class-string.
- `classString` reads the name through `contractTokenName`. A token it cannot name (an empty FQCN) stays the object it is.
- Tests added. XT-assert-101: nested canonicalizing (`serialize`'s `classString` is observed; removing it fails the test) and `InvokedCount` messages naming a token (`shortenedExport`'s `classString` is observed). XT-mockery-16: `with(FQCN)` against a token argument, nested `with([token])`, a token with no `Symbol.hasInstance` (removing the guard throws a TypeError), and `EqualsMatcher` (the old code matched a plain object with the same keys).
- The lint rule's Limits list `+` with a non-literal operand, unary `+` and `Number(token)`.
- XT-runtime-41: the `jsonLastError()` checks run in a unit frame, after a recorded `JSON_ERROR_SYNTAX`.

Verification:
- `bun run typecheck` and `bun run lint` are clean.
- `bun run harness --xaravel`: 368 passed, 0 failed, 5 skipped.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`.

## Fidelity Review

### Reviewer 1: pass at tree a3bf3e0e0a666ba8cc8d0f12608987dd55de9770

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `9a4d239c47a5d66c0759f38292dc2360bb325958`, on 2026-10-25T02:07:54.381Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Test, so there are no Upstream assertions to match. |
| F-2: No expected value is weakened | pass | The changed export-list expectation remains exact and adds classString. Token/string equality follows the supplied Maintainer ruling; no expected value or exception expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed and no Upstream assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The touched tests check their declared export isolation, token comparisons, exact diagnostics, encodings, serialization slots and JS coercion. Their AD-15.9 and AD-9.8 citations match those subjects and the supplied rulings. |
| F-8: No stub, fake or partial implementation of another Component | pass | The shown changes stay within the authorized runtime, assert and mockery components. Stand-in tokens are test fixtures permitted by grader isolation; no other component's implementation is stubbed. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source and declaration inventory with AD-6 and DIV-1. These files retain no asyncRoot tags and introduce no IO root or async callback API requiring one. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"a3bf3e0e0a666ba8cc8d0f12608987dd55de9770","base":"9a4d239c47a5d66c0759f38292dc2360bb325958","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-25T02:07:54.381Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Test, so there are no Upstream assertions to match.","findings":[]},{"id":"F-2","result":"pass","note":"The changed export-list expectation remains exact and adds classString. Token/string equality follows the supplied Maintainer ruling; no expected value or exception expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed and no Upstream assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"The touched tests check their declared export isolation, token comparisons, exact diagnostics, encodings, serialization slots and JS coercion. Their AD-15.9 and AD-9.8 citations match those subjects and the supplied rulings.","findings":[]},{"id":"F-8","result":"pass","note":"The shown changes stay within the authorized runtime, assert and mockery components. Stand-in tokens are test fixtures permitted by grader isolation; no other component's implementation is stubbed.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source and declaration inventory with AD-6 and DIV-1. These files retain no asyncRoot tags and introduce no IO root or async callback API requiring one.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree a3bf3e0e0a666ba8cc8d0f12608987dd55de9770

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `9a4d239c47a5d66c0759f38292dc2360bb325958`, on 2026-10-25T02:07:54.381Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and changes no Ported Test; only Xaravel Tests (XT-assert-3, XT-assert-101, XT-mockery-16, XT-runtime-41) are touched. |
| F-2: No expected value is weakened | pass | No Ported Test changes. The one changed expected value is XT-assert-3's exact export list, which gains 'classString'. It is still an exact toEqual, made to match a real new export, so it is not loosened. No stale_tests path is in scope. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there are no Upstream assertions to count. XT-assert-3 loses no assertion. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed Oracle fixture is an error, and the touched XTs declare no Oracle request. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Traced each XT body against the changed code. XT-assert-101: classString, phpStrict/LooseEquals (e.g. token == true is true, token == 0 is false), assertSame/assertEquals pass and fail messages with diffs, canonicalizing, assertNotSame/NotEquals, exporter, varExport and the unchanged assertIsString all match its string. XT-mockery-16: the _matchArg token branch (identity, instanceof via Symbol.hasInstance, else == on the FQCN string), the no-match messages and phpString/formatArgument/getDebugType/ValueFormatter match its string and ruling item 3. XT-runtime-41: jsonEncode under the flags, phpSerialize slots (r:4) and String(token) throwing TypeError check what they claim. AD-9.8 is the bullet each test verifies. Two gaps remain, below. |
| F-8: No stub, fake or partial implementation of another Component | pass | Source changes are in packages/runtime (jsonEncode, phpSerialize), packages/assert (classString, comparisons, constraints, exporter, VarExport) and packages/mockery (Expectation._matchArg, values, ValueFormatter), all listed components. Mockery uses assert's grader-side classString and isContractToken, and runtime uses its own isContractToken, as Item 4 requires. No stub, fake or hard-coded return stands in for another component. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g): none of the changed files holds an @​asyncRoot tag. The new export classString and every changed function (encodeValue, serializeValue, the comparisons, exporter, _matchArg, the values helpers) are sync and return no Promise, so no tag is missing or false. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/tokens.test.ts`: The consequence says jsonEncode writes a token 'recording no error', checked by Assert.assertSame(0, jsonLastError()). Under ESC-9.8-1 part 2 the codec records nothing outside an active Scope Frame, and jsonLastError() reads 0 there. xaravelTest only runs the body through runWithMockery (no xaravel.scope.run), so unless the harness preload opens a frame, this assertion holds even if an error were recorded. Run the encodes inside a Scope Frame (or first record a non-zero error so the 0 is meaningful), or supply evidence that a frame is active in this test. _(missing evidence)_
- **F-7** `packages/runtime/src/php`: AD-9.8 and MAINT-2026-10-24-epic-10-items Item 2 say jsonEncode, phpSerialize and phpVarExport in packages/runtime write a token as its FQCN string, and the action asks for XT cases for each encoder. The change and XT-runtime-41 cover only jsonEncode and phpSerialize; only assert's phpVarExport is tested (XT-assert-101). The prompt does not show whether packages/runtime has a var_export port. If it does, add the token branch and an XT case; if not, record that in the item's scope. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"a3bf3e0e0a666ba8cc8d0f12608987dd55de9770","base":"9a4d239c47a5d66c0759f38292dc2360bb325958","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-25T02:07:54.381Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and changes no Ported Test; only Xaravel Tests (XT-assert-3, XT-assert-101, XT-mockery-16, XT-runtime-41) are touched.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changes. The one changed expected value is XT-assert-3's exact export list, which gains 'classString'. It is still an exact toEqual, made to match a real new export, so it is not loosened. No stale_tests path is in scope.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there are no Upstream assertions to count. XT-assert-3 loses no assertion.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field changes.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed Oracle fixture is an error, and the touched XTs declare no Oracle request.","findings":[]},{"id":"F-7","result":"fail","note":"Traced each XT body against the changed code. XT-assert-101: classString, phpStrict/LooseEquals (e.g. token == true is true, token == 0 is false), assertSame/assertEquals pass and fail messages with diffs, canonicalizing, assertNotSame/NotEquals, exporter, varExport and the unchanged assertIsString all match its string. XT-mockery-16: the _matchArg token branch (identity, instanceof via Symbol.hasInstance, else == on the FQCN string), the no-match messages and phpString/formatArgument/getDebugType/ValueFormatter match its string and ruling item 3. XT-runtime-41: jsonEncode under the flags, phpSerialize slots (r:4) and String(token) throwing TypeError check what they claim. AD-9.8 is the bullet each test verifies. Two gaps remain, below.","findings":[{"path":"packages/runtime/tests/xaravel/tokens.test.ts","detail":"The consequence says jsonEncode writes a token 'recording no error', checked by Assert.assertSame(0, jsonLastError()). Under ESC-9.8-1 part 2 the codec records nothing outside an active Scope Frame, and jsonLastError() reads 0 there. xaravelTest only runs the body through runWithMockery (no xaravel.scope.run), so unless the harness preload opens a frame, this assertion holds even if an error were recorded. Run the encodes inside a Scope Frame (or first record a non-zero error so the 0 is meaningful), or supply evidence that a frame is active in this test.","kind":"missing-evidence"},{"path":"packages/runtime/src/php","detail":"AD-9.8 and MAINT-2026-10-24-epic-10-items Item 2 say jsonEncode, phpSerialize and phpVarExport in packages/runtime write a token as its FQCN string, and the action asks for XT cases for each encoder. The change and XT-runtime-41 cover only jsonEncode and phpSerialize; only assert's phpVarExport is tested (XT-assert-101). The prompt does not show whether packages/runtime has a var_export port. If it does, add the token branch and an XT case; if not, record that in the item's scope.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"Source changes are in packages/runtime (jsonEncode, phpSerialize), packages/assert (classString, comparisons, constraints, exporter, VarExport) and packages/mockery (Expectation._matchArg, values, ValueFormatter), all listed components. Mockery uses assert's grader-side classString and isContractToken, and runtime uses its own isContractToken, as Item 4 requires. No stub, fake or hard-coded return stands in for another component.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g): none of the changed files holds an @asyncRoot tag. The new export classString and every changed function (encodeValue, serializeValue, the comparisons, exporter, _matchArg, the values helpers) are sync and return no Promise, so no tag is missing or false.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```
