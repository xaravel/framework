// `@xaravel/contracts/testing`: the Xaravel-only test lifecycle seam (AD-25, AD-27). Testing and Testbench run their
// hooks in this one order.
//
// It is Upstream's order (`InteractsWithTestCaseLifecycle`), which AD-25 states since ESC-10.5-1:
// `setUpTheTestEnvironment` calls `refreshApplication()`, then `setUpTraits()`, then the `afterApplicationCreated`
// callbacks. `setUpTraits` registers each trait's `tearDown<Trait>` as a `beforeApplicationDestroyed` callback, so it
// runs before the callbacks registered after it, when `tearDownTheTestEnvironment` calls them.

/**
 * The test hooks in the order they run: `createApplication`, each trait's `setUp<Trait>`, the `afterApplicationCreated`
 * callbacks, the test, each trait's `tearDown<Trait>`, then the other `beforeApplicationDestroyed` callbacks.
 */
export const TEST_HOOK_ORDER = Object.freeze(["createApplication", "setUp<Trait>", "afterApplicationCreated", "test", "tearDown<Trait>", "beforeApplicationDestroyed"] as const);

/** One hook of `TEST_HOOK_ORDER`. */
export type TestHook = (typeof TEST_HOOK_ORDER)[number];
