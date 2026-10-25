# Conditionable

`@xaravel/conditionable` ports Laravel 13's `Illuminate\Support\Traits\Conditionable` trait and `Illuminate\Support\HigherOrderWhenProxy`. Laravel's documentation uses `when` and `unless` on query builders, collections, strings, requests and many other classes. This page covers the trait those classes share.

## Using the trait

Traits are runtime mixins in Xaravel. Mix `Conditionable` into a class with `mixin` from `@xaravel/runtime`:

```ts
import { Conditionable } from "@xaravel/conditionable";
import { mixin, registerClass } from "@xaravel/runtime";

export class Report extends mixin(null, Conditionable) {
  lines: string[] = [];

  archived: boolean = false;

  add(line: string): this {
    this.lines.push(line);
    return this;
  }

  hasLines(): boolean {
    return this.lines.length > 0;
  }
}

registerClass("App\\Support\\Report", Report);
```

`classUsesRecursive(Report)` names the trait by its Laravel FQCN, `Illuminate\Support\Traits\Conditionable`.

## `when` and `unless`

`when(value, callback, defaultValue)` calls `callback(this, value)` when `value` is truthy. Otherwise it calls `defaultValue(this, value)` when one is given. `unless(value, callback, defaultValue)` does the reverse: it calls `callback` when `value` is falsy.

```ts
const report = new Report()
  .when(user.isAdmin(), (report) => report.add("Admin section"))
  .unless(filters.length === 0, (report) => report.add("Filtered"), (report) => report.add("All rows"));
```

- **Truthiness follows PHP.** `"0"`, `""`, `0`, an empty array, `null` and `false` are falsy, and everything else is truthy. A plain object is a PHP array, so an empty `{}` is falsy too; an instance of a class is always truthy.
- **A closure value** is called with the instance, and its result is the value: `report.when((r) => r.lines.length > 0, …)`. A class passed as `value` is not called; it is the value itself. Neither is an invokable object (an instance of a class with `__invoke`): only a closure is called, so it is a truthy value.
- **The result** is what the callback returns. When the callback returns `null` (or nothing), or when no callback runs, the instance is returned, so the chain continues.
- **A `null` callback** with a truthy value throws PHP's `Error`, `Value of type null is not callable`, as Laravel does.
- **`callback` and `defaultValue` must be callable.** A function, `null`, or an invokable object: an instance of a class with an `__invoke` method, which is called as `object.__invoke(instance, value)` (with the object as `this`); its result is used as `result ?? instance`. As PHP checks `?callable` on entry, any other value throws PHP's `TypeError` on every branch, for example `App\Support\Report::when(): Argument #2 ($callback) must be of type ?callable, int given`. The type name is PHP's (`true` / `false`, `int`, `float`, `string`, `array`, or a class name; `class@anonymous` for an unregistered class). A PHP callable string such as `'strrev'` is not a function, so it is not accepted, and a plain object with an `__invoke` key is a PHP array, so it is rejected with `array given`.

`defaultValue` is Laravel's `$default`; `default` is a reserved word in JavaScript.

`when` and `unless` take only positional arguments. A single object argument is always the condition, as in Laravel, so `report.when({ value: false }, cb)` runs `cb`: the object is a truthy condition. Write Laravel's named arguments positionally, with `null` for each skipped parameter: `unless($ready, default: fn ...)` becomes `report.unless(ready, null, (r) => …)` (DIV-12.13).

### Async callbacks

`when` and `unless` are dual helpers (AD-6). They return whatever their callback returns, or the instance when it returns `null` or nothing. So a synchronous callback keeps the call synchronous, and an async callback makes it return that callback's own Promise:

```ts
const result = await new Report().when(user.isAdmin(), async (r) => r.add(await loadAdminSection()));
```

- The result is never inspected. A callback that returns a query builder or another thenable stays synchronous: `query.when(term, (q) => q.where("title", term))` returns the builder, and the query does not run.
- An async callback's Promise is returned as it is, so a `null` it resolves to stays `null`.
- **A condition is never a Promise.** A Promise or another thenable passed as `value`, or returned by the value closure, throws a `TypeError` saying to await it before the call, because PHP truthiness would always take the `callback` branch. Await it first: `report.when(await user.isAdmin(), …)`. The types reject a Promise condition too (DIV-1.6).

## Higher-order calls

With no callback, `when` and `unless` return a `HigherOrderWhenProxy`. It applies the next method call or property read to the instance only when the condition holds:

- `when(value)` holds `value` as the condition. `unless(value)` holds its negation.
- `when()` and `unless()` hold no condition yet. The next call or read captures one: its result becomes the condition, negated for `unless()`, and the proxy is returned again.

```ts
report.when(isAdmin).add("Admin section"); // the report's add() result, or the report when !isAdmin

report.when().hasLines().add("Summary"); // add() runs only when hasLines() was truthy

report.unless().archived.add("Active"); // captures !report.archived
```

When the condition is false, a method call returns the instance without calling the method, and a property read returns the instance without reading the property.

The proxy forwards through `__call(method, parameters)` and `__get(key)`, Laravel's magic methods ported as explicit ones, and you can call them directly: `report.when(isAdmin).__call("add", ["Admin section"])`. At construction the proxy gets a member for each method of the instance's class chain and each of the instance's own properties, each routed through `__call` or `__get` (DIV-12.12). An own property is delegated as a property, unless its value is a function (an arrow-function field), which is delegated as a method; a getter on the class is delegated as a property. So `archived` above works because the field is set at construction, before `when()` builds the proxy. A member added to the instance after the proxy was built is reached only through `__call` / `__get`, and `then` is never forwarded, so the proxy is never awaited by accident.

- A method the instance lacks goes to the instance's own `__call` when it has one (a Macroable class), else throws PHP's `Error`, `Call to undefined method App\Support\Report::nope()`.
- A property the instance lacks is read through its own `__get` when it has one, else as `null`. A method name is not a property: `__get("add")` gives `null` (or the instance's `__get`), and members JavaScript inherits from `Object.prototype` (`toString`, `constructor`) are not members of the instance.
- A method that returns nothing gives `null`.
- A captured condition that is a Promise or another thenable (an async method, a Promise property) throws a `TypeError` saying to await it first (DIV-1.6).

`condition(value)` sets the proxy's condition, and `negateConditionOnCapture()` makes the next capture negate its result. Both return the proxy.

## Divergences

- **A Promise is never a condition (DIV-1.6).** `when` and `unless` return their callback's own result, so an async callback gives its own Promise. A Promise or other thenable condition (the value, the value closure's result, or a value the proxy captures) throws a `TypeError` instead of being tested for truthiness. PHP has no Promises, so no Laravel behaviour differs.
- **Generated proxy members (DIV-12.12).** Laravel's proxy answers any method or property of its target through `__call` / `__get`. Xaravel has no Proxy outside `Model` (AD-7, AD-26), so the proxy gets one generated member per method and own property of the target when it is built. A member added later, and `then`, are reached only through `__call` / `__get`, and a target member named like one of the proxy's own (`condition`, `negateConditionOnCapture`, `__call`, `__get`) is reached only through `__call` / `__get` too. A class whose property and method share a name keeps the method, and the property becomes `<name>Property`.
- **Positional arguments only (DIV-12.13).** `when` and `unless` do not take Xaravel's options object for named arguments, since a lone object is the condition. Laravel's named arguments are written positionally.
- **Callable strings and arrays.** `callback` and `defaultValue` must be functions, invokable objects or `null`. PHP's `?callable` also accepts a callable string or array (`[$object, 'method']`); Xaravel throws PHP's `TypeError` for them, and for a plain object with an `__invoke` key, which is a PHP array.
- **`ConditionableTest` on Eloquent.** Laravel's tests of `when` / `unless` on an Eloquent query builder are ported and wait on the Database Component (`blocked-by:database`). This is not a behaviour difference.
