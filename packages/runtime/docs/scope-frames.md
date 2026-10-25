# Scope Frames and propagation

`@xaravel/runtime/scope` is the only framework `AsyncLocalStorage` (AD-5). A Scope Frame holds the state Laravel keeps
per request, per job or per test, so concurrent units on one Bun process never see each other's state. Everything here
is exported from `@xaravel/runtime/scope` and from the package root. It is synchronous, except `interleave`.

## Frames and slots

- `runInFrame(kind, fn, app?)` runs `fn` in a unit frame of `kind` (`test`, `unit`, `request`, …): a child of the
  active frame, or a root unit when there is none. A non-Promise result is returned unchanged (AD-6). A Promise result
  settles only after the unit's defer list has drained.
- `runInRootFrame(kind, fn, app?)` always opens a root unit, which sees no enclosing frame's slots. Production kernels
  and `interleave` use it.
- `runInNarrowFrame(kind, slots, fn)` opens a narrow frame (`DB.transaction`, a Concurrency task, `Context.scope`). It
  overrides only the `slots` it declares, and every other read and write passes through to the enclosing unit. The
  kind `test` is reserved for test units: `runInNarrowFrame("test", …)` throws `TypeError`.
- `currentFrame()` is the active `Frame` (`{ kind, app }`), or `null` outside any frame.
- `frameKinds()` is the kinds of the active frame chain, innermost first, unit and narrow frames alike, as a frozen
  array; `[]` outside any frame. It walks parents only: an `interleave` unit's origin is never followed, so there it is
  `["unit"]`. A `test` kind in it is always a test unit. It stores nothing (decisions/ESC-11.1-3.md).
- `frameSlot(key, init)` returns a `FrameSlot` (`FrameSlot<T>`), a per-frame value with `get()` and `set(value)`. Its key is a
  `FrameSlotKey` (a string or a symbol). `get()` reads the nearest frame up the chain that holds the key, else runs
  `init()` once per owning frame. Outside any frame, `get()` returns `init()` without storing it, and `set()` throws
  `ScopeFrameException`. Once the owning unit has ended (a `bindToFrame` callback that outlives it), `set()` throws
  `ScopeFrameException` `Cannot write the frame slot <key> to the unit frame after it has ended`. `get()` still reads a
  value stored before the end, and otherwise returns `init()` without storing it.
- `REQUEST_SLOT`, `ROUTE_SLOT` and `CSP_NONCE_SLOT` are the three slots a unit nested in a `test` unit keeps for
  itself, at any depth (a unit inside a child of the test included). Its other writes land in the nearest enclosing test
  frame (AD-5.8, `decisions/MAINT-2026-10-24-ad-5-8-any-depth.md`). Parents only count: an `interleave` unit's origin
  does not make it nested. A unit with no test frame up its parents keeps its own writes and reads its parent's values
  until it writes them.
- `frameDefer(promise)` adds to the innermost unit's defer list. The unit ends only after the list drains, and a sync
  body that leaves deferred promises throws `ScopeFrameException`.

`ScopeFrameException` (FQCN `Xaravel\Runtime\Scope\ScopeFrameException`) is PHP's `RuntimeException` subclass, so a
port can catch it as one (see [PHP exceptions](exceptions.md)).

## Applications, overlays and statics

- A frame carries the Application it runs for (`currentFrame()?.app`): the one its opener names, else its parent's,
  else `null`. `currentApplication()` falls back to the process's default Application, which
  `setDefaultApplication(app)` sets. A `null` app falls back to the default Application too: a frame opened with
  `app` `null` names no Application, so `currentApplication()` in it is the default (AD-5.3). The runtime never
  imports Foundation: an Application is any object.
- `frameOverlay(app)` is a `FrameOverlay`, the active unit's overlay for one Application, with `has`, `get` and `set`.
  Two Applications writing the same key in one unit each read only their own value. For a non-test unit nested in a
  `test` unit at any depth, the overlay is the nearest test frame's.
- `frameStatic(Class, key, init)` holds one Upstream static setter (`Model.unguard`, `Carbon.setTestNow`) per unit,
  and discards it when the unit ends. A non-test unit nested in a `test` unit at any depth holds no statics of its own:
  they are the nearest test frame's, and end with it.

A write goes where an undeclared slot write goes (AD-5.8): through narrow frames, from a unit nested in a `test` unit at
any depth into the nearest test frame, else into the unit. A `test` unit nested in another test is the nearest test
frame for its own writes, so it holds them and discards them when it ends. A write to an ended unit throws.

## Propagation

Bun 1.4.3 drops the store in async-generator bodies and in `type: "direct"` stream sources (ESC-8.3-1). The wrappers
take an `AsyncLocalStorage.snapshot()` when they are called:

- `bindToFrame(fn)` binds a callback to the active frame, for example a timer: `setTimeout(bindToFrame(cb), ms)`.
- `frameStreamSource(source)` wraps a stream source's `start`, `pull` and `cancel`.
- `frameAsyncGenerator(generator)` runs each `next`, `return` and `throw` in the creating frame.

## The grader's entry point

On load the scope module installs `globalThis[Symbol.for('xaravel.scope.run')]`, which is `runInFrame` itself. The
grader opens a test frame with it without importing the runtime. The property is non-writable, non-configurable and
non-enumerable. A property already there with another value throws `ScopeFrameException`, because a second copy of
the module would mean a second store.

`XARAVEL_NO_SCOPE_GLOBAL=1`, read once when the runtime loads, is the opt-out for a second copy of `@xaravel/runtime`. It
skips both globals the runtime installs: `Symbol.for('xaravel.scope.run')` and the PHP class map
`Symbol.for('xaravel.php.classes')` ([exceptions.md](exceptions.md)). A second copy loaded with it imports without
throwing and publishes neither (`decisions/ESC-9.10-2.md` (b)).

## `interleave`

`interleave(units)` is the dev-only helper every concurrency test uses (NFR-4). Each unit starts synchronously, in array
order, in its own root `unit` frame, and the units take turns at every `await` in the same order on every run. It
resolves with the results in order, or rejects with the first rejection once every unit has settled.

Opened under a `test` frame, each unit records that test unit as its origin, so a concurrency test's fakes stay
visible in its units:

- Overlay, static and test-class reads that reach the unit's root continue from the origin test frame. A unit sees
  the test's `frameOverlay` and `frameStatic` values and the classes it registered with `registerTestClass`.
- Slot reads never follow the origin: the unit sees none of the test's `frameSlot` values.
- Writes never follow it either. Overlay, static and slot writes stay in the unit, so sibling units stay isolated, and
  `registerTestClass` inside a unit throws `ScopeFrameException`, since no test frame encloses it.
- `interleave` from a frame with no test unit up its chain records no origin.
