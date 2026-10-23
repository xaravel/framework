// Illuminate\Contracts\Cache\CanFlushLocks, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const CanFlushLocksBrand: unique symbol;

export interface CanFlushLocks {
  readonly [CanFlushLocks.brand]: true;

  /**
   * Flush all locks managed by the store.
   * @asyncRoot Cache\Store.flush
   */
  flushLocks(): Promise<boolean>;

  /** Determine if the lock store is separate from the cache store. */
  hasSeparateLockStore(): boolean;
}

export const CanFlushLocks = contract<CanFlushLocks, typeof CanFlushLocksBrand>(
  "Illuminate\\Contracts\\Cache\\CanFlushLocks",
  {
    flushLocks: [],
    hasSeparateLockStore: [],
  },
);
