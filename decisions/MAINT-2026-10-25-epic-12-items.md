---
decision: approved
decided_by: Maintainer
date: 2026-10-25
scope: Epic 12 retrospective items 3 and 4
---

# Maintainer ruling: Epic 12 items 3 and 4

The Maintainer gave this ruling on 2026-10-25 in the Maintainer's session, on `epic-12-retro-2026-10-25.md` (#429).

## Item 3 (a): the dual helper's async edges are recorded, not changed

Finding L1. `decisions/DIV-1.md` DIV-1.6 now also says:

- An async callback's Promise is returned as is.
- The branch that runs no callback returns the target synchronously, even when the other branch's callback is async.
- An awaited callback result of `null` stays `null`, where Upstream's `?? $this` gives the target.

Always returning a Promise was not taken. It needs a runtime check of whether a callback is async, and that check misses a sync function that returns a Promise. Wrapping the Promise with `?? this` was not taken either: awaiting a thenable target, such as a query Builder, would then run it. XT-conditionable-2's `null` assertion stands.

## Item 3 (b): PHP callable strings and arrays throw

Finding L3. `decisions/DIV-9.md` gains **DIV-9.13**:

- `when` / `unless` accept a function, an invokable object, or `null` as `callback` and `default`. Accepting an invokable object is action item 1.
- A PHP callable string or callable array throws PHP's `?callable` `TypeError`.
- A Ported Test that passes one adapts it to an arrow function.
- The clause covers only these two methods. If a later Component adds a shared resolver from PHP callable names to runtime functions, it supersedes this clause through an Escalation.

This follows the Maintainer's standing rule of 2026-10-25: when the recommendation is to throw a `TypeError` instead of PHP's behaviour, it is taken without a separate question.

## Item 4: one AC on Story 36.3, and no per-ID AC

Findings S1, L4 and L6. The epics' global rule for `blocked-by` already covers `ConditionableTest::testWhen` and `::testUnless` (`blocked-by:database`). Story 39.4, the Phase 4 `blocked-by` sweep, re-verifies them, so they need no AC of their own.

The real gap is L4. The Eloquent Builder serves most query methods through `__call`, and DIV-12.12 generates proxy members only for real methods. `epics.md` Story 36.3 gains an AC: each method the Builder forwards through `__call` is reachable on `HigherOrderWhenProxy`, with an XT case, so `User.query().when(true).orderBy('name')` chains as in Laravel.

The retrospective also asked whether a re-verification AC should be required whenever a Story records a new `blocked-by:<c>` line. The answer is no: the global rule and the Phase sweep Stories cover them.

## Bookkeeping

Items 3 and 4 are `done`, and epic 12's `waiting_on_maintainer` is empty. Items 1 (invokable callbacks) and 2 (remove the scratch note) stay with the orchestrator.
