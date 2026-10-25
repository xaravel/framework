---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-24
escalation_sha256: "5cd0d0cd0d672acb0057a63d853bd48ac54b61ccf702fd4076dde50c58a5d8d0"
---

# ESC-11.1-3: approved, option 1 (`@xaravel/runtime/scope` exposes the kinds of the active frame chain)

Option 1 is approved. The Maintainer's ruling on ESC-11.1-4 leaves this Escalation to the orchestrator.

## The rule

- **Now.** Story 11.1 throws `ScopeFrameException` for a macro write when the innermost frame is a `request`, `job` or `command` frame. XT-macroable-2 checks this directly and under a `test` frame, as it stands.
- **The runtime read.** `@xaravel/runtime/scope` gains a read of the active frame chain's kinds: `frameKinds(): readonly string[]` (innermost first, unit and narrow frames, origins not followed), or a predicate `insideFrameKind(kinds)`. The runtime change picks one. It belongs to `@xaravel/runtime`, so Story 11.1 does not make it. The Epic 11 retrospective routes it as an action item naming `packages/runtime` and `packages/macroable`.
- **Then Macroable follows.** In the same item, Macroable throws for a write anywhere under a `request`, `job` or `command` frame, nested units included. XT-macroable-2 gains the nested case.
- **The deadline.** The read lands before the first Story that opens a `request`, `job` or `command` frame outside a test: the Http, Queue or Console kernel. Until then no such frame exists outside tests, so the nested case cannot occur in an application.

Option 2 (the Http, Queue and Console kernels mark their frames with a barrier slot) is not taken. It spreads one rule over three later Components, and a frame opened any other way would carry no barrier.

## Rationale

- **It is DIV-11.2.** DIV-11.2 forbids base-only writes inside a request, job or command, nested units included. Option 1 lets every base-only write (macros, bindings, routes, `Blade.directive`) check that with one runtime read.
- **It keeps the rule in one place.** The frame chain belongs to `@xaravel/runtime/scope`, which already owns `currentFrame`. A kind read is a small addition to the chain it walks, and it needs no new frame state.
- **It is outside the classes the orchestrator may not rule on.**
  - It removes no assertion, weakens no expected value, and adds no skip or `adapted:` marker. XT-macroable-2 gains a case later.
  - It adds no divergence beyond DIV-11.2, which it carries out.
  - It does not make Xaravel slower: the read runs only on a base-only write, which is rare after boot.

This ruling clears XT-macroable-2 of ESC-11.1-3.
