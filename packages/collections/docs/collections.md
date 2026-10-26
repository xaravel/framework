# Collections

`@xaravel/collections` ports Laravel 13's `illuminate/collections` component: `Collection`, `LazyCollection`, the `Enumerable` interface, the `EnumeratesValues` trait, `HigherOrderCollectionProxy`, `Arr`, `ItemNotFoundException`, `MultipleItemsFoundException` and the `collect()`, `data_get()`, `data_has()` and `value()` helpers. Collections are synchronous, and they keep PHP's array semantics: key order, integer-like key normalisation, and the list-or-object JSON shape.

This page covers what Stories 14.1 and 14.2 port: construction, conversion, serialization, array access, iteration, macros and higher-order proxies, and the methods that read, find, add and remove items. The other methods (`sortBy`, `groupBy`, `chunk`, …) arrive with the Collections Stories that port their tests.

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

A collection is a Traversable. `for (const value of c)` gives the values and `c.entries()` the `[key, value]` pairs, as `foreach ($c as $v)` and `foreach ($c as $k => $v)` do. `c.keys()` is Laravel's `keys()`: a new collection (a `LazyCollection` for a lazy one) whose items are the keys, so `for (const key of c.keys())` iterates the keys and `c.keys().all()` is their list. `getIterator()` is Laravel's (`ArrayIterator` for a `Collection`), `getCachingIterator()` wraps it in a `CachingIterator`, and `count()` is the number of items.

## Retrieving, searching and changing items

Laravel's names, arguments and results, over PHP's comparisons from `@xaravel/runtime`:

- **Reading.** `first(callback, default)`, `last(callback, default)`, `firstWhere(key, operator, value)`, `value(key, default)` (the key's value in the first item that has it, "dot" notation), `get`, `pluck(value, key)`, `keys()`, `random(number, preserveKeys)`, `nth(step, offset)`, `skip`, `slice`, `take`.
- **Searching.** `contains(value)` compares with PHP's `==` (`looseEquals`) and `containsStrict(value)` with PHP's `===` (`identical`, so two arrays are identical only with the same keys in the same order); with a callback they test each item, and with a key, an operator and a value they test each item's key as `where` does. `doesntContain`, `doesntContainStrict`, `some`, `search(value, strict)` (the key, or `false`), `before` and `after` follow the same rules. `has(...keys)` and `hasAny(...keys)` take a list of keys or the keys as arguments.
- **Exactly one, or at least one.** `sole()` returns the only (matching) item and throws `ItemNotFoundException` for none and `MultipleItemsFoundException` (with `getCount()`) for more; `firstOrFail()` throws `ItemNotFoundException` for none. `hasSole()` and `hasMany()` answer the same questions without throwing. `containsOneItem()` and `containsManyItems()` do the same, but Laravel deprecates them (12.49.0 and 12.50.0); use `hasSole()` and `hasMany()`. Both exceptions extend the runtime's `RuntimeException` and are registered under their Laravel FQCNs.
- **Subsets.** `only(...keys)`, `except(...keys)` and `select(...keys)` take a list, an `Enumerable` or the keys as arguments; `null` keeps everything.
- **Changing a `Collection`.** `push(...values)`, `prepend(value, key)`, `unshift(...values)`, `put(key, value)`, `getOrPut(key, value)` (it writes the value when the key is missing), `add(value)`, `pop(count)`, `shift(count)`, `pull(key, default)` ("dot" notation, nested collections included), `forget(keys)` and `splice(offset, length, replacement)` change the collection in place, as Laravel's do. `shift`, `unshift` and `splice` renumber int keys, as PHP's array functions do; `pop` keeps the keys and lowers only the next free index. A `LazyCollection` has none of these, as in Laravel.

`random` (both classes), `splice` (`Collection`), `Arr.first`, `Arr.last` and `Arr.random` take two optional parameters, so they also accept an options object (AD-26) as their last argument, in the first optional position: `c.random({ number: 2, preserveKeys: true })`, `c.splice(1, { length: 1, replacement: ["x"] })`, `Arr.first(array, { callback, default })`, `Arr.last(array, { callback, default })` and `Arr.random(array, { number, preserveKeys })`. PHP never takes an array in those positions, so a plain object there is always the options object.

`Arr` gains the members these methods call: `except`, `first`, `forget`, `get`, `last`, `only`, `pluck`, `prepend`, `pull`, `random` and `select`. `Arr.forget(ref, keys)` and `Arr.pull(ref, key, default)` take PHP's by-reference array as a `Ref` from `@xaravel/runtime` and write the new array to `ref.value` (DIV-9.2).

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

- **DIV-9.2:** PHP's by-reference arrays (`Arr.forget`, `Arr.pull`) are a `Ref`.
- **DIV-9.15:** spreading a keyed PHP array into `push(...)` or `unshift(...)` spreads its values, `...array_values(a)`.
- **DIV-12.6:** index reads are `get(k)` (or `offsetGet(k)`), not `c[k]`.
- **DIV-12.16:** higher-order messages are `__get(name)` and `__call(method, args)` calls, not magic properties.
- **DIV-12.17:** index writes, `isset` and `unset` are `offsetSet`, `offsetExists` and `offsetUnset`.
- **DIV-12.18:** a generator source writes keyed yields as `yield keyed(k, v)` and `yield from` as `yield* yieldFrom(it)`.
- **DIV-12.19:** where a test passes a collection class as a value, it is the class's FQCN, `fqcn(Collection)`.
- **DIV-12.20:** `contains`, `doesntContain`, `doesntContainStrict`, `some`, `where`, `firstWhere`, `hasSole`, `hasMany`, `sole`, `firstOrFail`, `first` and `last` take only positional arguments: their first parameter is a PHP value or a callback, so a lone object is always the value, never an options object. Laravel's named arguments to them become the positional call.

Not ported yet: `dump()` and `dd()` (they need Support's VarDumper, Epic 19), and the escaped string form after `escapeWhenCastingToString()`, which needs Support's `e()` and throws `BlockedByComponentError("support")` until then.
