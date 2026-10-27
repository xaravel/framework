# Collections

`@xaravel/collections` ports Laravel 13's `illuminate/collections` component: `Collection`, `LazyCollection`, the `Enumerable` interface, the `EnumeratesValues` trait, `HigherOrderCollectionProxy`, `Arr`, `ItemNotFoundException`, `MultipleItemsFoundException` and the `collect()`, `data_get()`, `data_has()` and `value()` helpers. Collections are synchronous, and they keep PHP's array semantics: key order, integer-like key normalisation, and the list-or-object JSON shape.

This page covers what Stories 14.1-14.4 port: construction, conversion, serialization, array access, iteration, macros and higher-order proxies, the methods that read, find, add and remove items, the methods that filter, slice and branch, with their async companions, and the methods that combine arrays. It also covers `sortBy`, `groupBy`, `keyBy` and `concat`, which those tests reach. The other methods (`sort`, `sortByDesc`, `chunk`, …) arrive with the Collections Stories that port their tests.

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
- **Sorting by a value.** `sortBy(callback, options, descending)` sorts by what `callback` gives for each item (a callback over the item and its key, or a key in "dot" notation), with PHP's sort flags (`SORT_REGULAR`, `SORT_NUMERIC`, `SORT_STRING`, …, from `@xaravel/runtime`), and keeps the keys. `descending` is `false` or `SortDirection.Ascending` for ascending, `true` or `SortDirection.Descending` for descending; any other value throws PHP's `UnhandledMatchError` (`Unhandled match case 0`, `Unhandled match case 'desc'`), as Laravel's `match` does. A list of comparisons that is not callable (`[["name", "asc"], ["age", "desc"]]`, or comparator callbacks) sorts by each in turn. `LazyCollection.sortBy` sorts through a `Collection` when it is enumerated, so it throws only then. The rest of sorting (`sort`, `sortDesc`, `sortByDesc`, `sortKeys`, …) arrives with Story 14.5.

## Filtering, slicing and branching

Laravel's names, arguments and results, keys kept unless the method says otherwise (`values()` re-indexes):

- **Filtering.** `filter(callback)` (without a callback, the truthy items), `reject(callback)` (or `reject(value)`, the items not `==` it; without an argument, the items not `== true`), `where(key, operator, value)`, `whereStrict(key, value)`, `whereNull(key)` and `whereNotNull(key)` (the item itself when `key` is `null`), `whereIn(key, values, strict)`, `whereInStrict`, `whereNotIn`, `whereNotInStrict`, `whereBetween(key, values)` (the items whose key's value is `>=` the first of `values` and `<=` the last, by PHP's comparison, as PHP's `reset` / `end` read them), `whereNotBetween(key, values)` (the others) and `whereInstanceOf(type)` (a class, a class name, or a list of them).
- **Unique and duplicate items.** `unique(key, strict)` and `uniqueStrict(key)` keep the first of each value (by `==`, or `===` when strict), and `duplicates(callback, strict)` and `duplicatesStrict(callback)` give each later one, keyed as in the collection; `callback` is a callback or a `data_get` key. `duplicates` also takes an options object (AD-26): `c.duplicates({ callback: "k", strict: true })` is `c.duplicates("k", true)`. Two `Collection`s are `==` when their items are, as in PHP: a `Collection` gives the runtime its PHP properties through the props protocol (AD-9.6).
- **Testing every item.** `every(callback)` (or `every(key, operator, value)`, as `where`) is `true` when every item passes, and when the collection is empty. `partition(callback)` (or `partition(key, operator, value)`) returns a collection of two collections, `[passed, failed]`, each keeping its items' keys: `const [passed, failed] = c.partition(cb).all()`. `Arr.partition(array, callback)` gives the two arrays. `percentage(callback, precision = 2)` is the share of items that pass, times 100, rounded by PHP's `round`: a float (`c.percentage((v) => v > 1)` on `[1, 2, 3, 4]` is `float(75)`, with the runtime's float marker, as PHP gives `75.0`), or `null` for an empty collection. Its own tests arrive with Story 14.5.
- **Slicing.** `slice(offset, length)` and `take(limit)` take negative arguments as PHP's `array_slice` does (`take(-2)` is the last two items); `skip(count)`, `skipUntil(value)`, `skipWhile(value)`, `takeUntil(value)` and `takeWhile(value)` take a callback, or a value an item must be `===` to.
- **Grouping.** `groupBy(groupBy, preserveKeys = false)` groups the items by a callback's result or a `data_get` key into a collection of collections, keyed by group. A callback may return a list of keys, putting the item in each group. A `bool` key is its int (`true` is `1`), an enum case its value, and a `Stringable` or `null` its string (`null` is `""`). With `preserveKeys` each group keeps the items' keys, else it is a list. A list of callbacks or keys groups by each in turn, one nesting level each. `LazyCollection.groupBy` groups through a `Collection` when it is enumerated. Its own tests arrive with Story 14.5.
- **Keying and combining.** `keyBy(keyBy)` keys each item by a callback's result or a `data_get` key (an enum case key is its value, an object key its string, `null` is `""`), and `concat(source)` appends another array's or collection's values to a new collection. `keyBy`'s own tests arrive with Story 14.5.
- **Branching.** `when` and `unless` are `Conditionable`'s. `whenEmpty(callback, default)`, `whenNotEmpty`, `unlessEmpty` and `unlessNotEmpty` call `when` with the collection's emptiness; like `when`, they return their callback's result, or the collection when that is `null`. Higher-order `when` / `unless` (`c.when(true).concat([…])`) delegate the next call when the condition holds.

## Combining arrays

Laravel's names, arguments and results, with PHP's array functions from `@xaravel/runtime`:

- **Merging.** `merge(items)` is PHP's `array_merge`: integer keys are renumbered from 0 in order, and a later string key overwrites an earlier one in its first position (`collect(new PhpArray([[1, "a"], [2, "b"]])).merge(new PhpArray([[5, "c"]]))` is `["a", "b", "c"]`; `collect({ a: 1, b: 2 }).merge({ b: 3, c: 4 })` is `{ a: 1, b: 3, c: 4 }`). `items` is an array, an `Arrayable`, a collection or `null`.
- **Intersecting.** `intersectAssoc(items)` keeps the entries whose key `items` has with an equal value (compared as strings, PHP's `(string) $a === (string) $b`), and `intersectByKeys(items)` the entries whose key `items` has, keys kept.
- **Combining.** `combine(values)` uses the items as keys and `values` as values; different counts throw PHP's `ValueError` (on a `LazyCollection`, when it is enumerated, with Laravel's message `Both parameters should have an equal number of elements`). `crossJoin(...lists)` gives every combination, a list of lists. `zip(...items)` gives a list of collections, the n-th holding the n-th item of the collection and of each array (`null` where one is shorter). `concat(source)` appends values, re-indexed. `multiply(n)` repeats the values `n` times as a list (none for `n` below 1).
- **Flattening.** `collapse()` joins the items that are arrays or collections (other items are dropped): on a `Collection` as `array_merge` does, integer keys renumbered and a later string key overwriting an earlier one; on a `LazyCollection` as a list of their values, keys dropped. `flatten(depth = Infinity)` lists every value of the nested arrays and collections, keys ignored, `depth` levels down; PHP's `INF` is `Infinity`. `dot(depth = Infinity)` flattens nested arrays to `"a.b"` keys, and `undot()` expands them again (`{ "meta.foo": "bar" }` is `{ meta: { foo: "bar" } }`).
- **Joining into a string.** `implode(value, glue)` follows Laravel's three branches in order: a callable `value` maps the items and joins the results by `glue`; else, when the first item is an array or an object that is not Support's `Illuminate\Support\Stringable`, it plucks `value` ("dot" notation) from each item and joins by `glue`; else it joins the items themselves by `value`. Support's `Stringable` arrives with Support (Epic 19), so until then any object first item takes the pluck branch. `join(glue, finalGlue)` puts `finalGlue` before the last item (`"a, b and c"`); one item is returned as it is, and none is `""`.

`Arr` gains the members these call: `crossJoin(...arrays)`, `dot(array, prepend, depth)` (also with the options object `{ prepend, depth }`, AD-26), `undot(array)`, `flatten(array, depth)` and `set(ref, key, value)`, which takes PHP's by-reference array as a `Ref` and writes the new array to `ref.value` (DIV-9.2). Their own tests arrive with Story 14.6.

`mergeRecursive()` merges nested arrays with PHP's `array_merge_recursive`; `replace()` and `replaceRecursive()` replace values by key with PHP's `array_replace` and `array_replace_recursive`. `union()` uses PHP's array `+`: the receiver's keys win, and new keys follow without renumbering.

`diff()`, `diffAssoc()` and `diffKeys()` exclude matching values, key/value pairs or keys; `intersect()` keeps matching values. Their `*Using()` forms accept a sync comparison callback or a PHP global-function name such as `'strcasecmp'`, resolved by the runtime. `intersectAssocUsing()` compares keys with that callback and values as strings. `collapseWithKeys()` collapses nested arrays and collections while retaining keys. On a `LazyCollection`, iteration yields every entry, including repeated keys; when `all()` materialises the result, later values win. `flip()` swaps integer and string values with their keys and skips other values. `pad()` adds a value to the right for a positive size or the left for a negative size.

### Sync callbacks and the async companions

Collections are sync (AD-6). The callback of a sync member that takes only a callback (`filter`, `map`, `each`, `first`, `last`, `containsOneItem` on both classes, `containsManyItems` on `Collection`, whose `LazyCollection` form takes no callback, `percentage`, `Arr.first`, `Arr.last`, `Arr.map`, `Arr.where` and `Arr.partition`) and of `duplicates` / `duplicatesStrict` is typed `SyncCallback`: an intersection of `(...args) => NotPromise<R>` and `(...args) => void`. The first half makes `tsc` reject an async callback (`collect([1]).filter(async () => true)` does not compile), and the second lets oxlint's `no-misused-promises` report the call. A sync callback keeps its contextual parameter types and any result.

The members that take a value or a callback (`contains`, `every`, `reject`, `partition`, `unique`, `uniqueStrict`, `groupBy`, `keyBy`, `skipUntil`, `skipWhile`, `takeUntil` and `takeWhile`) have two overloads: a `SyncCallback` one, then one whose parameter is `ValueOrSyncCallback<K>`, the value as it is or, for a function, its `SyncCallback`. So `c.every(async () => false)` does not compile either, and lint reports it, while `c.every("age", ">=", 18)`, `c.contains(1)` and `c.reject()` are unchanged. They keep only the positional form (DIV-12.20).

For a callback that may be async, such as one that performs IO, use the async companion (DIV-1 Callbacks, DIV-1.2):

| Sync | Async companion | Resolves |
| --- | --- | --- |
| `filter(callback)` | `filterAsync(callback)` | a collection of the items whose awaited result is truthy, keys kept |
| `reject(callback)` | `rejectAsync(callback)` | a collection of the items whose awaited result is falsy, keys kept |
| `partition(callback)` | `partitionAsync(callback)` | a collection of `[passed, failed]` collections, keys kept |
| `every(callback)` | `everyAsync(callback)` | `true` when every awaited result is truthy (stops at the first falsy) |
| `contains(callback)` | `containsAsync(callback)` | `true` when some awaited result is truthy (stops at the first) |
| `first(callback, default)` | `firstAsync(callback, default)` | the first item whose awaited result is truthy, else `value(default)` |

```ts
const active = await users.filterAsync(async (user) => await isActive(user));
```

Each companion calls `callback(value, key)` for one item at a time, in key order, and awaits it before calling the next; it never runs two callbacks at once. A callback that rejects rejects the companion's Promise, and no later callback is called. On a `LazyCollection`, a companion enumerates the whole source once, before it resolves, and resolves a `LazyCollection` over the kept items: it is not lazy, so never call one on an infinite source (`everyAsync`, `containsAsync` and `firstAsync` stop early only when a result decides them). `eachAsync` and `mapAsync` arrive with Story 14.5. Each companion is listed in `async-surface.json` with `@asyncRoot callback`.

### Options objects

`random`, `sortBy` and `duplicates` (both classes), `splice` (`Collection`), `Arr.first`, `Arr.last` and `Arr.random` take two optional parameters, so they also accept an options object (AD-26) as their last argument, in the first optional position: `c.random({ number: 2, preserveKeys: true })`, `c.sortBy(callback, { options: SORT_STRING, descending: true })`, `c.duplicates({ callback, strict })`, `c.splice(1, { length: 1, replacement: ["x"] })`, `Arr.first(array, { callback, default })`, `Arr.last(array, { callback, default })` and `Arr.random(array, { number, preserveKeys })`. PHP never takes an array in those positions, so a plain object there is the options object, unless its `__invoke` is a function.

`Arr` gains the members these methods call: `except`, `first`, `forget`, `get`, `last`, `only`, `partition`, `pluck`, `prepend`, `pull`, `random` and `select`. `Arr.forget(ref, keys)` and `Arr.pull(ref, key, default)` take PHP's by-reference array as a `Ref` from `@xaravel/runtime` and write the new array to `ref.value` (DIV-9.2).

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

- **DIV-1:** collections are sync; a sync member's callback must be sync, and a callback that may be async goes to the async companion (`filterAsync`, `rejectAsync`, `partitionAsync`, `everyAsync`, `containsAsync`, `firstAsync`), which awaits it (DIV-1 Callbacks, DIV-1.2).
- **DIV-9.2:** PHP's by-reference arrays (`Arr.forget`, `Arr.pull`, `Arr.set`) are a `Ref`.
- **DIV-9.15:** spreading a keyed PHP array into `push(...)` or `unshift(...)` spreads its values, `...array_values(a)`.
- **DIV-12.6:** index reads are `get(k)` (or `offsetGet(k)`), not `c[k]`.
- **DIV-12.16:** higher-order messages are `__get(name)` and `__call(method, args)` calls, not magic properties.
- **DIV-12.17:** index writes, `isset` and `unset` are `offsetSet`, `offsetExists` and `offsetUnset`.
- **DIV-12.18:** a generator source writes keyed yields as `yield keyed(k, v)` and `yield from` as `yield* yieldFrom(it)`.
- **DIV-12.19:** where a test passes a collection class as a value, it is the class's FQCN, `fqcn(Collection)`.
- **DIV-12.20:** `contains`, `doesntContain`, `doesntContainStrict`, `every`, `some`, `partition`, `where`, `firstWhere`, `hasSole`, `hasMany`, `sole`, `firstOrFail`, `first` and `last` take only positional arguments: their first parameter is a PHP value or a callback, so a lone object is always the value, never an options object. Laravel's named arguments to them become the positional call. These are the members this page covers; the full list of positional-only members is DIV-12.20 in `decisions/DIV-12.md` (and `conformance/api-surface/exceptions.jsonl`).

Not ported yet: `dump()` and `dd()` (they need Support's VarDumper, Epic 19), and the escaped string form after `escapeWhenCastingToString()`, which needs Support's `e()` and throws `BlockedByComponentError("support")` until then.
