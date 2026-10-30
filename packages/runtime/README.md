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
- [Userland arguments and returns](docs/php-userland-arguments.md): explicit weak parameter binding and normalized returns.
- [Chunking, sorting, arithmetic and callables](docs/php-chunk-sort-arith-callables.md): PHP builtins and owned generator cleanup.
- [PHP generators and functions](docs/php-functions.md): `Generator`, `keyed` and `yieldFrom` (DIV-12.18), and
  PHP's array, `range` and string functions under their PHP names (`in_array`, `array_unique`, `substr`, …), and the
  process environment and file read (`getenv`, `putenv`, `superglobals`, `file_get_contents`).
- [Traits and `inject` metadata](docs/traits-and-inject.md): `mixin`, trait boot and initialize, `inject`, the Spec
  values and `returns`.
- [PHP reflection and attributes](docs/reflection.md): `ReflectionClass` and its kin over `inject` metadata,
  `Attribute` and `attribute`.

No public method is async except `resolveClassAsync` and `interleave`, which `async-surface.json` lists.
`runInFrame` and `runInRootFrame` return a Promise only when `fn` does: they return `fn`'s result, and a Promise
result settles after the unit's defer list drains.

## Dependencies

None.

## Offset assignment

`offsetAssign(ref, key, value)` is exported from both `@xaravel/runtime/php`
and `@xaravel/runtime`. It supplies PHP offset assignment over any `Ref` value;
`null` key denotes append (`$x[] = $value`). Arrays copy their values, null/false
become arrays, scalar errors retain the receiver, and `ArrayAccess` objects retain
their handles and receive `offsetSet`. Compose it with `offsetReference` for nested
writes: builtin slots write through while userland `offsetGet` values stay detached.
It returns the assigned value; string assignment instead returns the first written
byte, or null for an ignored negative offset. String offsets count UTF-8 bytes and
pad with spaces. A receiver write during RHS string conversion cancels the pending
offset write and returns null, including a write of the same value; conversion
exceptions retain those writes. Under [ESC-9.7-1 §2](../../decisions/ESC-9.7-1.md), a result with no
JS string representation throws a JS `TypeError` naming the UTF-8 limit. It never
replacement-decodes invalid bytes. Notices and the false-to-array deprecation are
omitted under DIV-9.17.
