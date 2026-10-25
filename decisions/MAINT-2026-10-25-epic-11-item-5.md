---
decision: approved
decided_by: Maintainer
date: 2026-10-25
scope: Epic 11 retrospective item 5 (built-in macro names and static mixin methods)
---

# Maintainer ruling: Epic 11 item 5, macro names JavaScript reserves on a class

The Maintainer gave this ruling on 2026-10-25 in the Maintainer's session.

## Why

Item 5 (#419) found that a macro named after a class's own JavaScript built-in cannot be dispatched as PHP dispatches it. Those built-ins are `prototype`, `name` and `length` on the static side, and `constructor` on the prototype. PHP has no such names, so `Foo::macro('name', …)` and then `Foo::name()` works there. In JavaScript the options are:

- `prototype` is non-configurable and cannot be redefined.
- `name` and `length` can be redefined, but they carry the class's name and arity, and stack traces, debuggers and other code read them.
- `constructor` is the prototype's link back to its class.

Refusing these names is a new observable divergence, and an action item has no Story to raise the Escalation from, so the item waited.

## The rule

`decisions/DIV-12.md` gains **DIV-12.11**:

- **`macro()`** with one of the four names throws `InvalidArgumentException`. The message names the reserved word and asks for another name.
- **`hasMacro()`** with one returns `false`, as for any name never registered.
- **`mixin()`** skips the mixin's own `constructor`, which is JavaScript's class link, not a mixin method.
- **Every other name behaves as PHP.**
  - A name inherited from `Object.prototype` or `Function.prototype` (`toString`, `call`, `bind`, …) installs its dispatcher on the using class, so it runs as PHP's `__call` / `__callStatic` would.
  - A member the class or its parents declare still wins.

Overriding `name` and `length` was not taken: being nearer PHP for two rare names would break everything that reads them. Laravel's own Macroable tests use none of the four names, so no Ported Test is adapted.

## The route

Item 5's other parts stand as the retrospective wrote them:

- `mixin` invokes a mixin's static method with `this` set to the mixin's class.
- `docs/macroable.md` states what holds.
- XT-macroable cases cover each rule, including one per reserved name.
- No assertion is removed or weakened.

`epic-11-retro-item-5-builtin-names-and-static-mixins` leaves `waiting_on_maintainer` and stays `in-progress`. The orchestrator resumes it, using the planning notes in `bmad-build-auto-result-retro-11-builtin-names.md`.
