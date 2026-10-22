---
decision: approved
decided_by: Maintainer
date: 2026-10-21
escalation_sha256: "a13f707192a206e4f29edca05dd69b3f085c9bd8ad234302470a3013ea7604a3"
---

# ESC-9.9-3: approved, option 1 (a private base property keeps the base's value, DIV-12.9)

When the base declares a private property and a trait mixed onto a subclass declares a public or protected property of the same name, the layer keeps the base's value in the one JS slot, as `mixin.ts` does today under the ESC-9.9-2 rule. Option 2 is not taken.

## The divergence (DIV-12.9)

PHP keeps two slots here: the base's private property, and the subclass's trait property. A JS object has one. With option 1:
- **The base's own methods** read the base's value, as in PHP.
- **Code outside the base, and the subclass's own methods,** also read the base's value, where PHP reads the trait's default.

DIV-12.9 records this. DIV-12 clauses are append-only, so the case takes a new clause instead of changing DIV-12.8. It is the third case where the ESC-9.9-2 rule differs from PHP; `decisions/ESC-9.9-2.md` named two, and this ruling adds the third. A Ported Test whose outcome depends on it is not adapted silently: it raises an Escalation (FR-114). No `adapted:` marker, `fewer_assertions` item or Skip Reason comes with this clause.

## What Story 9.9 does next

Story 9.9 resumes at `in-progress` on `story/9.9`, within `packages/runtime/**`:

- `packages/runtime/tests/xaravel/traits.test.ts`: XT-runtime-31 regains the local row for the private-slot case. The row asserts the base's value for both a read from outside and a read through the base's own method. Its consequence text cites DIV-12.9, with no `adapted:` marker.
- `packages/runtime/src/traits/mixin.ts`: no behaviour change. The header comment cites DIV-12.9 beside DIV-12.8.
- `packages/runtime/docs/traits-and-inject.md`: the private-slot case is recorded as DIV-12.9, not named as open.

Then the Story runs its Fidelity Review on the final tree, as its spec says.

## Rationale

- **The base's own code stays right.** A private property is read by the class that declares it. In Laravel that is usually framework code whose behaviour depends on its own state. Option 2 would make those methods read a value PHP never gives them, a silent break inside the framework.
- **The visible difference is the safer one.** Under option 1, the readers that differ from PHP are outside readers and the subclass. They see the base's value where PHP has the trait's default, which a test or a caller can observe directly.
- **It is rare.** A Laravel trait redeclaring a property a parent declares private is unusual, and a port that needs PHP's two-slot behaviour raises an Escalation.
- **The grader is unchanged.** No assertion, expected value, skip or `adapted:` marker is removed or weakened. XT-runtime-31 regains a local row.

This ruling clears ESC-9.9-3 for XT-runtime-31. Story 9.9 is unblocked and resumes at `in-progress`.
