---
test_ids:
  - XT-assert-1
  - XT-assert-2
trigger: open-question
proposed: >-
  Make the grader-side protocols of Story 4.1 the contract that Story 9.5
  (`@xaravel/runtime`'s `PhpArray` and float marker) must match, and give the
  int/float strict gap an owner. (1) PhpArray read protocol. A PHP array that
  is neither a list nor an all-string-key plain object carries the property
  `Symbol.for('xaravel.php.array')` (own or inherited, any value), and its
  `[Symbol.iterator]()` yields `[key, value]` pairs in insertion order, with
  keys already normalised as PHP stores them: an int key is a safe-integer
  `number`, or a `bigint` beyond the safe range (within PHP's int range); a
  string key is a `string`, and a canonical int-like string is read as an
  int. Any other key, an item that is not a two-element array, or two items
  with one normalised key makes the grader throw `TypeError`. The grader reads
  it only through that iterator. (2) Object props protocol. A PHP object
  exposes `[Symbol.for('xaravel.php.props')]()` returning its properties as a
  PHP array in any of the three forms; any other return value makes the grader
  throw `TypeError`. Without the method, an ordinary class instance's own
  enumerable string keys are its properties, so a class that keeps its state
  only in `#private` fields must expose the method (the fallback cannot see
  them). An object whose prototype chain, below `Object.prototype`, holds a
  prototype whose own `constructor` is a native function (by
  `Function.prototype.toString`, ending in `{ [native code] }`; for example
  `Date`, `Map`, `URL`, `Headers`) is a JS built-in with no props form and is
  `==` only to itself. A PHP object compared `==` with a number is cast to 1,
  as PHP does with a warning. (3) Float marker. Story 9.5 defines how a float
  that holds an integral value is marked. Because a Story 9.5 PR may edit
  neither `packages/assert/**` nor `conformance/oracle-requests/4.1.jsonl`,
  a follow-up `assert` Story (or a Maintainer-approved Infrastructure Story)
  then amends `phpStrictEquals` so `1 === 1.0` is false and `1.0 === 1.0` is
  true, and adds a `===` matrix for integral floats to the 4.1 requests (today
  loose only). Until then the grader treats int and float as one type for
  `===` (DIV-9).
evidence: >-
  AD-9 makes PHP int and float both JS `number`, so `1 === 1.0` (false in
  PHP 8.5) cannot be told apart from `1 === 1` (true); the spec of Story 4.1
  (_bmad-output/implementation-artifacts/spec-4-1-php-comparison-core.md,
  I/O matrix row 2) leaves those cases out of the requests, and the
  integral-float request has only the `==` matrix. The grader cannot import
  `@xaravel/runtime` (AD-2, epic 4 context: Grader isolation), so it detects
  `PhpArray` by brand and reads it by a protocol that no runtime Story owns
  yet. If Story 9.5 builds `PhpArray` or the float marker differently (for
  example a `.entries()` method, string keys for int-like keys, or a boxed
  float), assertSame and assertEquals silently compare the wrong thing.
---

# ESC-4.1-1: the grader-side PhpArray and float protocols, and the int/float `===` gap

Story 4.1's comparison core reads PHP arrays and objects without importing `@xaravel/runtime`:

- **`PhpArray`.** It is detected by the brand `Symbol.for('xaravel.php.array')` and read only through `[Symbol.iterator]()`, which yields `[key, value]` pairs in insertion order with keys already normalised (an int is a safe `number` or a `bigint`; a string stays a string unless it is canonical int-like). A bad key, a non-pair item or a repeated key throws `TypeError`.
- **Objects.** Their properties come from `[Symbol.for('xaravel.php.props')]()` when present, which must return a PHP array (else `TypeError`); without it, from own enumerable string keys, so a class that keeps its state only in `#private` fields must expose the method. An object with a native-constructor prototype on its chain below `Object.prototype` (`Date`, `Map`, `URL`, `Headers`, …) is a JS built-in with no props form and is `==` only to itself.
- **int and float.** Both are JS `number` (AD-9), so `phpStrictEquals(1, 1.0)` is `true`, where PHP says `false`. The truth table therefore has no `===` matrix for integral floats.

Story 9.5 builds `PhpArray` and the float marker but does not own these protocols, and a Story 9.5 PR may not edit `packages/assert/**` or `conformance/oracle-requests/4.1.jsonl`. Who fixes the contract, and who closes the `===` gap?

The options:

1. **Adopt the protocols as `proposed` (proposed).** Story 9.5 builds `PhpArray` to the iterator protocol and adds the float marker. A follow-up `assert` Story, or a Maintainer-approved Infrastructure Story, then extends `phpStrictEquals` and the 4.1 requests with a `===` matrix for integral floats.
2. **Move the protocols into a shared contract module that both sides import.** That breaks grader isolation (AD-2): the grader would import graded code.
3. **Accept the gap permanently as a divergence.** `assertSame(1, 1.0)` would pass where PHPUnit fails. That needs a new DIV clause, and it weakens the grader.
