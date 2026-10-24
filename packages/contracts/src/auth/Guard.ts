// Illuminate\Contracts\Auth\Guard, from laravel/framework v13.37.0.
// The user is loaded once per request (AD-6, loaded-once), so `check`, `guest`, `user`, `id` and `hasUser` stay
// sync: an implementation resolves the user before they are read.
import { contract } from "../Contract";
import type { Authenticatable } from "./Authenticatable";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const GuardBrand: unique symbol;

export interface Guard {
  readonly [Guard.brand]: true;

  /** Determine if the current user is authenticated. */
  check(): boolean;

  /** Determine if the current user is a guest. */
  guest(): boolean;

  /** Get the currently authenticated user. */
  user(): Authenticatable | null;

  /** Get the ID for the currently authenticated user. */
  id(): number | string | null;

  /**
   * Validate a user's credentials.
   * Retrieves the user through the user provider's query.
   * @asyncRoot Database\ConnectionInterface.select
   */
  validate(credentials?: PhpArrayLike): Promise<boolean>;

  /** Determine if the guard has a user instance. */
  hasUser(): boolean;

  /**
   * Set the current user.
   * Fires the `Authenticated` event (Upstream's SessionGuard), whose listeners DIV-1 lets be async.
   * @asyncRoot callback
   */
  setUser(user: Authenticatable): Promise<this>;
}

export const Guard = contract<Guard, typeof GuardBrand>(
  "Illuminate\\Contracts\\Auth\\Guard",
  {
    check: [],
    guest: [],
    hasUser: [],
    id: [],
    setUser: ["user"],
    user: [],
    validate: ["credentials"],
  },
);
