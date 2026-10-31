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
- `registerTrait(fqcn, X)` registers a PHP trait: it stores the class exactly as `registerClass` does and marks it
  with the own, non-enumerable, non-writable, non-configurable `Symbol.for('xaravel.traits.trait')`, so
  `class_exists` is false and `trait_exists` true for it before anything composes it. It throws as `registerClass`
  does, its messages naming `registerTrait()`. A trait file calls it just before its trailing `registerClass`, which
  is then the same-class, same-name no-op (AD-10.3: the file still ends with `registerClass`). `mixin` sets the same
  mark on each trait it composes.
- `registerTestClass(fqcn, X)` registers a test fixture in the nearest `test` frame up the chain. It is resolvable
  there, in that frame's children and in the `interleave` units opened from it, and it is discarded when the test
  ends. Outside a test frame it throws `ScopeFrameException`. A test fixture registered this way cannot be declared a
  trait (there is no test-frame `registerTrait`), so `class_exists` and `trait_exists` tell it apart as a trait only
  once `mixin` composes it.
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
  never registered, so `resolveClass` does not resolve its name; the token table below does.
- `isContractToken(value)` says whether a value is such a token, by the same definition `fqcn()` reads. It is the
  runtime side's one token predicate, and `@xaravel/contracts` uses it. `@xaravel/assert` keeps the grader's copy,
  which XT-contracts-20 pins equal.
- `resolveClass(fqcn)` is the class registered under a name. A test class wins over the base registration. A miss
  throws PHP's `Error` `Class "<FQCN>" not found` (see [PHP exceptions](exceptions.md)), naming the class as given:
  as PHP's `new $name` does, a leading `\` stays in the message (`Class "\App\Missing" not found`), though the lookup
  ignores it. It never imports a file.
- `resolveClassAsync(fqcn)` is the one async miss path (AD-10.4). On a miss it imports the file the classmap gives,
  else the file the PSR-4 map gives, and resolves with the class that file registered.

## Contract tokens

A PHP interface is a contract token, never a registered class (ESC-10.1-3). So that its name still resolves, as PHP's
interface name does, the Registry keeps a separate token table (ESC-13.1-7).

- `registerContractToken(token)` records `token` under its own FQCN, case-insensitive, a leading `\` dropped.
  `@xaravel/contracts`' `contract(...)` calls it for every token it makes (the runtime imports no contract, AD-2). The
  first token recorded under a name stays: a later token under the same name, and the same token again, do nothing,
  since a program PHP accepts never re-declares an interface. A value that is not a contract token throws a `TypeError`
  `registerContractToken(): the value is not a contract token`.
- A name resolves to a registered class first (a test class up the frame chain, then the base), then to a recorded
  token. `new ReflectionClass(name)` and `isSubclassOf(name)` resolve a token's FQCN this way, and `interfaceExists(name)`
  is true for it ([reflection.md](reflection.md)). `resolveClass` and `fqcn` are unchanged.

### The `Symbol.for('xaravel.class.lookup')` protocol

Loading any of the four package entries defines `globalThis[Symbol.for('xaravel.class.lookup')]`: a function from a
class or interface name to what it names, a registered class or a recorded token, else `null`, by the order above. The
grader reads it without importing the runtime, so `assertInstanceOf` and `assertNotInstanceOf` take a class-string as
PHPUnit's do (ESC-13.1-9). It follows `Symbol.for('xaravel.php.classes')`'s install rules
([exceptions.md](exceptions.md)), except that the property is writable and configurable, so a grader test fixture can
layer its own stand-in over it (answering its own names first and delegating the rest) and restore it afterwards; it
stays non-enumerable; loading throws a `LogicException` when the symbol is already defined with another value; and
`XARAVEL_NO_SCOPE_GLOBAL=1` skips the install.

## Autoload and the classmap

- `loadAutoload(packageJsonPath)` reads the PSR-4 map from `package.json`'s `xaravel.autoload.psr-4`, for example
  `{ "App\\": "app/" }`, with directories relative to that file.
- `writeClassmap(path)` writes `bootstrap/cache/classes.json`, as `optimize` does: the loaded classmap, the files
  `resolveClassAsync` imported, and every module file under the PSR-4 map, sorted by FQCN. It encodes with
  `jsonEncode`, which `@xaravel/runtime/registry` installs when it loads.
- `loadClassmap(path)` reads that file back. `resolveClassAsync` consults the classmap before the PSR-4 map.

The PSR-4 map and the classmap are boot state, not per-unit state.
