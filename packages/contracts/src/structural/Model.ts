// Illuminate\Database\Eloquent\Model, as a contract names it (AD-1.2): a subset of its public methods that read no
// storage, so the later `@xaravel/database` port satisfies it without contracts importing it.
import type { PhpArrayLike } from "./PhpArrayLike";

/** An Eloquent model. */
export interface Model {
  /** Get the value of the model's primary key. */
  getKey(): unknown;

  /** Get the primary key for the model. */
  getKeyName(): string;

  /** Get the table associated with the model. */
  getTable(): string;

  /** Get the current connection name for the model. */
  getConnectionName(): string | null;

  /** Get an attribute from the model. */
  getAttribute(key: string): unknown;

  /** Set a given attribute on the model. */
  setAttribute(key: string, value: unknown): unknown;

  /** Get all of the current attributes on the model. */
  getAttributes(): PhpArrayLike;

  /** Convert the model instance to an array. */
  toArray(): PhpArrayLike;
}
