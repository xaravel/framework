// Illuminate\Contracts\Database\Eloquent\SupportsPartialRelations, from laravel/framework v13.37.0.
// Upstream's `\Illuminate\Database\Eloquent\Builder` is the `Database\Eloquent\Builder` contract (AD-1.2).
import { contract } from "../../Contract";
import type { Closure } from "../../structural/Closure";
import type { Builder as EloquentBuilder } from "./Builder";

declare const SupportsPartialRelationsBrand: unique symbol;

export interface SupportsPartialRelations {
  readonly [SupportsPartialRelations.brand]: true;

  /** Indicate that the relation is a single result of a larger one-to-many relationship. */
  ofMany(column?: string | null, aggregate?: string | Closure | null, relation?: string | null): this;
  ofMany(options?: { column?: string | null; aggregate?: string | Closure | null; relation?: string | null }): this;

  /** Determine whether the relationship is a one-of-many relationship. */
  isOneOfMany(): boolean;

  /** Get the one of many inner join subselect query builder instance; null where Upstream returns nothing. */
  getOneOfManySubQuery(): EloquentBuilder | null;
}

export const SupportsPartialRelations = contract<SupportsPartialRelations, typeof SupportsPartialRelationsBrand>(
  "Illuminate\\Contracts\\Database\\Eloquent\\SupportsPartialRelations",
  {
    getOneOfManySubQuery: [],
    isOneOfMany: [],
    ofMany: ["column", "aggregate", "relation"],
  },
);
