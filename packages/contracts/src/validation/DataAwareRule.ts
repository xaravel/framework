// Illuminate\Contracts\Validation\DataAwareRule, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const DataAwareRuleBrand: unique symbol;

export interface DataAwareRule {
  readonly [DataAwareRule.brand]: true;

  /** Set the data under validation. */
  setData(data: PhpArrayLike): this;
}

export const DataAwareRule = contract<DataAwareRule, typeof DataAwareRuleBrand>(
  "Illuminate\\Contracts\\Validation\\DataAwareRule",
  {
    setData: ["data"],
  },
);
