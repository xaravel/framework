---
title: 'BlockedByComponentError in @xaravel/runtime (epic-12-item-1-blocked-by-component-error)'
type: 'feature'
created: '2026-10-25'
status: 'done'
baseline_revision: '4893648a33e0678b4489572b4b0e756441ead2c5'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/decisions/ESC-12.1-2.md'
  - '{project-root}/decisions/ESC-5.3-1.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** A `skip` / `blocked-by:<c>` Expectations line matches only a junit failure whose `type` is `BlockedByComponentError` and whose message starts `BlockedByComponentError(<c>)` (ESC-5.3-1, `conformance/harness/compare.ts:121`). No such class exists, so Story 12.1 cannot mark `ConditionableTest::testWhen` / `::testUnless` `blocked-by:database`. The Maintainer ruled (ESC-12.1-2, option 1) that the runtime defines it now, as this action item.

**Approach:** Add `packages/runtime/src/BlockedByComponentError.ts`: a JS `Error` subclass whose `name` is `BlockedByComponentError`, built as `new BlockedByComponentError(component, detail = null)`, with message `BlockedByComponentError(<component>)` or `BlockedByComponentError(<component>): <detail>`, registered as `Xaravel\Runtime\BlockedByComponentError`. Export it from the package root, document it, and pin it with XT-runtime-43.

## Boundaries & Constraints

**Always:** Edit only `packages/runtime/**` and this item's records under `_bmad-output/implementation-artifacts/`. `name` is exactly `BlockedByComponentError` (bun's junit `type` is the thrown error's `name`, `conformance/harness/junit.ts:7`). `<component>` must be a Component name in the component map's form: lowercase kebab (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`), so the message always matches the harness pattern `^BlockedByComponentError\(([^()\s]+)\)`; anything else (a non-string, `""`, `Database`, `a b`, `(x)`) throws a JS `TypeError` `BlockedByComponentError(): …`, as Xaravel's other API-misuse errors do (`docs/exceptions.md` § Where the runtime throws them). `detail` is a string or `null` (AD-9). The instance exposes `component` (readonly string).

**Never:** Extend PHP's `Exception`/`Error` (a test that expects an `Exception` must not pass by catching a blocked-by error). Change any other runtime behaviour, any test, the harness, `conformance/**`, `tools/**`, another package, or the item's `action`/`owner`/`epic`. Read the component map at runtime (the runtime does no IO; the map is grader data).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bare | `new BlockedByComponentError("database")` | message `BlockedByComponentError(database)`, `name` `BlockedByComponentError`, `component` `database`, `instanceof globalThis.Error` | none |
| With detail | `("json-schema", "Illuminate\\Database is not installed")` | message `BlockedByComponentError(json-schema): Illuminate\Database is not installed` | none |
| Bad component | `""`, `"Database"`, `"a b"`, `"(x)"`, `null`, `5` | — | `TypeError`, message starts `BlockedByComponentError():` |
| Bad detail | `("database", 5)` | — | `TypeError` |
| Registry | `fqcn(BlockedByComponentError)`, `resolveClass("Xaravel\\Runtime\\BlockedByComponentError")` | the FQCN; the class | none |
| Not PHP | `instanceof Exception`, `instanceof php Error` | `false` | none |

</intent-contract>

## Code Map

- `packages/runtime/src/scope/ScopeFrameException.ts` -- pattern for a Xaravel-only registered class (`registerClass` from `../registry/registry`, last line, AD-10).
- `packages/runtime/src/php/throwableArguments.ts:175` -- `initThrowable` sets PHP throwables' `name` to the FQCN brand; not used here, because the harness needs the bare name.
- `packages/runtime/src/index.ts` -- package root barrel; add a `export { BlockedByComponentError } from "./BlockedByComponentError";` list line (docs.test.ts reads only `export { … } from` forms).
- `packages/runtime/docs/exceptions.md` § Where the runtime throws them (line 83) -- XT-runtime-37 (`tests/xaravel/docs.test.ts`) fails unless every root export is named in backticks in `docs/`.
- `packages/runtime/async-surface.json` -- sync class, no line; `bun run async-surface` check must stay current.
- `packages/runtime/tests/xaravel/exceptions.test.ts` -- the exceptions XT file; append XT-runtime-43 (highest existing is XT-runtime-42, `frames.test.ts:684`).
- Read-only: `conformance/harness/compare.ts:121-128` (`blockedComponent`), `conformance/harness/junit.ts`, `conformance/component-map` (41 components, all lowercase kebab), `conformance/tests/xaravel/harness.test.ts:505` (XT-conformance-104 uses its own stand-in class).

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/BlockedByComponentError.ts` -- new class per the intent; header comment cites ESC-5.3-1 and ESC-12.1-2 -- the ruled form.
- `packages/runtime/src/index.ts` -- export it from the root -- "exported for Ported Tests".
- `packages/runtime/docs/exceptions.md` -- a short section on `BlockedByComponentError`: its form, that it is not a PHP throwable, and how a Ported Test throws it from `setUp` under a `blocked-by:<c>` line -- docs follow.
- `packages/runtime/tests/xaravel/exceptions.test.ts` -- XT-runtime-43 covering every I/O matrix row, plus a check that the message matches the harness's pattern and yields the component -- the item's XT-runtime test.

**Acceptance Criteria:**
- Given a Ported Test that throws `new BlockedByComponentError("database")`, when bun writes its junit report, then the failure's `type` is `BlockedByComponentError` and its message starts `BlockedByComponentError(database)` (XT-runtime-43 runs this through `bun test --reporter=junit` in a temp dir).
- Given the change, when `bun run harness` runs in full, then it reports no difference; `bun run typecheck`, `bun run lint`, `bun run registration:check` and `bun run async-surface --check runtime` succeed.
- Given the change, when `git diff --stat` is read against the baseline, then only `packages/runtime/**` and this item's records change.

## Spec Change Log

## Review Triage Log

### 2026-10-25 — Review pass
- verdicts: 22 findings — high 0, medium 1, low 16, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` (edge) the spawned `bun test` has no timeout — added `timeout: 60_000` to `Bun.spawnSync`.
  - `[low]` `[patch]` (edge) a child that writes no junit file fails with a bare ENOENT — the failure now carries the child's stderr (same edit as the timeout).
  - `[low]` `[reject]` (edge) a kebab name not in the component map (`databse`) is accepted — the runtime does no IO and may not read grader data (intent Never); a typo yields `blocked-by:databse`, which the harness reports loudly as a mismatch against the Expectations line, so nothing passes silently.
  - `[low]` `[reject]` (edge) `detail === ""` leaves a trailing `: ` — the message still starts `BlockedByComponentError(<c>)` and matches; no caller passes `""`; the fix adds a branch.
  - `[low]` `[reject]` (edge) a later write to `name` changes the junit type — only code that deliberately reassigns `name` hits it; `name` is writable on every runtime throwable (`initThrowable`) by convention.
  - `[low]` `[reject]` (intent) membership in the component map is not enforced — same as the edge row above.
  - `[false]` `[reject]` (intent) the regex rejects `@xaravel/database` — ESC-12.1-2's route names `BlockedByComponentError(database)` and `blocked-by:database`; the map's `component` field is the bare name; intended, as the auditor notes.
  - `[medium]` `[patch]` (intent, verification-gap, blind; grouped) no test runs the real class through `portedTest` + `TestCase.setUp` (the documented route), and the docs say it may be thrown from the test body, where after `expectException(...)` `ExceptionExpectation.verify` (`packages/assert/src/Framework/TestCase/ExceptionExpectation.ts:50`) turns it into an assertion failure — XT-runtime-43's child run now includes a `portedTest` whose `setUp` throws it and whose `tearDown` also throws, asserting the junit type, message and `blockedComponent`; the docs and class header now say to throw it from `setUp`, and why the body after `expectException` does not work.
  - `[low]` `[reject]` (verification-gap other) change `shouldBeVerifiedFor` to let it propagate — `packages/assert` is outside the item's scope (MAINT 2026-10-22); the doc fix above covers the route ESC-12.1-2 names.
  - `[low]` `[reject]` (intent) the test does not go through `actualOutcome` / an Expectations line — XT-conformance-104 (`conformance/tests/xaravel/harness.test.ts:505`) pins that path for this form; the junit `type` and message, which this item owns, are checked against the real reader and `blockedComponent`.
  - `[low]` `[patch]` (blind) docs and header omit that Story 17.2 raises it from framework code (ESC-12.1-2) — one sentence added to each.
  - `[low]` `[patch]` (blind) the regex is never checked against the real component map — XT-runtime-43 now reads `conformance/component-map` and constructs every `component`, round-tripping each through `blockedComponent`.
  - `[low]` `[reject]` (blind) `detail` `""`, newline or leading `)` untested — same as the edge `""` row; a detail never changes the `(<c>)` prefix the harness reads.
  - `[low]` `[reject]` (blind) `readonly component` is writable at run time — TypeScript `readonly` is the codebase's convention for such fields; the fix (defineProperty) adds code for a write no caller makes.
  - `[low]` `[reject]` (blind) `name` is set per instance, not on the prototype — the same per-instance `defineProperty` the runtime's throwables use (`throwableArguments.ts:177`); no code reads `prototype.name`.
  - `[low]` `[patch]` (blind) the bad-detail loop does not assert "not PHP's TypeError" — the line is added.
  - `[low]` `[patch]` (blind) `json-schema` paired with an `Illuminate\Database` detail — test and docs now use `Illuminate\JsonSchema is not installed`.
  - `[low]` `[patch]` (blind) the test file's header parenthetical contradicts its Story 9.10 sentence — restored that sentence and added a separate one naming the action item.
  - `[false]` `[reject]` (blind) the spawned run has no timeout — duplicate of the edge row, patched there.
  - `[false]` `[reject]` (blind) the setUp route lacks a "first error wins" check — covered by the medium patch's throwing `tearDown`.
  - `[false]` `[reject]` (fidelity, reviewer 1) F-7 `conformance/harness/junit.ts`: supply `parseJunit`'s implementation — the file is in the repository and the test's assertions hold against it (`bun test packages/runtime` passes); a missing-evidence-only reject outside F-2/F-3/F-8 counts as a pass (`evidence gap noted`, `decisions/MAINT-2026-10-24-evidence-gaps.md`).
  - `[false]` `[reject]` (fidelity, reviewer 1) F-7 `conformance/harness/compare.ts`: supply `blockedComponent` — same as the row above.

### 2026-10-25 — Review pass (Finalize re-check, after the patches)
- verdicts: 4 findings — high 0, medium 0, low 0, false 4, maybe-false 0
- findings:
  - `[false]` `[reject]` (fidelity, reviewer 1) F-7 `conformance/harness/junit.ts`: supply `parseJunit` — the file is in the repository and XT-runtime-43 passes against it; missing evidence only, noted as an evidence gap (`decisions/MAINT-2026-10-24-evidence-gaps.md`); `status --item` prints `current` for tree `f895450314e1c822fa0373c1d4e34e1efc758ba6`.
  - `[false]` `[reject]` (fidelity, reviewer 1) F-7 `conformance/harness/compare.ts`: supply `blockedComponent` — same as above.
  - `[false]` `[reject]` (fidelity, reviewer 2) F-7 `conformance/harness/junit.ts` — same as above.
  - `[false]` `[reject]` (fidelity, reviewer 2) F-7 `conformance/harness/compare.ts` — same as above.

## Design Notes

Not a PHP throwable: the grader's `expectException(Exception::class)` checks `instanceof map.Exception` (`docs/exceptions.md` protocol section); were this an `Exception`, a test expecting one would pass on a blocked component instead of reporting `blocked-by`. The FQCN sits under `Xaravel\Runtime\`, as `ScopeFrameException` does; the file is at `src/BlockedByComponentError.ts`, the FQCN's sub-path.

```ts
export class BlockedByComponentError extends globalThis.Error {
  readonly component: string;
  constructor(component: string, detail: string | null = null) { /* validate, super(message), define name */ }
}
registerClass("Xaravel\\Runtime\\BlockedByComponentError", BlockedByComponentError);
```

## Verification

**Commands:**
- `bun test packages/runtime` -- expected: all pass, XT-runtime-43 included
- `bun run typecheck` and `bun run lint` -- expected: exit 0
- `bun run registration:check` -- expected: exit 0
- `bun run harness` -- expected: `SUMMARY` with no differences
- `bun run async-surface --check runtime` -- expected: exit 0 (no new line)

## Fidelity Review

### Reviewer 1: reject at tree 5e1839dc845a07c133ecbd46d7cb11f15ef5445f

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4893648a33e0678b4489572b4b0e756441ead2c5`, on 2026-10-25T17:20:26.976Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The diff adds no Ported Test, so there are no Upstream assertions to match. |
| F-2: No expected value is weakened | pass | The diff adds XT-runtime-43 without changing or weakening any existing expected value. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip; the documentation only describes future blocked-by usage. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The action item relies on no Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-runtime-43 asserts the declared class properties and exercises junit matching, but the implementations of its imported harness helpers are absent, preventing confirmation of that consequence. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files are within runtime scope. The registered error implements the runtime class explicitly authorized by ESC-12.1-2 and supplies no other Component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source files retain no asyncRoot tags; the new error constructor and registration are synchronous and require none under AD-6. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-7** `conformance/harness/junit.ts`: Supply parseJunit's implementation and relevant dependencies so the assertions on actual junit failure types and messages can be verified. _(missing evidence)_
- **F-7** `conformance/harness/compare.ts`: Supply blockedComponent's implementation and relevant dependencies so the claimed blocked-by matching behavior can be verified. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"5e1839dc845a07c133ecbd46d7cb11f15ef5445f","base":"4893648a33e0678b4489572b4b0e756441ead2c5","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-25T17:20:26.976Z","items":[{"id":"F-1","result":"n/a","note":"The diff adds no Ported Test, so there are no Upstream assertions to match.","findings":[]},{"id":"F-2","result":"pass","note":"The diff adds XT-runtime-43 without changing or weakening any existing expected value.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip; the documentation only describes future blocked-by usage.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The action item relies on no Oracle error fixture.","findings":[]},{"id":"F-7","result":"fail","note":"XT-runtime-43 asserts the declared class properties and exercises junit matching, but the implementations of its imported harness helpers are absent, preventing confirmation of that consequence.","findings":[{"path":"conformance/harness/junit.ts","detail":"Supply parseJunit's implementation and relevant dependencies so the assertions on actual junit failure types and messages can be verified.","kind":"missing-evidence"},{"path":"conformance/harness/compare.ts","detail":"Supply blockedComponent's implementation and relevant dependencies so the claimed blocked-by matching behavior can be verified.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"All changed files are within runtime scope. The registered error implements the runtime class explicitly authorized by ESC-12.1-2 and supplies no other Component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source files retain no asyncRoot tags; the new error constructor and registration are synchronous and require none under AD-6.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 5e1839dc845a07c133ecbd46d7cb11f15ef5445f

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `4893648a33e0678b4489572b4b0e756441ead2c5`, on 2026-10-25T17:20:26.976Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test. The only touched test is the Xaravel Test XT-runtime-43, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | pass | The change touches no Ported Test, so no Upstream expected value can be weakened. The new XT-runtime-43 uses exact assertSame checks on the message, name, component, FQCN, junit type and blockedComponent result. It uses assertStringStartsWith only where the form itself is a prefix: ESC-5.3-1's 'message starting BlockedByComponentError(<c>)' and the TypeError prefix. No existing assertion in exceptions.test.ts changes; the only other edit is a header comment. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there are no assertion counts to compare with Upstream. The diff removes no assertion from XT-runtime-35 or XT-runtime-36. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. The doc example only describes a future blocked-by:database line, which Story 12.1 will add. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a) shows no added adapted:DIV-<n>.<k> marker and no Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows no assigned or changed Oracle fixture whose output is an error, and XT-runtime-43 relies on no Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-43's consequence with its body. Registered: fqcn and resolveClass under Xaravel\Runtime\BlockedByComponentError. JS Error but not a PHP throwable: instanceof globalThis.Error is true; php.Exception, php.Error and the published map's Exception and Error are false. Named: name === 'BlockedByComponentError'. Message form: bare and detail forms are exact. Junit: a spawned bun test throwing from test and beforeEach gives type BlockedByComponentError, a message with the expected prefix, and blockedComponent yields the component. Bad components and bad details throw a JS TypeError starting 'BlockedByComponentError():', which is not PHP's TypeError. The string cites ESC-5.3-1 and ESC-12.1-2 but no FR or AD token, and the body matches both rulings. Not a finding: the harness modules the test loads at run time (conformance/harness/junit.ts, compare.ts) were not shown, but the test checks the junit type and message prefix directly as well. |
| F-8: No stub, fake or partial implementation of another Component | pass | Only packages/runtime changes: a new src/BlockedByComponentError.ts, an export in src/index.ts, docs and the runtime's own test. ESC-12.1-2 places the class in @​xaravel/runtime as a Maintainer-approved Infrastructure change and moves the definition out of Story 17.2. No stub, fake or hard-coded behaviour of another Component is added. The test only reads the harness at run time and changes nothing in it. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in BlockedByComponentError.ts or index.ts. The class constructor is synchronous, does no IO, accepts no callback and returns no Promise, so it correctly has no tag. The new re-export in index.ts is that sync class, and the file's other exports are unchanged. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"5e1839dc845a07c133ecbd46d7cb11f15ef5445f","base":"4893648a33e0678b4489572b4b0e756441ead2c5","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-25T17:20:26.976Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test. The only touched test is the Xaravel Test XT-runtime-43, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"pass","note":"The change touches no Ported Test, so no Upstream expected value can be weakened. The new XT-runtime-43 uses exact assertSame checks on the message, name, component, FQCN, junit type and blockedComponent result. It uses assertStringStartsWith only where the form itself is a prefix: ESC-5.3-1's 'message starting BlockedByComponentError(<c>)' and the TypeError prefix. No existing assertion in exceptions.test.ts changes; the only other edit is a header comment.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there are no assertion counts to compare with Upstream. The diff removes no assertion from XT-runtime-35 or XT-runtime-36.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip. The doc example only describes a future blocked-by:database line, which Story 12.1 will add.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a) shows no added adapted:DIV-<n>.<k> marker and no Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows no assigned or changed Oracle fixture whose output is an error, and XT-runtime-43 relies on no Oracle fixture.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-43's consequence with its body. Registered: fqcn and resolveClass under Xaravel\\Runtime\\BlockedByComponentError. JS Error but not a PHP throwable: instanceof globalThis.Error is true; php.Exception, php.Error and the published map's Exception and Error are false. Named: name === 'BlockedByComponentError'. Message form: bare and detail forms are exact. Junit: a spawned bun test throwing from test and beforeEach gives type BlockedByComponentError, a message with the expected prefix, and blockedComponent yields the component. Bad components and bad details throw a JS TypeError starting 'BlockedByComponentError():', which is not PHP's TypeError. The string cites ESC-5.3-1 and ESC-12.1-2 but no FR or AD token, and the body matches both rulings. Not a finding: the harness modules the test loads at run time (conformance/harness/junit.ts, compare.ts) were not shown, but the test checks the junit type and message prefix directly as well.","findings":[]},{"id":"F-8","result":"pass","note":"Only packages/runtime changes: a new src/BlockedByComponentError.ts, an export in src/index.ts, docs and the runtime's own test. ESC-12.1-2 places the class in @xaravel/runtime as a Maintainer-approved Infrastructure change and moves the definition out of Story 17.2. No stub, fake or hard-coded behaviour of another Component is added. The test only reads the harness at run time and changes nothing in it.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in BlockedByComponentError.ts or index.ts. The class constructor is synchronous, does no IO, accepts no callback and returns no Promise, so it correctly has no tag. The new re-export in index.ts is that sync class, and the file's other exports are unchanged.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree f895450314e1c822fa0373c1d4e34e1efc758ba6

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `4893648a33e0678b4489572b4b0e756441ead2c5`, on 2026-10-25T17:26:46.919Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No existing Ported Test is changed and no Upstream Ported Test is assigned. |
| F-2: No expected value is weakened | pass | The diff adds XT-runtime-43 without weakening any existing assertion or expected value. |
| F-3: No assertion is removed without a DIV clause | n/a | No Upstream assertion is removed; no assigned Ported Test changes. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The action item relies on no Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-runtime-43 checks construction, registration and PHP throwable separation, but its junit parsing and blocked-by matching claims still depend on implementations absent from the prompt. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed files belong to runtime. The registered error and root export match ESC-12.1-2's approved infrastructure scope and implement no other Component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed source files retain no asyncRoot tags. The new constructor and registration are synchronous, perform no IO and accept no callback requiring an async tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-7** `conformance/harness/junit.ts`: Supply parseJunit's implementation and relevant dependencies to verify that the subprocess assertions inspect the actual junit failure types and messages. The HarnessJunit interface supplies only a signature. _(missing evidence)_
- **F-7** `conformance/harness/compare.ts`: Supply blockedComponent's implementation and relevant dependencies to verify the claimed strict blocked-by matching behavior. The HarnessCompare interface supplies only a signature. _(missing evidence)_

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `conformance/harness/junit.ts`: Supply parseJunit's implementation and relevant dependencies so the assertions on actual junit failure types and messages can be verified. **not fixed**: The prompt still omits parseJunit's implementation and relevant dependencies; its interface and calls do not supply the requested evidence.
- **P-2** (reviewer 1, F-7) `conformance/harness/compare.ts`: Supply blockedComponent's implementation and relevant dependencies so the claimed blocked-by matching behavior can be verified. **not fixed**: The prompt still omits blockedComponent's implementation and relevant dependencies; its interface and calls do not supply the requested evidence.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"f895450314e1c822fa0373c1d4e34e1efc758ba6","base":"4893648a33e0678b4489572b4b0e756441ead2c5","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-25T17:26:46.919Z","items":[{"id":"F-1","result":"n/a","note":"No existing Ported Test is changed and no Upstream Ported Test is assigned.","findings":[]},{"id":"F-2","result":"pass","note":"The diff adds XT-runtime-43 without weakening any existing assertion or expected value.","findings":[]},{"id":"F-3","result":"n/a","note":"No Upstream assertion is removed; no assigned Ported Test changes.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The action item relies on no Oracle error fixture.","findings":[]},{"id":"F-7","result":"fail","note":"XT-runtime-43 checks construction, registration and PHP throwable separation, but its junit parsing and blocked-by matching claims still depend on implementations absent from the prompt.","findings":[{"path":"conformance/harness/junit.ts","detail":"Supply parseJunit's implementation and relevant dependencies to verify that the subprocess assertions inspect the actual junit failure types and messages. The HarnessJunit interface supplies only a signature.","kind":"missing-evidence"},{"path":"conformance/harness/compare.ts","detail":"Supply blockedComponent's implementation and relevant dependencies to verify the claimed strict blocked-by matching behavior. The HarnessCompare interface supplies only a signature.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"All changed files belong to runtime. The registered error and root export match ESC-12.1-2's approved infrastructure scope and implement no other Component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The changed source files retain no asyncRoot tags. The new constructor and registration are synchronous, perform no IO and accept no callback requiring an async tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"conformance/harness/junit.ts","detail":"Supply parseJunit's implementation and relevant dependencies so the assertions on actual junit failure types and messages can be verified.","fixed":false,"note":"The prompt still omits parseJunit's implementation and relevant dependencies; its interface and calls do not supply the requested evidence."},{"id":"P-2","reviewer":1,"item":"F-7","path":"conformance/harness/compare.ts","detail":"Supply blockedComponent's implementation and relevant dependencies so the claimed blocked-by matching behavior can be verified.","fixed":false,"note":"The prompt still omits blockedComponent's implementation and relevant dependencies; its interface and calls do not supply the requested evidence."}]}
```

### Reviewer 2: reject at tree f895450314e1c822fa0373c1d4e34e1efc758ba6

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `4893648a33e0678b4489572b4b0e756441ead2c5`, on 2026-10-25T17:26:46.919Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and changes or adds no Ported Test. |
| F-2: No expected value is weakened | n/a | No Ported Test or Upstream expected value is involved. The only touched test is the new Xaravel Test XT-runtime-43; no existing assertion is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed, so no Upstream assertion count applies. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted:DIV marker or Expectations adapted field is added (evidence (a)). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No assigned or changed Oracle fixture is an error (evidence (c)). |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | XT-runtime-43's body checks the class's name, message forms, component property, JS-Error-not-PHP-throwable, registry registration and TypeErrors for bad components or details, which matches its consequence string. The claim that bun's junit report records the error as the harness's blocked-by form rests on parseJunit (conformance/harness/junit.ts) and blockedComponent (conformance/harness/compare.ts). The test loads both through computed paths, and neither is supplied in this prompt, so those assertions cannot be verified. Prior findings P-1 and P-2 remain unaddressed. |
| F-8: No stub, fake or partial implementation of another Component | pass | Only packages/runtime files change: a new BlockedByComponentError class, its root export, the docs and the runtime test. ESC-12.1-2 assigns this class to @​xaravel/runtime. No stub or fake of another Component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | BlockedByComponentError.ts and index.ts hold no @​asyncRoot tags (evidence (g)). The new class constructor is synchronous and performs no IO, takes no callback and returns no Promise, so no tag is needed. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ is touched. |

Findings:

- **F-7** `conformance/harness/junit.ts`: parseJunit's implementation (and what it reads as type/message/outcome from bun's junit XML) is not in the prompt; supply it in the review evidence so the junit-type assertions of XT-runtime-43 can be confirmed (P-1). _(missing evidence)_
- **F-7** `conformance/harness/compare.ts`: blockedComponent's implementation (the type check and the BlockedByComponentError(<c>) message pattern) is not in the prompt; supply it so the claimed harness blocked-by matching can be confirmed (P-2). _(missing evidence)_

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `conformance/harness/junit.ts`: Supply parseJunit's implementation and relevant dependencies so the assertions on actual junit failure types and messages can be verified. **not fixed**: The prompt still does not show conformance/harness/junit.ts, either in (h) whole files or elsewhere; parseJunit's behaviour remains unverifiable.
- **P-2** (reviewer 1, F-7) `conformance/harness/compare.ts`: Supply blockedComponent's implementation and relevant dependencies so the claimed blocked-by matching behavior can be verified. **not fixed**: The prompt still does not show conformance/harness/compare.ts; blockedComponent's matching rule remains unverifiable.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"f895450314e1c822fa0373c1d4e34e1efc758ba6","base":"4893648a33e0678b4489572b4b0e756441ead2c5","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-25T17:26:46.919Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and changes or adds no Ported Test.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test or Upstream expected value is involved. The only touched test is the new Xaravel Test XT-runtime-43; no existing assertion is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed, so no Upstream assertion count applies.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted:DIV marker or Expectations adapted field is added (evidence (a)).","findings":[]},{"id":"F-6","result":"n/a","note":"No assigned or changed Oracle fixture is an error (evidence (c)).","findings":[]},{"id":"F-7","result":"fail","note":"XT-runtime-43's body checks the class's name, message forms, component property, JS-Error-not-PHP-throwable, registry registration and TypeErrors for bad components or details, which matches its consequence string. The claim that bun's junit report records the error as the harness's blocked-by form rests on parseJunit (conformance/harness/junit.ts) and blockedComponent (conformance/harness/compare.ts). The test loads both through computed paths, and neither is supplied in this prompt, so those assertions cannot be verified. Prior findings P-1 and P-2 remain unaddressed.","findings":[{"path":"conformance/harness/junit.ts","detail":"parseJunit's implementation (and what it reads as type/message/outcome from bun's junit XML) is not in the prompt; supply it in the review evidence so the junit-type assertions of XT-runtime-43 can be confirmed (P-1).","kind":"missing-evidence"},{"path":"conformance/harness/compare.ts","detail":"blockedComponent's implementation (the type check and the BlockedByComponentError(<c>) message pattern) is not in the prompt; supply it so the claimed harness blocked-by matching can be confirmed (P-2).","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"Only packages/runtime files change: a new BlockedByComponentError class, its root export, the docs and the runtime test. ESC-12.1-2 assigns this class to @xaravel/runtime. No stub or fake of another Component is added.","findings":[]},{"id":"F-9","result":"pass","note":"BlockedByComponentError.ts and index.ts hold no @asyncRoot tags (evidence (g)). The new class constructor is synchronous and performs no IO, takes no callback and returns no Promise, so no tag is needed.","findings":[]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ is touched.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"conformance/harness/junit.ts","detail":"Supply parseJunit's implementation and relevant dependencies so the assertions on actual junit failure types and messages can be verified.","fixed":false,"note":"The prompt still does not show conformance/harness/junit.ts, either in (h) whole files or elsewhere; parseJunit's behaviour remains unverifiable."},{"id":"P-2","reviewer":1,"item":"F-7","path":"conformance/harness/compare.ts","detail":"Supply blockedComponent's implementation and relevant dependencies so the claimed blocked-by matching behavior can be verified.","fixed":false,"note":"The prompt still does not show conformance/harness/compare.ts; blockedComponent's matching rule remains unverifiable."}]}
```

## Auto Run Result

Status: done

**Summary.** `@xaravel/runtime` now defines `BlockedByComponentError` in the form ESC-5.3-1 fixes. It is a JS `Error`, not a PHP throwable. Its `name` is `BlockedByComponentError`, and its message is `BlockedByComponentError(<c>)[: <detail>]`, where `<c>` is a lowercase-kebab Component name. It is registered as `Xaravel\Runtime\BlockedByComponentError` and exported from the package root. XT-runtime-43 pins it, including a real `bun test --reporter=junit` run through a raw test, a `beforeEach`, and a `portedTest` whose `setUp` throws it.

**Files changed.**
- `packages/runtime/src/BlockedByComponentError.ts`: the new class.
- `packages/runtime/src/index.ts`: the root export.
- `packages/runtime/docs/exceptions.md`: the class's section, and its place in the API-misuse `TypeError` list.
- `packages/runtime/tests/xaravel/exceptions.test.ts`: XT-runtime-43.

**Review.**
- Pass 1 had 22 findings. Patches applied: 1 medium (the `portedTest` + `setUp` route is now tested, and the docs say to throw from `setUp`) and 8 low (spawn timeout and stderr on a missing report; a check over every component in the map; a "not PHP's TypeError" check on bad details; the detail text; the test header; the Story 17.2 sentence). Nothing was deferred. Rejected, with their reasons in the triage log: membership in the map (twice), the empty detail (twice), a writable `name`, the `@xaravel/database` form, a change to `shouldBeVerifiedFor` (outside scope), the `actualOutcome` path (XT-conformance-104 covers it), a runtime-readonly `component`, `name` on the prototype, two duplicates, and two Fidelity F-7 evidence gaps.
- The pass 2 re-check had 4 Fidelity F-7 missing-evidence findings, all noted as evidence gaps.

**Follow-up review recommended:** false. Patched counts: high 0, medium 1, low 8.

**Verification.** On the final tree:
- `bun test packages/runtime`: 43 pass.
- `bun run typecheck`: exit 0.
- `bun run lint`: ok.
- `bun run registration:check`: ok, 41 registrations.
- `bun run async-surface --check runtime`: ok.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`.
- `bun run fidelity:review status --item epic-12-item-1-blocked-by-component-error`: `current`, with both rejects noted as F-7 evidence gaps for tree `f895450314e1c822fa0373c1d4e34e1efc758ba6`.

**Residual risks.**
- The Fidelity Review prompt did not carry `conformance/harness/junit.ts` or `compare.ts`, which XT-runtime-43 loads with `await import(join(REPO, …))`. That is a tool evidence gap, and it goes to INBOX.
- A `BlockedByComponentError` thrown from a test body after `expectException(...)` loses its blocked-by form. The docs route it to `setUp`.
