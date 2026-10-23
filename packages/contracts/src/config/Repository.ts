// Illuminate\Contracts\Config\Repository, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const RepositoryBrand: unique symbol;

export interface Repository {
  readonly [Repository.brand]: true;

  /** Determine if the given configuration value exists. */
  has(key: string): boolean;

  /**
   * Get the specified configuration value.
   * Upstream's `$default` is `defaultValue`, `default` being a reserved word.
   */
  get(key: PhpArrayLike | string, defaultValue?: unknown): unknown;

  /** Get all of the configuration items for the application. */
  all(): PhpArrayLike;

  /** Set a given configuration value. */
  set(key: PhpArrayLike | string, value?: unknown): void;

  /** Prepend a value onto an array configuration value. */
  prepend(key: string, value: unknown): void;

  /** Push a value onto an array configuration value. */
  push(key: string, value: unknown): void;
}

export const Repository = contract<Repository, typeof RepositoryBrand>(
  "Illuminate\\Contracts\\Config\\Repository",
  {
    all: [],
    get: ["key", "default"],
    has: ["key"],
    prepend: ["key", "value"],
    push: ["key", "value"],
    set: ["key", "value"],
  },
);
