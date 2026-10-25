---
status: blocked
---

# BMad Build Auto Result

Status: blocked
Blocking condition: intent gap. `epic-11-retro-item-5-builtin-names-and-static-mixins` asks that a macro named like a class's own built-in (`prototype`, `name`, `length`; also a prototype's own `constructor`) "throws a clear error or waits on the Maintainer". Throwing where Laravel registers the macro is a new observable divergence that needs a DIV-12 clause through an Escalation, and an action item has no Story to raise one from (`decisions/MAINT-2026-10-16-unattended-orchestrator.md`, amendment 2026-10-22, "Other questions"). The item waits on the Maintainer. The question and the evidence are under finding L1 in `_bmad-output/implementation-artifacts/epic-11-retro-2026-10-24.md`.

Planning notes for the build once ruled (all in `packages/macroable/src/Support/Traits/Macroable.ts`):

- `install` (`:91`) skips on `name in target`. Change it to skip only when some holder below `Object.prototype` (instance side) or `Function.prototype` (static side) has `name` as an own property, so an inherited `toString`, `valueOf`, `call`, `apply` or `bind` gets a dispatcher on the using class while a declared member, the trait's own members included, still wins.
- Own built-ins (`prototype`, `name`, `length` on every class; `constructor` on every prototype) cannot be dispatched: `prototype` is non-configurable, and each subclass's own copies would shadow a dispatcher on the using class. Apply the Maintainer's ruling here.
- `mixin` (`:186`) calls every collected method as `Reflect.apply(method, mixin, [])`. A method from the static loop of `mixinMethods` (`:143-150`) must be called with `this` the mixin's class, as PHP's `ReflectionMethod::invoke` on a static method binds `static::`. Keep track of which loop found each name.
- Update `packages/macroable/docs/macroable.md:59` and add XT-macroable cases for each case in `packages/macroable/tests/xaravel/macroable.test.ts`.
