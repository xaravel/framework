---
test_ids:
  - XT-conformance-84
trigger: open-question
proposed: >-
  Amend the Story 3.6 spec's two static rules, then rebuild from the saved
  attempt (_bmad-output/implementation-artifacts/spec-3-6-attempt.patch).
  (1) Singleton `class` inference. A closure builds X when every return
  expression at its own depth is one of these: `new X(...)`; `(new X(...))`
  followed by a `->m(...)` chain where each m is declared in X's indexed
  hierarchy and its body ends `return $this;`; `tap(new X(...), ...)`; or
  `$v`, when the closure's only assignment to `$v` at its own depth is
  `new X(...)`. A one-argument `singleton(X::class)` gives `class` only when X
  is a non-abstract indexed class. Every other shape stays null. Null
  bindings stay listed in `bindings`, and the run prints them so the
  reviewer sees them. (2) Boot-reachability. Only calls at the top level of a
  provider's `register()` / `boot()` count, plus calls in provider methods
  reached from those by `$this->m(` at top level. Calls inside closures,
  including rebinding, resolving, booted and listener callbacks, do not
  count. In C's methods, writes inside a nested closure count as runtime
  writes, not as writes of the enclosing method. Writes also include
  pre-increment and pre-decrement, list or array destructuring, `&` and
  by-reference built-ins (array_pop, array_push, array_shift, array_unshift,
  array_splice and the sort family) applied to `$this->P`, and
  `ClassName::$P` / `parent::$P` when ClassName is in C's analysed set.
  Method names compare case-insensitively. A method's self-calls do not
  block its reachability, and a helper called only from `__construct`
  counts as construction. Also run `scans.test.ts` in the ci.yml `upstream`
  job after the sync, so the real-snapshot assertions run in CI.
evidence: >-
  The spec's intent contract (_bmad-output/implementation-artifacts/spec-3-6-upstream-scans-facades-singletons-and-boot-only-state.md,
  Boundaries) fixed both rules, and the build followed them. The review
  found two outcomes that contradict the Story and AD-5. (a) 23 of 202
  bindings get `class: null`, among them translator (`$trans = new
  Translator(...); return $trans;`), redirect, validator, cookie (`(new
  CookieJar)->setDefaultPathAndDomain(...)`), events, encrypter, queue
  (`tap(new QueueManager($app), ...)`), blade.compiler and view. So
  `classes` leaves out Translator, Redirector, CookieJar and the Event
  Dispatcher, which AD-5 (spine line 159) names as state the singleton lint
  must catch. The AC asks for "every class bound with singleton()". (b)
  `conformance/boot-only-state` lists `Illuminate\Routing\UrlGenerator::$request`.
  RoutingServiceProvider::requestRebinder (RoutingServiceProvider.php:101-105)
  calls setRequest inside a closure that runs on each request rebinding. AD-5
  names "UrlGenerator request" as per-unit frame state, and boot-only entries
  throw when written after `sealed`. Foundation's
  `Exceptions\Renderer\Listener::$queries` is per-query state listed the same
  way. Router::$groupStack is written through `array_pop` (Router.php:494),
  which the write rule does not see. The rules are inside the spec's intent
  contract, which the build workflow may not amend, so the Story halted as an
  intent gap.
---

# ESC-3.6-1: how the singleton and boot-only scans infer classes and boot-time writes

Story 3.6's static scans follow two rules that the spec's intent contract fixed. In both cases the rule gives results that contradict the Story's AC and AD-5:

- **The class rule is too narrow.** Upstream builds most core services in closures of the form `$v = new X; …; return $v;`, `(new X)->setter(...)` or `tap(new X, …)`. The rule records `class: null` for these, so `tools/lint-rules/singletons.json` leaves out the per-request services the lint exists to guard.
- **The boot-reachability rule is too broad.** It treats a call anywhere in a provider as boot-time, including callbacks that run per request, and it misses by-reference writes. As a result, `conformance/boot-only-state` lists per-request state that AD-5 says must live in frame slots.

The Story is blocked until the rules are settled.

The options:

1. **Amend both rules as `proposed` (proposed).** Static analysis stays, and the rules follow the shapes Upstream actually uses. Bindings that stay null remain visible for review. The Phase 0 implementation in the saved patch is reused, and only the rules and their tests change.
2. **Resolve classes at run time in the Oracle image.** Register every provider in a bare Application, resolve each shared binding and record `get_class`. This gives exact classes for the bindings that resolve, but some need config (database, queue, cache drivers), and run time cannot answer the boot-only question. It also moves the scan into Docker, which the epic's "contributors need neither Docker nor PHP" rule disfavours.
3. **Keep the rules and treat both files as rough seeds.** Commit them as they are and fix entries by hand later. `--check` forbids hand edits, and AD-5's guard would throw on legitimate per-request writes such as `UrlGenerator::$request`, so this option contradicts AD-5.
