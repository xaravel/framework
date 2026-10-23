---
test_ids:
  - XT-contracts-1
  - XT-contracts-2
  - XT-contracts-3
trigger: contract
proposed: >-
  Option 1 (recommended): keep the token an object (or function) whose
  `Symbol.hasInstance` reads the brand and whose `Symbol.toPrimitive` returns
  the brand symbol, and give it a `readonly brand` property typed as a
  per-contract `unique symbol`. The interface then requires
  `readonly [Arrayable.brand]: true`, and the generated brand is
  `get [Arrayable.brand]() { return true as const }`. The runtime key is still
  `Symbol.for('<Upstream FQCN>')`, so `hasBrand`, `jsonEncode` and the grader
  are unchanged, and `get [Arrayable]()` still works at runtime through
  `Symbol.toPrimitive`. This changes the wording of AD-1 (Contents), AD-9.5,
  DIV-9.5, the Epic 10 context and the first two Story 10.1 acceptance
  criteria in `epics.md` from `[Token]` to `[Token.brand]`. Option 2: keep
  `readonly [Token]: true` by typing each token as a `unique symbol` and
  replacing `x instanceof Arrayable` with a helper (`isInstance(x, Arrayable)`
  or `hasBrand`), which drops the PHP-shaped `instanceof` that AD-1 asks for.
  In the same ruling, please also settle two gaps in this Story's mapping:
  (a) the fourth acceptance criterion (the token carries its method names at
  `Symbol.for('xaravel.contract.methods')` and each method's parameter
  names) has no Xaravel Test in `stories/10.1.md`; the recommendation is to
  add `XT-contracts-5` to the manifest; (b) no reader or key exists for the
  parameter names (Mockery's `DoubleTarget` and PHPUnit's `Generator` read
  only an iterable of names at that symbol, and take parameters from
  `Symbol.for('xaravel.api.signature')`); the recommendation is a frozen
  `{ <method>: [<param>, ...] }` record at
  `Symbol.for('xaravel.contract.parameters')`.
evidence: >-
  AD-1 (Contents) asks for one binding that is both the interface's computed
  brand key (`readonly [Token]: true`, so `implements` forces the brand) and
  the right-hand side of `instanceof`. Under the pinned TypeScript 7.0.2 with
  `--strict` these exclude each other. A `const Arrayable: unique symbol`
  enforces the brand (a class without `get [Arrayable]()` fails TS2420), but
  `x instanceof Arrayable` fails TS2359 ("the right-hand side of an
  'instanceof' expression must be ... an object type with a
  'Symbol.hasInstance' method"); augmenting the global `Symbol` interface
  with a `[Symbol.hasInstance]` method does not change this, because a symbol
  is not an object type. Typing the token as `unique symbol & { [Symbol.hasInstance] }`
  makes `instanceof` compile and narrow, but the intersection is no longer a
  unique symbol in key position: the interface gets a `symbol` index
  signature, so a class that implements `Arrayable` and `Jsonable` but brands
  only `Arrayable` compiles, and any class with `[Symbol.iterator]` fails
  ("'symbol' index signatures are incompatible"). With Option 1 the same
  probe gives exactly the wanted results: a class missing one brand fails
  TS2420 naming `[Jsonable.brand]`, a class with both brands and
  `[Symbol.iterator]` compiles, `instanceof` narrows to the interface, and at
  runtime `new Good() instanceof Arrayable` is `true` and
  `{} instanceof Jsonable` is `false`. No code, test or spec was written for
  these Test IDs.
---

# ESC-10.1-1: AD-1's `readonly [Token]: true` and `x instanceof Token` cannot both type-check on one binding

Story 10.1 builds the contract token mechanism. AD-1 says each contract's interface requires `readonly [Token]: true` and that `x instanceof Token` works as in PHP. In TypeScript, a computed key in an interface must be a `unique symbol`, and the right-hand side of `instanceof` must be an object or function type. One binding cannot be both, so the mechanism can't be built as AD-1 words it. This stops XT-contracts-1 (brand and `instanceof`), XT-contracts-2 (`implements` without the brand fails to compile) and XT-contracts-3 (`contract<T>()` tokens behave like framework tokens).

The recommended fix, Option 1 above, keeps the runtime protocol that Story 9.5 already built (`hasBrand` derives the key through `Symbol.toPrimitive`). It moves only the compile-time key to `Token.brand`. That is a wording change to AD-1 and to the planning documents, so it needs the Maintainer.

The ruling also needs to settle two smaller gaps that came up while planning, listed as (a) and (b) above: which test covers the method-metadata criterion, and where the parameter names live.
