---
decision: approved
decided_by: Maintainer
date: 2026-10-19
escalation_sha256: "c19b3d5f5c2c94d7e74add33a685e585813f48f04c0a685699b69b3d192ca20b"
---

# ESC-6.1-1: approved, both parts

The Maintainer approved this in the Maintainer's session on 2026-10-19.

- **(1) `checksConditionals`.** `no-misused-promises` runs with `checksConditionals: true` pinned beside `checksVoidReturn: true`. The spine's AD-6 lint bullet now names it, `lint:disables` (`SPINE_RULE_OPTIONS`) rejects a config that turns it off, and a fixture with a Promise used as a condition must fail. Story 6.6 carries this as an acceptance criterion; Story 6.3 was already in progress when this was ruled.
- **(2) Thenables are `PromiseLike`.** Story 10.5's thenable list carries the requirement: every framework class with a `then` method declares `implements PromiseLike<…>`, and a check fails on one that does not, so `checkThenables` sees every framework thenable.

Rationale: both changes only make the async-safety lint stricter. A Promise used as a condition is always truthy, and a hand-rolled `then` that `checkThenables` cannot see would float silently when left unawaited.
