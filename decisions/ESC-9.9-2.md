---
decision: approved
decided_by: Maintainer
date: 2026-10-21
escalation_sha256: "537ade27dddef9ff98aac159c211e233b6ae5113769c17dd519b29ea5a8938c6"
---

# ESC-9.9-2: approved, a trait default replaces a base default it still finds, and keeps any other value (DIV-12.8)

The Maintainer rules a third option, which neither of the Escalation's options covers: Option 3. When a class can tell from the PHP property table (ESC-9.7-1 part 1) that a base property still holds its declared default, the trait's default replaces it, as in PHP. When it cannot tell, or the value has changed, the instance's value is kept, which is Option 1. Option 2 is not taken.

## The rule

The layer that `mixin(Base, ...Traits)` builds assigns each trait's instance default after `super(...args)` returns, as it does today, with one change for a key the instance already owns:

- **The base still holds its declared default.** `propertyTable(Base)` (`packages/runtime/src/php/mangle.ts`, the table of `Base` and its parents) lists a public or protected property of that name, and the instance's value is PHP-identical to its declared default (`identical` in `mixin.ts`). Nothing has written the property since the defaults were set, so the trait's default replaces it. This is PHP's result: a trait's default takes the place of a parent's default of the same name.
- **Otherwise, the instance's value is kept.** This covers three cases:
  - The table does not list the name.
  - No class in the chain declares a table.
  - The value differs from the declared default. A write made during the base constructor, such as an `initialize<Trait>` that Model's constructor calls through `initializeTraits`, therefore survives. This is PHP's result too, because PHP runs initializers after every default is set.
- A key the instance does not own gets the trait's default, unchanged from today.

A private property of the base lists under a mangled key, which is a separate PHP slot. It never counts as "the base still holds its declared default", so it takes the second branch.

## The divergence (DIV-12.8)

Two cases remain where Xaravel and PHP give different values. Both are rare, and DIV-12.8 records them:

1. **No table.** The base chain declares no property table that lists the name, so the layer cannot tell a base field from a constructor write. Xaravel keeps the base's value; PHP has the trait's default.
2. **An unchanged-looking write.** A write made during the base constructor sets the value PHP-identical to the base's declared default. The layer cannot tell it from an untouched default, so Xaravel applies the trait's default; PHP keeps the written value.

A Ported Test whose outcome depends on either case is not adapted silently: it raises an Escalation (FR-114). No `adapted:` marker, `fewer_assertions` item or Skip Reason comes with this clause.

## What Story 9.9 does next

Story 9.9 resumes at `in-progress` on `story/9.9`, within `packages/runtime/**` and its own Oracle requests:

- `packages/runtime/src/traits/mixin.ts`: the rule above, in `assignDefaults` or the layer constructor. The header comment states it and cites this decision and DIV-12.8.
- `conformance/oracle-requests/9.9.jsonl`: a request for XT-runtime-31 covering four cases.
  - A trait default against a parent default of the same name (the Escalation's probe, `"named"`).
  - The same parent, with an `initialize<Trait>` that the constructor calls writing a third value. PHP keeps that write.
  - The trait-only flag case: a trait declares `$flag = false`, and its initializer, called from the constructor, sets `true`.
  - A redeclared protected property.
- `packages/runtime/tests/xaravel/traits.test.ts`, XT-runtime-31:
  - The fixture classes declare their property tables, and the test asserts the Oracle's values for each of those requests.
  - It also asserts the two DIV-12.8 cases locally, so the documented fallback is pinned. These are Xaravel Tests, so they carry no `adapted:` marker. They cite DIV-12.8 in their consequence text.
- `packages/runtime/docs/`: the traits page states the rule and its two limits.

Then the Story runs its review step and Fidelity Review on the final tree, as its spec says.

## Rationale

- **Closest to PHP.** Option 1 differs from PHP whenever a trait redeclares a base property, unless an initializer wrote the property, which is ordinary in Laravel. Option 3 differs only in the two cases above.
- **Option 2 breaks working code.** The layer can apply defaults only after the base constructor returns. Assigning them unconditionally would undo every write an `initialize<Trait>` makes to a property its own trait declares, a pattern Laravel's traits use routinely.
- **No new mechanism.** The property table already exists for the codec (ESC-9.7-1 part 1), and generators emit it from Upstream. The check reads it once per instance, and only for keys the instance already owns, so the common path is unchanged.
- **The grader is unchanged.** No assertion, expected value, skip or `adapted:` marker is removed or weakened. XT-runtime-31 gains Oracle rows.

This ruling clears ESC-9.9-2 for XT-runtime-31. Story 9.9 is unblocked and resumes at `in-progress`.
