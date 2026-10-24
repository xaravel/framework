---
decision: approved
decided_by: Maintainer
date: 2026-10-24
escalation_sha256: "e2cbd6a6d9ac7c76b5b451e5d29ab1a8bdea93a9dbafc39137b45eba29da2231"
---

# ESC-10.5-1: approved, option 1 (the hook order is Laravel's, and AD-25 is corrected)

Option 1 is approved. AD-25's hook order was a mistake in the spine, not a chosen divergence. `@xaravel/contracts/testing`'s `TEST_HOOK_ORDER` follows Upstream, and the spine now says the same.

## Upstream's order

From `Illuminate\Foundation\Testing\Concerns\InteractsWithTestCaseLifecycle`, at the Pin:
1. `setUpTheTestEnvironment` calls `refreshApplication` (`createApplication`).
2. It then calls `setUpTraits()`. Each `setUp<Trait>` runs, and each `tearDown<Trait>` is registered as a `beforeApplicationDestroyed` callback.
3. Then the `afterApplicationCreated` callbacks run.
4. The test runs.
5. `tearDownTheTestEnvironment` calls `callBeforeApplicationDestroyedCallbacks()` in registration order, so the `tearDown<Trait>` callbacks run before any the test registered later. Then the Application is flushed.

## The change

AD-25's **Hook order** line in `ARCHITECTURE-SPINE.md` now reads: `createApplication` → `setUp<Trait>` per trait, each registering its `tearDown<Trait>` as a `beforeApplicationDestroyed` callback → `afterApplicationCreated` → test → `beforeApplicationDestroyed` callbacks in registration order, so the `tearDown<Trait>` ones first → test frame ends.

AD-25's **Frame order** line does not change: the test frame opens first, `createApplication` runs inside it, and `setUp<Trait>` writes belong to the test frame.

## The route

Story 10.5 already builds this order, and XT-contracts-15 parses it from `InteractsWithTestCaseLifecycle.php`. The Story resumes XT-contracts-15 against the corrected AD-25.
