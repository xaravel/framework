// Illuminate\Contracts\Auth\CanResetPassword, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const CanResetPasswordBrand: unique symbol;

export interface CanResetPassword {
  readonly [CanResetPassword.brand]: true;

  /** Get the e-mail address where password reset links are sent. */
  getEmailForPasswordReset(): string;

  /**
   * Send the password reset notification.
   * Sends a notification, whose channels DIV-1 lets be async (Upstream's `notify()`).
   * @asyncRoot callback
   */
  sendPasswordResetNotification(token: string): Promise<void>;
}

export const CanResetPassword = contract<CanResetPassword, typeof CanResetPasswordBrand>(
  "Illuminate\\Contracts\\Auth\\CanResetPassword",
  {
    getEmailForPasswordReset: [],
    sendPasswordResetNotification: ["token"],
  },
);
