// Illuminate\Redis\Connections\Connection, as a contract names it (AD-1.2): a subset of its public methods. It does
// not implement `Illuminate\Contracts\Redis\Connection`, though it declares the same three commands.
import type { Closure } from "./Closure";
import type { PhpArrayLike } from "./PhpArrayLike";

/** A Redis connection. */
export interface RedisConnection {
  /** Get the underlying Redis client. */
  client(): unknown;

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

  /** Determine if the connection is a cluster connection. */
  isCluster(): boolean;

  /** Get the connection name. */
  getName(): string | null;

  /** Set the connection's name. */
  setName(name: string): this;
}
