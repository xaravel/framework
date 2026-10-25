---
decision: approved
decided_by: Maintainer
date: 2026-10-25
scope: Story 12.1 (Conditionable) re-plan questions 1 and 2 in its spec's Review Triage Log
---

# Maintainer ruling: Story 12.1 re-plan, async typing of `when` and `unless`

The Maintainer gave this ruling on 2026-10-25 in the Maintainer's session. Story 12.1's first attempt was rejected on F-9 because its intent contract asked for an `@asyncRoot callback` tag and a declared Promise return type on `when` / `unless`. The spec's Review Triage Log asked two questions for the re-plan.

## Question 1: the typing follows F-9

Yes. `when` and `unless` are dual helpers (AD-6), as `conformance/review/fidelity.md` F-9 reads them:

- they take no `@asyncRoot` tag;
- they are typed by their callbacks' own return types (`R | D | this`), with no declared Promise or thenable type;
- the package's `async-surface.json` has no line for them.

The epics AC "an async callback … returns a Promise" holds because an async callback's own return type is a Promise.

## Question 2: a Promise condition throws

`decisions/DIV-1.md` gains **DIV-1.6**:

- A condition is never awaited.
- A thenable condition throws a `TypeError` saying to await it before the call. That covers a thenable `value`, a thenable returned by a `value` closure, and a thenable captured by `HigherOrderWhenProxy`.
- The types also reject a Promise condition, for example through a `NotPromise<V>` constraint.

Awaiting it was not taken, because the runtime return type would then differ from the declared one. That is the `T | Promise<T>` shape AD-6 forbids. A truthiness test was not taken either, because it would silently always take the `callback` branch.

This replaces the saved patch's `[patch]` row that returns a Promise of `this.condition(…)` for a captured Promise result. That case now throws.

## The route

Story 12.1 resumes from `12-1-attempt-1.patch` and its logged patch rows, with these changes:

- this typing;
- the rules in ESC-12.1-1 (DIV-12.12), ESC-12.1-2 and ESC-12.1-3 (DIV-12.13);
- an XT-conditionable case for each thenable-condition path.

`ConditionableTest::testWhen` and `::testUnless` wait for action item `epic-12-item-1-blocked-by-component-error`, which the loop takes first.
