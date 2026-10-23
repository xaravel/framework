// Illuminate\Contracts\Queue\QueueableEntity, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const QueueableEntityBrand: unique symbol;

export interface QueueableEntity {
  readonly [QueueableEntity.brand]: true;

  /** Get the queueable identity for the entity. */
  getQueueableId(): unknown;

  /** Get the relationships for the entity. */
  getQueueableRelations(): PhpArrayLike;

  /** Get the connection of the entity. */
  getQueueableConnection(): string | null;
}

export const QueueableEntity = contract<QueueableEntity, typeof QueueableEntityBrand>(
  "Illuminate\\Contracts\\Queue\\QueueableEntity",
  {
    getQueueableConnection: [],
    getQueueableId: [],
    getQueueableRelations: [],
  },
);
