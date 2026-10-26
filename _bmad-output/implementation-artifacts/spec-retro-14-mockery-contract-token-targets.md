---
title: 'Mockery.mock of a contract token target (epic-14-item-4-mockery-contract-token-targets)'
type: 'feature'
created: '2026-10-26'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
baseline_revision: '5fbae46deb0f50d5ab05aa33703fc46b724a0129'
context:
  - '{project-root}/decisions/MAINT-2026-10-26-story-14-1-mockery.md'
  - '{project-root}/conformance/escalations/ESC-14.1-11.md'
warnings: []
deferred:
  - summary: >-
      A Mockery mock of a contract token gets no JS protocol for the token's built-ins (getIterator, __toString), unlike JMac doubles and PHP's foreach over an IteratorAggregate mock.
    evidence: |-
      Generated mock prototypes define brands only; defineContractProtocols is not applied (token-targets.test.ts pins Symbol.iterator absent as a recorded limit). The intent and ruling limit this item to brands, naming and the expectation chain; a change needs a follow-up ruling.
    location: >-
      packages/mockery/src/Mockery/Mock.ts generatedFor
    severity: medium
---

<intent-contract>

## Intent

**Problem:** PORTING.md § Mockery ports `Mockery::mock(Arrayable::class)` as `Mockery.mock(Arrayable)`, with `X` a `@xaravel/contracts` token or a runtime PHP-interface token (`JsonSerializable`). But `Container.parseArguments` reads a frozen token object as a PHP array (quick definitions), and the generated `Mockery_<n>` class carries no brand, so the mock is not `instanceof` the token. Story 14.1's four ESC-14.1-11 Test IDs fail on that. The Maintainer ruled option 1 (`decisions/MAINT-2026-10-26-story-14-1-mockery.md`).

**Scope:** `packages/mockery/**` (the item's `action`; amendment 2026-10-22 of `decisions/MAINT-2026-10-16-unattended-orchestrator.md`), plus this spec and sprint status. `packages/assert` needs no change: `isContractToken`, `contractTokenName`, `contractParentBrands`, `contractMethods` and `defineContractBrand` are already exported from its index.

**Approach:** `parseArguments` recognises a contract token (assert's `isContractToken`) before the PHP-array test and records it as a contract target. The generated class defines the token's brand `Symbol.for(<FQCN>)` and every parent brand (`defineContractBrand` over `contractParentBrands`), as JMac's `ClassGenerator` does, and the mock's name carries the token's FQCN, as PHP's `Mockery_0_Illuminate_Contracts_Support_Arrayable`. Expectations work as for any target; an unexpected call to a method the token lists reports Mockery's `Received <mock>::<m>(), but no expectations were specified`, as for a declared method of a class target.

## Boundaries & Constraints

**Always:** Mockery 1.6.15's semantics: a mock of an interface implements it and every interface it extends; a mock of a class plus interfaces extends the class and implements them all; the name is `Mockery_<n>_` + class, then interfaces, with `\` as `_`. Token detection, naming and the parents walk are assert's shared helpers (lesson epic 4: one implementation). Several token arguments are all implemented. The generated-class cache keys on the token objects too, so two distinct tokens never share a class. New XT cases (`XT-mockery-17`) use `xaravelTest`; tokens there are stand-ins built as `contract()` and `phpInterface()` build them (the grader never imports `@xaravel/contracts` or `@xaravel/runtime`, AD-2).

**Never:** Change class, string, symbol, `null`, list (constructor arguments), string-keyed map (quick definitions), object (proxied partial) or closure handling; a symbol target still defines no brand. Touch `packages/assert/**`, any other package, `conformance/expectations/**`, `PORTING.md` or `decisions/**`. Add JS protocols (`[Symbol.iterator]`, `toString`) for a token's built-ins, or change `_mockery_declaresMethod` / partial or `passthru` behaviour. Weaken or remove an existing assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| contracts token | `Mockery.mock(Arrayable)`; `m.expects('toArray').andReturn('x')` | `m instanceof Arrayable`; `m.toArray()` is `'x'`; name `Mockery_<n>_Illuminate_Contracts_Support_Arrayable`; one expectation counted | an unmet `expects` fails verification as for a class target |
| child token | token `C` whose parents are `[P]` (and `P`'s `[Q]`) | mock `instanceof C`, `P` and `Q` | none |
| runtime PHP-interface token | `Mockery.mock(JsonSerializable)`; `m.expects('jsonSerialize').andReturn([1])` | `instanceof JsonSerializable`; call returns `[1]` | none |
| unexpected call | token mock, no expectation; call a listed method / an unlisted method | `BadMethodCallException` `Received Mockery_<n>_…::toArray(), but no expectations were specified` / `Method Mockery_<n>_…::foo() does not exist on this mock object` | thrown and recorded in `mockery_thrownExceptions()` |
| class + token | `Mockery.mock(Foo, Arrayable)` | `instanceof Foo` and `Arrayable`; name `Mockery_<n>_Foo_Illuminate_Contracts_Support_Arrayable` | none |
| token, empty FQCN | frozen object whose FQCN data property is `''` | `Mockery\Exception` `Unable to parse arguments sent to Mockery\Container::mock()` | thrown by `mock()` |
| unchanged | class, `'Foo'` string, `Symbol.for('X')`, `{foo: 'bar'}`, `[1, 2]` | as before: class `instanceof`; string as a name part; symbol has no brand (`m[sym]` not `true`) and its name part; `foo()` returns `'bar'` by default; constructor args | none |

</intent-contract>

## Code Map

- `packages/mockery/src/Mockery/Container.ts` -- `parseArguments` (~l.177): add `isContractToken` branch after the symbol branch and before `isPhpArray`; `Parsed` gains `contracts: object[]`; `mock()` passes them into `MockSpec`. Header comment lists the new form.
- `packages/mockery/src/Mockery/Mock.ts` -- `MockSpec` gains `contracts: readonly object[]`; `generatedFor` (~l.102) keys the cache on them, appends each FQCN to the name after the symbol token's part, and defines own and parent brands on the generated prototype; the constructor keeps the lower-cased `contractMethods` names for the message in `_mockery_handleMethodCall` (~l.543). Header comment documents it.
- `packages/mockery/src/JMac/Testing/Engine/ClassGenerator.ts:159-164` -- reference: the brand loop to mirror.
- `packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts` (`of`) -- reference: how a token's name, brand, methods and parent brands are read with assert's helpers.
- `packages/assert/src/Framework/MockObject/Generator/ContractParents.ts` -- read-only: `isContractToken`, `contractTokenName`, `contractParentBrands(token, ownBrand, nameOf)`, `contractMethods(token, nameOf)`, `defineContractBrand`.
- `packages/runtime/src/php/phpInterface.ts` -- read-only: shape of a runtime PHP-interface token, for the stand-in.
- `packages/mockery/tests/xaravel/token-class-string.test.ts` -- reference: XT test file conventions and the stand-in `token()`.
- `packages/mockery/README.md` -- one sentence on token targets.

## Tasks & Acceptance

**Execution:**
- `packages/mockery/src/Mockery/Container.ts` -- parse a contract token into `contracts`; an unnamed token (empty FQCN) throws the parse `Exception` -- PORTING.md's `Mockery.mock(X)` form.
- `packages/mockery/src/Mockery/Mock.ts` -- brands, naming, cache key, and the declared-method message for token methods -- ESC-14.1-11 option 1.
- `packages/mockery/tests/xaravel/token-targets.test.ts` -- new `XT-mockery-17` covering every matrix row -- the action item's tests.
- `packages/mockery/README.md` -- document the target form.

**Acceptance Criteria:**
- Given the four ESC-14.1-11 Upstream shapes (`Mockery::mock(Arrayable::class)` twice, and `JsonSerializable` + `Arrayable`, each `expects('toArray'|'jsonSerialize')->andReturn(...)`), when built with stand-in tokens, then each mock is `instanceof` its token and returns the configured value exactly once.
- Given the full suite, when `bun run harness`, `bun run typecheck` and `bun run lint` run, then there are no differences and no errors.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 18 findings — high 0, medium 3, low 11, false 4, maybe-false 0 (the Fidelity Review layer was already `current`, 2 passes at tree e89fe0b1, and added none)
- findings:
  - `[medium]` `[patch]` (blind) Token methods never count as declared for AvoidMethodClashPass: a Gate-like token listing `allows` returns Mockery's API with no expectation set — the proxy `get` now treats a listed method as declared in the clash check and the declared-method dispatch; `_mockery_declaresMethod` is unchanged.
  - `[low]` `[patch]` (blind) Name order puts the token FQCN before an unresolved string target, unlike `generateName` (class, then interfaces) — contract names now follow `spec.parts`.
  - `[low]` `[reject]` (blind) A parent token with an empty FQCN throws the parse `Exception` from class generation — `contract()` and `phpInterface()` never build a nameless token; a fix adds a guard path for a case no real token reaches.
  - `[low]` `[patch]` (blind) `contractIds` is a strong, growing `Map` keyed by `.size` — now a `WeakMap` with its own counter.
  - `[low]` `[patch]` (blind) No symbol-plus-token naming case — exact-name assertions added.
  - `[false]` `[reject]` (blind) The test has no cleanup on failure — `xaravelTest` runs the Mockery run protocol, which closes the container after the body whether it passed or not (`packages/mockery/src/Mockery.ts` header).
  - `[medium]` `[defer]` (blind) A token's built-ins (`getIterator`, `__toString`) get no JS protocol on a Mockery mock, unlike JMac doubles and PHP's `foreach` — the intent says "no other Mockery behaviour changes" and the ruling limits the change to brands, naming and the expectation chain; recorded as a known limit in the README and the test comment, deferred to a follow-up ruling.
  - `[low]` `[patch]` (blind) README omits the message change, the empty-FQCN error and the built-ins limit — added.
  - `[low]` `[patch]` (edge) A token listing `then` leaves `mock.then` undefined with no expectation — same fix as the clash finding (declared-method dispatch).
  - `[medium]` `[patch]` (edge) CLASHABLE check ignores token methods — same root cause as the first row.
  - `[false]` `[reject]` (edge) `Mockery.mock('Illuminate\\Contracts\\Support\\Arrayable')` (a string) is not `instanceof` the token — the intent requires string targets unchanged.
  - `[low]` `[reject]` (edge) Two distinct token objects with one FQCN repeat the name part — only hand-built stand-ins can do that; real tokens are one object per FQCN.
  - `[low]` `[patch]` (edge) Name-order claim (class, then interfaces) contradicted for unresolved strings — same fix as the second row.
  - `[low]` `[patch]` (edge) A listed method named like a present property (`then`) never reaches the message path — same fix as the clash finding.
  - `[low]` `[patch]` (verification-gap) Symbol-plus-token and string-plus-token name order not pinned — assertions added.
  - `[low]` `[patch]` (verification-gap) De-duplication of a repeated token not pinned — `mock(Arrayable, Arrayable)` name assertion added.
  - `[false]` `[reject]` (intent-alignment) Tests use stand-in tokens, not the real `Arrayable` / `JsonSerializable` — the grader may not import `@xaravel/contracts` or `@xaravel/runtime` (AD-2); the stand-ins match the real tokens' keys and descriptors, and Story 14.1's Ported Tests run the real ones.
  - `[false]` `[reject]` (intent-alignment) Naming, message and empty-FQCN behaviour go beyond a strict reading of "no other Mockery behaviour changes" — they apply only to the new token path, follow the ruling's "work as for a class target", and every pre-existing target form is pinned unchanged.

### 2026-10-26 — Review pass (Finalize re-check, Fidelity Review)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The patched tree 4793426dc9292a83e7d905bc8b75ce7a28070c0e had no Fidelity verdicts, so the layer ran again: reviewer 1 pass (codex/gpt-6.1-sol), reviewer 2 pass (claude/claude-opus-5-5); `status` prints `current`.

## Design Notes

PHP's `MockConfiguration::generateName` adds the target class, then each target interface. Mock already orders `partialObject`, parent, symbol token, then the other parts; the token FQCNs go right after the symbol token's part.

## Verification

**Commands:**
- `bun test packages/mockery` -- expected: all pass, `XT-mockery-17` included.
- `bun run harness` -- expected: `SUMMARY` with no differences (NOT-RUN Variants allowed).
- `bun run typecheck` and `bun run lint` -- expected: clean.
- `bun run fidelity:review review --item epic-14-item-4-mockery-contract-token-targets --spec _bmad-output/implementation-artifacts/spec-retro-14-mockery-contract-token-targets.md`, then `... status ...` -- expected: `current`.

## Fidelity Review

### Reviewer 1: reject at tree b5162b891d77d369cf62bca8f7ed3f0c64dac97e

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `5fbae46deb0f50d5ab05aa33703fc46b724a0129`, on 2026-10-26T16:09:03.521Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds no Ported Tests, so there are no Upstream assertions to match. |
| F-2: No expected value is weakened | pass | The diff adds a Xaravel Test without changing or weakening any existing expected value or exception assertion. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test or existing assertion is removed or modified. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The action item relies on no Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-mockery-17 checks most declared consequences, but its coverage of targets after a class is narrower than its consequence string claims. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the changed paths and implementation with the Maintainer-approved scope: changes stay within Mockery and implement token parsing and branding without adding another Component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared both touched source files with AD-6 and DIV-1: neither retains asyncRoot tags nor introduces IO or callbacks requiring async treatment. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-7** `packages/mockery/tests/xaravel/token-targets.test.ts`: The consequence claims both contracts tokens and runtime PHP-interface tokens work alone or after a class, but the class-plus-token case tests only Arrayable. Add a class-plus-JsonSerializable case checking instanceof, naming, expectation dispatch and verification.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"b5162b891d77d369cf62bca8f7ed3f0c64dac97e","base":"5fbae46deb0f50d5ab05aa33703fc46b724a0129","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T16:09:03.521Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds no Ported Tests, so there are no Upstream assertions to match.","findings":[]},{"id":"F-2","result":"pass","note":"The diff adds a Xaravel Test without changing or weakening any existing expected value or exception assertion.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test or existing assertion is removed or modified.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The action item relies on no Oracle error fixture.","findings":[]},{"id":"F-7","result":"fail","note":"XT-mockery-17 checks most declared consequences, but its coverage of targets after a class is narrower than its consequence string claims.","findings":[{"path":"packages/mockery/tests/xaravel/token-targets.test.ts","detail":"The consequence claims both contracts tokens and runtime PHP-interface tokens work alone or after a class, but the class-plus-token case tests only Arrayable. Add a class-plus-JsonSerializable case checking instanceof, naming, expectation dispatch and verification.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"Compared the changed paths and implementation with the Maintainer-approved scope: changes stay within Mockery and implement token parsing and branding without adding another Component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"Compared both touched source files with AD-6 and DIV-1: neither retains asyncRoot tags nor introduces IO or callbacks requiring async treatment.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree b5162b891d77d369cf62bca8f7ed3f0c64dac97e

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `5fbae46deb0f50d5ab05aa33703fc46b724a0129`, on 2026-10-26T16:09:03.521Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests assigned or changed; only an Xaravel Test added. |
| F-2: No expected value is weakened | n/a | No Ported Test expected values or existing assertions changed; the only test file is newly added. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test; no assertions removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations lines set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted markers or Expectations adapted fields added. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixtures relied on; none are errors. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-mockery-17's body checks each clause of its consequence string: instanceof of token and parents, expectations/verification, naming, received/missing messages, empty-FQCN parse error, distinct tokens of one name, and unchanged class/string/symbol/map/list targets. It cites no FR/AD tokens. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes stay in packages/mockery (README, Container, Mock, test). The 'packages/assert' helpers are only imported, not modified. No stubs of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | No @​asyncRoot tags exist in the changed files, and all added code is synchronous with no IO or async callbacks, so no tag is missing. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No oracle request files changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"b5162b891d77d369cf62bca8f7ed3f0c64dac97e","base":"5fbae46deb0f50d5ab05aa33703fc46b724a0129","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T16:09:03.521Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests assigned or changed; only an Xaravel Test added.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test expected values or existing assertions changed; the only test file is newly added.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test; no assertions removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations lines set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted markers or Expectations adapted fields added.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixtures relied on; none are errors.","findings":[]},{"id":"F-7","result":"pass","note":"XT-mockery-17's body checks each clause of its consequence string: instanceof of token and parents, expectations/verification, naming, received/missing messages, empty-FQCN parse error, distinct tokens of one name, and unchanged class/string/symbol/map/list targets. It cites no FR/AD tokens.","findings":[]},{"id":"F-8","result":"pass","note":"Changes stay in packages/mockery (README, Container, Mock, test). The `packages/assert` helpers are only imported, not modified. No stubs of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"No @asyncRoot tags exist in the changed files, and all added code is synchronous with no IO or async callbacks, so no tag is missing.","findings":[]},{"id":"F-10","result":"n/a","note":"No oracle request files changed.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree e89fe0b188bf80fadd82fc90c40651dac4f07981

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `5fbae46deb0f50d5ab05aa33703fc46b724a0129`, on 2026-10-26T16:09:33.533Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests. |
| F-2: No expected value is weakened | pass | The diff adds assertions for token targets without changing or weakening existing expected values. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no Oracle error fixtures relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-mockery-17 checks its declared branding, inheritance, naming, dispatch, verification, rejection, cache identity and existing argument forms. Both token kinds are tested alone and after a class, including the requested JsonSerializable case. |
| F-8: No stub, fake or partial implementation of another Component | pass | The changed code stays within the approved Mockery scope and implements token recognition and mock generation under ESC-14.1-11; it adds no other Component's implementation. |
| F-9: Every `@asyncRoot` tag is true | pass | The touched source files contain no asyncRoot tags, IO terminals or methods made async by permitted callbacks; their synchronous implementations agree with AD-6. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/mockery/tests/xaravel/token-targets.test.ts`: The consequence claims both contracts tokens and runtime PHP-interface tokens work alone or after a class, but the class-plus-token case tests only Arrayable. Add a class-plus-JsonSerializable case checking instanceof, naming, expectation dispatch and verification. **fixed**: The added XtTargetFoo-plus-JsonSerializable case checks instanceof, exact normalized naming, expectation dispatch and successful close verification. A separate unmet class-plus-JsonSerializable expectation checks verification failure.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"e89fe0b188bf80fadd82fc90c40651dac4f07981","base":"5fbae46deb0f50d5ab05aa33703fc46b724a0129","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T16:09:33.533Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests.","findings":[]},{"id":"F-2","result":"pass","note":"The diff adds assertions for token targets without changing or weakening existing expected values.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no Oracle error fixtures relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"XT-mockery-17 checks its declared branding, inheritance, naming, dispatch, verification, rejection, cache identity and existing argument forms. Both token kinds are tested alone and after a class, including the requested JsonSerializable case.","findings":[]},{"id":"F-8","result":"pass","note":"The changed code stays within the approved Mockery scope and implements token recognition and mock generation under ESC-14.1-11; it adds no other Component's implementation.","findings":[]},{"id":"F-9","result":"pass","note":"The touched source files contain no asyncRoot tags, IO terminals or methods made async by permitted callbacks; their synchronous implementations agree with AD-6.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/mockery/tests/xaravel/token-targets.test.ts","detail":"The consequence claims both contracts tokens and runtime PHP-interface tokens work alone or after a class, but the class-plus-token case tests only Arrayable. Add a class-plus-JsonSerializable case checking instanceof, naming, expectation dispatch and verification.","fixed":true,"note":"The added XtTargetFoo-plus-JsonSerializable case checks instanceof, exact normalized naming, expectation dispatch and successful close verification. A separate unmet class-plus-JsonSerializable expectation checks verification failure."}]}
```

### Reviewer 2: pass at tree e89fe0b188bf80fadd82fc90c40651dac4f07981

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `5fbae46deb0f50d5ab05aa33703fc46b724a0129`, on 2026-10-26T16:09:33.533Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed; the action item assigns no Inventory rows. |
| F-2: No expected value is weakened | n/a | No Upstream expected values; no existing assertion was weakened (only a new Xaravel Test and new code). |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test, so no Upstream assertions to count; no assertion removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted markers or DIV clauses are added. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixtures are relied on; XT-mockery-17 needs none. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The test body covers each clause of the consequence string: both token kinds, alone and after a class (the class-plus-JsonSerializable case now checks instanceof, naming, expectation dispatch and unmet-verification failure), the listed and missing method messages, the empty-FQCN error, twin tokens with distinct classes, and the unchanged class, string, symbol, map and list targets. The consequence cites no FR or AD id. |
| F-8: No stub, fake or partial implementation of another Component | pass | The change stays in packages/mockery and uses the existing @​xaravel/assert helpers. It adds no stub of another Component and no hard-coded return. |
| F-9: Every `@asyncRoot` tag is true | pass | No @​asyncRoot tags exist in the changed files, and all added code is sync with no IO or async callbacks. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/mockery/tests/xaravel/token-targets.test.ts`: The consequence claims both contracts tokens and runtime PHP-interface tokens work alone or after a class, but the class-plus-token case tests only Arrayable. Add a class-plus-JsonSerializable case checking instanceof, naming, expectation dispatch and verification. **fixed**: token-targets.test.ts now has a class plus JsonSerializable case. It checks instanceof, the name Mockery_N_XtTargetFoo_JsonSerializable, expects/jsonSerialize dispatch, and an unmet expectation failing close with InvalidCountException.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"e89fe0b188bf80fadd82fc90c40651dac4f07981","base":"5fbae46deb0f50d5ab05aa33703fc46b724a0129","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T16:09:33.533Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed; the action item assigns no Inventory rows.","findings":[]},{"id":"F-2","result":"n/a","note":"No Upstream expected values; no existing assertion was weakened (only a new Xaravel Test and new code).","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test, so no Upstream assertions to count; no assertion removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted markers or DIV clauses are added.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixtures are relied on; XT-mockery-17 needs none.","findings":[]},{"id":"F-7","result":"pass","note":"The test body covers each clause of the consequence string: both token kinds, alone and after a class (the class-plus-JsonSerializable case now checks instanceof, naming, expectation dispatch and unmet-verification failure), the listed and missing method messages, the empty-FQCN error, twin tokens with distinct classes, and the unchanged class, string, symbol, map and list targets. The consequence cites no FR or AD id.","findings":[]},{"id":"F-8","result":"pass","note":"The change stays in packages/mockery and uses the existing @xaravel/assert helpers. It adds no stub of another Component and no hard-coded return.","findings":[]},{"id":"F-9","result":"pass","note":"No @asyncRoot tags exist in the changed files, and all added code is sync with no IO or async callbacks.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/mockery/tests/xaravel/token-targets.test.ts","detail":"The consequence claims both contracts tokens and runtime PHP-interface tokens work alone or after a class, but the class-plus-token case tests only Arrayable. Add a class-plus-JsonSerializable case checking instanceof, naming, expectation dispatch and verification.","fixed":true,"note":"token-targets.test.ts now has a class plus JsonSerializable case. It checks instanceof, the name Mockery_N_XtTargetFoo_JsonSerializable, expects/jsonSerialize dispatch, and an unmet expectation failing close with InvalidCountException."}]}
```

### Reviewer 1: pass at tree 4793426dc9292a83e7d905bc8b75ce7a28070c0e

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `5fbae46deb0f50d5ab05aa33703fc46b724a0129`, on 2026-10-26T16:17:52.730Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are added or changed; the action item assigns none. |
| F-2: No expected value is weakened | pass | The diff adds exact assertions in XT-mockery-17 and changes no existing expected values or exception checks. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-mockery-17 checks its declared token branding, inherited brands, expectations and verification, naming, unexpected-call messages, invalid names, cache identity, and existing argument forms. It cites no FR or AD consequence tokens. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files belong to the authorized Mockery component. Token recognition and generated mock branding implement the Mockery behavior approved by ESC-14.1-11; no other component's production behavior is implemented. |
| F-9: Every `@asyncRoot` tag is true | pass | The complete changed source files contain no async methods or @​asyncRoot tags. Their synchronous parsing, generation and dispatch introduce no IO root or callback requiring async derivation under AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"4793426dc9292a83e7d905bc8b75ce7a28070c0e","base":"5fbae46deb0f50d5ab05aa33703fc46b724a0129","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T16:17:52.730Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are added or changed; the action item assigns none.","findings":[]},{"id":"F-2","result":"pass","note":"The diff adds exact assertions in XT-mockery-17 and changes no existing expected values or exception checks.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"XT-mockery-17 checks its declared token branding, inherited brands, expectations and verification, naming, unexpected-call messages, invalid names, cache identity, and existing argument forms. It cites no FR or AD consequence tokens.","findings":[]},{"id":"F-8","result":"pass","note":"All changed files belong to the authorized Mockery component. Token recognition and generated mock branding implement the Mockery behavior approved by ESC-14.1-11; no other component's production behavior is implemented.","findings":[]},{"id":"F-9","result":"pass","note":"The complete changed source files contain no async methods or @asyncRoot tags. Their synchronous parsing, generation and dispatch introduce no IO root or callback requiring async derivation under AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 4793426dc9292a83e7d905bc8b75ce7a28070c0e

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `5fbae46deb0f50d5ab05aa33703fc46b724a0129`, on 2026-10-26T16:17:52.730Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test; the only test is an Xaravel Test (XT-mockery-17), so there is no Upstream assertion to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test is added or changed and no stale_tests file is touched. XT-mockery-17 is new and has no Upstream expected values, so no expected value can be weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there are no Upstream assertions to count. No existing test file is modified. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker and no Expectations adapted field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed Oracle fixture is an error. XT-mockery-17 declares no Oracle request. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared each clause of XT-mockery-17's consequence string with its body. (1) Contracts token (Arrayable) and PHP-interface token (JsonSerializable), alone, after a class and several together: instanceof checked, expects/andReturn work, and an unmet expects throws InvalidCountException on close, for a bare token and for a class plus a token. (2) Names: Mockery_N_<FQCN>, <class>_<FQCN>, symbol/string parts before the FQCN, and a token given twice is one part; backslash becomes underscore. (3) Unexpected calls: a listed method (own, a parent's, a built-in) gives 'Received …, but no expectations were specified'; any other method gives 'does not exist'; both are recorded. (4) An empty FQCN throws Exception 'Unable to parse arguments…'. (5) A twin token of the same FQCN gets a different prototype, and the same token reuses its prototype. (6) Unchanged forms: class, unresolved string, symbol (no brand), string-keyed map (quick definitions) and list (constructor args). The parent-closure instanceof (C→P→Q) is also covered. The body checks everything the string claims. The string cites no FR/AD tokens. The 'Received…' message matches Mockery 1.6.15's _mockery_handleMethodCall when mockery_getMethod finds a method that the interface declares. |
| F-8: No stub, fake or partial implementation of another Component | pass | Only packages/mockery changes (README, Container.ts, Mock.ts, a new XT), inside the action item's scope. It reuses existing @​xaravel/assert helpers (isContractToken, contractTokenName, contractParentBrands, contractMethods, defineContractBrand) that the JMac port already imports, with no edit to assert. The test's stand-in tokens are needed because the grader cannot import @​xaravel/contracts (AD-2). They live in the test only; no stub, fake or hard-coded return of another Component is added to implementation code. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g): Container.ts and Mock.ts hold no @​asyncRoot tags after the change. The added code (the contracts field, contractId, tokenName, the generatedFor brand/method collection, the #contractMethods checks) is all synchronous and returns no Promise, so no tag is missing and none is false. The README is not source. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"4793426dc9292a83e7d905bc8b75ce7a28070c0e","base":"5fbae46deb0f50d5ab05aa33703fc46b724a0129","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T16:17:52.730Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test; the only test is an Xaravel Test (XT-mockery-17), so there is no Upstream assertion to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is added or changed and no stale_tests file is touched. XT-mockery-17 is new and has no Upstream expected values, so no expected value can be weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there are no Upstream assertions to count. No existing test file is modified.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker and no Expectations adapted field changes.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed Oracle fixture is an error. XT-mockery-17 declares no Oracle request.","findings":[]},{"id":"F-7","result":"pass","note":"Compared each clause of XT-mockery-17's consequence string with its body. (1) Contracts token (Arrayable) and PHP-interface token (JsonSerializable), alone, after a class and several together: instanceof checked, expects/andReturn work, and an unmet expects throws InvalidCountException on close, for a bare token and for a class plus a token. (2) Names: Mockery_N_<FQCN>, <class>_<FQCN>, symbol/string parts before the FQCN, and a token given twice is one part; backslash becomes underscore. (3) Unexpected calls: a listed method (own, a parent's, a built-in) gives 'Received …, but no expectations were specified'; any other method gives 'does not exist'; both are recorded. (4) An empty FQCN throws Exception 'Unable to parse arguments…'. (5) A twin token of the same FQCN gets a different prototype, and the same token reuses its prototype. (6) Unchanged forms: class, unresolved string, symbol (no brand), string-keyed map (quick definitions) and list (constructor args). The parent-closure instanceof (C→P→Q) is also covered. The body checks everything the string claims. The string cites no FR/AD tokens. The 'Received…' message matches Mockery 1.6.15's _mockery_handleMethodCall when mockery_getMethod finds a method that the interface declares.","findings":[]},{"id":"F-8","result":"pass","note":"Only packages/mockery changes (README, Container.ts, Mock.ts, a new XT), inside the action item's scope. It reuses existing @xaravel/assert helpers (isContractToken, contractTokenName, contractParentBrands, contractMethods, defineContractBrand) that the JMac port already imports, with no edit to assert. The test's stand-in tokens are needed because the grader cannot import @xaravel/contracts (AD-2). They live in the test only; no stub, fake or hard-coded return of another Component is added to implementation code.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g): Container.ts and Mock.ts hold no @asyncRoot tags after the change. The added code (the contracts field, contractId, tokenName, the generatedFor brand/method collection, the #contractMethods checks) is all synchronous and returns no Promise, so no tag is missing and none is false. The README is not source.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: done

**Summary.** `Mockery.mock(X)` takes a contract token object (an `@xaravel/contracts` token, or a runtime PHP-interface token such as `JsonSerializable`) as an interface target, per ESC-14.1-11 option 1 (`decisions/MAINT-2026-10-26-story-14-1-mockery.md`). `parseArguments` recognises it with `isContractToken` before the PHP-array test. The generated class carries the token's brand and every parent brand, so the mock is `instanceof` each. The name is `Mockery_<n>_` + class parts, then the token FQCNs. A method the token lists counts as declared for the unexpected-call message, for the `allows`/`expects` clash and for proxy dispatch.

**Files changed.**
- `packages/mockery/src/Mockery/Container.ts`: parses a token target. A token with an empty FQCN throws the parse `Exception`.
- `packages/mockery/src/Mockery/Mock.ts`: brands, name order, a cache keyed on token identity (`WeakMap`), and token methods treated as declared in the proxy `get` and the unexpected-call message.
- `packages/mockery/tests/xaravel/token-targets.test.ts`: new test XT-mockery-17, covering every matrix row and the review cases.
- `packages/mockery/README.md`: documents the target form and its one known limit.
- `packages/assert`: no change. The helpers it needed were already exported.

**Review.** Pass 1 had 18 findings:
- 5 patch entries: the clash and dispatch fix (medium), name order, the `WeakMap`, the README, and the naming and dedup tests.
- 1 deferred: built-ins get no JS protocol on a Mockery token mock (medium; see `deferred`).
- 7 rejected, with their reasons in the triage log: 4 false, 3 low.

The Fidelity Review rejected the first tree once (F-7: no class + `JsonSerializable` case). That case was added, and the next tree passed twice. After the patches, the new tree also passed twice and is `current`.

**Follow-up review recommended:** false. One medium entry was patched, and no high.

**Verification.**
- `bun test packages/mockery`: 17 pass.
- `bun run typecheck` and `bun run lint`: clean.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`, XARAVEL 415 passed, 0 failed.
- `fidelity:review status`: `current` at tree 4793426d.

**Residual risks.**
- The deferred built-ins limit: a mock of an `IteratorAggregate` token cannot be iterated with `for…of`.
- Tests use stand-in tokens (AD-2). The real `Arrayable` and `JsonSerializable` are exercised when Story 14.1 ports its four ESC-14.1-11 Test IDs.
