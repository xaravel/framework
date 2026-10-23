// Illuminate\Contracts\Validation\ValidatorAwareRule, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { ValidationValidator } from "../structural/ValidationValidator";

declare const ValidatorAwareRuleBrand: unique symbol;

export interface ValidatorAwareRule {
  readonly [ValidatorAwareRule.brand]: true;

  /** Set the current validator. */
  setValidator(validator: ValidationValidator): this;
}

export const ValidatorAwareRule = contract<ValidatorAwareRule, typeof ValidatorAwareRuleBrand>(
  "Illuminate\\Contracts\\Validation\\ValidatorAwareRule",
  {
    setValidator: ["validator"],
  },
);
