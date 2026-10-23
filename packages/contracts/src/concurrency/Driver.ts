// Illuminate\Contracts\Concurrency\Driver, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Closure } from "../structural/Closure";
import type { DateInterval } from "../psr/SimpleCache/DateInterval";
import type { DeferredCallback } from "../structural/DeferredCallback";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const DriverBrand: unique symbol;

export interface Driver {
  readonly [Driver.brand]: true;

  /**
   * Run the given tasks concurrently and return an array containing the results.
   * Runs the concurrency tasks, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  run(tasks: Closure | PhpArrayLike, timeout?: DateInterval | number | null): Promise<PhpArrayLike>;

  /** Defer the execution of the given tasks. */
  defer(tasks: Closure | PhpArrayLike): DeferredCallback;
}

export const Driver = contract<Driver, typeof DriverBrand>(
  "Illuminate\\Contracts\\Concurrency\\Driver",
  {
    defer: ["tasks"],
    run: ["tasks", "timeout"],
  },
);
