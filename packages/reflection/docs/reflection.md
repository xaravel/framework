# Reflection

`@xaravel/reflection` ports Laravel 13's `Illuminate\Support\Reflector` and the `Illuminate\Support\Traits\ReflectsClosures` trait. Framework code uses them to read the classes a callable declares for its parameters and return value: Events discovers listeners this way, and Container and Routing inject method parameters.

TypeScript erases types, so these helpers read what the code declares instead of type hints:

- a parameter list from its `inject` map: each key is a parameter, in order, and its Spec is the parameter's type;
- a closure's return type from `returns(spec, fn)`;
- a class's attributes from its `@attribute(...)` decorators.

All of these come from `@xaravel/runtime`, whose PHP reflection classes (`ReflectionClass`, `ReflectionMethod`, `ReflectionFunction`, `ReflectionParameter` and their types) this package is built on. Every method is synchronous, and `null` is the only absent value.

## Declaring types

```ts
import { inject, oneOf, primitive, registerClass, returns, variadic } from "@xaravel/runtime";

class SendShipmentNotification {
  @inject({ event: OrderShipped })
  handle(event: OrderShipped): void {}
}

registerClass("App\\Listeners\\SendShipmentNotification", SendShipmentNotification);

const listener = inject({ event: oneOf(OrderShipped, OrderCancelled), note: primitive }, (event, note) => {});
const factory = returns(Invoice, () => new Invoice());
```

- A class or a contract token is a class type, named by its `fqcn()`.
- `String`, `Number`, `Boolean` and `primitive` (an untyped parameter) are builtin types.
- `oneOf(A, B)` is a union, and `allOf(A, B)` an intersection.
- `variadic(A)` is a variadic parameter of type `A`.
- `self`, `parent` and `static` are PHP's relative hints.
- A closure with no parameters is declared `inject({}, fn)`.

## `Reflector`

All methods are static.

- `Reflector.getParameterClassName(parameter)` gives the class name of a `ReflectionParameter`'s type, or `null` for a builtin type or a union. `self` gives the declaring class's FQCN, and `parent` its parent's. A closure's parameter has no declaring class, so `self` and `parent` stay as written, as does `parent` on a class with no registered parent.
- `Reflector.getParameterClassNames(parameter)` gives the class names of the type as a list, a union's classes in order. Builtin members are dropped, so a builtin type gives `[]`.
- `Reflector.isParameterSubclassOf(parameter, className)` tells whether the parameter's class is a subclass of `className` (a class, a contract token, or the FQCN of either). The parameter's type must name a registered class (PHP's `class_exists`) or a contract token that `contract(...)` recorded (PHP's `interface_exists`, the runtime's `interfaceExists`). So an interface works as in Laravel: a parameter typed by token `IB`, declared `contract('App\\IB', {}, [IA])`, is a subclass of `IA`, but not of `IB` itself. It throws `ReflectionException` when `className` is an FQCN that names neither.
- `Reflector.isParameterBackedEnumWithStringBackingType(parameter)` tells whether the parameter's type is a backed enum whose backing type is `string`. An enum is a registered class whose static side has a `cases` function, and a backed one declares `static backingType = "string"` or `"int"` (AD-26); the runtime's `enumExists` and `ReflectionEnum` read it. A union, a builtin or untyped parameter, a pure or `int`-backed enum, and any other class give `false`.
- `Reflector.isCallable(value, syntaxOnly = false)` is PHP 7.4's `is_callable`:
  - A closure, and an object whose `__invoke` is a function, are callable.
  - A registered class on its own stands for its class-string, so it is not callable.
  - `[classOrObject, 'method']` is callable when the class has the method, or has `__call` (for an object) or `__callStatic` (for a class). The class is a registered constructor, an object's class, or an FQCN the Class Registry resolves.
  - A `'Class::method'` string is callable when `[Class, method]` is.
  - Any other string is not callable, except under `syntaxOnly`, where any string is.
  - Under `syntaxOnly`, `[stringOrObjectOrClass, 'method']` (a string, an object, or a class, registered or not) is callable without looking the method up.
  - It never throws.
- `Reflector.getClassAttribute(objectOrClass, attribute, ascend = false)` gives the first `attribute` instance on the class's own `@attribute(...)` list, or `null`. With `ascend`, it then checks each parent class. Every matching attribute on the classes it checks is built (`newInstance()`) before the first is returned, as Laravel builds the whole collection first. It throws `ReflectionException` for an FQCN the Class Registry does not hold.
- `Reflector.getClassAttributes(objectOrClass, attribute, includeParents = false)` returns a `Collection` in Laravel. Collections is not ported yet, so it throws `BlockedByComponentError("collections")`.

```ts
const method = new ReflectionClass(SendShipmentNotification).getMethod("handle");

Reflector.getParameterClassName(method.getParameters()[0]); // "App\\Events\\OrderShipped"
Reflector.isCallable([SendShipmentNotification, "handle"]); // true
```

## `ReflectsClosures`

Mix the trait into a class with `mixin` from `@xaravel/runtime`. Its methods are `protected`, as in Laravel:

```ts
import { ReflectsClosures } from "@xaravel/reflection";
import { mixin, registerClass } from "@xaravel/runtime";

class Dispatcher extends mixin(null, ReflectsClosures) {
  listen(closure: (...args: never[]) => unknown): string {
    return this.firstClosureParameterType(closure);
  }
}

registerClass("App\\Support\\Dispatcher", Dispatcher);
```

- `closureParameterTypes(closure)` gives an object keyed by parameter name, in order, whose values are the class names. A builtin, untyped, union or variadic parameter gives `null`.
- `firstClosureParameterType(closure)` gives the first parameter's class name.
- `firstClosureParameterTypes(closure)` gives the first parameter's class names, a union's included.
- `closureReturnTypes(closure)` gives the return type's class names: the class, or a union's classes in order. It leaves out builtins, `self` and `static`. It gives `[]` with no `returns(...)` declaration, or for an intersection.

The two `first…` methods throw `RuntimeException` `The given Closure has no parameters.`, or `The first parameter of the given Closure is missing a type hint.` when the first parameter names no class.

A closure with no `inject` declaration at all has no parameter list to read. Reading its parameters throws a `RuntimeException` that names the `inject({ <param>: <Spec> }, fn)` form.

`classUsesRecursive(Dispatcher)` names the trait by its Laravel FQCN, `Illuminate\Support\Traits\ReflectsClosures`.

## Divergences

- **Parameter types come from `inject` (DIV-3.2).** PHP's reflection classes read a callable's `inject` map. `self` and `parent` are Spec markers, which `Reflector` resolves against the declaring class.
- **Untyped, variadic and undeclared closures (DIV-3.3).** An untyped parameter is declared `primitive`, a variadic one `variadic(X)`, and a closure with no parameters `inject({}, fn)`. A closure with no `inject` declaration throws `RuntimeException`, where Laravel reads the closure's own hints.
- **Return types come from `returns` (DIV-3.4).** A closure's return hint is declared `returns(spec, fn)`. Without one, `closureReturnTypes` gives `[]`.
- **`isCallable` (DIV-9.14).** A class is a constructor or an FQCN string. TypeScript's `private` and `protected` are erased, so any method reachable by name counts as public, and a `#private` method is never found. JavaScript has no PHP global functions, so a plain function-name string such as `'strtoupper'` is not callable (except under `syntaxOnly`).
- **No lazy objects (DIV-12.14).** Laravel's `lazy()` and `proxy()` helpers build PHP 8.4 lazy objects, which need a JavaScript `Proxy`. Xaravel does not port them.
- **Attributes are decorators (DIV-12.15).** A PHP attribute `#[X(args)]` is written `@attribute(X, ...args)`. Attributes match by `instanceof`.
- **Plain arrays and objects for `Collection`.** `ReflectsClosures` returns plain arrays and objects where Laravel builds them with `Collection` and returns its `all()` array.

### Rulings this package follows

The Maintainer's rulings on Story 13.1's Escalations (`decisions/MAINT-2026-10-25-story-13-1.md` and `decisions/MAINT-2026-10-25-story-13-1-second.md`) settle these points:

- Interface names resolve through the contract tokens `contract(...)` records, so `isParameterSubclassOf` works for an interface hint (ESC-13.1-7).
- A backed enum declares `static backingType`, which `isParameterBackedEnumWithStringBackingType` reads through `ReflectionEnum` (ESC-13.1-8).
- `assertInstanceOf` accepts the class-string `firstClosureParameterType` returns, as PHPUnit's does, so Laravel's test of it is ported unchanged (ESC-13.1-9).
- `Reflector.getClassAttributes` throws `BlockedByComponentError("collections")` until Collections (Epic 14) is ported, and its Laravel test is `blocked-by:collections` until then (ESC-13.1-10).
- Laravel's tests that reflect the Mail and Bus fakes and `Model` wait on those Components (`blocked-by:mail`, `blocked-by:bus`, `blocked-by:database`).
