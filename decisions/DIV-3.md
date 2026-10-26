---
div: 3
title: "Explicit injection tokens"
cites: ["AD-4", "AD-1"]
sources: []
fewer_assertions: []
---

# DIV-3: Explicit injection tokens

## Rationale

TypeScript erases parameter types, so the container cannot autowire from a type hint the way Laravel's reflection does. Autowired dependencies are declared in one form, `inject({ <paramName>: <Spec>, … })`, so there are no competing declaration styles and the metadata can drive name-based binding (AD-4).

## Behaviour

- **Where it goes.** It is a TC39 decorator on classes (constructor parameters) and methods, and a wrapper for closures, for example `inject({ post: Post }, (post) => …)`, used for closure routes, closure commands, scheduled closures and `app.call`.
- **Keys.** Key order is parameter order, and keys are parameter names.
- **Values.**
  - a token or class;
  - `String`, `Number` or `Boolean`, which coerce as PHP does;
  - `primitive`, which does not coerce;
  - a contextual-attribute descriptor such as `Config('app.timezone')` or `CurrentUser()`;
  - `oneOf(A, B)` for union types.
- **What uses it.** Controller method injection, implicit route model binding (FR-30, matched by name), Form Request resolution, `make(X, { name })` and `needs('$name')`.
- **No declaration.** An action without `inject` receives route parameters positionally. There is no static `inject` list.
- **Tokens.** Each Contract exports a runtime token under its interface's name. The container also accepts Laravel's string abstracts and aliases (`app('cache')`).
- **Metadata** is written to `Symbol.metadata`, and no tsconfig sets `experimentalDecorators`. A lint rule checks that key names and order match the parameter list.

## Adaptation clauses

`fewer_assertions` is empty, so no clause of this record waives the assertion floor (FR-113). Adding an item needs an approved Escalation (ESC-5.3-2, FR-113); an item is the quoted `<k>` of an existing clause, for example `["2"]`. Clauses are append-only: a new clause takes the next number, and an existing clause is never renumbered.

- **DIV-3.1** Autowired parameters are declared with `inject({...})`. Where an Upstream test class, method or closure relies on a parameter type hint for container injection, the Ported Test declares the same parameters, in the same order and with the same names, through `inject({ <paramName>: <Spec>, … })` (a decorator on classes and methods, a wrapper for closures). A PHP container attribute becomes its Spec descriptor, and a union hint becomes `oneOf(...)`. The assertions are unchanged.
- **DIV-3.2** PHP reflection over `inject` metadata, and relative hints. `@xaravel/runtime/php` defines PHP's `ReflectionClass`, `ReflectionMethod`, `ReflectionFunction`, `ReflectionParameter`, `ReflectionNamedType` and `ReflectionUnionType`, registered under their PHP names and limited to the members the framework calls. They read a parameter list from its `inject` map: each key is a parameter, in order, and its Spec is the type. A class or token is a named non-builtin type named by `fqcn()`. `String`, `Number`, `Boolean` and `primitive` are builtin types, and `oneOf(...)` is a union. The Spec markers `self` and `parent` stand for PHP's relative hints and resolve against the declaring class. An Upstream fixture whose hint is `self` or `parent` declares that marker, so the relative branch is exercised (ESC-13.1-1). A closure has no declaring class in JavaScript, where PHP's closure takes the class it was written in as its scope. So a closure's `self` or `parent` marker resolves to `null`, and reflection reports it as a type with no class (MAINT-2026-10-25-epic-13-items).
- **DIV-3.3** Untyped, variadic and undeclared closure parameters. An untyped PHP parameter is declared `primitive`, and a variadic one `variadic(<Spec>)`, so an `inject` map always lists every parameter. A closure with no parameters is declared `inject({}, fn)`. Reflection reads `primitive`, `String`, `Number` and `Boolean` as builtin, which gives `null` where Upstream reports no class, and `variadic(...)` as variadic. A closure with no `inject` declaration at all has no parameter list Xaravel can read, so reading its parameters throws a `RuntimeException` that names the `inject({ <param>: <Spec> }, fn)` form, where Upstream reads the hints from the closure itself. `primitive`, `variadic` and `oneOf` are runtime Spec values (AD-4), and Container re-exports them (ESC-13.1-2).
- **DIV-3.4** Closure return hints. TypeScript erases return types, so a closure whose PHP return hint the framework reads is declared `returns(<Spec>, fn)`. The runtime writes the Spec beside `inject` in the same `Symbol.metadata` object, and `ReflectionFunction.getReturnType()` reads it, or `null` without one. Specs: a class or token; `String`, `Number` or `Boolean` for builtins; `oneOf(A, B)` for a union; `allOf(A, B)` for an intersection; and the markers `self` and `static`. A Ported Test wraps the Upstream closure in `returns(...)`, marked with this clause, and its assertions are unchanged (ESC-13.1-3).
