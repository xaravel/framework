// Illuminate\Contracts\Auth\SupportsBasicAuth, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { Response } from "../structural/Response";

declare const SupportsBasicAuthBrand: unique symbol;

export interface SupportsBasicAuth {
  readonly [SupportsBasicAuth.brand]: true;

  /**
   * Attempt to authenticate using HTTP Basic Auth.
   * Retrieves the user through the user provider's query.
   * @asyncRoot Database\ConnectionInterface.select
   */
  basic(field?: string, extraConditions?: PhpArrayLike): Promise<Response | null>;
  basic(options?: { field?: string; extraConditions?: PhpArrayLike }): Promise<Response | null>;

  /**
   * Perform a stateless HTTP Basic login attempt.
   * Retrieves the user through the user provider's query.
   * @asyncRoot Database\ConnectionInterface.select
   */
  onceBasic(field?: string, extraConditions?: PhpArrayLike): Promise<Response | null>;
  onceBasic(options?: { field?: string; extraConditions?: PhpArrayLike }): Promise<Response | null>;
}

export const SupportsBasicAuth = contract<SupportsBasicAuth, typeof SupportsBasicAuthBrand>(
  "Illuminate\\Contracts\\Auth\\SupportsBasicAuth",
  {
    basic: ["field", "extraConditions"],
    onceBasic: ["field", "extraConditions"],
  },
);
