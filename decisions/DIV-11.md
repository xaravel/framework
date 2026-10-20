---
div: 11
title: "Long-lived application"
cites: ["AD-5", "AD-25", "AD-13"]
sources: []
fewer_assertions: []
---

# DIV-11: Long-lived application

## Rationale

An application boots once and serves many units of work: one per process in production, and a fresh one per test, as in Laravel. This is Laravel Octane's model. Concurrent units share one process, so per-unit state must live in a frame, never in singleton fields (AD-5). The test lifecycle fixes the order in which a test's frame and application are made (AD-25). PHP's pcntl is unavailable, so job timeouts need a supervisor (AD-13).

## Behaviour

- **Scope Frames.** Each request, job, command, scheduled task, test or WebSocket message runs in a Scope Frame, found through `AsyncLocalStorage`.
- **What a frame can't change.** After boot, `bind`, `singleton`, routes, macros and `Blade.directive` throw `ScopeFrameException` inside a request, job or command. Inside a test they apply to that test only.
- **What a frame holds.** Runtime writes made during the unit go into the frame and are discarded when it ends. These are `config([...])`, `app().instance()`, facade fakes, locale, auth, session, Context and static setters such as `Model.unguard()`. So concurrent requests never see each other's state.
- **Singletons and providers.** Singletons live for the life of the application. Provider `boot()` must not read per-request state.
- **Tests.** The harness opens the test frame first; `createApplication` then builds and boots a fresh Application inside it, which is sealed before the test body runs. Discarding the test frame resets its state.
- **Job timeouts.** PHP's pcntl is unavailable, so `queue:work --timeout` is enforced by a supervisor process (AD-13).
  - The supervisor starts only from the `queue:work` command entry, when `--timeout > 0` and not when running `--once` under testing. It runs the worker loop in a child process (`Bun.spawn`).
  - The child processes exactly one job at a time.
  - On timeout, the supervisor kills the child, records the job as Upstream does (attempt counted, `TimeoutExceededException`), and starts a new child. SIGTERM is forwarded.
  - The in-process `Worker` keeps Upstream's API, and its tests are unchanged.

## Adaptation clauses

`fewer_assertions` is empty, so no clause of this record waives the assertion floor (FR-113). Adding an item needs an approved Escalation (ESC-5.3-2, FR-113); an item is the quoted `<k>` of an existing clause, for example `["2"]`. Clauses are append-only: a new clause takes the next number, and an existing clause is never renumbered.

- **DIV-11.1** Scope Frames. Every Ported Test runs in its own test frame, opened by the harness before `createApplication` (AD-25). Code under test that needs a unit runs inside one; outside a frame, a write throws `ScopeFrameException`.
- **DIV-11.2** Base-only writes. After boot, `bind`, `singleton`, routes, macros and `Blade.directive` throw `ScopeFrameException` inside a request, job or command. A Ported Test that makes such a write in its own body keeps it; it applies to that test only.
- **DIV-11.3** Frame-held writes. Runtime writes made during a unit (`config([...])`, `app().instance()`, facade fakes, locale, auth, session, Context, static setters such as `Model.unguard()`) are held by the frame and discarded when it ends. A Ported Test's assertions on that state within the unit are unchanged.
- **DIV-11.4** Job timeouts: no pcntl; job timeouts are enforced by the supervisor process, which kills the worker child (AD-13); Upstream `queue:work` timeout tests run against a spawned fixture app and are marked `adapted:DIV-11.4`, while in-process `Worker` tests are not adapted.
