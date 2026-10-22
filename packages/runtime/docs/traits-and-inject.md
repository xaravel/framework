# Traits and `inject` metadata

`@xaravel/runtime` is the only home of PHP trait composition (AD-26, Traits row) and of the `inject` metadata writer
and the `Symbol.metadata` polyfill (AD-4). Everything here is exported from the package root and is synchronous.

## Writing a trait

A trait is a registered class:

```ts
import { registerClass } from "@xaravel/runtime";

export class SoftDeletes {
  forceDeleting = false;
  static bootSoftDeletes(): void {}
  initializeSoftDeletes(): void {}
  forceDelete(): void {}
}

registerClass("Illuminate\\Database\\Eloquent\\SoftDeletes", SoftDeletes);
```

A trait that uses traits extends a layer with no base: `class HasA extends mixin(null, Inner) { … }`.

A class that uses traits extends a layer over its parent. PHP's `class Post extends Model { use HasA, HasB; }` is
written `class Post extends mixin(Model, HasA, HasB) { … }`. The returned class has the instance and static members of
the base and of every trait, both at run time and in its types.

## Composition rules

`mixin(Base | null, ...traits)` returns a new class, the layer, which extends `Base` (or nothing). Members resolve as
PHP's do: the class's own members first, then the traits' members, then `Base`'s. For each trait, in order:

- Prototype methods and accessors, with string and symbol keys, are copied onto the layer's prototype.
- Static methods, accessors and data are copied onto the layer (string keys only). Static data is copied with
  `valueCopy`, so each using class gets its own copy of a trait's static arrays, as PHP does.
- Instance property defaults are read once from a trait instance. The layer's constructor calls `super(...args)` and
  then assigns a copy of each default, by the trait-default rule below.
- A trait's members are its own members plus those of the traits it uses. Its own members win.

Conflicts:

- **Diamond.** A member reached twice from the same declaring trait is applied once. An example is `HasA` and `HasC`
  both using `Inner`.
- **Method collision.** When two different traits declare the same method, the layer gets a method that throws PHP's
  `Trait method B::m has not been applied as X::m, because of collision with A::m` when it is called. A class that
  overrides the method resolves the collision, as in PHP.
- **Property collision.** When two traits declare the same property with different defaults, `mixin` throws, naming
  both traits and the property. Identical defaults are compatible.

`instanceof` is true for the base and false for a trait, as PHP's `instanceof` is for a trait.

### `super` and field timing

- Inside a trait method, `super` refers to the trait's own parent, not to the using class's parent. Port
  `parent::m()` inside a trait by naming the method on the using class's parent explicitly. Inside the using class,
  `super.m()` reaches the trait's `m` first, and the base's `m` after that. PHP's `as` aliases port as a method on the
  class that calls `super.<m>()`.
- Trait field defaults are assigned after the base constructor returns, as JS class fields are. A base constructor
  therefore does not see them. A host that calls `initializeTraits` from its constructor must do so in the class that
  declares the fields, after they are set, since a subclass's fields are set only after its parent's constructor
  returns.

### Trait defaults against a base property

When a trait declares an instance property the base also has, PHP's trait default takes the place of the parent's
default, and a write made later (an `initialize<Trait>` that the constructor calls) wins over both. The layer can only
assign defaults after `super(...args)` returns, so it decides per key (decisions/ESC-9.9-2.md):

- A key the instance does not own gets the trait's default.
- A key the instance owns gets the trait's default only when `propertyTable(Base)` (the PHP property table of the base
  and its parents) lists a public or protected property of that name and the instance's value is still PHP-identical
  to its declared default. Nothing has written it, so the trait's default replaces it, as in PHP.
- Any other value is kept: the table does not list the name, no class in the chain declares a table, or the value
  differs from the declared default. A write made in the base constructor survives, as in PHP. A private base property
  is a separate PHP slot, so it never counts as the base's default. PHP then reads the trait's default from outside
  and the base's from the base's own methods; one JS slot cannot hold both, and which one Xaravel keeps awaits a ruling
  (ESC-9.9-3).

Two cases differ from PHP (DIV-12.8):

1. **No table.** When no property table of the base chain lists the name, the layer cannot tell a base field from a
   constructor write, and keeps the base's value. PHP has the trait's default.
2. **An unchanged-looking write.** When the base constructor writes a value PHP-identical to the declared default, the
   layer cannot tell it from the untouched default, and applies the trait's default. PHP keeps the written value.

A Ported Test whose outcome depends on either case raises an Escalation (FR-114); it is not adapted.

## `classUsesRecursive`

`classUsesRecursive(classOrInstanceOrFqcn)` is Laravel's `class_uses_recursive`. It walks each class from the root
ancestor down to the class. For each one it takes the traits that class uses directly, then appends the traits those
traits use, recursively. The result is de-duplicated, keeping the first position. Layers are not classes. Trait names
come from `fqcn()`, so an unregistered trait throws. A string argument is resolved with `resolveClass`.

The result is a PHP array FQCN ⇒ FQCN in AD-9 form: a plain object, or `[]` when there are none.

## `bootTraits`, `initializeTraits`, `clearBootedTraits`

These follow Model's `bootTraits` / `initializeTraits`.

`bootTraits(X)` boots a class at most once. The booted record is a non-enumerable own symbol property of `X`, so a
subclass boots on its own. A later call is a no-op until `clearBootedTraits(X)`, the host's equivalent of
`Model::clearBootedModels()`. To boot, it walks X's method table in PHP's order:

1. X's own methods.
2. Each direct trait's table, in use order: the trait's own methods, then its used traits'.
3. The parent class's table.

The first occurrence of a name wins. Static `boot<Basename>` methods are called with `this = X`, for every trait in
`classUsesRecursive(X)`. Prototype `initialize<Basename>` methods are recorded in table order. The record is stored
before any boot method runs, so an instance created during boot does not boot again.

`initializeTraits(instance)` boots the instance's class if needed, then calls each recorded initializer. The host
calls it once per instance, from its constructor, as Model does.

## `Symbol.metadata` and `inject`

Importing any runtime entry (the root, `scope`, `registry` or `php`) installs `Symbol.metadata` as
`Symbol.for('Symbol.metadata')` when it is undefined. Bun 1.4.3 has no native one. The conformance harness freezes
`Symbol` before tests load, after installing the same `Symbol.metadata` itself, so under the harness the polyfill finds
it defined (ESC-9.9-1). The polyfill still skips a non-extensible `Symbol`, and `inject` reads the registered symbol
when `Symbol.metadata` is undefined.

`inject` has two forms:

- `inject(map)` is a TC39 decorator for a class (its constructor) or for an instance or static method.
- `inject(map, fn)` stores the map on `fn` and returns `fn`.

The map's keys are the parameter names, in order. It is copied once into a frozen null-prototype object. Where it is
stored depends on the target:

- For a class, it goes into `context.metadata`, so a subclass without its own `inject` inherits it.
- For a method or function, it goes into the function's own metadata, so an override without `inject` has none.

`readInjectMetadata(target)` returns the map, or `null`.

Invalid input throws a `TypeError` naming AD-4:

- a map that is not a plain object;
- a key that is not an identifier;
- an `undefined` or `null` value;
- a decorator kind other than `class` or `method`.

## Not supported

- `insteadof`. None of Upstream's traits needs it.
- `as` aliases. Port each one as a class method, as above.
- Trait constructors.
- Eloquent's `#[Boot]` / `#[Initialize]` attributes, which belong to Model's own loop.
- Interpreting `inject` specs, which is the Container's job (Epic 18).
