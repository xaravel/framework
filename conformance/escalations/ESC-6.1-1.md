---
test_ids:
  - XT-conformance-129
trigger: open-question
proposed: >-
  (1) Pin `no-misused-promises`'s `checksConditionals: true` explicitly in
  `.oxlintrc.json` and add it to `SPINE_RULE_OPTIONS` in
  tools/lint-rules/disables.ts, with a failing fixture for a Promise used as a
  condition, through a Maintainer-approved change to the spine's lint bullet
  (AD-6). (2) Add to Story 6.3's acceptance criteria a lint rule that a
  framework thenable (a class with a `then` method) must declare
  `implements PromiseLike<…>`, so `checkThenables` sees it; or have Story 10.5's
  thenable list in `@xaravel/contracts/async` carry that requirement.
evidence: >-
  Story 6.1 sets the three rules exactly as the spine names them (AD-6, NFR-3).
  `no-misused-promises` reports a truthy Promise in a condition (the
  authorization-bypass case AD-6 cites) only through `checksConditionals`,
  which is on by default and pinned nowhere, so a config that sets it false
  passes `bun run lint`. A probe during planning showed `no-floating-promises`
  with `checkThenables: true` reports an unawaited builder whose `then` is
  typed as `PromiseLike`, and does not report one with a hand-rolled
  `then<T>(onF: (v) => T): T`. Neither the spine nor any Story's acceptance
  criteria require framework thenables to be typed `PromiseLike`.
---

# ESC-6.1-1: pin `checksConditionals`, and require framework thenables to be `PromiseLike`

Story 6.1 delivers the type-aware async-safety lint with the options the spine names ([docs/ops/lint.md](../../docs/ops/lint.md)). Its review found two gaps that no Story's acceptance criteria cover, so they come to the Maintainer.

1. **`checksConditionals`.** `if (gate.allows(user))` on a Promise is always truthy. `no-misused-promises` catches it only through `checksConditionals`, which is on by default but not pinned, and `lint:disables` accepts a config that turns it off. The spine names only `checksVoidReturn`, so changing the config needs a ruling. Proposed: pin it and enforce it like `checksVoidReturn`.
2. **Thenables must be `PromiseLike`.** `checkThenables` only recognises a `then` with the `PromiseLike` signature. A Builder, Relation or `PendingRequest` with a hand-rolled `then` would float silently when left unawaited. Proposed: Story 6.3 gets a rule requiring `implements PromiseLike<…>` on framework thenables, or Story 10.5's thenable list carries the requirement.
