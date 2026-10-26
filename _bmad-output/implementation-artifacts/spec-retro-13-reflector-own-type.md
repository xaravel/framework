---
title: 'Reflector over a parameter''s own type (epic-13-retro-item-5-reflector-own-type)'
type: 'bugfix'
created: '2026-10-25'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
warnings: ['oversized']
deferred:
  - summary: >-
      Reflector's static-method check for 'Class::method' strings repeats the runtime's private findMethod prototype-chain walk.
    evidence: |-
      findMethod (packages/runtime/src/php/reflectionTargets.ts:82-110) is not exported, and the Maintainer's widened scope for item 5 allows only ReflectionNamedType and its builder in packages/runtime. If the runtime walk changes (accessors, symbol keys), methodExists and Reflector's walk may disagree. A fix exports a static-ness query from the runtime (for example ReflectionMethod::isStatic) in a later runtime-scoped change.
    location: >-
      packages/reflection/src/Reflector.ts (isCallableValue helper)
    severity: medium
baseline_revision: '4cdb11c1533f379b8cea6cb1dcb04c40fb6942aa'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-13-retro-2026-10-25.md'
  - '{project-root}/decisions/MAINT-2026-10-25-epic-13-items.md'
---

<intent-contract>

## Intent

**Problem:** Epic 13 retrospective action item 5 (findings L1, L4, L5), extended by item 6 (b) of `decisions/MAINT-2026-10-25-epic-13-items.md`. `Reflector.isParameterSubclassOf` turns the parameter's type into an FQCN and resolves it again, so a second contract token recorded under the same FQCN answers with the first token's parents (L1). XT-reflection does not pin whether a bare unregistered constructor is callable (L4), or that a parameter typed with an unregistered class throws (L5). `isCallable('Class::instanceMethod')` gives `true` where PHP 8 gives `false` (item 6 (b)).

**Scope:** `packages/reflection/**`, and `packages/runtime/**` limited to letting `ReflectionNamedType` (and the parameter reflection that builds it) carry the parameter's Spec value, the class or token, beside its FQCN name, with an XT-runtime case. Both are named by the item's `action` (amendment 2026-10-22 of `decisions/MAINT-2026-10-16-unattended-orchestrator.md`; the Maintainer's "Amendment: item 5's scope" in `decisions/MAINT-2026-10-25-epic-13-items.md`).

**Approach:** `ReflectionNamedType` keeps the class or token it was built from (null for a builtin or a relative marker) behind a new accessor `getClassOrToken()`; `Reflector.isParameterSubclassOf` builds its `ReflectionClass` from that value when present, else from the resolved name (the `self` / `parent` case). `isCallable`'s `'Class::method'` string path requires a found method to be static (on the class's static chain, not its prototype chain); a missing method still falls back to `__callStatic`. L4 and L5 are pinned as they behave today and documented.

## Boundaries & Constraints

**Always:** Keep Upstream's line structure of `isParameterSubclassOf` (name, `class_exists || interface_exists`, `isSubclassOf`). `null` is the only absent value; everything stays sync. New XT cases use `xaravelTest` and `@xaravel/assert`. Existing assertions stay, except XT-reflection-1's `Listener::handle` string pin, re-pinned `true` → `false` as the Maintainer ruled (item 6 (b)).

**Never:** Touch `conformance/expectations/**`, `decisions/**`, or any runtime file beyond `ReflectionNamedType.ts`, `reflectionTypes.ts` (its builder), the runtime reflection docs and its XT test. No change to `registerContractToken`'s first-one-wins rule (ESC-13.1-7). No new DIV clause. Do not change the array form `[Class, 'method']` (Laravel's own rules, which accept a non-static method).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Own token (L1) | `I1 = contract("Q\\I")`, `I2 = contract("Q\\I", {}, [P2])`, param `inject({ x: I2 })` | `isParameterSubclassOf(p, P2)` is `true`; same for a param typed `I1` against `P2` is `false` | none |
| Named type value | `getType()` of a param typed class `A`, token `IA`, `String`, `primitive`, `self` | `getClassOrToken()` gives `A`, `IA`, `null`, `null`, `null`; union/intersection members carry theirs | none |
| Static string | `'NS\\Derived::make'` (static) / `'NS\\Listener::handle'` (instance) | `true` / `false` | none |
| Magic static | `'NS\\Magic::anything'` (no such method, has `__callStatic`) | `true` | none |
| Bare unregistered class (L4) | `isCallable(Unregistered)` | `true` (a plain function to the Registry) | never throws |
| Unregistered param type (L5) | param `inject({ x: Unregistered })` | `getParameterClassName`, `getParameterClassNames`, `isParameterSubclassOf` throw the runtime's `TypeError` from `fqcn()` | thrown, pinned |

</intent-contract>

## Code Map

- `packages/reflection/src/Reflector.ts:251-256` -- `isParameterSubclassOf` reads `getParameterClassName(parameter)` (a string) and calls `new ReflectionClass(name)`, which resolves the first token recorded under the name.
- `packages/runtime/src/php/ReflectionParameter.ts:12` -- the parameter's Spec (the class or token `inject` declared) is the private field `#spec`. It has no public accessor, and the runtime's package entries export neither `typeOfSpec` nor `parametersOf`.
- `packages/runtime/src/php/reflectionTypes.ts:30-31` -- `namedType` builds `new ReflectionNamedType(fqcn(spec), false)`, so the type keeps only the name, not the class or token.
- `packages/runtime/src/php/ReflectionNamedType.ts:7-26` -- holds only `#name` and `#builtin`.
- `packages/runtime/src/registry/registry.ts:222-241` -- `registerContractToken` keeps the first token under a name (ESC-13.1-7), with no test-frame overlay. Read-only.
- `packages/runtime/src/php/ReflectionEnum.ts` -- builds builtin `ReflectionNamedType("string"|"int", true)`; must keep working with the third constructor argument defaulting to `null`.
- `packages/runtime/src/php/reflectionTargets.ts:82-110` -- `findMethod`: prototype chain (below `Object.prototype`, never `constructor`) first, then the static chain. Not exported; `Reflector` needs its own "is it on the prototype chain" walk to tell a static method.
- `packages/runtime/tests/xaravel/reflection.test.ts` -- XT-runtime-44..47, with a `token(name, parents)` stand-in and `named(type)` helper; the next free id is XT-runtime-50 (48, 49 are in other files).
- `packages/runtime/docs/reflection.md:18-32` -- the Types table; add the `getClassOrToken()` column/sentence.
- `packages/reflection/src/Reflector.ts:286-315` -- `isCallableValue`: a `'Class::method'` string delegates to the array rules, which accept an instance method.
- `packages/reflection/tests/xaravel/reflection.test.ts:325` -- XT-reflection-1's `Assert.assertTrue(Reflector.isCallable(`${NS}\\Listener::handle`))`, re-pinned to `assertFalse`. `Unregistered` (line ~117) and `contract` imports are already there. XT-reflection-4 checks the docs list every `Reflector.` static and the Divergences section; the api-surface gate must stay at 0 unexplained (add no public `Reflector` member).
- `packages/reflection/docs/reflection.md` -- the `isCallable` bullets and the `isParameterSubclassOf` bullet.
- PHP 8.5.11 probe: `is_callable("A::h")` false for public non-static `h` even with `__callStatic`; `"A::s"` true for static; `"A::x"` true via `__callStatic`.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/ReflectionNamedType.ts` -- add `readonly #value: object | null` (third constructor parameter, default `null`) and `getClassOrToken(): object | null`, documented as a Xaravel addition (DIV-3.2) -- carries the Spec value.
- `packages/runtime/src/php/reflectionTypes.ts` -- pass `spec as object` as the value for a class or token; builtins and markers keep `null`.
- `packages/runtime/tests/xaravel/reflection.test.ts` -- new `xaravelTest("XT-runtime-50", …)`: values for a class, a token, builtins, `primitive`, markers, union and intersection members, a variadic's element, a return type, `ReflectionEnum`'s backing type; two stand-in tokens under one FQCN each come back as themselves.
- `packages/runtime/docs/reflection.md` -- document `getClassOrToken()`.
- `packages/reflection/src/Reflector.ts` -- `isParameterSubclassOf` reflects the named type's own value when it has one; `isCallableValue`'s string path requires a found method to be static, else `__callStatic`.
- `packages/reflection/tests/xaravel/reflection.test.ts` -- re-pin `Listener::handle` to false (comment citing item 6 (b)); new `xaravelTest("XT-reflection-5", …)` covering L1 (two `contract()` tokens under one FQCN), L4 and L5 rows of the matrix, and a static-string row; update the header comment and XT-reflection-1's consequence text only if it states the string rule.
- `packages/reflection/docs/reflection.md` -- say: a `'Class::method'` string needs a static method or `__callStatic` (PHP 8); an unregistered class on its own is a plain function, so callable; a parameter typed with an unregistered class throws `TypeError`; `isParameterSubclassOf` reads the parameter's own class or token.

**Acceptance Criteria:**
- Given the matrix rows, when XT-runtime-50 and XT-reflection-5 run, then each row holds.
- Given the change, when `bun run harness`, `bun run typecheck` and `bun run lint` run, then there are no differences and no errors.
- Given the item, when `bun run fidelity:review status --item epic-13-retro-item-5-reflector-own-type --spec <this spec>` runs, then it prints `current`.

## Spec Change Log

## Review Triage Log

### 2026-10-25 — Review pass
- verdicts: 21 findings — high 0, medium 2, low 13, false 6, maybe-false 0
- findings:
  - `[low]` `[patch]` (verification-gap) An inherited static method named by string is untested; collapsing `hasStaticMethod`'s walk to an own-member check passes every test — added a registered subclass of `Derived` with `'<Sub>::make'` true to XT-reflection-5.
  - `[false]` `[reject]` (intent) L1's existence gate still checks the name, not the own value — the gate is Upstream's `class_exists || interface_exists` line kept on purpose; with tokens under one FQCN the name always resolves (first one recorded), so no input makes the gate and the own value disagree; the comparison, which L1 is about, uses the own value.
  - `[false]` `[reject]` (intent) The value reaches return types and composite members, wider than "the parameter's Spec value" — the ruling allows `ReflectionNamedType` to carry it, and every named type comes from the one shared builder; a parameter-only flag would add a branch with no use.
  - `[false]` `[reject]` (intent) The static-string guard applies only when `classExists` — when it is false the array rules give `false` as well (`classExists(klass)` is their first test), so no unregistered class becomes callable.
  - `[low]` `[reject]` (intent) The spec's Auto Run Result said `done` while its frontmatter said `in-review` — this is the spec's own bookkeeping, which Finalize rewrites; a fix that edits the spec is rejected.
  - `[low]` `[patch]` (edge-case) A class with both an instance and a static `go` (own or inherited) gives `true` for `'C::go'` though `ReflectionMethod` finds the instance one — the helper now mirrors `findMethod`'s first loop (prototype chain below `Object.prototype`) and returns false when the method found is there; XT-reflection-5 pins the shape.
  - `[low]` `[patch]` (edge-case) The spec's "found method is static" claim is not met under shadowing — same root cause and fix as the row above.
  - `[false]` `[reject]` (blind) DIV-9.14's text contradicts the static rule — DIV-9.14 lists only the edges that differ from PHP, and the Maintainer ruled the static rule "matches PHP 8" with no DIV change (`MAINT-2026-10-25-epic-13-items.md`, item 6 (b)).
  - `[low]` `[patch]` (blind) `getClassOrToken()` cites DIV-3.2, which names no such member — the ruling (`MAINT-2026-10-25-epic-13-items.md`, item 5) is now cited beside DIV-3.2 in the source, both docs and the consequence strings.
  - `[low]` `[reject]` (blind) "PHP 7.4's `is_callable`" labels conflict with the PHP 8 rule — Upstream's own docblock gives the PHP 7.4 label for the array rules, and the string rule is documented separately; a relabel adds nothing a reader needs.
  - `[medium]` `[patch]` (blind) XT-runtime-50 says two tokens are "recorded" but never records them — both stand-ins are now recorded with `registerContractToken` before they are reflected, so first-one-wins holds in the test.
  - `[medium]` `[defer]` (blind) `hasStaticMethod` copies the runtime's private `findMethod` walk — real duplication (epic 4 lesson), but `findMethod` is outside the runtime scope the Maintainer allowed (only `ReflectionNamedType` and its builder); deferred.
  - `[low]` `[patch]` (blind) Untested string edges: inherited static and `syntaxOnly` with an instance method — both added to XT-reflection-5.
  - `[low]` `[reject]` (blind) Untested string edges: a token FQCN and a leading `\` — a token FQCN gives `false` through the unchanged array rules, and `resolveClass` drops a leading `\` (Story 9.13); both are rare, and pinning them adds tests with no behaviour change.
  - `[low]` `[reject]` (blind) No positive `parent` case for `isParameterSubclassOf` — `parent` and `self` share one fallback expression (`paramClassOrToken ?? paramClassName`), which the `self` case covers.
  - `[low]` `[reject]` (blind) `isParameterSubclassOf` mixes value and name and calls `getType()` twice — Upstream's three-step line structure is kept on purpose (spec Always); the second call is cheap and pure.
  - `[false]` `[reject]` (blind) The Fidelity verdicts' timestamps are after the spec date, and their tree does not match the uncommitted tree — the time is UTC (03:04Z is 20:04 PDT on 2026-10-25), and the tool hashes the working tree, not a commit; `status` checks it against the current tree.
  - `[low]` `[reject]` (blind) The spec's status fields and empty logs disagree — spec bookkeeping, rewritten in Finalize; a fix that edits the spec is rejected.
  - `[false]` `[reject]` (blind) Verification left out the reflection Ported Tests — the full `bun run harness` ran them (`differ=0`); the six plain `bun test` failures are the `blocked-by` lines the Expectations already record.
  - `[low]` `[reject]` (blind) The docs' `TypeError` bullet is out of place, and a union with an unregistered member is not pinned — cosmetic; the runtime docs already say any type read throws for an unregistered class.
  - `[low]` `[reject]` (blind) The runtime docs table does not mention variadic elements and return types — the paragraph under the table says every named type carries the value; cosmetic.

### 2026-10-25 — Review pass (Finalize re-check)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings:
  - The patches changed the reviewed tree, so the Fidelity Review ran again: both reviewers `pass` at tree `97ccf464625fc177281641be7c4b0372f6d1e185`, and `status --item` prints `current`.

## Design Notes

L4 is pinned as it behaves: a JS class the Registry cannot name is indistinguishable from a plain function without a source-text heuristic, and AD-10 registers every framework class. L5 stays a throw (`fqcn()` in the type builder); Epic 17's Container maps it.

## Verification

**Commands:**
- `bun test packages/reflection packages/runtime` -- expected: pass
- `bun run typecheck` and `bun run lint` -- expected: clean
- `bun run harness` -- expected: `SUMMARY` with no differences
- `bun run fidelity:review status --item epic-13-retro-item-5-reflector-own-type --spec _bmad-output/implementation-artifacts/spec-retro-13-reflector-own-type.md` -- expected: `current`

## Auto Run Result

Status: done (resumed 2026-10-25 under the Maintainer's scope amendment; the first run's blocked record follows as history)

- `ReflectionNamedType` carries the Spec's class or token (`getClassOrToken()`, third constructor argument defaulting to `null`); `reflectionTypes.ts` passes it for a class or token. XT-runtime-50 and `packages/runtime/docs/reflection.md` cover it.
- `Reflector.isParameterSubclassOf` reflects that value when present, else the resolved name. A `'Class::method'` string whose class has the method gives `false` when the method `ReflectionMethod` finds is on the prototype chain (`hasInstanceMethod`, so an instance method also shadows a static one of the same name); otherwise it falls back to the array rules (a static method, inherited or own, or `__callStatic`). The array form is unchanged.
- XT-reflection-1's `Listener::handle` string pin is re-pinned to `false` (item 6 (b)); XT-reflection-5 covers L1, L4, L5 and the static-string rows (inherited static, shadowing, `syntaxOnly`); `packages/reflection/docs/reflection.md` says each. Both XT cases fail on the baseline Reflector.
- Files: `packages/runtime/src/php/ReflectionNamedType.ts` (the value and its accessor), `packages/runtime/src/php/reflectionTypes.ts` (passes it), `packages/runtime/tests/xaravel/reflection.test.ts` (XT-runtime-50), `packages/runtime/docs/reflection.md`, `packages/reflection/src/Reflector.ts` (L1 and the static-string rule), `packages/reflection/tests/xaravel/reflection.test.ts` (XT-reflection-1 re-pin, XT-reflection-5), `packages/reflection/docs/reflection.md`.
- Review: 21 findings in the first pass. Patched: 6 rows in 4 entries (1 medium: XT-runtime-50 never recorded its tokens; 3 low: shadowed static, untested string edges, the DIV-3.2 citation). Deferred: 1 medium (the copied `findMethod` walk). Rejected: 14, each with its reason in the Review Triage Log. Second pass (the Fidelity Review re-run on the patched tree): 0 findings.
- Follow-up review recommended: false. This first pass patched one medium entry and no high one.
- Verified on the patched tree: `bun run typecheck` and `bun run lint` are clean; `bun run harness` gives `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0` (Xaravel Tests 393 passed, 0 failed, 5 skipped); `fidelity:review status --item` prints `current` (two pass verdicts, tree `97ccf464`, reviewers codex/gpt-6.1-sol and claude/claude-opus-5-5).
- Residual risks: L4 and L5 are pinned, not changed. Callers that named an instance method by `'Class::method'` string now get `false`; no test besides the re-pinned one relied on that. The deferred walk duplication is still open.

Previous status: blocked
Blocking condition: scope. L1 cannot be fixed within `packages/reflection`. A `ReflectionParameter` gives `packages/reflection` only its name, its `getType()` (a `ReflectionNamedType` that carries only an FQCN string) and its declaring class. The class or token the parameter's Spec holds sits in the runtime's private `#spec` and is not reachable from outside `packages/runtime`. Reflecting "the parameter's own type value" therefore needs a `packages/runtime` change, for example a `ReflectionNamedType` that keeps the class or token it was built from, or a test-frame overlay for `registerContractToken`. The item's `action` names only `packages/reflection`. Under the 2026-10-22 amendment a fix that needs another component waits on the Maintainer, and the orchestrator may not widen the `action`. The other parts (L4 and L5 pins, docs, the item 6 (b) re-pin) fit the scope. They are not done separately: the item's Fidelity Review reads the whole `action`, so a partial change would be rejected for missing L1.

Decision needed: add `packages/runtime` to the item's `action` (naming the mechanism), or rule L1 out of the item and leave the rest to the orchestrator.

Unblocked (2026-10-25): the Maintainer's amendment in `decisions/MAINT-2026-10-25-epic-13-items.md` ("Amendment: item 5's scope") adds `packages/runtime` to the item's `action`, limited to letting `ReflectionNamedType` and the parameter reflection that builds it carry the Spec's class or token beside its FQCN name, with an XT-runtime case. The spec returns to `draft` for re-planning under the wider scope.

## Fidelity Review

### Reviewer 1: pass at tree 4622ee99d2e458d2d7da085b60a89b03b0cc3b27

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4cdb11c1533f379b8cea6cb1dcb04c40fb6942aa`, on 2026-10-26T03:04:16.847Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The diff adds or changes no Ported Tests; the action item assigns none. |
| F-2: No expected value is weakened | pass | Existing assertions retain their strength. XT-reflection-1's true-to-false callable expectation is explicitly authorized by the Maintainer's item 6(b) ruling and remains an exact boolean check. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed, and the diff removes no Xaravel Test assertion. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The diff introduces or changes no adapted assertion marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied upon by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared the supplied Xaravel Test bodies with their consequence strings. The added cases check token identity, duplicate-name ancestry, relative hints, static callable strings, unregistered classes, and builtin null values as declared; retained tests check their stated consequences. |
| F-8: No stub, fake or partial implementation of another Component | pass | Production changes stay within reflection and the expressly authorized runtime scope. Runtime preserves Spec values; reflection consumes them. No other Component's implementation is introduced. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared all changed source declarations and bodies with AD-6 and DIV-1. They remain synchronous, perform no IO, and introduce no async callback seam; no asyncRoot tag is required or retained. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"4622ee99d2e458d2d7da085b60a89b03b0cc3b27","base":"4cdb11c1533f379b8cea6cb1dcb04c40fb6942aa","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T03:04:16.847Z","items":[{"id":"F-1","result":"n/a","note":"The diff adds or changes no Ported Tests; the action item assigns none.","findings":[]},{"id":"F-2","result":"pass","note":"Existing assertions retain their strength. XT-reflection-1's true-to-false callable expectation is explicitly authorized by the Maintainer's item 6(b) ruling and remains an exact boolean check.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed, and the diff removes no Xaravel Test assertion.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The diff introduces or changes no adapted assertion marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied upon by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared the supplied Xaravel Test bodies with their consequence strings. The added cases check token identity, duplicate-name ancestry, relative hints, static callable strings, unregistered classes, and builtin null values as declared; retained tests check their stated consequences.","findings":[]},{"id":"F-8","result":"pass","note":"Production changes stay within reflection and the expressly authorized runtime scope. Runtime preserves Spec values; reflection consumes them. No other Component's implementation is introduced.","findings":[]},{"id":"F-9","result":"pass","note":"Compared all changed source declarations and bodies with AD-6 and DIV-1. They remain synchronous, perform no IO, and introduce no async callback seam; no asyncRoot tag is required or retained.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 4622ee99d2e458d2d7da085b60a89b03b0cc3b27

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `4cdb11c1533f379b8cea6cb1dcb04c40fb6942aa`, on 2026-10-26T03:04:16.847Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test changed; only Xaravel Tests touched. |
| F-2: No expected value is weakened | pass | XT-reflection-1's pin true->false for Listener::handle is authorised by MAINT-2026-10-25-epic-13-items item 6(b) (re-pin to PHP 8 behaviour). No other expectation weakened. |
| F-3: No assertion is removed without a DIV clause | pass | No assertion removed from any test; XT-reflection-1 and runtime tests keep all assertions, only one flipped under the ruling. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations lines set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted markers added. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixtures relied on. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-reflection-5 body checks each claim in its string: two tokens under one FQCN, static/instance/__callStatic/missing strings, unregistered isCallable, TypeError on three reads. XT-runtime-50 checks union/intersection/variadic/return/enum/builtins/two tokens. Cites no FR/AD bullet tokens. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes confined to reflection and runtime, the two components listed in the action item (Maintainer-approved scope); no stubs of other Components. |
| F-9: Every `@asyncRoot` tag is true | pass | No @​asyncRoot tags in changed files; all new methods are sync with no IO or async callbacks. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request files changed. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"4622ee99d2e458d2d7da085b60a89b03b0cc3b27","base":"4cdb11c1533f379b8cea6cb1dcb04c40fb6942aa","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T03:04:16.847Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test changed; only Xaravel Tests touched.","findings":[]},{"id":"F-2","result":"pass","note":"XT-reflection-1's pin true->false for Listener::handle is authorised by MAINT-2026-10-25-epic-13-items item 6(b) (re-pin to PHP 8 behaviour). No other expectation weakened.","findings":[]},{"id":"F-3","result":"pass","note":"No assertion removed from any test; XT-reflection-1 and runtime tests keep all assertions, only one flipped under the ruling.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations lines set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted markers added.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixtures relied on.","findings":[]},{"id":"F-7","result":"pass","note":"XT-reflection-5 body checks each claim in its string: two tokens under one FQCN, static/instance/__callStatic/missing strings, unregistered isCallable, TypeError on three reads. XT-runtime-50 checks union/intersection/variadic/return/enum/builtins/two tokens. Cites no FR/AD bullet tokens.","findings":[]},{"id":"F-8","result":"pass","note":"Changes confined to reflection and runtime, the two components listed in the action item (Maintainer-approved scope); no stubs of other Components.","findings":[]},{"id":"F-9","result":"pass","note":"No @asyncRoot tags in changed files; all new methods are sync with no IO or async callbacks.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request files changed.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 97ccf464625fc177281641be7c4b0372f6d1e185

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4cdb11c1533f379b8cea6cb1dcb04c40fb6942aa`, on 2026-10-26T03:14:50.168Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The diff adds or changes no Ported Test; the action item assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Existing assertions remain exact. XT-reflection-1 changes true to false precisely as the supplied Maintainer ruling for item 6(b) authorizes; no comparison or exception expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed, so there are no Upstream assertions requiring an assertion-count comparison or dropping clause. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip and introduces no Skip Reason. |
| F-5: Every `adapted` marker matches its clause | n/a | The diff introduces no assertion adaptation marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | The supplied Xaravel Test bodies check their declared consequences. XT-reflection-5 checks token identity through subclass results, relative hints, callable strings and arrays, and unregistered-class behavior; XT-runtime-50 checks retained Spec values across named, compound, variadic, return and builtin types. No numbered FR or AD citation mismatches its tested bullet. |
| F-8: No stub, fake or partial implementation of another Component | pass | The changes stay within reflection and the explicitly authorized runtime extension. Runtime retains the Spec value and reflection consumes it; neither adds another Component's implementation to satisfy tests. |
| F-9: Every `@asyncRoot` tag is true | pass | The complete touched source files and declaration inventory contain no async roots or async callbacks requiring tags. The new getter, Spec construction and prototype inspection are synchronous under AD-6 and DIV-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change modifies no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"97ccf464625fc177281641be7c4b0372f6d1e185","base":"4cdb11c1533f379b8cea6cb1dcb04c40fb6942aa","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T03:14:50.168Z","items":[{"id":"F-1","result":"n/a","note":"The diff adds or changes no Ported Test; the action item assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Existing assertions remain exact. XT-reflection-1 changes true to false precisely as the supplied Maintainer ruling for item 6(b) authorizes; no comparison or exception expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed, so there are no Upstream assertions requiring an assertion-count comparison or dropping clause.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip and introduces no Skip Reason.","findings":[]},{"id":"F-5","result":"n/a","note":"The diff introduces no assertion adaptation marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"The supplied Xaravel Test bodies check their declared consequences. XT-reflection-5 checks token identity through subclass results, relative hints, callable strings and arrays, and unregistered-class behavior; XT-runtime-50 checks retained Spec values across named, compound, variadic, return and builtin types. No numbered FR or AD citation mismatches its tested bullet.","findings":[]},{"id":"F-8","result":"pass","note":"The changes stay within reflection and the explicitly authorized runtime extension. Runtime retains the Spec value and reflection consumes it; neither adds another Component's implementation to satisfy tests.","findings":[]},{"id":"F-9","result":"pass","note":"The complete touched source files and declaration inventory contain no async roots or async callbacks requiring tags. The new getter, Spec construction and prototype inspection are synchronous under AD-6 and DIV-1.","findings":[]},{"id":"F-10","result":"n/a","note":"The change modifies no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 97ccf464625fc177281641be7c4b0372f6d1e185

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `4cdb11c1533f379b8cea6cb1dcb04c40fb6942aa`, on 2026-10-26T03:14:50.168Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test (only Xaravel Tests in packages/reflection/tests/xaravel and packages/runtime/tests/xaravel), so there is no Upstream source to match. |
| F-2: No expected value is weakened | pass | No Ported Test changed. The only changed expected value in an existing Xaravel Test is XT-reflection-1's isCallable('${NS}\Listener::handle'), changed from assertTrue to assertFalse. decisions/MAINT-2026-10-25-epic-13-items.md item 6 (b) orders exactly that re-pin, because PHP 8's is_callable gives false for an instance method named statically. It is still an exact boolean check, so nothing is loosened. No other assertion of XT-reflection-1..4 or XT-runtime-44..47 changed. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there is no assertion count to compare with Upstream. The touched Xaravel Tests lose no assertion: XT-reflection-1 keeps every line, one of them re-pinned, and only new assertions are added elsewhere. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change touches no Expectations shard and sets no line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The diff adds no '// adapted:DIV-<n>.<k>' marker and no Expectations 'adapted' field. The DIV-3.2 and DIV-9.14 citations are in docblocks and consequence strings, not adaptation markers. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows no assigned Oracle fixture and no changed fixture that is an error, and the item relies on no Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-reflection-5's body checks every clause of its consequence string. L1: two contract() tokens under one FQCN, the second answering with its parent and the first not, while the lookup by name gives the first. The self hint reflects its resolved class (SelfTyped is a subclass of Base, not of itself). 'Class::method' strings: own static, inherited static (DerivedChild::make), instance method false, shadowed static false (Shadowing, ShadowingChild), syntaxOnly true, __call false, __callStatic and magic fallback true, missing false, and the array form still accepts an instance method. L4: an unregistered class is callable with and without syntaxOnly. L5: all three readers throw TypeError with fqcn()'s message prefix. XT-runtime-50 checks getClassOrToken for a class, a token, union, intersection and DNF members, a variadic element and return types; null for String, Number, Boolean, primitive, self, parent and static and for ReflectionEnum's backing type; two registerContractToken tokens under one FQCN; and the constructor default. Neither test cites an FR-<n>.<k> or AD-<n>.<k> token. XT-reflection-1's consequence string is unchanged and still holds after the re-pin. |
| F-8: No stub, fake or partial implementation of another Component | pass | Code changes are in packages/reflection (Reflector.ts, docs, Xaravel test) and packages/runtime (ReflectionNamedType.ts and reflectionTypes.ts, docs, Xaravel test). Both components are listed for the item. The runtime change is limited to ReflectionNamedType and the reflection that builds it carrying the Spec's class or token, as the scope amendment of MAINT-2026-10-25-epic-13-items allows. No stub, fake or hard-coded return of another component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tag in Reflector.ts, ReflectionNamedType.ts or reflectionTypes.ts. Every new or changed member (getClassOrToken, the value constructor parameter, hasInstanceMethod, isCallableValue, isParameterSubclassOf) is synchronous, does no IO and takes no callback, so no tag is missing. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"97ccf464625fc177281641be7c4b0372f6d1e185","base":"4cdb11c1533f379b8cea6cb1dcb04c40fb6942aa","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T03:14:50.168Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test (only Xaravel Tests in packages/reflection/tests/xaravel and packages/runtime/tests/xaravel), so there is no Upstream source to match.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changed. The only changed expected value in an existing Xaravel Test is XT-reflection-1's isCallable(`${NS}\\Listener::handle`), changed from assertTrue to assertFalse. decisions/MAINT-2026-10-25-epic-13-items.md item 6 (b) orders exactly that re-pin, because PHP 8's is_callable gives false for an instance method named statically. It is still an exact boolean check, so nothing is loosened. No other assertion of XT-reflection-1..4 or XT-runtime-44..47 changed.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there is no assertion count to compare with Upstream. The touched Xaravel Tests lose no assertion: XT-reflection-1 keeps every line, one of them re-pinned, and only new assertions are added elsewhere.","findings":[]},{"id":"F-4","result":"n/a","note":"The change touches no Expectations shard and sets no line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The diff adds no `// adapted:DIV-<n>.<k>` marker and no Expectations `adapted` field. The DIV-3.2 and DIV-9.14 citations are in docblocks and consequence strings, not adaptation markers.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows no assigned Oracle fixture and no changed fixture that is an error, and the item relies on no Oracle fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-reflection-5's body checks every clause of its consequence string. L1: two contract() tokens under one FQCN, the second answering with its parent and the first not, while the lookup by name gives the first. The self hint reflects its resolved class (SelfTyped is a subclass of Base, not of itself). 'Class::method' strings: own static, inherited static (DerivedChild::make), instance method false, shadowed static false (Shadowing, ShadowingChild), syntaxOnly true, __call false, __callStatic and magic fallback true, missing false, and the array form still accepts an instance method. L4: an unregistered class is callable with and without syntaxOnly. L5: all three readers throw TypeError with fqcn()'s message prefix. XT-runtime-50 checks getClassOrToken for a class, a token, union, intersection and DNF members, a variadic element and return types; null for String, Number, Boolean, primitive, self, parent and static and for ReflectionEnum's backing type; two registerContractToken tokens under one FQCN; and the constructor default. Neither test cites an FR-<n>.<k> or AD-<n>.<k> token. XT-reflection-1's consequence string is unchanged and still holds after the re-pin.","findings":[]},{"id":"F-8","result":"pass","note":"Code changes are in packages/reflection (Reflector.ts, docs, Xaravel test) and packages/runtime (ReflectionNamedType.ts and reflectionTypes.ts, docs, Xaravel test). Both components are listed for the item. The runtime change is limited to ReflectionNamedType and the reflection that builds it carrying the Spec's class or token, as the scope amendment of MAINT-2026-10-25-epic-13-items allows. No stub, fake or hard-coded return of another component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tag in Reflector.ts, ReflectionNamedType.ts or reflectionTypes.ts. Every new or changed member (getClassOrToken, the value constructor parameter, hasInstanceMethod, isCallableValue, isParameterSubclassOf) is synchronous, does no IO and takes no callback, so no tag is missing.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```
