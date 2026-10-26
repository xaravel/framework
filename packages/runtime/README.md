# @xaravel/runtime

Xaravel runtime primitives: Scope Frames, the Class Registry, PHP values and codecs. Part of Xaravel, a TypeScript port of Laravel.

It has no Upstream Laravel package of its own.

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## Documentation

- [Scope Frames and propagation](docs/scope-frames.md): `@xaravel/runtime/scope`, per-unit state, `interleave`.
- [The Class Registry](docs/class-registry.md): `@xaravel/runtime/registry`, `registerClass`, `fqcn`, autoload.
- [PHP values and semantics helpers](docs/php-values.md): `PhpArray`, `Ref`, the float marker, the array helpers,
  the type names (`gettype`, `getDebugType`), comparison and casts.
- [The serialize and JSON codecs](docs/codecs.md): `phpSerialize`, `phpUnserialize`, `jsonEncode`, `jsonDecode`.
- [PHP exceptions and the protocol](docs/exceptions.md): PHP's `Exception`, `Error` and SPL classes.
- [PHP built-in interfaces and SPL classes](docs/php-builtins.md): `Traversable`, `Throwable` and kin as tokens,
  `ArrayIterator`, `ArrayObject`, `CachingIterator` and `WeakMap`.
- [Traits and `inject` metadata](docs/traits-and-inject.md): `mixin`, trait boot and initialize, `inject`, the Spec
  values and `returns`.
- [PHP reflection and attributes](docs/reflection.md): `ReflectionClass` and its kin over `inject` metadata,
  `Attribute` and `attribute`.

No public method is async except `resolveClassAsync` and `interleave`, which `async-surface.json` lists.
`runInFrame` and `runInRootFrame` return a Promise only when `fn` does: they return `fn`'s result, and a Promise
result settles after the unit's defer list drains.

## Dependencies

None.
