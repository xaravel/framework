// Illuminate\Contracts\Validation\Rule, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const RuleBrand: unique symbol;

export interface Rule {
  readonly [Rule.brand]: true;

  /**
   * Determine if the validation rule passes.
   * Runs a validation rule object, which AD-6's Derivation makes async.
   * @asyncRoot callback
   */
  passes(attribute: string, value: unknown): Promise<boolean>;

  /** Get the validation error message. */
  message(): string | PhpArrayLike;
}

export const Rule = contract<Rule, typeof RuleBrand>(
  "Illuminate\\Contracts\\Validation\\Rule",
  {
    message: [],
    passes: ["attribute", "value"],
  },
);
