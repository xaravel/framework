---
title: 'Story 9.14: fqcn() of a contract token'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: '2e495fed0108c8473a98f1d9e3a9320938529a53'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/decisions/ESC-10.1-3.md'
  - '{project-root}/stories/9.14.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `fqcn()` in `@xaravel/runtime/registry` throws for a `contract<T>()` token, because a token is a frozen plain object, not a registered class. The container and Story 10.4's `canonicalToken` need a token's FQCN from `fqcn()`, the one identity lookup AD-10 gives (ESC-10.1-3, option 1).

**Approach:** Add one branch to `fqcn(value)`: when the value is a non-function object, frozen, and has an own, non-writable data property `Symbol.for('xaravel.class.fqcn')` whose value is a string, return that string. Every other value keeps today's path. Verify with the new Xaravel Test XT-runtime-40.

## Boundaries & Constraints

**Always:** Edit only `packages/runtime/**` plus this Story's records. Keep the error message and `TypeError` of the existing miss path unchanged. Return `null` never; the function still returns a string or throws. Build the test's token by hand, with exactly the shape `packages/contracts/src/Contract.ts:64-82` makes (frozen object literal with `[CLASS_FQCN]: name`), since the runtime must not import `@xaravel/contracts`.

**Never:** No change to `resolveClass`, `resolveClassAsync`, `registerClass`, `registerTestClass` or the brand logic. No token is ever registered or resolvable by name. No import of `@xaravel/contracts` from the runtime (package graph). No change to `packages/contracts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Token | `Object.freeze({ [CLASS_FQCN]: "Illuminate\\Contracts\\Support\\Arrayable", ... })` | returns `"Illuminate\\Contracts\\Support\\Arrayable"` | none |
| Token, test frame | same token inside a test frame that registered a test class | same string | none |
| Not frozen | plain object with own string key | unchanged path: throws | `TypeError` "fqcn(): the class is not registered; …" |
| Sealed, not frozen | `Object.seal` of an object whose key is a non-writable string but another own property stays writable | throws as today | same `TypeError` |
| Accessor key | frozen object with a getter returning a string under the key | throws as today | same `TypeError` |
| Inherited key | frozen object whose prototype carries the key | throws as today | same `TypeError` |
| Non-string value | frozen object, own key value `42` / `null` | throws as today | same `TypeError` |
| Function | a frozen unregistered function with own non-writable string key (as `registerClass` would leave) | Registry path only: throws | same `TypeError` |
| Registered class / instance | as today, test frames first | its FQCN | none |
| `resolveClass(token's name)` | name not registered as a class | throws `Class "<name>" not found` | PHP `Error` |
| Non-object | `null`, `"x"`, `1` | throws as today | `TypeError` "fqcn(): the value is not a class or an object" |

</intent-contract>

## Code Map

- `packages/runtime/src/registry/registry.ts:96-115` -- `fqcn()`; add the token branch after the type check and before the class lookup. `CLASS_FQCN` constant at :52. Update the file header comment (:6-8 says "`fqcn()` reads the Registry, never the brand") to name the token exception.
- `packages/runtime/src/registry/registry.ts:121-131` -- `resolveClass`, read-only: lookups only by registered key, so a token name already misses.
- `packages/contracts/src/Contract.ts:64-82` -- `contract()`, read-only: the token shape to mirror in the test.
- `packages/runtime/tests/xaravel/registry.test.ts:16-23, 119-160` -- `xaravelTest` / `Assert` idiom and imports; add XT-runtime-40 at the end of this file (a `thrownBy` helper exists in the file).
- `packages/runtime/docs/class-registry.md:40-41` -- the `fqcn` bullet; add that a contract token gives its own FQCN. XT-runtime-37 (`docs.test.ts`) checks docs name every export; no new export is added.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/registry/registry.ts` -- add the token branch (own descriptor via `Object.getOwnPropertyDescriptor`, `"value" in d`, `d.writable === false`, `typeof d.value === "string"`, `Object.isFrozen`, `typeof value === "object"`); update the docblock and header comment -- ESC-10.1-3 option 1.
- `packages/runtime/tests/xaravel/registry.test.ts` -- add XT-runtime-40 covering every matrix row, citing ESC-10.1-3 and AD-10 in its consequence string -- FR-115, the manifest's only Xaravel Test.
- `packages/runtime/docs/class-registry.md` -- extend the `fqcn` bullet -- keep docs accurate.

**Acceptance Criteria:**
- Given a frozen, non-function object whose own, non-writable `Symbol.for('xaravel.class.fqcn')` data property is a string, as `contract<T>()` makes, when `fqcn(value)` runs, then it returns that string.
- Given a class, an instance, an unregistered class, or any other object, when `fqcn(value)` runs, then it behaves exactly as before (registered class or instance gives its FQCN, test frames first; anything else throws), and `resolveClass` never resolves a token's name as a class.
- Given the baseline `registry.ts`, when XT-runtime-40 runs, then it fails; after the change it passes, and XT-runtime-1..39 still pass.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 14 findings — high 0, medium 0, low 7, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` (edge-case) the token branch accepts an empty, `\`-led or non-FQCN-shaped string — only a hand-made frozen object reaches it (`contract()` normalises its name), and ESC-10.1-3 fixes the predicate as "a string"; a shape guard adds a branch the ruling does not ask for.
  - `[low]` `[reject]` (edge-case) a frozen instance of a registered class carrying its own non-writable brand string would take the token branch — `registerClass` puts the brand on the class, never an instance, so no framework value has this shape; such a value meets ESC-10.1-3's token predicate by definition.
  - `[low]` `[patch]` (edge-case) the test's token omits `[Symbol.for('xaravel.contract.parameters')]` that `contract()` sets — added `Object.freeze({})` under that key in `contractToken()`.
  - `[false]` `[reject]` (blind) `className()` callers now print a token's FQCN instead of `object` — `phpType()` classifies a token (prototype `Object.prototype`) as `array`, so the PHP-value paths never call `className`/`fqcn` on one; the verification-gap layer traced the same callers.
  - `[low]` `[reject]` (blind) same root as the first edge-case row (any string accepted) — rejected with it.
  - `[low]` `[patch]` (blind) same root as the third edge-case row (missing parameters key) — patched with it.
  - `[false]` `[reject]` (blind) "resolveClass never resolves a token's name" is too strong — `resolveClass` returns only registered classes, never a token; a class registered under the same name is that class, so the claim (the epic AC's wording) holds.
  - `[low]` `[patch]` (blind) no test pins `fqcn(Object.freeze(new Post()))` — added that assertion to XT-runtime-40; it passes (an instance has no own brand).
  - `[low]` `[patch]` (blind) the test file header does not mention Story 9.14 — added a Story 9.14 note naming XT-runtime-40 and its two ACs.
  - `[false]` `[reject]` (blind) the spec record and manifest status are incomplete while in review — they are written at Finalize; AC 3's baseline failure was run (XT-runtime-40 FAIL against `origin/main`'s `registry.ts` in a scratch worktree). Fix would edit the spec.
  - `[false]` `[reject]` (blind) the spec's `context:` omits AD-10 and `Contract.ts` — fix edits this build's spec; the Code Map already cites `Contract.ts:64-82`.
  - `[false]` `[reject]` (intent) no test passes a real `contract()` token to `fqcn()` — `packages/contracts/tests/xaravel/contract.test.ts` pins the token frozen with its exact own keys and string `CLASS_FQCN`, and the intent forbids importing contracts from the runtime.
  - `[false]` `[reject]` (intent) the hand-built token is not literally `contract()`'s shape — duplicate of the parameters-key row, now patched.
  - `[false]` `[reject]` (intent) frozen registered instance with an own brand is not in the matrix — duplicate of the second edge-case row.
  - verification-gap: no findings. Fidelity Review: pass from both reviewers at tree 677181a4 (no findings).

## Verification

**Commands:**
- `bun run harness --xaravel --component runtime` -- expected: no differences, XT-runtime-40 passes.
- `bun run harness` -- expected: SUMMARY with no differences (NOT-RUN variants allowed).
- `bun run typecheck` and `bun run lint` -- expected: exit 0.
- `bun run story:check 9.14` -- expected: pass.

## Fidelity Review

### Reviewer 1: pass at tree 677181a460ad60e08404014125d69caaad3a9d03

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `2e495fed0108c8473a98f1d9e3a9320938529a53`, on 2026-10-23T13:08:19.825Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and none are added or changed. |
| F-2: No expected value is weakened | pass | The added test uses exact FQCN and error-message comparisons matching ESC-10.1-3 and the existing registry behavior; no existing expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The Story relies on no Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-40 checks the declared token lookup inside and outside a test frame, registered classes and instances, rejected shapes and unregistered values, and token-name resolution failure against ESC-10.1-3. |
| F-8: No stub, fake or partial implementation of another Component | pass | Production changes stay in runtime's registry, as ESC-10.1-3 authorizes. The hand-built token is a test fixture, not an implementation of the contracts component. |
| F-9: Every `@asyncRoot` tag is true | pass | The retained Registry.resolveClassAsync tag matches its awaited dynamic import and ESC-9.4-1's approved root. The new token helper and modified fqcn remain synchronous and require no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"677181a460ad60e08404014125d69caaad3a9d03","base":"2e495fed0108c8473a98f1d9e3a9320938529a53","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-23T13:08:19.825Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and none are added or changed.","findings":[]},{"id":"F-2","result":"pass","note":"The added test uses exact FQCN and error-message comparisons matching ESC-10.1-3 and the existing registry behavior; no existing expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The Story relies on no Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-40 checks the declared token lookup inside and outside a test frame, registered classes and instances, rejected shapes and unregistered values, and token-name resolution failure against ESC-10.1-3.","findings":[]},{"id":"F-8","result":"pass","note":"Production changes stay in runtime's registry, as ESC-10.1-3 authorizes. The hand-built token is a test fixture, not an implementation of the contracts component.","findings":[]},{"id":"F-9","result":"pass","note":"The retained Registry.resolveClassAsync tag matches its awaited dynamic import and ESC-9.4-1's approved root. The new token helper and modified fqcn remain synchronous and require no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 677181a460ad60e08404014125d69caaad3a9d03

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `2e495fed0108c8473a98f1d9e3a9320938529a53`, on 2026-10-23T13:08:19.825Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and the diff adds or changes no Ported Test, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | There is no Ported Test, so no expected value is taken from Upstream. XT-runtime-40 is a new Xaravel Test and weakens no earlier assertion. |
| F-3: No assertion is removed without a DIV clause | n/a | There is no Ported Test whose assertions could be counted against Upstream. No assertion was removed from any existing Xaravel Test; the diff only appends to registry.test.ts. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change touches no Expectations file, so no line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): the Story relies on no Oracle fixture whose output is an error, and the change adds none. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | I compared XT-runtime-40's consequence string with its body. The body checks each claim: (1) fqcn(token) returns the name. (2) It still does inside a test frame that registered TokenFixture, and TokenFixture and its instance still resolve there. (3) A registered class (Post) and its instance give their FQCN. (4) These values each throw a TypeError with the exact miss message: not frozen, sealed but not frozen (the seal is asserted), accessor key, inherited key, number value, null value, frozen function, unregistered class and unregistered instance. (5) resolveClass(name) throws PHP's Error with 'Class "..." not found'. The non-object check is extra. The test cites ESC-10.1-3 option 1 and bare AD-10, and no AD-<n>.<k> token, so there is no bullet to mismatch. The body matches ESC-10.1-3's 'The change' list and both acceptance-criterion rows of the manifest. |
| F-8: No stub, fake or partial implementation of another Component | pass | The source change is in packages/runtime/src/registry/registry.ts only, in the runtime Component this Story belongs to. ESC-10.1-3 sends this change to Story 9.14 for that reason. contractToken is a test-local fixture that copies the token shape so the runtime test need not import @​xaravel/contracts (AD-2). It does not stub or partly implement the contracts Component. No hard-coded return was added: tokenFqcn reads the descriptor as the ruling describes. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists the file's one @​asyncRoot tag, line 167, on resolveClassAsync, which awaits import(). ESC-9.4-1 option 1a rules that root true, and the change keeps it. The changed fqcn and the new internal tokenFqcn are sync, do no IO and accept no callback, so they correctly carry no tag. No new async export was added. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"677181a460ad60e08404014125d69caaad3a9d03","base":"2e495fed0108c8473a98f1d9e3a9320938529a53","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-23T13:08:19.825Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and the diff adds or changes no Ported Test, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"There is no Ported Test, so no expected value is taken from Upstream. XT-runtime-40 is a new Xaravel Test and weakens no earlier assertion.","findings":[]},{"id":"F-3","result":"n/a","note":"There is no Ported Test whose assertions could be counted against Upstream. No assertion was removed from any existing Xaravel Test; the diff only appends to registry.test.ts.","findings":[]},{"id":"F-4","result":"n/a","note":"The change touches no Expectations file, so no line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field changes.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): the Story relies on no Oracle fixture whose output is an error, and the change adds none.","findings":[]},{"id":"F-7","result":"pass","note":"I compared XT-runtime-40's consequence string with its body. The body checks each claim: (1) fqcn(token) returns the name. (2) It still does inside a test frame that registered TokenFixture, and TokenFixture and its instance still resolve there. (3) A registered class (Post) and its instance give their FQCN. (4) These values each throw a TypeError with the exact miss message: not frozen, sealed but not frozen (the seal is asserted), accessor key, inherited key, number value, null value, frozen function, unregistered class and unregistered instance. (5) resolveClass(name) throws PHP's Error with `Class \"...\" not found`. The non-object check is extra. The test cites ESC-10.1-3 option 1 and bare AD-10, and no AD-<n>.<k> token, so there is no bullet to mismatch. The body matches ESC-10.1-3's 'The change' list and both acceptance-criterion rows of the manifest.","findings":[]},{"id":"F-8","result":"pass","note":"The source change is in packages/runtime/src/registry/registry.ts only, in the runtime Component this Story belongs to. ESC-10.1-3 sends this change to Story 9.14 for that reason. contractToken is a test-local fixture that copies the token shape so the runtime test need not import @xaravel/contracts (AD-2). It does not stub or partly implement the contracts Component. No hard-coded return was added: tokenFqcn reads the descriptor as the ruling describes.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists the file's one @asyncRoot tag, line 167, on resolveClassAsync, which awaits import(). ESC-9.4-1 option 1a rules that root true, and the change keeps it. The changed fqcn and the new internal tokenFqcn are sync, do no IO and accept no callback, so they correctly carry no tag. No new async export was added.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree e043bc875a0a2b84fe96d7a4b0cd636f9ab14ac1

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `2e495fed0108c8473a98f1d9e3a9320938529a53`, on 2026-10-23T13:13:09.825Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and none are added or changed. |
| F-2: No expected value is weakened | pass | XT-runtime-40 uses exact FQCN and error-message comparisons matching ESC-10.1-3 and the existing registry behavior; no expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The Story relies on no Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-40 checks the declared token result outside and inside a test frame, registry class and instance behavior, rejected token shapes, exact errors, and failure to resolve the token name, consistent with ESC-10.1-3. |
| F-8: No stub, fake or partial implementation of another Component | pass | Production changes stay within runtime's registry. The hand-built token is a test fixture for the approved structural protocol, not an implementation of the contracts Component. |
| F-9: Every `@asyncRoot` tag is true | pass | The retained Registry.resolveClassAsync tag matches its awaited dynamic import and ESC-9.4-1's explicit root approval. The new token helper and changed fqcn remain synchronous and require no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file is changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"e043bc875a0a2b84fe96d7a4b0cd636f9ab14ac1","base":"2e495fed0108c8473a98f1d9e3a9320938529a53","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-23T13:13:09.825Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and none are added or changed.","findings":[]},{"id":"F-2","result":"pass","note":"XT-runtime-40 uses exact FQCN and error-message comparisons matching ESC-10.1-3 and the existing registry behavior; no expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The Story relies on no Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-40 checks the declared token result outside and inside a test frame, registry class and instance behavior, rejected token shapes, exact errors, and failure to resolve the token name, consistent with ESC-10.1-3.","findings":[]},{"id":"F-8","result":"pass","note":"Production changes stay within runtime's registry. The hand-built token is a test fixture for the approved structural protocol, not an implementation of the contracts Component.","findings":[]},{"id":"F-9","result":"pass","note":"The retained Registry.resolveClassAsync tag matches its awaited dynamic import and ESC-9.4-1's explicit root approval. The new token helper and changed fqcn remain synchronous and require no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file is changed.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree e043bc875a0a2b84fe96d7a4b0cd636f9ab14ac1

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `2e495fed0108c8473a98f1d9e3a9320938529a53`, on 2026-10-23T13:13:09.825Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest has 'test_ids: []' and the diff adds or changes no Ported Test. The only test added is the Xaravel Test XT-runtime-40, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test is added or changed, so no Upstream expected value can be weakened. XT-runtime-40 uses exact assertSame comparisons on messages and FQCNs. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, and evidence (a) shows no 'adapted:DIV' marker. There are no Upstream assertions to count. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to 'skip'. No file under conformance/expectations is touched. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line has an 'adapted:DIV-<n>.<k>' marker, and no Expectations 'adapted' field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): the Story has no assigned Oracle requests, no error fixtures, and no fixtures changed. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared each claim in XT-runtime-40's consequence string with its body. (1) A token built in the shape 'contract<T>()' gives its string outside a test frame and inside one, under runInRootFrame('test') after a test-class registration. (2) The registered Post class, its instance and a frozen instance all give 'App\\Models\\Post'. (3) Each named miss throws the exact miss message: not frozen, sealed (with an assertion that it is sealed but not frozen), accessor, inherited, number, null, frozen function, unregistered class and unregistered instance. (4) resolveClass(name) throws PhpError 'Class "..." not found'. A writable data property on a frozen object is impossible, so the 'non-writable' condition is covered by frozenness. The cited AD-10 (identity via fqcn(), AD-10.2) and ESC-10.1-3 option 1 match the behaviour tested: the three token conditions, every other value unchanged, and resolveClass unchanged. |
| F-8: No stub, fake or partial implementation of another Component | pass | Source changes are limited to packages/runtime (registry.ts and its docs), which is the Story's runtime component, as ESC-10.1-3 routes it. The hand-built token in the test is a fixture that mirrors the contracts token shape so the runtime does not import @​xaravel/contracts (AD-2). It is not a stub or partial implementation of the contracts Component in source. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists one tag in registry.ts: line 167, '@​asyncRoot Registry.resolveClassAsync' on resolveClassAsync. That function 'await import()'s a file, and ESC-9.4-1 option 1a makes it a root, so the tag is true. The changed fqcn() stays sync and untagged, and the new tokenFqcn is a private sync helper. No new export is added, and no other declaration in the file is async. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"e043bc875a0a2b84fe96d7a4b0cd636f9ab14ac1","base":"2e495fed0108c8473a98f1d9e3a9320938529a53","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-23T13:13:09.825Z","items":[{"id":"F-1","result":"n/a","note":"The manifest has `test_ids: []` and the diff adds or changes no Ported Test. The only test added is the Xaravel Test XT-runtime-40, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is added or changed, so no Upstream expected value can be weakened. XT-runtime-40 uses exact assertSame comparisons on messages and FQCNs.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, and evidence (a) shows no `adapted:DIV` marker. There are no Upstream assertions to count.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to `skip`. No file under conformance/expectations is touched.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line has an `adapted:DIV-<n>.<k>` marker, and no Expectations `adapted` field changes.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): the Story has no assigned Oracle requests, no error fixtures, and no fixtures changed.","findings":[]},{"id":"F-7","result":"pass","note":"Compared each claim in XT-runtime-40's consequence string with its body. (1) A token built in the shape `contract<T>()` gives its string outside a test frame and inside one, under runInRootFrame('test') after a test-class registration. (2) The registered Post class, its instance and a frozen instance all give 'App\\\\Models\\\\Post'. (3) Each named miss throws the exact miss message: not frozen, sealed (with an assertion that it is sealed but not frozen), accessor, inherited, number, null, frozen function, unregistered class and unregistered instance. (4) resolveClass(name) throws PhpError `Class \"...\" not found`. A writable data property on a frozen object is impossible, so the 'non-writable' condition is covered by frozenness. The cited AD-10 (identity via fqcn(), AD-10.2) and ESC-10.1-3 option 1 match the behaviour tested: the three token conditions, every other value unchanged, and resolveClass unchanged.","findings":[]},{"id":"F-8","result":"pass","note":"Source changes are limited to packages/runtime (registry.ts and its docs), which is the Story's runtime component, as ESC-10.1-3 routes it. The hand-built token in the test is a fixture that mirrors the contracts token shape so the runtime does not import @xaravel/contracts (AD-2). It is not a stub or partial implementation of the contracts Component in source.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists one tag in registry.ts: line 167, `@asyncRoot Registry.resolveClassAsync` on resolveClassAsync. That function `await import()`s a file, and ESC-9.4-1 option 1a makes it a root, so the tag is true. The changed fqcn() stays sync and untagged, and the new tokenFqcn is a private sync helper. No new export is added, and no other declaration in the file is async.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: done

- **Change:** `fqcn()` in `@xaravel/runtime/registry` returns a `contract<T>()` token's own FQCN: a frozen, non-function object whose own, non-writable `Symbol.for('xaravel.class.fqcn')` data property is a string (ESC-10.1-3 option 1). Every other value keeps the Registry path and its errors; `resolveClass` is unchanged.
- **Files:**
  - `packages/runtime/src/registry/registry.ts` -- the `tokenFqcn` branch, docblock and header comment.
  - `packages/runtime/tests/xaravel/registry.test.ts` -- XT-runtime-40 over every matrix row, plus a frozen registered instance; file header names Story 9.14.
  - `packages/runtime/docs/class-registry.md` -- the `fqcn` bullet names the token case.
- **Review:** 14 findings (low 7, false 7). Patched 4 low rows (3 entries): the test token carries `contract()`'s parameters key, a frozen registered instance is asserted, the test header names Story 9.14. Rejected: a shape guard on the token string and the frozen-instance-with-own-brand case (low, unreachable for framework values, and outside ESC-10.1-3's predicate); `className` callers (tokens classify as `array`); the "never resolves" wording (holds: `resolveClass` returns only registered classes); spec-record and context items (fixes edit this spec); the consumer-surface item (contracts' own tests pin the token shape). Nothing deferred.
- **Follow-up review recommended:** false (patched: high 0, medium 0, low 3 entries).
- **Fidelity Review:** pass from both reviewers at tree 677181a4, and again at the patched tree e043bc87 (`status`: current).
- **Verification:** XT-runtime-40 fails against `origin/main`'s `registry.ts` (scratch worktree) and passes after; `bun run harness --xaravel --id 'XT-runtime-*'` 40/40; `bun run harness` SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0, XARAVEL 336 passed, 5 skipped, 0 failed; `bun run typecheck` and `bun run lint` exit 0.
- **Residual risk:** XT-runtime-40 builds its token by hand; `packages/contracts/tests/xaravel/contract.test.ts` pins the real token's frozen shape and keys.
