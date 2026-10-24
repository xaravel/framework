// Illuminate\Contracts\Mail\Mailer, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Closure } from "../structural/Closure";
import type { Mailable } from "./Mailable";
import type { PendingMail } from "../structural/PendingMail";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { SentMessage } from "../structural/SentMessage";

declare const MailerBrand: unique symbol;

export interface Mailer {
  readonly [Mailer.brand]: true;

  /** Begin the process of mailing a mailable class instance. */
  to(users: unknown): PendingMail;

  /** Begin the process of mailing a mailable class instance. */
  cc(users: unknown): PendingMail;

  /** Begin the process of mailing a mailable class instance. */
  bcc(users: unknown): PendingMail;

  /**
   * Send a new message with only a raw text part.
   * @asyncRoot Symfony\Component\Mailer\Transport\TransportInterface.send
   */
  raw(text: string, callback: unknown): Promise<SentMessage | null>;

  /**
   * Send a new message using a view.
   * @asyncRoot Symfony\Component\Mailer\Transport\TransportInterface.send
   */
  send(view: Mailable | PhpArrayLike | string, data?: PhpArrayLike, callback?: Closure | string | null): Promise<SentMessage | null>;
  send(view: Mailable | PhpArrayLike | string, options?: { data?: PhpArrayLike; callback?: Closure | string | null }): Promise<SentMessage | null>;

  /**
   * Send a new message synchronously using a view.
   * @asyncRoot Symfony\Component\Mailer\Transport\TransportInterface.send
   */
  sendNow(mailable: Mailable | PhpArrayLike | string, data?: PhpArrayLike, callback?: Closure | string | null): Promise<SentMessage | null>;
  sendNow(mailable: Mailable | PhpArrayLike | string, options?: { data?: PhpArrayLike; callback?: Closure | string | null }): Promise<SentMessage | null>;
}

export const Mailer = contract<Mailer, typeof MailerBrand>(
  "Illuminate\\Contracts\\Mail\\Mailer",
  {
    bcc: ["users"],
    cc: ["users"],
    raw: ["text", "callback"],
    send: ["view", "data", "callback"],
    sendNow: ["mailable", "data", "callback"],
    to: ["users"],
  },
);
