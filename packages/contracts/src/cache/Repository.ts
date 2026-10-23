// Illuminate\Contracts\Cache\Repository, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import { CacheInterface } from "../psr/SimpleCache/CacheInterface";
import type { Closure } from "../structural/Closure";
import type { DateInterval } from "../psr/SimpleCache/DateInterval";
import type { DateTimeInterface } from "../structural/DateTimeInterface";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { Store } from "./Store";
import type { UnitEnum } from "../structural/UnitEnum";

declare const RepositoryBrand: unique symbol;

export interface Repository extends CacheInterface {
  readonly [Repository.brand]: true;

  /**
   * Retrieve an item from the cache and delete it.
   * Upstream's `@template TCacheValue` types the value by the default's type.
   * Upstream's `$default` is `defaultValue`, `default` being a reserved word.
   * @asyncRoot Cache\Store.get
   */
  pull<T>(key: UnitEnum | string | PhpArrayLike, defaultValue: T | (() => T)): Promise<T>;
  pull(key: UnitEnum | string | PhpArrayLike, defaultValue?: unknown): Promise<unknown>;

  /**
   * Store an item in the cache.
   * @asyncRoot Cache\Store.put
   */
  put(key: UnitEnum | string, value: unknown, ttl?: DateTimeInterface | DateInterval | number | null): Promise<boolean>;

  /**
   * Store an item in the cache if the key does not exist.
   * @asyncRoot Cache\Store.put
   */
  add(key: UnitEnum | string, value: unknown, ttl?: DateTimeInterface | DateInterval | number | null): Promise<boolean>;

  /**
   * Increment the value of an item in the cache.
   * @asyncRoot Cache\Store.increment
   */
  increment(key: UnitEnum | string, value?: unknown): Promise<number | boolean>;

  /**
   * Decrement the value of an item in the cache.
   * @asyncRoot Cache\Store.decrement
   */
  decrement(key: UnitEnum | string, value?: unknown): Promise<number | boolean>;

  /**
   * Store an item in the cache indefinitely.
   * @asyncRoot Cache\Store.forever
   */
  forever(key: UnitEnum | string, value: unknown): Promise<boolean>;

  /**
   * Get an item from the cache, or execute the given Closure and store the result.
   * Runs a `Cache.remember*` callback, which DIV-1 lets be async; Upstream's `@template TCacheValue` types the value by the callback's.
   * @asyncRoot callback
   */
  remember<T>(key: UnitEnum | string, ttl: DateTimeInterface | DateInterval | Closure | number | null, callback: () => T | Promise<T>): Promise<T>;
  remember(key: UnitEnum | string, ttl: DateTimeInterface | DateInterval | Closure | number | null, callback: Closure): Promise<unknown>;

  /**
   * Get an item from the cache, or execute the given Closure and store the result forever.
   * Runs a `Cache.remember*` callback, which DIV-1 lets be async; Upstream's `@template TCacheValue` types the value by the callback's.
   * @asyncRoot callback
   */
  sear<T>(key: UnitEnum | string, callback: () => T | Promise<T>): Promise<T>;
  sear(key: UnitEnum | string, callback: Closure): Promise<unknown>;

  /**
   * Get an item from the cache, or execute the given Closure and store the result forever.
   * Runs a `Cache.remember*` callback, which DIV-1 lets be async; Upstream's `@template TCacheValue` types the value by the callback's.
   * @asyncRoot callback
   */
  rememberForever<T>(key: UnitEnum | string, callback: () => T | Promise<T>): Promise<T>;
  rememberForever(key: UnitEnum | string, callback: Closure): Promise<unknown>;

  /**
   * Set the expiration of a cached item.
   * @asyncRoot Cache\Store.touch
   */
  touch(key: UnitEnum | string, ttl: DateTimeInterface | DateInterval | number): Promise<boolean>;

  /**
   * Remove an item from the cache.
   * @asyncRoot Cache\Store.forget
   */
  forget(key: UnitEnum | string): Promise<boolean>;

  /** Get the cache store implementation. */
  getStore(): Store;
}

export const Repository = contract<Repository, typeof RepositoryBrand>(
  "Illuminate\\Contracts\\Cache\\Repository",
  {
    add: ["key", "value", "ttl"],
    decrement: ["key", "value"],
    forever: ["key", "value"],
    forget: ["key"],
    getStore: [],
    increment: ["key", "value"],
    pull: ["key", "default"],
    put: ["key", "value", "ttl"],
    remember: ["key", "ttl", "callback"],
    rememberForever: ["key", "callback"],
    sear: ["key", "callback"],
    touch: ["key", "ttl"],
  },
  [CacheInterface],
);
