---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "8bc4e69bf20dcff07995ec261a660a81d5758a203ab88cbead21bef75057d399"
---

# ESC-12.1-1: approved, option 1, generated delegating members on the higher-order proxy

The Maintainer gave this ruling on 2026-10-25 in the Maintainer's session. The higher-order form is common in Laravel code (`$query->when($flag)->where(...)`), so Xaravel keeps it working rather than skipping the two tests.

`decisions/DIV-12.md` gains **DIV-12.12**:

- **The proxy's members.** At construction, `HigherOrderWhenProxy` gets one delegating member for each method on its target's prototype chain below `Object.prototype`, and one for each own property of the target.
  - A method member routes through `__call(method, parameters)`, and a property member through `__get(key)`.
  - `then` is never generated, so the proxy is never a thenable.
  - Every member the proxy declares itself is excluded. Its own state and helpers are `#private`, so no target name can collide with them.
  - A member added to the target after the proxy is built is reached only through `__call` / `__get`.
  - No Proxy is used (AD-7, AD-26).
- **A fixture's property and method of the same name.** A test fixture that declares both keeps the method, and the property becomes `<name>Property`. An Upstream read of that property, directly or through the proxy, becomes a read of `<name>Property`, marked `// adapted:DIV-12.12`.

## The route

`testWhenProxy` and `testUnlessProxy` are ported with `ConditionableLogger`'s `$toggle` as `toggleProperty`. Their Expectations lines become `pass` with `adapted: "DIV-12.12"`. Story 12.1 resumes (ESC-12.1-2 and ESC-12.1-3 are ruled with this one).
