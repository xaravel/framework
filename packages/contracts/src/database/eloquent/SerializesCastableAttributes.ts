// Illuminate\Contracts\Database\Eloquent\SerializesCastableAttributes, from laravel/framework v13.37.0.
import { contract } from "../../Contract";
import type { Model } from "../../structural/Model";
import type { PhpArrayLike } from "../../structural/PhpArrayLike";

declare const SerializesCastableAttributesBrand: unique symbol;

export interface SerializesCastableAttributes {
  readonly [SerializesCastableAttributes.brand]: true;

  /** Serialize the attribute when converting the model to an array. */
  serialize(model: Model, key: string, value: unknown, attributes: PhpArrayLike): unknown;
}

export const SerializesCastableAttributes = contract<SerializesCastableAttributes, typeof SerializesCastableAttributesBrand>(
  "Illuminate\\Contracts\\Database\\Eloquent\\SerializesCastableAttributes",
  {
    serialize: ["model", "key", "value", "attributes"],
  },
);
