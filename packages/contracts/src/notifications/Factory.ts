// Illuminate\Contracts\Notifications\Factory, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Collection } from "../structural/Collection";

declare const FactoryBrand: unique symbol;

export interface Factory {
  readonly [Factory.brand]: true;

  /** Get a channel instance by name. */
  channel(name?: string | null): unknown;

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
  sendNow(notifiables: Collection, notification: unknown): Promise<void>;
  sendNow(notifiables: unknown, notification: unknown): Promise<void>;
}

export const Factory = contract<Factory, typeof FactoryBrand>(
  "Illuminate\\Contracts\\Notifications\\Factory",
  {
    channel: ["name"],
    send: ["notifiables", "notification"],
    sendNow: ["notifiables", "notification"],
  },
);
