// Illuminate\Contracts\Bus\Dispatcher, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Collection } from "../structural/Collection";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const DispatcherBrand: unique symbol;

export interface Dispatcher {
  readonly [Dispatcher.brand]: true;

  /**
   * Dispatch a command to its appropriate handler.
   * Runs the command's handler (a job handler, which DIV-1 lets be async), or queues it.
   * @asyncRoot callback
   */
  dispatch(command: unknown): Promise<unknown>;

  /**
   * Dispatch a command to its appropriate handler in the current process.
   * Queueable jobs will be dispatched to the "sync" queue.
   * Runs the command's handler, a job handler, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  dispatchSync(command: unknown, handler?: unknown): Promise<unknown>;

  /**
   * Dispatch a command to its appropriate handler in the current process.
   * Runs the command's handler, a job handler, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  dispatchNow(command: unknown, handler?: unknown): Promise<unknown>;

  /** Dispatch a command to its appropriate handler after the current process. */
  dispatchAfterResponse(command: unknown, handler?: unknown): void;

  /** Create a new chain of queueable jobs. */
  chain(jobs?: Collection | PhpArrayLike | null): unknown;

  /** Determine if the given command has a handler. */
  hasCommandHandler(command: unknown): boolean;

  /** Retrieve the handler for a command. */
  getCommandHandler(command: unknown): unknown;

  /** Set the pipes commands should be piped through before dispatching. */
  pipeThrough(pipes: PhpArrayLike): this;

  /** Map a command to a handler. */
  map(map: PhpArrayLike): this;
}

export const Dispatcher = contract<Dispatcher, typeof DispatcherBrand>(
  "Illuminate\\Contracts\\Bus\\Dispatcher",
  {
    chain: ["jobs"],
    dispatch: ["command"],
    dispatchAfterResponse: ["command", "handler"],
    dispatchNow: ["command", "handler"],
    dispatchSync: ["command", "handler"],
    getCommandHandler: ["command"],
    hasCommandHandler: ["command"],
    map: ["map"],
    pipeThrough: ["pipes"],
  },
);
