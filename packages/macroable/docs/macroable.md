# Macroable

`@xaravel/macroable` ports Laravel 13's `Illuminate\Support\Traits\Macroable` trait. Many Laravel classes are "macroable": you can add methods to them at run time. Laravel's documentation shows the pattern on collections, strings, responses, requests and other classes; this page describes the trait those classes share.

## Using the trait

Traits are runtime mixins in Xaravel. Mix `Macroable` into a class with `mixin` from `@xaravel/runtime`:

```ts
import { Macroable } from "@xaravel/macroable";
import { mixin, registerClass } from "@xaravel/runtime";

export class Report extends mixin(null, Macroable) {
  title = "Q3";
}

registerClass("App\\Support\\Report", Report);
```

`classUsesRecursive(Report)` names the trait by its Laravel FQCN, `Illuminate\Support\Traits\Macroable`. Subclasses share the macros of the class that uses the trait, as they share Laravel's `static::$macros`.

## Registering a macro

`macro(name, macro)` registers a function under `name`:

```ts
Report.macro("shout", function (this: Report, suffix: string) {
  return this.title.toUpperCase() + suffix;
});

new Report().shout("!"); // "Q3!"
```

A macro can be called on an instance, through the prototype, or statically:

- In an instance call, `this` is the instance, as Laravel binds `$this`.
- In a static call (`Report.shout("!")`), `this` is the called class, as Laravel binds `static::`.
- Write a macro as a `function` expression so it can be bound. An arrow function keeps its own `this`, as a PHP `static function` does.
- A macro may also be an object with an `__invoke` method; it is called as is.

Macros are typed through module augmentation, or with `declare` members on your own class:

```ts
declare module "./Report" {
  interface Report {
    shout(suffix: string): string;
  }
}
```

A macro never replaces a real method of the same name: the real method runs, as in PHP. `__call(method, parameters)` and `__callStatic(method, parameters)` call a macro by name directly.

## Mixins

`mixin(mixin, replace = true)` registers every method of an object's class as a macro. Each method is called with `this` the mixin object, and must return the function to register:

```ts
class ReportMixin {
  subtitle() {
    return function (this: Report) {
      return `${this.title} summary`;
    };
  }
}

Report.mixin(new ReportMixin());
```

With `replace` set to `false`, a macro that is already registered is kept.

## Checking and flushing macros

`hasMacro(name)` returns whether a macro is registered. `flushMacros()` removes every macro of the class. Calling a macro that has been flushed throws `BadMethodCallException` with Laravel's message, `Method App\Support\Report::shout does not exist.`

## Divergences

- **Where macros may be registered (DIV-11.2).** Macros live in the Scope Frame, never in a module variable or a static field (AD-5). Registering one is a base-only write: `macro`, `mixin` and `flushMacros` throw `ScopeFrameException` inside a `request`, `job` or `command` frame, and with no active frame. Inside a test frame the macros apply to that test only and are discarded when it ends, so a Ported Test that registers macros in its body keeps doing so.
- **Registering at boot (ESC-11.1-2, open).** Laravel registers macros in a service provider's `boot()`. Routing writes made before the Application is `sealed` to that Application's base needs a seam the runtime does not have yet, so a `macro()` call with no active frame throws until the Escalation is ruled.
- **Child frames (ESC-11.1-3, open).** The runtime shows only the innermost frame's kind, so a unit nested inside a `request`, `job` or `command` frame is not recognised as one, and a write there is held by that unit instead of throwing.
- **Methods that were never registered (ESC-11.1-1, open).** There is no `__call` / `__callStatic` Proxy (AD-7, AD-26, DIV-12). `macro(name)` installs a dispatcher named `name` on the class's prototype and static side, so a registered or flushed macro dispatches through `__call` / `__callStatic`. The dispatchers stay on the prototype once installed and read the active frame's macros. A name that was never registered has no member, so calling it is a JavaScript `TypeError`, not `BadMethodCallException`.
