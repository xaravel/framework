---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportConditionableTest::testUnlessProxy"
  - "Illuminate\\Tests\\Support\\SupportConditionableTest::testWhenProxy"
trigger: divergence
proposed: >-
  Option 1 (recommended): add a DIV-12 clause in two parts. (a) Higher-order
  proxy members: at construction, `HigherOrderWhenProxy` gets one generated
  delegating member per method on its target's prototype chain (below
  `Object.prototype`) and per own property of the target, each routing
  through `__call(method, parameters)` / `__get(key)`; `then` and every
  member the proxy itself declares are excluded (`constructor`,
  `condition`, `negateConditionOnCapture`, `__get`, `__call`, and its own
  state and helpers, which are `#private` so that no target name can
  collide with them). (b) A test fixture whose property and
  method share a name keeps the method, and the property becomes
  `<name>Property`; an Upstream read of it is adapted to that name. The two
  Ported Tests then keep `->when(true)->log('one')` as
  `.when(true).log('one')`, read `$proxy->toggle` as
  `.toggleProperty` with `// adapted:DIV-12.<k>`, and their Expectations
  lines become `pass` with `adapted: "DIV-12.<k>"`. Option 2: skip both as
  `intentional-divergence:DIV-12`, since the behaviour they test (a proxy
  answering arbitrary target names) does not exist in Xaravel.
evidence: >-
  Upstream's tests (framework/tests/Support/SupportConditionableTest.php:110-164)
  call target methods on the proxy (`->when(true)->log('one')`,
  `->when()->has('init')->log('three')`) and read a target property through
  it (`->when()->toggle->log('five')`). PHP resolves these through
  `HigherOrderWhenProxy::__call` / `__get`. PORTING.md's Construct mapping
  gives `__call` forwarding as "explicit generated delegating methods,
  typed by the target contract", written for a fixed target contract, and
  its `__get` / `__set` row outside `Model` as "None (DIV-12)"; no clause
  covers a proxy whose target is any object, and AD-7 / AD-26 rule out a JS
  Proxy. The fixture `ConditionableLogger` also declares both a `$toggle`
  property and a `toggle()` method, which JavaScript cannot hold under one
  name, and no DIV-12 clause names a test fixture's pair. Story 12.1's
  first attempt (saved as
  _bmad-output/implementation-artifacts/12-1-attempt-1.patch, its
  `packages/conditionable/src/HigherOrderWhenProxy.ts`) keeps Upstream's
  `__get(key)` and `__call(method, parameters)` as explicit methods, which
  its XT-conditionable-1 exercises; its Ported Test fixture leaves out
  `$toggle` and `toggle()`, which only these two tests use. The two
  Expectations lines stay `skip` / `not-ported-yet` with this Escalation
  until it is ruled.
---

# ESC-12.1-1: the higher-order proxy cannot answer arbitrary target names

`testWhenProxy` and `testUnlessProxy` call target methods and read a target property on the `HigherOrderWhenProxy` that `when()` / `unless()` return, which PHP routes through `__call` / `__get`. Without a Proxy, the port answers only through its explicit `__call` / `__get` methods. Option 1 adds a DIV-12 clause that generates delegating members on the proxy from its target's shape, and renames a fixture property that shares a name with a method; Option 2 skips both tests under DIV-12. Work on these two Test IDs stops here.
