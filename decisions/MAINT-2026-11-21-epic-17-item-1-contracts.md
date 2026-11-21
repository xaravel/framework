---
decision: approved
decided_by: Maintainer
date: 2026-11-21
scope: Epic 17 action item `epic-17-item-1-runtime-container-reflection` (ESC-17.1-3), the two contracts its planning pass found missing (#613)
---

# Ruling: parameter attributes and abstract classes for runtime reflection

The item's first planning pass (#613, `spec-epic-17-item-1-runtime-container-reflection.md`) stopped on two missing contracts. The Maintainer ruled on both on 2026-11-21, in the Maintainer's session, taking the recommended option for each.

## 1. Parameter attributes (DIV-3.6)

PHP's `#[X(args)]` on a parameter extends DIV-12.15's class-attribute model to parameters. The runtime owns the representation, and Container owns only its factories. This keeps AD-4's placement, where the contextual-attribute descriptors live in Container, and the runtime never imports Container.

- **The runtime's descriptor.** `@xaravel/runtime/php` exports `parameterAttribute(X, ...args)`. It returns a frozen, branded descriptor `{ class: X, args }`, the same entry shape as a class attribute. Container's `Config('app.timezone')`, `CurrentUser()`, `Give(X)`, `Tag('reports')` and the rest return `parameterAttribute(<the Upstream attribute class>, ...args)`. A Ported Test writes a user-declared parameter attribute, such as `#[ContainerTestConfigValue('foo')]`, as `parameterAttribute(ContainerTestConfigValue, "foo")`.
- **Placing it in the `inject` map:**
  - A descriptor on its own is a parameter with that attribute and no type hint. This is the form DIV-3 already lists.
  - `attributed(<Spec>, ...descriptors)` is a typed parameter with one or more attributes, in source order.
  - `attributed` wraps any parameter Spec, including `nullable(...)` and `variadic(...)`, but never an `optional(...)`. `optional` stays outermost (DIV-3.5). So `#[Give(Bar)] ?Foo $x = null` is `optional(attributed(nullable(Foo), Give(Bar)), () => null)`.
- **Reading it.**
  - `ReflectionParameter.getAttributes(name = null, flags = 0)` returns `ReflectionAttribute`s over the parameter's entries, in source order. These are the same `ReflectionAttribute` class that `ReflectionClass.getAttributes()` returns.
  - With a name, it keeps the entries whose class is that class.
  - With `ReflectionAttribute::IS_INSTANCEOF`, it keeps the entries whose class is that class or a subclass of it, or that implements that contract token (Upstream's `getAttributes(ContextualAttribute::class, ReflectionAttribute::IS_INSTANCEOF)`).
  - `newInstance()` behaves as it does for class attributes.
  - `getType()` reads the inner Spec, and a bare descriptor gives `null`.
- **Rejected inputs.** `attributed` with no descriptor, a descriptor argument that is not a `parameterAttribute(...)` value, `attributed(optional(...))` and `attributed(attributed(...))` throw `TypeError` naming DIV-3.6, as `variadic`, `oneOf`, `nullable` and `optional` do.

## 2. Abstract classes (DIV-12.23)

TypeScript erases `abstract`, and `registerClass` keeps its two-argument form (`tools/registration` recognises only that form). So an abstract class is declared with a TC39 class decorator.

- `@xaravel/runtime/php` exports `abstractClass`, a TC39 class decorator. It records an own, non-inherited flag in the class's `Symbol.metadata`, as `@attribute` records its own list. A subclass is abstract only when it carries the decorator itself, as in PHP.
- `ReflectionClass.isAbstract()` reads the flag. `isInstantiable()` is `false` for a class carrying it, for a contract token (an interface, ESC-13.1-7) and for a registered trait, and `true` for every other registered class. No Container test declares a non-public constructor, so a constructor's visibility is not represented. A test that needs it raises an Escalation.
- A Ported Test or framework class ports Upstream's `abstract class X` as `@abstractClass` on a TypeScript `abstract class X`. The decorator on a non-class target throws `TypeError` naming DIV-12.23.
- The decorator never stops a JavaScript `new`. The Container checks `isInstantiable()` before building and throws Upstream's `BindingResolutionException`, `Target [X] is not instantiable.`, as `Container.php:1159` does.

## Routing

`epic-17-item-1-runtime-container-reflection` leaves epic 17's `waiting_on_maintainer` and resumes planning from its spec, with these two contracts. Its scope stays `packages/runtime`: it adds `parameterAttribute`, `attributed` and `abstractClass` beside the DIV-3.5 Spec values, with XT-runtime cases against PHP 8.5.11. Container's factories, and its use of `isInstantiable()`, belong to Story 17.1 and the later Container Stories.
