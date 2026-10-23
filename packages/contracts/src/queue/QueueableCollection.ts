// Illuminate\Contracts\Queue\QueueableCollection, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const QueueableCollectionBrand: unique symbol;

export interface QueueableCollection {
  readonly [QueueableCollection.brand]: true;

  /** Get the type of the entities being queued. */
  getQueueableClass(): string | null;

  /** Get the identifiers for all of the entities. */
  getQueueableIds(): PhpArrayLike;

  /** Get the relationships of the entities being queued. */
  getQueueableRelations(): PhpArrayLike;

  /** Get the connection of the entities being queued. */
  getQueueableConnection(): string | null;
}

export const QueueableCollection = contract<QueueableCollection, typeof QueueableCollectionBrand>(
  "Illuminate\\Contracts\\Queue\\QueueableCollection",
  {
    getQueueableClass: [],
    getQueueableConnection: [],
    getQueueableIds: [],
    getQueueableRelations: [],
  },
);
