---
div: 9
title: "PHP value model"
cites: ["AD-9"]
sources: ["decisions/ESC-4.3-1.md", "decisions/ESC-4.4-2.md", "decisions/ESC-4.7-1.md", "decisions/MAINT-2026-10-23-throwable-file-line-trace.md"]
fewer_assertions: []
---

# DIV-9: PHP value model

## Rationale

PHP values map to TypeScript by fixed rules (AD-9), so that no Component chooses its own representation of null, arrays, integers and markers, and so that precision loss, key-order bugs and false passes in the grader cannot happen silently. Some differences follow from the JS value model itself and change only messages or closure equality; approved Escalation rulings record them here (ESC-4.3-1, ESC-4.4-2, ESC-4.7-1).

## Behaviour

- **Null.** `null` is the only PHP null, and `undefined` never escapes a public API.
- **Arrays.**
  - A PHP list is a JS `Array`.
  - A map whose keys are all non-integer-like strings is a plain object.
  - Any other PHP array is an ordered `PhpArray`, which keeps PHP key order and key normalisation.
  - Public APIs copy values, as PHP does, and by-reference parameters take a `Ref<T>` box.
- **Integers.** Database integers are read losslessly. A column is *hinted lossless* by an Eloquent `'bigint'` cast, by the query builder's `castsBigint(cols)`, or by the connection setting `integers: 'bigint'`. A hinted column always returns `bigint`. Any other integer column returns a `number` when the value is within ±`Number.MAX_SAFE_INTEGER` (2^53 − 1), and a larger value throws `IntegerOverflowException`, naming the column. JSON output writes a `bigint` as its exact digits.
- **int/float.** Both are JS `number`. The distinction is preserved where Laravel's behaviour depends on it, through the runtime's float marker.
- **Marker interfaces** become brands. `implements ShouldQueue` requires a brand getter, which generators emit, and the framework checks it with `hasBrand(classOrInstance, Token)` without instantiating the class.
- **PHP comparison.** An object that PHP compares with `==` exposes its compared properties through `[Symbol.for('xaravel.php.props')]()`, so the test matchers compare it as PHP does.
- **Throwables.** A throwable has PHP's `getFile()`, `getLine()`, `getTrace()`, `getTraceAsString()` and `__toString()`. Their values name the JavaScript call site (DIV-9.12). Their shape follows PHP, and so does every outcome that depends on them: a throwable as a string argument, and its equality.

## Adaptation clauses

`fewer_assertions` is empty, so no clause of this record waives the assertion floor (FR-113). Adding an item needs an approved Escalation (ESC-5.3-2, FR-113); an item is the quoted `<k>` of an existing clause, for example `["2"]`. Clauses are append-only: a new clause takes the next number, and an existing clause is never renumbered.

- **DIV-9.1** Null. PHP `null` in an Upstream test is `null` in the Ported Test; an expected `null` is never adapted to `undefined`.
- **DIV-9.2** Arrays. An Upstream array literal becomes a JS `Array` when it is a list, a plain object when all its keys are non-integer-like strings, and a `PhpArray` otherwise. A by-reference argument becomes a `Ref<T>` box, read back through its `value`. The expected values are otherwise unchanged.
- **DIV-9.3** Integers. An expected database integer outside ±`Number.MAX_SAFE_INTEGER`, or from a column hinted lossless, is written as a `bigint`. An expected silent precision loss becomes an expected `IntegerOverflowException`.
- **DIV-9.4** int/float. Where Upstream's assertion depends on the int/float distinction, the Ported Test carries the float with the runtime's float marker, marked with this clause.
- **DIV-9.5** Brands. An Upstream check that a class implements a marker interface becomes `hasBrand(classOrInstance, Token)`.
- **DIV-9.6** PHP comparison. An object compared with PHP `==` in an Upstream assertion is compared through its `[Symbol.for('xaravel.php.props')]()` properties by the `@xaravel/assert` matchers. The assertion is unchanged.
- **DIV-9.7** JS closure equality is accepted as a divergence. Two distinct JS functions are never `assertEquals`-equal, and PHPUnit's closure warning is dropped. A Ported Test whose outcome depends on it is not adapted silently: it raises an Escalation (FR-114) (ESC-4.3-1 item 9).
- **DIV-9.8** A JS `Error` going through `ExceptionComparator` is compared as it is until PHP's `\Error`/`\Exception` split exists. A Ported Test whose outcome depends on it is not adapted silently: it raises an Escalation (FR-114). Story 9.10 publishes the split and Story 9.11 makes the grader read it, which closes this clause; a closed clause stays in the record, never removed or renumbered, its text then says which Story closed it, and that Story removes the markers citing it (ESC-4.3-1 item 10). **Closed** by Stories 9.11 (`@xaravel/assert`: the grader's exceptions extend the runtime's SPL classes and `ExceptionComparator` takes only `\Exception`s) and 9.12 (`@xaravel/mockery`: Mockery's exceptions extend the runtime's SPL classes), as ESC-9.11-1 split them. No `adapted:DIV-9.8` marker was ever written, so none was removed. The clause stays for the record and is not renumbered.
- **DIV-9.9** The export of an exception lacks PHP's `string`, `file`, `line` and `trace`. This is a message-only difference. No Ported Test is adapted under this clause: Upstream's expected values and messages are kept; only the grader's own failure output differs (ESC-4.3-1 item 13).
- **DIV-9.10** The wrong-class message ends in JS stack frames, not PHP's. This is a message-only difference. No Ported Test is adapted under this clause: Upstream's expected values and messages are kept; only the grader's own failure output differs (ESC-4.4-2 item 3).
- **DIV-9.11** PHPUnit's test-double notices and deprecations (the no-expectations notice, the `any()` deprecation, `with()` without `expects()`) are an outcome-neutral, message-only difference. No Ported Test is adapted under this clause: Upstream's expected values and messages are kept; only the grader's own failure output differs (ESC-4.7-1 item 3).
- **DIV-9.12** A throwable's `getFile()`, `getLine()`, `getTrace()`, `getTraceAsString()` and `__toString()` name the JavaScript call site, not a PHP one. The file and line are those of the frame that constructed it, as the JS stack gives them, and the trace holds the frames above it, in PHP's shape and without `args`. The format, and every outcome that depends on these values, follow PHP: a throwable as a string argument, and equality through `ObjectComparator`. No Ported Test is adapted under this clause. An Upstream assertion on a specific file, line or trace text raises an Escalation (FR-114) (MAINT-2026-10-23-throwable-file-line-trace).
- **DIV-9.13** PHP callable strings and arrays to `when` / `unless`. Their `callback` and `default` accept a function, an object whose `__invoke` is a function, or `null`. A PHP callable string (`'strtoupper'`, `'Class::method'`) or callable array (`[$object, 'method']`, `[Class::class, 'method']`) throws PHP's `?callable` `TypeError`, where Upstream calls it. JavaScript has no functions addressed by name, and no shared resolver maps PHP callable names to runtime functions yet. A Ported Test that passes one adapts it to an arrow function, marked with this clause. A later Component that adds a shared resolver supersedes this clause through an Escalation (MAINT-2026-10-25-epic-12-items).
