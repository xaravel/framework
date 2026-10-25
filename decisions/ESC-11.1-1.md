---
decision: approved
decided_by: Maintainer
date: 2026-10-24
escalation_sha256: "22de024df8b7ec9a70a8c74f67c3fdc6eac2e4cbe15d551900e08577bc5f97bc"
---

# ESC-11.1-1: approved, option 1 (DIV-12.10: a call to a macro name that was never registered)

The Maintainer gave this ruling on 2026-10-24 in the Maintainer's session, accepting option 1. `decisions/DIV-12.md` gains clause **DIV-12.10**:

> **DIV-12.10** Calls to a macro name that was never registered. PHP resolves every missing method through `__call` / `__callStatic`. Xaravel has no Proxy outside `Model` (AD-7, AD-26), and `macro(name)` makes `name` a member only once it is registered. An Upstream call to a method that was never registered on a Macroable class, `$obj::missing()` or `$obj->missing()`, becomes `__callStatic('missing', [])` or `__call('missing', [])`, and its exception expectation is unchanged (ESC-11.1-1).

## What diverges, and what does not

- **Diverges:** only a plain JS call to a name `macro()` never registered, such as `Str.neverRegistered()`. JavaScript throws `TypeError` before any Xaravel code runs, where PHP throws `BadMethodCallException`.
- **Does not diverge:**
  - A registered macro behaves as Upstream's, including `this` binding, `mixin` and `hasMacro`.
  - A flushed macro keeps its dispatcher, so it still throws `BadMethodCallException`.
  - `__call` and `__callStatic` throw Upstream's `BadMethodCallException` and message.

## The route

`testCallingUndefinedMacroThrowsException` calls `classOf(this.macroable).__callStatic('nonExistentMacro', [])`, marked `// adapted:DIV-12.10`. It keeps `this.expectException(BadMethodCallException)` and adds Upstream's message check if Upstream asserts it. Its Expectations line becomes `pass` with `adapted: "DIV-12.10"`. No assertion is removed or weakened, and the test still checks Upstream's exception from `__callStatic`.

## Rationale

- **Option 1 over option 2.** A skip would lose the check that `__callStatic` throws Upstream's exception. Option 1 keeps it, and only the call form changes.
- **No Proxy.** A Proxy at the end of the prototype chain could catch misses without wrapping instances. It would also answer every probe for an unknown name, such as `await`'s `then` and `JSON.stringify`'s `toJSON`, so every Macroable object would look like a thenable unless each such name were excluded. That would amend AD-26 for one error path, so it is not taken.
