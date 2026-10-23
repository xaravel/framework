---
decision: approved
decided_by: Maintainer
date: 2026-10-22
escalation_sha256: "33aa29ba8cc7c5d164297bb23c7a36f514ffb9d7cc1ff7e1b7e899aaf2426d21"
---

# ESC-10.1-1: approved, option 1 (the compile-time brand key is `Token.brand`), with (a) and (b) as proposed

Option 1 is approved. Each contract token stays an object (or function) under the contract's Upstream name, so `x instanceof Arrayable` works as in PHP. The token also gets a `readonly brand` property, typed as that contract's own `unique symbol`, and the interface's brand key becomes `readonly [Token.brand]: true`. Option 2 is not taken: it drops the PHP-shaped `instanceof` that AD-1 asks for.

## The token

- **Runtime key unchanged.** `Token.brand` is `Symbol.for('<Upstream FQCN>')`, the key Story 9.5's `hasBrand`, `jsonEncode` and the grader already read. None of them change.
- **`instanceof`.** The token's `Symbol.hasInstance` reads that brand through the prototype chain.
- **`Symbol.toPrimitive`.** The token's `Symbol.toPrimitive` returns the brand key. So `get [Arrayable]()` and `get [Arrayable.brand]()` define the same property at runtime, and `hasBrand(x, Arrayable)` keeps deriving the key as it does today.
- **Generated brands.** Generators emit `get [Token.brand]() { return true as const }`, the form `implements` checks.
- **Escalation's probe.** Under TypeScript 7.0.2 `--strict`:
  - a class missing one brand fails TS2420, naming `[Jsonable.brand]`;
  - a class with both brands and `[Symbol.iterator]` compiles;
  - `instanceof` narrows to the interface.

## (a) The method-metadata criterion gets a test

Story 10.1's fourth acceptance criterion is verified by the new **XT-contracts-18**. The Escalation proposed XT-contracts-5, but Story 10.2's manifest already holds XT-contracts-5..17, so the next free id is used. `stories/10.1.md` lists it, and its table row sits in criterion order, so XT-contracts-4 stays on `@xaravel/contracts/psr`.

## (b) Where parameter names live

- **The key and shape.** Each token carries its parameter names at `Symbol.for('xaravel.contract.parameters')`, as a frozen record `{ <method>: [<param>, …] }`. The record is frozen, and so is each list in it.
- **Method names.** They stay at `Symbol.for('xaravel.contract.methods')`, the iterable that Mockery's `DoubleTarget` and PHPUnit's `Generator` already read (ESC-4.5-1 item 3).
- **Source.** Both come from the committed API surface (ESC-4.7-1 item 5).
- **No reader changes.** The grader keeps taking parameters from `Symbol.for('xaravel.api.signature')`. A later grader change may read the new record, but this ruling adds no reader.

## Changes in this ruling's PR

- **Spine:**
  - AD-1 (Contents) now names `Token.brand` and the token's `Symbol.toPrimitive`.
  - AD-9 (Brands) gives the generated getter as `get [Token.brand]()`.
  - `bun run xt:consequences` regenerates the consequence files that quote them.
- **`epics.md`:**
  - Story 10.1's first criterion reads `get [Arrayable.brand]()`.
  - Its fourth names the parameters key.
- **`stories/10.1.md`:** adds XT-contracts-18.
- **`epic-10-context.md`:** the brand lines and the test-double metadata line now match.
- DIV-9.5 is unchanged, because its text names only `hasBrand(classOrInstance, Token)`.

## Rationale

- **The runtime protocol Story 9.5 built stays as it is.** Only the compile-time key moves, so no runtime code, no grader code and no fixture changes.
- **`implements` still forces the brand, and `instanceof` still reads as PHP.** Those are the two things AD-1 asks for.
- **No assertion, expected value or skip is weakened.** One Xaravel Test is added.

This ruling clears ESC-10.1-1 for XT-contracts-1, XT-contracts-2 and XT-contracts-3, and adds XT-contracts-18. With ESC-10.1-2, Story 10.1 resumes at `in-progress`.
