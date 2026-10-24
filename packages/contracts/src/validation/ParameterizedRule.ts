// Illuminate\Contracts\Validation\ParameterizedRule, from laravel/framework v13.37.0.
// PHP's built-in `Stringable` parent is no contract token: the interface extends the structural
// form from `src/structural/`, and the token records no parent for it; it lists `__toString` as a built-in
// (decisions/ESC-10.2-4.md), so a test double can configure it.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { Stringable } from "../structural/Stringable";

declare const ParameterizedRuleBrand: unique symbol;

export interface ParameterizedRule extends Stringable {
  readonly [ParameterizedRule.brand]: true;

  /** Get the rule name followed by its parameters. */
  toArray(): PhpArrayLike;
}

export const ParameterizedRule = contract<ParameterizedRule, typeof ParameterizedRuleBrand>(
  "Illuminate\\Contracts\\Validation\\ParameterizedRule",
  {
    toArray: [],
  },
  [],
  {},
  ["__toString"],
);
