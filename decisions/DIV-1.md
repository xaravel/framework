---
div: 1
title: "Async IO Terminals"
cites: ["AD-6", "AD-1"]
sources: ["decisions/ESC-10.2-3.md", "decisions/ESC-10.3-1.md"]
fewer_assertions: []
---

# DIV-1: Async IO Terminals

## Rationale

"Sync core, async edges." JavaScript IO cannot block, so every call that reaches IO returns a Promise. The async surface is defined by interface, following the rules in the architecture spine (AD-6), so that no agent chooses async-ness on its own at a shared seam. Each Package commits an `async-surface.json` that lists every Promise-returning public method and the async root it reaches. CI regenerates the list from the type declarations and fails on drift.

## Behaviour

- **Async roots.** The store and driver contracts that perform IO, and only those methods in them where some Upstream driver does IO: database statements, cache stores (including `array`, for a uniform interface), session handlers, queue connections, mail transports, filesystem IO, Redis, HTTP-client sending, broadcasting and process runs. `Storage.url()`, hashing, encryption, translation, view loading and Config stay sync.
- **Async by derivation.** A method is async if it reaches a root, or if it accepts a callback that may be async. The second rule covers gates and policies, listeners and observers, model events, validation closures and rule objects, `Cache.remember`, transactions, binding resolvers, middleware and rate limiters. So `Gate.allows()`, `can()`, `Validator.passes()` / `fails()`, `Event.dispatch()` and model `save()` return Promises. A method that is async on any path is async on all paths.
- **Sync, loaded once.**
  - The session, after `StartSession` has loaded it. This includes `old()` and `$errors`, and the session is persisted when the response is sent.
  - Request input (FR-28).
  - The authenticated user, after `StartSession` or the `auth:<guard>` middleware has resolved it: `request.user()`, `Auth.user()` / `check()` / `id()`, `@auth`. Reading a guard that was never resolved throws an error pointing to `await Auth.guard(name).authenticate()`.
- **Also sync.** Collections, `Str`, `Arr`, the container, query building and `toSql()`, model attributes, and Blade compilation.
- **Dual helpers.** `retry`, `rescue`, `tap`, `value`, `transform`, `once`, `when` / `unless`, `Benchmark.measure` and `Sleep` return a Promise only when given an async callback.
- **Thenables.** Query builders, Relations and pending HTTP requests can be awaited directly.
- **Self-starting calls.** `dispatch()`, `Bus.chain(…).dispatch()`, `Bus.batch(…).dispatch()`, `broadcast()` and the test `artisan()` call start on their own once the current synchronous code has finished, as Laravel's destructors do, so chained calls such as `.onQueue('emails')` still apply. Awaiting one is optional and never runs it twice. The Scope Frame waits for it before the unit ends, and creating one outside a Scope Frame throws.
- **Callbacks.** Callbacks passed to sync APIs, such as Collection `map` / `each` / `filter`, must be sync; the type system and lint reject async ones. The async companions are `eachAsync`, `mapAsync`, `filterAsync`, `rejectAsync`, `firstAsync`, `everyAsync`, `containsAsync` and `partitionAsync`. Callbacks passed to async APIs may be async, and are awaited in registration order.
- **Lazy database collections.** `cursor()` and `lazy()` return an `AsyncLazyCollection` (`LazyCollection`'s method names), iterated with `for await`.

## Adaptation clauses

`fewer_assertions` is empty, so no clause of this record waives the assertion floor (FR-113). Adding an item needs an approved Escalation (ESC-5.3-2, FR-113); an item is the quoted `<k>` of an existing clause, for example `["2"]`. Clauses are append-only: a new clause takes the next number, and an existing clause is never renumbered.

- **DIV-1.1** IO terminals are awaited. An Upstream call to a method that is async under this record (an async root, a method derived from one, or a thenable terminal) is awaited in the Ported Test, and the test body becomes `async` (DIV-8). The call's arguments and the assertions on its result are unchanged.
- **DIV-1.2** Async callbacks use the async companions. Where an Upstream callback passed to a sync API performs IO, the Ported Test calls the matching companion (`eachAsync`, `mapAsync`, `filterAsync`, `rejectAsync`, `firstAsync`, `everyAsync`, `containsAsync` or `partitionAsync`) and awaits it. The assertions on its result are unchanged.
- **DIV-1.3** Lazy database collections are async. `instanceof LazyCollection` on the result of `cursor()` or `lazy()` becomes `instanceof AsyncLazyCollection`, and iterating it uses `for await`.
- **DIV-1.4** A validator's message bag is its last completed run's. `Validator::getMessageBag()` (`MessageProvider`, sync) returns the bag of the last awaited `validate()`, `passes()`, `fails()` or `errors()` run, and an empty bag before one; Upstream runs the rules on first access, which is async under AD-6. A Ported Test that reads a validator's message bag before running it awaits `passes()` first, marked with this clause (ESC-10.2-3).
- **DIV-1.5** A view's creators run before its render. `View\Factory::make()` and `file()` stay sync and return the View (AD-11): when the `creating: <name>` event has listeners, they start its dispatch at once, in Upstream's order, and the View keeps that dispatch, which `render()` awaits before the composers and the template run. A creator still runs before every composer and before the render. Upstream's creators finish before `make()` returns, so data an async creator sets is not visible to code that reads the View synchronously between `make()` and `render()`. A Ported Test that reads such data before rendering awaits `render()` first, marked with this clause (ESC-10.3-1).
- **DIV-1.6** A Promise is never a condition. `when` and `unless` on Conditionable are dual helpers (AD-6): an async callback makes them return its Promise, and a sync one its own value. A condition is never awaited. A thenable condition throws a `TypeError` saying to await it before the call, where a truthiness test would always take the `callback` branch. That covers a thenable `value`, a thenable returned by a `value` closure, and a thenable captured by the higher-order proxy. Their types reject a Promise condition too. PHP has no Promises, so no Upstream test depends on it (MAINT-2026-10-25-story-12-1-replan).
