---
title: 'Story 4.1: PHP comparison core'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: '6d48339d91cbb8f42afa89963b6da7a42e12178f'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/docs/ops/oracle.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The grader calls mutable JS intrinsics at run time, so code under test can patch them and change comparison results.
    evidence: |-
      PhpComparison.ts calls Array.isArray, Object.keys, Object.getPrototypeOf, Map/Set and RegExp.prototype.test on each comparison; index.ts freezes only the two exports and their prototypes. AD-15 and the intent ask for frozen exports and prototypes, not intrinsics, so the gap has no owner yet (review pass 1, B10/EC8).
    location: >-
      packages/assert/src/comparison/PhpComparison.ts
    severity: low
  - summary: >-
      A class that extends a JS built-in (Error, Map, EventTarget) is `==` only to itself even when it exposes the props protocol, and it is not cast to 1 against a number.
    evidence: |-
      Follow-up pass (2026-10-18). `loose()` checks `isBuiltIn` before `objectProps` (PhpComparison.ts:419), and `isCastableObject` excludes built-ins (:337). A probe of `class E extends Error { [Symbol.for('xaravel.php.props')]() { return {m: this.m}; } }` gives `phpLooseEquals(new E("a"), new E("a"))` false and `phpLooseEquals(new E("a"), 1)` false, where PHP says true for both. Every ported exception extends Error, and Mockery's `with()` matches arguments through `phpLooseEquals`. Story 4.3's ObjectComparator (:33) and Exporter (:83) already treat Error subclasses as PHP objects, so the layers disagree. The rule is the approved ESC-4.1-1 contract (`decisions/ESC-4.1-1.md`, object props protocol), so changing the precedence needs a Maintainer ruling. Target: Maintainer (retro epic-4 item 7).
    location: >-
      packages/assert/src/comparison/PhpComparison.ts:337,419
    severity: medium
  - summary: >-
      `phpLooseEquals` never compares a Stringable object with a string through `__toString`, so `$obj == "a"` is false where PHP casts the object.
    evidence: |-
      Follow-up pass (2026-10-18). `loose()` returns false for any object against a string. A probe of a class whose own `toString()` returns "a" gives `phpLooseEquals(obj, "a")` false; PHP 8.5 compares the `__toString` result and says true. `PhpValues.isStringable` (Story 4.3) already detects such objects, but the comparison core does not use it, and the objects Oracle request has no string operands. This spec's Design Notes put `__toString` objects out of scope, while the intent asks for PHP 8.5 semantics, so it needs a Maintainer decision rather than a patch. Target: Maintainer (retro epic-4 item 8).
    location: >-
      packages/assert/src/comparison/PhpComparison.ts:397-415
    severity: medium
  - summary: >-
      The object protocol has no way to mark an object as uncomparable, as PHP enum cases are, so an enum case would be cast to 1 against a number or compared by props.
    evidence: |-
      Follow-up pass (2026-10-18). PHP enum cases use `zend_objects_not_comparable`, so `Suit::Hearts == 1` and `Suit::Hearts == true` are false, and two cases compare by identity. `loose()` casts any non-built-in object to 1 against a number (:391-396), and bool comparisons use the cast to true. No enum representation exists in the AD-9 model yet, so this is unverified against a real runtime value. It needs an extension of the ESC-4.1-1 protocol, which is a Maintainer decision. Target: Maintainer (retro epic-4 item 8).
    location: >-
      packages/assert/src/comparison/PhpComparison.ts:367-396
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Ported Tests need PHPUnit's equality semantics. `@xaravel/assert` is empty (`export {};`). PHP `==` and `===` must be implemented inside the grader, and every result must match the PHP 8.5 Oracle (FR-116, AD-15).

**Approach:**
- Add `phpLooseEquals(a, b)` and `phpStrictEquals(a, b)` to `@xaravel/assert`. Both run over the AD-9 value model and detect PHP arrays and objects by `Symbol.for` brand.
- Commit Oracle requests for a truth table, `conformance/oracle-requests/4.1.jsonl` (kind `php-expr`, id `XT-assert-1`).
- XT-assert-1 compares both functions against the signed fixtures in `conformance/fixtures/assert/<sha>.json`.
- Freeze the package's exports and prototypes on load.

## Boundaries & Constraints

**Always:**
- Follow PHP 8.5 semantics.
- `null` is the only absent value.
- The truth table comes only from signed Oracle fixtures, never from hand-written or locally evaluated outputs (AD-15).
- `@xaravel/assert` declares no non-grader dependency (`bun run graph:check`).

**Never:**
- Import `@xaravel/runtime` or any graded package.
- Use `constructor.name`.
- Commit unsigned outputs as expected values.
- Skip XT-assert-1 when its fixtures are missing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Numeric string | `0 == "a"`, `"1" == "01"`, `"10" == "1e1"`, `100 == "1e2"` | PHP 8 results: false, true, true, true | none |
| int/float | `1 == 1.0` vs `1 === 1.0` | Both are JS `number`, so int and float can't be told apart. Only cases that keep that distinction (AD-9 float marker) are in the table. | Out-of-model cases are left out of the requests, with a reason in Design Notes |
| Array order | `[1=>'a',0=>'b']` vs `[0=>'b',1=>'a']` | `==` true, `===` false | none |
| Branded | a `Symbol.for('xaravel.php.array')` PhpArray, or an object with `[Symbol.for('xaravel.php.props')]()` | Compared as a PHP array or object | none |
| Frozen | assigning to an export or prototype | throws `TypeError` | none |

</intent-contract>

## Code Map

- `packages/assert/src/index.ts`: currently `export {};`. Re-exports the comparison functions and freezes them on load.
- `packages/assert/tests/xaravel/`: holds only `.gitkeep`. XT-assert-1..3 go here as plain `bun:test` until Story 4.2 exists, titled `XT-assert-<n>: …`, as in `conformance/tests/xaravel/oracle-story.test.ts`. The package tsconfig has `rootDir: "."`, so files here cannot import `tools/` (TS6059); use `node:crypto`/`node:fs` only.
- `tools/oracle/request.ts:157,172`: `makeRequest`, `renderRequests` (sorted file text, trailing LF). Generate the request file with these, never by hand. `renderRequest` alone has no newline.
- `bun run oracle:story check 4.1`: judges the lines. The prototype file in Design Notes passes it (4 accepted).
- `tools/oracle/evaluate.php` header: the fixture value encoding (`{"int":"<dec>"}`, `{"float":"<var_export>"}` incl. `INF`/`-INF`/`NAN`/`-0.0`, `{"array":[[k,v]…]}`, `{"object":"<Class>","properties":[[name,scope,value]…]}`). `evalBody` (line 349) runs each `setup` statement and `expr` with `eval` in one closure, so variables persist; there is no error handler, so warnings do not throw.
- `tools/oracle/fixtures.ts:67,86`: a signature covers `"xaravel-oracle-fixture-v1\n" + canonicalJson({output, sha256})`. A fixture line is `{"sha256":…,"output":<canonical>,"signature":…}` + LF, so the message is rebuilt from the line's raw `output` text. Key: `conformance/oracle/oracle.pub` (Ed25519 SPKI PEM).
- `conformance/fixtures/assert/<sha256>.json`: written by `oracle.yml#story` (docs/ops/oracle.md "The workflow") onto this PR's branch; does not exist yet.
- `tools/graph/graph.ts:192`: `checkGraph(root)` checks package.json edges only, not source imports. The CLI is `bun run graph:check`.
- `stories/4.1.md`: component `assert`, owns XT-assert-1..3; set its `status` with sprint status.
- `/tmp/xaravel-inv/framework`: a locked local install. `php tools/oracle/evaluate.php /tmp/xaravel-inv/framework 8.5.11 <file>` gives unsigned outputs for a dev cross-check only; they are never committed.

## Tasks & Acceptance

**Execution:**
- `conformance/oracle-requests/4.1.jsonl` -- the four XT-assert-1 requests from Design Notes, generated with `makeRequest` + `renderRequests` -- the truth-table inputs, evaluated by the Oracle.
- `packages/assert/src/comparison/PhpComparison.ts` -- `phpLooseEquals(a, b): boolean` and `phpStrictEquals(a, b): boolean` per Design Notes -- the comparison core.
- `packages/assert/src/index.ts` -- named re-exports; `Object.freeze` each exported function and its `prototype` (if any) on load -- AC 3.
- `packages/assert/tests/xaravel/comparison.test.ts` -- XT-assert-1 (signed-fixture truth table: verify each fixture's signature against `oracle.pub`, require `error: null`, decode `$v`, check every pair of the loose and strict matrices; a missing fixture fails naming the path), XT-assert-2 (brand detection), XT-assert-3 (graph + freeze) -- one test per AC, in order.
- `conformance/escalations/ESC-4.1-1.md` -- open question: the grader-side protocols for `PhpArray` iteration and the float marker, which Story 9.5 must match, and the int/float strict gap -- gives the cross-Story contract an owner (lessons, epic 1/3).
- `stories/4.1.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml` -- status.

**Acceptance Criteria:**
- Given the four signed fixtures for `4.1.jsonl`, when XT-assert-1 decodes each `$v` and runs `phpLooseEquals`/`phpStrictEquals` over every ordered pair, then every result equals the Oracle's matrix entry, and a missing, unsigned or errored fixture fails the test.
- Given a `Symbol.for('xaravel.php.array')`-branded iterable of `[key, value]` pairs and objects exposing `[Symbol.for('xaravel.php.props')]()`, when compared with lists, plain objects and each other, then they compare as the PHP array or object they stand for (`==` ignores key order, `===` does not; objects `==` by class and props, `===` by identity), with no import from `@xaravel/runtime`.
- Given `@xaravel/assert`, when `checkGraph` runs and its `src/` imports are scanned, then there is no graded-package edge or import, and assigning to an exported function or its prototype throws `TypeError`.

## Spec Change Log

### 2026-10-18 — Amendment 1 (review pass 1, bad_spec)
- **Trigger:** the props fallback ("else own enumerable string keys") makes any two `Date`s, `Map`s or `Set`s `==` (`phpLooseEquals(new Date(0), new Date(1))` is true): a false pass in the grader, which AD-9 exists to prevent.
- **Amended:** Design Notes, Semantics: built-ins with internal state are `==` only to themselves; the props method must return a PHP array; the branded-map key rules; number vs bigint; array holes; `symbol`. Added "More truth-table rows" and narrowed Out of scope.
- **Known-bad state avoided:** `assertEquals` accepting unequal dates or maps; silent `[]` props from a broken protocol; collapsed or stringified branded keys; a crash on sparse arrays; int-vs-float beyond 2^53 compared exactly.
- **KEEP:** the four-request design (operands and matrices both from the Oracle); `oracle-values.ts`' decoder and its own Ed25519 check against `oracle.pub` (failing, never skipping, on a missing fixture); the `Comparison` class with the left-side recursion guard; NUMERIC/INTEGER_STRING regexes; `nonNumericForm` (`INF`/`-INF` only); index.ts freezing; ESC-4.1-1; XT-assert-1..3 structure and every existing XT-assert-2/3 assertion. The previous attempt is saved at `/tmp/xt41-attempt-1.patch` for reference.
- **Also carry (patch findings from pass 1):** in XT-assert-2, add bigint assertions (`1n === 1`, `1n == "1"`, `0n == false`, `2n**60n == "1152921504606846976"`) and props-less class assertions (`new A(1) == new A("1")` true, `new A(1) == new A(2)` false, `===` false for separate instances, `new Date(0) == new Date(1)` false, `new Map() == new Map()` false, a props method returning a non-array throws `TypeError`, a sparse list `[, 1]` equals `[null, 1]`); in ESC-4.1-1, give the float-marker work to a follow-up `assert` Story or an Infrastructure Story (a Story 9.5 PR may not edit `packages/assert/**` or `4.1.jsonl`).

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 41 findings — high 0, medium 4, low 22, false 15, maybe-false 0
- findings:
  - `[false]` `[reject]` IA1 Oracle agreement unproven until fixtures land — by design (intent: fail, never skip); the live run is the gate and the local unsigned cross-check found 0/7018 mismatches.
  - `[low]` `[reject]` IA2 the table checks the decoder's chosen forms — the decoder applies AD-9's list/plain-object/branded rule exactly; the runtime contract is ESC-4.1-1.
  - `[medium]` `[bad_spec]` IA3 the props fallback goes beyond AD-9 — same root as EC4; amendment 1 limits the fallback.
  - `[false]` `[reject]` IA4 `1 === 1.0` true — intent matrix row 2 excludes it explicitly; disclosed and escalated.
  - `[low]` `[reject]` IA5 namespace assignment is vacuous — harmless; the `fn.call`/`fn.prototype` assertions test the freeze.
  - `[false]` `[reject]` IA6 tests import `src/index` — that file is `exports["."]`.
  - `[false]` `[reject]` IA7 graph check plus own import scan — the scan adds to the AC, it does not replace it.
  - `[false]` `[reject]` IA8 matrix rows covered only inside Oracle matrices — that is AD-15's requirement.
  - `[false]` `[reject]` IA9 spec/status/manifest edits outside Story paths — the MAINT amendment (2) allows `_bmad-output/implementation-artifacts/` and any path for Epics 1–8.
  - `[low]` `[patch]` VG1 bigint paths untested — carried into amendment 1 (rows and XT-assert-2 assertions).
  - `[medium]` `[patch]` VG2 props-less fallback untested — carried into amendment 1 (XT-assert-2 assertions).
  - `[false]` `[reject]` VG3 semantics pinned only by failing XT-assert-1 — by design; merge waits for the fixture commit and a green XT-assert-1.
  - `[false]` `[reject]` B1 `test_ids: []` — that field holds Upstream Test IDs; XT-assert-1..3 are in `xaravel_test_ids`.
  - `[false]` `[reject]` B2 statuses disagree — the spec is mid-review; all move to `done` at finalization.
  - `[low]` `[patch]` B3 ESC-4.1-1 has Story 9.5 edit `packages/assert` — carried into amendment 1.
  - `[false]` `[reject]` B4 the int/float gap has no DIV — DIV-9 (AD-9 int/float clause) covers it, and the intent excludes those rows.
  - `[low]` `[patch]` B5 bigint vs unsafe float compared exactly — carried into amendment 1 (Semantics) and checked by new Oracle rows.
  - `[low]` `[patch]` B6 big-int, overflow and whitespace rows missing — carried into amendment 1 ("More truth-table rows").
  - `[low]` `[reject]` B7 XT-assert-1 does not pin the pair count — a request-file change is reviewed and re-signed; the guard adds no grader strength.
  - `[low]` `[patch]` B8 a props method returning a non-object gives `[]` — same as EC3; carried into amendment 1 (`TypeError`).
  - `[low]` `[patch]` B9 `normaliseKey` maps `null`/bools to `"null"`/`"true"` — carried into amendment 1 (key rules).
  - `[low]` `[defer]` B10 mutable intrinsics can be patched by code under test — real, but the intent and AD-15 ask only for frozen exports and prototypes; deferred.
  - `[low]` `[reject]` B11a namespace assignment is vacuous — duplicate of IA5.
  - `[low]` `[reject]` B11b `scanImports` drops `import type` — a type-only import has no runtime edge; tsc would need the package as a dependency, which the manifest check rejects.
  - `[false]` `[reject]` B11c the mockery allowlist contradicts "no dependencies" — no contradiction: importing mockery would need a manifest edge, which fails the manifest assertion.
  - `[low]` `[reject]` B11d whole-repo graph check — it fails loudly on any graph break, which is acceptable for an AC about the graph.
  - `[false]` `[reject]` B12 `readSignedFixture` could pass wrongly — a drift in canonical form fails signature verification, so it fails loudly; `oracle:verify-fixtures` also runs in CI.
  - `[low]` `[reject]` B13 the Code Map is stale — fixing it means editing this build's spec.
  - `[low]` `[patch]` B14 `phpLooseEquals(s, s)` false for a symbol — carried into amendment 1.
  - `[low]` `[patch]` EC1 a sparse array crashes — carried into amendment 1 (holes read as `null`).
  - `[low]` `[reject]` EC2 a plain object with integer-like keys — AD-9 forbids that form; a guard adds a branch for an input the model excludes.
  - `[low]` `[patch]` EC3 a props method returning a Map gives `[]` — grouped with B8.
  - `[medium]` `[bad_spec]` EC4 `Date`/`Map` instances compare `==` — verified (`new Date(0)` vs `new Date(1)` is true); amendment 1.
  - `[low]` `[patch]` EC5 a branded value yielding non-pairs gives the key `"undefined"` — grouped with B9 (`TypeError`).
  - `[low]` `[patch]` EC6 bigint keys beyond the safe range collapse — grouped with B9.
  - `[low]` `[patch]` EC7 duplicate normalised keys in a branded map — grouped with B9 (`TypeError`).
  - `[low]` `[defer]` EC8 intrinsics patchable — grouped with B10.
  - `[false]` `[reject]` EC9 a stale `sha256` in a request — `oracle:story check` and `oracle:verify-fixtures` reject a wrong `sha256`.
  - `[medium]` `[bad_spec]` EC10 built-ins without own keys compare `==` — grouped with EC4.
  - `[false]` `[reject]` S1 (blind floor) spec `oversized` warning unexplained — the warning is the template's machine flag for length.
  - `[false]` `[reject]` S2 sprint-status comment lost — the MAINT decision is linked from the spec and the PR.

### 2026-10-18 — Review pass 2
- verdicts: 43 findings — high 0, medium 5, low 25, false 13, maybe-false 0
- findings:
  - `[false]` `[reject]` IA1 Oracle agreement shown only by an uncommitted local check — carried (IA1): by design, merge waits for the fixture commit and a green XT-assert-1; local cross-check 0/9951.
  - `[low]` `[reject]` IA2 the table measures the test's own AD-9 encoding — carried (IA2).
  - `[false]` `[reject]` IA3 `phpStrictEquals(1, 1.0)` true — carried (IA4).
  - `[low]` `[reject]` IA4 namespace assignment proves nothing — carried (IA5).
  - `[false]` `[reject]` IA5 XT-assert-3 runs `graph.ts`, not `bun run graph:check` — same script (`package.json` `graph:check`).
  - `[false]` `[reject]` IA6 scope beyond the intent (ESC, spec, status, extra rows) — allowed paths and the review's own amendments.
  - `[false]` `[reject]` IA7 `0 == "a"` only as `0 == "abc"` — `"a"` is in request 3 with `0`.
  - `[false]` `[reject]` VG1 scalar rules checked only by red XT-assert-1 — by design; the live fixture run is the gate.
  - `[medium]` `[patch]` VG2 most built-in brand checks unexercised — XT-assert-2 assertions added for WeakMap, boxed Number, Promise, ArrayBuffer, URL, Headers.
  - `[low]` `[patch]` VG3 object recursion guard untested — cyclic-object assertion added.
  - `[low]` `[reject]` VG4 namespace assignment vacuous — carried (IA5).
  - `[medium]` `[patch]` B1 URL, Headers, Blob, FinalizationRegistry compare `==` — verified by the reviewer's run; replaced the probe list with one native-prototype rule cached per prototype.
  - `[low]` `[patch]` B2 `#private`-only classes compare `==` — the fallback cannot see `#` fields; ESC-4.1-1 now requires such classes to expose the props protocol.
  - `[medium]` `[patch]` B3 object vs number returns false, PHP 8.5 true for 1 — Design Notes said false; corrected the note; code compares the number with 1; Oracle rows added (`0`, `1`, `2`, `1.5` in the objects request).
  - `[low]` `[reject]` B4 `Date == Date` with equal times is false — a loud false failure, not a false pass; framework dates (Carbon) expose the props protocol.
  - `[low]` `[patch]` B5 overflow branches never meet a matching operand — added `"9223372036854775809"`, `"-9223372036854775809"`, `"-9223372036854775810"`.
  - `[low]` `[reject]` B6 non-public props not testable — the decoder fails loudly on them, and no request has them.
  - `[low]` `[reject]` B7 a missing intrinsic breaks module load — the toolchain is pinned to Bun 1.4.3, which has them; the native-prototype rule also drops most of them.
  - `[low]` `[patch]` B8 `isBuiltIn` throws 14 exceptions per object — replaced with the cached rule (B1).
  - `[low]` `[reject]` B9 Array subclasses read as plain lists — AD-9: a PHP list is a JS Array; extra props are outside the model.
  - `[low]` `[patch]` B10a XT-assert-3 spawns `bun` from PATH — now `process.execPath`.
  - `[false]` `[reject]` B10b `graph.ts` instead of `bun run graph:check` — same script.
  - `[low]` `[reject]` B10c exact empty stderr — the graph tool writes nothing to stderr on success; a warning there is worth a failure.
  - `[low]` `[reject]` B11 the spec names `/tmp` paths — fixing it means editing this build's spec.
  - `[low]` `[reject]` B12 the Code Map is stale — carried (B13).
  - `[low]` `[patch]` B13 ESC-4.1-1 built-in list does not match the code — it now states the rule.
  - `[low]` `[reject]` B14 AD-3 layout — AD-3 maps Upstream classes; the grader has no Upstream counterpart.
  - `[medium]` `[patch]` EC1 object vs int/float — same root as B3.
  - `[low]` `[reject]` EC2 plain object with int-like keys — carried (EC2).
  - `[low]` `[reject]` EC3 ~20k-deep nesting gives RangeError — fails loudly; PHP itself has a nesting limit.
  - `[low]` `[reject]` EC4 a sparse array with a huge length — the AD-9 model has no such PHP value; a guard adds a branch.
  - `[low]` `[reject]` EC5 branded value without or with an infinite iterator — carried (EC5): the first fails loudly; the second is a broken protocol.
  - `[low]` `[reject]` EC6 bigint outside PHP's int range compared as an int — not a PHP value; AD-9 normalisation never produces one.
  - `[low]` `[reject]` EC7 cross-realm plain objects — no realm crossing in the harness.
  - `[low]` `[reject]` EC8 `resultValue` on a null result — signed fixtures have a fixed shape; the TypeError still fails the test.
  - `[low]` `[reject]` EC9 a request without matrices checks 0 pairs — the request file is reviewed and every request carries matrices.
  - `[false]` `[reject]` EC10 AC1 not yet shown — carried (IA1).
  - `[medium]` `[patch]` EC11 object vs number (claim) — grouped with B3.
  - `[false]` `[reject]` IA8 the branded row tested only on the test's own double — carried (IA2's reasoning); the runtime side is ESC-4.1-1.
  - `[false]` `[reject]` IA9 the freeze covers E1 only — the intent names exports and prototypes; intrinsics deferred.
  - `[false]` `[reject]` IA10 expect from bun:test — the spec allows it until Story 4.2; AGENTS.md bans it in Ported Tests only.
  - `[false]` `[reject]` IA11 object detection goes beyond B2 — amendment 1 decided it.
  - `[false]` `[reject]` IA12 D2 reading — matches intent row 2.

### 2026-10-18 — Follow-up review pass
Scoped to the Story's squash commit (`aeae45d`, excluding `_bmad-output/`), because `followup_review_recommended` was `true` (retro epic-4 item 6, finding S5). Findings were verified against `main` at `9cced98`, which includes retro items 1–5 (#126, #134, #135, #136, #132) and Stories 4.2–4.6. All four layers ran as parallel subagents.
- verdicts: 27 findings — high 0, medium 8, low 16, false 3, maybe-false 0
- findings:
  - Blind Hunter
    - `[low]` `[reject]` A plain object with integer-like keys reads in JS index order under `===`. — carried (EC2): AD-9 forbids that form, and a guard adds a branch.
    - `[medium]` `[defer]` The built-in check runs before the props protocol, so an Error/EventTarget/Map subclass can never opt in, and `exception == 1` is false. — Verified with a probe (both false; PHP true for both). The rule is in the approved ESC-4.1-1 contract, so it needs a Maintainer ruling. Recorded in `deferred` (Maintainer, retro epic-4 item 7).
    - `[medium]` `[defer]` No `__toString` handling; an object never `==` a string. — Verified with a probe (false; PHP true). The Design Notes' Out of scope excludes it but the intent does not, so it needs a Maintainer decision. Recorded in `deferred` (Maintainer, retro epic-4 item 8).
    - `[low]` `[reject]` Closures are not PHP objects (`fn() => 1 == 1`, closure-vs-closure equality). — Rare in tests, PHP warns on the cast, and JS cannot tell PHP's same-function-and-scope rule apart; Story 4.3's ClosureComparator owns assertEquals on closures. A fix adds branches.
    - `[medium]` `[defer]` No model for uncomparable objects such as enum cases. — Same root as the Edge Case Hunter row; recorded in `deferred` (Maintainer, retro epic-4 item 8).
    - `[low]` `[defer]` The tamper-proofing comment claims more than the freeze does; intrinsics are called live. — carried (B10/EC8): the existing deferred item. Not deferred again.
    - `[low]` `[reject]` The Oracle checks only the decoder's one form of each value. — carried (IA2).
    - `[low]` `[reject]` No nested-object or recursive Oracle rows. — Request 4 has nested stdClass values. A recursive PHP value cannot be encoded in a fixture, and XT-assert-2 asserts the recursion error. New rows need a live re-signing run.
    - `[low]` `[reject]` ESC-4.1-1 cites bare DIV-9, and `decodeFloat` drops float-ness. — `decisions/ESC-4.1-1.md` ruled the interim state. The missing owner for `1 === 1.0` is retro finding S4, which item 8 takes.
    - `[low]` `[reject]` Same-class checks use prototype identity, not `fqcn()`. — AD-10's registry is in `@xaravel/runtime`, which the grader may not import. `PhpValues.sameClass` (Story 4.3) uses the same rule, so the layers agree. No path that loads a class twice was shown.
  - Edge Case Hunter
    - `[medium]` `[defer]` A built-in subclass with the props protocol is `==` only to itself. — Grouped with the Blind Hunter built-in row; same `deferred` item.
    - `[medium]` `[defer]` An Error-subclass object `== 1` is false. — Grouped with the same row.
    - `[medium]` `[defer]` An enum case `== 1` and `== true` are true; PHP says false. — Recorded in `deferred` (Maintainer, retro epic-4 item 8): it needs a protocol extension, and no enum form exists in AD-9 yet.
    - `[medium]` `[defer]` A Stringable `==` string is false. — Grouped with the Blind Hunter `__toString` row.
    - `[low]` `[reject]` Plain objects with int-like keys in non-ascending order. — carried (EC2).
    - `[low]` `[reject]` A Proxy or bound constructor, or a cross-realm plain object, misclassifies the value. — carried (EC7): there is no realm crossing in the harness. A Proxy class constructor is not a form AD-9 produces.
    - `[low]` `[reject]` A very sparse array allocates its whole length. — carried (EC4, pass 2).
    - `[low]` `[reject]` Lazy containers that return fresh children recurse to RangeError. — carried (EC3, pass 2): it fails loudly.
    - `[low]` `[reject]` A bigint outside PHP's int range is compared silently. — carried (EC6, pass 2).
    - `[medium]` `[defer]` (claim) AC 2's "objects `==` by class and props" fails for props-exposing built-in subclasses. — Grouped with the built-in row.
  - Verification Gap
    - `[low]` `[patch]` Nothing pins `===` false between a bigint int and an unsafe float of equal value. The reviewer showed that a `numbersIdentical` → `numbersEqual` mutation passes. — Added four XT-assert-2 assertions: `9007199254740993n == 9007199254740992` is true, `===` is false both ways round, and `9223372036854775807n === 9223372036854775808` is false.
  - Intent Alignment
    - `[low]` `[reject]` The branded/props truth table runs on the decoder's representations, not runtime values. — carried (IA2); the runtime side is ESC-4.1-1, now ruled.
    - `[false]` `[reject]` XT-assert-2 hand-writes PHP equality claims. — The intent's fixture-only rule governs the XT-assert-1 truth table, as the auditor itself notes. XT-assert-2 tests the brand and protocol rules that have no PHP form.
    - `[false]` `[reject]` `1 === 1.0` is true and there is no strict integral-float matrix. — carried (IA4): intent row 2 excludes it.
    - `[low]` `[reject]` Assigning to the namespace is vacuous. — carried (IA5).
    - `[low]` `[defer]` Intrinsics and the internal `Comparison` class are not frozen. — carried (B10): the existing deferred item.
    - `[false]` `[reject]` The Story was marked done while ESC-4.1-1 was open. — ESC-4.1-1 has since been ruled (`decisions/ESC-4.1-1.md`, approved option 1).

## Design Notes

**Unblocked.** The first attempt blocked here because signed fixtures need the `xaravel-oracle` App. `decisions/MAINT-2026-10-18-oracle-app.md` records the setup; this Story's PR is the supervised first `oracle.yml#story` run. Agent-run steps: requests, code, tests, local unsigned cross-check. Live step (App): the fixture commit on the PR. If that run fails, the Story blocks with the run's error and item 7 stays with the Maintainer. Until the fixtures land, XT-assert-1 fails (never skips).

**Requests (one Test ID, four requests).** Each is `php-expr`, `bindings: {}`, `setup` ending in `$v = [ … ];`, and `exprs` = `$v`, then `array_map(fn ($a) => array_map(fn ($b) => $a == $b, $v), $v)`, then the same with `===`. The Oracle encodes both the operands and the results, so no expected value or operand is typed in TS.
1. Scalars: null, bools, ints, non-integral floats, `INF`, `-INF`, `NAN`, and strings (`""`, `" "`, `"0"`, `"01"`, `"+1"`, `"1.0"`, `".5"`, `"1e1"`, `"1e2"`, `" 1"`, `"1 "`, `"-0"`, `"0x1A"`, `"abc"`/`"ABC"`, `"1abc"`, `"INF"`, `"NAN"`, `"null"`). Loose and strict.
2. Integral floats (`0.0`, `-0.0`, `1.0`, `-1.0`, `100.0`) with ints and strings. **Loose only** (no `===` expr): AD-9 makes int and float both `number` and the float marker does not exist yet (Story 9.5), so `1 === 1.0` is out of model (intent matrix row 2). ESC-4.1-1 asks who adds it.
3. Arrays: lists, maps, key order (`[1 => "a", 0 => "b"]` vs `["b", "a"]`, `["a" => 1, "b" => 2]` vs reversed), sparse int keys, nesting, and scalars to compare against. Loose and strict.
4. Objects: `(object) [...]` stdClass values (equal props, `"1"` vs `1`, prop order, nested) and a class declared in `setup` (`final class XtAssertPoint { public $x; … }`), plus null, bools, `[]`, `["x" => 1]`. No object is listed twice, since decoding cannot keep PHP identity. No object-vs-number pair (PHP warns and casts to 1). Loose and strict.

Prototype check (2026-10-18): all four pass `oracle:story check`, and the local evaluator returns `error: null` and no `throws`.

**Decoding (test-side).** `{"int"}` → `number` (`bigint` beyond safe range); `{"float"}` → `number` (`INF`, `-INF`, `NAN`, `-0.0`); `{"array"}` → a JS `Array` when keys are `0..n-1` in order, a plain object when every key is a string, else a branded map (AD-9); `{"object"}` → an instance of one TS class per PHP class name, whose `[Symbol.for('xaravel.php.props')]()` returns the public props as a map.

**Semantics (PHP 8).**
- `===`: same PHP type and value. A `number` and a `bigint` both count as int. Arrays: same pairs in the same order, values `===`. The three array forms are one type. Objects: identity. `NaN` never equals.
- `==`: null or bool on either side → both to bool, except null vs string → `"" == s` as strings. Number vs number: numeric. Number vs string: numeric if the string is numeric (PHP 8: optional leading and trailing whitespace, sign, digits, `.`, exponent; no hex); else compare the number's PHP string form (only `INF` and `-INF` can match; the Oracle gives `NAN == "NAN"` false). String vs string: numeric if both numeric, else byte-equal. Arrays: same count, every key present with `==` values, any order. Array vs other non-null/bool: false. Objects: same prototype and props `==`; a different class is false; object vs string or array is false; object vs number compares the number with 1, as PHP casts the object (review pass 2).
- Props: `[Symbol.for('xaravel.php.props')]()` when present; it must return a PHP array (any of the three forms), else `TypeError`. Without the protocol, an ordinary class instance's props are its own enumerable string keys. A JS built-in with internal state (`Date`, `Map`, `Set`, `WeakMap`, `WeakSet`, `RegExp`, `Promise`, `ArrayBuffer` and its views, boxed primitives, `Error`) has no PHP props form: it is `==` only to itself (detect by the intrinsic's own brand check, e.g. `Object.prototype.toString` tag or `instanceof` captured at load, never `constructor.name`).
- Branded map read protocol: `[Symbol.iterator]()` yields `[key, value]` pairs in insertion order, keys already normalised (ESC-4.1-1). A key must be a `number`, `bigint` or `string` (a canonical int-like string becomes an int; a `bigint` within the safe range becomes a `number`, otherwise stays `bigint`); any other key, a non-pair item, or two items with one normalised key throws `TypeError`.
- Number vs bigint: exact when the `number` is a safe integer; otherwise the `number` is a float (AD-9 keeps unsafe ints as `bigint`), so compare as PHP does int vs float, as doubles (`Number(big) === num`).
- A JS `Array` with holes reads each hole as `null` (never a destructuring crash).
- A recursive structure throws `Error('Nesting level too deep - recursive dependency?')`, as PHP's fatal does. `undefined` and `symbol` (not PHP values, AD-9) equal only themselves (`Object.is`), under both operators.

**More truth-table rows (amendment 1).** Request 1 also holds ints beyond 2^53 (`9007199254740993`, `PHP_INT_MAX`, `PHP_INT_MIN`) and strings `"9007199254740993"`, `"9223372036854775807"`, `"9223372036854775808"`, `"\t1"`, `"1\n"`, `"\v1"`, `"1."`, `"-.5e-3"`, `"1e400"`, `"1e500"`, `"-1e400"`. Request 2 (loose only) also holds `9007199254740992.0`, `9.2233720368547758E18`, `9007199254740993`, `PHP_INT_MAX`, `"9007199254740993"`. Where the Oracle disagrees with these notes, follow the Oracle and correct the note. The fixtures do not exist yet, so the request file may still change freely.

**Out of scope.** `__toString` objects, PHPUnit's Comparator rules (Story 4.3), plain objects with integer-like keys (AD-9 forbids them), freezing JS intrinsics (deferred).

## Verification

**Commands:**
- `bun run oracle:story check 4.1` -- expected: 4 accepted.
- `bun test packages/assert` -- expected: XT-assert-2/3 pass; XT-assert-1 passes once the App commits fixtures, and fails before.
- `bun run graph:check`, `bun run typecheck`, `bun run lint`, `bun run escalations:check` -- expected: clean.
- `bun run oracle:verify-fixtures` -- expected: pass after the fixture commit.
- Dev cross-check: run the implementation against the local evaluator's unsigned outputs -- expected: zero mismatches (never committed).

## Auto Run Result

Status: done (pending the live fixture run; see Residual risks)

**Summary.** `@xaravel/assert` now implements PHP 8.5 `==` (`phpLooseEquals`) and `===` (`phpStrictEquals`) over the AD-9 value model: the three PHP array forms (list, plain object, `Symbol.for('xaravel.php.array')`-branded iterable of normalised `[key, value]` pairs), objects via `[Symbol.for('xaravel.php.props')]()` or own enumerable keys, and JS built-ins (native-prototype rule) `==` only to themselves. Exports and their prototypes are frozen on load. Four XT-assert-1 truth-table requests have both operands and results evaluated by the Oracle.

**Files.**
- `conformance/oracle-requests/4.1.jsonl` -- four `php-expr` requests (scalars; integral floats, `==` only; arrays; objects), generated with `makeRequest` + `renderRequests`.
- `packages/assert/src/comparison/PhpComparison.ts` -- the comparison core.
- `packages/assert/src/index.ts` -- named exports, frozen.
- `packages/assert/tests/xaravel/comparison.test.ts` -- XT-assert-1..3.
- `packages/assert/tests/xaravel/oracle-values.ts` -- test-side fixture reader: Ed25519 check against `oracle.pub`, value decoder, matrix comparison.
- `conformance/escalations/ESC-4.1-1.md` -- open question: the PhpArray, props and float-marker protocols Story 9.5 must match, and who closes the int/float `===` gap.
- `stories/4.1.md`, `sprint-status.yaml` -- status.

**Review.** Two passes (one bad_spec loopback, amendment 1).
- Pass 1: 41 findings (4 medium, 22 low, 15 false). The bad_spec was built-ins comparing `==`. The patches (bigint, holes, key/props protocol violations, symbol, int-vs-float beyond 2^53, extra rows, ESC owner) were carried into amendment 1. Deferred: freezing intrinsics.
- Pass 2: 43 findings (5 medium, 25 low, 13 false). Patched:
  - object vs number (PHP casts the object to 1; the Oracle confirmed it with 28 mismatches before the fix);
  - the native-prototype built-in rule, cached (covers URL, Headers, Blob and the rest, and drops the 14 try/catch probes);
  - the remaining built-in and object-recursion assertions;
  - negative and same-side overflow rows;
  - `process.execPath`;
  - ESC-4.1-1 wording.
- Every rejected finding and its reason is in the Review Triage Log.
- Patched by verdict in pass 2: medium 3 entries, low 5 entries.

**Follow-up review recommended: true.** Pass 2 patched three medium entries, and no fresh review has seen them. The specific unverified risks:
- the native-prototype rule: a class extending a platform class (`EventTarget`) is now `==` only to itself;
- the object-vs-number cast.

**Verification.**
- `oracle:story check 4.1`: 4 accepted.
- `bun test`: 130 pass, 1 fail. The one failure is XT-assert-1: "missing signed fixture" ×4.
- `graph:check`, `typecheck`, `lint`, `escalations:check`, `oracle:verify-fixtures` (1834) and `ownership:check`: clean.
- Local unsigned cross-check against PHP 8.5.11 (`/tmp/xaravel-inv/framework`): 0 mismatches over 10965 ordered pairs. Not committed.
- The test's signature check accepts tool-signed fixtures and rejects tampered ones (throwaway key, not committed).

**Residual risks.**
- XT-assert-1 stays red until `oracle.yml#story` (the xaravel-oracle App) commits the four signed fixtures to the PR. That first live run is the merge gate. If it fails, the Story becomes `blocked` with the run's error.
- `1 === 1.0` is true (ESC-4.1-1).
- Intrinsics can still be patched (deferred).
- `#private`-only classes need the props protocol (ESC-4.1-1).

### Follow-up review (2026-10-18)

This pass ran for retro epic-4 item 6 (finding S5). It was scoped to `aeae45d` and verified against `main` at `9cced98`. There were 27 findings: 8 medium, 16 low, 3 false.
- **Patched (low 1).** `packages/assert/tests/xaravel/comparison.test.ts`: XT-assert-2 now pins `===` false between a bigint int and an unsafe float of equal value. A reviewer had shown that this mutation passed the tests.
- **Deferred to the Maintainer (3 entries, all medium).** Each needs a ruling and is not an agent patch:
  - Built-in subclasses (`extends Error`) with the props protocol are `==` only to themselves, and are not cast to 1 against a number. This is the approved ESC-4.1-1 rule, and it disagrees with Story 4.3's ObjectComparator and Exporter. Target: retro epic-4 item 7.
  - A Stringable object `==` a string is always false. Target: retro epic-4 item 8.
  - There is no uncomparable-object (enum) protocol. Target: retro epic-4 item 8.
- **Rejected.** The rest, with reasons in the Review Triage Log. Most are carried from passes 1 and 2.
- **Prior risks retired.** The first pass's object-vs-number cast is now confirmed by the signed objects fixture (XT-assert-1 green). The native-prototype risk is not fixed: it is restated as the first deferred item, which waits on a Maintainer ruling.
- **Follow-up review recommendation: false.** No high was patched (patched: high 0, medium 0, low 1), so the work has converged.
- **Verification.** `bun test`: 154 pass, 0 fail. `typecheck`, `lint` and `graph:check` (53 packages) exit 0. `assert:coverage` exits 0 (67 implemented, 15 pending, 0 missing). `mockery:coverage` exits 0 (42 implemented, 3 pending, 0 missing).
