// The Scope Frame primitive (AD-5, NFR-4): the only framework `AsyncLocalStorage`.
//
// `runInFrame(kind, fn)` runs `fn` in a unit frame; `currentFrame()` is the active frame or null; `frameSlot(key,
// init)` is a per-frame value, initialised lazily. Writing a slot with no active frame throws `ScopeFrameException`;
// reading one returns `init()` without storing it.
//
// Frame kinds (AD-5.8, Story 9.2). Frames form a parent chain. `runInFrame` opens a unit frame: a child of the active
// frame, else a root unit. `runInRootFrame` always opens a root unit (production kernels,
// `interleave`). `runInNarrowFrame` opens a narrow frame that overrides only the slots it declares. A child of a `test`
// unit keeps only the request, route and CSP nonce slots; its other writes land in the test frame. A child of any
// other unit keeps its own writes and reads its parent's values until it writes them.
//
// End of a unit (AD-5.9). `frameDefer(promise)` adds to the innermost unit's defer list; a unit whose body returns a
// Promise settles only after the list drains. A sync body that leaves deferred promises throws.
//
// On load this module installs `globalThis[Symbol.for('xaravel.scope.run')]`, which is `runInFrame` itself, so the
// grader opens a test frame without importing the runtime (ESC-4.2-1 item 2). The property is non-writable,
// non-configurable and non-enumerable (item 4). `XARAVEL_NO_SCOPE_GLOBAL=1`, read once at load, skips the install.
// A property already there with another value throws: a second copy of this module would mean a second store.
//
// Stream, async-generator and timer wrapping is in propagate.ts; overlays and `frameStatic` are Story 9.3's.
import { AsyncLocalStorage } from "node:async_hooks";
import { ScopeFrameException } from "./ScopeFrameException";

/** An active Scope Frame. */
export interface Frame {
  /** The frame's kind, as passed to `runInFrame`, `runInRootFrame` or `runInNarrowFrame` (`test`, `unit`, …). */
  readonly kind: string;
}

/** A per-frame value: `frameSlot(key, init)`. */
export interface FrameSlot<T> {
  /**
   * The value seen from the active frame: the nearest frame up the chain that holds the key, else `init()`, stored in
   * the frame a write would go to; `init()` (unstored) when there is none.
   */
  get(): T;
  /** Sets the value in the frame that owns the key from the active frame; throws `ScopeFrameException` when none does. */
  set(value: T): void;
}

/** A slot key: slots with the same key share storage in a frame. */
export type FrameSlotKey = string | symbol;

/** The request slot: one of the three slots a child unit of a `test` frame keeps (AD-5.8). */
export const REQUEST_SLOT: unique symbol = Symbol.for("xaravel.scope.slot.request");
/** The current route slot: one of the three slots a child unit of a `test` frame keeps (AD-5.8). */
export const ROUTE_SLOT: unique symbol = Symbol.for("xaravel.scope.slot.route");
/** The CSP nonce slot: one of the three slots a child unit of a `test` frame keeps (AD-5.8). */
export const CSP_NONCE_SLOT: unique symbol = Symbol.for("xaravel.scope.slot.csp-nonce");

const CHILD_OF_TEST_SLOTS: ReadonlySet<FrameSlotKey> = new Set<FrameSlotKey>([REQUEST_SLOT, ROUTE_SLOT, CSP_NONCE_SLOT]);

interface Store {
  readonly frame: Frame;
  readonly slots: Map<FrameSlotKey, unknown>;
  readonly parent: Store | null;
  readonly type: "unit" | "narrow";
  /** The declared slots of a narrow frame; null for a unit. */
  readonly declared: ReadonlySet<FrameSlotKey> | null;
  /** A unit's defer list; null for a narrow frame. */
  readonly defers: Promise<unknown>[] | null;
  ended: boolean;
}

const storage = new AsyncLocalStorage<Store>();

/** The active Scope Frame, or null outside any frame. */
export function currentFrame(): Frame | null {
  return storage.getStore()?.frame ?? null;
}

/**
 * Runs `fn` in a unit frame of `kind`: a child of the active frame, or a root unit when there is none. A non-Promise
 * result is returned unchanged (AD-6); a Promise result becomes a Promise that settles with it only after the unit's
 * defer list has drained (AD-5.9).
 */
export function runInFrame<T>(kind: string, fn: () => T): T {
  checkRun("runInFrame", kind, fn);
  const current = storage.getStore() ?? null;
  return runUnit(kind, current, fn);
}

/** Runs `fn` in a root unit frame of `kind`, which sees no enclosing frame's slots; otherwise as `runInFrame`. */
export function runInRootFrame<T>(kind: string, fn: () => T): T {
  checkRun("runInRootFrame", kind, fn);
  return runUnit(kind, null, fn);
}

/**
 * Runs `fn` in a narrow frame of `kind` that overrides only the `slots` it declares; every other read and write
 * passes through to the enclosing unit frame (AD-5.8). Its result is returned unchanged.
 */
export function runInNarrowFrame<T>(kind: string, slots: Iterable<FrameSlotKey>, fn: () => T): T {
  checkRun("runInNarrowFrame", kind, fn);
  if (slots === null || typeof slots !== "object" || typeof (slots as Partial<Iterable<FrameSlotKey>>)[Symbol.iterator] !== "function") {
    throw new TypeError(`runInNarrowFrame(): the ${kind} frame needs an iterable of slot keys`);
  }
  const declared = new Set<FrameSlotKey>();
  for (const key of slots) {
    if (typeof key !== "string" && typeof key !== "symbol") {
      throw new TypeError(`runInNarrowFrame(): the ${kind} frame's slot keys must be strings or symbols`);
    }
    declared.add(key);
  }
  const store: Store = { frame: Object.freeze({ kind }), slots: new Map(), parent: storage.getStore() ?? null, type: "narrow", declared, defers: null, ended: false };
  return storage.run(store, fn);
}

/**
 * Adds `promise` to the defer list of the innermost unit frame, which ends only after it settles (AD-5.9). Throws
 * `ScopeFrameException` with no enclosing unit frame, or once that unit has ended.
 */
export function frameDefer(promise: PromiseLike<unknown>): void {
  if ((typeof promise !== "object" && typeof promise !== "function") || promise === null || typeof promise.then !== "function") {
    throw new TypeError("frameDefer(): promise must be a Promise or thenable");
  }
  const unit = nearestUnit(storage.getStore() ?? null);
  if (unit === null) {
    throw new ScopeFrameException("Cannot defer a promise with no active unit frame; run the code inside runInFrame()");
  }
  if (unit.ended) {
    throw new ScopeFrameException(`Cannot defer a promise to the ${unit.frame.kind} frame after it has ended`);
  }
  const settled = Promise.resolve(promise);
  // Handled at registration, so a rejection is never unhandled; the drain still sees it.
  settled.then(noop, noop);
  (unit.defers as Promise<unknown>[]).push(settled);
}

/** The per-frame value `key`, initialised by `init()` lazily, once per owning frame. */
export function frameSlot<T>(key: FrameSlotKey, init: () => T): FrameSlot<T> {
  if (typeof key !== "string" && typeof key !== "symbol") {
    throw new TypeError("frameSlot(): key must be a string or a symbol");
  }
  if (typeof init !== "function") {
    throw new TypeError(`frameSlot(): ${String(key)} needs an init function`);
  }
  return Object.freeze({
    get(): T {
      const store = storage.getStore();
      if (store === undefined) {
        return init();
      }
      for (let frame: Store | null = store; frame !== null; frame = frame.parent) {
        if (frame.slots.has(key)) {
          return frame.slots.get(key) as T;
        }
      }
      const value = init();
      ownerOf(store, key)?.slots.set(key, value);
      return value;
    },
    set(value: T): void {
      const store = storage.getStore();
      if (store === undefined) {
        throw new ScopeFrameException(`Cannot write the frame slot ${String(key)} with no active Scope Frame; run the code inside runInFrame()`);
      }
      const owner = ownerOf(store, key);
      if (owner === null) {
        throw new ScopeFrameException(`Cannot write the frame slot ${String(key)} from the ${store.frame.kind} frame: it does not declare the slot and no unit frame encloses it`);
      }
      owner.slots.set(key, value);
    },
  });
}

function noop(): void {}

function checkRun(name: string, kind: unknown, fn: unknown): asserts kind is string {
  if (typeof kind !== "string" || kind === "") {
    throw new TypeError(`${name}(): kind must be a non-empty string`);
  }
  if (typeof fn !== "function") {
    throw new TypeError(`${name}(): the ${kind} frame needs a function`);
  }
}

/** The nearest unit frame from `store` up the chain (`store` itself included), or null. */
function nearestUnit(store: Store | null): Store | null {
  let frame = store;
  while (frame !== null && frame.type !== "unit") {
    frame = frame.parent;
  }
  return frame;
}

/** The frame a write of `key` from `store` goes to (Design Notes: owner frame), or null when none takes it. */
function ownerOf(store: Store, key: FrameSlotKey): Store | null {
  for (let frame: Store | null = store; frame !== null; frame = frame.parent) {
    if (frame.type === "narrow") {
      if (frame.declared?.has(key) === true) {
        return frame;
      }
      continue;
    }
    if (nearestUnit(frame.parent)?.frame.kind === "test" && !CHILD_OF_TEST_SLOTS.has(key)) {
      continue;
    }
    return frame;
  }
  return null;
}

function runUnit<T>(kind: string, parent: Store | null, fn: () => T): T {
  const store: Store = { frame: Object.freeze({ kind }), slots: new Map(), parent, type: "unit", declared: null, defers: [], ended: false };
  let result: T;
  try {
    result = storage.run(store, fn);
  } catch (error) {
    store.ended = true;
    throw error;
  }
  if (result instanceof Promise) {
    // A Promise body's unit ends after its defer list drains; the caller gets a Promise of the same value, not the
    // body's own Promise object (decisions/ESC-9.2-1.md, Maintainer, Option 1). Any other
    // value, a non-native thenable (AD-6.9) included, is returned unchanged and never has its `then` called.
    return drain(store, result) as T;
  }
  store.ended = true;
  const pending = (store.defers as Promise<unknown>[]).length;
  if (pending > 0) {
    throw new ScopeFrameException(`The ${kind} frame's body returned synchronously with ${pending} deferred promise(s) pending; return a promise from the body so the unit can drain its defer list`);
  }
  return result;
}

/**
 * Waits for the body, then every deferred promise in registration order (a deferred promise may defer more), then
 * ends the unit. Settles with the body's value; rejects with the body's error, else the first deferred rejection.
 * Not `async` and untagged: a private helper, not a public method, so AD-6.13's tags do not apply
 * (decisions/ESC-9.2-1.md).
 */
function drain(store: Store, result: Promise<unknown>): Promise<unknown> {
  const defers = store.defers as Promise<unknown>[];
  let failed = false;
  let failure: unknown = null;
  let value: unknown = null;
  const fail = (error: unknown): void => {
    if (!failed) {
      failed = true;
      failure = error;
    }
  };
  // The unit ends in the same callback that finds the list exhausted, so a later frameDefer throws.
  const next = (index: number): Promise<void> => {
    if (index < defers.length) {
      return (defers[index] as Promise<unknown>).then(noop, fail).then(() => next(index + 1));
    }
    store.ended = true;
    return Promise.resolve();
  };
  return result
    .then((settled) => {
      value = settled;
    }, fail)
    .then(() => next(0))
    .then(() => {
      if (failed) {
        throw failure;
      }
      return value;
    });
}

const SCOPE_RUN = Symbol.for("xaravel.scope.run");

function installGlobal(): void {
  if (process.env["XARAVEL_NO_SCOPE_GLOBAL"] === "1") {
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, SCOPE_RUN);
  if (descriptor === undefined) {
    Object.defineProperty(globalThis, SCOPE_RUN, { value: runInFrame, writable: false, configurable: false, enumerable: false });
  } else if (!("value" in descriptor) || descriptor.value !== runInFrame) {
    throw new ScopeFrameException("Symbol.for('xaravel.scope.run') was already defined by other code or another copy of @xaravel/runtime; @xaravel/runtime will not install over it");
  }
}

Object.freeze(runInFrame);
installGlobal();
