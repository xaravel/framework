# The Class Registry

`@xaravel/runtime/registry` is Xaravel's single class identity (AD-10): a process-wide map from PHP FQCN to class.
Names are case-insensitive, as PHP's are, and a lookup ignores a leading `\`; the not-found message keeps the name as
given. Everything here is exported from `@xaravel/runtime/registry` and from the package root.

## Registering

Every framework class file ends with its registration:

```ts
import { registerClass } from "@xaravel/runtime";

export class Post extends Model {}

registerClass("App\\Models\\Post", Post);
```

- `registerClass(fqcn, X)` stores the class. Registering the same class under the same name again does nothing.
  Registering a different class under a taken name throws, and so does registering a class under a second FQCN. It
  also sets the grader's class-name brand, `X[Symbol.for('xaravel.class.fqcn')]`.
- `registerTestClass(fqcn, X)` registers a test fixture in the nearest `test` frame up the chain. It is resolvable
  there, in that frame's children and in the `interleave` units opened from it, and it is discarded when the test
  ends. Outside a test frame it throws `ScopeFrameException`.
- A test class's brand is an own accessor, so concurrent test frames that register one class under different names
  each read their own. It reads the name the nearest test frame up the active chain holds the class under, else the
  brand the class inherits, else `null`, so no test's name outlives the test. A subclass shows its parent's name. A
  later `registerClass` of the class replaces the accessor with its fixed brand.
- While a test frame that registered a class runs, `registerClass` refuses the same name for another class, from any
  frame, a sibling test's included: `registerClass(): <FQCN> is already registered to another class in a running
  test`. It also refuses a class that such a test holds under another FQCN: `registerClass(): the class registered
  as <FQCN> in a running test cannot also be registered as <name>`. Once the test ends, the name and the class are
  free again. Only base `registerClass` is refused: `registerTestClass` in a sibling test may still take that name for
  another class, since each test sees only its own test classes (XT-runtime-14).
- `RegisteredClass` is the type of what the Registry stores: any class.

`registration:check` fails a `registerClass` call whose class is not declared in the same file.

## Resolving

- `fqcn(classOrInstance)` is the FQCN a class, or an instance's class, was registered under. It throws for an
  unregistered class. Never use `constructor.name` for identity. A `contract<T>()` token gives its own FQCN: a frozen,
  non-function object whose own, non-writable `Symbol.for('xaravel.class.fqcn')` data property is a string. A token is
  never registered, so `resolveClass` does not resolve its name.
- `resolveClass(fqcn)` is the class registered under a name. A test class wins over the base registration. A miss
  throws PHP's `Error` `Class "<FQCN>" not found` (see [PHP exceptions](exceptions.md)), naming the class as given:
  as PHP's `new $name` does, a leading `\` stays in the message (`Class "\App\Missing" not found`), though the lookup
  ignores it. It never imports a file.
- `resolveClassAsync(fqcn)` is the one async miss path (AD-10.4). On a miss it imports the file the classmap gives,
  else the file the PSR-4 map gives, and resolves with the class that file registered.

## Autoload and the classmap

- `loadAutoload(packageJsonPath)` reads the PSR-4 map from `package.json`'s `xaravel.autoload.psr-4`, for example
  `{ "App\\": "app/" }`, with directories relative to that file.
- `writeClassmap(path)` writes `bootstrap/cache/classes.json`, as `optimize` does: the loaded classmap, the files
  `resolveClassAsync` imported, and every module file under the PSR-4 map, sorted by FQCN. It encodes with
  `jsonEncode`, which `@xaravel/runtime/registry` installs when it loads.
- `loadClassmap(path)` reads that file back. `resolveClassAsync` consults the classmap before the PSR-4 map.

The PSR-4 map and the classmap are boot state, not per-unit state.
