---
div: 3
title: "Explicit injection tokens"
cites: ["AD-4"]
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
