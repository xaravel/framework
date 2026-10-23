// Illuminate\Contracts\Events\Dispatcher, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Closure } from "../structural/Closure";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const DispatcherBrand: unique symbol;

export interface Dispatcher {
  readonly [Dispatcher.brand]: true;

  /** Register an event listener with the dispatcher. */
  listen(events: Closure | string | PhpArrayLike, listener?: Closure | string | PhpArrayLike | null): void;

  /** Determine if a given event has listeners. */
  hasListeners(eventName: string): boolean;

  /** Register an event subscriber with the dispatcher. */
  subscribe(subscriber: object | string): void;

  /**
   * Dispatch an event until the first non-null response is returned.
   * Runs the event's listeners, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  until(event: string | object, payload?: unknown): Promise<unknown>;

  /**
   * Dispatch an event and call the listeners.
   * Runs the event's listeners, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  dispatch(event: string | object, payload?: unknown, halt?: boolean): Promise<PhpArrayLike | null>;
  dispatch(event: string | object, options?: { payload?: unknown; halt?: boolean }): Promise<PhpArrayLike | null>;

  /** Register an event and payload to be fired later. */
  push(event: string, payload?: PhpArrayLike): void;

  /**
   * Flush a set of pushed events.
   * Runs the pushed events' listeners, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  flush(event: string): Promise<void>;

  /** Remove a set of listeners from the dispatcher. */
  forget(event: string): void;

  /** Forget all of the queued listeners. */
  forgetPushed(): void;
}

export const Dispatcher = contract<Dispatcher, typeof DispatcherBrand>(
  "Illuminate\\Contracts\\Events\\Dispatcher",
  {
    dispatch: ["event", "payload", "halt"],
    flush: ["event"],
    forget: ["event"],
    forgetPushed: [],
    hasListeners: ["eventName"],
    listen: ["events", "listener"],
    push: ["event", "payload"],
    subscribe: ["subscriber"],
    until: ["event", "payload"],
  },
);
