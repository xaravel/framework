---
decision: approved
decided_by: Maintainer
date: 2026-10-23
escalation_sha256: "25170de050d7389b33ad27557c077f7d9f706c9c4d1d97de7c4639a7993473bc"
---

# ESC-10.2-5: approved, option 1 (`Application::register()` async; the deferred-provider path sync)

Option 1 is approved. It is AD-5 and AD-6 applied: a provider's `boot()` may return a Promise, deferred providers boot synchronously, and the container stays sync. Option 2, all four methods async, is not taken: it would make `Container::make()` of a deferred service async, against both ADs.

## The change

- **The contract.**
  - `Illuminate\Contracts\Foundation\Application` keeps `register()` and `registerConfiguredProviders()` async, with `@asyncRoot callback`. On a booted application, registering a provider boots it.
  - It keeps `registerDeferredProvider()` and `loadDeferredProviders()` sync.
- **The Foundation Story's job.**
  - It registers a deferred provider through a sync internal path, never through the public async `register()`.
  - A deferred provider whose `boot()` returns a Promise throws.

## Changes in this ruling's PR

- **Spine, AD-5 (Lifecycle):** a sentence saying that `Application::register(provider)` is the async form, and that the deferred path registers and boots through a sync internal route. The sentence "`register()` is sync" means a provider's own `register()`.
- `bun run xt:consequences` regenerates the consequence files that quote AD-5.
