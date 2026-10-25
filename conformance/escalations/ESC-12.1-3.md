---
test_ids:
  - XT-conditionable-1
trigger: divergence
proposed: >-
  Option 1 (recommended): add a DIV-12 clause, "Options form of a
  method with no required parameter. `when(value, callback, default)` and
  `unless(...)` accept the options object `{ value, callback, default }`
  only when it is the only argument, a plain object (prototype
  `Object.prototype` or `null`, not a contract token) whose own keys are a
  non-empty subset of `value`, `callback` and `default` with at least one
  of `callback` / `default`, each of those present being a function or
  `null`. Every other object is the `value`. A PHP array condition of
  exactly that shape is read as options." Option 2: add an
  `exceptions.jsonl` citation exempting `Conditionable::when` / `unless`
  from the AD-26 options form, and accept only the positional form; the
  detection is then removed.
evidence: >-
  AD-26 (PORTING.md Construct mapping, named arguments) says a function
  with more than one optional parameter also accepts one options object,
  and `bun run api-surface:gate conditionable` requires an options-form
  signature for `when` / `unless` (docs/ops/api-surface.md, Options form).
  Upstream's `when($value = null, ?callable $callback = null, ?callable
  $default = null)` has no required leading parameter, so a single object
  argument is either the options object or a `value`: `when(['value' =>
  true, 'callback' => $cb])` in PHP is a one-argument call that returns a
  `HigherOrderWhenProxy`, while the port reads
  `when({ value: true, callback: cb })` as `when(true, cb)`. Story 12.1's first attempt (saved as
  _bmad-output/implementation-artifacts/12-1-attempt-1.patch, `readOptions`
  in its `packages/conditionable/src/Traits/Conditionable.ts`) uses
  the narrow rule above, which no DIV clause records; XT-conditionable-1
  checks both the options form and a plain-object value.
---

# ESC-12.1-3: the options form of `when` / `unless` overlaps a PHP array condition

AD-26 gives `when` / `unless` an options form, but their first parameter is optional too, so one plain-object argument can be either the options or the condition. The port reads it as options only under a narrow shape rule, which silently treats a PHP array condition of that exact shape as options. Option 1 records the rule as a DIV-12 clause; Option 2 exempts the two methods from the options form. XT-conditionable-1 holds on this ruling.
