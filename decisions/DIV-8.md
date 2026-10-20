---
div: 8
title: "Async test bodies"
cites: []
sources: []
fewer_assertions: []
---

# DIV-8: Async test bodies

## Rationale

IO is async (DIV-1), so a test that touches IO must await it, and its body must be an `async` function. A predicate passed to a fake or `TestResponse` assertion may itself be async, so the assertion cannot return its verdict synchronously.

## Behaviour

- Ported Tests that touch IO become `async`.
- Laravel's test helpers return awaitable results.
- A fake or TestResponse assertion that takes a predicate returns a Promise, because the predicate may be async.

## Adaptation clauses

`fewer_assertions` is empty, so no clause of this record waives the assertion floor (FR-113). Adding an item needs an approved Escalation (ESC-5.3-2, FR-113); an item is the quoted `<k>` of an existing clause, for example `["2"]`. Clauses are append-only: a new clause takes the next number, and an existing clause is never renumbered.

- **DIV-8.1** Test bodies that touch IO are async. The Ported Test's body is an `async function`, and each test helper that returns an awaitable result is awaited. The assertions are unchanged.
- **DIV-8.2** Predicate assertions are awaited. A fake or `TestResponse` assertion given a predicate returns a Promise, and the Ported Test awaits it. The predicate and the assertion are otherwise unchanged.
