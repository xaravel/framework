---
test_ids:
  - XT-contracts-8
trigger: divergence
proposed: >-
  Option 1 (recommended): `Illuminate\Contracts\View\Factory::make()` and
  `file()` stay sync and return the View, as AD-11 implies. When the
  `creating: <name>` event has listeners, the factory dispatches it at
  once, in Upstream's order. The View keeps the dispatch's Promise, and
  `render()` awaits it before composers and the template run. So a creator
  still runs before any composer and before the render, and an awaited
  render sees its data. What differs from Upstream: data an async creator
  sets is not visible to code that reads the View synchronously between
  `make()` and `render()`. This needs a new DIV-1 clause. Option 2: `make()`
  and `file()` return `Promise<View>` with `@asyncRoot callback`, which
  strict AD-6 derivation gives. AD-11's wording (`await view(...).render()`,
  `{!! view(...) !!}` awaited) and the `view()` helper would then change
  in the spine. Option 3: creators become sync-only callbacks, like the
  container's `resolving` hooks (AD-6, "Container hooks"), so `make()` stays
  sync with no deferred Promise. This is also a new DIV-1 clause.
evidence: >-
  Upstream `Illuminate\View\Factory::make()` and `::file()` call
  `callCreator($view)` before returning (`View/Factory.php:135,159`), and
  `Concerns\ManagesEvents::callCreator` runs
  `$this->events->dispatch('creating: '.$view->name(), [$view])` when there
  are listeners (`View/Concerns/ManagesEvents.php:188-191`). Story 10.2
  made `Events\Dispatcher::dispatch` async (`@asyncRoot callback`,
  listeners being DIV-1 async callbacks). AD-6 says "a public method is
  async if and only if it reaches a root, or it accepts a callback that
  DIV-1 allows to be async", and "a method that is async on any path is
  async on all paths". By that rule `make()` and `file()` are async. AD-11
  says "`View#toString()` throws a `ViewException` that names `await
  view(...).render()`", and that inside a template `{!! view(...) !!}` is
  awaited. Both assume `view(...)` returns a View synchronously. AD-6 also
  says "view loading [is] sync". The two ADs disagree on this one seam, and
  each way out either changes a DIV or changes the spine.
---

# ESC-10.3-1: Is `View\Factory::make()` sync, though its creators are events?

`View\Factory::make()` and `file()` dispatch the `creating: <name>` event before they return the View. Event listeners may be async (DIV-1), so AD-6's derivation makes both methods async. AD-11 is written as if `view(...)` returns a View synchronously (`await view(...).render()`). The two cannot both hold without a ruling.

The Story ports `View\Factory` with Option 1's shape: `make()` and `file()` are sync and return `View`. Option 1 needs a new DIV-1 clause, so the orchestrator cannot rule on it (MAINT-2026-10-16). It waits on the Maintainer. This blocks XT-contracts-8's `View\Factory` rows only. The rest of the Story is built and verified.
