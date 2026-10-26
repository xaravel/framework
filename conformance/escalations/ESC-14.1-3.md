---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCanAddMethodsToProxy#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCanAddMethodsToProxy#1"
trigger: divergence
proposed: >-
  Option 1 (recommended): a new DIV-12 clause. A higher-order read on a
  collection, `$collection->name` for a name in `static::$proxies`, becomes
  `collection.__get('name')`, which returns the `HigherOrderCollectionProxy`
  or throws Upstream's `Exception('Property [name] does not exist on this
  collection instance.')`. A read through the proxy, `$proxy->key`, becomes
  `proxy.__get('key')`, and a call, `$proxy->method(...$args)`, becomes
  `proxy.__call('method', [args])`. The test then reads
  `c.__get('adults').__get('age').values().all()`. This is DIV-12.10's form
  for `__get`, and it also covers Story 14.5's `$c->map->name` style tests.
  Option 2: Collection gets a generated getter per proxy name (as DIV-12.12
  does for `HigherOrderWhenProxy`), renamed where it collides with the
  method of the same name (`map`, `filter`, `adults` …, so `<name>Proxy`),
  and the proxy still needs explicit `__get` / `__call` for item keys, which
  are not known when it is built.
evidence: >-
  testCanAddMethodsToProxy registers `adults` as both a macro and a proxy and
  reads `$c->adults->age->values()->all()` (SupportCollectionTest.php:3060-3073).
  `$c->adults` is a property read through `__get` (EnumeratesValues.php:1108),
  while the proxy then calls `$this->collection->adults(closure)` as a method
  (HigherOrderCollectionProxy.php:46-52), so one name is a property and a
  method at once. `->age` is a key of each item, unknown when the proxy is
  built. PORTING.md's construct table gives `__get` outside Model no form
  ("None (DIV-12)"), and AD-7 allows a Proxy only on Model. DIV-12.12 covers
  `HigherOrderWhenProxy`, whose members come from its target's prototype,
  and DIV-12.10 covers `__call` for unregistered macros; neither covers a
  property read on a collection or on an item through the proxy.
---

# ESC-14.1-3: `$collection->proxyName->key` needs `__get` on the collection and on the proxy, which no DIV clause covers

Laravel's higher-order messages read a proxy name as a property of the collection and then a key of every item as a property of the proxy. Without a JS Proxy, both reads need a written form. Option 1 writes them as explicit `__get` / `__call` calls under a new DIV-12 clause. Option 2 generates renamed getters. Work on testCanAddMethodsToProxy stops here. The same answer decides Story 14.5's higher-order tests.
