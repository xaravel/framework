---
test_ids:
  - XT-contracts-3
trigger: contract
proposed: >-
  Option 1 (recommended): `fqcn(value)` in `@xaravel/runtime/registry`
  returns the value's own `Symbol.for('xaravel.class.fqcn')` string when the
  value is a non-function object that carries it as an own, non-writable data
  property (a frozen contract token), and otherwise behaves exactly as
  today. `contract<T>(fqcn)` already sets that key on every token, because
  PHPUnit's `Generator` and Mockery's `DoubleTarget` name a token from it
  (ESC-4.3-1 item 1), so no new key is added. The change is one branch in
  `packages/runtime/src/registry/registry.ts` with its own runtime Xaravel
  Test, made by a runtime Story or a retrospective action item, as the
  Maintainer routes it; a `contracts` Story does not edit `@xaravel/runtime`.
  Option 2: make each token a function and register it with
  `registerClass`. This is rejected by the evidence below: both test doubles
  take every function as a class, the registration scan forbids a
  `registerClass` call inside `contract()`, and an interface name would
  resolve through `resolveClass` as if it were a class. Option 3: reword
  Story 10.1's third criterion in `epics.md` to "its FQCN is readable at
  `Symbol.for('xaravel.class.fqcn')`", leaving `fqcn()` unchanged.
evidence: >-
  Story 10.1's third criterion says a `contract<T>('App\\Contracts\\Billing')`
  token "behaves like a framework token, and its FQCN is resolvable through
  `fqcn()`". `fqcn()` (`packages/runtime/src/registry/registry.ts:102-120`)
  takes the value itself when it is a function, else
  `Object.getPrototypeOf(value).constructor`, and looks that class up in the
  Registry's class map; it throws "the class is not registered" for anything
  else. A token must be a non-function object: Mockery's `DoubleTarget.of`
  (`packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts:37-39,129-140`)
  and PHPUnit's `Generator.readTarget`
  (`packages/assert/src/Framework/MockObject/Generator/Generator.ts:218-254`)
  treat any `typeof value === "function"` as a class, and recognise a token
  only as an object with a `Symbol.hasInstance` method. So `fqcn(token)` gets
  `Object` and throws. `registerClass` takes only functions (:70), and
  `bun run registration:check` rejects a `registerClass` call that is not a
  top-level statement of the file declaring the class, so `contract()`
  cannot register its token. Meeting the criterion needs a change to
  `@xaravel/runtime`, which a `contracts` Story may not edit. Story 10.1
  carries on with XT-contracts-1, -2 and -18; its tokens already carry
  `Symbol.for('xaravel.class.fqcn')`.
---

# ESC-10.1-3: `fqcn()` cannot resolve a contract token without a runtime change

Story 10.1's third criterion asks that a `contract<T>()` token's FQCN be "resolvable through `fqcn()`". `fqcn()` resolves only registered classes, and a contract token has to be a plain object: both test doubles treat every function as a class. No change inside `packages/contracts/**` can make `fqcn(token)` return the FQCN.

The recommended fix, Option 1, teaches `fqcn()` to read the FQCN key that every token already carries for the test doubles. That is a change to another Component's Contract (`@xaravel/runtime/registry`), so it needs a ruling. This stops XT-contracts-3 only.
