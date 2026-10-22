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
  overrides only the `slots` it declares, and every other read and write passes through to the enclosing unit.
- `currentFrame()` is the active `Frame` (`{ kind, app }`), or `null` outside any frame.
- `frameSlot(key, init)` returns a `FrameSlot` (`FrameSlot<T>`), a per-frame value with `get()` and `set(value)`. Its key is a
  `FrameSlotKey` (a string or a symbol). `get()` reads the nearest frame up the chain that holds the key, else runs
  `init()` once per owning frame. Outside any frame, `get()` returns `init()` without storing it, and `set()` throws
  `ScopeFrameException`.
- `REQUEST_SLOT`, `ROUTE_SLOT` and `CSP_NONCE_SLOT` are the three slots a child of a `test` unit keeps for itself. Its
  other writes land in the test frame. A child of any other unit keeps its own writes and reads its parent's values
  until it writes them.
- `frameDefer(promise)` adds to the innermost unit's defer list. The unit ends only after the list drains, and a sync
  body that leaves deferred promises throws `ScopeFrameException`.

`ScopeFrameException` (FQCN `Xaravel\Runtime\Scope\ScopeFrameException`) is PHP's `RuntimeException` subclass, so a
port can catch it as one (see [PHP exceptions](exceptions.md)).

## Applications, overlays and statics

- A frame carries the Application it runs for (`currentFrame()?.app`): the one its opener names, else its parent's,
  else `null`. `currentApplication()` falls back to the process's default Application, which
  `setDefaultApplication(app)` sets. The runtime never imports Foundation: an Application is any object.
- `frameOverlay(app)` is a `FrameOverlay`, the active unit's overlay for one Application, with `has`, `get` and `set`.
  Two Applications writing the same key in one unit each read only their own value.
- `frameStatic(Class, key, init)` holds one Upstream static setter (`Model.unguard`, `Carbon.setTestNow`) per unit,
  and discards it when the unit ends.

A write goes where an undeclared slot write goes (AD-5.8): through narrow frames, from a child of a `test` unit into the
test frame, else into the unit. A write to an ended unit throws.

## Propagation

Bun 1.4.3 drops the store in async-generator bodies and in `type: "direct"` stream sources (ESC-8.3-1). The wrappers
take an `AsyncLocalStorage.snapshot()` when they are called:

- `bindToFrame(fn)` binds a callback to the active frame, for example a timer: `setTimeout(bindToFrame(cb), ms)`.
- `frameStreamSource(source)` wraps a stream source's `start`, `pull` and `cancel`.
- `frameAsyncGenerator(generator)` runs each `next`, `return` and `throw` in the creating frame.

## The grader's entry point

On load the scope module installs `globalThis[Symbol.for('xaravel.scope.run')]`, which is `runInFrame` itself. The
grader opens a test frame with it without importing the runtime. The property is non-writable, non-configurable and
non-enumerable. `XARAVEL_NO_SCOPE_GLOBAL=1` skips the install. A property already there with another value throws
`ScopeFrameException`, because a second copy of the module would mean a second store.

## `interleave`

`interleave(units)` is the dev-only helper every concurrency test uses (NFR-4). Each unit starts synchronously, in array
order, in its own root `unit` frame, and the units take turns at every `await` in the same order on every run. It
resolves with the results in order, or rejects with the first rejection once every unit has settled.
