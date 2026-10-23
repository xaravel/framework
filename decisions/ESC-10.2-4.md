---
decision: approved
decided_by: Maintainer
date: 2026-10-23
escalation_sha256: "b2ec370ddb0dd8c688b2ca1ef30787afad5f611cb5e0f06fa8fb02be92b3540d"
---

# ESC-10.2-4: approved, option 1 (doubles take every method of the parent chain, built-in parents included)

Option 1 is approved. A PHP mock of an interface has every method of the interfaces it extends, and Xaravel's doubles now do the same. Option 2, listing inherited methods on each token, is not taken: a token's `Symbol.for('xaravel.contract.methods')` keeps matching its committed API-surface rows.

## The change

- **Doubles.** PHPUnit's `Generator` (`packages/assert`) and Mockery's `DoubleTarget` (`packages/mockery`) take a double's methods from:
  - the target token;
  - every token in its parents closure (`Symbol.for('xaravel.contract.parents')`, ESC-10.1-6);
  - each one's built-in methods;

  each method once.
- **Built-in parents.**
  - `contract()` takes an optional `builtins` list for a contract whose PHP parent is a built-in interface: `count` for `Countable`, `offsetExists`, `offsetGet`, `offsetSet` and `offsetUnset` for `ArrayAccess`, `Symbol.iterator` for `IteratorAggregate`, and `toString` for `Stringable`.
  - The token keeps the list at `Symbol.for('xaravel.contract.builtins')`. Absent means none.

## The route

- **The doubles half** is action item **`epic-10-item-5-double-inherited-methods`** (owner orchestrator):
  - on the item route of the MAINT-2026-10-16 amendment of 2026-10-22, with scope `packages/assert` and `packages/mockery`;
  - with Xaravel Tests for a double of a child contract and of a contract with built-in parents, in each package;
  - with its Fidelity Review in `--item` mode.
- **The `builtins` half** is Story 10.2's (`packages/contracts`).

## Clarification (2026-10-23, after #353)

Both doubles key and configure methods by name (`method('x')`, `shouldReceive('x')`), so the list above cannot hold `Symbol.iterator`. The rule follows `PORTING.md`, which maps `IteratorAggregate` to `[Symbol.iterator]` and `__toString` to `toString()`:

- **The list holds PHP names.** A token's `builtins` list (`Symbol.for('xaravel.contract.builtins')`) holds the built-in methods' PHP names:
  - `count` for `Countable`;
  - `offsetExists`, `offsetGet`, `offsetSet` and `offsetUnset` for `ArrayAccess`;
  - `getIterator` for `IteratorAggregate`;
  - `__toString` for `Stringable`.
- **A test configures the PHP name**, as Upstream's tests do (`->method('getIterator')`, `->shouldReceive('getIterator')`), so those lines port unchanged.
- **The double wires the JS protocol to that configuration:**
  - its `[Symbol.iterator]()` iterates whatever `getIterator` is configured to return;
  - its `toString()` and `[Symbol.toPrimitive]` return what `__toString` is configured to return, and configuring `toString` configures the same method.
- **`count` and the `offset*` methods** keep the same name in both languages, so nothing extra is needed.
