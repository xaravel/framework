// Illuminate\Contracts\Validation\InvokableRule, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PotentiallyTranslatedString } from "../structural/PotentiallyTranslatedString";

declare const InvokableRuleBrand: unique symbol;

export interface InvokableRule {
  readonly [InvokableRule.brand]: true;

  /**
   * Run the validation rule.
   * Runs a validation rule object, which AD-6's Derivation makes async.
   * @asyncRoot callback
   */
  __invoke(attribute: string, value: unknown, fail: (attribute: string, message?: string | null) => PotentiallyTranslatedString): Promise<void>;
}

export const InvokableRule = contract<InvokableRule, typeof InvokableRuleBrand>(
  "Illuminate\\Contracts\\Validation\\InvokableRule",
  {
    __invoke: ["attribute", "value", "fail"],
  },
);
