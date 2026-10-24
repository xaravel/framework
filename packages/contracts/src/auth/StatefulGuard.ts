// Illuminate\Contracts\Auth\StatefulGuard, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Authenticatable } from "./Authenticatable";
import { Guard } from "./Guard";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const StatefulGuardBrand: unique symbol;

export interface StatefulGuard extends Guard {
  readonly [StatefulGuard.brand]: true;

  /**
   * Attempt to authenticate a user using the given credentials.
   * Retrieves the user through the user provider's query.
   * @asyncRoot Database\ConnectionInterface.select
   */
  attempt(credentials?: PhpArrayLike, remember?: boolean): Promise<boolean>;
  attempt(options?: { credentials?: PhpArrayLike; remember?: boolean }): Promise<boolean>;

  /**
   * Log a user into the application without sessions or cookies.
   * Retrieves the user through the user provider's query.
   * @asyncRoot Database\ConnectionInterface.select
   */
  once(credentials?: PhpArrayLike): Promise<boolean>;

  /**
   * Log a user into the application.
   * Migrates the session (Upstream's `migrate(true)`), destroying the old one through the session handler.
   * @asyncRoot SessionHandlerInterface.destroy
   */
  login(user: Authenticatable, remember?: boolean): Promise<void>;

  /**
   * Log the given user ID into the application.
   * Retrieves the user through the user provider's query.
   * @asyncRoot Database\ConnectionInterface.select
   */
  loginUsingId(id: unknown, remember?: boolean): Promise<Authenticatable | false>;

  /**
   * Log the given user ID into the application without sessions or cookies.
   * Retrieves the user through the user provider's query.
   * @asyncRoot Database\ConnectionInterface.select
   */
  onceUsingId(id: unknown): Promise<Authenticatable | false>;

  /** Determine if the user was authenticated via "remember me" cookie. */
  viaRemember(): boolean;

  /**
   * Log the user out of the application.
   * Cycles the remember token through the user provider's update.
   * @asyncRoot Database\ConnectionInterface.update
   */
  logout(): Promise<void>;
}

export const StatefulGuard = contract<StatefulGuard, typeof StatefulGuardBrand>(
  "Illuminate\\Contracts\\Auth\\StatefulGuard",
  {
    attempt: ["credentials", "remember"],
    login: ["user", "remember"],
    loginUsingId: ["id", "remember"],
    logout: [],
    once: ["credentials"],
    onceUsingId: ["id"],
    viaRemember: [],
  },
  [Guard],
);
