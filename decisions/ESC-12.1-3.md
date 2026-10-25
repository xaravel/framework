---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "063ff87226a725cf95c8447a1c90577121d0892d4ec3a4dd0b25cc43627b3447"
---

# ESC-12.1-3: approved, option 2, `when` and `unless` take only the positional form

The Maintainer gave this ruling on 2026-10-25 in the Maintainer's session. This departs from the orchestrator's recommendation (option 1).

## Why

`when(value, callback, default)` has no required parameter, so a lone object argument could be either AD-26's options object or the condition. Option 1's shape rule would silently read a PHP array condition of that exact shape as options. That is a new silent divergence on a positional call. With option 2, every positional call behaves exactly as PHP's. The only thing lost is a call with named arguments, which is rare for `when` / `unless` in Laravel code.

## The rule

`decisions/DIV-12.md` gains **DIV-12.13**:

- `when` and `unless` on Conditionable take only the positional form. A lone object argument is always the condition, as in PHP.
- An Upstream call that passes named arguments to them becomes the positional call, with each skipped leading parameter `null`, marked `// adapted:DIV-12.13`.
- `conformance/api-surface/exceptions.jsonl` exempts both members for the `conditionable` component, citing DIV-12.13, so `api-surface:gate conditionable` does not require an options-form signature.
  - The exemption covers the whole member, so the gate does not check their positional signature either.
  - XT-conditionable keeps covering the positional signature, and checks that a lone plain object is read as the condition.

## The route

Story 12.1 drops `readOptions` and the options-form overloads from the saved attempt (`12-1-attempt-1.patch`). XT-conditionable-1 asserts that `when({ value: true, callback: cb })` passes the object as the condition, as PHP does with an array.
