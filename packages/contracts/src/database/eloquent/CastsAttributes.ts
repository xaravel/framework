// Illuminate\Contracts\Database\Eloquent\CastsAttributes, from laravel/framework v13.37.0.
import { contract } from "../../Contract";
import type { Model } from "../../structural/Model";
import type { PhpArrayLike } from "../../structural/PhpArrayLike";

declare const CastsAttributesBrand: unique symbol;

export interface CastsAttributes {
  readonly [CastsAttributes.brand]: true;

  /** Transform the attribute from the underlying model values. */
  get(model: Model, key: string, value: unknown, attributes: PhpArrayLike): unknown;

  /** Transform the attribute to its underlying model values. */
  set(model: Model, key: string, value: unknown, attributes: PhpArrayLike): unknown;
}

export const CastsAttributes = contract<CastsAttributes, typeof CastsAttributesBrand>(
  "Illuminate\\Contracts\\Database\\Eloquent\\CastsAttributes",
  {
    get: ["model", "key", "value", "attributes"],
    set: ["model", "key", "value", "attributes"],
  },
);
