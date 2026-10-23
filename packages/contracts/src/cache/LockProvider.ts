// Illuminate\Contracts\Cache\LockProvider, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Lock } from "./Lock";

declare const LockProviderBrand: unique symbol;

export interface LockProvider {
  readonly [LockProvider.brand]: true;

  /** Get a lock instance. */
  lock(name: string, seconds?: number, owner?: string | null): Lock;
  lock(name: string, options?: { seconds?: number; owner?: string | null }): Lock;

  /** Restore a lock instance using the owner identifier. */
  restoreLock(name: string, owner: string): Lock;
}

export const LockProvider = contract<LockProvider, typeof LockProviderBrand>(
  "Illuminate\\Contracts\\Cache\\LockProvider",
  {
    lock: ["name", "seconds", "owner"],
    restoreLock: ["name", "owner"],
  },
);
