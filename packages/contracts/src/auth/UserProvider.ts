// Illuminate\Contracts\Auth\UserProvider, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Authenticatable } from "./Authenticatable";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const UserProviderBrand: unique symbol;

export interface UserProvider {
  readonly [UserProvider.brand]: true;

  /**
   * Retrieve a user by their unique identifier.
   * @asyncRoot Database\ConnectionInterface.select
   */
  retrieveById(identifier: unknown): Promise<Authenticatable | null>;

  /**
   * Retrieve a user by their unique identifier and "remember me" token.
   * @asyncRoot Database\ConnectionInterface.select
   */
  retrieveByToken(identifier: unknown, token: string): Promise<Authenticatable | null>;

  /**
   * Update the "remember me" token for the given user in storage.
   * @asyncRoot Database\ConnectionInterface.update
   */
  updateRememberToken(user: Authenticatable, token: string): Promise<void>;

  /**
   * Retrieve a user by the given credentials.
   * @asyncRoot Database\ConnectionInterface.select
   */
  retrieveByCredentials(credentials: PhpArrayLike): Promise<Authenticatable | null>;

  /** Validate a user against the given credentials; a hash check, which reads no storage. */
  validateCredentials(user: Authenticatable, credentials: PhpArrayLike): boolean;

  /**
   * Rehash the user's password if required and supported.
   * @asyncRoot Database\ConnectionInterface.update
   */
  rehashPasswordIfRequired(user: Authenticatable, credentials: PhpArrayLike, force?: boolean): Promise<void>;
}

export const UserProvider = contract<UserProvider, typeof UserProviderBrand>(
  "Illuminate\\Contracts\\Auth\\UserProvider",
  {
    rehashPasswordIfRequired: ["user", "credentials", "force"],
    retrieveByCredentials: ["credentials"],
    retrieveById: ["identifier"],
    retrieveByToken: ["identifier", "token"],
    updateRememberToken: ["user", "token"],
    validateCredentials: ["user", "credentials"],
  },
);
