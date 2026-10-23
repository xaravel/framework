// Psr\SimpleCache\CacheInterface, from psr/simple-cache 3.0.0 (ESC-10.1-4). `iterable` maps to an `Iterable` or either
// PHP array form, and a `DateInterval` `$ttl` to the structural `DateInterval` (AD-1.2, AD-9).
import type { PhpArray } from "@xaravel/runtime/php";
import { contract } from "../../Contract";
import type { DateInterval } from "./DateInterval";

declare const CacheInterfaceBrand: unique symbol;

type PhpIterable = Iterable<unknown> | Readonly<Record<string, unknown>> | PhpArray;

/** Interface for the simple cache. */
export interface CacheInterface {
  readonly [CacheInterface.brand]: true;

  /**
   * Fetches a value from the cache. Upstream's `$default` is `defaultValue`, `default` being a reserved word.
   * @asyncRoot Cache\Store.get
   */
  get(key: string, defaultValue?: unknown): Promise<unknown>;

  /**
   * Persists data in the cache, uniquely referenced by a key with an optional expiration TTL time.
   * @asyncRoot Cache\Store.put
   */
  set(key: string, value: unknown, ttl?: DateInterval | number | null): Promise<boolean>;

  /**
   * Delete an item from the cache by its unique key.
   * @asyncRoot Cache\Store.forget
   */
  delete(key: string): Promise<boolean>;

  /**
   * Wipes clean the entire cache's keys.
   * @asyncRoot Cache\Store.flush
   */
  clear(): Promise<boolean>;

  /**
   * Obtains multiple cache items by their unique keys. Upstream's `$default` is `defaultValue`, `default` being a
   * reserved word.
   * @asyncRoot Cache\Store.many
   */
  getMultiple(keys: PhpIterable, defaultValue?: unknown): Promise<Iterable<unknown> | PhpArray>;

  /**
   * Persists a set of key => value pairs in the cache, with an optional TTL.
   * @asyncRoot Cache\Store.putMany
   */
  setMultiple(values: PhpIterable, ttl?: DateInterval | number | null): Promise<boolean>;

  /**
   * Deletes multiple cache items in a single operation.
   * @asyncRoot Cache\Store.forget
   */
  deleteMultiple(keys: PhpIterable): Promise<boolean>;

  /**
   * Determines whether an item is present in the cache.
   * @asyncRoot Cache\Store.get
   */
  has(key: string): Promise<boolean>;
}

export const CacheInterface = contract<CacheInterface, typeof CacheInterfaceBrand>("Psr\\SimpleCache\\CacheInterface", {
  clear: [],
  delete: ["key"],
  deleteMultiple: ["keys"],
  get: ["key", "default"],
  getMultiple: ["keys", "default"],
  has: ["key"],
  set: ["key", "value", "ttl"],
  setMultiple: ["values", "ttl"],
});
