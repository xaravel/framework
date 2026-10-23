// Illuminate\Contracts\Bus\QueueingDispatcher, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import { Dispatcher } from "./Dispatcher";
import type { Batch } from "../structural/Batch";
import type { Collection } from "../structural/Collection";
import type { PendingBatch } from "../structural/PendingBatch";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const QueueingDispatcherBrand: unique symbol;

export interface QueueingDispatcher extends Dispatcher {
  readonly [QueueingDispatcher.brand]: true;

  /**
   * Attempt to find the batch with the given ID.
   * @asyncRoot Database\ConnectionInterface.select
   */
  findBatch(batchId: string): Promise<Batch | null>;

  /** Create a new batch of queueable jobs. */
  batch(jobs: Collection | PhpArrayLike): PendingBatch;

  /**
   * Dispatch a command to its appropriate handler behind a queue.
   * @asyncRoot Queue\Queue.push
   */
  dispatchToQueue(command: unknown): Promise<unknown>;
}

export const QueueingDispatcher = contract<QueueingDispatcher, typeof QueueingDispatcherBrand>(
  "Illuminate\\Contracts\\Bus\\QueueingDispatcher",
  {
    batch: ["jobs"],
    dispatchToQueue: ["command"],
    findBatch: ["batchId"],
  },
  [Dispatcher],
);
