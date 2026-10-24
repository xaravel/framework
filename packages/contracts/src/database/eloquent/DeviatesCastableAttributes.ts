// Illuminate\Contracts\Database\Eloquent\DeviatesCastableAttributes, from laravel/framework v13.37.0.
import { contract } from "../../Contract";
import type { Model } from "../../structural/Model";
import type { PhpArrayLike } from "../../structural/PhpArrayLike";

declare const DeviatesCastableAttributesBrand: unique symbol;

export interface DeviatesCastableAttributes {
  readonly [DeviatesCastableAttributes.brand]: true;

  /** Increment the attribute. */
  increment(model: Model, key: string, value: unknown, attributes: PhpArrayLike): unknown;

  /** Decrement the attribute. */
  decrement(model: Model, key: string, value: unknown, attributes: PhpArrayLike): unknown;
}

export const DeviatesCastableAttributes = contract<DeviatesCastableAttributes, typeof DeviatesCastableAttributesBrand>(
  "Illuminate\\Contracts\\Database\\Eloquent\\DeviatesCastableAttributes",
  {
    decrement: ["model", "key", "value", "attributes"],
    increment: ["model", "key", "value", "attributes"],
  },
);
