// Illuminate\Contracts\Notifications\Dispatcher, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Collection } from "../structural/Collection";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const DispatcherBrand: unique symbol;

export interface Dispatcher {
  readonly [Dispatcher.brand]: true;

  /**
   * Send the given notification to the given notifiable entities: a collection of them, or one.
   * Runs the notification's channels, or queues it, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  send(notifiables: Collection, notification: unknown): Promise<void>;
  send(notifiables: unknown, notification: unknown): Promise<void>;

  /**
   * Send the given notification immediately to a collection of notifiable entities, or one.
   * Runs the notification's channels, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  sendNow(notifiables: Collection, notification: unknown, channels?: PhpArrayLike | null): Promise<void>;
  sendNow(notifiables: unknown, notification: unknown, channels?: PhpArrayLike | null): Promise<void>;
}

export const Dispatcher = contract<Dispatcher, typeof DispatcherBrand>(
  "Illuminate\\Contracts\\Notifications\\Dispatcher",
  {
    send: ["notifiables", "notification"],
    sendNow: ["notifiables", "notification", "channels"],
  },
);
