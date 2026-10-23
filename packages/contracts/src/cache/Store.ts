// Illuminate\Contracts\Cache\Store, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const StoreBrand: unique symbol;

export interface Store {
  readonly [Store.brand]: true;

  /**
   * Retrieve an item from the cache by key.
   * @asyncRoot Cache\Store.get
   */
  get(key: string): Promise<unknown>;

  /**
   * Retrieve multiple items from the cache by key.
   * Items not found in the cache will have a null value.
   * @asyncRoot Cache\Store.many
   */
  many(keys: PhpArrayLike): Promise<PhpArrayLike>;

  /**
   * Store an item in the cache for a given number of seconds.
   * @asyncRoot Cache\Store.put
   */
  put(key: string, value: unknown, seconds: number): Promise<boolean>;

  /**
   * Store multiple items in the cache for a given number of seconds.
   * @asyncRoot Cache\Store.putMany
   */
  putMany(values: PhpArrayLike, seconds: number): Promise<boolean>;

  /**
   * Increment the value of an item in the cache.
   * @asyncRoot Cache\Store.increment
   */
  increment(key: string, value?: unknown): Promise<number | boolean>;

  /**
   * Decrement the value of an item in the cache.
   * @asyncRoot Cache\Store.decrement
   */
  decrement(key: string, value?: unknown): Promise<number | boolean>;

  /**
   * Store an item in the cache indefinitely.
   * @asyncRoot Cache\Store.forever
   */
  forever(key: string, value: unknown): Promise<boolean>;

  /**
   * Set the expiration of a cached item.
   * @asyncRoot Cache\Store.touch
   */
  touch(key: string, seconds: number): Promise<boolean>;

  /**
   * Remove an item from the cache.
   * @asyncRoot Cache\Store.forget
   */
  forget(key: string): Promise<boolean>;

  /**
   * Remove all items from the cache.
   * @asyncRoot Cache\Store.flush
   */
  flush(): Promise<boolean>;

  /** Get the cache key prefix. */
  getPrefix(): string;
}

export const Store = contract<Store, typeof StoreBrand>(
  "Illuminate\\Contracts\\Cache\\Store",
  {
    decrement: ["key", "value"],
    flush: [],
    forever: ["key", "value"],
    forget: ["key"],
    get: ["key"],
    getPrefix: [],
    increment: ["key", "value"],
    many: ["keys"],
    put: ["key", "value", "seconds"],
    putMany: ["values", "seconds"],
    touch: ["key", "seconds"],
  },
);
