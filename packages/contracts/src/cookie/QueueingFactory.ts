// Illuminate\Contracts\Cookie\QueueingFactory, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import { Factory as CookieFactory } from "./Factory";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const QueueingFactoryBrand: unique symbol;

export interface QueueingFactory extends CookieFactory {
  readonly [QueueingFactory.brand]: true;

  /** Queue a cookie to send with the next response. */
  queue(...parameters: unknown[]): void;

  /** Remove a cookie from the queue. */
  unqueue(name: string, path?: string | null): void;

  /** Get the cookies which have been queued for the next request. */
  getQueuedCookies(): PhpArrayLike;
}

export const QueueingFactory = contract<QueueingFactory, typeof QueueingFactoryBrand>(
  "Illuminate\\Contracts\\Cookie\\QueueingFactory",
  {
    getQueuedCookies: [],
    queue: ["parameters"],
    unqueue: ["name", "path"],
  },
  [CookieFactory],
);
