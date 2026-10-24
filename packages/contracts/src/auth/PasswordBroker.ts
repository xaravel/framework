// Illuminate\Contracts\Auth\PasswordBroker, from laravel/framework v13.37.0.
// Upstream's five constants are the token's frozen statics, so `PasswordBroker.RESET_LINK_SENT === 'passwords.sent'`
// as PHP's `PasswordBroker::RESET_LINK_SENT` is (decisions/ESC-10.2-1.md).
import { contract } from "../Contract";
import type { Closure } from "../structural/Closure";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const PasswordBrokerBrand: unique symbol;

export interface PasswordBroker {
  readonly [PasswordBroker.brand]: true;

  /**
   * Send a password reset link to a user.
   * Retrieves the user through the user provider's query.
   * @asyncRoot Database\ConnectionInterface.select
   */
  sendResetLink(credentials: PhpArrayLike, callback?: Closure | null): Promise<string>;

  /**
   * Reset the password for the given token.
   * Retrieves the user through the user provider's query.
   * @asyncRoot Database\ConnectionInterface.select
   */
  reset(credentials: PhpArrayLike, callback: Closure): Promise<unknown>;
}

/** Upstream's interface constants, the token's statics (ESC-10.2-1). */
type PasswordBrokerStatics = {
  readonly RESET_LINK_SENT: "passwords.sent";
  readonly PASSWORD_RESET: "passwords.reset";
  readonly INVALID_USER: "passwords.user";
  readonly INVALID_TOKEN: "passwords.token";
  readonly RESET_THROTTLED: "passwords.throttled";
};

export const PasswordBroker = contract<PasswordBroker, typeof PasswordBrokerBrand, PasswordBrokerStatics>(
  "Illuminate\\Contracts\\Auth\\PasswordBroker",
  {
    reset: ["credentials", "callback"],
    sendResetLink: ["credentials", "callback"],
  },
  [],
  {
    RESET_LINK_SENT: "passwords.sent",
    PASSWORD_RESET: "passwords.reset",
    INVALID_USER: "passwords.user",
    INVALID_TOKEN: "passwords.token",
    RESET_THROTTLED: "passwords.throttled",
  },
);
