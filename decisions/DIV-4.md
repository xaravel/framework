---
div: 4
title: "Closure serialization"
cites: ["AD-14"]
sources: []
fewer_assertions: []
---

# DIV-4: Closure serialization

## Rationale

PHP's `laravel/serializable-closure` serializes a closure together with the variables it captures. A JavaScript closure's captured scope cannot be read or rebuilt, so only closures with explicit arguments can be queued or run concurrently (FR-88). One codec handles every closure-serializing API, so they all detect captures the same way (AD-14).

## Behaviour

- **Scope.** The rule applies to every API that serializes a closure, including queued closures, `Bus.chain` and `Bus.batch` callbacks (FR-87) and `Concurrency.run` (FR-82). Every one of them uses the `SerializableClosure` codec in `@xaravel/serializable-closure`.
- **What the closure can reach.** Its arguments, and Laravel's facades and global helpers by their usual names (`Mail`, `Log`, `now`, …). At dispatch the codec parses the closure; a free identifier is allowed only if it is a parameter, an ECMAScript standard built-in, or a framework facade or helper listed in the Protected `allowed-identifiers.json`. Any other identifier is rejected with an error that names it and shows the rewrite.
- **Arguments.** Everything else, including app classes and models, is passed as an argument. Classes serialize by FQCN and models travel as `ModelIdentifier`, as in `SerializesModels`.
- **Payload.** It carries the source and the arguments, signed with the config-string `APP_KEY`. The worker verifies the signature, then rebuilds the closure with only its arguments, the Class Registry, and the facades and helpers.
- **Job classes** are unaffected.

## Adaptation clauses

`fewer_assertions` is empty, so no clause of this record waives the assertion floor (FR-113). Adding an item needs an approved Escalation (ESC-5.3-2, FR-113); an item is the quoted `<k>` of an existing clause, for example `["2"]`. Clauses are append-only: a new clause takes the next number, and an existing clause is never renumbered.

- **DIV-4.1** Closure state is passed as arguments. Where an Upstream test serializes a closure (a queued closure, a `Bus.chain` or `Bus.batch` callback, `Concurrency.run`) that captures variables through `use (...)` or by arrow-function capture, the Ported Test passes each captured value as an explicit argument instead. Facades and global helpers stay referenced by their Upstream names. The assertions are unchanged.
