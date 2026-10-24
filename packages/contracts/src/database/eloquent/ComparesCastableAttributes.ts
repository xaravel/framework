// Illuminate\Contracts\Database\Eloquent\ComparesCastableAttributes, from laravel/framework v13.37.0.
import { contract } from "../../Contract";
import type { Model } from "../../structural/Model";

declare const ComparesCastableAttributesBrand: unique symbol;

export interface ComparesCastableAttributes {
  readonly [ComparesCastableAttributes.brand]: true;

  /** Determine if the given values are equal. */
  compare(model: Model, key: string, firstValue: unknown, secondValue: unknown): boolean;
}

export const ComparesCastableAttributes = contract<ComparesCastableAttributes, typeof ComparesCastableAttributesBrand>(
  "Illuminate\\Contracts\\Database\\Eloquent\\ComparesCastableAttributes",
  {
    compare: ["model", "key", "firstValue", "secondValue"],
  },
);
