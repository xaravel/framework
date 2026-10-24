---
test_ids:
  - XT-contracts-15
trigger: divergence
proposed: >-
  Option 1 (recommended): `@xaravel/contracts/testing` follows Upstream's
  order, `createApplication` → `setUp<Trait>` → `afterApplicationCreated` →
  test → `tearDown<Trait>` → `beforeApplicationDestroyed`, and the Maintainer
  corrects AD-25's "Hook order" line to match. A trait's `tearDown<Trait>` is
  registered as a `beforeApplicationDestroyed` callback while the traits are
  set up, so it runs before the callbacks a test registers later, as in
  Upstream. This adds no divergence. Option 2: keep AD-25's literal order
  (`afterApplicationCreated` before `setUp<Trait>`) under a new DIV clause,
  which changes when every `afterApplicationCreated` callback sees trait
  state (a refreshed database, disabled middleware, Faker) compared with
  Upstream.
evidence: >-
  AD-25 (spine, "Hook order") says `createApplication` →
  `afterApplicationCreated` → `setUp<Trait>` per trait → test →
  `tearDown<Trait>` → `beforeApplicationDestroyed` → test frame ends. The
  frame end is the harness's (AD-25 "Frame order"), not a TestCase hook,
  so `TEST_HOOK_ORDER` leaves it out under either option. Upstream at the Pin runs
  the traits first
  (`conformance/upstream/framework/src/Illuminate/Foundation/Testing/Concerns/InteractsWithTestCaseLifecycle.php`).
  `setUpTheTestEnvironment` calls `$this->refreshApplication()`, then
  `$this->setUpTraits()`, then `foreach ($this->afterApplicationCreatedCallbacks
  as $callback)`. `setUpTraits` calls each `setUp<Trait>` and registers each
  `tearDown<Trait>` with `$this->beforeApplicationDestroyed(fn () =>
  $this->{$method}())`, and `tearDownTheTestEnvironment` runs
  `callBeforeApplicationDestroyedCallbacks()` first. So `setUp<Trait>` comes
  before `afterApplicationCreated`, and `tearDown<Trait>` runs as the first
  `beforeApplicationDestroyed` callbacks. Story 10.5's third AC asks for
  AD-25's order; following it literally diverges from Upstream with no DIV
  clause that covers it.
---

# ESC-10.5-1: Which hook order does `@xaravel/contracts/testing` fix?

AD-25's order is `createApplication` → `afterApplicationCreated` → `setUp<Trait>` per trait → test → `tearDown<Trait>` → `beforeApplicationDestroyed` → test frame ends, so it puts `afterApplicationCreated` before `setUp<Trait>`. The last step, the test frame's end, belongs to the harness and is not a TestCase hook, so `TEST_HOOK_ORDER` leaves it out under either option. Upstream's `setUpTheTestEnvironment` runs `setUpTraits()` first, then the `afterApplicationCreated` callbacks, and registers each `tearDown<Trait>` as a `beforeApplicationDestroyed` callback. Using AD-25's order would be a divergence that no DIV clause covers, so this Story cannot pick it on its own.

The Story builds Option 1: `TEST_HOOK_ORDER` is Upstream's order, and XT-contracts-15 parses that order from `InteractsWithTestCaseLifecycle.php`. Option 1 adds no divergence and weakens no check, but it needs the Maintainer to correct AD-25's line, which is a Protected Path. This blocks XT-contracts-15 only. XT-contracts-13 and XT-contracts-14 do not depend on the ruling.
