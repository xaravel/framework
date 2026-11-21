---
decision: approved
decided_by: Maintainer
date: 2026-11-21
escalation_sha256: "b33cf98955151ad70f15b442b4952602b4cb37348c088f3c35c237edeb578fd8"
---

# ESC-17.1-2: approved, option 1 (DIV-3 gains explicit Spec forms for nullable hints and default values)

The Maintainer approved option 1 on 2026-11-21, in the Maintainer's session, on the orchestrator's recommendation.

DIV-3 is extended with clause DIV-3.5. `inject` stays the only parameter declaration, every existing map keeps its meaning, and no Upstream assertion changes. The three questions the Escalation left open are settled as follows.

- **Spelling.** There are two new runtime Spec values in `packages/runtime/src/metadata/specs.ts`, re-exported by Container like `primitive`, `variadic` and `oneOf` (ESC-13.1-2):
  - `nullable(<Spec>)` is PHP's `?T`, or `T|null` for a union (`nullable(oneOf(A, B))`).
  - `optional(<Spec>, () => <default>)` is a parameter with a default value.
  - They compose with `optional` outermost. `?Foo $x = null` is `optional(nullable(Foo), () => null)`. An untyped `$name = 'taylor'` is `optional(primitive, () => "taylor")`. `int $i = 0` is `optional(Number, () => 0)`.
- **Default value versus nullable without a default.** These are separate facts, and reflection reports them separately.
  - `nullable(Foo)` alone is required: `isOptional()` and `isDefaultValueAvailable()` are `false`, and `allowsNull()` is `true`.
  - `optional(...)` makes `isOptional()` and `isDefaultValueAvailable()` `true`. `allowsNull()` comes from the inner Spec only.
  - PHP's implicit nullability (`Foo $x = null`, which PHP 8.5 still treats as nullable) is written explicitly as `optional(nullable(Foo), () => null)`, so reflection never has to call the default to work out a type.
  - The Container's resolution order is Upstream's (`Container.php:1329-1338`, `:1358-1361`). The port reads these facts through reflection and never through `undefined` or a JS default parameter.
- **When the default is evaluated.** The default is a thunk. `getDefaultValue()` calls it on every read, as PHP evaluates a default expression on each use, so an array or object default is never shared between resolutions. Declaring the parameter never calls the thunk.

Rejected inputs throw `TypeError` naming DIV-3.5, as `variadic` and `oneOf` do:
- `nullable` of a missing value, `null`, `primitive`, a `variadic(...)` or another `nullable(...)` (PHP has no `?mixed`);
- `optional` of a `variadic(...)` (a variadic parameter is already optional), of another `optional(...)`, or with a second argument that is not a function.

`epic-17-item-1-runtime-container-reflection` (ESC-17.1-3) leaves epic 17's `waiting_on_maintainer`. Its scope, `packages/runtime`, now also covers the two Spec values, and its `ReflectionParameter` readers read them. It runs before Story 17.1 resumes, and Story 17.1's Ported Tests declare the defaults and nullable hints of `ContainerTest.php:381-409`, fixtures `:1181-1202` and `ContainerResolveNonInstantiableTest.php:10-15,49` in this form, marked `// adapted:DIV-3.5`.
