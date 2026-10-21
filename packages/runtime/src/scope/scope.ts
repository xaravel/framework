// The Scope Frame primitive (AD-5, NFR-4): the only framework `AsyncLocalStorage`.
//
// `runInFrame(kind, fn)` runs `fn` in a fresh frame; `currentFrame()` is the active frame or null; `frameSlot(key,
// init)` is a per-frame value, initialised lazily once per frame. Writing a slot with no active frame throws
// `ScopeFrameException`; reading one returns `init()` without storing it.
//
// On load this module installs `globalThis[Symbol.for('xaravel.scope.run')]`, which is `runInFrame` itself, so the
// grader opens a test frame without importing the runtime (ESC-4.2-1 item 2). The property is non-writable,
// non-configurable and non-enumerable (item 4). `XARAVEL_NO_SCOPE_GLOBAL=1`, read once at load, skips the install.
// A property already there with another value throws: a second copy of this module would mean a second store.
//
// Frame kinds beyond the bare `kind` label, narrow and child frames, the defer list and stream/timer wrapping are
// Story 9.2's; overlays and `frameStatic` are Story 9.3's.
import { AsyncLocalStorage } from "node:async_hooks";
import { ScopeFrameException } from "./ScopeFrameException";

/** An active Scope Frame. */
export interface Frame {
  /** The frame's kind, as passed to `runInFrame` (`test`, `unit`, …). */
  readonly kind: string;
}

/** A per-frame value: `frameSlot(key, init)`. */
export interface FrameSlot<T> {
  /** The value in the active frame, initialised with `init()` on first read; `init()` (unstored) outside a frame. */
  get(): T;
  /** Sets the value in the active frame; throws `ScopeFrameException` outside a frame. */
  set(value: T): void;
}

/** A slot key: slots with the same key share storage in a frame. */
export type FrameSlotKey = string | symbol;

interface Store {
  readonly frame: Frame;
  readonly slots: Map<FrameSlotKey, unknown>;
}

const storage = new AsyncLocalStorage<Store>();

/** The active Scope Frame, or null outside any frame. */
export function currentFrame(): Frame | null {
  return storage.getStore()?.frame ?? null;
}

/** Runs `fn` in a fresh frame of `kind` and returns its result unchanged (a Promise stays a Promise, AD-6). */
export function runInFrame<T>(kind: string, fn: () => T): T {
  if (typeof kind !== "string" || kind === "") {
    throw new TypeError("runInFrame(): kind must be a non-empty string");
  }
  if (typeof fn !== "function") {
    throw new TypeError(`runInFrame(): the ${kind} frame needs a function`);
  }
  const store: Store = { frame: Object.freeze({ kind }), slots: new Map() };
  return storage.run(store, fn);
}

/** The per-frame value `key`, initialised by `init()` lazily, once per frame. */
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
      if (store.slots.has(key)) {
        return store.slots.get(key) as T;
      }
      const value = init();
      store.slots.set(key, value);
      return value;
    },
    set(value: T): void {
      const store = storage.getStore();
      if (store === undefined) {
        throw new ScopeFrameException(`Cannot write the frame slot ${String(key)} with no active Scope Frame; run the code inside runInFrame()`);
      }
      store.slots.set(key, value);
    },
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
