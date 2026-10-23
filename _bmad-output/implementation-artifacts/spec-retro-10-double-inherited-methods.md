---
title: 'Epic 10 item 5: a double takes the methods of its parents chain and their built-ins'
type: 'feature'
created: '2026-10-23'
status: 'blocked'
baseline_revision: 'a4c589e8'
---

# Epic 10 item 5: a double takes the methods of its parents chain and their built-ins

Action item `epic-10-item-5-double-inherited-methods` (decisions/ESC-10.2-4.md), scope `packages/assert` and `packages/mockery`, on the route of the MAINT-2026-10-16 amendment of 2026-10-22.

## Investigation

- **Where methods come from today.** PHPUnit's `readTarget` (`packages/assert/src/Framework/MockObject/Generator/Generator.ts:283`) and Mockery's `DoubleTarget.of` (`packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts:711`) read only `token[Symbol.for('xaravel.contract.methods')]`. The parents closure is already walked for brands by `contractParentBrands` (`packages/assert/src/Framework/MockObject/Generator/ContractParents.ts`, ESC-10.1-6), so the parent-method half is a small extension of that walk.
- **String built-ins** (`count`, `offsetExists`, `offsetGet`, `offsetSet`, `offsetUnset`, `toString`) fit both doubles as they are: each is one more string-named method.
- **The `Symbol.iterator` built-in does not.** Both doubles key their methods by string only:
  - PHPUnit: `ConfigurableMethod` has a string name, `TargetType.methods` is a `Map<string, …>`, and `method()` matches a string (or a constraint on one), as PHPUnit's `MethodName` does.
  - Mockery: `Mock.ts` sends every symbol key to `Reflect.get` and never to a dispatcher ("Symbol keys always use Reflect.get"), and `shouldReceive` takes method names as strings.
  - AD-26 maps PHP's `IteratorAggregate::getIterator()` to `[Symbol.iterator]`, and a PHP test configures `method('getIterator')` or `shouldReceive('getIterator')`.

## Blocking condition: intent gap

The ruling says the doubles take each token's built-ins "each method once", and lists `Symbol.iterator` among them. It does not say how a test configures a symbol-keyed method, and these readings lead to different public behaviour in two Protected grader packages:

1. **PHP name (recommended).** The double defines `[Symbol.iterator]`. A test configures it as `getIterator`, as the Upstream test does (`method('getIterator')`, `shouldReceive('getIterator')`), and the Invocation or expectation is named `getIterator`. A configured return value that is a PHP `Traversable` (an object with `[Symbol.iterator]`) is iterated. An unconfigured call yields nothing.
2. **Symbol key.** `method()` and `shouldReceive()` also accept a symbol, and the double is configured with `Symbol.iterator`. That adds a form no Upstream API has, and a ported test would need an `adapted:` marker under some DIV clause.
3. **No symbol built-ins in doubles.** The doubles take only string built-ins. A double of `Support\ValidatedData` then cannot be iterated as a PHP mock of an `IteratorAggregate` can.

The 2026-10-22 amendment says any question that would need an Escalation for a Story makes the item wait for the Maintainer. An action item has no Story id, so it cannot raise one. Nothing is implemented in part: the parent-method and string built-in halves wait with this one, so the item lands as one reviewed change.

## Auto Run Result

Status: blocked
Blocking condition: intent gap. The ruling's built-in list includes `Symbol.iterator`, but neither double can key or configure a symbol-named method, and the ruling does not choose between the readings above. The orchestrator set the item `in-progress` and added it to epic 10's `waiting_on_maintainer` in `retro-gates.yaml`. No code was changed.
