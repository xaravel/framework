// Illuminate\Contracts\Cache\Lock, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Closure } from "../structural/Closure";

declare const LockBrand: unique symbol;

export interface Lock {
  readonly [Lock.brand]: true;

  /**
   * Attempt to acquire the lock.
   * @asyncRoot Cache\Store.put
   */
  get(callback?: Closure | null): Promise<unknown>;

  /**
   * Attempt to acquire the lock for the given number of seconds.
   * @asyncRoot Cache\Store.put
   */
  block(seconds: number, callback?: Closure | null): Promise<unknown>;

  /**
   * Release the lock.
   * @asyncRoot Cache\Store.forget
   */
  release(): Promise<boolean>;

  /** Returns the current owner of the lock. */
  owner(): string;

  /**
   * Releases this lock in disregard of ownership.
   * @asyncRoot Cache\Store.forget
   */
  forceRelease(): Promise<void>;
}

export const Lock = contract<Lock, typeof LockBrand>(
  "Illuminate\\Contracts\\Cache\\Lock",
  {
    block: ["seconds", "callback"],
    forceRelease: [],
    get: ["callback"],
    owner: [],
    release: [],
  },
);
