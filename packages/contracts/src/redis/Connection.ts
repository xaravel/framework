// Illuminate\Contracts\Redis\Connection, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Closure } from "../structural/Closure";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const ConnectionBrand: unique symbol;

export interface Connection {
  readonly [Connection.brand]: true;

  /**
   * Subscribe to a set of given channels for messages.
   * @asyncRoot Redis\Connection.subscribe
   */
  subscribe(channels: PhpArrayLike | string, callback: Closure): Promise<void>;

  /**
   * Subscribe to a set of given channels with wildcards.
   * @asyncRoot Redis\Connection.psubscribe
   */
  psubscribe(channels: PhpArrayLike | string, callback: Closure): Promise<void>;

  /**
   * Run a command against the Redis database.
   * @asyncRoot Redis\Connection.command
   */
  command(method: string, parameters?: PhpArrayLike): Promise<unknown>;
}

export const Connection = contract<Connection, typeof ConnectionBrand>(
  "Illuminate\\Contracts\\Redis\\Connection",
  {
    command: ["method", "parameters"],
    psubscribe: ["channels", "callback"],
    subscribe: ["channels", "callback"],
  },
);
