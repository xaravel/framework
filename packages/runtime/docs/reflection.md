# PHP reflection and attributes

`@xaravel/runtime/php` (and the package root) defines the part of PHP's reflection API that `Reflector`,
`ReflectsClosures` and their tests call (DIV-3.2 to DIV-3.4, DIV-12.15). TypeScript erases parameter and return
types, so reflection reads what the code declares instead:

- a parameter list from its `inject` map ([traits-and-inject.md](traits-and-inject.md)): each key is a parameter, in
  order, and its Spec is the parameter's type;
- a return type from `returns(spec, fn)`;
- a class's attributes from its `@attribute(...)` decorators.

Each class is registered under its PHP name (`fqcn(ReflectionClass)` is `ReflectionClass`), but none is one of the
built-ins `Symbol.for('xaravel.php.classes')` publishes ([exceptions.md](exceptions.md)). Every member is sync.
`null` is the absent value, except `getParentClass()`, which gives `false` as PHP does.

## Types

A Spec reads as a type:

| Spec | Type | `getName()` | `isBuiltin()` | `getClassOrToken()` |
| --- | --- | --- | --- | --- |
| a class or a contract token | `ReflectionNamedType` | its `fqcn()` | false | the class or token |
| `String`, `Number`, `Boolean` | `ReflectionNamedType` | `string`, `float`, `bool` | true | `null` |
| `primitive` | `ReflectionNamedType` | `mixed` | true | `null` |
| `self`, `parent`, `static` | `ReflectionNamedType` | `self`, `parent`, `static` | false | `null` |
| `oneOf(...)` | `ReflectionUnionType` | | | |
| `allOf(...)` | `ReflectionIntersectionType` | | | |

`Number` reads as `float`, the PHP hint that accepts every JS number. `getTypes()` on a union or an intersection gives
its members in declaration order; an `allOf(...)` member of a union is a `ReflectionIntersectionType`. The relative
markers stay unresolved, so `Reflector` resolves them against the parameter's declaring class (DIV-3.2). Any other
value (`5`, an unregistered class, an object shaped like a Spec value) throws a `TypeError` when its type is read.

`getClassOrToken()` is a Xaravel addition (DIV-3.2; `decisions/MAINT-2026-10-25-epic-13-items.md`, item 5): the
class or contract token the Spec holds, which `getName()` names, so a caller can reflect the type's own value instead
of resolving its name again. Two tokens recorded under one FQCN give the same name, while the Registry's lookup by
that name gives the first one (ESC-13.1-7); each type keeps its own token. A union's or an intersection's members
carry theirs, and `ReflectionEnum`'s backing type, a builtin, gives `null`.

Errors. A misuse of a Spec, `attribute()` or a filter throws the JS `TypeError`, as `inject` does. An argument of the
wrong type to a PHP constructor or method (`ReflectionClass::__construct(): Argument #1 ($objectOrClass) must be of
type object|string, int given`, and the same for `ReflectionMethod`, `ReflectionFunction` and `isSubclassOf`) throws
PHP's `TypeError` with PHP 8.5's message, so ported code that catches PHP's `TypeError` sees it.

## `ReflectionFunction`

`new ReflectionFunction(fn)` reflects a closure.

- `getParameters()` gives one `ReflectionParameter` per key of `fn`'s `inject` map, in order. A closure declared
  `inject({}, fn)` has none. A closure with no `inject` declaration at all throws a `RuntimeException` naming the
  `inject({ <param>: <Spec> }, fn)` form (DIV-3.3).
- `getReturnType()` gives the type of `fn`'s `returns` Spec, or `null` without one.

PHP's global functions have no runtime table (DIV-9.13), so a function name string throws a `ReflectionException`
`Function <name>() does not exist`.

## `ReflectionParameter`

`getName()` (and the `name` property), `getType()`, `isVariadic()` and `getDeclaringClass()`. A
`variadic(spec)` parameter is variadic and its type is `spec`'s. A method's parameter is declared by the method's
class; a closure's `getDeclaringClass()` is `null`, JS keeping no class scope.

## `ReflectionClass`

`new ReflectionClass(x)` takes a class, an object (its class), a contract token (PHP's interface), a registered FQCN
string, or the FQCN of a recorded token. `contract(...)` records each token it makes with `registerContractToken`
(ESC-13.1-7; see [class-registry.md](class-registry.md)), so a token's FQCN resolves to the token, after the
registered classes. A name that is neither throws a `ReflectionException` `Class "<name>" does not exist`, the name as
given.

- `name` and `getName()`: the FQCN.
- `getParentClass()`: the nearest registered class up the constructor chain, or `false`. An unregistered class on the
  chain (a `mixin()` layer, the JS `Error` under PHP's `Exception`) is skipped. A token has none.
- `isSubclassOf(t)`, `t` a class, a token, a `ReflectionClass`, a registered FQCN or a recorded token's FQCN: a class
  against a class is the strict constructor chain; a class against a token is `hasBrand`; a token against a token
  walks the token's parents (`Symbol.for('xaravel.contract.parents')`). Never itself.
- `getMethod(name)`: a `ReflectionMethod`, or a `ReflectionException` `Method <FQCN>::<name>() does not exist`.
- `getAttributes(filter)`: see below.

## `ReflectionEnum`

An enum is a registered class whose static side has a `cases` function (AD-26); a backed enum also declares
`static backingType`, `'string'` or `'int'`. `new ReflectionEnum(x)` extends `ReflectionClass` and takes an enum
class, one of its cases, or its FQCN. A class or token that is not an enum throws a `ReflectionException`
`Class "<FQCN>" is not an enum`; a name nothing holds, `Class "<name>" does not exist`.

- `isBacked()`: whether the enum declares `backingType`.
- `getBackingType()`: a builtin `ReflectionNamedType` named `string` or `int`, or `null` for a pure enum.

A `backingType` other than `'string'` or `'int'` makes both throw PHP's `TypeError`.

## `interfaceExists` and `enumExists`

PHP's `interface_exists($interface)` and `enum_exists($enum)`, named as PORTING.md names PHP functions.
`interfaceExists(name)` is true when `name` names a recorded contract token and no registered class;
`enumExists(name)` when it names a registered enum class. Names are case-insensitive, a leading `\` ignored. Both
read only what is loaded, as `resolveClass` does: there is no `$autoload` parameter (AD-10.4). A non-string throws
PHP's `TypeError`, `interface_exists(): Argument #1 ($interface) must be of type string, int given` (`enum_exists(): Argument #1 ($enum) …`).

## `ReflectionMethod`

`new ReflectionMethod(objectOrClass, name)`, or `getMethod(name)`, finds a function-valued member on the class's
prototype chain (never `constructor`), else on its static chain. Its declaring class is the class that owns it; for a
method a `mixin()` layer holds, the using class.

- `name`, `class` (the declaring FQCN), `getName()` and `getDeclaringClass()`.
- `getParameters()`: from the method's own `@inject({ … })` map, each declared by the method's class. A method with
  no `inject` throws a `RuntimeException` naming the `@inject({ <param>: <Spec> })` form (DIV-3.3).
- `getReturnType()`: the type of the method's `returns` Spec, or `null`. `returns(spec, fn)` has no decorator form,
  so only a function-valued member wrapped in `returns(...)` carries one (for example a static field,
  `static build = returns(self, () => …)`); a prototype method has no way to declare a return Spec.
- `isPublic()`, which is always true: TypeScript's `private` and `protected` are erased (DIV-9.14).
- `invoke(object, ...args)` and `invokeArgs(object, args = [])` port `reflection_method_invoke` (ESC-14.1-10): they
  call the method whatever its visibility, as PHP 8.1 and later do, and return its result (`undefined` read as
  `null`). A static method (one found on the static chain) ignores `object` and runs with the reflected class as
  `this`, PHP's called scope, so `new ReflectionMethod(Child, 'make').invoke(null)` runs `make` on `Child`. An instance
  method runs on `object`, which must be an instance of the declaring class: `null` throws a `ReflectionException`
  `Trying to invoke non static method <C>::<m>() without an object`, another object `Given object is not an instance
  of the class this method was declared in`. An `object` that is neither an object nor `null` throws PHP's
  `TypeError` (`ReflectionMethod::invoke(): Argument #1 ($object) must be of type ?object, int given`; a class
  constructor or a contract token is a string there). `invokeArgs` takes the AD-9 array forms and passes the values
  in order; a string key, PHP's named argument, throws a JS `TypeError` naming the limit: named arguments are not
  ported. An `args` that is no array throws PHP's `TypeError`.
- `setAccessible(accessible)`: the no-op it has been since PHP 8.1. It takes a bool (PHP's `TypeError` otherwise) and
  returns `null`.

## Attributes

A PHP attribute `#[X(args)]` on a class is written `@attribute(X, ...args)` (DIV-12.15). `attribute(X, ...args)` returns an
`AttributeDecorator`, which records `{ class: X, args }` in the class's own attribute list in `Symbol.metadata`, in source
order; nothing is built yet. A non-class `X`, or a target other than a class, throws a `TypeError`.

```ts
@attribute(Attribute, Attribute.TARGET_CLASS | Attribute.IS_REPEATABLE)
class StrAttr {
  constructor(public string: string) {}
}

@attribute(StrAttr, "quick")
@attribute(StrAttr, "brown")
class ChildClass extends ParentClass {}
```

`ReflectionClass.getAttributes(filter)` gives the class's own entries as `ReflectionAttribute`s, those whose class is
`filter` or extends it (`instanceof`), or all of them without a filter. A parent's attributes are never included, as in
PHP. A `filter` that is not a class throws a `TypeError`.

`ReflectionAttribute` has `getName()` and `newInstance()`, which builds a new `X(...args)` on each call after PHP 8.5's checks, each a PHP `Error`:

- `X` carries no `@attribute(Attribute, …)` of its own: `Attempting to use non-attribute class "X" as attribute`. An
  attribute class's subclass is not an attribute class unless it declares one too.
- The flags are not an integer in 0 to 255: `Invalid attribute flags specified`.
- The flags do not include `TARGET_CLASS`: `Attribute "X" cannot target class (allowed targets: …)`.
- `X` appears more than once on the class without `IS_REPEATABLE`: `Attribute "X" must not be repeated`.

`Attribute` is PHP's class, with PHP 8.5's flags: `TARGET_CLASS` 1, `TARGET_FUNCTION` 2, `TARGET_METHOD` 4,
`TARGET_PROPERTY` 8, `TARGET_CLASS_CONSTANT` 16, `TARGET_PARAMETER` 32, `TARGET_CONSTANT` 64, `TARGET_ALL` 127 and
`IS_REPEATABLE` 128. `new Attribute(flags = Attribute.TARGET_ALL)` keeps them in `flags`. It is itself an attribute
class targeting classes, as PHP declares it.

## `ReflectionException`

PHP's `ReflectionException`, an `Exception`.

## Not ported

- `ReflectionEnumBackedCase`, `ReflectionEnum`'s `getCases()` / `getCase()`, `ReflectionProperty`, `ReflectionType` as a base class, and any member not listed above.
- Named arguments to `ReflectionMethod::invokeArgs` (a string key throws a JS `TypeError`).
- Attributes on methods, properties, parameters and constants, and `getAttributes`' flags argument (the filter is
  always `instanceof`).
- `lazy()` / `proxy()` (DIV-12.14).
- Reading `Function.prototype.toString()`: an undeclared closure's parameters are not guessed.
