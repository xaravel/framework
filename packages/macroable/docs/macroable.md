# Macroable

`@xaravel/macroable` ports Laravel 13's `Illuminate\Support\Traits\Macroable` trait. Many Laravel classes are "macroable": you can add methods to them at run time. Laravel's documentation shows the pattern on collections, strings, responses, requests and other classes; this page describes the trait those classes share.

## Using the trait

Traits are runtime mixins in Xaravel. Mix `Macroable` into a class with `mixin` from `@xaravel/runtime`:

```ts
import { Macroable } from "@xaravel/macroable";
import { fqcn, mixin, registerClass } from "@xaravel/runtime";

export class Report extends mixin(null, Macroable) {
  title = "Q3";
}

registerClass("App\\Support\\Report", Report);
```

`classUsesRecursive(Report)` names the trait by its Laravel FQCN, `Illuminate\Support\Traits\Macroable`. Subclasses share the macros of the class that uses the trait, as they share Laravel's `static::$macros`.

## Registering a macro

`macro(name, macro)` registers a function under `name`. For now a macro can be registered only inside a `test` Scope Frame, such as a Ported Test's `setUp` or body, or a `unit` or narrow frame nested in one. Under a `request`, `job` or `command` frame anywhere in the frame chain, in a chain with no test frame (a root `unit` frame, an `interleave` unit), and with no active frame, `macro` throws `ScopeFrameException` (see [Divergences](#divergences)).

```ts
// Inside a Ported Test's body, which runs in a `test` frame:
{
  Report.macro("shout", function (this: Report, suffix: string) {
    return this.title.toUpperCase() + suffix;
  });
  Report.macro("kind", function (this: typeof Report) {
    return `report:${fqcn(this)}`;
  });

  new Report().shout("!"); // "Q3!"
  Report.kind(); // "report:App\\Support\\Report"
}
```

A macro can be called on an instance, through the prototype, or statically:

- In an instance call (`new Report().shout("!")`), `this` is the instance, as Laravel binds `$this`.
- In a static call (`Report.kind()`), `this` is the called class, as Laravel binds `static::`. A macro called statically must not read instance state.
- Write a macro as a `function` expression so it can be bound. An arrow function keeps its own `this`, as a PHP `static function` does.
- A macro may also be an object with an `__invoke` method; it is called as is.

Type macros with `declare` members on your class: `declare` for an instance macro, `declare static` for a static one. A `declare` member emits nothing, so the dispatcher `macro()` installs is what runs:

```ts
export class Report extends mixin(null, Macroable) {
  title = "Q3";

  declare shout: (suffix: string) => string;
  declare static kind: () => string;
}
```

A macro never replaces a real method of the same name that the class, its parents or the trait declare: the real method runs, as in PHP, and the macro is still registered for `hasMacro()`, `__call()` and `__callStatic()`. `__call(method, parameters)` and `__callStatic(method, parameters)` call a macro by name directly.

A name JavaScript gives every object or every function is not a real method: any member of `Object.prototype` (`toString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, …), and any member of `Function.prototype` (`call`, `apply`, `bind`, `toString`, …), which on the class side also inherits every `Object.prototype` member. A macro with such a name runs when it is called directly, as Laravel's `__call` / `__callStatic` would run it, on instances, statically and on subclasses; after `flushMacros()`, a direct call throws `BadMethodCallException` in that test. The dispatcher stays on the class, but it runs the macro only while the active frame has an entry of that name for the receiver's class (a registered macro, or one flushed in the same frame). In any other frame, and with no active frame, JavaScript's own member runs, called with the same `this` and arguments, so calls behave as they did before any macro and nothing leaks to later tests. The dispatcher itself stays an own member of the using class, so reflection (`Object.hasOwn`, `Object.getOwnPropertyNames`) sees it. The entry is looked up for the class of the object the member is called on, so a class that uses the trait below another class that uses it runs its own macros, and an object whose class does not use the trait (`Report.prototype.toString.call({})`) gets JavaScript's member.

While the entry exists, JavaScript's implicit calls reach the dispatcher too. This is a consequence of how DIV-12.11 installs the dispatcher, not Laravel's behaviour: PHP's `(string)` uses `__toString` and never reaches `__call`. With a `toString` or `valueOf` macro registered, `String(new Report())`, a template literal and `+` run the macro, and after `flushMacros()` in the same test they throw `BadMethodCallException`. The static side is the same: `String(Report)` runs a `toString` macro with `this` the class, and while `call` or `bind` macros are registered, `Report.call` and `Report.bind` are the macros, not `Function.prototype`'s.

Three names JavaScript keeps behind accessors, not methods: `__proto__` on instances and on the class, and `caller` and `arguments` on the class. For these, the dispatcher is an accessor too. Reading the member gives the dispatcher while the active frame has an entry of that name, so `report.__proto__()` or `Report.caller()` runs the macro; otherwise reading it gives JavaScript's own value, as before any macro (`report.__proto__` is the prototype, and `Report.caller` throws `TypeError`). Assigning the member always does what JavaScript does: `report.__proto__ = p` sets the prototype, in any frame.

Four names cannot be macros: a class's own `prototype`, `name` and `length`, and its prototype's `constructor`. `macro()` with one of them throws `InvalidArgumentException` naming the word and asking for another name, and `hasMacro()` with one returns `false` (see [Divergences](#divergences)).

## Mixins

`mixin(mixin, replace = true)` registers every method of an object's class, from its prototype chain and its static side, as a macro. Each method must return the function to register. A prototype method is called with `this` the mixin object; a static method is called with `this` the mixin's class, as Laravel's `static::`, so it can call the class's other static methods:

```ts
class ReportMixin {
  subtitle() {
    return function (this: Report) {
      return `${this.title} summary`;
    };
  }
}

Report.mixin(new ReportMixin()); // inside a test frame, as macro() is
```

With `replace` set to `false`, a macro that is already registered is kept.

The mixin's prototype `constructor`, its link to its class, is not a method and is skipped. Any other method the mixin's class declares is registered, `toString` included. A method named `prototype`, `name` or `length`, or a static method named `constructor`, throws `InvalidArgumentException`, as `macro()` does.

## Checking and flushing macros

`hasMacro(name)` returns whether a macro is registered. `flushMacros()` removes every macro of the class. Calling a macro that has been flushed throws `BadMethodCallException` with Laravel's message, `Method App\Support\Report::shout does not exist.`

## Divergences

- **Where macros may be registered (DIV-11.2).** Macros live in the Scope Frame, never in a module variable or a static field (AD-5). Registering one is a base-only write: `macro`, `mixin` and `flushMacros` pass only when the active frame chain (`frameKinds()`) holds a `test` frame and no `request`, `job` or `command` frame. They throw `ScopeFrameException` under a `request`, `job` or `command` frame anywhere in the chain, a test frame opened inside one included; in a chain with no test frame, such as a root `unit` frame or an `interleave` unit (whose origin the read does not follow); and with no active frame (ESC-11.1-3, ESC-11.1-5). A write from a `unit` or narrow frame nested in a test frame, at any depth, lands in the nearest test frame, as AD-5.8 routes it (`decisions/MAINT-2026-10-24-ad-5-8-any-depth.md`). A `test` frame nested in another test holds its own writes, so its macros end with it. The macros apply to that test only and are discarded when it ends, so a Ported Test that registers macros in its body keeps doing so.
- **Methods that were never registered (DIV-12.10).** There is no `__call` / `__callStatic` Proxy (AD-7, AD-26). `macro(name)` installs a dispatcher named `name` on the class's prototype and static side, so a registered or flushed macro dispatches through `__call` / `__callStatic`. The dispatchers stay on the prototype once installed and read the active frame's macros. A name that was never registered has no member, so calling it is a JavaScript `TypeError`, not `BadMethodCallException`. Call `__callStatic(name, parameters)` or `__call(name, parameters)` to get Laravel's `BadMethodCallException` for such a name.
- **Macro names JavaScript reserves on a class (DIV-12.11).** A class's own `prototype`, `name` and `length`, and its prototype's `constructor`, cannot hold a macro dispatcher without breaking the class: `prototype` cannot be redefined, and the others carry the class's name, arity and prototype link. So `macro()` with one of those four names throws `InvalidArgumentException` naming the reserved word and asking for another name, where Laravel registers it. The check runs after the frame check, so with no active frame `ScopeFrameException` comes first. `hasMacro()` with one returns `false`, as for any name never registered, and `mixin()` skips the mixin's prototype `constructor`, its class link (a static method named `constructor` throws, as `macro()` does). Every other name behaves as in Laravel when called directly: a name inherited from `Object.prototype` or `Function.prototype` (`toString`, `call`, `bind`, …) dispatches to the macro, and a member the class or its parents declare still wins. Where the active frame has no entry of such a name for the receiver's class, its dispatcher gives JavaScript's own member (for `__proto__`, `caller` and `arguments`, an accessor that reads JavaScript's own value and always assigns as JavaScript does), so the macro ends with its test (DIV-11.2). While the entry exists, JavaScript's implicit calls (`String(x)`, template literals, `+`, `String(Report)`) and reads of `__proto__`, `caller` or `arguments` reach the dispatcher as well, a consequence of this install that Laravel does not show.

One limit is a follow-up, not a divergence, and lifts when the seam it needs lands; the other follow-up has landed:

- **Registering at boot (ESC-11.1-2).** Laravel registers macros in a service provider's `boot()`. Routing writes made before the Application is `sealed` to that Application's base needs a seam the runtime does not have yet. It lands with the Story that adds the Application's `sealed` state; until then a `macro()` call with no active frame throws `ScopeFrameException`.
- **Child frames (ESC-11.1-3), landed.** `@xaravel/runtime/scope` now exposes the kinds of the active frame chain (`frameKinds()`), so a frame nested in a test frame is told from a root one, and a `request`, `job` or `command` frame anywhere in the chain is seen. A `unit` or narrow frame nested in a test frame at any depth writes to the test frame, as ESC-11.1-5's second bullet says (ESC-11.1-6 left these nested cases to this read), and the guard throws under a `request`, `job` or `command` frame at any depth (DIV-11.2).
