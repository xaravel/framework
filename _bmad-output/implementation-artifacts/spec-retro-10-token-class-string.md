---
title: 'A contract token is its FQCN class-string as a PHP value; a lint rule refuses string-coercing one (epic-10-retro-item-10)'
type: 'feature'
created: '2026-10-24'
status: 'in-review'
baseline_revision: '9a4d239c47a5d66c0759f38292dc2360bb325958'
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

## Review Triage Log

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

Status: in-progress (waiting on the Maintainer; resume at step 4, review)
Blocking condition: one more stale check in `packages/contracts`, outside the route's two re-pins. XT-contracts-12 (`packages/contracts/tests/xaravel/aliases.test.ts:369`) asserts `Assert.assertSame(typed, aliasResolver(table({ PROVIDER_ALIASES: [["App\\M", "Illuminate\\Contracts\\Cache\\Factory"]] }))("App\\M"))`. With AD-9.8 a resolver that returned the FQCN string would pass it, so merging the item as built would weaken that Xaravel Test. "Item 10's route" (`decisions/MAINT-2026-10-24-epic-10-items.md`) allows only XT-contracts-11 and XT-contracts-19 to change in `packages/contracts`. Recommended: approve the same identity re-pin for that one line (the `assertSameAbstract` helper XT-contracts-11 already uses in the same file). A sweep of `packages/*/tests` and `conformance/tests` for `assertSame`/`assertEquals` on contract tokens or resolver results found no other such check.

The build is complete on branch `planning/retro-10-token-class-string` (`[orchestrator wip]` commit, not merged): `bun run harness` (`SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`), `bun run harness --xaravel` (368 passed, 0 failed, 5 skipped as before), `bun run typecheck` and `bun run lint` clean. A mutation (`aliasResolver` returning the FQCN string) fails XT-contracts-11 and XT-contracts-19. The review layers and the Fidelity Review have not run yet.

Note for the review: the matrix's jsonEncode row is wrong. An FQCN has no `/`, so the expected output is `"Illuminate\\Contracts\\Support\\Arrayable"`, as PHP's `json_encode` writes the string. XT-runtime-41 pins that the token encodes exactly as its FQCN string under each flag. Correct the row through the Spec Change Log at review.
