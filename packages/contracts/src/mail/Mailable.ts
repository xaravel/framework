// Illuminate\Contracts\Mail\Mailable, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { DateInterval } from "../psr/SimpleCache/DateInterval";
import type { DateTimeInterface } from "../structural/DateTimeInterface";
import type { Factory as MailFactory } from "./Factory";
import type { Mailer } from "./Mailer";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { Factory as QueueFactory } from "../queue/Factory";
import type { SentMessage } from "../structural/SentMessage";

declare const MailableBrand: unique symbol;

export interface Mailable {
  readonly [Mailable.brand]: true;

  /**
   * Send the message using the given mailer.
   * @asyncRoot Symfony\Component\Mailer\Transport\TransportInterface.send
   */
  send(mailer: MailFactory | Mailer): Promise<SentMessage | null>;

  /**
   * Queue the given message.
   * @asyncRoot Queue\Queue.pushOn
   */
  queue(queue: QueueFactory): Promise<unknown>;

  /**
   * Deliver the queued message after (n) seconds.
   * @asyncRoot Queue\Queue.laterOn
   */
  later(delay: DateTimeInterface | DateInterval | number, queue: QueueFactory): Promise<unknown>;

  /** Set the recipients of the message. */
  cc(address: object | PhpArrayLike | string, name?: string | null): this;

  /** Set the recipients of the message. */
  bcc(address: object | PhpArrayLike | string, name?: string | null): this;

  /** Set the recipients of the message. */
  to(address: object | PhpArrayLike | string, name?: string | null): this;

  /** Set the locale of the message. */
  locale(locale: string): this;

  /** Set the name of the mailer that should be used to send the message. */
  mailer(mailer: string): this;
}

export const Mailable = contract<Mailable, typeof MailableBrand>(
  "Illuminate\\Contracts\\Mail\\Mailable",
  {
    bcc: ["address", "name"],
    cc: ["address", "name"],
    later: ["delay", "queue"],
    locale: ["locale"],
    mailer: ["mailer"],
    queue: ["queue"],
    send: ["mailer"],
    to: ["address", "name"],
  },
);
