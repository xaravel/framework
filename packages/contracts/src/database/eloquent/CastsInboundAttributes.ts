// Illuminate\Contracts\Database\Eloquent\CastsInboundAttributes, from laravel/framework v13.37.0.
import { contract } from "../../Contract";
import type { Model } from "../../structural/Model";
import type { PhpArrayLike } from "../../structural/PhpArrayLike";

declare const CastsInboundAttributesBrand: unique symbol;

export interface CastsInboundAttributes {
  readonly [CastsInboundAttributes.brand]: true;

  /** Transform the attribute to its underlying model values. */
  set(model: Model, key: string, value: unknown, attributes: PhpArrayLike): unknown;
}

export const CastsInboundAttributes = contract<CastsInboundAttributes, typeof CastsInboundAttributesBrand>(
  "Illuminate\\Contracts\\Database\\Eloquent\\CastsInboundAttributes",
  {
    set: ["model", "key", "value", "attributes"],
  },
);
