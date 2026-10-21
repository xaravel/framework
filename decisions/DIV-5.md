---
div: 5
title: "Generated code is TypeScript"
cites: ["AD-11"]
sources: []
fewer_assertions: []
---

# DIV-5: Generated code is TypeScript

## Rationale

Xaravel runs on Bun, not PHP, so the code it generates is JavaScript and TypeScript. Asserting PHP source text would test an output Xaravel never produces.

## Behaviour

- Blade compiles to JS.
- Generators emit TS.
- Tests that assert PHP output are replaced by tests on rendered output (Differential Tests) and TS snapshots.

## Adaptation clauses

`fewer_assertions` is empty, so no clause of this record waives the assertion floor (FR-113). Adding an item needs an approved Escalation (ESC-5.3-2, FR-113); an item is the quoted `<k>` of an existing clause, for example `["2"]`. Clauses are append-only: a new clause takes the next number, and an existing clause is never renumbered.

- **DIV-5.1** PHP-output asserts become rendered-output or TS-snapshot tests. An Upstream assertion on generated PHP (compiled Blade, generator output) is replaced by an assertion on the rendered output, checked as a Differential Test, or on a committed TS snapshot of the generated code.
