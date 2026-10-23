// Illuminate\Contracts\Queue\ClearableQueue, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const ClearableQueueBrand: unique symbol;

export interface ClearableQueue {
  readonly [ClearableQueue.brand]: true;

  /**
   * Delete all of the jobs from the queue.
   * @asyncRoot Redis\Connection.command
   */
  clear(queue: string): Promise<number>;
}

export const ClearableQueue = contract<ClearableQueue, typeof ClearableQueueBrand>(
  "Illuminate\\Contracts\\Queue\\ClearableQueue",
  {
    clear: ["queue"],
  },
);
