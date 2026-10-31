---
title: 'A declaration-time trait mark in the Class Registry: registerTrait, trait_exists and class_exists on a trait'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_revision: 2d676f663ff36136d7177bbca7a401ffa85ecc46
review_loop_iteration: 1
followup_review_recommended: false
context:
  - decisions/MAINT-2026-10-30-epic-15-items-2-5.md
warnings: [oversized]
deferred:
  - summary: >-
      ReflectionClass has no isTrait(), and instantiating a trait-marked class does not throw PHP's "Cannot instantiate trait" Error.
    evidence: |-
      packages/runtime/src/php/ReflectionClass.ts has no isTrait/isInterface/isEnum. This predates this item; no Ported Test needs it yet. The trait mark (isTraitClass) now gives a declaration-time source for it.
    location: >-
      packages/runtime/src/php/ReflectionClass.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** PHP 8.5.11's `class_exists` is `false` and `trait_exists` `true` for a trait. The runtime can tell a trait from a class only once `mixin` has composed it (`php/classExistence.ts`, mark `Symbol.for('xaravel.traits.trait')`), so `class_exists` on a trait nothing has composed yet gives `true`, and there is no `trait_exists` (finding S2 (d), `epic-15-retro-2026-10-30.md`; ruling `decisions/MAINT-2026-10-30-epic-15-items-2-5.md` item 2.3; action item `epic-15-retro-item-10-runtime-trait-registry`).

**Approach:** The Class Registry gains `registerTrait(fqcn, X)`: it registers `X` exactly as `registerClass` does and sets the trait mark on `X` at declaration time. The Registry owns the one mark and its predicate; `mixin` and `class_exists` use them. `@xaravel/runtime/php` (and the root) export PHP's `trait_exists`, a PHP function-name registry entry. The four existing traits call `registerTrait` just before their trailing `registerClass`.

## Boundaries & Constraints

**Always:** scope `packages/runtime`, `packages/collections`, `packages/conditionable`, `packages/macroable`, `packages/reflection` and this item's records; every trait file still ends with `registerClass('<Upstream FQCN>', X)` (AD-10.3; the registration scan, the API-surface diff and the thenable resolver read only that call); `registerTrait` throws as `registerClass` does, naming `registerTrait()`; `fqcn()`, `resolveClass`, `lookUpName`, `classUsesRecursive`, `mixin`, `interfaceExists` and `enumExists` behave as before; `trait_exists` coerces and throws as PHP's `string` / `bool` parameters, as `class_exists` does; PHP values recorded with the host's PHP 8.5.11 through a probe file.

**Never:** an edit to `tools/**`, `conformance/**`, PORTING.md, a DIV, the grader or Expectations; replacing a trait's `registerClass` with `registerTrait`; `registerTestTrait` or any other new API; any change to `mixin`'s composition, to what the mark is (own, non-enumerable, non-writable, non-configurable `true`) or to `class_exists` for a non-trait; weakening or removing an existing assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| trait, never composed | `registerTrait("F\\Greets", Greets)`; `class_exists` / `trait_exists` on `F\Greets`, `\F\GREETS` | `false` / `true` (PHP) | none |
| class | `class_exists` / `trait_exists` on `F\Plain`, `stdClass` | `true` / `false` | none |
| enum, interface | `F\Suit` (AD-26), `Stringable` | `class_exists` true / false; `trait_exists` false / false | none |
| unknown | `Nope\Nothing`, `""`, `5` | both `false` | none |
| bad argument | `[]`, `trait_exists("x", [])` | PHP's `TypeError` messages | PHP `TypeError` |
| identity | `fqcn(Greets)`, `resolveClass("F\\Greets")` after `registerTrait` | the FQCN, the class | none |
| registerTrait then registerClass | same FQCN and class | no-op | none |
| conflicts | taken FQCN, second FQCN, non-function, empty FQCN | `TypeError` naming `registerTrait()` | JS `TypeError` |
| the four traits | `class_exists` / `trait_exists` on each Upstream FQCN | `false` / `true` | none |

</intent-contract>

## Code Map

- `packages/runtime/src/registry/registry.ts:71-104` -- `registerClass`; factor its body into an internal `register(caller, fqcn, klass)` and add `registerTrait` beside it. File imports nothing from `php/` or `traits/` (load safety, lines 32-35): the mark symbol and `isTraitClass` / `markTrait` live here.
- `packages/runtime/src/registry/index.ts:13` and `packages/runtime/src/index.ts:265` -- registry re-exports; add `registerTrait`.
- `packages/runtime/src/traits/mixin.ts:44-45,272-276` -- local `TRAIT` symbol and the composition-time mark; use the Registry's `markTrait` (same extensible guard).
- `packages/runtime/src/php/classExistence.ts:55-75` -- local `TRAIT` and `class_exists`; use `isTraitClass`, add `trait_exists(trait, autoload = true)`.
- `packages/runtime/src/php/phpFunctions.ts:35,215` -- `entry("class_exists", class_exists, 1, 2)`; add `entry("trait_exists", trait_exists, 1, 2)`.
- `packages/runtime/src/php/index.ts:104`, `packages/runtime/src/index.ts:274-…` -- export `trait_exists`.
- `packages/runtime/docs/class-registry.md` (registration section), `packages/runtime/docs/php-functions.md:616-626` and its limits list line 830 (the "never composed" limit, now only for a trait registered with `registerClass` alone), `packages/runtime/docs/traits-and-inject.md` -- docs.
- `packages/runtime/tests/xaravel/php-phpdotenv-builtins.{probe.php,probe.txt,test.ts}` -- the probe pattern to copy (`out(label, value)`, `each_call`, `attempt`, label-set check); its `Greets` fixture is composed by `mixin`, so XT-runtime-134 stays unchanged.
- `packages/{macroable,conditionable,reflection,collections}/src/Traits/*.ts` last line -- `registerClass(...)`; add `registerTrait(...)` on the line before and the import.
- Last test IDs: XT-runtime-147, XT-macroable-4, XT-conditionable-4, XT-reflection-5, XT-collections-22.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/registry/registry.ts` -- `register` helper, `registerTrait`, `markTrait`, `isTraitClass`; header bullet.
- `packages/runtime/src/registry/index.ts`, `packages/runtime/src/index.ts`, `packages/runtime/src/php/index.ts` -- exports.
- `packages/runtime/src/traits/mixin.ts`, `packages/runtime/src/php/classExistence.ts`, `packages/runtime/src/php/phpFunctions.ts` -- shared mark, `trait_exists`, registry entry.
- the four trait files -- `registerTrait` before the trailing `registerClass`.
- `packages/runtime/tests/xaravel/trait-registry.probe.php` / `.probe.txt` / `trait-registry.test.ts` -- XT-runtime-148: every probe label recomputed (`class_exists`, `trait_exists`, `reflection` of `trait_exists`); Xaravel-only: identity, idempotence, conflicts, root/subpath identity, `function_exists("trait_exists")`.
- one Xaravel Test per trait package (XT-macroable-5, XT-conditionable-5, XT-reflection-6, XT-collections-23): `class_exists` false, `trait_exists` true, `fqcn` and `resolveClass` unchanged.
- the three runtime docs.

**Acceptance Criteria:**
- Given the recorded probe, when XT-runtime-148 runs, then each value equals PHP 8.5.11's.
- Given the four trait packages, when their new Xaravel Tests run, then each trait is `trait_exists` and not `class_exists`, and resolves and `fqcn`s as before.
- Given `bun run registration:check`, `bun run harness`, `bun run typecheck` and `bun run lint`, when run on the change, then each reports no violation or difference.

## Design Notes

Why both calls in a trait file: AD-10.3 makes every framework class file end with `registerClass('<Upstream FQCN>', X)`, and three Protected tools recognise only that statement in the trailing run. `registerTrait` therefore comes first, registers and marks; the trailing `registerClass` is the documented same-class, same-FQCN no-op.

```ts
registerTrait("Illuminate\\Support\\Traits\\Macroable", Macroable);
registerClass("Illuminate\\Support\\Traits\\Macroable", Macroable);
```

## Verification

**Commands:**
- `bun test packages/runtime/tests/xaravel/trait-registry.test.ts` and the four packages' Xaravel tests -- expected: pass
- `bun run registration:check` -- expected: no violations
- `bun run harness` (and `--xaravel`), `bun run typecheck`, `bun run lint` -- expected: clean

## Spec Change Log

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 24 findings — high 0, medium 2, low 15, false 7, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) The four per-package tests pass with `registerTrait` deleted: each test file composes its trait with `mixin` at load, which sets the same mark. — XT-macroable-5, XT-conditionable-5 and XT-reflection-6 now also run a fresh `bun -e` child, in the package directory, that imports only the trait's source file and asserts `class_exists` false / `trait_exists` true. Deleting the `registerTrait` line makes them fail (checked for Macroable and Conditionable). XT-collections-23 keeps the in-process check: `EnumeratesValues.ts` cannot load on its own (its import cycle with `Collection.ts`), and `Collection.ts` composes it, so no process ever holds it uncomposed. The test says so in a comment.
  - `[low]` `[reject]` (verification-gap other) `registerTrait` on a non-extensible class skips the mark silently. — `register` adds `CLASS_FQCN` with `defineProperty`, which throws on a non-extensible class, so this happens only if a class is registered, then frozen, then passed to `registerTrait`. That is unlikely, and the fix adds a guard.
  - `[low]` `[reject]` (edge-case) `registerTrait` after `registerClass` marks an existing class. — `registerTrait` is the declaration that a class is a trait, and PHP has no class that is both. The order is unlikely, and the fix adds a guard branch.
  - `[low]` `[reject]` (edge-case) A registered class frozen before `registerTrait` is not marked. — Same as the non-extensible finding above.
  - `[low]` `[reject]` (edge-case) An enum passed to `registerTrait`. — A misuse no port makes (Upstream declares each as `trait`). The fix adds a guard.
  - `[low]` `[patch]` (edge-case) A test fixture registered with `registerTestClass` cannot be declared a trait. — The intent names no test API, so no `registerTestTrait`. Documented as a limit in `php-functions.md` and `class-registry.md`.
  - `[low]` `[reject]` (edge-case) No test covers `registerClass` followed by `registerTrait`. — Follows the rejected reverse-order finding.
  - `[medium]` `[patch]` (blind) The per-package tests prove nothing about `registerTrait`. — Grouped with the verification-gap finding; same fix.
  - `[low]` `[reject]` (blind) Silent skip on a non-extensible class. — As above.
  - `[low]` `[reject]` (blind) The reverse order is not covered. — As above.
  - `[low]` `[patch]` (blind) The test-frame limit is undocumented. — Grouped with the edge-case finding; docs added.
  - `[false]` `[reject]` (blind) The action item is not set `done` in sprint status. — The orchestrator sets it with SPS in the same PR after the build; that is not this build's diff.
  - `[false]` `[reject]` (blind) `const TRAIT` after `registerTrait` risks a temporal-dead-zone error under a circular import. — `registry.ts` imports only `node:` modules, so nothing can call `registerTrait` during its evaluation. The constant was moved up anyway for readability, as part of the header patch.
  - `[low]` `[reject]` (blind) The `markTrait(klass: object)` type is wider than `isTraitClass` reads. — Internal helper, not exported from any index; both callers pass classes.
  - `[low]` `[patch]` (blind) Three test-file headers do not list the new XT IDs, and the macroable header line overruns the wrap width. — Headers updated and rewrapped.
  - `[low]` `[reject]` (blind) The probe records too few `autoload` / first-argument coercions. — `trait_exists` uses the same `stringParameter` / `boolParameter` helpers that XT-runtime-134 already checks against PHP for `class_exists`. Extra rows would duplicate that.
  - `[low]` `[reject]` (blind) The probe does not record a class that `use`s the trait. — Asserted Xaravel-only (`UsesGreets`) because the result depends on `mixin`; PHP's answer (class true / trait false) is the same.
  - `[low]` `[defer]` (blind) `ReflectionClass` has no `isTrait()`, and instantiating a trait does not throw. — Pre-existing; no Ported Test needs it yet.
  - `[low]` `[reject]` (blind) Inconsistent import paths in the new tests. — Cosmetic; both paths are public and give the same objects (XT-runtime-148 pins the identity).
  - `[false]` `[reject]` (blind) The four test bodies are copy-pasted. — Each is in its own package and test-ID namespace. A shared helper would cross packages and needs a home the grader rules do not give.
  - `[false]` `[reject]` (blind) Spec metadata and the missing verification record. — The fix would edit this build's spec. Results are recorded under Auto Run Result.
  - `[false]` `[reject]` (intent) The real traits are not checked against recorded PHP values. — The intent asks for XT-runtime cases against PHP on a class, a trait and an unknown name, and that is the fixture probe. Upstream declares each of the four as `trait`, so PHP's answer is fixed.
  - `[false]` `[reject]` (intent) A trait registered with `registerClass` alone keeps the old answer. — The intent scopes the change to `registerTrait`; the limit is documented.
  - `[false]` `[reject]` (intent) `trait_exists` is also true for a `mixin`-composed class. — That matches the existing `class_exists` rule, and the intent asks that nothing else change.

### 2026-10-30 — Review pass (Finalize re-check, Fidelity Review on tree d44e0497)
- verdicts: 1 findings — high 0, medium 0, low 1, false 0, maybe-false 0
- findings:
  - `[low]` `[patch]` (fidelity-review, F-7, reviewer 2) XT-collections-23's consequence claims `EnumeratesValues` "is declared a PHP trait with registerTrait", which its body cannot show, since only `Collection.ts` loads it and composes it. — Reworded the consequence string and the file header to claim only what the body checks: once the package is loaded, `class_exists` is false and `trait_exists` true, and `fqcn` and `resolveClass` are unchanged. No assertion changed.

## Fidelity Review

### Reviewer 1: pass at tree 0fdc50cbcd0e553f224fce4cbb1e621c37007195

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `2d676f663ff36136d7177bbca7a401ffa85ecc46`, on 2026-10-31T03:47:24.421Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed, and no Ported Test IDs are assigned. |
| F-2: No expected value is weakened | pass | Existing assertions remain exact. The registry count increases from 133 to 134 for the added trait_exists entry; probe expectations add its results without loosening prior comparisons. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds or modifies no Expectations skip line. |
| F-5: Every `adapted` marker matches its clause | n/a | The diff adds or changes no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The new trait tests check existence, normalized names and preserved identity. XT-runtime-148 compares all recorded PHP probe cases exactly and checks exports, registry metadata, marking and registration errors. The existing resolver tests retain their checks while including the new entry. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes stay within the five authorized components. Trait classification belongs to runtime, and the four trait components use that shared implementation; no other component is simulated. |
| F-9: Every `@asyncRoot` tag is true | pass | The declaration inventory retains only Registry.resolveClassAsync's actual async-root tag, expressly authorized by ESC-9.4-1. New registry and existence functions are synchronous; Conditionable and collection branching helpers retain their permitted dual-helper signatures. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"0fdc50cbcd0e553f224fce4cbb1e621c37007195","base":"2d676f663ff36136d7177bbca7a401ffa85ecc46","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-31T03:47:24.421Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed, and no Ported Test IDs are assigned.","findings":[]},{"id":"F-2","result":"pass","note":"Existing assertions remain exact. The registry count increases from 133 to 134 for the added trait_exists entry; probe expectations add its results without loosening prior comparisons.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds or modifies no Expectations skip line.","findings":[]},{"id":"F-5","result":"n/a","note":"The diff adds or changes no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"The new trait tests check existence, normalized names and preserved identity. XT-runtime-148 compares all recorded PHP probe cases exactly and checks exports, registry metadata, marking and registration errors. The existing resolver tests retain their checks while including the new entry.","findings":[]},{"id":"F-8","result":"pass","note":"Changes stay within the five authorized components. Trait classification belongs to runtime, and the four trait components use that shared implementation; no other component is simulated.","findings":[]},{"id":"F-9","result":"pass","note":"The declaration inventory retains only Registry.resolveClassAsync's actual async-root tag, expressly authorized by ESC-9.4-1. New registry and existence functions are synchronous; Conditionable and collection branching helpers retain their permitted dual-helper signatures.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 0fdc50cbcd0e553f224fce4cbb1e621c37007195

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `2d676f663ff36136d7177bbca7a401ffa85ecc46`, on 2026-10-31T03:47:24.421Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and no Ported Test; only Xaravel Tests, runtime source, docs and probes change. There is no Upstream assertion to compare. |
| F-2: No expected value is weakened | pass | No Ported Test changes. In the touched Xaravel Tests, the only changed expected value is XT-runtime-84's exact registry count, 133 to 134. That rises because 'trait_exists' was added, and the comment says so. The php-set-functions.probe.txt rows only gain 'trait_exists' entries (reflection, counts, exports true, registerTrait false), regenerated alongside the probe.php registry and exports lists. No comparison is loosened and no existing value is changed to match Xaravel. |
| F-3: No assertion is removed without a DIV clause | pass | No Ported Test is touched, and no assertion in the changed Xaravel Tests (XT-runtime-83/84/85 and the macroable header comment) is removed. The diffs only add assertions (XT-collections-23, XT-conditionable-5, XT-macroable-5, XT-reflection-6, XT-runtime-148) or update the registry count. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or set to skip (evidence (i) and the Inventory section confirm this). |
| F-5: Every `adapted` marker matches its clause | n/a | The diff adds no '// adapted:DIV-<n>.<k>' marker and no Expectations 'adapted' field. The existing DIV-9.16 markers in collections.test.ts are unchanged. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows the item relies on no Oracle fixture, and no fixture is an error. trait-registry.test.ts uses a host-PHP probe record, not an Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-collections-23, XT-conditionable-5, XT-macroable-5 and XT-reflection-6 each assert, for the trait's Upstream FQCN, that class_exists is false and trait_exists is true. They do this with the name as written, upper-cased with a leading '\' (class_exists) and lower-cased with a leading '\' (trait_exists), then check that fqcn and resolveClass are unchanged, which is what each consequence states. XT-runtime-148 compares every probe label (class_exists and trait_exists over a trait, class, enum, interface, unknown name and empty string, the coercion TypeErrors and a double backslash) with the PHP 8.5.11 record, which covers both directions. It also checks ReflectionFunction counts and ArgumentCountErrors, root/php identity, function_exists and is_callable, and the mark descriptor. It checks that a repeated registerTrait and a following registerClass are no-ops, that mixin keeps the mark, and that registerTrait() names itself in the conflict, non-class and empty-FQCN errors. No FR/AD tokens are cited. XT-runtime-83/84/85 still compare against the regenerated probe record, and their consequences are unchanged. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every change is in packages/runtime, collections, conditionable, macroable and reflection, the components the sprint entry lists. The four trait files only add the registerTrait call the ruling (MAINT-2026-10-30-epic-15-items-2-5 item 2(d)) prescribes. No stub, fake or hard-coded behaviour of another component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g): registry.ts keeps its single tag, '@​asyncRoot Registry.resolveClassAsync' (line 216), which ESC-9.4-1 rules true. The new exports registerTrait, markTrait, isTraitClass and trait_exists are sync, do no IO and accept no async callback, so they correctly take no tag. The '@​asyncRoot' text at line 7 of EnumeratesValues.ts and line 14 of Conditionable.ts is comment prose about dual helpers, not a tag. classExistence, phpFunctions, mixin and the index files hold no tags and gain no async exports. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"0fdc50cbcd0e553f224fce4cbb1e621c37007195","base":"2d676f663ff36136d7177bbca7a401ffa85ecc46","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-31T03:47:24.421Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and no Ported Test; only Xaravel Tests, runtime source, docs and probes change. There is no Upstream assertion to compare.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changes. In the touched Xaravel Tests, the only changed expected value is XT-runtime-84's exact registry count, 133 to 134. That rises because `trait_exists` was added, and the comment says so. The php-set-functions.probe.txt rows only gain `trait_exists` entries (reflection, counts, exports true, registerTrait false), regenerated alongside the probe.php registry and exports lists. No comparison is loosened and no existing value is changed to match Xaravel.","findings":[]},{"id":"F-3","result":"pass","note":"No Ported Test is touched, and no assertion in the changed Xaravel Tests (XT-runtime-83/84/85 and the macroable header comment) is removed. The diffs only add assertions (XT-collections-23, XT-conditionable-5, XT-macroable-5, XT-reflection-6, XT-runtime-148) or update the registry count.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or set to skip (evidence (i) and the Inventory section confirm this).","findings":[]},{"id":"F-5","result":"n/a","note":"The diff adds no `// adapted:DIV-<n>.<k>` marker and no Expectations `adapted` field. The existing DIV-9.16 markers in collections.test.ts are unchanged.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows the item relies on no Oracle fixture, and no fixture is an error. trait-registry.test.ts uses a host-PHP probe record, not an Oracle fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-collections-23, XT-conditionable-5, XT-macroable-5 and XT-reflection-6 each assert, for the trait's Upstream FQCN, that class_exists is false and trait_exists is true. They do this with the name as written, upper-cased with a leading `\\` (class_exists) and lower-cased with a leading `\\` (trait_exists), then check that fqcn and resolveClass are unchanged, which is what each consequence states. XT-runtime-148 compares every probe label (class_exists and trait_exists over a trait, class, enum, interface, unknown name and empty string, the coercion TypeErrors and a double backslash) with the PHP 8.5.11 record, which covers both directions. It also checks ReflectionFunction counts and ArgumentCountErrors, root/php identity, function_exists and is_callable, and the mark descriptor. It checks that a repeated registerTrait and a following registerClass are no-ops, that mixin keeps the mark, and that registerTrait() names itself in the conflict, non-class and empty-FQCN errors. No FR/AD tokens are cited. XT-runtime-83/84/85 still compare against the regenerated probe record, and their consequences are unchanged.","findings":[]},{"id":"F-8","result":"pass","note":"Every change is in packages/runtime, collections, conditionable, macroable and reflection, the components the sprint entry lists. The four trait files only add the registerTrait call the ruling (MAINT-2026-10-30-epic-15-items-2-5 item 2(d)) prescribes. No stub, fake or hard-coded behaviour of another component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g): registry.ts keeps its single tag, `@asyncRoot Registry.resolveClassAsync` (line 216), which ESC-9.4-1 rules true. The new exports registerTrait, markTrait, isTraitClass and trait_exists are sync, do no IO and accept no async callback, so they correctly take no tag. The '@asyncRoot' text at line 7 of EnumeratesValues.ts and line 14 of Conditionable.ts is comment prose about dual helpers, not a tag. classExistence, phpFunctions, mixin and the index files hold no tags and gain no async exports.","findings":[]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ changes.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree d44e04977b4aa95287dede978aad9927a25f9066

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `2d676f663ff36136d7177bbca7a401ffa85ecc46`, on 2026-10-31T04:02:15.588Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed, and no Ported Test IDs are assigned. |
| F-2: No expected value is weakened | pass | Existing assertions retain exact comparisons and expected values. The registry count increases from 133 to 134 for the added trait_exists entry; probe rows add its PHP results without weakening existing expectations. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds or modifies no assertion adaptation marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The supplied Xaravel Test bodies check trait/class existence, name normalization, preserved registry identity, registration errors, and PHP probe results as their consequences declare. Existing resolver tests retain their checks and include the new registry entry. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes stay within the five components explicitly authorized by the action item. Trait registration and existence checks belong to runtime; the four trait components use that shared implementation without adding another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The declaration inventory shows synchronous new registry and existence helpers, permitted dual helpers without tags, and the retained Registry.resolveClassAsync tag explicitly authorized by ESC-9.4-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"d44e04977b4aa95287dede978aad9927a25f9066","base":"2d676f663ff36136d7177bbca7a401ffa85ecc46","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-31T04:02:15.588Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed, and no Ported Test IDs are assigned.","findings":[]},{"id":"F-2","result":"pass","note":"Existing assertions retain exact comparisons and expected values. The registry count increases from 133 to 134 for the added trait_exists entry; probe rows add its PHP results without weakening existing expectations.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds or modifies no assertion adaptation marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"The supplied Xaravel Test bodies check trait/class existence, name normalization, preserved registry identity, registration errors, and PHP probe results as their consequences declare. Existing resolver tests retain their checks and include the new registry entry.","findings":[]},{"id":"F-8","result":"pass","note":"Changes stay within the five components explicitly authorized by the action item. Trait registration and existence checks belong to runtime; the four trait components use that shared implementation without adding another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The declaration inventory shows synchronous new registry and existence helpers, permitted dual helpers without tags, and the retained Registry.resolveClassAsync tag explicitly authorized by ESC-9.4-1.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree d44e04977b4aa95287dede978aad9927a25f9066

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `2d676f663ff36136d7177bbca7a401ffa85ecc46`, on 2026-10-31T04:02:15.588Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and no Ported Test; it only adds and changes Xaravel Tests. |
| F-2: No expected value is weakened | pass | I compared the changed expected values. XT-runtime-84's registry count goes from 133 to 134 because trait_exists is added, and it stays an exact assertSame. The php-set-functions probe gains trait_exists rows in reflection, counts and exports. The new trait-registry probe.txt values match what PHP 8.5.11 gives: a trait is false for class_exists and true for trait_exists, an enum and stdClass are true for class_exists, Stringable is false, and an array argument gives PHP's TypeError messages. No comparison is loosened and no value is fitted to the port. |
| F-3: No assertion is removed without a DIV clause | pass | Every touched test file only adds tests or assertions; none removes an assertion. No Ported Test changes. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip line. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted:DIV marker and no Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The change uses no Oracle fixture, and none is an error. The PHP evidence comes from committed probe outputs instead. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | I compared each new XT body with its consequence string. XT-runtime-148 checks the probe labels, root and subpath identity, the registry entry, the mark's descriptor, that a repeated registerTrait and the trailing registerClass are no-ops, that mixin keeps the mark, and every registerTrait conflict message. XT-conditionable-5, XT-macroable-5 and XT-reflection-6 each show, in a fresh process with no mixin, that the mark comes from registerTrait. XT-collections-23 claims EnumeratesValues is declared a trait with registerTrait, but its body cannot tell that mark from the one mixin sets when Collection composes the trait. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is in runtime, collections, conditionable, macroable or reflection, the scope the action item lists. Each trait package only calls the new runtime registerTrait export. No stub, fake or hard-coded return of another component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | The only @​asyncRoot tag in the touched files is Registry.resolveClassAsync, at registry.ts:215, which ESC-9.4-1 rules true. The 'line 7' and 'line 14' hits in EnumeratesValues.ts and Conditionable.ts are header comments saying those dual helpers take no tag. The new exports registerTrait, markTrait, isTraitClass and trait_exists are synchronous, so they correctly have no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/collections/tests/xaravel/collections.test.ts`: XT-collections-23's consequence says EnumeratesValues 'is declared a PHP trait with registerTrait', but the body cannot show it. Its own comment says the trait loads only through Collection.ts, whose mixin(null, EnumeratesValues, …) sets the same mark, so the class_exists and trait_exists assertions would pass with the registerTrait call removed. Either reword the consequence to claim only what the body checks (class_exists false, trait_exists true, fqcn and resolveClass unchanged), or add a check that tells registerTrait's mark from mixin's, as the sibling tests do with a fresh process.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"d44e04977b4aa95287dede978aad9927a25f9066","base":"2d676f663ff36136d7177bbca7a401ffa85ecc46","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-31T04:02:15.588Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and no Ported Test; it only adds and changes Xaravel Tests.","findings":[]},{"id":"F-2","result":"pass","note":"I compared the changed expected values. XT-runtime-84's registry count goes from 133 to 134 because trait_exists is added, and it stays an exact assertSame. The php-set-functions probe gains trait_exists rows in reflection, counts and exports. The new trait-registry probe.txt values match what PHP 8.5.11 gives: a trait is false for class_exists and true for trait_exists, an enum and stdClass are true for class_exists, Stringable is false, and an array argument gives PHP's TypeError messages. No comparison is loosened and no value is fitted to the port.","findings":[]},{"id":"F-3","result":"pass","note":"Every touched test file only adds tests or assertions; none removes an assertion. No Ported Test changes.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip line.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted:DIV marker and no Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The change uses no Oracle fixture, and none is an error. The PHP evidence comes from committed probe outputs instead.","findings":[]},{"id":"F-7","result":"fail","note":"I compared each new XT body with its consequence string. XT-runtime-148 checks the probe labels, root and subpath identity, the registry entry, the mark's descriptor, that a repeated registerTrait and the trailing registerClass are no-ops, that mixin keeps the mark, and every registerTrait conflict message. XT-conditionable-5, XT-macroable-5 and XT-reflection-6 each show, in a fresh process with no mixin, that the mark comes from registerTrait. XT-collections-23 claims EnumeratesValues is declared a trait with registerTrait, but its body cannot tell that mark from the one mixin sets when Collection composes the trait.","findings":[{"path":"packages/collections/tests/xaravel/collections.test.ts","detail":"XT-collections-23's consequence says EnumeratesValues 'is declared a PHP trait with registerTrait', but the body cannot show it. Its own comment says the trait loads only through Collection.ts, whose mixin(null, EnumeratesValues, …) sets the same mark, so the class_exists and trait_exists assertions would pass with the registerTrait call removed. Either reword the consequence to claim only what the body checks (class_exists false, trait_exists true, fqcn and resolveClass unchanged), or add a check that tells registerTrait's mark from mixin's, as the sibling tests do with a fresh process.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"Every changed file is in runtime, collections, conditionable, macroable or reflection, the scope the action item lists. Each trait package only calls the new runtime registerTrait export. No stub, fake or hard-coded return of another component is added.","findings":[]},{"id":"F-9","result":"pass","note":"The only @asyncRoot tag in the touched files is Registry.resolveClassAsync, at registry.ts:215, which ESC-9.4-1 rules true. The 'line 7' and 'line 14' hits in EnumeratesValues.ts and Conditionable.ts are header comments saying those dual helpers take no tag. The new exports registerTrait, markTrait, isTraitClass and trait_exists are synchronous, so they correctly have no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree ef1b0f468cde3a53ccf768884828bc3c1082bb9d

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `2d676f663ff36136d7177bbca7a401ffa85ecc46`, on 2026-10-31T04:03:34.343Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The change adds or modifies no Ported Test and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | The diff preserves existing comparisons and expected values. The exact registry count increases from 133 to 134 for the added trait_exists entry; probe rows add its PHP results without loosening comparisons. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertion is changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip by this change. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds or modifies no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The added test bodies check their stated trait classification and preserved identity lookups. Sibling fresh-process checks establish declaration-time marking; XT-runtime-148 compares matching PHP probe calls and checks registration behavior. XT-collections-23 now claims only package-loaded classification and lookups, which its assertions verify. |
| F-8: No stub, fake or partial implementation of another Component | pass | The changed production paths belong to the five explicitly authorized components. Trait registration and PHP existence checks remain runtime behavior; no substitute implementation of another component is introduced. |
| F-9: Every `@asyncRoot` tag is true | pass | The declaration inventory and diff show synchronous registration and existence helpers requiring no tags. Existing callback dual helpers retain generic result types. The retained Registry.resolveClassAsync tag is supported by ESC-9.4-1's module-loading root ruling. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 2, F-7) `packages/collections/tests/xaravel/collections.test.ts`: XT-collections-23's consequence says EnumeratesValues 'is declared a PHP trait with registerTrait', but the body cannot show it. Its own comment says the trait loads only through Collection.ts, whose mixin(null, EnumeratesValues, …) sets the same mark, so the class_exists and trait_exists assertions would pass with the registerTrait call removed. Either reword the consequence to claim only what the body checks (class_exists false, trait_exists true, fqcn and resolveClass unchanged), or add a check that tells registerTrait's mark from mixin's, as the sibling tests do with a fresh process. **fixed**: XT-collections-23's consequence now describes classification after loading @​xaravel/collections and preserved fqcn/resolveClass results. It no longer claims to distinguish registerTrait marking from mixin marking.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"ef1b0f468cde3a53ccf768884828bc3c1082bb9d","base":"2d676f663ff36136d7177bbca7a401ffa85ecc46","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-31T04:03:34.343Z","items":[{"id":"F-1","result":"n/a","note":"The change adds or modifies no Ported Test and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"The diff preserves existing comparisons and expected values. The exact registry count increases from 133 to 134 for the added trait_exists entry; probe rows add its PHP results without loosening comparisons.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertion is changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip by this change.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds or modifies no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"The added test bodies check their stated trait classification and preserved identity lookups. Sibling fresh-process checks establish declaration-time marking; XT-runtime-148 compares matching PHP probe calls and checks registration behavior. XT-collections-23 now claims only package-loaded classification and lookups, which its assertions verify.","findings":[]},{"id":"F-8","result":"pass","note":"The changed production paths belong to the five explicitly authorized components. Trait registration and PHP existence checks remain runtime behavior; no substitute implementation of another component is introduced.","findings":[]},{"id":"F-9","result":"pass","note":"The declaration inventory and diff show synchronous registration and existence helpers requiring no tags. Existing callback dual helpers retain generic result types. The retained Registry.resolveClassAsync tag is supported by ESC-9.4-1's module-loading root ruling.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":2,"item":"F-7","path":"packages/collections/tests/xaravel/collections.test.ts","detail":"XT-collections-23's consequence says EnumeratesValues 'is declared a PHP trait with registerTrait', but the body cannot show it. Its own comment says the trait loads only through Collection.ts, whose mixin(null, EnumeratesValues, …) sets the same mark, so the class_exists and trait_exists assertions would pass with the registerTrait call removed. Either reword the consequence to claim only what the body checks (class_exists false, trait_exists true, fqcn and resolveClass unchanged), or add a check that tells registerTrait's mark from mixin's, as the sibling tests do with a fresh process.","fixed":true,"note":"XT-collections-23's consequence now describes classification after loading @xaravel/collections and preserved fqcn/resolveClass results. It no longer claims to distinguish registerTrait marking from mixin marking."}]}
```

### Reviewer 2: pass at tree ef1b0f468cde3a53ccf768884828bc3c1082bb9d

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `2d676f663ff36136d7177bbca7a401ffa85ecc46`, on 2026-10-31T04:03:34.343Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Expectations line and no Ported Test; only Xaravel Tests are touched. |
| F-2: No expected value is weakened | pass | No Ported Test changes. In the touched Xaravel Tests, XT-runtime-84's exact count goes from 133 to 134 for the added trait_exists entry and stays an exact assertSame. php-set-functions.probe.txt only gains trait_exists and registerTrait rows. No expected value was loosened or rewritten to match Xaravel. |
| F-3: No assertion is removed without a DIV clause | pass | No assertion is removed from any touched test. The diffs to collections, conditionable, macroable, reflection, php-set-functions and trait-registry only add assertions or update the exact count. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted marker and no Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no Oracle fixture the change relies on is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-148: the class_exists/trait_exists probe labels (trait, class, enum, interface, unknown name, coercion, TypeErrors) are recomputed and compared with the PHP 8.5.11 record, as are the ReflectionFunction counts and ArgumentCountErrors. Root/php identity, the registry entry, registerTrait's no-op and thrown messages, and the mark's descriptor are checked, all before any mixin. XT-conditionable-5, XT-macroable-5 and XT-reflection-6 check class_exists, trait_exists, case and leading backslash, fqcn and resolveClass, plus a fresh process loading only the trait file, which shows the mark comes from registerTrait. XT-collections-23's consequence now claims only what its body checks (P-1). None of these cites an FR or AD bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes stay within runtime, collections, conditionable, macroable and reflection, the components the item lists. Each trait file only adds a registerTrait call. No stub, fake or hard-coded return of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | The new exports registerTrait, markTrait, isTraitClass and trait_exists are sync, with no Promise and no tag. The only @​asyncRoot tag kept in a touched file is on resolveClassAsync (Registry.resolveClassAsync), which is true per ESC-9.4-1 option 1a. The other matches in EnumeratesValues and Conditionable are comments explaining why the dual helpers take no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 2, F-7) `packages/collections/tests/xaravel/collections.test.ts`: XT-collections-23's consequence says EnumeratesValues 'is declared a PHP trait with registerTrait', but the body cannot show it. Its own comment says the trait loads only through Collection.ts, whose mixin(null, EnumeratesValues, …) sets the same mark, so the class_exists and trait_exists assertions would pass with the registerTrait call removed. Either reword the consequence to claim only what the body checks (class_exists false, trait_exists true, fqcn and resolveClass unchanged), or add a check that tells registerTrait's mark from mixin's, as the sibling tests do with a fresh process. **fixed**: XT-collections-23's consequence now reads 'EnumeratesValues reads as a PHP trait once @​xaravel/collections is loaded: class_exists is false and trait_exists true … while fqcn and resolveClass give the FQCN and the class as before'. It no longer claims registerTrait declares it, and the body checks exactly these points.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"ef1b0f468cde3a53ccf768884828bc3c1082bb9d","base":"2d676f663ff36136d7177bbca7a401ffa85ecc46","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-31T04:03:34.343Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Expectations line and no Ported Test; only Xaravel Tests are touched.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changes. In the touched Xaravel Tests, XT-runtime-84's exact count goes from 133 to 134 for the added trait_exists entry and stays an exact assertSame. php-set-functions.probe.txt only gains trait_exists and registerTrait rows. No expected value was loosened or rewritten to match Xaravel.","findings":[]},{"id":"F-3","result":"pass","note":"No assertion is removed from any touched test. The diffs to collections, conditionable, macroable, reflection, php-set-functions and trait-registry only add assertions or update the exact count.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted marker and no Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no Oracle fixture the change relies on is an error.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-148: the class_exists/trait_exists probe labels (trait, class, enum, interface, unknown name, coercion, TypeErrors) are recomputed and compared with the PHP 8.5.11 record, as are the ReflectionFunction counts and ArgumentCountErrors. Root/php identity, the registry entry, registerTrait's no-op and thrown messages, and the mark's descriptor are checked, all before any mixin. XT-conditionable-5, XT-macroable-5 and XT-reflection-6 check class_exists, trait_exists, case and leading backslash, fqcn and resolveClass, plus a fresh process loading only the trait file, which shows the mark comes from registerTrait. XT-collections-23's consequence now claims only what its body checks (P-1). None of these cites an FR or AD bullet.","findings":[]},{"id":"F-8","result":"pass","note":"Changes stay within runtime, collections, conditionable, macroable and reflection, the components the item lists. Each trait file only adds a registerTrait call. No stub, fake or hard-coded return of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"The new exports registerTrait, markTrait, isTraitClass and trait_exists are sync, with no Promise and no tag. The only @asyncRoot tag kept in a touched file is on resolveClassAsync (Registry.resolveClassAsync), which is true per ESC-9.4-1 option 1a. The other matches in EnumeratesValues and Conditionable are comments explaining why the dual helpers take no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":2,"item":"F-7","path":"packages/collections/tests/xaravel/collections.test.ts","detail":"XT-collections-23's consequence says EnumeratesValues 'is declared a PHP trait with registerTrait', but the body cannot show it. Its own comment says the trait loads only through Collection.ts, whose mixin(null, EnumeratesValues, …) sets the same mark, so the class_exists and trait_exists assertions would pass with the registerTrait call removed. Either reword the consequence to claim only what the body checks (class_exists false, trait_exists true, fqcn and resolveClass unchanged), or add a check that tells registerTrait's mark from mixin's, as the sibling tests do with a fresh process.","fixed":true,"note":"XT-collections-23's consequence now reads 'EnumeratesValues reads as a PHP trait once @xaravel/collections is loaded: class_exists is false and trait_exists true … while fqcn and resolveClass give the FQCN and the class as before'. It no longer claims registerTrait declares it, and the body checks exactly these points."}]}
```

## Auto Run Result

Status: done

- **Change:**
  - The Class Registry gains `registerTrait(fqcn, X)`. It registers the class as `registerClass` does and sets the trait mark (`Symbol.for('xaravel.traits.trait')`) when the file loads.
  - The Registry now owns the mark (`markTrait`, `isTraitClass`), and `mixin`, `class_exists` and `trait_exists` use it.
  - PHP's `trait_exists` is a new PHP function-name registry entry, exported from `@xaravel/runtime/php` and the root.
  - `Macroable`, `Conditionable`, `ReflectsClosures` and `EnumeratesValues` call `registerTrait` just before their trailing `registerClass` (AD-10.3).
- **Files:**
  - runtime `registry/registry.ts` (`register` helper, `registerTrait`, the mark), `registry/index.ts`, `index.ts` and `php/index.ts` (exports), `php/classExistence.ts` (`trait_exists`, the shared predicate), `php/phpFunctions.ts` (the entry) and `traits/mixin.ts` (the shared `markTrait`).
  - The four trait files.
  - Tests: XT-runtime-148 (`trait-registry.{probe.php,probe.txt,test.ts}`, values recorded with PHP 8.5.11); XT-macroable-5, XT-conditionable-5 and XT-reflection-6 (each with a fresh-process check); XT-collections-23. `php-set-functions` gets the registry count 133→134 and the probe's name lists plus its record.
  - Docs: `class-registry.md`, `php-functions.md`, `traits-and-inject.md`.
- **Review:**
  - Pass 1: 24 findings.
    - 5 patched: the per-package fresh-process check (medium; two findings grouped), the test-frame limit documented, the test-file headers, and `TRAIT` moved up.
    - 1 deferred: `ReflectionClass::isTrait`.
    - The rest rejected, with the reasons in the triage log.
  - Pass 2 (Fidelity on tree d44e0497): one F-7 reject, patched by rewording XT-collections-23's consequence.
  - Fidelity on tree ef1b0f46: two passes.
- **Follow-up review recommended:** false. One medium patch in pass 1, and that patch is verified to bite: deleting `registerTrait` fails the test.
- **Verification:**
  - `bun run harness`: differ=0, Xaravel tests 534 passed, 0 failed. One run had a transient XT-conformance-145 `git clone` temp-dir failure; it passed 3 of 3 times alone and in the next full runs.
  - `bun run registration:check`: ok (118 registrations). `bun run typecheck` and `bun run lint`: clean.
- **Residual risk:**
  - A trait registered with `registerClass` alone, or a `registerTestClass` fixture, is still told apart only once `mixin` composes it (documented).
  - `EnumeratesValues`' declaration-time mark cannot be observed apart from `Collection`'s composition.
