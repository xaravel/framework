// Illuminate\Contracts\Queue\Monitor, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const MonitorBrand: unique symbol;

export interface Monitor {
  readonly [Monitor.brand]: true;

  /** Register a callback to be executed when a daemon queue is starting. */
  starting(callback: unknown): void;

  /** Register a callback to be executed on every iteration through the queue loop. */
  looping(callback: unknown): void;

  /** Register a callback to be executed when a job fails after the maximum number of retries. */
  failing(callback: unknown): void;

  /** Register a callback to be executed when a daemon queue is stopping. */
  stopping(callback: unknown): void;
}

export const Monitor = contract<Monitor, typeof MonitorBrand>(
  "Illuminate\\Contracts\\Queue\\Monitor",
  {
    failing: ["callback"],
    looping: ["callback"],
    starting: ["callback"],
    stopping: ["callback"],
  },
);
