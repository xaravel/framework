# Collections

`@xaravel/collections` ports Laravel 13's `illuminate/collections` component: `Collection`, `LazyCollection`, the `Enumerable` interface, the `EnumeratesValues` trait, `HigherOrderCollectionProxy`, `Arr` and the `collect()`, `data_get()` and `value()` helpers. Collections are synchronous, and they keep PHP's array semantics: key order, integer-like key normalisation, and the list-or-object JSON shape.

This page covers the core that Story 14.1 ports: construction, conversion, serialization, array access, iteration, macros and higher-order proxies. The other methods (`first`, `where`, `sortBy`, `groupBy`, …) arrive with the Collections Stories that port their tests.

## PHP arrays

A collection holds a PHP array. Xaravel writes PHP arrays as `@xaravel/runtime`'s value model does (AD-9):

- a list (keys `0..n-1` in order) is a JS `Array`;
- an array whose keys are all non-integer-like strings is a plain object;
- any other array is a `PhpArray`, which keeps PHP's key order and normalises keys as PHP does (`"7"` is the int `7`, `"07"` stays a string).

Every method accepts all three forms, and every array a method returns is in the form its keys give. A collection never shares an array with its caller: the constructor copies the items, and `all()`, `toArray()` and `get()` return copies.

```ts
import { collect } from "@xaravel/collections";
import { PhpArray } from "@xaravel/runtime";

const c = collect(new PhpArray([["10", "a"], ["x", "b"], ["07", "c"]]));
c.toJson(); // '{"10":"a","x":"b","07":"c"}'
collect(["a", "b", "c"]).filter((v) => v !== "b").toJson(); // '{"0":"a","2":"c"}', keys kept
collect(["a", "b", "c"]).filter((v) => v !== "b").values().toJson(); // '["a","c"]'
```

## Creating collections

`new Collection(items)`, `Collection.make(items)` and `collect(items)` take:

- a PHP array (list, plain object or `PhpArray`);
- another `Enumerable` (its `all()`), an `Arrayable` (its `toArray()`), a `Jsonable` (its decoded JSON) or a `JsonSerializable` (its `jsonSerialize()`, cast to an array);
- a Traversable (`ArrayObject`, a runtime `Generator`, …) with its keys, or a runtime `WeakMap` as the list of its values;
- any other object, as its public properties;
- `null` or nothing, for an empty collection, and a scalar or an enum case, as a one-item collection.

The static constructors are Laravel's: `make`, `wrap` (a collection stays as it is, anything else is wrapped with `Arr.wrap`), `unwrap`, `empty`, `times(n, callback)`, `range(from, to, step)` and `fromJson(json, depth, flags)`.

## Converting

- `all()` is the items, and `toArray()` the items with each `Arrayable` item replaced by its `toArray()`.
- `jsonSerialize()` converts each item through `jsonSerialize()`, `toJson()` or `toArray()`. `toJson(flags)` and `toPrettyJson(flags)` encode it with `jsonEncode` from `@xaravel/runtime/php`, never `JSON.stringify`.
- `toString()` (and `String(collection)`) is `toJson()`, Laravel's `__toString`.
- `collect()` turns any collection into a `Collection`, and `lazy()` a `Collection` into a `LazyCollection` over a copy of its items.
- `ensure(type)` checks every item against a type name (`'int'`, `'string'`, …), a class, a contract token, or a list of them, and throws Laravel's `UnexpectedValueException` naming the first item of another type.

## Array access and iteration

JavaScript has no index operators on objects, so a collection's `ArrayAccess` is its methods (DIV-12.6, DIV-12.17):

| Laravel | Xaravel |
| --- | --- |
| `$c[0]` | `c.get(0)` or `c.offsetGet(0)` |
| `$c['k'] = $v` | `c.offsetSet('k', v)` |
| `$c[] = $v` | `c.offsetSet(null, v)` or `c.add(v)` |
| `isset($c['k'])` | `c.offsetExists('k')` |
| `unset($c['k'])` | `c.offsetUnset('k')` |

A collection is a Traversable. `for (const value of c)` gives the values, `c.entries()` the `[key, value]` pairs and `c.keys()` the keys, as `foreach ($c as $v)` and `foreach ($c as $k => $v)` do. `getIterator()` is Laravel's (`ArrayIterator` for a `Collection`), `getCachingIterator()` wraps it in a `CachingIterator`, and `count()` is the number of items.

## Lazy collections

A `LazyCollection` enumerates its source only when it is consumed. Its source is a PHP array, an `Arrayable`, another lazy collection, or a function. A generator function is the usual source:

```ts
import { LazyCollection } from "@xaravel/collections";
import { keyed } from "@xaravel/runtime";

const lines = LazyCollection.make(function* () {
  yield "first"; // key 0
  yield keyed("name", "value"); // PHP's yield 'name' => 'value'
});
```

A generator yields only values, so a key is written `yield keyed(k, v)`, and PHP's `yield from` is `yield* yieldFrom(iterable)` (DIV-12.18). Each enumeration calls the function again. A function that is not a generator has its result wrapped as an array. A generator object, the result of calling a generator function, is rejected with Laravel's `InvalidArgumentException`, because it can be enumerated only once: pass the function itself.

## Macros and higher-order proxies

`Collection` and `LazyCollection` are `Macroable`: `Collection.macro('name', function () { … })` adds a method, with the collection as `this`. Type it with a `declare` member on a subclass, or call it through a typed view.

Laravel's higher-order messages, such as `$users->each->notify()` and `$users->filter->isActive`, read a magic property. Xaravel has no magic properties outside `Model`, so they are written as the calls PHP makes (DIV-12.16):

```ts
users.__get("each").__call("notify", []);
users.__get("filter").__get("isActive");
Collection.proxy("adults"); // adds a proxied method, as Laravel's proxy()
```

## Divergences

- **DIV-12.6:** index reads are `get(k)` (or `offsetGet(k)`), not `c[k]`.
- **DIV-12.16:** higher-order messages are `__get(name)` and `__call(method, args)` calls, not magic properties.
- **DIV-12.17:** index writes, `isset` and `unset` are `offsetSet`, `offsetExists` and `offsetUnset`.
- **DIV-12.18:** a generator source writes keyed yields as `yield keyed(k, v)` and `yield from` as `yield* yieldFrom(it)`.
- **DIV-12.19:** where a test passes a collection class as a value, it is the class's FQCN, `fqcn(Collection)`.

Not ported yet: `dump()` and `dd()` (they need Support's VarDumper, Epic 19), and the escaped string form after `escapeWhenCastingToString()`, which needs Support's `e()` and throws `BlockedByComponentError("support")` until then.
