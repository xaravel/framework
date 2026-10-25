---
test_ids:
  - XT-reflection-4
trigger: divergence
proposed: >-
  Option 1 (recommended): the `lazy()` and `proxy()` helpers are not
  ported. A new DIV clause records that PHP 8.4 lazy objects
  (`ReflectionClass::newLazyGhost` / `newLazyProxy`) need engine support
  that JavaScript gives only through a `Proxy`, which AD-7 allows only on
  `Model`. `conformance/api-surface/exceptions.jsonl` gains one entry for
  each function, citing the clause. Laravel's own source never calls
  either helper, so no framework behaviour depends on them. Option 2: list
  both as `deferred:` items in `exceptions.jsonl`, to be ported if a later
  ruling allows a lazy-object Proxy. Option 3: port `lazy()` eagerly (the
  callback runs at once) and `proxy()` as the callback's result. That
  silently drops the laziness that is the helpers' whole contract, so it
  is not recommended.
evidence: >-
  `lazy()` builds `ReflectionClass::newLazyGhost(...)` and `proxy()` builds
  `newLazyProxy(...)`, each also setting eager properties through
  `setRawValueWithoutLazyInitialization`
  (framework/src/Illuminate/Reflection/helpers.php). The api-surface export
  lists both functions (conformance/api-surface/reflection.jsonl), so
  XT-reflection-4's close gate (`bun run api-surface:gate reflection`, 0
  unexplained members) cannot pass without them or an
  `exceptions.jsonl` entry. That file is a Protected Path and needs a DIV
  or `deferred:` citation (spine § API-surface parity). A ghost object
  must run its initializer on the first read of any property. A TS class's
  fields are own properties created by its constructor, so nothing but a
  `Proxy` can intercept that first read, and spine AD-7 bans a Proxy
  outside `Model`. A grep of framework/src finds no call to `lazy(` or
  `proxy(` outside their definitions.
---

# ESC-13.1-5: `lazy()` and `proxy()` need PHP lazy objects

The two helpers build PHP 8.4 lazy ghosts and lazy proxies. JavaScript can do that only with a `Proxy`, which AD-7 does not allow outside `Model`. The api-surface gate still lists both. Option 1 records a DIV clause and `exceptions.jsonl` entries. Option 2 defers them. Option 3 ports them eagerly. Work on the close gate's `lazy` / `proxy` members stops here.
