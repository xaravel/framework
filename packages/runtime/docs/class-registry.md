# The Class Registry

`@xaravel/runtime/registry` is Xaravel's single class identity (AD-10): a process-wide map from PHP FQCN to class.
Names are case-insensitive, as PHP's are, and a leading `\` is ignored. Everything here is exported from
`@xaravel/runtime/registry` and from the package root.

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
  there and in that frame's children, and it is discarded when the test ends. Outside a test frame it throws
  `ScopeFrameException`.
- `RegisteredClass` is the type of what the Registry stores: any class.

`registration:check` fails a `registerClass` call whose class is not declared in the same file.

## Resolving

- `fqcn(classOrInstance)` is the FQCN a class, or an instance's class, was registered under. It throws for an
  unregistered class. Never use `constructor.name` for identity.
- `resolveClass(fqcn)` is the class registered under a name. A test class wins over the base registration. A miss
  throws PHP's `Error` `Class "<FQCN>" not found` (see [PHP exceptions](exceptions.md)). It never imports a file.
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
