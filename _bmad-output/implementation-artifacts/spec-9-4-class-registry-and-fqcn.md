---
title: 'Story 9.4: Class Registry and `fqcn()`'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_revision: '8caf2f4dcffe49635e87278cbba45582fce51c0b'
review_loop_iteration: 1
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.4.md'
  - '{project-root}/decisions/ESC-9.1-2.md'
  - '{project-root}/decisions/MAINT-2026-10-19-epic-6-items.md'
  - '{project-root}/decisions/ESC-9.4-1.md'
warnings: [oversized]
deferred:
  - summary: >-
      jsonEncode's error paths (lone surrogate, depth over 512, sparse array) have no test.
    evidence: |-
      Verification-gap review: grepping the tests for "Malformed UTF-8", "Maximum stack depth" and "sparse array" finds nothing. Story 9.8 (jsonEncode / jsonDecode with PHP flag semantics) owns the full encoder and its Oracle Differential tests (ESC-9.4-1 part 2).
    location: >-
      packages/runtime/src/php/jsonEncode.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 9.1 landed only the Registry core (`registerClass`, `fqcn`; ESC-9.1-2). Nothing resolves an FQCN string to a class, test fixtures cannot register their Upstream FQCNs without colliding across tests, app classes cannot load from the PSR-4 map, the grader cannot print PHP class names, and `registration:check` lets a file register a class it imports (Epic 6 retro R3).

**Approach:** Build the rest of AD-10 on the core in `packages/runtime/src/registry/`, exported as `@xaravel/runtime/registry` (ESC-9.1-1): `resolveClass`, `registerTestClass` in the test frame's overlay, the class-name brand, PSR-4 autoload with an async miss path, and `writeClassmap` / `loadClassmap`. Re-check the registration scan (its same-file rule landed with ESC-9.4-1) against the first real registrations.

## Boundaries & Constraints

**Always:** edit only `packages/runtime/**` (the same-file scan rule and its tests already landed with `decisions/ESC-9.4-1.md` part 3, so `tools/registration/**` and `conformance/tests/xaravel/registration.test.ts` are not edited), this spec, the Story's status lines and its Escalations. Keep every 9.1 behaviour and message of `registerClass` / `fqcn` (ESC-9.1-2: 9.4 removes nothing). Lower-cased FQCN keys, leading `\` dropped. Sync everywhere except the one async miss path (AD-6). `null`, never `undefined` (AD-9). Laravel-shaped messages: `Class "<FQCN>" not found` for a miss (PHP's `Error` text; the class is `Error` until Story 9.10 adds PHP's hierarchy, as `ScopeFrameException` was).

**Never:** `constructor.name` for identity (lint); `JSON.stringify` in `src/` (AD-23); a second `AsyncLocalStorage`; morph maps, config `$class` rehydration or boot-time discovery imports (Foundation, Config, Database Stories); editing `tools/lint-rules`, `tools/async-surface` or any other Protected Path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Resolve | `registerClass('App\\Models\\Post', Post)` | `resolveClass('App\\Models\\Post')` and `resolveClass('\\app\\models\\post')` → `Post`; `fqcn(Post)` and `fqcn(new Post())` → `'App\\Models\\Post'`; `Post[Symbol.for('xaravel.class.fqcn')]` is the FQCN, non-enumerable, own | No error expected |
| Miss | `resolveClass('App\\Missing')` | — | throws, message names `App\Missing` |
| Unregistered class | `fqcn(class {})` | — | throws (9.1 message kept) |
| Duplicate key | another class under `App\\Models\\Post` | — | throws (9.1 message) |
| Second FQCN | `Post` under `App\\Post2` | — | throws, names both FQCNs |
| Test class | inside a `test` frame (and from its child units), `registerTestClass('Tests\\Fixtures\\Foo', Foo)` | resolvable and `fqcn`-able in that test frame and its children; not in a sibling or later test frame, nor outside | outside any test frame → `ScopeFrameException`; a key the base already holds for another class → throws |
| PSR-4 miss | `package.json` `xaravel.autoload.psr-4` `{"App\\": "app/"}` loaded; `App\Models\Comment` unregistered | async resolve imports `app/Models/Comment.ts` and returns the class that file registered | no mapped prefix, no file, or a file that does not register the FQCN → rejects naming the class |
| Classmap | `writeClassmap(path)`, then `loadClassmap(path)` in a fresh map | same FQCN → file entries; a miss resolves through the classmap before PSR-4 | unreadable or malformed file → throws naming the path |
| Same-file rule | `registerClass('A\\B', X)` where `X` is imported, not declared in the file | `registration:check` reports it at the call | — |

</intent-contract>

## Code Map

- `packages/runtime/src/registry/registry.ts` -- the 9.1 core: `byKey` (lower-cased FQCN → `{fqcn, klass}`), `byClass` (WeakMap), `normalise`. Extend here; keep messages.
- `packages/runtime/src/registry/index.ts`, `packages/runtime/src/index.ts`, `packages/runtime/package.json` -- add new exports; add `"./registry": "./src/registry/index.ts"` (ESC-9.1-1; `conformance/tests/xaravel/scaffold.test.ts:225` already lists it).
- `packages/runtime/src/scope/scope.ts` -- `Store` (line ~74: `parent`, `type`, `frame.kind`, `statics`), `lookUp` (~311), `entriesOf` (~322), `writeOwner` (~333), `ownerOf` (~365). A test-frame write needs the nearest unit of kind `test` up the chain; add one internal (not re-exported) helper here for the registry.
- `packages/assert/src/declarations/portedTest.ts:121` -- the grader opens test frames as kind `"test"` through `Symbol.for('xaravel.scope.run')`.
- `packages/assert/src/Framework/TestCase.ts:37` (read-only) -- the grader reads `Symbol.for('xaravel.class.fqcn')` on a value, then its constructor (ESC-4.3-1 item 1).
- `tools/registration/registration.ts` (read-only) -- the scan, with the same-file rule (`sameFileMessage`) from ESC-9.4-1.
- `packages/runtime/tests/xaravel/overlays.test.ts` -- test style (`xaravelTest(id, consequence citing AD-n.k, body)`, `Assert.*`, `thrownBy`).
- `conformance/xaravel-consequences/runtime.jsonl` (read-only) -- AD-10.1..10.5 consequence ids.
- `packages/runtime/async-surface.json` -- regenerate with `bun run async-surface runtime`.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/registry/registry.ts` -- add `resolveClass(fqcn)`, the class-name brand in `registerClass`, `registerTestClass(fqcn, X)` (writes into the nearest `test` unit's overlay; reads in `resolveClass` / `fqcn` check the frame chain first), PSR-4 (`loadAutoload(packageJsonPath)`), the async miss path `resolveClassAsync(fqcn)` tagged `@asyncRoot Registry.resolveClassAsync` (ESC-9.4-1 part 1), and `writeClassmap` / `loadClassmap` -- AD-10.1..10.5.
- `packages/runtime/src/php/` -- the default-flags core of `jsonEncode` (ESC-9.4-1 part 2), exported from `./php`; `writeClassmap` encodes with it.
- `packages/runtime/src/scope/scope.ts` -- internal helper for the nearest `test` unit's statics map.
- `packages/runtime/src/registry/index.ts`, `src/index.ts`, `package.json` -- exports and the `./registry` subpath.
- `packages/runtime/tests/xaravel/registry.test.ts` -- new: XT-runtime-12..15, one per manifest row, covering every matrix row; XT-runtime-14 also covers the second-FQCN AC.
- `bun run registration:check` -- re-check the FQCN shape, duplicate-key and same-file rules and the recogniser against the real `packages/runtime` registrations (count printed); a mismatch raises an Escalation.
- `packages/runtime/async-surface.json` -- regenerate.

**Acceptance Criteria:** the six ACs of Story 9.4 in `_bmad-output/planning-artifacts/epics.md` (line 3045), verified by XT-runtime-12..15 (`stories/9.4.md`) and the registration scan's tests.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 43 findings — high 0, medium 10, low 26, false 6, maybe-false 1
- findings:
  - (blind-hunter)
  - `[low]` `[reject]` Test-class brand outlives its test unit — real, but only display: inside a later test it is redefined on re-registration, and the stale value is the fixture's own Upstream FQCN; removing it at unit end adds an end hook, and dropping it loses grader names for fixtures.
  - `[medium]` `[patch]` fqcn()/resolveClass() walk the frame chain and allocate on every call — fixed: a module flag skips the walk until the first registerTestClass.
  - `[low]` `[reject]` scan and locate rank `.ts`/`.js` twins differently — needs both files for one class in an app directory; fix adds ranking logic.
  - `[low]` `[reject]` scan follows symlink cycles — unlikely under app/ and database/; lstat would also drop legitimate linked directories.
  - `[low]` `[reject]` classmap lists module files that declare no class — a listed helper resolves to `Class "…" not found` as with no entry; telling them apart needs parsing or importing.
  - `[low]` `[reject]` PSR-4 lookup is case-sensitive — matches Composer's PSR-4 loader on both platforms; not a divergence.
  - `[false]` `[reject]` stale classmap entry does not fall back to PSR-4 / import errors propagate — Composer's `findFile` returns a classmap hit without falling back, and PHP surfaces include errors; faithful.
  - `[medium]` `[patch]` writeClassmap never prunes stale entries — fixed: carried-over entries whose file is gone are skipped.
  - `[low]` `[patch]` registerTestClass writes before it validates — fixed: checks run first, then write.
  - `[low]` `[reject]` registerClass ignores test overlays — needs a module loaded mid-test to base-register a fixture's key; fix adds branches to the 9.1 core.
  - `[low]` `[reject]` jsonEncode throws `Error`, not `JsonException` — PHP's exception hierarchy is Story 9.10, as for `Class not found`; documented in the file header.
  - `[low]` `[reject]` jsonEncode ignores array extra props/symbol keys and integer-like key order — classmap keys are FQCNs, never integer-like; full semantics are Story 9.8 (ESC-9.4-1 part 2).
  - `[medium]` `[patch]` untested branches (ended frame, overlapping prefixes, loadedFiles-only entries) — fixed: assertions added to XT-runtime-14/15; jsonEncode error paths deferred to 9.8 (see verification-gap row 5).
  - `[low]` `[patch]` XT-runtime-13 changes global state outside try/finally — fixed: wrapped.
  - (edge-case-hunter)
  - `[medium]` `[patch]` loadedFiles never cleared, stale entries written — same root as writeClassmap pruning; fixed there.
  - `[medium]` `[patch]` loaded classmap entries copied without existsSync — same root; fixed.
  - `[low]` `[reject]` `.js`/`.ts` twins pick different files — as blind-hunter row 3.
  - `[low]` `[reject]` case-colliding scanned files silently drop one — needs two files differing only in case; fix adds collision branches.
  - `[low]` `[reject]` symlink recursion — as blind-hunter row 4.
  - `[low]` `[reject]` case-variant import on APFS imports a file twice — same behaviour as PHP including a file under two cases on a case-insensitive FS (`cannot redeclare`), and the second registerClass throws loudly.
  - `[false]` `[reject]` import errors escape instead of `not found` — as blind-hunter row 7.
  - `[low]` `[patch]` non-object `xaravel`/`xaravel.autoload` silently clears the map — fixed: throws malformed naming the path.
  - `[low]` `[reject]` classmap names differing only in case overwrite — writeClassmap never writes them; needs a hand-edited file.
  - `[low]` `[reject]` brand left by tests / sibling races — as blind-hunter row 1.
  - `[false]` `[reject]` registerClass/registerTestClass do not validate FQCN shape — 9.1's registerClass behaviour must stay unchanged (ESC-9.1-2); a bad name throws loudly at writeClassmap.
  - `[low]` `[reject]` registerClass ignores test-registered classes — as blind-hunter row 10.
  - `[low]` `[patch]` rejected registerTestClass leaves empty maps — as blind-hunter row 9; fixed.
  - `[low]` `[reject]` integers beyond safe range reported as float — int64 and `bigint` arrive with Story 9.8; error is loud.
  - `[false]` `[reject]` claim: registerTestClass uses statics, not overlays — AD-10.5's "test frame's overlay" is satisfied: entries live in the test unit, are seen by its children only and are dropped at unit end (XT-runtime-14); per-Application keying has no meaning for a class name.
  - (verification-gap)
  - `[medium]` `[patch]` writeClassmap's loadedFiles merge untested — fixed: XT-runtime-15 asserts an entry present only through loadedFiles.
  - `[medium]` `[patch]` stale classmap entry → PSR-4 fallback untested — fixed: assertion added.
  - `[low]` `[patch]` longest-prefix and multi-directory PSR-4 untested — fixed: assertions added.
  - `[low]` `[patch]` registry-only import installing test-frame access untested — fixed: subprocess assertion added.
  - `[low]` `[patch]` ended-frame registerTestClass untested; jsonEncode error paths untested — ended frame fixed; jsonEncode error paths deferred to Story 9.8's Oracle Differential tests.
  - `[medium]` `[patch]` loadedFiles never cleared (other finding) — same root as writeClassmap pruning; fixed.
  - `[low]` `[reject]` stale brand on fixtures (other finding) — as blind-hunter row 1.
  - (intent-alignment)
  - `[false]` `[reject]` same-file row has no evidence in the diff — the rule and its tests landed with ESC-9.4-1; `bun run registration:check` was run (`ok (296 files, 1 registrations)`) and the implementer probed a same-file violation, which the scan reported.
  - `[maybe-false]` `[reject]` no test drives registerTestClass through `portedTest` — portedTest opens the same `test` frame kind the tests open directly; would only be low if real.
  - `[low]` `[reject]` round-trip classmap equality partly via loadedFiles — covered now by the loadedFiles-only assertion.
  - `[false]` `[reject]` async-surface.json hand-edited — `bun run async-surface --all --check` passes, so it matches the generator.
  - `[low]` `[reject]` defineProperty on a frozen class is a new failure path in registerClass — the spec's Design Notes require the brand there; frozen classes are not registered by framework files.
  - (fidelity-review)
  - `[medium]` `[patch]` F-7 (reviewer 1) XT-runtime-13 cites unknown consequence FR-22 — fixed: FR-22 token dropped; it cites AD-10.2 and AD-10.4.
  - `[medium]` `[patch]` F-7 (reviewer 2) same finding — same fix.

## Design Notes

- **Test overlay:** stored per test unit, keyed by lower-cased FQCN plus a class → FQCN map, so `fqcn(X)` for a test class answers inside the frame. Writes go to the nearest unit of kind `test` up the chain, wherever the call is made from, so a fixture registered from a nested unit stays for the test; it is discarded when the test unit ends (Story 9.3's `end`).
- **Brand:** `Object.defineProperty(X, Symbol.for('xaravel.class.fqcn'), { value: fqcn, enumerable: false, configurable: false })` on registration; a subclass inherits it for display only, and `fqcn()` still reads `byClass`, never the brand.
- **Escalation before build:** two of XT-runtime-15's parts conflict with binding ADs (see Auto Run Result); the plan holds once ESC-9.4-1 is ruled.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: 15 pass
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run async-surface --all --check` -- expected: clean
- `bun run story:check 9.4` -- expected: pass (with `GH_TOKEN`), after the Fidelity Review of the final tree

## Auto Run Result

Status: blocked (2026-10-21, at planning)
Blocking condition: intent gap. XT-runtime-15 (PSR-4 async miss and the classmap) conflicts with two binding ADs, so the Story stops before implementation. Raised `conformance/escalations/ESC-9.4-1.md` (contract, XT-runtime-14, XT-runtime-15):
1. AD-10.4 requires an async-path miss that `await import()`s the mapped file, but AD-6 allows an async public method only if it reaches a listed Driver root or takes an async callback, and "adding a root needs an Escalation". The method would have no true `@asyncRoot` tag, so F-9 rejects it.
2. `writeClassmap` must write `bootstrap/cache/classes.json`, but `JSON.stringify` is a lint error in `packages/runtime/src` (AD-23, `xaravel/no-framework-json-stringify`), and the only permitted encoder, `jsonEncode`, is Story 9.8.
3. Epic 6 retro item 9's Maintainer ruling approves 9.4's `tools/registration/` changes but does not name the scan's tests in `conformance/tests/xaravel/registration.test.ts`; on an Epic 9 Story, the orchestrator treats that path's `ownership` failure as blocking.
- No code was written; this spec is the full plan. On resume, set `status: ready-for-dev`, follow the ruling, and start at step 3.
- Ruled 2026-10-21 (`decisions/ESC-9.4-1.md`): options 1a and 2a; the same-file rule and its tests landed with the ruling, so the Story no longer edits `tools/registration/**` or its tests. Status set to `ready-for-dev`.
- Follow-up review recommended: false.

Status: done (2026-10-21, build)
- **Summary:** the rest of AD-10 on the 9.1 core: `resolveClass`, `registerTestClass` (in the nearest `test` unit, dropped at unit end), the class-name brand, PSR-4 autoload (`loadAutoload`) with the one async miss path `resolveClassAsync` (`@asyncRoot Registry.resolveClassAsync`, ESC-9.4-1 option 1a), and `writeClassmap` / `loadClassmap` on a default-flags `jsonEncode` core (ESC-9.4-1 option 2a). The registration scan's same-file rule was re-checked against the first real registrations: `ok (296 files, 1 registrations)`, and a probe same-file violation was reported at the call.
- **Files:**
  - `packages/runtime/src/registry/registry.ts` — resolve, test classes, brand, PSR-4, async miss path, classmap.
  - `packages/runtime/src/registry/index.ts` — new exports; imports the scope module so test-frame access is installed.
  - `packages/runtime/src/scope/scope.ts` — internal test-unit access installed into the Registry (avoids an import cycle).
  - `packages/runtime/src/php/jsonEncode.ts`, `src/php/index.ts` — the default-flags `jsonEncode` core.
  - `packages/runtime/src/index.ts`, `package.json` — root re-exports and the `./registry`, `./php` subpaths.
  - `packages/runtime/async-surface.json` — the `resolveClassAsync` root line.
  - `packages/runtime/tests/xaravel/registry.test.ts` — XT-runtime-12..15.
- **Review:** 43 findings; 19 rows patched (10 medium, 9 low, in 13 fixes), 1 item deferred (jsonEncode error-path tests, to Story 9.8), 23 rejected with the reasons in the triage log. The Fidelity Review rejected the first tree on F-7 (an `FR-22` citation with no consequence line) and passed the patched tree `b16cf0387e03faaf4bc3f88b003e62050f807e65` with both reviewers.
- **Follow-up review recommended: true.** The first pass patched 10 medium rows. The unverified risk: the patches (writeClassmap's stale-entry skip, the `anyTestClass` fast path, the reordered `registerTestClass` checks, `loadAutoload`'s new malformed cases) were re-reviewed only by the Fidelity Review, not by the blind, edge-case and verification-gap layers.
- **Verification:** `bun run harness --xaravel` 305/305 pass (XT-runtime-* 15/15); `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run async-surface --all --check` clean; `bun run fidelity:review status` prints `current: 2 pass verdicts`. `bun run story:check 9.4` needs `GH_TOKEN` for the full-run check and was not run here.
- **Residual risks:** a test-class brand stays on the fixture class after its test (display only; rejected low). The PSR-4 map, the classmap and base registrations are process-wide, so XT-runtime-15's FQCNs must not be reused by other test files in the same process.

## Fidelity Review

### Reviewer 1: reject at tree ecbc244259a4aafb249375a9a8f05bb0ac361101

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `8caf2f4dcffe49635e87278cbba45582fce51c0b`, on 2026-10-21T22:27:46.796Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff adds only Xaravel Tests. |
| F-2: No expected value is weakened | pass | The new Xaravel Tests use explicit expected values; no existing assertion or Upstream expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed, so there are no Upstream assertions to count or omissions to justify. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle fixture with an error output. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The four test bodies check their declared registry behavior, but XT-runtime-13 cites FR-22, whose consequence evidence is explicitly unavailable. |
| F-8: No stub, fake or partial implementation of another Component | pass | All implementation changes remain within runtime. ESC-9.1-2 and ESC-9.4-1 explicitly authorize the registry and jsonEncode cores within this Component. |
| F-9: Every `@asyncRoot` tag is true | pass | resolveClassAsync performs await import() and carries the root explicitly approved by ESC-9.4-1. The declaration evidence shows no other public async implementation needing a tag; the Scope Frame runners retain dual-helper signatures. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/registry.test.ts`: XT-runtime-13 cites unknown consequence FR-22. Replace it with the applicable registered consequence bullet or supply its authoritative text and demonstrate that the test verifies it.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"ecbc244259a4aafb249375a9a8f05bb0ac361101","base":"8caf2f4dcffe49635e87278cbba45582fce51c0b","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-21T22:27:46.796Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff adds only Xaravel Tests.","findings":[]},{"id":"F-2","result":"pass","note":"The new Xaravel Tests use explicit expected values; no existing assertion or Upstream expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed, so there are no Upstream assertions to count or omissions to justify.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle fixture with an error output.","findings":[]},{"id":"F-7","result":"fail","note":"The four test bodies check their declared registry behavior, but XT-runtime-13 cites FR-22, whose consequence evidence is explicitly unavailable.","findings":[{"path":"packages/runtime/tests/xaravel/registry.test.ts","detail":"XT-runtime-13 cites unknown consequence FR-22. Replace it with the applicable registered consequence bullet or supply its authoritative text and demonstrate that the test verifies it."}]},{"id":"F-8","result":"pass","note":"All implementation changes remain within runtime. ESC-9.1-2 and ESC-9.4-1 explicitly authorize the registry and jsonEncode cores within this Component.","findings":[]},{"id":"F-9","result":"pass","note":"resolveClassAsync performs await import() and carries the root explicitly approved by ESC-9.4-1. The declaration evidence shows no other public async implementation needing a tag; the Scope Frame runners retain dual-helper signatures.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree ecbc244259a4aafb249375a9a8f05bb0ac361101

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `8caf2f4dcffe49635e87278cbba45582fce51c0b`, on 2026-10-21T22:27:46.796Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids list is empty and the diff adds or changes no Ported Test. There are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | There is no Ported Test, so there is no Upstream expected value to weaken. The four new tests are Xaravel Tests (XT-runtime-12 to 15) with no Upstream source. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, and the diff has no adapted:DIV markers (evidence (a)). |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change touches no Expectations file and sets no line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an adapted:DIV marker (evidence (a)), and no Expectations adapted field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no error fixture, either in the base fixtures or in the changed ones. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | I compared each consequence string with its test body and its cited bullets. XT-runtime-12 checks case-insensitive resolveClass, fqcn on the class and on an instance, and the brand's descriptor, which matches AD-10.1, 10.2 and 10.3. XT-runtime-14 checks duplicate throws, the test overlay (child unit, narrow-frame write, later test frame, concurrent sibling) and ScopeFrameException outside a test frame, which matches AD-10.5 and AD-5.8. XT-runtime-15 checks the PSR-4 async import, the rejections, the classmap round trip and classmap-before-PSR-4, which matches AD-10.3 and 10.4. XT-runtime-13's body matches its string, but it cites FR-22, and the evidence reports no consequence line with that ID. So I cannot confirm the cited bullet is the one the test verifies. |
| F-8: No stub, fake or partial implementation of another Component | pass | The changes are confined to packages/runtime: the registry, scope.ts, the new php/jsonEncode core, package.json exports and async-surface.json. The early default-flags jsonEncode core is the change decisions/ESC-9.4-1.md part 2 approves, with Story 9.8 adding to it and removing nothing. It is complete for what it encodes and throws TypeError on everything else, rather than faking it. resolveClass throwing a plain Error until Story 9.10 is documented, not a stub of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Under evidence (g), the only @​asyncRoot tag in the changed files is on resolveClassAsync (registry.ts:125). That function really does 'await import()' on an async miss, and decisions/ESC-9.4-1.md option 1a adds Registry.resolveClassAsync as a root and says F-9 judges this tag true. async-surface.json gains the matching line. Every other new export is sync and untagged: registerTestClass, resolveClass, loadAutoload, loadClassmap, writeClassmap, installTestFrameAccess and jsonEncode. None reaches a Driver-contract root or accepts an async callback; the classmap and autoload functions use sync node:fs at boot, behind no Driver contract. In scope.ts, the runners stay untagged dual helpers (ESC-9.3-1) and the installTestFrameAccess call is sync. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/registry.test.ts`: XT-runtime-13's consequence string cites 'FR-22', but no line in conformance/xaravel-consequences/*.jsonl has that ID (evidence (e): 'unknown consequence id FR-22'). Cite the FR-<n>.<k> bullet that requires the 'Class "<FQCN>" not found' error, after adding it to the consequences file if it is missing, or drop the token and keep AD-10.2 and AD-10.4.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"ecbc244259a4aafb249375a9a8f05bb0ac361101","base":"8caf2f4dcffe49635e87278cbba45582fce51c0b","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-21T22:27:46.796Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids list is empty and the diff adds or changes no Ported Test. There are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"There is no Ported Test, so there is no Upstream expected value to weaken. The four new tests are Xaravel Tests (XT-runtime-12 to 15) with no Upstream source.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, and the diff has no adapted:DIV markers (evidence (a)).","findings":[]},{"id":"F-4","result":"n/a","note":"The change touches no Expectations file and sets no line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an adapted:DIV marker (evidence (a)), and no Expectations adapted field changes.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no error fixture, either in the base fixtures or in the changed ones.","findings":[]},{"id":"F-7","result":"fail","note":"I compared each consequence string with its test body and its cited bullets. XT-runtime-12 checks case-insensitive resolveClass, fqcn on the class and on an instance, and the brand's descriptor, which matches AD-10.1, 10.2 and 10.3. XT-runtime-14 checks duplicate throws, the test overlay (child unit, narrow-frame write, later test frame, concurrent sibling) and ScopeFrameException outside a test frame, which matches AD-10.5 and AD-5.8. XT-runtime-15 checks the PSR-4 async import, the rejections, the classmap round trip and classmap-before-PSR-4, which matches AD-10.3 and 10.4. XT-runtime-13's body matches its string, but it cites FR-22, and the evidence reports no consequence line with that ID. So I cannot confirm the cited bullet is the one the test verifies.","findings":[{"path":"packages/runtime/tests/xaravel/registry.test.ts","detail":"XT-runtime-13's consequence string cites `FR-22`, but no line in conformance/xaravel-consequences/*.jsonl has that ID (evidence (e): 'unknown consequence id FR-22'). Cite the FR-<n>.<k> bullet that requires the `Class \"<FQCN>\" not found` error, after adding it to the consequences file if it is missing, or drop the token and keep AD-10.2 and AD-10.4."}]},{"id":"F-8","result":"pass","note":"The changes are confined to packages/runtime: the registry, scope.ts, the new php/jsonEncode core, package.json exports and async-surface.json. The early default-flags jsonEncode core is the change decisions/ESC-9.4-1.md part 2 approves, with Story 9.8 adding to it and removing nothing. It is complete for what it encodes and throws TypeError on everything else, rather than faking it. resolveClass throwing a plain Error until Story 9.10 is documented, not a stub of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Under evidence (g), the only @asyncRoot tag in the changed files is on resolveClassAsync (registry.ts:125). That function really does `await import()` on an async miss, and decisions/ESC-9.4-1.md option 1a adds Registry.resolveClassAsync as a root and says F-9 judges this tag true. async-surface.json gains the matching line. Every other new export is sync and untagged: registerTestClass, resolveClass, loadAutoload, loadClassmap, writeClassmap, installTestFrameAccess and jsonEncode. None reaches a Driver-contract root or accepts an async callback; the classmap and autoload functions use sync node:fs at boot, behind no Driver contract. In scope.ts, the runners stay untagged dual helpers (ESC-9.3-1) and the installTestFrameAccess call is sync.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree b16cf0387e03faaf4bc3f88b003e62050f807e65

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `8caf2f4dcffe49635e87278cbba45582fce51c0b`, on 2026-10-21T22:34:52.046Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff adds only Xaravel Tests. |
| F-2: No expected value is weakened | pass | The added Xaravel Tests use concrete expected identities, strings and exception types; no existing expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed, so no Upstream assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no added adapted markers or changed Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-12 through XT-runtime-15 check their declared registration, identity, missing-class, overlay and autoload consequences. Their AD citations match the supplied bullets; XT-runtime-13 now cites AD-10.2 and AD-10.4 without FR-22. |
| F-8: No stub, fake or partial implementation of another Component | pass | All implementation changes remain within runtime. The registry, scope integration and encoder core match the scope expressly approved by ESC-9.1-2 and ESC-9.4-1. |
| F-9: Every `@asyncRoot` tag is true | pass | resolveClassAsync performs await import() and carries the root expressly approved by ESC-9.4-1. The declaration inventory shows no other public Promise-returning addition requiring a tag; the Scope Frame runners retain generic dual-helper signatures. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/registry.test.ts`: XT-runtime-13 cites unknown consequence FR-22. Replace it with the applicable registered consequence bullet or supply its authoritative text and demonstrate that the test verifies it. **fixed**: XT-runtime-13 removes FR-22 and cites the supplied AD-10.2 identity and AD-10.4 async-miss bullets, which its assertions exercise.
- **P-2** (reviewer 2, F-7) `packages/runtime/tests/xaravel/registry.test.ts`: XT-runtime-13's consequence string cites 'FR-22', but no line in conformance/xaravel-consequences/*.jsonl has that ID (evidence (e): 'unknown consequence id FR-22'). Cite the FR-<n>.<k> bullet that requires the 'Class "<FQCN>" not found' error, after adding it to the consequences file if it is missing, or drop the token and keep AD-10.2 and AD-10.4. **fixed**: XT-runtime-13 takes the requested option of dropping FR-22 while keeping AD-10.2 and AD-10.4.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"b16cf0387e03faaf4bc3f88b003e62050f807e65","base":"8caf2f4dcffe49635e87278cbba45582fce51c0b","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-21T22:34:52.046Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff adds only Xaravel Tests.","findings":[]},{"id":"F-2","result":"pass","note":"The added Xaravel Tests use concrete expected identities, strings and exception types; no existing expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed, so no Upstream assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no added adapted markers or changed Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-12 through XT-runtime-15 check their declared registration, identity, missing-class, overlay and autoload consequences. Their AD citations match the supplied bullets; XT-runtime-13 now cites AD-10.2 and AD-10.4 without FR-22.","findings":[]},{"id":"F-8","result":"pass","note":"All implementation changes remain within runtime. The registry, scope integration and encoder core match the scope expressly approved by ESC-9.1-2 and ESC-9.4-1.","findings":[]},{"id":"F-9","result":"pass","note":"resolveClassAsync performs await import() and carries the root expressly approved by ESC-9.4-1. The declaration inventory shows no other public Promise-returning addition requiring a tag; the Scope Frame runners retain generic dual-helper signatures.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/registry.test.ts","detail":"XT-runtime-13 cites unknown consequence FR-22. Replace it with the applicable registered consequence bullet or supply its authoritative text and demonstrate that the test verifies it.","fixed":true,"note":"XT-runtime-13 removes FR-22 and cites the supplied AD-10.2 identity and AD-10.4 async-miss bullets, which its assertions exercise."},{"id":"P-2","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/registry.test.ts","detail":"XT-runtime-13's consequence string cites `FR-22`, but no line in conformance/xaravel-consequences/*.jsonl has that ID (evidence (e): 'unknown consequence id FR-22'). Cite the FR-<n>.<k> bullet that requires the `Class \"<FQCN>\" not found` error, after adding it to the consequences file if it is missing, or drop the token and keep AD-10.2 and AD-10.4.","fixed":true,"note":"XT-runtime-13 takes the requested option of dropping FR-22 while keeping AD-10.2 and AD-10.4."}]}
```

### Reviewer 2: pass at tree b16cf0387e03faaf4bc3f88b003e62050f807e65

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `8caf2f4dcffe49635e87278cbba45582fce51c0b`, on 2026-10-21T22:34:52.046Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | Manifest test_ids is empty; the change adds or changes no Ported Test, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test is added or changed, so there are no Upstream expected values to weaken. Only Xaravel Tests XT-runtime-12..15 are added. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test, so there is no Upstream assertion count to compare; evidence (a) shows no adapted markers. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field is changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): there are no error fixtures, neither base nor changed. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-12: resolveClass is case-insensitive and ignores a leading backslash; fqcn works on a class and an instance; the brand descriptor is checked; a subclass's fqcn throws. This matches its string and AD-10.1/10.2/10.3. XT-runtime-13: the sync and async misses give the exact 'Class "App\Missing" not found' message, and fqcn of unregistered values throws (AD-10.2, AD-10.4). It no longer cites FR-22. XT-runtime-14: duplicate-key and second-FQCN errors (AD-10.5); the test overlay is visible from a child unit and a narrow frame (AD-5.8) but not outside, in a later test frame or in a concurrent sibling; registering outside a test frame throws ScopeFrameException. XT-runtime-15: the PSR-4 map comes from package.json; the async miss imports the file; the reject cases are covered; the classmap round trip is checked byte-for-byte; the classmap is consulted before PSR-4 (AD-10.3, AD-10.4). |
| F-8: No stub, fake or partial implementation of another Component | pass | Every change is in packages/runtime (registry, scope, php). The default-flags jsonEncode core in src/php is the one ESC-9.4-1 part 2 rules on, landed early in the same package with no stub or hard-coded return. No other Component is stubbed or faked. |
| F-9: Every `@asyncRoot` tag is true | pass | resolveClassAsync really does an await import() on a miss (AD-10.4). Its tag, @​asyncRoot Registry.resolveClassAsync, is the root approved by ESC-9.4-1 option 1a, and async-surface.json lists it. Every other new export is sync and untagged: fqcn, resolveClass, registerTestClass, loadAutoload, loadClassmap, writeClassmap, installTestFrameAccess, jsonEncode. scope.ts keeps its runners untagged as dual helpers (ESC-9.3-1); its two matching lines are comments, not tags. The installTestFrameAccess call it adds is sync. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/registry.test.ts`: XT-runtime-13 cites unknown consequence FR-22. Replace it with the applicable registered consequence bullet or supply its authoritative text and demonstrate that the test verifies it. **fixed**: XT-runtime-13's consequence string now cites only (AD-10.2, AD-10.4). Both are registered in runtime.jsonl, and the test body checks the fqcn throw and the async-path miss; FR-22 is gone.
- **P-2** (reviewer 2, F-7) `packages/runtime/tests/xaravel/registry.test.ts`: XT-runtime-13's consequence string cites 'FR-22', but no line in conformance/xaravel-consequences/*.jsonl has that ID (evidence (e): 'unknown consequence id FR-22'). Cite the FR-<n>.<k> bullet that requires the 'Class "<FQCN>" not found' error, after adding it to the consequences file if it is missing, or drop the token and keep AD-10.2 and AD-10.4. **fixed**: The FR-22 token is dropped and AD-10.2 and AD-10.4 are kept, as the finding's second option allows. Evidence (e) lists no unknown consequence id.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"b16cf0387e03faaf4bc3f88b003e62050f807e65","base":"8caf2f4dcffe49635e87278cbba45582fce51c0b","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-21T22:34:52.046Z","items":[{"id":"F-1","result":"n/a","note":"Manifest test_ids is empty; the change adds or changes no Ported Test, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is added or changed, so there are no Upstream expected values to weaken. Only Xaravel Tests XT-runtime-12..15 are added.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test, so there is no Upstream assertion count to compare; evidence (a) shows no adapted markers.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added line carries an adapted:DIV marker, and no Expectations adapted field is changed.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): there are no error fixtures, neither base nor changed.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-12: resolveClass is case-insensitive and ignores a leading backslash; fqcn works on a class and an instance; the brand descriptor is checked; a subclass's fqcn throws. This matches its string and AD-10.1/10.2/10.3. XT-runtime-13: the sync and async misses give the exact 'Class \"App\\Missing\" not found' message, and fqcn of unregistered values throws (AD-10.2, AD-10.4). It no longer cites FR-22. XT-runtime-14: duplicate-key and second-FQCN errors (AD-10.5); the test overlay is visible from a child unit and a narrow frame (AD-5.8) but not outside, in a later test frame or in a concurrent sibling; registering outside a test frame throws ScopeFrameException. XT-runtime-15: the PSR-4 map comes from package.json; the async miss imports the file; the reject cases are covered; the classmap round trip is checked byte-for-byte; the classmap is consulted before PSR-4 (AD-10.3, AD-10.4).","findings":[]},{"id":"F-8","result":"pass","note":"Every change is in packages/runtime (registry, scope, php). The default-flags jsonEncode core in src/php is the one ESC-9.4-1 part 2 rules on, landed early in the same package with no stub or hard-coded return. No other Component is stubbed or faked.","findings":[]},{"id":"F-9","result":"pass","note":"resolveClassAsync really does an await import() on a miss (AD-10.4). Its tag, @asyncRoot Registry.resolveClassAsync, is the root approved by ESC-9.4-1 option 1a, and async-surface.json lists it. Every other new export is sync and untagged: fqcn, resolveClass, registerTestClass, loadAutoload, loadClassmap, writeClassmap, installTestFrameAccess, jsonEncode. scope.ts keeps its runners untagged as dual helpers (ESC-9.3-1); its two matching lines are comments, not tags. The installTestFrameAccess call it adds is sync.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/registry.test.ts","detail":"XT-runtime-13 cites unknown consequence FR-22. Replace it with the applicable registered consequence bullet or supply its authoritative text and demonstrate that the test verifies it.","fixed":true,"note":"XT-runtime-13's consequence string now cites only (AD-10.2, AD-10.4). Both are registered in runtime.jsonl, and the test body checks the fqcn throw and the async-path miss; FR-22 is gone."},{"id":"P-2","reviewer":2,"item":"F-7","path":"packages/runtime/tests/xaravel/registry.test.ts","detail":"XT-runtime-13's consequence string cites `FR-22`, but no line in conformance/xaravel-consequences/*.jsonl has that ID (evidence (e): 'unknown consequence id FR-22'). Cite the FR-<n>.<k> bullet that requires the `Class \"<FQCN>\" not found` error, after adding it to the consequences file if it is missing, or drop the token and keep AD-10.2 and AD-10.4.","fixed":true,"note":"The FR-22 token is dropped and AD-10.2 and AD-10.4 are kept, as the finding's second option allows. Evidence (e) lists no unknown consequence id."}]}
```
