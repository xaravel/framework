// Illuminate\Contracts\Validation\ValidationRule, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PotentiallyTranslatedString } from "../structural/PotentiallyTranslatedString";

declare const ValidationRuleBrand: unique symbol;

export interface ValidationRule {
  readonly [ValidationRule.brand]: true;

  /**
   * Run the validation rule.
   * Runs a validation rule object, which AD-6's Derivation makes async.
   * @asyncRoot callback
   */
  validate(attribute: string, value: unknown, fail: (attribute: string, message?: string | null) => PotentiallyTranslatedString): Promise<void>;
}

export const ValidationRule = contract<ValidationRule, typeof ValidationRuleBrand>(
  "Illuminate\\Contracts\\Validation\\ValidationRule",
  {
    validate: ["attribute", "value", "fail"],
  },
);
