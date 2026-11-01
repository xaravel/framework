# Epic 17 Context: Container

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give App Developers Laravel-compatible service binding, resolution, contextual injection, tagging and invocation, with explicit TypeScript injection metadata and scoped instances isolated across concurrent units of work. The container must preserve a long-lived Application's boot state while keeping each request's mutable state separate.

## Stories

- Story 17.1: Binding and resolution core
- Story 17.2: Contextual binding and contextual attributes
- Story 17.3: Calling, extending, tagging and resolving hooks
- Story 17.4: Scoped bindings and Scope Frame write rules

## Requirements & Constraints

Support Laravel's `bind`, `singleton`, `scoped`, `instance`, aliases, parameterized `make`, contextual binding, tagging, extension and container-driven calls. Preserve Upstream names, exception behavior and messages except for approved TypeScript adaptations. Dependencies autowire through declared injection tokens; TypeScript parameter types cannot supply runtime metadata. Constructor parameters without the required declaration must produce an actionable binding-resolution error.

Container unit tests are the conformance specification. Integration tests requiring Testbench remain `blocked-by:testbench` until its delivery. Contextual attributes owned by later Components remain blocked by their actual owning Component; never implement substitutes to satisfy their tests. Missing services use the shared runtime `BlockedByComponentError` and the owning package's component name.

Concurrent units must never share scoped instances or request-owned state, including across awaits. Verify isolation with interleaved units at the awaits of the code under test. The completed package must pass its API-surface gate, declare `callAsync` in the async surface and document the injection and long-lived Application divergences.

## Technical Decisions

Resolve string abstracts, contract tokens and concrete classes to one canonical service identity. Normalize classes through `fqcn()` and the contract alias table; bind the canonical token so a concrete-class lookup cannot create a second service instance. A service with no contract alias retains its Upstream string key. Class identity comes from the runtime Class Registry, never `constructor.name`; framework classes register their Upstream FQCN.

Injection uses a single named-map form: a TC39 class or method decorator, or `inject(map, fn)` for functions. Map keys follow parameter names and order, supporting named overrides and contextual primitive bindings. Specs accept tokens/classes, PHP-coercing `String`/`Number`/`Boolean`, non-coercing `primitive`, contextual descriptors and `oneOf` unions. Metadata uses `Symbol.metadata`; legacy decorators are forbidden. Contextual descriptors retain Upstream attribute names and integrate through the services that own them.

Resolution and ordinary resolving hooks stay synchronous. Reject async resolving callbacks. Async hooks run only through `callAsync` and the route dispatcher, after parameters resolve and before invocation. Do not introduce mixed synchronous/Promise return types.

Use the sole framework scope primitive in `@xaravel/runtime/scope`. Application lifecycle is registering, booting, then sealed; boot completes before any unit frame opens. Bases belong to individual Applications. Before sealing, writes target the active Application's base, including when no unit is open. After sealing, binding, singleton, alias, extension and tag writes throw in non-test units and use an overlay in test units; writes without an active frame throw. Deferred-provider registration is the separately controlled exception to sealed base writes.

`instance()` writes and scoped resolutions belong to the innermost applicable unit overlay, which is read before base state. Singletons cache where their bindings were registered. Development mode must detect a base singleton capturing a frame-owned dependency and identify both bindings. Per-unit mutable state belongs in frame slots, never singleton fields or module globals.

Nested units read through parent overlays. Narrow frames override only declared slots and otherwise pass operations outward. Within an enclosing test frame, nested kernel units retain request, route and CSP nonce locally while shared test state follows the enclosing test overlay, subject to the approved request/job/command write restrictions. The runtime seam must support per-key config fallthrough, including overlapping dotted-key and parent-key writes, so config can adopt identical semantics.

Singleton lint coverage includes mutations within fields and writes through aliases. Only explicitly listed process-wide cache fields, with an Upstream-member citation, are exempt; request state never is. Generated singleton metadata must identify concrete classes returned by closure bindings, using Oracle boot observations where static scanning cannot determine them.

## Cross-Story Dependencies

Binding and canonical resolution underpin contextual injection, calling and scope-aware caching. Contextual service descriptors depend on the Components they resolve; their absence remains explicit until those Components arrive. Testbench later clears Container integration-test blocks.

Scoped write routing adds the active-Application boot seam needed by Macroable and Config. Completing that seam releases their existing retrospective follow-ups; Config also depends on the settled nested-overlay read behavior. Application lifecycle and provider registration must remain compatible with the shared runtime scope model used by later kernels and services.

## Foreseeable Escalations

### APIs a later Story owns

The manifests explicitly own these tests now; the later Story text describes the additional API. Deliver complete real same-component functionality early where required, or seek an approved manifest move. Never mark these `blocked-by:container`: PRD §3 and ESC-13.1-10 allow only a later Component/Epic. These overlaps do not themselves require a ruling.

- `Illuminate\Tests\Container\ContainerTest::testResolutionOfClassWithDefaultParametersAndContextualBindings` — `when().needs().give()`; Story 17.2.
- `Illuminate\Tests\Container\ContainerTest::testCurrentlyResolving` — `when().needs().give(), parameter attribute`; Story 17.2; attribute afterResolvingAttribute hook: 17.3.
- `Illuminate\Tests\Container\ContainerTest::testMethodLevelContextualBinding` — `when().needs().give(), call`; Story 17.2 and 17.3.
- `Illuminate\Tests\Container\ContainerTest::testReboundListeners` — `rebinding callbacks`; Story 17.3 (hook subject; explicitly owned by 17.1 manifest).
- `Illuminate\Tests\Container\ContainerTest::testReboundListenersOnInstances` — `rebinding callbacks`; Story 17.3 (hook subject; explicitly owned by 17.1 manifest).
- `Illuminate\Tests\Container\ContainerTest::testReboundListenersOnInstancesOnlyFiresIfWasAlreadyBound` — `rebinding callbacks`; Story 17.3 (hook subject; explicitly owned by 17.1 manifest).
- `Illuminate\Tests\Container\ContainerTest::testWithFactoryHasDependency` — `SelfBuilding.newInstance dependency injection via Container.call`; Story 17.3.
- `Illuminate\Tests\Container\ContainerTest::testScopedClosureResolution` — `scoped/scopedIf, scoped attributes or forgetScopedInstances`; Story 17.4 (scoped subject; tests explicitly owned by 17.1).
- `Illuminate\Tests\Container\ContainerTest::testScopedBindingsWithClosureReturnType` — `scoped/scopedIf, scoped attributes or forgetScopedInstances`; Story 17.4 (scoped subject; tests explicitly owned by 17.1).
- `Illuminate\Tests\Container\ContainerTest::testScopedIf` — `scoped/scopedIf, scoped attributes or forgetScopedInstances`; Story 17.4 (scoped subject; tests explicitly owned by 17.1).
- `Illuminate\Tests\Container\ContainerTest::testScopedDoesNotRegisterDuplicateScopedInstances` — `scoped/scopedIf, scoped attributes or forgetScopedInstances`; Story 17.4 (scoped subject; tests explicitly owned by 17.1).
- `Illuminate\Tests\Container\ContainerTest::testScopedIfDoesNotRegisterDuplicateScopedInstancesWhenRebound` — `scoped/scopedIf, scoped attributes or forgetScopedInstances`; Story 17.4 (scoped subject; tests explicitly owned by 17.1).
- `Illuminate\Tests\Container\ContainerTest::testScopedClosureResets` — `scoped/scopedIf, scoped attributes or forgetScopedInstances`; Story 17.4 (scoped subject; tests explicitly owned by 17.1).
- `Illuminate\Tests\Container\ContainerTest::testScopedConcreteResolutionResets` — `scoped/scopedIf, scoped attributes or forgetScopedInstances`; Story 17.4 (scoped subject; tests explicitly owned by 17.1).
- `Illuminate\Tests\Container\ContainerTest::testContainerScopedAttribute` — `scoped/scopedIf, scoped attributes or forgetScopedInstances`; Story 17.4 (scoped subject; tests explicitly owned by 17.1).
- `Illuminate\Tests\Container\ContainerTest::testBindInterfaceToScoped` — `scoped/scopedIf, scoped attributes or forgetScopedInstances`; Story 17.4 (scoped subject; tests explicitly owned by 17.1).
- `Illuminate\Tests\Container\ContainerTest::testScopedSingletonWithBind` — `scoped/scopedIf, scoped attributes or forgetScopedInstances`; Story 17.4 (scoped subject; tests explicitly owned by 17.1).
- `Illuminate\Tests\Container\ContextualBindingTest::testContextualBindingGivesTagsForArrayWithNoTagsDefined` — `giveTagged/tagged or tag`; Story 17.3.
- `Illuminate\Tests\Container\ContextualBindingTest::testContextualBindingGivesTagsForVariadicWithNoTagsDefined` — `giveTagged/tagged or tag`; Story 17.3.
- `Illuminate\Tests\Container\ContextualBindingTest::testContextualBindingGivesTagsForArray` — `giveTagged/tagged or tag`; Story 17.3.
- `Illuminate\Tests\Container\ContextualBindingTest::testContextualBindingGivesTagsForVariadic` — `giveTagged/tagged or tag`; Story 17.3.
- `Illuminate\Tests\Container\ContextualBindingTest::testContextualBindingWorksForMethodInvocation` — `call`; Story 17.3.
- `Illuminate\Tests\Container\ContextualAttributeBindingTest::testDependencyWithAfterCallbackAttributeCanBeResolved` — `call, attribute after callback or tag/tagged`; Story 17.3.
- `Illuminate\Tests\Container\ContextualAttributeBindingTest::testInjectionWithAttributeOnAppCall` — `call, attribute after callback or tag/tagged`; Story 17.3.
- `Illuminate\Tests\Container\ContextualAttributeBindingTest::testAttributeOnAppCall` — `call, attribute after callback or tag/tagged`; Story 17.3.
- `Illuminate\Tests\Container\ContextualAttributeBindingTest::testNestedAttributeOnAppCall` — `call, attribute after callback or tag/tagged`; Story 17.3.
- `Illuminate\Tests\Container\ContextualAttributeBindingTest::testTagAttribute` — `call, attribute after callback or tag/tagged`; Story 17.3.
- `Illuminate\Tests\Container\ContextualAttributeBindingTest::testParameterIsPassedToContextualAttributeResolverOnAppCall` — `call, attribute after callback or tag/tagged`; Story 17.3.

Evidence: Upstream `tests/Container/ContainerTest.php:156-270,401-409,446-494,600-614,823-835,848-890,1069-1104`; `ContextualBindingTest.php:334-389,513-531`; `ContextualAttributeBindingTest.php:123-130,317-408,569-598`. Indirect calls: `src/Illuminate/Container/Container.php:1223`, `ContextualBindingBuilder.php:86`, `Attributes/Tag.php:31`. Story 17.3's 61 Test IDs and their fixtures call no later 17.4 API; Story 17.4 has no Upstream Test IDs and no later Story.

### Consequence row

Missing in both `tools/xt-coverage/consequences.ts` and `conformance/xaravel-consequences/container.jsonl`. Required before XT-container-1..3. Epic 17 declares FR-19 and AD-1/4/5/6; the standing rule adds AD-2: `{ frs: [19], ads: [1, 2, 4, 5, 6] }`. Both paths are Protected; ESC-17.1-1 requests an Infrastructure change.

### Non-framework Composer dependencies

- `psr/container` supplies `Psr\Container\ContainerExceptionInterface` for Story 17.1 (`ContainerTest.php:31,805-812`); root Upstream composer.json requires `^1.1.1|^2.0.1`. Use the existing contracts port, not a new dependency.
- PHPUnit test base, attributes and assertions use the existing `@xaravel/assert` grader (root require-dev `phpunit/phpunit`); Story 17.2's Mockery uses `@xaravel/mockery` (root require-dev `mockery/mockery`).
- Story 17.2 uses `Psr\Log\LoggerInterface` in `ContextualAttributeBindingTest.php` (root require `psr/log`) and PDO for `DB` descriptor testing; database is a later Component and can legitimately be `blocked-by:database`.
- Container composer.json also requires Symfony's PHP 8.4/8.5 polyfills. They are PHP compatibility dependencies, not additional test assertions or JavaScript dependency requests. Fixture setup's PHP_VERSION/version_compare gates PHP 8.5 BindWhen fixture loading; preserve the fixture definitions and every selected test in the port.

### Additional pre-build contract gaps

ESC-17.1-2: DIV-3/inject has no decided default/optional/nullable representation. An unbound nullable class with default null must remain null, but resolves after a binding is registered; invoking JavaScript defaults alone cannot make that choice. ESC-17.1-3: runtime reflection lacks PHP callable/index ReflectionParameter construction, default readers, class constructor/instantiability readers and ReflectionProperty.getValue used by the tests. Shared PHP semantics stay in runtime.

`bun run scan:builtins container` reports five functions, three constructs, one constant and three classes. Existing PORTING rules cover get_class/fqcn, Countable, isset/unset, and trailing func_get_args extras. Source-level call_user_func and spl_object_id need shared implementations or a demonstrably complete approved conversion (ESC-17.1-3). PDO is later database. ReflectionProperty has direct assertions and cannot be replaced with a getter silently. Story 17.3 must additionally preserve all arguments returned by its func_get_args fixtures, including declared/default/variadic arguments, not just extras.
