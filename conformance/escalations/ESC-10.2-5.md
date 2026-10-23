---
test_ids:
  - XT-contracts-5
trigger: contract
proposed: >-
  Option 1 (recommended): `Illuminate\Contracts\Foundation\Application`
  keeps `register()` and `registerConfiguredProviders()` async
  (`@asyncRoot callback`: registering a provider on a booted application
  boots it, and a provider's `boot()` may return a Promise, AD-5), and
  keeps `registerDeferredProvider()` and `loadDeferredProviders()` sync,
  as AD-5 requires of the deferred path ("Deferred providers have a sync
  `boot()`. Loading one is the single base write allowed after `sealed`
  ... under a mutex"; the container's `make()`, which loads a deferred
  provider, is sync). The implementing Story (Foundation) then registers a
  deferred provider through a sync internal path, not through the public
  async `register()`, and a deferred provider whose `boot()` returns a
  Promise throws. A spine note under AD-5 records that `Application::register`
  is the async form and the deferred path the sync one. Option 2: make all
  four async, so `Container::make()` of a deferred service becomes async,
  which contradicts AD-5 and AD-6 ("the container ... sync").
evidence: >-
  Upstream's `Application::registerDeferredProvider()` calls
  `$this->register($instance = new $provider($this))`, and `register()`
  boots the provider when the application is booted
  (`conformance/upstream/framework/src/Illuminate/Foundation/Application.php`
  around lines 891 and 1033). `loadDeferredProviders()` and the container's
  `make()` reach `registerDeferredProvider()` through
  `loadDeferredProvider()` (line 1010). AD-5 makes provider `boot()` async
  ("`boot()` may return a Promise") but deferred providers' `boot()` sync,
  and AD-6 keeps the container sync. So under AD-6's "async on any path is
  async on all paths", `register()` is async while the deferred methods
  that call it must stay sync. The Story 10.2 port follows that split, and
  both Fidelity reviewers of its second pass (tree
  70d1c9a929e5a71c857684270e6c910bf63a20ab) rejected it on F-9: a sync
  `registerDeferredProvider()` that calls an async `register()` either
  floats a Promise or must itself be async.
---

# ESC-10.2-5: `Application::register()` is async, but the deferred-provider path that calls it must stay sync

Registering a provider on a booted application boots it, and AD-5 lets a provider's `boot()` return a Promise, so `Application::register()` is async. Upstream also registers deferred providers through `register()`, from `registerDeferredProvider()`, which the container's sync `make()` reaches. AD-5 keeps that path sync. The two rules meet in this contract.

The recommended fix, Option 1, keeps the split: the public `register()` is async, and the deferred path registers through a sync internal route, as AD-5's "Lifecycle" rule describes. It decides how the Foundation Story implements Upstream's call, so it needs a ruling. This stops XT-contracts-5.
