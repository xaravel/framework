// Illuminate\Contracts\Auth\MustVerifyEmail, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const MustVerifyEmailBrand: unique symbol;

export interface MustVerifyEmail {
  readonly [MustVerifyEmail.brand]: true;

  /** Determine if the user has verified their email address. */
  hasVerifiedEmail(): boolean;

  /**
   * Mark the given user's email as verified.
   * Saves the model.
   * @asyncRoot Database\ConnectionInterface.update
   */
  markEmailAsVerified(): Promise<boolean>;

  /**
   * Mark the given user's email as unverified.
   * Saves the model.
   * @asyncRoot Database\ConnectionInterface.update
   */
  markEmailAsUnverified(): Promise<boolean>;

  /**
   * Send the email verification notification.
   * Sends a notification, whose channels DIV-1 lets be async (Upstream's `notify()`).
   * @asyncRoot callback
   */
  sendEmailVerificationNotification(): Promise<void>;

  /** Get the email address that should be used for verification. */
  getEmailForVerification(): string;
}

export const MustVerifyEmail = contract<MustVerifyEmail, typeof MustVerifyEmailBrand>(
  "Illuminate\\Contracts\\Auth\\MustVerifyEmail",
  {
    getEmailForVerification: [],
    hasVerifiedEmail: [],
    markEmailAsUnverified: [],
    markEmailAsVerified: [],
    sendEmailVerificationNotification: [],
  },
);
