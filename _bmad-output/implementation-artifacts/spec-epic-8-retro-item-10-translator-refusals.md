---
title: 'Translator refuses literal operands whose PHP result differs from JavaScript (epic-8-retro-item-10)'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
baseline_revision: 'bee95764b5fe88f684bb8b1c30462c1f1c1be39f'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/PORTING.md'
  - '{project-root}/docs/ops/porting.md'
warnings: []
deferred:
  - summary: >-
      Array literals under `+` (PHP array union) translate to JS `+`, which coerces to strings.
    evidence: |-
      `[1] + [2]` translates to `[1] + [2]` (JS "12"); behaviour predates this change. PORTING.md now lists it as checked by hand.
    location: >-
      tools/porting/translate.ts refuseOperands
    severity: low
  - summary: >-
      `/` or `%` by a literal zero is not refused (PHP 8 throws DivisionByZeroError; JS gives Infinity or NaN).
    evidence: |-
      `7 % 0` translates unchanged; behaviour predates this change.
    location: >-
      tools/porting/translate.ts refuseOperands
    severity: low
  - summary: >-
      Shifts and bitwise operators on integer literals beyond 32 bits are not refused (JS 32-bit, PHP 64-bit).
    evidence: |-
      `1 << 40` translates unchanged (JS 256, PHP 1099511627776); behaviour predates this change.
    location: >-
      tools/porting/translate.ts refuseOperands
    severity: low
  - summary: >-
      A `(float)` cast or other float-typed non-literal under `%` is not refused.
    evidence: |-
      `(float) $a % 2` translates to `toFloat(a) % 2`; behaviour predates this change.
    location: >-
      tools/porting/translate.ts refuseOperands
    severity: low
---

<intent-contract>

## Intent

**Problem:** `tools/porting/translate.ts` keeps arithmetic, bitwise and `< > <= >=` operators unchanged, so for literal operands it can see it emits code whose JavaScript result differs from PHP's: `"5" + "5"` → `'5' + '5'` (JS `'55'`, PHP `10`); `7.5 % 2` → JS `1.5` (PHP `1`); `1 < "a"` → JS `false` (PHP `true`). The file header promises "the rule's output or a failure, never a guess" (Epic 8 retro finding L6, action item `epic-8-retro-item-10-translator-refusals`).

**Approach:** In the parser's (or emitter's) binary-operator path, throw `UntranslatableExpression` naming the construct when an operand is visibly of a type that breaks the unchanged-operator rule, and record the refusals in PORTING.md's untranslatable list and in the XT-conformance-154 `REFUSED` cases.

## Boundaries & Constraints

**Always:**
- A *string operand* is a node that is a string in PHP by syntax alone: a string literal (`str`), an interpolated string (`interp`), a concatenation (`concat`), or a `(string)`/`(binary)` cast. A *number literal* is a `num` node, optionally under unary `-`/`+`. A *float literal* is a number literal whose `int` is `null`.
- Refusal rules (each throws `UntranslatableExpression` whose `construct` is exactly the text given):
  1. `+ - * / % ** & | ^ << >>` with a string operand on either side → construct ``string operand of `<op>` ``.
  2. `%` with a float literal on either side (and no string operand) → construct ``float operand of `%` ``.
  3. `< > <= >=` with a string operand on one side and a number literal, `true`/`false` or `null` on the other → construct ``comparison of a string with a non-string literal``.
  4. `< > <= >=` with string literals (`str`) on both sides whose values are both PHP-numeric strings (`is_numeric` semantics, PHP 8: optional leading whitespace, sign, digits with optional `.` and exponent, optional trailing whitespace) → construct ``comparison of two numeric strings``.
- Everything the rule translates today with no string operand or float `%` operand translates byte-for-byte as before (all existing RULES, fixture and Blade cases still pass).
- `==`, `!=`, `<>`, `<=>`, `===`, `!==`, `??`, `.` are unaffected (they already use PHP-semantics helpers or are type-strict).

**Never:**
- Never touch `packages/**`, `conformance/expectations/**`, `conformance/porting/expressions.jsonl` (stays at exactly 20 success entries), `tools/ownership/`, `tools/protected-paths/`.
- No type inference on variables or calls: `$a + 1`, `$a < 'x'`, `$a % 2` still translate unchanged (PORTING.md's existing by-hand paragraph covers them).
- No new emitted helpers; this change only adds refusals.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected | Error Handling |
|---|---|---|---|
| string + string | `"5" + "5"` | throws | construct ``string operand of `+` `` |
| string * number | `'2' * 3` | throws | construct ``string operand of `*` `` |
| interp operand | `"$a" - 1` | throws | construct ``string operand of `-` `` |
| concat operand | `($a . 'x') + 1` | throws | construct ``string operand of `+` `` |
| cast operand | `(string) $a + 1` | throws | construct ``string operand of `+` `` |
| bitwise strings | `'a' \| 'b'` | throws | construct ``string operand of `\|` `` |
| float % | `7.5 % 2` | throws | construct ``float operand of `%` `` |
| float % right, negated | `7 % -2.5` | throws | construct ``float operand of `%` `` |
| int % | `7 % 2` | `7 % 2` | No error |
| mixed comparison | `1 < "a"` | throws | construct `comparison of a string with a non-string literal` |
| null vs string | `null < 'a'` | throws | same construct |
| numeric strings | `"10" < "9"` | throws | construct `comparison of two numeric strings` |
| non-numeric strings | `'a' < 'b'` | `'a' < 'b'` | No error |
| variable operands | `$a + 1`, `$a < 'x'`, `$a % 2` | unchanged | No error |
| float non-% | `7.5 + 2` | `7.5 + 2` | No error |

</intent-contract>

## Code Map

- `tools/porting/translate.ts:1-19` -- header promise; `UntranslatableExpression` at :24 (constructor `(construct, detail?)`).
- `tools/porting/translate.ts:42-71` -- `Node` union: `num {code,int}` (`int: null` = float literal), `str`, `interp`, `concat`, `cast {fn}` (`toPhpString` for `(string)`/`(binary)`), `unary {op,operand}`, `bool`, `null`, `binary {op,left,right}`.
- `tools/porting/translate.ts:350-362` -- parser builds `binary` nodes; `tools/porting/translate.ts:1186-1210` `emitBinary` -- either place works for the check; `emitBinary` already throws for unknown operators.
- `tools/porting/translate.ts:937-965` -- `number()`; float literals get `int: null` (integral floats emit `float(n)`).
- `conformance/tests/xaravel/porting.test.ts:500-547` -- XT-conformance-154 `REFUSED` list (`[php, construct]`); add the matrix's throwing rows there. Add the non-throwing rows (`7 % 2`, `'a' < 'b'`, `7.5 + 2`, `$a % 2`, `$a < 'x'`) to `RULES` at :434.
- `PORTING.md:150` -- `**Untranslatable.**` paragraph lists the translator's own refusals ("The translator also refuses, naming each: …"); add the four new refusals there. `PORTING.md:134` paragraph on operand types: amend to say the translator refuses the cases it can see by literal operands. PORTING.md is a Protected Path; Phase 0 MAINT ruling covers it.
- `docs/ops/porting.md` -- CLI/ops doc; update only if it enumerates refusals.

## Tasks & Acceptance

**Execution:**
- `tools/porting/translate.ts` -- add the four refusal rules in the binary-operator path with helpers `isStringOperand`, `isNumberLiteral`, `isFloatLiteral`, `isPhpNumericString`; mention them in the header comment -- fail closed per L6.
- `conformance/tests/xaravel/porting.test.ts` -- add matrix rows to `REFUSED` and `RULES` -- fixture cases.
- `PORTING.md` -- list the refusals in § Mechanical expression rule's Untranslatable paragraph and amend the operand-type paragraph -- doc matches tool (epic 8 lesson).

**Acceptance Criteria:**
- Given any matrix input, when `translateExpression` runs, then it returns the listed output or throws `UntranslatableExpression` with exactly the listed `construct`.
- Given the committed fixture and existing tests, when `bun test conformance/tests/xaravel/porting.test.ts` and `bun run porting:check` run, then both pass.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 31 findings — high 0, medium 6, low 15, false 10, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) mixed comparison untested with the string on the left, a boolean literal or a negative number — added REFUSED rows `'a' > 1`, `true < 'a'`, `-1 >= 'a'`, `'1' <= 2`.
  - `[medium]` `[patch]` (verification-gap) operator sets only partly tested (`/ ** & ^ << >> %` with a string, `> <= >=`) — added one REFUSED row per uncovered operator.
  - `[medium]` `[patch]` (verification-gap) `isPhpNumericString` tested by one input — added refused `'1e3' < '2'`, `' 1.5' > '-2'` and allowed `'10a' < '9'`, `'10' < 'abc'`.
  - `[low]` `[defer]` (verification-gap other) array literals under `+` not refused (`[1] + [2]` → JS `"12"`) — behaviour predates this change; PORTING.md now says only the listed cases are refused. Deferred.
  - `[low]` `[defer]` (edge-case) array-literal `+` — same root cause as the row above.
  - `[low]` `[defer]` (edge-case) `(float) $a % 2` / `(7.5 * 1) % 2` not refused — predates this change; non-literal float typing. Deferred.
  - `[low]` `[defer]` (edge-case) shifts by a literal of 32 or more (`1 << 40`) — predates this change (32-bit JS shifts). Deferred.
  - `[low]` `[defer]` (edge-case) `/` or `%` by a literal zero — predates this change (PHP DivisionByZeroError vs JS Infinity/NaN). Deferred.
  - `[low]` `[reject]` (edge-case) numeric-string comparison against a concatenation (`"10" < "9" . ''`) — no Upstream test writes this; covering it needs constant folding of concatenations.
  - `[low]` `[reject]` (edge-case) string vs array literal or `(int)` cast in a comparison — rare in Upstream tests; widening `nonString` to casts adds typing rules beyond the literal scope.
  - `[low]` `[reject]` (edge-case) `~'a'` unary not refused — predates the change and is not used in Upstream tests; needs a separate unary rule.
  - `[medium]` `[patch]` (edge-case claim) PORTING.md:134 implied every literal-visible case is refused — reworded to say only the listed cases are refused and the rest are checked by hand.
  - `[low]` `[reject]` (blind) bool/null vs number comparisons (`null < -1`) — predates this change; rare in Upstream tests and not a string/number case. PORTING.md now names it as checked by hand.
  - `[low]` `[defer]` (blind) shifts/bitwise beyond 32 bits — same as the edge-case shift row.
  - `[low]` `[defer]` (blind) array-literal `+` — same as the edge-case array row.
  - `[low]` `[defer]` (blind) division/modulo by literal zero — same as the edge-case zero row.
  - `[low]` `[reject]` (blind) unary `~`/`-` on a string — same as the edge-case `~` row.
  - `[low]` `[reject]` (blind) ternary/`??` branches that are all strings — unlikely as arithmetic operands in Upstream tests; it would need recursive typing.
  - `[medium]` `[patch]` (blind) REFUSED tests miss most operators and the numeric-string regex branches — same patch as the verification-gap rows.
  - `[medium]` `[patch]` (blind) RULES do not pin the non-refusal boundary — added `'10' < 'abc'`, `'10a' < '9'`, `1 < 2`.
  - `[low]` `[patch]` (blind) PORTING.md sentence inaccurate — same patch as the edge-case claim row.
  - `[false]` `[reject]` (blind) spec omits `conformance/tests/**` as a Protected Path — the fix would edit this build's spec; the MAINT ruling (`decisions/MAINT-2026-10-16-unattended-orchestrator.md`) and earlier retro-8 PRs cover Phase 0 Protected-Path edits on retro branches.
  - `[false]` `[reject]` (blind) docs/ops/porting.md not updated — its construct list is an open-ended example list ending in "…", and PORTING.md § Untranslatable is the enumerated list, so they do not drift.
  - `[false]` `[reject]` (blind) refusal messages give no remedy — no existing refusal passes a remedy `detail`; every message already points at PORTING.md § Mechanical expression rule, which gives the by-hand forms.
  - `[false]` `[reject]` (intent) rule 4 (two numeric strings) goes beyond the three named cases — it is a visible PHP/JS mismatch under the header promise the intent quotes, and refusing is fail-closed.
  - `[false]` `[reject]` (intent) bitwise, interpolation, concatenation, casts, bool/null beyond the literal wording — same: these are string operands by syntax, and refusing is fail-closed.
  - `[false]` `[reject]` (intent) `7.0 % 2` is over-refused — it emits `float(7) % 2`, a DIV-9 marker under `%`, which is not safe either; refusing is correct.
  - `[false]` `[reject]` (intent) `"7.5" % 2` is caught as a string operand — this is intended.
  - `[false]` `[reject]` (intent) "fixture cases" not in `expressions.jsonl` — that fixture holds exactly 20 successful translations (`FIXTURE_COUNT`) and cannot hold a refusal; refusals live in XT-conformance-154 `REFUSED`, as do all existing ones.
  - `[false]` `[reject]` (intent) the CLI path is not tested directly — XT-conformance-154 already asserts the CLI exits 1 on a refusal, and the CLI calls the same `translateExpression`.
  - `[false]` `[reject]` (intent) "never uses type information" wording in docs/ops — the rules read syntax only (node kinds), not types of variables or calls, so the wording stays true.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/porting.test.ts` -- expected: 0 fail
- `bun run porting:check` -- expected: exit 0
- `bun run typecheck` -- expected: exit 0
- `bun run lint` -- expected: exit 0
- `bun test` -- expected: 0 fail

## Auto Run Result

Status: done

- **Change:** `tools/porting/translate.ts` `refuseOperands` (called first in `emitBinary`) throws `UntranslatableExpression` for a string operand (literal, interpolation, concatenation, `(string)`/`(binary)` cast) under `+ - * / % ** & | ^ << >>`, a float literal under `%`, `< > <= >=` between a string operand and a number/bool/null literal, and `< > <= >=` between two PHP-numeric string literals.
- **Files:** `tools/porting/translate.ts` (refusals and header comment); `conformance/tests/xaravel/porting.test.ts` (XT-conformance-154: 25 REFUSED rows and 9 RULES rows added); `PORTING.md` (§ Mechanical expression rule operand paragraph and Untranslatable list).
- **Review:** 31 findings. Patched 6 medium and 1 low (test coverage of every operator, both comparison sides and the numeric-string regex; the PORTING.md sentence scoped to the listed cases). Deferred 4 low gaps the translator already had (frontmatter `deferred`). Rejected 10 false and 10 low, each with its reason in the triage log.
- **Follow-up review recommended:** false (no high patched; the medium patches were test rows and one doc sentence).
- **Verification:** `bun test conformance/tests/xaravel/porting.test.ts` 2 pass; `bun run porting:check` OK (20 fixture translations); `bun run typecheck` 0; `bun run lint` 0; `bun test` 289 pass, 0 fail.
- **Residual risk:** variable- and call-typed operands are still not refused (by design, no type inference); the deferred literal cases still translate unchanged and are checked by hand under PORTING.md.
