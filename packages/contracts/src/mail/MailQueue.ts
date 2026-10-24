// Illuminate\Contracts\Mail\MailQueue, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { DateInterval } from "../psr/SimpleCache/DateInterval";
import type { DateTimeInterface } from "../structural/DateTimeInterface";
import type { Mailable } from "./Mailable";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const MailQueueBrand: unique symbol;

export interface MailQueue {
  readonly [MailQueue.brand]: true;

  /**
   * Queue a new e-mail message for sending.
   * @asyncRoot Queue\Queue.pushOn
   */
  queue(view: Mailable | PhpArrayLike | string, queue?: string | null): Promise<unknown>;

  /**
   * Queue a new e-mail message for sending after (n) seconds.
   * @asyncRoot Queue\Queue.laterOn
   */
  later(delay: DateTimeInterface | DateInterval | number, view: Mailable | PhpArrayLike | string, queue?: string | null): Promise<unknown>;
}

export const MailQueue = contract<MailQueue, typeof MailQueueBrand>(
  "Illuminate\\Contracts\\Mail\\MailQueue",
  {
    later: ["delay", "view", "queue"],
    queue: ["view", "queue"],
  },
);
